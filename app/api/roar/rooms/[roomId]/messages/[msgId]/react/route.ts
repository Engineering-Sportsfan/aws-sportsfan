// // api/roar/rooms/[roomId]/messages/[msgId]/react/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { docClient } from "@/lib/dynamodb";
// import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// export const dynamic = "force-dynamic";

// async function resolveUserId(email: string, uid: string): Promise<string | null> {
//   const emailSnap = await db.collection("users").doc(email).get();
//   if (emailSnap.exists) return email;

//   const uidSnap = await db.collection("users").doc(uid).get();
//   if (uidSnap.exists) return uid;

//   return null;
// }

// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string; msgId: string }> | { roomId: string; msgId: string } }
// ) {
//   try {
//     const resolvedParams = await params;
//     const { roomId, msgId } = resolvedParams;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const body = await req.json();
//     const { reaction }: { reaction: "fire" | "noChance" | "heart" } = body;

//     if (reaction !== "fire" && reaction !== "noChance" && reaction !== "heart") {
//       return NextResponse.json(
//         { error: "reaction must be 'fire', 'noChance', or 'heart'" },
//         { status: 400 }
//       );
//     }

//     const resolvedUserId = await resolveUserId(user.email, user.userId);
//     if (!resolvedUserId) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }

//     const field =
//       reaction === "noChance" ? "noChanceCount" :
//       reaction === "heart"    ? "heartCount"    :
//       "fireCount";

//     // 1. Fetch Parent Room Message from DynamoDB first
//     let msgItem: any = null;
//     try {
//       const qRes = await docClient.send(new QueryCommand({
//         TableName: "RealTimeChat",
//         KeyConditionExpression: "roomId = :r AND begins_with(sk, :s)",
//         ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `MSG#${msgId}` },
//         Limit: 1
//       }));
//       if (qRes.Items && qRes.Items.length > 0) {
//         msgItem = qRes.Items[0];
//       }
//     } catch (dynErr) {
//       console.warn("[MessageReact] DynamoDB msg fetch failed:", dynErr);
//     }

//     // Fallback: Check Firestore
//     let msgExists = !!msgItem;
//     let fallbackData: any = null;
//     const msgRef = db.collection("roarRooms").doc(roomId).collection("messages").doc(msgId);

//     if (!msgExists) {
//       try {
//         const snap = await msgRef.get();
//         if (snap.exists) {
//           msgExists = true;
//           fallbackData = snap.data();
//         }
//       } catch (fsErr) {
//         console.warn("[MessageReact] Firestore message fetch failed:", fsErr);
//       }
//     }

//     if (!msgExists) {
//       return NextResponse.json({ error: "Message not found" }, { status: 404 });
//     }

//     const msgData = msgItem || fallbackData || {};

//     // 2. Check if already reacted in DynamoDB first
//     let alreadyReacted = false;
//     try {
//       const reactionRes = await docClient.send(new GetCommand({
//         TableName: "RealTimeChat",
//         Key: { roomId: `ROOM#${roomId}`, sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}` }
//       }));
//       alreadyReacted = !!reactionRes.Item;
//     } catch (dynErr) {
//       console.warn("[MessageReact] DynamoDB reaction check failed, checking Firestore:", dynErr);
//       try {
//         const reactionSnap = await msgRef.collection("reactions").doc(`${resolvedUserId}_${reaction}`).get();
//         alreadyReacted = reactionSnap.exists;
//       } catch (fsErr) {
//         console.warn("[MessageReact] Firestore reaction check failed:", fsErr);
//       }
//     }

//     const currentCount = msgData[field] ?? 0;
//     const reactionRef = msgRef.collection("reactions").doc(`${resolvedUserId}_${reaction}`);

//     if (reaction === "heart") {
//       let liked = false;
//       let finalCount = 0;

//       if (alreadyReacted) {
//         // Toggle off / UNLIKE
//         liked = false;
//         finalCount = Math.max(0, currentCount - 1);

