// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import type { Notification } from "@/app/models/Notification";

// async function getResolvedUserId(user: { email: string; userId: string }) {
//   let resolvedUserId = user.email;
//   let userSnap = await db.collection("users").doc(user.email).get();
//   if (!userSnap.exists) {
//     userSnap = await db.collection("users").doc(user.userId).get();
//     if (userSnap.exists) {
//       resolvedUserId = user.userId;
//     }
//   }
//   return resolvedUserId;
// }

// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await getResolvedUserId(user);

//     const { searchParams } = new URL(req.url);
//     const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
//     const lastDocId = searchParams.get("lastDocId");
//     const unreadOnly = searchParams.get("unreadOnly") === "true";

//     let query = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items")
//       .orderBy("createdAt", "desc")
//       .limit(limit);

//     if (unreadOnly) query = query.where("read", "==", false);

//     if (lastDocId) {
//       const lastDoc = await db
//         .collection("notifications")
//         .doc(resolvedUserId)
//         .collection("items")
//         .doc(lastDocId)
//         .get();
//       if (lastDoc.exists) query = query.startAfter(lastDoc);
//     }

//     const snapshot = await query.get();
//     const notifications: Notification[] = snapshot.docs.map((doc) => ({
//       ...(doc.data() as Notification),
//       notifId: doc.id,
//     }));

//     const lastDoc = snapshot.docs[snapshot.docs.length - 1];

//     return NextResponse.json({
//       success: true,
//       notifications,
//       unreadCount: notifications.filter((n) => !n.read).length,
//       pagination: {
//         limit,
//         hasMore: notifications.length === limit,
//         nextCursor:
//           notifications.length === limit ? { lastDocId: lastDoc?.id } : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // PATCH /api/roar/notifications  body: { notifId?: string, markAll?: boolean }
// export async function PATCH(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await getResolvedUserId(user);

//     const body = await req.json();
//     const { notifId, markAll } = body;

//     const baseRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items");

//     if (markAll) {
//       const unread = await baseRef.where("read", "==", false).get();
//       const batch = db.batch();
//       unread.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
//       await batch.commit();
//       return NextResponse.json({ success: true, updated: unread.size });
//     }

//     if (notifId) {
//       await baseRef.doc(notifId).update({ read: true });
//       return NextResponse.json({ success: true, updated: 1 });
//     }

