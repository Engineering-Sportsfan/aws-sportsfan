// // lib/roarNotifyHelpers.ts

// import { db } from "@/lib/firebaseAdmin";

// // ─── Internal helpers ─────────────────────────────────────────────────────────

// async function getPostMeta(postId: string): Promise<{
//     authorUserId: string;
//     authorEmail: string | null;
//     text: string;
// } | null> {
//     try {
//         const snap = await db.collection("roarPosts").doc(postId).get();
//         if (!snap.exists) return null;
//         const data = snap.data()!;
//         return {
//             authorUserId: data.authorUid ?? data.userId ?? data.authorUserId ?? "",
//             authorEmail: data.authorEmail ?? data.email ?? null,
//             text: (data.text ?? data.quizQuestion ?? "").slice(0, 120),
//         };
//     } catch {
//         return null;
//     }
// }

// async function resolveRecipientEmail(authorUserId: string): Promise<string | null> {
//     try {
//         const snap = await db.collection("roarProfiles").doc(authorUserId).get();
//         if (snap.exists) {
//             const d = snap.data()!;
//             return d.email ?? d.authorEmail ?? null;
//         }
//     } catch { /* ignore */ }
//     return null;
// }

// async function resolveActorName(userId: string): Promise<string> {
//     try {
//         const snap = await db.collection("roarProfiles").doc(userId).get();
//         if (snap.exists) {
//             const d = snap.data()!;
//             if (d.username) return d.username as string;
//             if (d.name) return d.name as string;
//         }
//     } catch { /* ignore */ }
//     return "A fan";
// }

// // ─── Public API ───────────────────────────────────────────────────────────────

// /**
//  * @param postId      The reacted-to post
//  * @param actorUserId Your app's userId (from getUser().userId)
//  * @param reaction    Reaction type string
//  */
// export async function notifyPostReaction(
//     postId: string,
//     actorUserId: string,
//     reaction: string
// ): Promise<void> {
//     try {
//         const post = await getPostMeta(postId);
//         if (!post || !post.authorUserId) return;

//         // Self-reaction guard
//         if (post.authorUserId === actorUserId) return;

//         const recipientEmail =
//             post.authorEmail ?? (await resolveRecipientEmail(post.authorUserId));
//         if (!recipientEmail) return;

//         // Resolve actor display name from their ROAR profile
//         const actorName = await resolveActorName(actorUserId);

//         const notifCollection = db.collection("notifications");

//         // Roll-up: update existing notification for this post if one already exists
//         const existing = await notifCollection
//             .where("type", "==", "roar_post_like")
//             .where("postId", "==", postId)
//             .where("recipientEmail", "==", recipientEmail)
//             .limit(1)
//             .get();

//         const now = Date.now();

//         if (!existing.empty) {
//             const docRef = existing.docs[0].ref;
//             const prev = existing.docs[0].data();
//             const prevNames: string[] = prev.likerNames ?? [];

//             const updatedNames = [
//                 actorName,
//                 ...prevNames.filter((n) => n !== actorName),
//             ].slice(0, 3);

//             const likerCount = (prev.likerCount ?? 1) + 1;

//             await docRef.update({
//                 likerNames: updatedNames,
//                 likerCount,
//                 message: buildLikeMessage(updatedNames, likerCount),
//                 isRead: false,
//                 updatedAt: now,
//             });
//         } else {
//             await notifCollection.add({
//                 type: "roar_post_like",
//                 recipientEmail,
//                 recipientUid: post.authorUserId,
//                 postId,
//                 postPreview: post.text || "your ROAR post",
//                 likerNames: [actorName],
//                 likerCount: 1,
//                 message: buildLikeMessage([actorName], 1),
//                 isRead: false,
//                 createdAt: now,
//                 updatedAt: now,
//             });
//         }
//     } catch (err) {
//         console.error("[roarNotify] notifyPostReaction error:", err);
//     }
// }