//         // A. Update DynamoDB
//         try {
//           await docClient.send(new DeleteCommand({
//             TableName: "RealTimeChat",
//             Key: { roomId: `ROOM#${roomId}`, sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}` }
//           }));

//           if (msgItem) {
//             await docClient.send(new UpdateCommand({
//               TableName: "RealTimeChat",
//               Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
//               UpdateExpression: "SET heartCount = :hc, likeCount = :lc",
//               ExpressionAttributeValues: { ":hc": finalCount, ":lc": finalCount }
//             }));
//           }
//         } catch (dynErr) {
//           console.warn("[MessageReact] DynamoDB unlike failed:", dynErr);
//         }

//         // B. Update Firestore (Sync/Fallback)
//         try {
//           await db.runTransaction(async (tx) => {
//             tx.update(msgRef, { heartCount: FieldValue.increment(-1) });
//             tx.delete(reactionRef);
//           });
//         } catch (fsErr) {
//           console.warn("[MessageReact] Firestore unlike sync failed:", fsErr);
//         }
//       } else {
//         // Toggle on / LIKE
//         liked = true;
//         finalCount = currentCount + 1;

//         // A. Update DynamoDB
//         try {
//           await docClient.send(new PutCommand({
//             TableName: "RealTimeChat",
//             Item: {
//               roomId: `ROOM#${roomId}`,
//               sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}`,
//               reaction: reaction,
//               reactedAt: Date.now()
//             }
//           }));

//           if (msgItem) {
//             await docClient.send(new UpdateCommand({
//               TableName: "RealTimeChat",
//               Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
//               UpdateExpression: "SET heartCount = :hc, likeCount = :lc",
//               ExpressionAttributeValues: { ":hc": finalCount, ":lc": finalCount }
//             }));
//           }
//         } catch (dynErr) {
//           console.warn("[MessageReact] DynamoDB like failed:", dynErr);
//         }

//         // B. Update Firestore (Sync/Fallback)
//         try {
//           await db.runTransaction(async (tx) => {
//             tx.update(msgRef, { heartCount: FieldValue.increment(1) });
//             tx.set(reactionRef, { reaction, reactedAt: Date.now() });
//           });
//         } catch (fsErr) {
//           console.warn("[MessageReact] Firestore like sync failed:", fsErr);
//         }
//       }

//       return NextResponse.json({ success: true, liked, heartCount: finalCount });
//     }

//     // FIRE / NOCHANCE — one-way (no undo)
//     if (alreadyReacted) throw new Error("Already reacted");

//     const finalCount = currentCount + 1;

//     // A. Update DynamoDB
//     try {
//       await docClient.send(new PutCommand({
//         TableName: "RealTimeChat",
//         Item: {
//           roomId: `ROOM#${roomId}`,
//           sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}`,
//           reaction: reaction,
//           reactedAt: Date.now()
//         }
//       }));

//       if (msgItem) {
//         await docClient.send(new UpdateCommand({
//           TableName: "RealTimeChat",
//           Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
//           UpdateExpression: `SET ${field} = :fc`,
//           ExpressionAttributeValues: { ":fc": finalCount }
//         }));
//       }
//     } catch (dynErr) {
//       console.warn("[MessageReact] DynamoDB react failed:", dynErr);
//     }

//     // B. Update Firestore (Sync/Fallback)
//     try {
//       await db.runTransaction(async (tx) => {
//         tx.update(msgRef, { [field]: FieldValue.increment(1) });
//         tx.set(reactionRef, { reaction, reactedAt: Date.now() });
//       });
//     } catch (fsErr) {
//       console.warn("[MessageReact] Firestore react sync failed:", fsErr);
//     }

//     return NextResponse.json({ success: true, [field]: finalCount });

