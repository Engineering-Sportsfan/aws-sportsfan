// backend/lib/notifications/roarNotifications.ts — ROAR Comprehensive Notification Dispatcher
import { createNotification } from "./service";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { findRoomMessage } from "@/lib/roarRoomHelpers";
import { QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const TAG = "[roarNotifications]";
const FOLLOWED_ROOM_QUIET_MS = 5 * 60 * 1000;

export interface RoarPostOrMessageMeta {
  authorUid: string;
  authorEmail?: string | null;
  authorUsername?: string | null;
  text: string;
  roomId?: string | null;
  postId?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Robustly finds author & content for any ROAR post or room message across
 * RealTimeChat, SocialAndContent, and Firestore.
 */
export async function getRoarPostOrMessageMeta(
  itemId: string,
  roomId?: string | null
): Promise<RoarPostOrMessageMeta | null> {
  const cleanId = (itemId || "").replace(/^(MSG|POST)#/, "").trim();
  const cleanRoomId = (roomId || "").replace(/^ROOM#/, "").trim();

  // 1. If roomId provided, try findRoomMessage (checks DynamoDB RealTimeChat & Firestore roarRooms)
  if (cleanRoomId) {
    try {
      const found = await findRoomMessage(cleanRoomId, cleanId);
      if (found?.msgItem) {
        const item = found.msgItem;
        return {
          authorUid: item.authorUid || item.userId || item.senderId || "",
          authorEmail: item.authorEmail || item.email || null,
          authorUsername: item.authorUsername || item.author || null,
          text: (item.text || item.content || "").slice(0, 120),
          roomId: cleanRoomId,
          postId: cleanId,
        };
      }
    } catch (e) {
      console.warn(`${TAG} findRoomMessage lookup notice:`, e);
    }
  }

  // 2. Try DynamoDB SocialAndContent table (where feed posts live)
  try {
    const postRes = await docClient.send(
      new QueryCommand({
        TableName: TABLES.SocialAndContent,
        KeyConditionExpression: "contentId = :c",
        ExpressionAttributeValues: { ":c": `POST#${cleanId}` },
        Limit: 1,
      })
    );
    if (postRes.Items && postRes.Items.length > 0) {
      const item = postRes.Items[0];
      return {
        authorUid: item.authorUid || item.userId || "",
        authorEmail: item.authorEmail || item.email || null,
        authorUsername: item.authorUsername || item.author || null,
        text: (item.text || item.quizQuestion || item.statement || item.title || "").slice(0, 120),
        postId: cleanId,
      };
    }
  } catch (dynErr) {
    console.warn(`${TAG} SocialAndContent lookup notice:`, dynErr);
  }

  // 3. Try Firestore roarPosts
  if (db) {
    try {
      const postSnap = await db.collection(getFirestoreCollection("roarPosts")).doc(cleanId).get();
      if (postSnap.exists) {
        const data = postSnap.data() || {};
        return {
          authorUid: data.authorUid || data.userId || "",
          authorEmail: data.authorEmail || data.email || null,
          authorUsername: data.authorUsername || data.author || null,
          text: (data.text || data.quizQuestion || data.statement || data.title || "").slice(0, 120),
          postId: cleanId,
        };
      }
    } catch {}

    // 4. Try Firestore roarRooms (if cleanRoomId provided)
    if (cleanRoomId) {
      try {
        const msgSnap = await db
          .collection(getFirestoreCollection("roarRooms"))
          .doc(cleanRoomId)
          .collection("messages")
          .doc(cleanId)
          .get();
        if (msgSnap.exists) {
          const data = msgSnap.data() || {};
          return {
            authorUid: data.authorUid || data.userId || "",
            authorEmail: data.authorEmail || data.email || null,
            authorUsername: data.authorUsername || data.author || null,
            text: (data.text || data.content || "").slice(0, 120),
            roomId: cleanRoomId,
            postId: cleanId,
          };
        }
      } catch {}
    }
  }

  return null;
}

export async function resolveActorName(userId: string): Promise<string> {
  if (!userId) return "A fan";
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLES.IdentityAndAccess,
        Key: { entityId: `USER#${userId}`, sk: "USER#META" },
      })
    );
    const name = res.Item?.username ?? res.Item?.name ?? null;
    if (name) return name;
  } catch (err) {
    console.warn(`${TAG} resolveActorName notice:`, err);
  }

  if (db) {
    try {
      const doc = await db.collection(getFirestoreCollection("users")).doc(userId).get();
      if (doc.exists) {
        const data = doc.data() as any;
        return data?.username || data?.displayName || data?.name || "A fan";
      }
    } catch {}
  }

  return "A fan";
}