//     return NextResponse.json(
//       { error: "Provide notifId or markAll: true" },
//       { status: 400 },
//     );
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("PATCH /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// export async function DELETE(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await getResolvedUserId(user);

//     const body = await req.json();
//     const { notifId, all } = body;

//     const baseRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items");

//     if (notifId && !all) {
//       await baseRef.doc(notifId).delete();
//       return NextResponse.json({ success: true });
//     }

//     if (all) {
//       const snapshot = await baseRef.get();
//       if (snapshot.empty) {
//         return NextResponse.json({ success: true, deleted: 0 });
//       }

//       const batch = db.batch();
//       snapshot.docs.forEach((doc) => batch.delete(doc.ref));
//       await batch.commit();
//       return NextResponse.json({ success: true, deleted: snapshot.size });
//     }

//     return NextResponse.json({ error: "Provide notifId or all: true" }, { status: 400 });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("DELETE /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// app/api/roar/notifications/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid) {
      return NextResponse.json({ error: "email or uid is required" }, { status: 400 });
    }

    // Resolve canonical user ID
    const userInfo = await getUserInfo(uid || email || "", undefined, email || undefined);
    const resolvedUserId = userInfo.actualUserId;

    let notifications: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try fetching from DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":c": `USER#${resolvedUserId}`,
          ":p": "NOTIF#"
        }
      }));

      if (res.Items) {
        notifications = res.Items.map(item => ({
          id: (item.sk as string).replace(/^NOTIF#/, ""),
          ...item
        }));
        // Sort newest first
        notifications.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Notifications GET] DynamoDB fetch failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const [emailSnap, uidSnap] = await Promise.all([
          email
            ? db.collection("notifications").where("recipientEmail", "==", email).orderBy("createdAt", "desc").limit(50).get()
            : null,
          uid
            ? db.collection("notifications").where("recipientUid", "==", uid).orderBy("createdAt", "desc").limit(50).get()
            : null,
        ]);

        const seen = new Set<string>();
        for (const snap of [emailSnap, uidSnap]) {
          if (!snap) continue;
          snap.docs.forEach((doc) => {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              notifications.push({ id: doc.id, ...doc.data() });
            }
          });
        }
        notifications.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        notifications.splice(50);
      } catch (fsErr) {
        console.error("[Notifications GET] Firestore fallback failed:", fsErr);
        return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
      }
    }

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    if (countOnly) {
      return NextResponse.json({ success: true, unreadCount });
    }

    return NextResponse.json({ success: true, notifications, unreadCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — create a notification manually ────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipientEmail,
      recipientUid,
      type,
      message,
      battleId, battleName, battleType, senderId, senderName,
      audioPublicId, audioTitle, audioUrl, audioDuration,
      audioDurationSeconds, audioFormat,
    } = body;

    if (!recipientEmail || !type || !message) {
      return NextResponse.json(
        { error: "recipientEmail, type, and message are required" },
        { status: 400 }
      );
    }

    // Resolve canonical recipient user ID
    const userInfo = await getUserInfo(recipientUid || recipientEmail, undefined, recipientEmail);
    const resolvedUserId = userInfo.actualUserId;

    const notifId = `notif_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();

    const payload: Record<string, any> = {
      recipientEmail,
      recipientUid: recipientUid ?? null,
      type,
      message,
      isRead: false,
      createdAt: now,
    };

    if (battleId)
      Object.assign(payload, { battleId, battleName, battleType, senderId, senderName });

    if (audioPublicId)
      Object.assign(payload, {
        audioPublicId, audioTitle, audioUrl, audioDuration,
        audioDurationSeconds, audioFormat,
        audioUploadedAt: now,
      });

    // 1. Put to DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "SocialAndContent",
        Item: {
          contentId: `USER#${resolvedUserId}`,
          sk: `NOTIF#${notifId}`,
          ...payload
        }
      }));
    } catch (dynErr) {
      console.warn("[Notifications POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("notifications").doc(notifId).set(payload);
    } catch (fsErr) {
      console.warn("[Notifications POST] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id: notifId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH — mark read ────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, uid, action } = body;

    // Resolve canonical user ID
    const userInfo = await getUserInfo(uid || email || "", undefined, email || undefined);
    const resolvedUserId = userInfo.actualUserId;

    if (action === "markRead" && id) {
      // 1. Update in DynamoDB
      try {
        await docClient.send(new UpdateCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `USER#${resolvedUserId}`, sk: `NOTIF#${id}` },
          UpdateExpression: "SET isRead = :t, readAt = :now",
          ExpressionAttributeValues: { ":t": true, ":now": Date.now() }
        }));
      } catch (dynErr) {
        console.warn("[Notifications PATCH] DynamoDB update failed:", dynErr);
      }

      // 2. Sync to Firestore
      try {
        await db.collection("notifications").doc(id).update({
          isRead: true, readAt: Date.now(),
        });
      } catch (fsErr) {
        console.warn("[Notifications PATCH] Firestore fallback update failed:", fsErr);
      }

      return NextResponse.json({ success: true });
    }

    if (action === "markAllRead" && (email || uid)) {
      let unreadNotifIds: string[] = [];

      // Fetch unread notifications from DynamoDB
      try {
        const res = await docClient.send(new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: {
            ":c": `USER#${resolvedUserId}`,
            ":p": "NOTIF#"
          }
        }));

        if (res.Items) {
          const unread = res.Items.filter(item => item.isRead === false);
          unreadNotifIds = unread.map(item => (item.sk as string).replace(/^NOTIF#/, ""));

          for (const item of unread) {
            await docClient.send(new UpdateCommand({
              TableName: "SocialAndContent",
              Key: { contentId: `USER#${resolvedUserId}`, sk: item.sk },
              UpdateExpression: "SET isRead = :t, readAt = :now",
              ExpressionAttributeValues: { ":t": true, ":now": Date.now() }
            })).catch(() => {});
          }
        }
      } catch (dynErr) {
        console.warn("[Notifications PATCH markAllRead] DynamoDB update failed:", dynErr);
      }

      // Sync mark all read to Firestore
      try {
        const [emailSnap, uidSnap] = await Promise.all([
          email ? db.collection("notifications").where("recipientEmail", "==", email).where("isRead", "==", false).get() : null,
          uid ? db.collection("notifications").where("recipientUid", "==", uid).where("isRead", "==", false).get() : null,
        ]);

        const seen = new Set<string>();
        const batch = db.batch();
        for (const snap of [emailSnap, uidSnap]) {
          if (!snap) continue;
          snap.docs.forEach((doc) => {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              batch.update(doc.ref, { isRead: true, readAt: Date.now() });
            }
          });
        }
        if (seen.size > 0) await batch.commit();
      } catch (fsErr) {
        console.warn("[Notifications PATCH markAllRead] Firestore fallback sync failed:", fsErr);
      }

      return NextResponse.json({ success: true, updated: unreadNotifIds.length });
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

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, uid, all } = body;

    const userInfo = await getUserInfo(uid || email || "", undefined, email || undefined);
    const resolvedUserId = userInfo.actualUserId;

    if (id && !all) {
      // 1. Delete from DynamoDB
      try {
        await docClient.send(new DeleteCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `USER#${resolvedUserId}`, sk: `NOTIF#${id}` }
        }));
      } catch (dynErr) {
        console.warn("[Notifications DELETE] DynamoDB delete failed:", dynErr);
      }

      // 2. Sync to Firestore
      try {
        await db.collection("notifications").doc(id).delete();
      } catch (fsErr) {
        console.warn("[Notifications DELETE] Firestore fallback delete failed:", fsErr);
      }

      return NextResponse.json({ success: true });
    }

    if ((email || uid) && all) {
      let deletedCount = 0;

      // Query and delete all from DynamoDB
      try {
        const res = await docClient.send(new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: {
            ":c": `USER#${resolvedUserId}`,
            ":p": "NOTIF#"
          }
        }));

        if (res.Items) {
          deletedCount = res.Items.length;
          for (const item of res.Items) {
            await docClient.send(new DeleteCommand({
              TableName: "SocialAndContent",
              Key: { contentId: `USER#${resolvedUserId}`, sk: item.sk }
            })).catch(() => {});
          }
        }
      } catch (dynErr) {
        console.warn("[Notifications DELETE all] DynamoDB delete failed:", dynErr);
      }

      // Sync to Firestore
      try {
        const [emailSnap, uidSnap] = await Promise.all([
          email ? db.collection("notifications").where("recipientEmail", "==", email).get() : null,
          uid ? db.collection("notifications").where("recipientUid", "==", uid).get() : null,
        ]);

        const seen = new Set<string>();
        const batch = db.batch();
        for (const snap of [emailSnap, uidSnap]) {
          if (!snap) continue;
          snap.docs.forEach((doc) => {
            if (!seen.has(doc.id)) {
              seen.add(doc.id);
              batch.delete(doc.ref);
            }
          });
        }
        if (seen.size > 0) await batch.commit();
      } catch (fsErr) {
        console.warn("[Notifications DELETE all] Firestore fallback delete failed:", fsErr);
      }

      return NextResponse.json({ success: true, deleted: deletedCount });
    }

    return NextResponse.json(
      { error: "Provide id for single delete, or (email or uid) + all:true for bulk delete" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}