//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     if (msg === "Message not found") {
//       return NextResponse.json({ error: msg }, { status: 404 });
//     }
//     if (msg === "Already reacted") {
//       return NextResponse.json({ error: msg }, { status: 400 });
//     }
//     console.error("POST react error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// // api/roar/rooms/[roomId]/messages/[msgId]/react/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { getUser } from "@/lib/getUser";
// import { docClient } from "@/lib/dynamodb";
// import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
// import { notifyRoomMessageReaction } from "@/lib/roarNotifyHelpers";
// import { getUserInfo } from "@/lib/userPoints";

// export const dynamic = "force-dynamic";

// // async function resolveUserId(userId: string): Promise<string | null> {
// //   try {
// //     const res = await docClient.send(new GetCommand({
// //       TableName: "IdentityAndAccess",
// //       Key: { entityId: `USER#${userId}`, sk: "USER#META" }
// //     }));
// //     return res.Item ? userId : null;
// //   } catch {
// //     return null;
// //   }
// // }

// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string; msgId: string }> }
// ) {
//   try {
//     const { roomId, msgId } = await params;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const body = await req.json();
//     const { reaction }: { reaction: "fire" | "noChance" | "heart" } = body;
//     if (reaction !== "fire" && reaction !== "noChance" && reaction !== "heart") {
//       return NextResponse.json({ error: "reaction must be 'fire', 'noChance', or 'heart'" }, { status: 400 });
//     }

//     // const resolvedUserId = await resolveUserId(user.userId);
//     // if (!resolvedUserId) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

//     const info = await getUserInfo(user.userId, undefined, user.email);
//     const resolvedUserId = info.exists ? info.actualUserId : user.userId;
//     if (!resolvedUserId) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

//     const field = reaction === "noChance" ? "noChanceCount" : reaction === "heart" ? "heartCount" : "fireCount";

//     const qRes = await docClient.send(new QueryCommand({
//       TableName: "RealTimeChat",
//       KeyConditionExpression: "roomId = :r AND begins_with(sk, :s)",
//       ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `MSG#${msgId}` },
//       Limit: 1
//     }));
//     if (!qRes.Items || qRes.Items.length === 0) {
//       return NextResponse.json({ error: "Message not found" }, { status: 404 });
//     }
//     const msgItem = qRes.Items[0];
//     const currentCount = msgItem[field] ?? 0;

//     const reactionRes = await docClient.send(new GetCommand({
//       TableName: "RealTimeChat",
//       Key: { roomId: `ROOM#${roomId}`, sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}` }
//     }));
//     const alreadyReacted = !!reactionRes.Item;

//     if (reaction === "heart") {
//       let liked: boolean;
//       let finalCount: number;

//       if (alreadyReacted) {
//         liked = false;
//         finalCount = Math.max(0, currentCount - 1);
//         await docClient.send(new DeleteCommand({
//           TableName: "RealTimeChat",
//           Key: { roomId: `ROOM#${roomId}`, sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}` }
//         }));
//         await docClient.send(new UpdateCommand({
//           TableName: "RealTimeChat",
//           Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
//           UpdateExpression: "SET heartCount = :hc, likeCount = :lc",
//           ExpressionAttributeValues: { ":hc": finalCount, ":lc": finalCount }
//         }));
//       } else {
//         liked = true;
//         finalCount = currentCount + 1;
//         await docClient.send(new PutCommand({
//           TableName: "RealTimeChat",
//           Item: { roomId: `ROOM#${roomId}`, sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}`, reaction, reactedAt: Date.now() }
//         }));
//         await docClient.send(new UpdateCommand({
//           TableName: "RealTimeChat",
//           Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
//           UpdateExpression: "SET heartCount = :hc, likeCount = :lc",
//           ExpressionAttributeValues: { ":hc": finalCount, ":lc": finalCount }
//         }));
//         // only notify on add, never on unlike
//         notifyRoomMessageReaction(roomId, msgId, resolvedUserId, reaction).catch(() => { });
//       }

//       return NextResponse.json({ success: true, liked, heartCount: finalCount });
//     }

//     // FIRE / NOCHANCE — one-way (no undo)
//     if (alreadyReacted) throw new Error("Already reacted");

