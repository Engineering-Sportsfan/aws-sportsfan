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





// // lib/roarNotifyHelpers.ts  ← REPLACE ENTIRE FILE WITH THIS DEBUG VERSION
// // Remove the [DEBUG] logs once the issue is found.

// import { db } from "@/lib/firebaseAdmin";
// import { docClient } from "@/lib/dynamodb";
// import { dualWrite } from "@/lib/dualWrite";
// import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
// import { v4 as uuidv4 } from "uuid";

// const TAG = "[roarNotify]";

// // ─── Internal helpers ─────────────────────────────────────────────────────────

// async function getPostMeta(postId: string): Promise<{
//   authorUserId: string;
//   authorEmail: string | null;
//   text: string;
// } | null> {
//   try {
//     let data: any = null;
//     let found = false;

//     // 1. Try DynamoDB
//     try {
//       const res = await docClient.send(new QueryCommand({
//         TableName: "SocialAndContent",
//         KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
//         ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" }
//       }));
//       if (res.Items && res.Items.length > 0) {
//         data = res.Items[0];
//         found = true;
//       }
//     } catch (err) {
//       console.warn(`${TAG} getPostMeta DynamoDB lookup notice:`, err);
//     }

//     // 2. Fallback to Firestore
//     if (!found) {
//       const snap = await db.collection("roarPosts").doc(postId).get();
//       if (snap.exists) {
//         data = snap.data()!;
//         found = true;
//       }
//     }

//     if (!found || !data) {
//       console.warn(`${TAG} getPostMeta: doc roarPosts/${postId} does NOT exist`);
//       return null;
//     }

//     const result = {
//       authorUserId: data.authorUid ?? data.userId ?? data.authorUserId ?? "",
//       authorEmail: data.authorEmail ?? data.email ?? null,
//       text: (data.text ?? data.quizQuestion ?? "").slice(0, 120),
//     };
//     console.log(`${TAG} getPostMeta(${postId}):`, JSON.stringify(result));
//     return result;
//   } catch (err) {
//     console.error(`${TAG} getPostMeta ERROR:`, err);
//     return null;
//   }
// }

// async function getRoomMessageMeta(roomId: string, msgId: string): Promise<{
//   authorUid: string;
//    authorEmail: string | null;
//   text: string;
// } | null> {
//   try {
//     let data: any = null;
//     let found = false;

//     // 1. Try DynamoDB
//     try {
//       const res = await docClient.send(new QueryCommand({
//         TableName: "RealTimeChat",
//         KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
//         ExpressionAttributeValues: {
//           ":r": `ROOM#${roomId}`,
//           ":p": `MSG#${roomId}#`
//         }
//       }));
//       if (res.Items && res.Items.length > 0) {
//         const match = res.Items.find(item => item.chatId === msgId || item.id === msgId || (item.sk as string).endsWith(msgId));
//         if (match) {
//           data = match;
//           found = true;
//         }
//       }
//     } catch (err) {
//       console.warn(`${TAG} getRoomMessageMeta DynamoDB lookup notice:`, err);
//     }

//     // 2. Fallback to Firestore
//     if (!found) {
//       const snap = await db
//         .collection("roarRooms").doc(roomId)
//         .collection("messages").doc(msgId)
//         .get();
//       if (snap.exists) {
//         data = snap.data()!;
//         found = true;
//       }
//     }

//     if (!found || !data) {
//       console.warn(`${TAG} getRoomMessageMeta: doc roarRooms/${roomId}/messages/${msgId} does NOT exist`);
//       return null;
//     }

//     const result = {
//       authorUid: data.authorUid ?? "",
//       authorEmail: data.authorEmail ?? null,
//       text: (data.text ?? "").slice(0, 120),
//     };
//     console.log(`${TAG} getRoomMessageMeta(${roomId}/${msgId}):`, JSON.stringify(result));
//     return result;
//   } catch (err) {
//     console.error(`${TAG} getRoomMessageMeta ERROR:`, err);
//     return null;
//   }
// }

// /**
//  * Resolve email for a UID.
//  * Checks users/{uid} first (canonical), then roarProfiles/{uid} as fallback.
//  */
// async function resolveEmailForUid(uid: string): Promise<string | null> {
//   if (!uid) {
//     console.warn(`${TAG} resolveEmailForUid: called with empty uid`);
//     return null;
//   }