export async function resolveUserIdByUsername(username: string): Promise<string | null> {
  const clean = username.replace(/^@/, "").trim().toLowerCase();
  if (!clean) return null;

  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLES.IdentityAndAccess,
        IndexName: "username-index",
        KeyConditionExpression: "username = :u",
        ExpressionAttributeValues: { ":u": clean },
        Limit: 1,
      })
    );
    if (res.Items && res.Items.length > 0) {
      const entityId = res.Items[0].entityId as string;
      return entityId?.replace(/^USER#/, "") ?? null;
    }
  } catch {}

  if (db) {
    try {
      const usersSnap = await db
        .collection("users")
        .where("username", "==", clean)
        .limit(1)
        .get();
      if (!usersSnap.empty) {
        const doc = usersSnap.docs[0];
        return doc.id || (doc.data() as any)?.userId || null;
      }
    } catch {}
  }

  return null;
}

async function getRoomFollowers(roomId: string): Promise<string[]> {
  const cleanRoomId = roomId.replace(/^ROOM#/, "");
  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLES.RealTimeChat,
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": `ROOM#${cleanRoomId}`,
          ":p": "MEMBER#",
        },
        Limit: 100,
      })
    );
    if (res.Items && res.Items.length > 0) {
      return res.Items.map((item) => (item.sk as string).replace(/^MEMBER#/, "")).filter(Boolean);
    }
  } catch {}
  return [];
}

// ─── Domain Notification Triggers ─────────────────────────────────────────────

/**
 * 1. Notify author when a reaction (like/emoji) is added to a ROAR post or room message
 */
export async function notifyPostReaction(
  postId: string,
  actorUserId: string,
  reaction: string,
  roomId?: string | null,
  actorEmail?: string | null,
  knownMeta?: { authorUid?: string; authorEmail?: string; text?: string; actorName?: string }
): Promise<string | null> {
  try {
    const meta =
      knownMeta?.authorUid
        ? {
            authorUid: knownMeta.authorUid,
            authorEmail: knownMeta.authorEmail || null,
            text: knownMeta.text || "",
            roomId: roomId || null,
            postId,
          }
        : await getRoarPostOrMessageMeta(postId, roomId);

    if (!meta?.authorUid) return null;

    // Self-notification suppression guard
    const isSelf =
      (meta.authorUid && (meta.authorUid === actorUserId || (actorEmail && meta.authorUid === actorEmail))) ||
      (meta.authorEmail && actorEmail && meta.authorEmail.toLowerCase() === actorEmail.toLowerCase());
    if (isSelf) return null;

    const actorName = knownMeta?.actorName || (await resolveActorName(actorUserId));
    const targetRoom = meta.roomId || roomId;
    const postSnippet = meta.text ? `"${meta.text.slice(0, 80)}"` : "your post";

    return await createNotification({
      userId: meta.authorUid,
      recipientEmail: meta.authorEmail || null,
      category: "roar",
      notification_type: "roar.post_reaction",
      title: `${actorName} reacted ${reaction} to your post`,
      body: meta.text ? `${actorName} reacted ${reaction}: ${postSnippet}` : `${actorName} reacted ${reaction} to your post`,
      subtitle: meta.text || "",
      cta_label: "View post",
      cta_target: targetRoom ? `/MainModules/ROAR?room=${targetRoom}` : `/MainModules/ROAR`,
      priority: "LOW",
      fan: { username: actorName, badge: "ROOKIE_FAN" },
      actor: { userId: actorUserId, username: actorName },
      postId,
      roomId: targetRoom || null,
    });
  } catch (err) {
    console.error(`${TAG} notifyPostReaction error:`, err);
    return null;
  }
}