// /**
//  * @param postId              The commented-on post
//  * @param actorUserId         Your app's userId (from getUser().userId)
//  * @param actorEmail          Commenter's email (from getUser().email)
//  * @param commenterUsername   Display name
//  * @param commentPreview      First ~80 chars of comment text
//  */
// export async function notifyPostComment(
//     postId: string,
//     actorUserId: string,
//     actorEmail: string,
//     commenterUsername: string,
//     commentPreview?: string
// ): Promise<void> {
//     try {
//         const post = await getPostMeta(postId);
//         if (!post || !post.authorUserId) return;

//         // Self-comment guard
//         if (post.authorUserId === actorUserId) return;
//         if (post.authorEmail && post.authorEmail === actorEmail) return;

//         const recipientEmail =
//             post.authorEmail ?? (await resolveRecipientEmail(post.authorUserId));
//         if (!recipientEmail) return;

//         const now = Date.now();
//         const message = commentPreview
//             ? `${commenterUsername} commented on your post: "${commentPreview.slice(0, 60)}"`
//             : `${commenterUsername} commented on your ROAR post`;

//         await db.collection("notifications").add({
//             type: "roar_post_comment",
//             recipientEmail,
//             recipientUid: post.authorUserId,
//             postId,
//             postPreview: post.text || "your ROAR post",
//             commenterUsername,
//             message,
//             isRead: false,
//             createdAt: now,
//             updatedAt: now,
//         });
//     } catch (err) {
//         console.error("[roarNotify] notifyPostComment error:", err);
//     }
// }


// export async function notifyRoomMessageReaction(
//     roomId: string,
//     msgId: string,
//     actorUserId: string,
//     reaction: string
// ) {
//     try {
//         const [msgSnap, actorSnap] = await Promise.all([
//             db.collection("roarRooms").doc(roomId).collection("messages").doc(msgId).get(),
//             db.collection("roarProfiles").doc(actorUserId).get(),
//         ]);

//         if (!msgSnap.exists) return;
//         const msg = msgSnap.data()!;

//         // Self-action guard
//         if (msg.authorUid === actorUserId) return;

//         const actorUsername = actorSnap.data()?.username ?? "Someone";
//         const recipientUid = msg.authorUid;

//         // Get recipient email from roarProfiles
//         const recipientSnap = await db.collection("roarProfiles").doc(recipientUid).get();
//         const recipientEmail = recipientSnap.data()?.email ?? null;

//         // Rollup — one notification doc per actor+post, update if exists
//         const notifId = `reaction_${msgId}_${actorUserId}`;
//         await db.collection("notifications").doc(notifId).set({
//             type: "roar_post_like",
//             reaction,
//             postId: msgId,
//             roomId,
//             actorUserId,
//             actorUsername,
//             recipientUid,
//             recipientEmail,
//             postPreview: msg.text?.slice(0, 80) ?? "",
//             likerNames: [actorUsername],
//             likerCount: 1,
//             message: `${actorUsername} reacted to your post`,
//             updatedAt: Date.now(),
//             createdAt: Date.now(),
//             isRead: false,
//         }, { merge: true });

//     } catch (e) {
//         console.warn("[notifyRoomMessageReaction] failed:", e);
//     }
// }

// export async function notifyRoomMessageComment(
//     roomId: string,
//     msgId: string,
//     actorUserId: string,
//     actorEmail: string,
//     commenterUsername: string,
//     commentPreview?: string
// ) {
//     try {
//         const msgSnap = await db
//             .collection("roarRooms").doc(roomId)
//             .collection("messages").doc(msgId).get();

//         if (!msgSnap.exists) return;
//         const msg = msgSnap.data()!;

//         // Self-action guard
//         if (msg.authorUid === actorUserId) return;

//         const recipientUid = msg.authorUid;
//         const recipientSnap = await db.collection("roarProfiles").doc(recipientUid).get();
//         const recipientEmail = recipientSnap.data()?.email ?? null;