//   // 1. Try DynamoDB first
//   try {
//     const res = await docClient.send(new GetCommand({
//       TableName: "IdentityAndAccess",
//       Key: { entityId: `USER#${uid}`, sk: "USER#META" }
//     }));
//     if (res.Item) {
//       const email = res.Item.email ?? res.Item.authorEmail ?? null;
//       if (email) return email;
//     }
//   } catch (err) {
//     console.warn(`${TAG} resolveEmailForUid DynamoDB check user notice:`, err);
//   }

//   // 2. users collection (canonical — same as resolveUser in route handlers)
//   try {
//     const snap = await db.collection("users").doc(uid).get();
//     if (snap.exists) {
//       const d = snap.data()!;
//       const email = d.email ?? d.authorEmail ?? null;
//       console.log(`${TAG} resolveEmailForUid(${uid}) via users/: email=${email}`);
//       if (email) return email;
//     }
//   } catch (err) {
//     console.error(`${TAG} resolveEmailForUid users/ ERROR:`, err);
//   }

//   // 3. roarProfiles fallback
//   try {
//     const snap = await db.collection("roarProfiles").doc(uid).get();
//     if (snap.exists) {
//       const d = snap.data()!;
//       const email = d.email ?? d.authorEmail ?? null;
//       console.log(`${TAG} resolveEmailForUid(${uid}) via roarProfiles/: email=${email}`);
//       if (email) return email;
//     }
//   } catch (err) {
//     console.error(`${TAG} resolveEmailForUid roarProfiles/ ERROR:`, err);
//   }

//   console.error(`${TAG} resolveEmailForUid(${uid}): FAILED — email not found in any collection`);
//   return null;
// }

// async function resolveActorName(userId: string): Promise<string> {
//   if (!userId) return "A fan";

//   // 1. Try DynamoDB first
//   try {
//     const res = await docClient.send(new GetCommand({
//       TableName: "IdentityAndAccess",
//       Key: { entityId: `USER#${userId}`, sk: "USER#META" }
//     }));
//     if (res.Item) {
//       const name = res.Item.username ?? res.Item.name ?? null;
//       if (name) return name;
//     }
//   } catch (err) {
//     console.warn(`${TAG} resolveActorName DynamoDB check notice:`, err);
//   }

//   // 2. users collection fallback
//   try {
//     const snap = await db.collection("users").doc(userId).get();
//     if (snap.exists) {
//       const d = snap.data()!;
//       const name = d.username ?? d.name ?? null;
//       console.log(`${TAG} resolveActorName(${userId}) via users/: name=${name}`);
//       if (name) return name;
//     }
//   } catch (err) {
//     console.error(`${TAG} resolveActorName users/ ERROR:`, err);
//   }

//   // 3. roarProfiles fallback
//   try {
//     const snap = await db.collection("roarProfiles").doc(userId).get();
//     if (snap.exists) {
//       const d = snap.data()!;
//       const name = d.username ?? d.name ?? null;
//       console.log(`${TAG} resolveActorName(${userId}) via roarProfiles/: name=${name}`);
//       if (name) return name;
//     }
//   } catch (err) {
//     console.error(`${TAG} resolveActorName roarProfiles/ ERROR:`, err);
//   }

//   console.warn(`${TAG} resolveActorName(${userId}): fell back to "A fan"`);
//   return "A fan";
// }

// // ─── Public API ───────────────────────────────────────────────────────────────

// export async function notifyPostReaction(
//   postId: string,
//   actorUserId: string,
//   reaction: string
// ): Promise<void> {
//   console.log(`${TAG} notifyPostReaction called | postId=${postId} actorUserId=${actorUserId} reaction=${reaction}`);
//   try {
//     const post = await getPostMeta(postId);
//     if (!post || !post.authorUserId) {
//       console.warn(`${TAG} notifyPostReaction: aborting — no post meta or authorUserId`);
//       return;
//     }
//     if (post.authorUserId === actorUserId) {
//       console.log(`${TAG} notifyPostReaction: self-reaction, skipping`);
//       return;
//     }

