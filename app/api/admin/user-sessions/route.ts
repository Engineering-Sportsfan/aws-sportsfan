import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { ScanCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get("date"); // "2026-09-04" or "all" or undefined
    const actionFilter = searchParams.get("action"); // "login" | "logout" | "signup" | "all"
    const userFilter = searchParams.get("userId") || searchParams.get("email");
    const searchQuery = (searchParams.get("search") || "").toLowerCase().trim();

    const today = getTodayDateString();

    let rawSessions: any[] = [];

    // 1. Fetch from DynamoDB IdentityAndAccess
    try {
      if (dateParam && dateParam !== "all") {
        // Query specific date partition: entityId = USER_ACTIVITY#${dateParam}
        const queryRes: any = await docClient.send(
          new QueryCommand({
            TableName: TABLES.IdentityAndAccess,
            KeyConditionExpression: "entityId = :eId",
            ExpressionAttributeValues: {
              ":eId": `USER_ACTIVITY#${dateParam}`,
            },
          })
        );
        if (queryRes.Items) rawSessions.push(...queryRes.Items);
      } else {
        // Scan across all USER_ACTIVITY dates
        let lastEvaluatedKey: Record<string, any> | undefined = undefined;
        do {
          const scanRes: any = await docClient.send(
            new ScanCommand({
              TableName: TABLES.IdentityAndAccess,
              FilterExpression: "begins_with(entityId, :prefix)",
              ExpressionAttributeValues: {
                ":prefix": "USER_ACTIVITY#",
              },
              ExclusiveStartKey: lastEvaluatedKey,
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            rawSessions.push(...scanRes.Items);
          }
          lastEvaluatedKey = scanRes.LastEvaluatedKey;
        } while (lastEvaluatedKey);
      }
    } catch (err: any) {
      console.warn("DynamoDB user_sessions scan notice:", err?.message || err);
    }

    // 2. Fetch / merge from Firestore 'user_sessions'
    try {
      let fsQuery: FirebaseFirestore.Query = db.collection(getFirestoreCollection("user_sessions"));
      if (dateParam && dateParam !== "all") {
        fsQuery = fsQuery.where("date", "==", dateParam);
      }
      const snap = await fsQuery.orderBy("timestamp", "desc").limit(500).get();
      const fsSessions = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Merge unique by activityId or (email + timestamp + action)
      const existingKeys = new Set(
        rawSessions.map((s: any) => s.activityId || `${s.email}_${s.timestamp}_${s.action}`)
      );

      for (const fsItem of fsSessions as any[]) {
        const key = fsItem.activityId || `${fsItem.email}_${fsItem.timestamp}_${fsItem.action}`;
        if (!existingKeys.has(key)) {
          rawSessions.push(fsItem);
          existingKeys.add(key);
        }
      }
    } catch (fbErr: any) {
      console.warn("Firestore user_sessions fallback notice:", fbErr?.message || fbErr);
    }

    // 3. Normalize Session Objects
    const allSessions = rawSessions.map((item: any) => {
      const timestamp = item.timestamp || item.createdAt || Date.now();
      const date = item.date || new Date(timestamp).toISOString().split("T")[0];
      const time =
        item.time ||
        new Date(timestamp).toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });

      return {
        activityId: item.activityId || `ACT_${timestamp}_${Math.random().toString(36).substring(2, 6)}`,
        entityId: item.entityId || `USER_ACTIVITY#${date}`,
        sk: item.sk || `SESSION#${timestamp}#${(item.action || "login").toUpperCase()}`,
        userId: item.userId || (item.email ? item.email.replace(/[^a-zA-Z0-9]/g, "_") : "unknown"),
        email: (item.email || "unknown").toLowerCase(),
        userName: item.userName || (item.email ? item.email.split("@")[0] : "User"),
        action: (
          item.action ||
          (item.sk?.includes("LOGOUT") || item.type === "logout" ? "logout" : item.sk?.includes("SIGNUP") || item.type === "signup" ? "signup" : "login")
        ).toLowerCase() as "login" | "logout" | "signup",
        date,
        time,
        timestamp,
        ip: item.ip || "127.0.0.1",
        location: item.location || "Global / Direct IP",
        userAgent: item.userAgent || "unknown",
        device: item.device || "Unknown Device",
        metadata: item.metadata || {},
      };
    });

    // 4. Compute Comprehensive Stats & Available Dates
    const todaySessions = allSessions.filter(s => s.date === today);
    const todayLogins = todaySessions.filter(s => s.action === "login");
    const uniqueUsersToday = new Set(todayLogins.map(s => s.userId || s.email)).size;
    const todayLogouts = todaySessions.filter(s => s.action === "logout");

    // Group dates with counts
    const dateCountsMap = new Map<string, { date: string; logins: number; logouts: number; uniqueUsers: Set<string>; total: number }>();
    for (const s of allSessions) {
      let entry = dateCountsMap.get(s.date);
      if (!entry) {
        entry = { date: s.date, logins: 0, logouts: 0, uniqueUsers: new Set<string>(), total: 0 };
        dateCountsMap.set(s.date, entry);
      }
      entry.total += 1;
      if (s.action === "login") {
        entry.logins += 1;
        entry.uniqueUsers.add(s.userId || s.email);
      } else if (s.action === "logout") {
        entry.logouts += 1;
      }
    }

    const availableDates = Array.from(dateCountsMap.values())
      .map(d => ({
        date: d.date,
        total: d.total,
        logins: d.logins,
        logouts: d.logouts,
        uniqueUsers: d.uniqueUsers.size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // 5. Apply Filters
    let filtered = [...allSessions];

    // Filter by Date
    if (dateParam && dateParam !== "all") {
      filtered = filtered.filter(s => s.date === dateParam);
    }

    // Filter by Action
    if (actionFilter && actionFilter !== "all") {
      filtered = filtered.filter(s => s.action === actionFilter.toLowerCase());
    }

    // Filter by User
    if (userFilter) {
      const u = userFilter.toLowerCase();
      filtered = filtered.filter(s => s.userId.toLowerCase() === u || s.email.toLowerCase() === u);
    }

    // Filter by Search
    if (searchQuery) {
      filtered = filtered.filter(s =>
        s.email.includes(searchQuery) ||
        s.userId.toLowerCase().includes(searchQuery) ||
        s.userName.toLowerCase().includes(searchQuery) ||
        s.ip.toLowerCase().includes(searchQuery) ||
        s.location.toLowerCase().includes(searchQuery) ||
        s.device.toLowerCase().includes(searchQuery) ||
        s.date.includes(searchQuery)
      );
    }

    // Sort descending by timestamp
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json(
      {
        sessions: filtered,
        total: filtered.length,
        todayDate: today,
        availableDates,
        stats: {
          totalLoginsToday: todayLogins.length,
          uniqueUsersToday,
          totalLogoutsToday: todayLogouts.length,
          totalRecorded: allSessions.length,
          currentFilteredCount: filtered.length,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: unknown) {
    console.error("GET /api/admin/user-sessions error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch session logs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { activityId, entityId, sk, date, deleteAll } = await req.json();

    if (deleteAll) {
      // 1. Delete all USER_ACTIVITY records from DynamoDB
      const scanRes: any = await docClient.send(
        new ScanCommand({
          TableName: TABLES.IdentityAndAccess,
          FilterExpression: "begins_with(entityId, :prefix)",
          ExpressionAttributeValues: { ":prefix": "USER_ACTIVITY#" },
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) {
        await Promise.all(
          scanRes.Items.map((it: any) =>
            docClient.send(
              new DeleteCommand({
                TableName: TABLES.IdentityAndAccess,
                Key: { entityId: it.entityId, sk: it.sk },
              })
            )
          )
        );
      }

      // Clear from Firestore
      const snap = await db.collection(getFirestoreCollection("user_sessions")).get();
      await Promise.all(snap.docs.map(d => d.ref.delete()));

      return NextResponse.json({ success: true, message: "All user activity logs deleted" });
    }

    if (date) {
      // Delete all records for a specific date
      const queryRes: any = await docClient.send(
        new QueryCommand({
          TableName: TABLES.IdentityAndAccess,
          KeyConditionExpression: "entityId = :eId",
          ExpressionAttributeValues: {
            ":eId": `USER_ACTIVITY#${date}`,
          },
        })
      );
      if (queryRes.Items && queryRes.Items.length > 0) {
        await Promise.all(
          queryRes.Items.map((it: any) =>
            docClient.send(
              new DeleteCommand({
                TableName: TABLES.IdentityAndAccess,
                Key: { entityId: it.entityId, sk: it.sk },
              })
            )
          )
        );
      }

      const snap = await db.collection(getFirestoreCollection("user_sessions")).where("date", "==", date).get();
      await Promise.all(snap.docs.map(d => d.ref.delete()));

      return NextResponse.json({ success: true, message: `All logs for date ${date} deleted` });
    }

    if (entityId && sk) {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.IdentityAndAccess,
          Key: { entityId, sk },
        })
      );
    }

    if (activityId) {
      await db.collection(getFirestoreCollection("user_sessions")).doc(activityId).delete().catch(() => {});
    }

    return NextResponse.json({ success: true, message: "Session activity log deleted" });
  } catch (error: unknown) {
    console.error("DELETE /api/admin/user-sessions error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete session log";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