//         // one doc per comment, no rollup
//             //   type: "comment",
//             await db.collection("notifications").doc().set({
//                 type: "roar_post_comment",
//                 postId: msgId,
//                 roomId,
//                 actorUserId,
//                 actorEmail,
//                 actorUsername: commenterUsername,
//                 commenterUsername,
//                 recipientUid,
//                 recipientEmail,
//                 postPreview: msg.text?.slice(0, 80) ?? "",
//                 message: commentPreview
//                     ? `${commenterUsername} commented: "${commentPreview.slice(0, 60)}"`
//                     : `${commenterUsername} commented on your post`,
//                 commentPreview: commentPreview?.slice(0, 100) ?? null,
//                 createdAt: Date.now(),
//                 updatedAt: Date.now(),
//                 isRead: false,
//             });

//         } catch (e) {
//             console.warn("[notifyRoomMessageComment] failed:", e);
//         }
//     }

// // ─── Formatters ───────────────────────────────────────────────────────────────

// function buildLikeMessage(names: string[], total: number): string {
//         if (total === 1) return `${names[0]} reacted to your ROAR post`;
//         if (total === 2) return `${names[0]} and ${names[1] ?? "1 other"} reacted to your ROAR post`;
//         const others = total - 1;
//         return `${names[0]} and ${others} other${others === 1 ? "" : "s"} reacted to your ROAR post`;
//     }





// lib/roarNotifyHelpers.ts  ← REPLACE ENTIRE FILE WITH THIS DEBUG VERSION
// Remove the [DEBUG] logs once the issue is found.

import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

const TAG = "[roarNotify]";

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getPostMeta(postId: string): Promise<{
  authorUserId: string;
  authorEmail: string | null;
  text: string;
} | null> {
  try {
    let data: any = null;
    let found = false;

    // 1. Try DynamoDB
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" }
      }));
      if (res.Items && res.Items.length > 0) {
        data = res.Items[0];
        found = true;
      }
    } catch (err) {
      console.warn(`${TAG} getPostMeta DynamoDB lookup notice:`, err);
    }

    // 2. Fallback to Firestore
    if (!found) {
      const snap = await db.collection("roarPosts").doc(postId).get();
      if (snap.exists) {
        data = snap.data()!;
        found = true;
      }
    }

    if (!found || !data) {
      console.warn(`${TAG} getPostMeta: doc roarPosts/${postId} does NOT exist`);
      return null;
    }

    const result = {
      authorUserId: data.authorUid ?? data.userId ?? data.authorUserId ?? "",
      authorEmail: data.authorEmail ?? data.email ?? null,
      text: (data.text ?? data.quizQuestion ?? "").slice(0, 120),
    };
    console.log(`${TAG} getPostMeta(${postId}):`, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error(`${TAG} getPostMeta ERROR:`, err);
    return null;
  }
}

async function getRoomMessageMeta(roomId: string, msgId: string): Promise<{
  authorUid: string;
   authorEmail: string | null;
  text: string;
} | null> {
  try {
    let data: any = null;
    let found = false;

    // 1. Try DynamoDB
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `MSG#${roomId}#`
        }
      }));
      if (res.Items && res.Items.length > 0) {
        const match = res.Items.find(item => item.chatId === msgId || item.id === msgId || (item.sk as string).endsWith(msgId));
        if (match) {
          data = match;
          found = true;
        }
      }
    } catch (err) {
      console.warn(`${TAG} getRoomMessageMeta DynamoDB lookup notice:`, err);
    }

    // 2. Fallback to Firestore
    if (!found) {
      const snap = await db
        .collection("roarRooms").doc(roomId)
        .collection("messages").doc(msgId)
        .get();
      if (snap.exists) {
        data = snap.data()!;
        found = true;
      }
    }

    if (!found || !data) {
      console.warn(`${TAG} getRoomMessageMeta: doc roarRooms/${roomId}/messages/${msgId} does NOT exist`);
      return null;
    }

    const result = {
      authorUid: data.authorUid ?? "",
      authorEmail: data.authorEmail ?? null,
      text: (data.text ?? "").slice(0, 120),
    };
    console.log(`${TAG} getRoomMessageMeta(${roomId}/${msgId}):`, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error(`${TAG} getRoomMessageMeta ERROR:`, err);
    return null;
  }
}

/**
 * Resolve email for a UID.
 * Checks users/{uid} first (canonical), then roarProfiles/{uid} as fallback.
 */