//     const recipientEmail =
//       post.authorEmail ?? (await resolveEmailForUid(post.authorUserId));
//     if (!recipientEmail) {
//       console.error(`${TAG} notifyPostReaction: ABORTING — could not resolve recipientEmail for uid=${post.authorUserId}`);
//       return;
//     }

//     const actorName = await resolveActorName(actorUserId);
//     const now = Date.now();

//     // 1. Try querying/fetching rollup from DynamoDB first
//     let existingDoc: any = null;
//     let existingId: string | null = null;
//     let found = false;

//     try {
//       const qRes = await docClient.send(new QueryCommand({
//         TableName: "RealTimeChat",
//         IndexName: "participantId-updatedAt-index",
//         KeyConditionExpression: "participantId = :p",
//         FilterExpression: "#type = :t AND postId = :postId",
//         ExpressionAttributeNames: { "#type": "type" },
//         ExpressionAttributeValues: {
//           ":p": recipientEmail,
//           ":t": "roar_post_like",
//           ":postId": postId
//         },
//         Limit: 1
//       }));
//       if (qRes.Items && qRes.Items.length > 0) {
//         existingDoc = qRes.Items[0];
//         existingId = (existingDoc.sk as string).split("#")[1];
//         found = true;
//       }
//     } catch (dynErr) {
//       console.warn(`${TAG} notifyPostReaction DynamoDB query error:`, dynErr);
//     }

//     // 2. Fallback to Firestore
//     if (!found) {
//       const existing = await db.collection("notifications")
//         .where("type", "==", "roar_post_like")
//         .where("postId", "==", postId)
//         .where("recipientEmail", "==", recipientEmail)
//         .limit(1)
//         .get();

//       if (!existing.empty) {
//         existingDoc = existing.docs[0].data();
//         existingId = existing.docs[0].id;
//         found = true;
//       }
//     }

//     if (found && existingDoc && existingId) {
//       const prevNames: string[] = existingDoc.likerNames ?? [];
//       const updatedNames = [actorName, ...prevNames.filter((n) => n !== actorName)].slice(0, 3);
//       const likerCount = (existingDoc.likerCount ?? 1) + 1;

//       const updatedData = {
//         ...existingDoc,
//         likerNames: updatedNames,
//         likerCount,
//         message: buildLikeMessage(updatedNames, likerCount),
//         isRead: false,
//         updatedAt: now,
//       };

//       const dynamoItem = {
//         roomId: "ROOM#NOTIFICATION",
//         sk: `NOTIFICATION#${existingId}#${existingDoc.createdAt ?? now}`,
//         participantId: post.authorUserId || recipientEmail,
//         ...updatedData
//       };

//       await dualWrite("notifications", existingId, "RealTimeChat", dynamoItem);
//       console.log(`${TAG} notifyPostReaction: rolled up existing doc ${existingId}`);
//     } else {
//       const notifId = uuidv4();
//       const payload = {
//         type: "roar_post_like",
//         recipientEmail,
//         recipientUid: post.authorUserId,
//         postId,
//         postPreview: post.text || "your ROAR post",
//         likerNames: [actorName],
//         likerCount: 1,
//         message: buildLikeMessage([actorName], 1),
//         isRead: false,
//         createdAt: now,
//         updatedAt: now,
//       };

//       const dynamoItem = {
//         roomId: "ROOM#NOTIFICATION",
//         sk: `NOTIFICATION#${notifId}#${now}`,
//         participantId: post.authorUserId || recipientEmail,
//         ...payload
//       };

//       await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
//       console.log(`${TAG} notifyPostReaction: created new doc ${notifId}`);
//     }
//   } catch (err) {
//     console.error(`${TAG} notifyPostReaction ERROR:`, err);
//   }
// }

// export async function notifyPostComment(
//   postId: string,
//   actorUserId: string,
//   actorEmail: string,
//   commenterUsername: string,
//   commentPreview?: string
// ): Promise<void> {
//   console.log(`${TAG} notifyPostComment called | postId=${postId} actorUserId=${actorUserId} actorEmail=${actorEmail}`);
//   try {
//     const post = await getPostMeta(postId);
//     if (!post || !post.authorUserId) {
//       console.warn(`${TAG} notifyPostComment: aborting — no post meta`);
//       return;
//     }
//     if (post.authorUserId === actorUserId) {
//       console.log(`${TAG} notifyPostComment: self-comment, skipping`);
//       return;
//     }
//     if (post.authorEmail && post.authorEmail === actorEmail) {
//       console.log(`${TAG} notifyPostComment: same email, skipping`);
//       return;
//     }