//     const finalCount = currentCount + 1;
//     await docClient.send(new PutCommand({
//       TableName: "RealTimeChat",
//       Item: { roomId: `ROOM#${roomId}`, sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}`, reaction, reactedAt: Date.now() }
//     }));
//     await docClient.send(new UpdateCommand({
//       TableName: "RealTimeChat",
//       Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
//       UpdateExpression: `SET ${field} = :fc`,
//       ExpressionAttributeValues: { ":fc": finalCount }
//     }));

//     notifyRoomMessageReaction(roomId, msgId, resolvedUserId, reaction).catch(() => { });

//     return NextResponse.json({ success: true, [field]: finalCount });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     if (msg === "Message not found") return NextResponse.json({ error: msg }, { status: 404 });
//     if (msg === "Already reacted") return NextResponse.json({ error: msg }, { status: 400 });
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// // api/roar/rooms/[roomId]/messages/[msgId]/react/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { getUser } from "@/lib/getUser";
// import { docClient } from "@/lib/dynamodb";
// import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
// import { notifyRoomMessageReaction } from "@/lib/roarNotifyHelpers";
// import { getUserInfo } from "@/lib/userPoints";

// export const dynamic = "force-dynamic";

// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string; msgId: string }> }
// ) {
//   try {
//     const { roomId, msgId } = await params;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const body = await req.json();
//     const { reaction }: { reaction: "fire" | "noChance" | "heart" } = body;
//     if (reaction !== "fire" && reaction !== "noChance" && reaction !== "heart") {
//       return NextResponse.json({ error: "reaction must be 'fire', 'noChance', or 'heart'" }, { status: 400 });
//     }

//     const info = await getUserInfo(user.userId, undefined, user.email);
//     const resolvedUserId = info.exists ? info.actualUserId : user.userId;
//     if (!resolvedUserId) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

//     const field = reaction === "noChance" ? "noChanceCount" : reaction === "heart" ? "heartCount" : "fireCount";

//     // ✅ FIXED: Use roomId in the prefix to match the actual SK format
//     const qRes = await docClient.send(new QueryCommand({
//       TableName: "RealTimeChat",
//       KeyConditionExpression: "roomId = :r AND begins_with(sk, :s)",
//       ExpressionAttributeValues: { 
//         ":r": `ROOM#${roomId}`, 
//         ":s": `MSG#${roomId}#${msgId}`  // ✅ Includes roomId
//       },
//       Limit: 1
//     }));
    
//     if (!qRes.Items || qRes.Items.length === 0) {
//       return NextResponse.json({ error: "Message not found" }, { status: 404 });
//     }
    
//     const msgItem = qRes.Items[0];
//     const currentCount = msgItem[field] ?? 0;

//     // Check if user already reacted
//     const reactionRes = await docClient.send(new GetCommand({
//       TableName: "RealTimeChat",
//       Key: { 
//         roomId: `ROOM#${roomId}`, 
//         sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}` 
//       }
//     }));
//     const alreadyReacted = !!reactionRes.Item;

//     // HEART REACTION (toggle on/off)
//     if (reaction === "heart") {
//       let liked: boolean;
//       let finalCount: number;

//       if (alreadyReacted) {
//         // Remove heart (unlike)
//         liked = false;
//         finalCount = Math.max(0, currentCount - 1);
        
//         await docClient.send(new DeleteCommand({
//           TableName: "RealTimeChat",
//           Key: { 
//             roomId: `ROOM#${roomId}`, 
//             sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}` 
//           }
//         }));
        
//         // ✅ Use the full SK from the query result
//         await docClient.send(new UpdateCommand({
//           TableName: "RealTimeChat",
//           Key: { 
//             roomId: `ROOM#${roomId}`, 
//             sk: msgItem.sk  // ✅ Use full SK
//           },
//           UpdateExpression: "SET heartCount = :hc",
//           ExpressionAttributeValues: { ":hc": finalCount }
//         }));
//       } else {
//         // Add heart (like)
//         liked = true;
//         finalCount = currentCount + 1;
        