async function resolveEmailForUid(uid: string): Promise<string | null> {
  if (!uid) {
    console.warn(`${TAG} resolveEmailForUid: called with empty uid`);
    return null;
  }

  // 1. Try DynamoDB first
  try {
    const res = await docClient.send(new GetCommand({
      TableName: "IdentityAndAccess",
      Key: { entityId: `USER#${uid}`, sk: "USER#META" }
    }));
    if (res.Item) {
      const email = res.Item.email ?? res.Item.authorEmail ?? null;
      if (email) return email;
    }
  } catch (err) {
    console.warn(`${TAG} resolveEmailForUid DynamoDB check user notice:`, err);
  }

  // 2. users collection (canonical — same as resolveUser in route handlers)
  try {
    const snap = await db.collection("users").doc(uid).get();
    if (snap.exists) {
      const d = snap.data()!;
      const email = d.email ?? d.authorEmail ?? null;
      console.log(`${TAG} resolveEmailForUid(${uid}) via users/: email=${email}`);
      if (email) return email;
    }
  } catch (err) {
    console.error(`${TAG} resolveEmailForUid users/ ERROR:`, err);
  }

  // 3. roarProfiles fallback
  try {
    const snap = await db.collection("roarProfiles").doc(uid).get();
    if (snap.exists) {
      const d = snap.data()!;
      const email = d.email ?? d.authorEmail ?? null;
      console.log(`${TAG} resolveEmailForUid(${uid}) via roarProfiles/: email=${email}`);
      if (email) return email;
    }
  } catch (err) {
    console.error(`${TAG} resolveEmailForUid roarProfiles/ ERROR:`, err);
  }

  console.error(`${TAG} resolveEmailForUid(${uid}): FAILED — email not found in any collection`);
  return null;
}

