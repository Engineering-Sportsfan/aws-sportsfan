import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { ScanCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Scan DynamoDB IdentityAndAccess with full pagination
    let rawItems: any[] = [];
    let lastEvaluatedKey: Record<string, any> | undefined = undefined;

    try {
      do {
        const scanRes: any = await docClient.send(
          new ScanCommand({
            TableName: TABLES.IdentityAndAccess,
            FilterExpression: "begins_with(entityId, :prefix) AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":prefix": "USER#",
              ":skPrefix": "USER#",
            },
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          rawItems.push(...scanRes.Items);
        }
        lastEvaluatedKey = scanRes.LastEvaluatedKey;
      } while (lastEvaluatedKey);
    } catch (err: any) {
      console.warn("DynamoDB users scan notice:", err?.message || err);
    }

    // 2. Fetch from Firebase for fallback & merging
    let firestoreUsers: any[] = [];
    try {
      const snap = await db.collection("users").get();
      firestoreUsers = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (err: any) {
      console.warn("Firebase users fallback notice:", err?.message || err);
    }

    // 3. Consolidate and deduplicate users by canonical email
    const usersMap = new Map<string, any>();

    // Process DynamoDB users
    for (const item of rawItems) {
      const entityId = String(item.entityId || "");
      if (entityId.startsWith("OTP#") || entityId.startsWith("PREF#")) continue;

      let email = (item.email || entityId.replace(/^USER#/, "")).trim().toLowerCase();
      if (!email || !email.includes("@")) continue;

      const existing = usersMap.get(email);
      // Prefer canonical sk: USER#META record over timestamp records
      if (!existing || item.sk === "USER#META") {
        usersMap.set(email, {
          ...(existing || {}),
          ...item,
          email,
        });
      } else {
        // Merge attributes if missing
        usersMap.set(email, {
          ...item,
          ...existing,
          email,
        });
      }
    }

    // Merge any Firestore users that might have additional fields
    for (const fsUser of firestoreUsers) {
      let email = (fsUser.email || fsUser.id || "").trim().toLowerCase();
      if (!email || !email.includes("@")) continue;

      const existing = usersMap.get(email);
      if (!existing) {
        usersMap.set(email, {
          ...fsUser,
          email,
        });
      } else {
        // Merge any extra metadata
        if (!existing.avatar && fsUser.avatar) existing.avatar = fsUser.avatar;
        if (!existing.firstName && fsUser.firstName) existing.firstName = fsUser.firstName;
        if (!existing.lastName && fsUser.lastName) existing.lastName = fsUser.lastName;
        if (!existing.createdAt && fsUser.createdAt) existing.createdAt = fsUser.createdAt;
        if (!existing.lastLoginAt && fsUser.lastLoginAt) existing.lastLoginAt = fsUser.lastLoginAt;
      }
    }

    // 4. Format user list with Auth Method (Google vs Email/Password) and timestamps
    const users = Array.from(usersMap.values()).map(u => {
      const hasGoogle = !!(u.authProviders?.google || u.provider === "google" || u.googleId);
      const hasPassword = !!(u.authProviders?.emailPassword || u.password);

      let authMethod = "Email & Password";
      if (hasGoogle && hasPassword) {
        authMethod = "Google + Password";
      } else if (hasGoogle) {
        authMethod = "Google";
      } else if (hasPassword) {
        authMethod = "Email & Password";
      }

      return {
        email: u.email,
        userId: u.userId || u.email.replace(/[^a-zA-Z0-9]/g, "_"),
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || u.email.split("@")[0],
        avatar: u.avatar || "",
        role: u.role || "user",
        status: u.status || "active",
        authMethod,
        isVerified: u.isVerified !== false,
        totalPoints: u.totalPoints || 0,
        createdAt: u.createdAt || Date.now(),
        lastLoginAt: u.lastLoginAt || u.updatedAt || u.createdAt || Date.now(),
      };
    });

    // 5. Sort: Most recent signups / logins at the top
    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json(
      { users, total: users.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error: unknown) {
    console.error("GET /api/users error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch users";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { email, status, role } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const now = Date.now();

    // 1. Update in DynamoDB (IdentityAndAccess)
    const updateExpressions: string[] = ["#updatedAt = :updatedAt"];
    const exprAttrNames: Record<string, string> = { "#updatedAt": "updatedAt" };
    const exprAttrValues: Record<string, unknown> = { ":updatedAt": now };

    if (status !== undefined) {
      updateExpressions.push("#status = :status");
      exprAttrNames["#status"] = "status";
      exprAttrValues[":status"] = status;
    }
    if (role !== undefined) {
      updateExpressions.push("#role = :role");
      exprAttrNames["#role"] = "role";
      exprAttrValues[":role"] = role;
    }

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.IdentityAndAccess,
          Key: {
            entityId: `USER#${cleanEmail}`,
            sk: "USER#META",
          },
          UpdateExpression: `SET ${updateExpressions.join(", ")}`,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues,
        })
      );
    } catch (dynamoErr) {
      console.warn("DynamoDB PATCH user update notice:", dynamoErr);
    }

    // 2. Dual-Write Sync to Firebase
    try {
      await db.collection("users").doc(cleanEmail).set(
        {
          ...(status !== undefined && { status }),
          ...(role !== undefined && { role }),
          updatedAt: now,
        },
        { merge: true }
      );
    } catch (fbErr) {
      console.warn("Firebase PATCH user sync notice:", fbErr);
    }

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("PATCH /api/users error:", error);
    const msg = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Delete from DynamoDB (IdentityAndAccess)
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.IdentityAndAccess,
          Key: {
            entityId: `USER#${cleanEmail}`,
            sk: "USER#META",
          },
        })
      );
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.IdentityAndAccess,
          Key: {
            entityId: `OTP#${cleanEmail}`,
            sk: "OTP#ACTIVE",
          },
        })
      );
    } catch (dynamoErr) {
      console.warn("DynamoDB user delete notice:", dynamoErr);
    }

    // 2. Delete Sync to Firebase
    try {
      await db.collection("users").doc(cleanEmail).delete();
      await db.collection("otps").doc(cleanEmail).delete();
    } catch (fbErr) {
      console.warn("Firebase user delete notice:", fbErr);
    }

    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("DELETE /api/users error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete user";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}