//         await docClient.send(new PutCommand({
//           TableName: "RealTimeChat",
//           Item: { 
//             roomId: `ROOM#${roomId}`, 
//             sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}`, 
//             reaction, 
//             reactedAt: Date.now() 
//           }
//         }));
        
//         await docClient.send(new UpdateCommand({
//           TableName: "RealTimeChat",
//           Key: { 
//             roomId: `ROOM#${roomId}`, 
//             sk: msgItem.sk  // ✅ Use full SK
//           },
//           UpdateExpression: "SET heartCount = :hc",
//           ExpressionAttributeValues: { ":hc": finalCount }
//         }));
        
//         // Only notify on add, never on unlike
//         notifyRoomMessageReaction(roomId, msgId, resolvedUserId, reaction).catch(() => { });
//       }

//       return NextResponse.json({ success: true, liked, heartCount: finalCount });
//     }

//     // FIRE / NOCHANCE reactions (one-way, cannot undo)
//     if (alreadyReacted) {
//       return NextResponse.json({ 
//         error: "Already reacted", 
//         message: `You already reacted with ${reaction}` 
//       }, { status: 400 });
//     }

//     const finalCount = currentCount + 1;
    
//     await docClient.send(new PutCommand({
//       TableName: "RealTimeChat",
//       Item: { 
//         roomId: `ROOM#${roomId}`, 
//         sk: `LIKE#${msgId}#${resolvedUserId}#${reaction}`, 
//         reaction, 
//         reactedAt: Date.now() 
//       }
//     }));
    
//     await docClient.send(new UpdateCommand({
//       TableName: "RealTimeChat",
//       Key: { 
//         roomId: `ROOM#${roomId}`, 
//         sk: msgItem.sk  // ✅ Use full SK
//       },
//       UpdateExpression: `SET ${field} = :fc`,
//       ExpressionAttributeValues: { ":fc": finalCount }
//     }));

//     notifyRoomMessageReaction(roomId, msgId, resolvedUserId, reaction).catch(() => { });

//     return NextResponse.json({ success: true, [field]: finalCount });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     if (msg === "Message not found") return NextResponse.json({ error: msg }, { status: 404 });
//     if (msg === "Already reacted") return NextResponse.json({ error: msg }, { status: 400 });
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }



// api/roar/rooms/[roomId]/messages/[msgId]/react/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { notifyRoomMessageReaction } from "@/lib/roarNotifyHelpers";
import { getUserInfo } from "@/lib/userPoints";

export const dynamic = "force-dynamic";

type Reaction = "heart" | "fire" | "laugh" | "sad" | "thumb";
const VALID_REACTIONS: Reaction[] = ["heart", "fire", "laugh", "sad", "thumb"];