async function resolveActorName(userId: string): Promise<string> {
  if (!userId) return "A fan";

  // 1. Try DynamoDB first
  try {
    const res = await docClient.send(new GetCommand({
      TableName: "IdentityAndAccess",
      Key: { entityId: `USER#${userId}`, sk: "USER#META" }
    }));
    if (res.Item) {
      const name = res.Item.username ?? res.Item.name ?? null;
      if (name) return name;
    }
  } catch (err) {
    console.warn(`${TAG} resolveActorName DynamoDB check notice:`, err);
  }

  // 2. users collection fallback
  try {
    const snap = await db.collection("users").doc(userId).get();
    if (snap.exists) {
      const d = snap.data()!;
      const name = d.username ?? d.name ?? null;
      console.log(`${TAG} resolveActorName(${userId}) via users/: name=${name}`);
      if (name) return name;
    }
  } catch (err) {
    console.error(`${TAG} resolveActorName users/ ERROR:`, err);
  }

  // 3. roarProfiles fallback
  try {
    const snap = await db.collection("roarProfiles").doc(userId).get();
    if (snap.exists) {
      const d = snap.data()!;
      const name = d.username ?? d.name ?? null;
      console.log(`${TAG} resolveActorName(${userId}) via roarProfiles/: name=${name}`);
      if (name) return name;
    }
  } catch (err) {
    console.error(`${TAG} resolveActorName roarProfiles/ ERROR:`, err);
  }

  console.warn(`${TAG} resolveActorName(${userId}): fell back to "A fan"`);
  return "A fan";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function notifyPostReaction(
  postId: string,
  actorUserId: string,
  reaction: string
): Promise<void> {
  console.log(`${TAG} notifyPostReaction called | postId=${postId} actorUserId=${actorUserId} reaction=${reaction}`);
  try {
    const post = await getPostMeta(postId);
    if (!post || !post.authorUserId) {
      console.warn(`${TAG} notifyPostReaction: aborting — no post meta or authorUserId`);
      return;
    }
    if (post.authorUserId === actorUserId) {
      console.log(`${TAG} notifyPostReaction: self-reaction, skipping`);
      return;
    }

    const recipientEmail =
      post.authorEmail ?? (await resolveEmailForUid(post.authorUserId));
    if (!recipientEmail) {
      console.error(`${TAG} notifyPostReaction: ABORTING — could not resolve recipientEmail for uid=${post.authorUserId}`);
      return;
    }

    const actorName = await resolveActorName(actorUserId);
    const now = Date.now();

    // 1. Try querying/fetching rollup from DynamoDB first
    let existingDoc: any = null;
    let existingId: string | null = null;
    let found = false;

    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        IndexName: "participantId-updatedAt-index",
        KeyConditionExpression: "participantId = :p",
        FilterExpression: "#type = :t AND postId = :postId",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":p": recipientEmail,
          ":t": "roar_post_like",
          ":postId": postId
        },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        existingDoc = qRes.Items[0];
        existingId = (existingDoc.sk as string).split("#")[1];
        found = true;
      }
    } catch (dynErr) {
      console.warn(`${TAG} notifyPostReaction DynamoDB query error:`, dynErr);
    }

    // 2. Fallback to Firestore
    if (!found) {
      const existing = await db.collection("notifications")
        .where("type", "==", "roar_post_like")
        .where("postId", "==", postId)
        .where("recipientEmail", "==", recipientEmail)
        .limit(1)
        .get();

      if (!existing.empty) {
        existingDoc = existing.docs[0].data();
        existingId = existing.docs[0].id;
        found = true;
      }
    }

    if (found && existingDoc && existingId) {
      const prevNames: string[] = existingDoc.likerNames ?? [];
      const updatedNames = [actorName, ...prevNames.filter((n) => n !== actorName)].slice(0, 3);
      const likerCount = (existingDoc.likerCount ?? 1) + 1;

      const updatedData = {
        ...existingDoc,
        likerNames: updatedNames,
        likerCount,
        message: buildLikeMessage(updatedNames, likerCount),
        isRead: false,
        updatedAt: now,
      };

      const dynamoItem = {
        roomId: "ROOM#NOTIFICATION",
        sk: `NOTIFICATION#${existingId}#${existingDoc.createdAt ?? now}`,
        participantId: post.authorUserId || recipientEmail,
        ...updatedData
      };

      await dualWrite("notifications", existingId, "RealTimeChat", dynamoItem);
      console.log(`${TAG} notifyPostReaction: rolled up existing doc ${existingId}`);
    } else {
      const notifId = uuidv4();
      const payload = {
        type: "roar_post_like",
        recipientEmail,
        recipientUid: post.authorUserId,
        postId,
        postPreview: post.text || "your ROAR post",
        likerNames: [actorName],
        likerCount: 1,
        message: buildLikeMessage([actorName], 1),
        isRead: false,
        createdAt: now,
        updatedAt: now,
      };

      const dynamoItem = {
        roomId: "ROOM#NOTIFICATION",
        sk: `NOTIFICATION#${notifId}#${now}`,
        participantId: post.authorUserId || recipientEmail,
        ...payload
      };

      await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
      console.log(`${TAG} notifyPostReaction: created new doc ${notifId}`);
    }
  } catch (err) {
    console.error(`${TAG} notifyPostReaction ERROR:`, err);
  }
}

export async function notifyPostComment(
  postId: string,
  actorUserId: string,
  actorEmail: string,
  commenterUsername: string,
  commentPreview?: string
): Promise<void> {
  console.log(`${TAG} notifyPostComment called | postId=${postId} actorUserId=${actorUserId} actorEmail=${actorEmail}`);
  try {
    const post = await getPostMeta(postId);
    if (!post || !post.authorUserId) {
      console.warn(`${TAG} notifyPostComment: aborting — no post meta`);
      return;
    }
    if (post.authorUserId === actorUserId) {
      console.log(`${TAG} notifyPostComment: self-comment, skipping`);
      return;
    }
    if (post.authorEmail && post.authorEmail === actorEmail) {
      console.log(`${TAG} notifyPostComment: same email, skipping`);
      return;
    }

    const recipientEmail =
      post.authorEmail ?? (await resolveEmailForUid(post.authorUserId));
    if (!recipientEmail) {
      console.error(`${TAG} notifyPostComment: ABORTING — could not resolve recipientEmail for uid=${post.authorUserId}`);
      return;
    }

    const now = Date.now();
    const message = commentPreview
      ? `${commenterUsername} commented on your post: "${commentPreview.slice(0, 60)}"`
      : `${commenterUsername} commented on your ROAR post`;

    const notifId = uuidv4();
    const payload = {
      type: "roar_post_comment",
      recipientEmail,
      recipientUid: post.authorUserId,
      postId,
      postPreview: post.text || "your ROAR post",
      commenterUsername,
      message,
      isRead: false,
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      roomId: "ROOM#NOTIFICATION",
      sk: `NOTIFICATION#${notifId}#${now}`,
      participantId: post.authorUserId || recipientEmail,
      ...payload
    };

    await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
    console.log(`${TAG} notifyPostComment: created doc ${notifId}`);
  } catch (err) {
    console.error(`${TAG} notifyPostComment ERROR:`, err);
  }
}

