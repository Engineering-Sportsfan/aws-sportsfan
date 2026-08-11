// app/api/notifications/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET — fetch notifications for a user + total unread count ────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid) {
      return NextResponse.json({ error: "email or uid is required" }, { status: 400 });
    }

    let notifications: any[] = [];

    // 1. Try querying DynamoDB IdentityAndAccess table
    try {
      const entityIds = [];
      if (email) entityIds.push(`USER#${email}`, email);
      if (uid) entityIds.push(`USER#${uid}`, uid);

      for (const ent of entityIds) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "IdentityAndAccess",
            KeyConditionExpression: "entityId = :e AND begins_with(sk, :nPrefix)",
            ExpressionAttributeValues: {
              ":e": ent,
              ":nPrefix": "NOTIF#",
            },
            ScanIndexForward: false,
            Limit: 50,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          qRes.Items.forEach((item) => {
            notifications.push({
              id: (item.sk as string)?.split("#")[2] || item.id,
              ...item,
            });
          });
        }
      }
    } catch (dynErr) {
      console.warn("DynamoDB notifications query notice:", dynErr);
    }

    // 2. Fallback to Firebase
    if (notifications.length === 0) {
      try {
        const queries = [];
        if (email) {
          queries.push(
            db.collection("notifications").where("recipientEmail", "==", email).orderBy("createdAt", "desc").limit(50).get()
          );
        }
        if (uid) {
          queries.push(
            db.collection("notifications").where("recipientUid", "==", uid).orderBy("createdAt", "desc").limit(50).get()
          );
        }

        const results = await Promise.all(queries);
        const seen = new Set<string>();
        results.forEach((snap) =>
          snap.docs.forEach((doc) => {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              notifications.push({ id: doc.id, ...doc.data() });
            }
          })
        );
      } catch (fbErr) {
        console.warn("Firebase notifications query fallback notice:", fbErr);
      }
    }

    notifications.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const unreadCount = notifications.filter((n) => !n.isRead).length;

    if (countOnly) {
      return NextResponse.json({ success: true, unreadCount }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ success: true, notifications, unreadCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — create a single notification manually ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipientEmail,
      recipientUid,
      type,
      message,
      battleId,
      battleName,
      battleType,
      senderId,
      senderName,
      audioPublicId,
      audioTitle,
      audioUrl,
      audioDuration,
      audioDurationSeconds,
      audioFormat,
    } = body;

    if (!recipientEmail || !type || !message) {
      return NextResponse.json(
        { error: "recipientEmail, type, and message are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const notifId = `notif_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const payload: Record<string, unknown> = {
      id: notifId,
      recipientEmail,
      recipientUid: recipientUid ?? null,
      type,
      message,
      isRead: false,
      createdAt: now,
      ...(battleId && { battleId, battleName, battleType, senderId, senderName }),
      ...(audioPublicId && {
        audioPublicId,
        audioTitle,
        audioUrl,
        audioDuration,
        audioDurationSeconds,
        audioFormat,
        audioUploadedAt: now,
      }),
    };

    // ── Dual-Write to DynamoDB IdentityAndAccess & Firebase ───────────────────
    const dynamoItem = {
      entityId: `USER#${recipientEmail}`,
      sk: `NOTIF#${now}#${notifId}`,
      email: recipientEmail,
      ...payload,
    };

    await dualWrite("notifications", notifId, "IdentityAndAccess", dynamoItem);

    return NextResponse.json({ success: true, id: notifId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH — mark one or all notifications as read ───────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, action } = body;

    if (action === "markRead" && id) {
      try {
        await db.collection("notifications").doc(id).update({
          isRead: true,
          readAt: Date.now(),
        });
      } catch (fbErr) {
        console.warn("Firebase markRead notice:", fbErr);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "markAllRead" && email) {
      try {
        const snapshot = await db
          .collection("notifications")
          .where("recipientEmail", "==", email)
          .where("isRead", "==", false)
          .get();

        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach((doc) => {
            batch.update(doc.ref, { isRead: true, readAt: Date.now() });
          });
          await batch.commit();
        }
      } catch (fbErr) {
        console.warn("Firebase markAllRead notice:", fbErr);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action or missing fields" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE — clear one notification or all for a user ───────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, all } = body;

    if (id && !all) {
      try {
        await db.collection("notifications").doc(id).delete();
      } catch (fbErr) {
        console.warn("Firebase delete notif notice:", fbErr);
      }
      return NextResponse.json({ success: true });
    }

    if (email && all) {
      try {
        const snapshot = await db
          .collection("notifications")
          .where("recipientEmail", "==", email)
          .get();

        if (!snapshot.empty) {
          const batch = db.batch();
          snapshot.docs.forEach((doc) => batch.delete(doc.ref));
          await batch.commit();
        }
      } catch (fbErr) {
        console.warn("Firebase delete all notifs notice:", fbErr);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Provide id for single delete, or email + all:true for bulk delete" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}