const COUNT_FIELD: Record<Reaction, string> = {
  heart: "heartCount",
  fire: "fireCount",
  laugh: "laughCount",
  sad: "sadCount",
  thumb: "thumbCount",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    // reaction: the reaction to set. Pass null to remove whatever reaction
    // the user currently has (no-op if they have none).
    const { reaction }: { reaction: Reaction | null } = body;
    if (reaction !== null && !VALID_REACTIONS.includes(reaction)) {
      return NextResponse.json(
        { error: `reaction must be one of ${VALID_REACTIONS.join(", ")}, or null` },
        { status: 400 }
      );
    }

    const info = await getUserInfo(user.userId, undefined, user.email);
    const resolvedUserId = info.exists ? info.actualUserId : user.userId;
    if (!resolvedUserId) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    // Find the message row.
    // const qRes = await docClient.send(new QueryCommand({
    //   TableName: "RealTimeChat",
    //   KeyConditionExpression: "roomId = :r AND begins_with(sk, :s)",
    //   ExpressionAttributeValues: {
    //     ":r": `ROOM#${roomId}`,
    //     ":s": `MSG#${roomId}#${msgId}`
    //   },
    //   Limit: 1
    // }));
    // if (!qRes.Items || qRes.Items.length === 0) {
    //   return NextResponse.json({ error: "Message not found" }, { status: 404 });
    // }
    // const msgItem = qRes.Items[0];

    const qRes = await docClient.send(new QueryCommand({
      TableName: "RealTimeChat",
      KeyConditionExpression: "roomId = :r AND begins_with(sk, :s)",
      ExpressionAttributeValues: {
        ":r": `ROOM#${roomId}`,
        ":s": `MSG#${roomId}#`
      },
    }));
    const msgItem = qRes.Items?.find((item) => item.msgId === msgId);
    if (!msgItem) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    
    // Find the user's current reaction (any type) on this message, since a
    // user can only have ONE active reaction at a time (switching replaces it).
    // We store one row per user per message: LIKE#{msgId}#{userId}, with the
    // reaction type as an attribute — not part of the sk — so we can find and
    // remove the previous reaction regardless of which type it was.
    const existingRes = await docClient.send(new GetCommand({
      TableName: "RealTimeChat",
      Key: {
        roomId: `ROOM#${roomId}`,
        sk: `LIKE#${msgId}#${resolvedUserId}`
      }
    }));
    const existingReaction: Reaction | null = existingRes.Item?.reaction ?? null;

    // Nothing to do.
    if (existingReaction === reaction) {
      const field = reaction ? COUNT_FIELD[reaction] : null;
      const currentCount = field ? (msgItem[field] ?? 0) : 0;
      return NextResponse.json({
        success: true,
        reaction: existingReaction,
        ...(field ? { [field]: currentCount, heartCount: msgItem.heartCount ?? 0 } : {}),
      });
    }

    const updates: Record<string, number> = {};

    // Decrement the old reaction's count, if any.
    if (existingReaction) {
      const oldField = COUNT_FIELD[existingReaction];
      updates[oldField] = Math.max(0, (msgItem[oldField] ?? 0) - 1);
    }

    // Increment the new reaction's count, if setting one.
    if (reaction) {
      const newField = COUNT_FIELD[reaction];
      const base = newField in updates ? updates[newField] : (msgItem[newField] ?? 0);
      updates[newField] = base + 1;
    }

    // Write/replace/remove the user's reaction row.
    if (reaction) {
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `LIKE#${msgId}#${resolvedUserId}`,
          reaction,
          reactedAt: Date.now()
        }
      }));
    } else {
      await docClient.send(new DeleteCommand({
        TableName: "RealTimeChat",
        Key: {
          roomId: `ROOM#${roomId}`,
          sk: `LIKE#${msgId}#${resolvedUserId}`
        }
      }));
    }

    // Apply count updates to the message row.
    if (Object.keys(updates).length > 0) {
      const setExpr = Object.keys(updates).map((f, i) => `${f} = :v${i}`).join(", ");
      const values = Object.fromEntries(Object.values(updates).map((v, i) => [`:v${i}`, v]));
      await docClient.send(new UpdateCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: msgItem.sk },
        UpdateExpression: `SET ${setExpr}`,
        ExpressionAttributeValues: values,
      }));
    }

    // Only notify when a NEW reaction is being added (not on removal, not on switch-away).
    if (reaction) {
      notifyRoomMessageReaction(roomId, msgId, resolvedUserId, reaction).catch(() => { });
    }

    const responseCounts: Record<string, number> = {};
    for (const f of Object.keys(updates)) responseCounts[f] = updates[f];
    // Always include heartCount in the response since the frontend's optimistic
    // UI keys off `heartCount` as the generic "total reactions" display count —
    // if heart wasn't touched, fall back to the message's existing value.
    if (!("heartCount" in responseCounts)) responseCounts.heartCount = msgItem.heartCount ?? 0;

    return NextResponse.json({ success: true, reaction, ...responseCounts });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    if (msg === "Message not found") return NextResponse.json({ error: msg }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}