export async function notifyRoomMessageReaction(
  roomId: string,
  msgId: string,
  actorUserId: string,
  reaction: string
): Promise<void> {
  console.log(`${TAG} notifyRoomMessageReaction called | roomId=${roomId} msgId=${msgId} actorUserId=${actorUserId} reaction=${reaction}`);
  try {
    const [msg, actorName] = await Promise.all([
      getRoomMessageMeta(roomId, msgId),
      resolveActorName(actorUserId),
    ]);

    if (!msg) {
      console.warn(`${TAG} notifyRoomMessageReaction: aborting — message not found`);
      return;
    }

    const recipientUid = msg.authorUid;
    console.log(`${TAG} notifyRoomMessageReaction: recipientUid=${recipientUid} actorUserId=${actorUserId}`);

    if (!recipientUid) {
      console.warn(`${TAG} notifyRoomMessageReaction: aborting — message has no authorUid`);
      return;
    }

    if (recipientUid === actorUserId) {
      console.log(`${TAG} notifyRoomMessageReaction: self-reaction, skipping`);
      return;
    }

    const recipientEmail =
      msg.authorEmail ?? (await resolveEmailForUid(recipientUid));

    console.log(`${TAG} notifyRoomMessageReaction: recipientUid=${recipientUid} recipientEmail=${recipientEmail}`);

    if (!recipientEmail) {
      console.error(`${TAG} notifyRoomMessageReaction: ABORTING — no email for uid=${recipientUid}`);
      return;
    }

    const now = Date.now();
    const notifId = `reaction_${msgId}`;

    let existingDoc: any = null;
    let found = false;

    // 1. Try querying DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": "ROOM#NOTIFICATION",
          ":p": `NOTIFICATION#${notifId}#`
        },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        existingDoc = qRes.Items[0];
        found = true;
      }
    } catch (dynErr) {
      console.warn(`${TAG} notifyRoomMessageReaction DynamoDB query failed:`, dynErr);
    }

    // 2. Fallback to Firestore
    if (!found) {
      const existing = await db.collection("notifications").doc(notifId).get();
      if (existing.exists) {
        existingDoc = existing.data();
        found = true;
      }
    }

    if (found && existingDoc) {
      const prevNames: string[] = existingDoc.likerNames ?? [];
      const updatedNames = [actorName, ...prevNames.filter((n) => n !== actorName)].slice(0, 3);
      const likerCount = (existingDoc.likerCount ?? 1) + 1;

      const updatedData = {
        ...existingDoc,
        likerNames: updatedNames,
        likerCount,
        message: buildLikeMessage(updatedNames, likerCount),
        isRead: false,
        updatedAt: now,
        ...(recipientEmail ? { recipientEmail } : {}),
      };

      const dynamoItem = {
        roomId: "ROOM#NOTIFICATION",
        sk: `NOTIFICATION#${notifId}#${existingDoc.createdAt ?? now}`,
        participantId: recipientUid || recipientEmail,
        ...updatedData
      };

      await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
      console.log(`${TAG} notifyRoomMessageReaction: rolled up doc ${notifId}. likerCount=${likerCount}`);
    } else {
      const payload = {
        type: "roar_post_like",
        reaction,
        postId: msgId,
        roomId,
        actorUserId,
        actorUsername: actorName,
        recipientUid,
        recipientEmail: recipientEmail ?? null,
        postPreview: msg.text?.slice(0, 80) ?? "",
        likerNames: [actorName],
        likerCount: 1,
        message: buildLikeMessage([actorName], 1),
        isRead: false,
        createdAt: now,
        updatedAt: now,
      };

      const dynamoItem = {
        ...payload,
        roomId: "ROOM#NOTIFICATION",
        sk: `NOTIFICATION#${notifId}#${now}`,
        participantId: recipientUid || recipientEmail,
      };

      await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
      console.log(`${TAG} notifyRoomMessageReaction: created new doc ${notifId} with recipientUid=${recipientUid} recipientEmail=${recipientEmail}`);
    }
  } catch (err) {
    console.error(`${TAG} notifyRoomMessageReaction ERROR:`, err);
  }
}