//     const recipientEmail =
//       post.authorEmail ?? (await resolveEmailForUid(post.authorUserId));
//     if (!recipientEmail) {
//       console.error(`${TAG} notifyPostComment: ABORTING — could not resolve recipientEmail for uid=${post.authorUserId}`);
//       return;
//     }

//     const now = Date.now();
//     const message = commentPreview
//       ? `${commenterUsername} commented on your post: "${commentPreview.slice(0, 60)}"`
//       : `${commenterUsername} commented on your ROAR post`;

//     const notifId = uuidv4();
//     const payload = {
//       type: "roar_post_comment",
//       recipientEmail,
//       recipientUid: post.authorUserId,
//       postId,
//       postPreview: post.text || "your ROAR post",
//       commenterUsername,
//       message,
//       isRead: false,
//       createdAt: now,
//       updatedAt: now,
//     };

//     const dynamoItem = {
//       roomId: "ROOM#NOTIFICATION",
//       sk: `NOTIFICATION#${notifId}#${now}`,
//       participantId: post.authorUserId || recipientEmail,
//       ...payload
//     };

//     await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
//     console.log(`${TAG} notifyPostComment: created doc ${notifId}`);
//   } catch (err) {
//     console.error(`${TAG} notifyPostComment ERROR:`, err);
//   }
// }

// export async function notifyRoomMessageReaction(
//   roomId: string,
//   msgId: string,
//   actorUserId: string,
//   reaction: string
// ): Promise<void> {
//   console.log(`${TAG} notifyRoomMessageReaction called | roomId=${roomId} msgId=${msgId} actorUserId=${actorUserId} reaction=${reaction}`);
//   try {
//     const [msg, actorName] = await Promise.all([
//       getRoomMessageMeta(roomId, msgId),
//       resolveActorName(actorUserId),
//     ]);

//     if (!msg) {
//       console.warn(`${TAG} notifyRoomMessageReaction: aborting — message not found`);
//       return;
//     }

//     const recipientUid = msg.authorUid;
//     console.log(`${TAG} notifyRoomMessageReaction: recipientUid=${recipientUid} actorUserId=${actorUserId}`);

//     if (!recipientUid) {
//       console.warn(`${TAG} notifyRoomMessageReaction: aborting — message has no authorUid`);
//       return;
//     }

//     if (recipientUid === actorUserId) {
//       console.log(`${TAG} notifyRoomMessageReaction: self-reaction, skipping`);
//       return;
//     }

//     const recipientEmail =
//       msg.authorEmail ?? (await resolveEmailForUid(recipientUid));

//     console.log(`${TAG} notifyRoomMessageReaction: recipientUid=${recipientUid} recipientEmail=${recipientEmail}`);

//     if (!recipientEmail) {
//       console.error(`${TAG} notifyRoomMessageReaction: ABORTING — no email for uid=${recipientUid}`);
//       return;
//     }

//     const now = Date.now();
//     const notifId = `reaction_${msgId}`;

//     let existingDoc: any = null;
//     let found = false;

//     // 1. Try querying DynamoDB first
//     try {
//       const qRes = await docClient.send(new QueryCommand({
//         TableName: "RealTimeChat",
//         KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
//         ExpressionAttributeValues: {
//           ":r": "ROOM#NOTIFICATION",
//           ":p": `NOTIFICATION#${notifId}#`
//         },
//         Limit: 1
//       }));
//       if (qRes.Items && qRes.Items.length > 0) {
//         existingDoc = qRes.Items[0];
//         found = true;
//       }
//     } catch (dynErr) {
//       console.warn(`${TAG} notifyRoomMessageReaction DynamoDB query failed:`, dynErr);
//     }

//     // 2. Fallback to Firestore
//     if (!found) {
//       const existing = await db.collection("notifications").doc(notifId).get();
//       if (existing.exists) {
//         existingDoc = existing.data();
//         found = true;
//       }
//     }