/**
 * Alias for backward compatibility
 */
export async function notifyRoomMessageReaction(
  roomId: string,
  msgId: string,
  actorUserId: string,
  reaction: string,
  actorEmail?: string | null,
  knownMeta?: { authorUid?: string; authorEmail?: string; text?: string }
): Promise<string | null> {
  return notifyPostReaction(msgId, actorUserId, reaction, roomId, actorEmail, knownMeta);
}

/**
 * 2. Notify post/message author when someone replies or comments
 */
export async function notifyPostComment(
  postId: string,
  actorUserId: string,
  actorEmail: string | null | undefined,
  commenterUsername: string,
  commentPreview?: string,
  roomId?: string | null,
  knownMeta?: { authorUid?: string; authorEmail?: string; text?: string }
): Promise<string | null> {
  try {
    const meta =
      knownMeta?.authorUid
        ? {
            authorUid: knownMeta.authorUid,
            authorEmail: knownMeta.authorEmail || null,
            text: knownMeta.text || "",
            roomId: roomId || null,
            postId,
          }
        : await getRoarPostOrMessageMeta(postId, roomId);

    if (!meta?.authorUid) return null;

    // Self-notification suppression guard
    const isSelf =
      (meta.authorUid && (meta.authorUid === actorUserId || (actorEmail && meta.authorUid === actorEmail))) ||
      (meta.authorEmail && actorEmail && meta.authorEmail.toLowerCase() === actorEmail.toLowerCase());
    if (isSelf) return null;

    const targetRoom = meta.roomId || roomId;
    const title = `${commenterUsername} replied to your post`;
    const body = commentPreview
      ? `${commenterUsername}: "${commentPreview.slice(0, 80)}"`
      : `${commenterUsername} replied to your post`;

    return await createNotification({
      userId: meta.authorUid,
      recipientEmail: meta.authorEmail || null,
      category: "roar",
      notification_type: "roar.post_reply",
      title,
      body,
      subtitle: commentPreview || meta.text || "",
      cta_label: "View reply",
      cta_target: targetRoom ? `/MainModules/ROAR?room=${targetRoom}` : `/MainModules/ROAR`,
      priority: "NORMAL",
      fan: { username: commenterUsername, badge: "ROOKIE_FAN" },
      actor: { userId: actorUserId, username: commenterUsername },
      postId,
      roomId: targetRoom || null,
    });
  } catch (err) {
    console.error(`${TAG} notifyPostComment error:`, err);
    return null;
  }
}

/**
 * Alias for backward compatibility
 */
export async function notifyRoomMessageComment(
  roomId: string,
  msgId: string,
  actorUserId: string,
  actorEmail: string | null | undefined,
  commenterUsername: string,
  commentPreview?: string,
  knownMeta?: { authorUid?: string; authorEmail?: string; text?: string }
): Promise<string | null> {
  return notifyPostComment(msgId, actorUserId, actorEmail, commenterUsername, commentPreview, roomId, knownMeta);
}

/**
 * 3. Notify users mentioned via @handle in text
 */
