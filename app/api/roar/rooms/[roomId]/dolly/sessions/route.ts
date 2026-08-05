// api/roar/rooms/[roomId]/dolly/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveUser(email: string, userId: string) {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;
  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;
  return { id: info.actualUserId, username: (snap.data() as any)?.username ?? "Fan" };
}

async function sweepExpiredSessions(roomId: string, userId: string) {
  const cutoff = Date.now() - 20 * 24 * 60 * 60 * 1000;
  let staleSessionIds: string[] = [];
  let fetchedStaleFromDynamo = false;

  // Try sweep in DynamoDB first
  try {
    const res = await docClient.send(new QueryCommand({
      TableName: "RealTimeChat",
      KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
      ExpressionAttributeValues: {
        ":r": `ROOM#${roomId}`,
        ":p": `DOLLY_SESSION#${userId}#`
      }
    }));

    if (res.Items) {
      const staleItems = res.Items.filter(item => item.softDeleted === false && (item.updatedAt || 0) < cutoff);
      staleSessionIds = staleItems.map(item => (item.sk as string).split("#").pop() as string);
      fetchedStaleFromDynamo = true;

      for (const item of staleItems) {
        await docClient.send(new UpdateCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: item.sk },
          UpdateExpression: "SET softDeleted = :true, softDeletedAt = :now",
          ExpressionAttributeValues: { ":true": true, ":now": Date.now() }
        })).catch(() => {});
      }
    }
  } catch (dynErr) {
    console.warn("[sweepExpiredSessions] DynamoDB sweep failed:", dynErr);
  }

  // Sync sweep to Firestore
  try {
    const staleSnap = await db
      .collection("roarRooms").doc(roomId).collection("dollySessions")
      .where("userId", "==", userId)
      .where("softDeleted", "==", false)
      .where("updatedAt", "<", cutoff)
      .get();

    if (!staleSnap.empty) {
      const batch = db.batch();
      staleSnap.docs.forEach(doc => batch.update(doc.ref, { softDeleted: true, softDeletedAt: Date.now() }));
      await batch.commit();
    }
  } catch (fsErr) {
    console.warn("[sweepExpiredSessions] Firestore sweep failed:", fsErr);
  }
}

// Query params:
//   before   — cursor: fetch sessions updated before this timestamp (for "load more")
//   windowDays — defaults to 7; caller widens the window on each scroll page
export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> | { roomId: string } }) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    await sweepExpiredSessions(roomId, resolved.id);

    const { searchParams } = new URL(req.url);
    const before = searchParams.get("before"); // ms timestamp, exclusive upper bound
    const windowDays = Number(searchParams.get("windowDays") ?? "7");

    const upperBound = before ? Number(before) : Date.now();
    const lowerBound = upperBound - windowDays * 24 * 60 * 60 * 1000;

    let sessions: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try reading sessions from DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `DOLLY_SESSION#${resolved.id}#`
        }
      }));

      if (res.Items) {
        const filtered = res.Items.filter(item => 
          item.softDeleted === false && 
          (item.updatedAt || 0) < upperBound && 
          (item.updatedAt || 0) >= lowerBound
        );

        // Sort by updatedAt desc
        filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        sessions = filtered.slice(0, 50).map(item => ({
          sessionId: (item.sk as string).split("#").pop(),
          title: item.title ?? "New chat",
          updatedAt: item.updatedAt,
          dateLabel: new Date(item.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })
        }));

        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Sessions GET] DynamoDB query failed:", dynErr);
    }

    // Fallback: Check Firestore
    if (!fetchedFromDynamo) {
      try {
        const snap = await db
          .collection("roarRooms").doc(roomId).collection("dollySessions")
          .where("userId", "==", resolved.id)
          .where("softDeleted", "==", false)
          .where("updatedAt", "<", upperBound)
          .where("updatedAt", ">=", lowerBound)
          .orderBy("updatedAt", "desc")
          .limit(50)
          .get();

        sessions = snap.docs.map(doc => {
          const d = doc.data();
          return {
            sessionId: doc.id,
            title: d.title ?? "New chat",
            updatedAt: d.updatedAt,
            dateLabel: new Date(d.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" }),
          };
        });
      } catch (fsErr) {
        console.error("[Sessions GET] Firestore fallback failed:", fsErr);
      }
    }

    const oldestInWindow = sessions.length > 0 ? sessions[sessions.length - 1].updatedAt : lowerBound;

    return NextResponse.json({
      success: true,
      sessions,
      nextBefore: oldestInWindow,
      windowDays,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET dolly sessions error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> | { roomId: string } }) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const now = Date.now();
    const sessionId = `sess_${Math.random().toString(36).substring(2, 15)}`;

    const sessionDoc = {
      userId: resolved.id,
      roomId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      softDeleted: false,
      softDeletedAt: null,
    };

    const { roomId: _, ...sessionFields } = sessionDoc;

    // 1. Put to DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `DOLLY_SESSION#${resolved.id}#${sessionId}`,
          ...sessionFields
        }
      }));
    } catch (dynErr) {
      console.warn("[Sessions POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const ref = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
      await ref.set(sessionDoc);
    } catch (fsErr) {
      console.warn("[Sessions POST] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, sessionId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}