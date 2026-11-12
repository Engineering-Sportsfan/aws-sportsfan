// backend/app/api/roar/notifications/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import {
  getNotificationsForUser,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function cleanId(id?: string | null): string {
  if (!id) return "";
  return id.replace(/^USER#/, "").trim();
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let email = searchParams.get("email");
    let uid = searchParams.get("uid");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid) {
      const user = await getUser(req);
      if (user) {
        email = user.email;
        uid = user.userId;
      }
    }

    if (!email && !uid) {
      return NextResponse.json({ success: true, notifications: [], unreadCount: 0 });
    }

    // Resolve canonical user ID
    let resolvedUserId = uid;
    try {
      const userInfo = await getUserInfo(uid || email || "", undefined, email || undefined);
      if (userInfo?.actualUserId) resolvedUserId = userInfo.actualUserId;
    } catch {
      // fallback
    }

    const { notifications, unreadCount } = await getNotificationsForUser(resolvedUserId || uid || email || "", {
      email,
      category: "roar",
      countOnly,
      limit: 50,
    });

    if (countOnly) {
      return NextResponse.json({ success: true, unreadCount });
    }

    return NextResponse.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let {
      recipientEmail,
      recipientUid,
      type,
      message,
      title,
      subtitle,
      cta,
      cta_label,
      ctaTarget,
      cta_target,
      category,
      fan,
      actor_name,
      actor_photoURL,
      actorPhoto,
      postId,
      roomId,
    } = body;

    if (!recipientEmail && !recipientUid) {
      const user = await getUser(req);
      if (user) {
        recipientEmail = user.email;
        recipientUid = user.userId;
      }
    }

    const finalTitle = title || message || "ROAR Notification";
    const finalBody = subtitle || body.body || message || "";

    if ((!recipientEmail && !recipientUid) || (!finalTitle && !finalBody)) {
      return NextResponse.json(
        { error: "recipientEmail or recipientUid and title/message are required" },
        { status: 400 }
      );
    }

    let resolvedUserId = recipientUid;
    try {
      const userInfo = await getUserInfo(recipientUid || recipientEmail, undefined, recipientEmail);
      if (userInfo?.actualUserId) resolvedUserId = userInfo.actualUserId;
    } catch {
      // fallback
    }

    const notifId = await createNotification({
      userId: resolvedUserId || recipientUid || recipientEmail,
      recipientEmail,
      category: category || "roar",
      notification_type: type || "ROAR_NOTIFICATION",
      title: finalTitle,
      body: finalBody,
      subtitle: finalBody,
      cta_label: cta || cta_label || null,
      cta_target: ctaTarget || cta_target || "/MainModules/ROAR",
      actor: actor_name
        ? { username: actor_name, avatarUrl: actor_photoURL || actorPhoto }
        : null,
      fan: fan || (actor_name ? { username: actor_name, badge: "ROOKIE_FAN", avatarUrl: actor_photoURL || actorPhoto } : null),
      postId: postId || null,
      roomId: roomId || null,
      metadata: body,
    });

    return NextResponse.json({ success: true, id: notifId, notifId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    let { id, email, uid, action, notifId, markAll } = body;

    if (!id && notifId) id = notifId;
    if (!action && markAll) action = "markAllRead";
    if (!action && id) action = "markRead";

    if (!email && !uid) {
      const user = await getUser(req);
      if (user) {
        email = user.email;
        uid = user.userId;
      }
    }

    if (!email && !uid) {
      return NextResponse.json({ error: "Unauthorized or missing user identification" }, { status: 401 });
    }

    let resolvedUserId = uid;
    try {
      const userInfo = await getUserInfo(uid || email || "", undefined, email || undefined);
      if (userInfo?.actualUserId) resolvedUserId = userInfo.actualUserId;
    } catch {
      // fallback
    }

    const targetUser = cleanId(resolvedUserId || uid || email);

    if (action === "markRead" && id) {
      await markNotificationRead(targetUser, id);
      return NextResponse.json({ success: true, updated: 1 });
    }

    if (action === "markAllRead") {
      const count = await markAllNotificationsRead(targetUser, { email, category: "roar" });
      return NextResponse.json({ success: true, updated: count });
    }

    return NextResponse.json(
      { error: "Invalid action or missing fields" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/roar/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let { id, email, uid, all, notifId } = body;

    if (!id && notifId) id = notifId;

    if (!email && !uid) {
      const user = await getUser(req);
      if (user) {
        email = user.email;
        uid = user.userId;
      }
    }

    if (!email && !uid) {
      return NextResponse.json({ error: "Unauthorized or missing user identification" }, { status: 401 });
    }

    let resolvedUserId = uid;
    try {
      const userInfo = await getUserInfo(uid || email || "", undefined, email || undefined);
      if (userInfo?.actualUserId) resolvedUserId = userInfo.actualUserId;
    } catch {
      // fallback
    }

    const targetUser = cleanId(resolvedUserId || uid || email);

    if (id && !all) {
      try {
        const res = await docClient.send(
          new QueryCommand({
            TableName: TABLES.Notifications,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: {
              ":pk": `USER#${targetUser}`,
              ":prefix": "NOTIF#",
            },
          })
        );
        const match = res.Items?.find(
          (item) => item.notifId === id || item.id === id || (item.SK as string)?.endsWith(`#${id}`)
        );
        if (match) {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.Notifications,
              Key: { PK: `USER#${targetUser}`, SK: match.SK },
            })
          );
        }
      } catch (dynErr) {
        console.warn("[Notifications DELETE] DynamoDB notice:", dynErr);
      }

      if (db) {
        try {
          await db.collection(getFirestoreCollection("notifications")).doc(id).delete();
        } catch {
          // ignore
        }
      }

      return NextResponse.json({ success: true });
    }

    if (all) {
      let deletedCount = 0;
      try {
        const res = await docClient.send(
          new QueryCommand({
            TableName: TABLES.Notifications,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues: {
              ":pk": `USER#${targetUser}`,
              ":prefix": "NOTIF#",
            },
          })
        );
        if (res.Items) {
          for (const item of res.Items) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.Notifications,
                Key: { PK: item.PK, SK: item.SK },
              })
            ).catch(() => {});
            deletedCount++;
          }
        }
      } catch (dynErr) {
        console.warn("[Notifications DELETE all] DynamoDB notice:", dynErr);
      }

      return NextResponse.json({ success: true, deleted: deletedCount });
    }

    return NextResponse.json(
      { error: "Provide id for single delete, or all:true for bulk delete" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/roar/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}