export async function notifyMentions(
  text: string,
  roomId: string,
  msgId: string,
  actorUserId: string,
  actorUsername: string
): Promise<void> {
  try {
    const rawMatches = text.match(/@(\w+)/g);
    if (!rawMatches || rawMatches.length === 0) return;
    const uniqueHandles = Array.from(new Set(rawMatches.map((m) => m.slice(1))));

    for (const handle of uniqueHandles) {
      try {
        const mentionedUserId = await resolveUserIdByUsername(handle);
        if (!mentionedUserId || mentionedUserId === actorUserId) continue;

        await createNotification({
          userId: mentionedUserId,
          category: "roar",
          notification_type: "roar.mention",
          title: `${actorUsername} mentioned you`,
          body: text.slice(0, 100),
          subtitle: text.slice(0, 100),
          cta_label: "View post",
          cta_target: roomId ? `/MainModules/ROAR?room=${roomId}` : `/MainModules/ROAR`,
          priority: "NORMAL",
          fan: { username: actorUsername, badge: "ROOKIE_FAN" },
          actor: { userId: actorUserId, username: actorUsername },
          postId: msgId,
          roomId: roomId || null,
        });
      } catch (innerErr) {
        console.warn(`${TAG} notifyMentions inner notice for @${handle}:`, innerErr);
      }
    }
  } catch (err) {
    console.error(`${TAG} notifyMentions error:`, err);
  }
}

/**
 * 4. Notify room followers when a room goes live
 */
export async function notifyRoomGoingLive(
  roomId: string,
  roomName: string,
  followers: string[] = []
): Promise<void> {
  try {
    const targetFollowers = followers.length > 0 ? followers : await getRoomFollowers(roomId);
    await Promise.all(
      targetFollowers.map((userId) =>
        createNotification({
          userId,
          category: "roar",
          notification_type: "roar.room_live",
          title: `${roomName} is live now! 🔴`,
          body: `Jump in — ${roomName} just went live with fans`,
          subtitle: `${roomName} is live now`,
          cta_label: "Join room",
          cta_target: `/MainModules/ROAR?room=${roomId}`,
          priority: "HIGH",
          roomId,
        }).catch((e) => console.warn(`${TAG} notifyRoomGoingLive per-user notice:`, e))
      )
    );
  } catch (err) {
    console.error(`${TAG} notifyRoomGoingLive error:`, err);
  }
}

/**
 * 5. Notify when a new debate or trivia is launched
 */
export async function notifyRoomContentAnnounced(
  roomId: string,
  roomName: string,
  kind: "debate" | "trivia",
  questionPreview: string,
  followers: string[] = []
): Promise<void> {
  try {
    const targetFollowers = followers.length > 0 ? followers : await getRoomFollowers(roomId);
    const label = kind === "debate" ? "New debate" : "New trivia";
    await Promise.all(
      targetFollowers.map((userId) =>
        createNotification({
          userId,
          category: "roar",
          notification_type: `roar.${kind}_announced`,
          title: `${label} in ${roomName} ⚡`,
          body: questionPreview.slice(0, 100),
          subtitle: questionPreview.slice(0, 100),
          cta_label: kind === "debate" ? "Vote now" : "Answer now",
          cta_target: `/MainModules/ROAR?room=${roomId}`,
          priority: "NORMAL",
          roomId,
        }).catch((e) => console.warn(`${TAG} notifyRoomContentAnnounced per-user notice:`, e))
      )
    );
  } catch (err) {
    console.error(`${TAG} notifyRoomContentAnnounced error:`, err);
  }
}

/**
 * 6. Notify followers when a debate or trivia is closing soon
 */
export async function notifyRoomContentClosingSoon(
  roomId: string,
  roomName: string,
  msgId: string,
  kind: "debate" | "trivia"
): Promise<void> {
  try {
    const followers = await getRoomFollowers(roomId);
    const label = kind === "debate" ? "Debate" : "Trivia";
    await Promise.all(
      followers.map((userId) =>
        createNotification({
          userId,
          category: "roar",
          notification_type: `roar.${kind}_closing_soon`,
          title: `${label} closing soon in ${roomName}`,
          body: `Last chance to join — closes in a couple minutes`,
          cta_label: "Join now",
          cta_target: `/MainModules/ROAR?room=${roomId}`,
          priority: "HIGH",
          roomId,
          postId: msgId,
        }).catch((e) => console.warn(`${TAG} notifyRoomContentClosingSoon per-user notice:`, e))
      )
    );
  } catch (err) {
    console.error(`${TAG} notifyRoomContentClosingSoon error:`, err);
  }
}