//     if (found && existingDoc) {
//       const prevNames: string[] = existingDoc.likerNames ?? [];
//       const updatedNames = [actorName, ...prevNames.filter((n) => n !== actorName)].slice(0, 3);
//       const likerCount = (existingDoc.likerCount ?? 1) + 1;

//       const updatedData = {
//         ...existingDoc,
//         likerNames: updatedNames,
//         likerCount,
//         message: buildLikeMessage(updatedNames, likerCount),
//         isRead: false,
//         updatedAt: now,
//         ...(recipientEmail ? { recipientEmail } : {}),
//       };

//       const dynamoItem = {
//         roomId: "ROOM#NOTIFICATION",
//         sk: `NOTIFICATION#${notifId}#${existingDoc.createdAt ?? now}`,
//         participantId: recipientUid || recipientEmail,
//         ...updatedData
//       };

//       await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
//       console.log(`${TAG} notifyRoomMessageReaction: rolled up doc ${notifId}. likerCount=${likerCount}`);
//     } else {
//       const payload = {
//         type: "roar_post_like",
//         reaction,
//         postId: msgId,
//         roomId,
//         actorUserId,
//         actorUsername: actorName,
//         recipientUid,
//         recipientEmail: recipientEmail ?? null,
//         postPreview: msg.text?.slice(0, 80) ?? "",
//         likerNames: [actorName],
//         likerCount: 1,
//         message: buildLikeMessage([actorName], 1),
//         isRead: false,
//         createdAt: now,
//         updatedAt: now,
//       };

//       const dynamoItem = {
//         ...payload,
//         roomId: "ROOM#NOTIFICATION",
//         sk: `NOTIFICATION#${notifId}#${now}`,
//         participantId: recipientUid || recipientEmail,
//       };

//       await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
//       console.log(`${TAG} notifyRoomMessageReaction: created new doc ${notifId} with recipientUid=${recipientUid} recipientEmail=${recipientEmail}`);
//     }
//   } catch (err) {
//     console.error(`${TAG} notifyRoomMessageReaction ERROR:`, err);
//   }
// }

// export async function notifyRoomMessageComment(
//   roomId: string,
//   msgId: string,
//   actorUserId: string,
//   actorEmail: string,
//   commenterUsername: string,
//   commentPreview?: string
// ): Promise<void> {
//   console.log(`${TAG} notifyRoomMessageComment called | roomId=${roomId} msgId=${msgId} actorUserId=${actorUserId} actorEmail=${actorEmail}`);
//   try {
//     const msg = await getRoomMessageMeta(roomId, msgId);
//     if (!msg) {
//       console.warn(`${TAG} notifyRoomMessageComment: aborting — message not found`);
//       return;
//     }

//     const recipientUid = msg.authorUid;
//     console.log(`${TAG} notifyRoomMessageComment: recipientUid=${recipientUid} actorUserId=${actorUserId}`);

//     if (!recipientUid) {
//       console.warn(`${TAG} notifyRoomMessageComment: aborting — message has no authorUid`);
//       return;
//     }

//     if (recipientUid === actorUserId) {
//       console.log(`${TAG} notifyRoomMessageComment: self-comment, skipping`);
//       return;
//     }

//      const recipientEmail =
//       msg.authorEmail ?? (await resolveEmailForUid(recipientUid));

//     console.log(`${TAG} notifyRoomMessageComment: recipientEmail=${recipientEmail}`);

//     if (recipientEmail && recipientEmail === actorEmail) {
//       console.log(`${TAG} notifyRoomMessageComment: same email as actor, skipping`);
//       return;
//     }

//     if (!recipientEmail) {
//       console.error(`${TAG} notifyRoomMessageComment: ABORTING — no email for uid=${recipientUid}`);
//       return;
//     }

//     const now = Date.now();
//     const notifId = uuidv4();
//     const payload = {
//       type: "roar_post_comment",
//       postId: msgId,
//       roomId,
//       actorUserId,
//       actorEmail,
//       actorUsername: commenterUsername,
//       commenterUsername,
//       recipientUid,
//       recipientEmail: recipientEmail ?? null,
//       postPreview: msg.text?.slice(0, 80) ?? "",
//       message: commentPreview
//         ? `${commenterUsername} commented: "${commentPreview.slice(0, 60)}"`
//         : `${commenterUsername} commented on your post`,
//       commentPreview: commentPreview?.slice(0, 100) ?? null,
//       createdAt: now,
//       updatedAt: now,
//       isRead: false,
//     };