export async function notifyRoomMessageComment(
  roomId: string,
  msgId: string,
  actorUserId: string,
  actorEmail: string,
  commenterUsername: string,
  commentPreview?: string
): Promise<void> {
  console.log(`${TAG} notifyRoomMessageComment called | roomId=${roomId} msgId=${msgId} actorUserId=${actorUserId} actorEmail=${actorEmail}`);
  try {
    const msg = await getRoomMessageMeta(roomId, msgId);
    if (!msg) {
      console.warn(`${TAG} notifyRoomMessageComment: aborting — message not found`);
      return;
    }

    const recipientUid = msg.authorUid;
    console.log(`${TAG} notifyRoomMessageComment: recipientUid=${recipientUid} actorUserId=${actorUserId}`);

    if (!recipientUid) {
      console.warn(`${TAG} notifyRoomMessageComment: aborting — message has no authorUid`);
      return;
    }

    if (recipientUid === actorUserId) {
      console.log(`${TAG} notifyRoomMessageComment: self-comment, skipping`);
      return;
    }

     const recipientEmail =
      msg.authorEmail ?? (await resolveEmailForUid(recipientUid));

    console.log(`${TAG} notifyRoomMessageComment: recipientEmail=${recipientEmail}`);

    if (recipientEmail && recipientEmail === actorEmail) {
      console.log(`${TAG} notifyRoomMessageComment: same email as actor, skipping`);
      return;
    }

    if (!recipientEmail) {
      console.error(`${TAG} notifyRoomMessageComment: ABORTING — no email for uid=${recipientUid}`);
      return;
    }

    const now = Date.now();
    const notifId = uuidv4();
    const payload = {
      type: "roar_post_comment",
      postId: msgId,
      roomId,
      actorUserId,
      actorEmail,
      actorUsername: commenterUsername,
      commenterUsername,
      recipientUid,
      recipientEmail: recipientEmail ?? null,
      postPreview: msg.text?.slice(0, 80) ?? "",
      message: commentPreview
        ? `${commenterUsername} commented: "${commentPreview.slice(0, 60)}"`
        : `${commenterUsername} commented on your post`,
      commentPreview: commentPreview?.slice(0, 100) ?? null,
      createdAt: now,
      updatedAt: now,
      isRead: false,
    };

    const dynamoItem = {
      ...payload,
      roomId: "ROOM#NOTIFICATION",
      sk: `NOTIFICATION#${notifId}#${now}`,
      participantId: recipientUid || recipientEmail,
    };

    await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
    console.log(`${TAG} notifyRoomMessageComment: created doc ${notifId} with recipientUid=${recipientUid} recipientEmail=${recipientEmail}`);
  } catch (err) {
    console.error(`${TAG} notifyRoomMessageComment ERROR:`, err);
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function buildLikeMessage(names: string[], total: number): string {
  if (total === 1) return `${names[0]} reacted to your ROAR post`;
  if (total === 2) return `${names[0]} and ${names[1] ?? "1 other"} reacted to your ROAR post`;
  const others = total - 1;
  return `${names[0]} and ${others} other${others === 1 ? "" : "s"} reacted to your ROAR post`;
}