/**
 * 7. Notify room followers of new activity with 5-min debounce window
 */
export async function notifyFollowedRoomNewPost(
  roomId: string,
  roomName: string,
  posterUsername: string
): Promise<void> {
  try {
    const followers = await getRoomFollowers(roomId);
    if (followers.length === 0) return;
    const now = Date.now();

    for (const followerId of followers) {
      const debounceKey = `ROOM#${roomId}#FOLLOWER#${followerId}#LASTNOTIF`;
      let lastNotifiedAt = 0;
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: TABLES.Notifications,
            Key: { PK: `USER#${followerId}`, SK: debounceKey },
          })
        );
        lastNotifiedAt = res.Item?.lastNotifiedAt ?? 0;
      } catch {}

      if (now - lastNotifiedAt < FOLLOWED_ROOM_QUIET_MS) continue;

      await createNotification({
        userId: followerId,
        category: "roar",
        notification_type: "roar.followed_room_new_post",
        title: `New activity in ${roomName}`,
        body: `${posterUsername} just posted in a room you follow`,
        cta_label: "Open room",
        cta_target: `/MainModules/ROAR?room=${roomId}`,
        priority: "LOW",
        roomId,
      });

      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLES.Notifications,
            Item: {
              PK: `USER#${followerId}`,
              SK: debounceKey,
              lastNotifiedAt: now,
              expires_at: Math.floor(now / 1000) + 3600,
            },
          })
        );
      } catch {}
    }
  } catch (err) {
    console.error(`${TAG} notifyFollowedRoomNewPost error:`, err);
  }
}

/**
 * 8. Notify user when a prediction is resolved
 */
export async function notifyPredictionResolved(
  userId: string,
  predictionTitle: string,
  outcome: "win" | "loss",
  repPoints: number = 50,
  postId?: string
): Promise<void> {
  try {
    const isWin = outcome === "win";
    await createNotification({
      userId,
      category: "roar",
      notification_type: isWin ? "roar.prediction_ok" : "roar.prediction_fail",
      title: isWin ? "You called it! 🎯" : "Bold call completed 💪",
      body: isWin
        ? `Your prediction "${predictionTitle}" was CORRECT. +${repPoints} rep points.`
        : `Your prediction "${predictionTitle}" settled. Better luck on the next one!`,
      subtitle: predictionTitle,
      cta_label: "See accuracy",
      cta_target: `/MainModules/ROAR`,
      priority: "NORMAL",
      postId,
    });
  } catch (err) {
    console.error(`${TAG} notifyPredictionResolved error:`, err);
  }
}

/**
 * 9. Generic dispatcher for any ROAR notification
 */
export async function dispatchRoarNotification(payload: {
  userId: string;
  recipientEmail?: string | null;
  notificationType: string;
  title: string;
  body: string;
  subtitle?: string;
  postId?: string;
  roomId?: string;
  ctaLabel?: string;
  ctaTarget?: string;
  priority?: "HIGH" | "NORMAL" | "LOW";
  actor?: { userId?: string; username?: string; avatarUrl?: string };
}): Promise<string | null> {
  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.recipientEmail || null,
    category: "roar",
    notification_type: payload.notificationType.startsWith("roar")
      ? payload.notificationType
      : `roar.${payload.notificationType}`,
    title: payload.title,
    body: payload.body,
    subtitle: payload.subtitle || payload.body,
    cta_label: payload.ctaLabel || "View in ROAR",
    cta_target: payload.ctaTarget || "/MainModules/ROAR",
    priority: payload.priority || "NORMAL",
    actor: payload.actor || null,
    postId: payload.postId || null,
    roomId: payload.roomId || null,
  });
}