//     const dynamoItem = {
//       ...payload,
//       roomId: "ROOM#NOTIFICATION",
//       sk: `NOTIFICATION#${notifId}#${now}`,
//       participantId: recipientUid || recipientEmail,
//     };

//     await dualWrite("notifications", notifId, "RealTimeChat", dynamoItem);
//     console.log(`${TAG} notifyRoomMessageComment: created doc ${notifId} with recipientUid=${recipientUid} recipientEmail=${recipientEmail}`);
//   } catch (err) {
//     console.error(`${TAG} notifyRoomMessageComment ERROR:`, err);
//   }
// }

// // ─── Formatters ───────────────────────────────────────────────────────────────

// function buildLikeMessage(names: string[], total: number): string {
//   if (total === 1) return `${names[0]} reacted to your ROAR post`;
//   if (total === 2) return `${names[0]} and ${names[1] ?? "1 other"} reacted to your ROAR post`;
//   const others = total - 1;
//   return `${names[0]} and ${others} other${others === 1 ? "" : "s"} reacted to your ROAR post`;
// }



// lib/roarNotifyHelpers.ts — DynamoDB-only (Firebase removed)

import { createNotification } from "@/lib/notifications";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const TAG = "[roarNotify]";

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getPostMeta(postId: string): Promise<{
  authorUserId: string;
  text: string;
} | null> {
  try {
    const res = await docClient.send(new QueryCommand({
      TableName: "SocialAndContent",
      KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
      ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" }
    }));
    if (!res.Items || res.Items.length === 0) {
      console.warn(`${TAG} getPostMeta: no item found for postId=${postId}`);
      return null;
    }
    const data = res.Items[0];
    const result = {
      authorUserId: data.authorUid ?? data.userId ?? data.authorUserId ?? "",
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
  text: string;
} | null> {
  try {
    const res = await docClient.send(new QueryCommand({
      TableName: "RealTimeChat",
      KeyConditionExpression: "roomId = :r AND sk = :s",
      ExpressionAttributeValues: {
        ":r": `ROOM#${roomId}`,
        ":s": `MSG#${msgId}`
      }
    }));
    if (!res.Items || res.Items.length === 0) {
      console.warn(`${TAG} getRoomMessageMeta: no match for roomId=${roomId} msgId=${msgId}`);
      return null;
    }
    const match = res.Items[0];
    const result = {
      authorUid: match.authorUid ?? "",
      text: (match.text ?? "").slice(0, 120),
    };
    console.log(`${TAG} getRoomMessageMeta(${roomId}/${msgId}):`, JSON.stringify(result));
    return result;
  } catch (err) {
    console.error(`${TAG} getRoomMessageMeta ERROR:`, err);
    return null;
  }
}

async function resolveActorName(userId: string): Promise<string> {
  if (!userId) return "A fan";
  try {
    const res = await docClient.send(new GetCommand({
      TableName: "IdentityAndAccess",
      Key: { entityId: `USER#${userId}`, sk: "USER#META" }
    }));
    const name = res.Item?.username ?? res.Item?.name ?? null;
    if (name) return name;
  } catch (err) {
    console.warn(`${TAG} resolveActorName DynamoDB notice:`, err);
  }
  console.warn(`${TAG} resolveActorName(${userId}): fell back to "A fan"`);
  return "A fan";
}

/**
 * Resolve a @username handle to a userId.
 * NOTE: assumes a GSI named "username-index" on IdentityAndAccess
 * (PK: username). Confirm this exists / adjust the IndexName if the
 * actual username lookup lives elsewhere (e.g. the table backing
 * GET /api/users).
 */
async function resolveUserIdByUsername(username: string): Promise<string | null> {
  try {
    const res = await docClient.send(new QueryCommand({
      TableName: "IdentityAndAccess",
      IndexName: "username-index",
      KeyConditionExpression: "username = :u",
      ExpressionAttributeValues: { ":u": username },
      Limit: 1,
    }));
    if (res.Items && res.Items.length > 0) {
      const entityId = res.Items[0].entityId as string; // e.g. "USER#abc123"
      return entityId?.replace(/^USER#/, "") ?? null;
    }
  } catch (err) {
    console.warn(`${TAG} resolveUserIdByUsername(${username}) notice:`, err);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 1. REPLY TO YOUR POST
// ─────────────────────────────────────────────────────────────
export async function notifyRoomMessageComment(
  roomId: string, msgId: string, actorUserId: string, actorEmail: string,
  commenterUsername: string, commentPreview?: string
): Promise<void> {
  try {
    const msg = await getRoomMessageMeta(roomId, msgId);
    if (!msg?.authorUid || msg.authorUid === actorUserId) return;

    await createNotification({
      userId: msg.authorUid,
      notification_type: "roar.post_reply",
      title: `${commenterUsername} replied to your post`,
      body: commentPreview ? `${commenterUsername}: "${commentPreview.slice(0, 80)}"` : `${commenterUsername} replied to your post`,
      cta_label: "View reply",
      cta_target: `sf360://roar/rooms/${roomId}?post=${msgId}`,
      priority: "NORMAL",
    });
  } catch (err) { console.error(`${TAG} notifyRoomMessageComment ERROR:`, err); }
}

// ─────────────────────────────────────────────────────────────
// 2. MENTIONED
// ─────────────────────────────────────────────────────────────
export async function notifyMentions(
  text: string, roomId: string, msgId: string,
  actorUserId: string, actorUsername: string
): Promise<void> {
  try {
    const mentionMatches = [...text.matchAll(/@(\w+)/g)].map(m => m[1]);
    if (mentionMatches.length === 0) return;
    const uniqueHandles = [...new Set(mentionMatches)];

    for (const handle of uniqueHandles) {
      try {
        const mentionedUserId = await resolveUserIdByUsername(handle);
        if (!mentionedUserId || mentionedUserId === actorUserId) continue;

        await createNotification({
          userId: mentionedUserId,
          notification_type: "roar.mention",
          title: `${actorUsername} mentioned you`,
          body: text.slice(0, 100),
          cta_label: "View post",
          cta_target: `sf360://roar/rooms/${roomId}?post=${msgId}`,
          priority: "NORMAL",
        });
      } catch (innerErr) {
        console.warn(`${TAG} notifyMentions: failed for @${handle}:`, innerErr);
      }
    }
  } catch (err) { console.error(`${TAG} notifyMentions ERROR:`, err); }
}

// ─────────────────────────────────────────────────────────────
// 3. REACTION ON YOUR POST
// ─────────────────────────────────────────────────────────────
export async function notifyRoomMessageReaction(
  roomId: string, msgId: string, actorUserId: string, reaction: string
): Promise<void> {
  try {
    const [msg, actorName] = await Promise.all([
      getRoomMessageMeta(roomId, msgId),
      resolveActorName(actorUserId),
    ]);
    if (!msg?.authorUid || msg.authorUid === actorUserId) return;

    await createNotification({
      userId: msg.authorUid,
      notification_type: "roar.post_reaction",
      title: `${actorName} reacted to your post`,
      body: msg.text ? `"${msg.text.slice(0, 80)}"` : "Someone reacted to your post",
      cta_label: "View post",
      cta_target: `sf360://roar/rooms/${roomId}?post=${msgId}`,
      priority: "LOW",
    });
  } catch (err) { console.error(`${TAG} notifyRoomMessageReaction ERROR:`, err); }
}

// ─────────────────────────────────────────────────────────────
// 4. NEW POST IN FOLLOWED ROOM — batched, 5-min quiet window
// ─────────────────────────────────────────────────────────────
const FOLLOWED_ROOM_QUIET_MS = 5 * 60 * 1000;

async function getRoomFollowers(roomId: string): Promise<string[]> {
  // PLACEHOLDER — plug in real lookup once follow schema is confirmed.
  return [];
}

export async function notifyFollowedRoomNewPost(
  roomId: string, roomName: string, posterUsername: string
): Promise<void> {
  try {
    const followers = await getRoomFollowers(roomId);
    if (followers.length === 0) return;
    const now = Date.now();

    for (const followerId of followers) {
      const debounceKey = `ROOM#${roomId}#FOLLOWER#${followerId}#LASTNOTIF`;
      let lastNotifiedAt = 0;
      try {
        const res = await docClient.send(new GetCommand({
          TableName: "sf360-notifications",
          Key: { PK: `USER#${followerId}`, SK: debounceKey },
        }));
        lastNotifiedAt = res.Item?.lastNotifiedAt ?? 0;
      } catch (e) { console.warn(`${TAG} notifyFollowedRoomNewPost debounce read notice:`, e); }

      if (now - lastNotifiedAt < FOLLOWED_ROOM_QUIET_MS) continue;

      await createNotification({
        userId: followerId,
        notification_type: "roar.followed_room_new_post",
        title: `New activity in ${roomName}`,
        body: `${posterUsername} just posted in a room you follow`,
        cta_label: "Open room",
        cta_target: `sf360://roar/rooms/${roomId}`,
        priority: "LOW",
      });

      try {
        await docClient.send(new PutCommand({
          TableName: "sf360-notifications",
          Item: { PK: `USER#${followerId}`, SK: debounceKey, lastNotifiedAt: now, expires_at: Math.floor(now / 1000) + 3600 },
        }));
      } catch (e) { console.warn(`${TAG} notifyFollowedRoomNewPost debounce write notice:`, e); }
    }
  } catch (err) { console.error(`${TAG} notifyFollowedRoomNewPost ERROR:`, err); }
}

// ─────────────────────────────────────────────────────────────
// 5. ROOM GOING LIVE
// ─────────────────────────────────────────────────────────────
export async function notifyRoomGoingLive(roomId: string, roomName: string): Promise<void> {
  try {
    const followers = await getRoomFollowers(roomId);
    await Promise.all(followers.map(userId =>
      createNotification({
        userId,
        notification_type: "roar.room_live",
        title: `${roomName} is live now!`,
        body: `Jump in — ${roomName} just went live`,
        cta_label: "Join room",
        cta_target: `sf360://roar/rooms/${roomId}`,
        priority: "HIGH",
      }).catch(e => console.warn(`${TAG} notifyRoomGoingLive per-user notice:`, e))
    ));
  } catch (err) { console.error(`${TAG} notifyRoomGoingLive ERROR:`, err); }
}

// ─────────────────────────────────────────────────────────────
// 6/8. NEW DEBATE / TRIVIA ANNOUNCED
// ─────────────────────────────────────────────────────────────
export async function notifyRoomContentAnnounced(
  roomId: string, roomName: string, kind: "debate" | "trivia", questionPreview: string
): Promise<void> {
  try {
    const followers = await getRoomFollowers(roomId);
    const label = kind === "debate" ? "New debate" : "New trivia";
    await Promise.all(followers.map(userId =>
      createNotification({
        userId,
        notification_type: `roar.${kind}_announced`,
        title: `${label} in ${roomName}`,
        body: questionPreview.slice(0, 100),
        cta_label: kind === "debate" ? "Vote now" : "Answer now",
        cta_target: `sf360://roar/rooms/${roomId}`,
        priority: "NORMAL",
      }).catch(e => console.warn(`${TAG} notifyRoomContentAnnounced per-user notice:`, e))
    ));
  } catch (err) { console.error(`${TAG} notifyRoomContentAnnounced ERROR:`, err); }
}

// ─────────────────────────────────────────────────────────────
// 7/9. DEBATE / TRIVIA CLOSING SOON — blocked on closesAt + scheduler
// ─────────────────────────────────────────────────────────────
export async function notifyRoomContentClosingSoon(
  roomId: string, roomName: string, msgId: string, kind: "debate" | "trivia"
): Promise<void> {
  try {
    const followers = await getRoomFollowers(roomId);
    const label = kind === "debate" ? "Debate" : "Trivia";
    await Promise.all(followers.map(userId =>
      createNotification({
        userId,
        notification_type: `roar.${kind}_closing_soon`,
        title: `${label} closing soon in ${roomName}`,
        body: `Last chance to join — closes in a couple minutes`,
        cta_label: "Join now",
        cta_target: `sf360://roar/rooms/${roomId}?post=${msgId}`,
        priority: "HIGH",
      }).catch(e => console.warn(`${TAG} notifyRoomContentClosingSoon per-user notice:`, e))
    ));
  } catch (err) { console.error(`${TAG} notifyRoomContentClosingSoon ERROR:`, err); }
}