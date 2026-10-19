// app/api/roar/rooms/[roomId]/messages/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { dualWrite } from "@/lib/dualWrite";
import { FieldValue } from "firebase-admin/firestore";
import { awardRoarPoints } from "@/lib/roarPoints";
import { getUserInfo } from "@/lib/userPoints";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { RoomMessage, MessageType } from "@/app/models/RoomMessage";
import type { PostType } from "@/app/models/Post";
import { notifyMentions, notifyFollowedRoomNewPost, notifyRoomContentAnnounced } from "@/lib/notifications";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// async function resolveUser(
//   email: string,
//   userId: string
// ): Promise<{ id: string; snap: FirebaseFirestore.DocumentSnapshot } | null> {
//   const info = await getUserInfo(userId, undefined, email);
//   if (!info.exists) return null;

//   const snap = await db.collection("users").doc(info.actualUserId).get();
//   if (!snap.exists) return null;

//   return { id: info.actualUserId, snap };
// }

async function resolveUser(email: string, userId: string): Promise<{ id: string; username: string; badge: string; avatarUrl?: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;
  try {
    const res = await docClient.send(new GetCommand({
      TableName: TABLES.IdentityAndAccess,
      Key: { entityId: `USER#${info.actualUserId}`, sk: "USER#META" }
    }));
    return {
      id: info.actualUserId,
      username: res.Item?.username ?? email.split("@")[0],
      badge: res.Item?.badge ?? "Fan",
      avatarUrl: res.Item?.avatarUrl,
    };
  } catch {
    return { id: info.actualUserId, username: email.split("@")[0], badge: "Fan" };
  }
}


const VOTABLE_TYPES = new Set(["hottake", "prediction", "hot_take", "debate"]);
const MULTI_QUESTION_VOTABLE_TYPES = new Set(["predictions_live", "battle"]);
const MULTI_QUESTION_ANSWERABLE_TYPES = new Set(["trivia"]);

const ROOM_TYPE_TO_POST_TYPE: Partial<Record<string, PostType | "post">> = {
  debate: "debate",
  prediction: "prediction",
  post: "post",
  hottake: "hot_take",
  hot_take: "hot_take",
  raw_reactions: "post",
  memory: "post",
  quiz: "quiz",
  trivia: "quiz",
  battle: "prediction",
};

const COUNT_FIELD_BY_TYPE: Partial<Record<string, "postCount" | "debateCount" | "predictionCount" | "triviaCount" | "battleCount">> = {
  post: "postCount",
  chat: "postCount",
  debate: "debateCount",
  prediction: "predictionCount",
  trivia: "triviaCount",
  battle: "battleCount",
};

// export async function GET(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> }
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const { searchParams } = new URL(req.url);
//     const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
//     const lastCreatedAt = searchParams.get("lastCreatedAt");
//     const lastDocId = searchParams.get("lastDocId");
//     const channelId = searchParams.get("channelId");
//     const channelSlug = searchParams.get("channelSlug");

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }
//     const resolvedUserId = resolved.id;

//     let messages: any[] = [];

//     // 1. Query DynamoDB RealTimeChat table
//     try {
//       const candidates = [`ROOM#${roomId}`, roomId];
//       for (const cand of candidates) {
//         const qRes = await docClient.send(
//           new QueryCommand({
//             TableName: "RealTimeChat",
//             KeyConditionExpression: "roomId = :r AND begins_with(sk, :mPrefix)",
//             ExpressionAttributeValues: {
//               ":r": cand,
//               ":mPrefix": "MSG#",
//             },
//             ScanIndexForward: false,
//             Limit: limit,
//           })
//         );
//         if (qRes.Items && qRes.Items.length > 0) {
//           messages = qRes.Items.map((item) => ({
//             ...item,
//             // msgId: (item.sk as string)?.split("#")[2] || item.id || item.chatId,
//             msgId: item.msgId || (item.sk as string)?.split("#")[3] || item.id || item.chatId,
//             agreeCount: item.agreeCount ?? 0,
//             disagreeCount: item.disagreeCount ?? 0,
//             heartCount: item.likeCount ?? item.heartCount ?? 0,
//             replyCount: item.replyCount ?? 0,
//           }));

//           if (messages.length > 0) {
//             try {
//               const likeChecks = await Promise.all(
//                 messages.map((m) =>
//                   docClient.send(new QueryCommand({
//                     TableName: "RealTimeChat",
//                     KeyConditionExpression: "roomId = :r AND sk = :s",
//                     ExpressionAttributeValues: {
//                       ":r": `ROOM#${roomId}`,
//                       ":s": `LIKE#${m.msgId}#${resolvedUserId}`,
//                     },
//                     Limit: 1,
//                   }))
//                 )
//               );
//               messages = messages.map((m, i) => ({
//                 ...m,
//                 userReaction: likeChecks[i].Items?.[0]?.reaction ?? null,
//               }));
//             } catch (likeErr) {
//               console.warn("Failed to hydrate userReaction:", likeErr);
//             }

//             if (messages.length > 0) {
//               try {
//                 const voteChecks = await Promise.all(
//                   messages.map((m) =>
//                     docClient.send(new GetCommand({
//                       TableName: "RealTimeChat",
//                       Key: { roomId: `ROOM#${roomId}`, sk: `VOTE#${m.msgId}#${resolvedUserId}` },
//                     }))
//                   )
//                 );
//                 messages = messages.map((m, i) => ({
//                   ...m,
//                   userVote: voteChecks[i].Item?.vote ?? null,
//                 }));
//               } catch (voteErr) {
//                 console.warn("Failed to hydrate userVote:", voteErr);
//               }
//             }
//           }
//           break;

//         }
//       }

//     } catch (dynErr) {
//       console.warn("DynamoDB query room messages notice:", dynErr);
//     }

//     // 2. Fallback to Firebase
//     if (messages.length === 0) {
//       let roomRef = db.collection("roarRooms").doc(roomId);
//       let roomSnap = await roomRef.get();
//       if (!roomSnap.exists) {
//         roomRef = db.collection("watchAlongRooms").doc(roomId);
//         roomSnap = await roomRef.get();
//       }

//       if (roomSnap.exists) {
//         const messagesRef = roomRef.collection("messages");
//         let query = messagesRef.orderBy("createdAt", "desc").limit(limit);

//         if (channelId) {
//           query = messagesRef.where("channelId", "==", channelId).orderBy("createdAt", "desc").limit(limit);
//         } else if (channelSlug) {
//           query = messagesRef.where("channelSlug", "==", channelSlug).orderBy("createdAt", "desc").limit(limit);
//         }

//         const snapshot = await query.get();
//         messages = snapshot.docs.map((doc) => ({
//           ...doc.data(),
//           msgId: doc.id,
//           agreeCount: doc.data().agreeCount ?? 0,
//           disagreeCount: doc.data().disagreeCount ?? 0,
//           heartCount: doc.data().likeCount ?? 0,
//           replyCount: doc.data().replyCount ?? 0,
//         }));
//       }
//     }

//     return NextResponse.json({
//       success: true,
//       messages,
//       pagination: {
//         limit,
//         hasMore: messages.length === limit,
//         nextCursor: null,
//       },
//       counts: {
//         post: messages.length,
//         debate: 0,
//         prediction: 0,
//         trivia: 0,
//         battle: 0,
//       },
//     }, { headers: { "Cache-Control": "no-store" } });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/rooms/messages error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const cleanRoomId = (roomId || "").replace(/^ROOM#/, "");
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "60"), 100);
    const lastCreatedAt = searchParams.get("lastCreatedAt");
    const lastDocId = searchParams.get("lastDocId");
    const channelId = searchParams.get("channelId");
    const channelSlug = searchParams.get("channelSlug");

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const resolvedUserId = resolved.id;

    function extractMsgId(item: any, cRoomId: string): string {
      if (item.msgId && typeof item.msgId === "string" && item.msgId.trim()) return item.msgId.trim();
      if (item.id && typeof item.id === "string" && item.id.trim()) return item.id.trim();
      if (item.chatId && typeof item.chatId === "string" && item.chatId.trim()) return item.chatId.trim();
      if (typeof item.sk === "string") {
        const raw = item.sk.replace(/^MSG#/, "");
        const parts = raw.split("#");
        const cRoom = cRoomId.replace(/^ROOM#/, "");
        const meaningful = parts.filter((p: string) => p && p !== cRoom && p !== `ROOM#${cRoom}` && !/^\d{10,}$/.test(p));
        if (meaningful.length > 0) return meaningful[meaningful.length - 1];
        const nonTs = parts.filter((p: string) => !/^\d{10,}$/.test(p));
        if (nonTs.length > 0) return nonTs[nonTs.length - 1];
        return parts[parts.length - 1] || item.sk;
      }
      return item.createdAt ? `msg_${item.createdAt}` : `msg_${Math.random().toString(36).substring(2, 9)}`;
    }

    let messages: any[] = [];
    const seenMsgIds = new Set<string>();

    // 1. Query DynamoDB RealTimeChat table across both candidates
    try {
      const candidates = [`ROOM#${cleanRoomId}`, cleanRoomId];
      for (const cand of candidates) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.RealTimeChat,
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :mPrefix)",
            ExpressionAttributeValues: {
              ":r": cand,
              ":mPrefix": "MSG#",
            },
            ScanIndexForward: false,
            Limit: limit,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          for (const item of qRes.Items) {
            const mId = extractMsgId(item, cleanRoomId);
            if (!seenMsgIds.has(mId)) {
              seenMsgIds.add(mId);
              messages.push({
                ...item,
                msgId: mId,
                agreeCount: item.agreeCount ?? 0,
                disagreeCount: item.disagreeCount ?? 0,
                heartCount: item.likeCount ?? item.heartCount ?? 0,
                replyCount: item.replyCount ?? 0,
              });
            }
          }
        }
      }
    } catch (dynErr) {
      console.warn("DynamoDB query room messages notice:", dynErr);
    }

    // 2. Fallback & Merge from Firebase if DynamoDB has fewer than limit
    if (messages.length < limit) {
      try {
        let roomRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId);
        let roomSnap = await roomRef.get();
        if (!roomSnap.exists) {
          roomRef = db.collection(getFirestoreCollection("watchAlongRooms")).doc(cleanRoomId);
          roomSnap = await roomRef.get();
        }

        if (roomSnap.exists) {
          const messagesRef = roomRef.collection("messages");
          let query = messagesRef.orderBy("createdAt", "desc").limit(limit);

          if (channelId && channelId !== "all") {
            query = messagesRef.where("channelId", "==", channelId).orderBy("createdAt", "desc").limit(limit);
          } else if (channelSlug && channelSlug !== "all") {
            query = messagesRef.where("channelSlug", "==", channelSlug).orderBy("createdAt", "desc").limit(limit);
          }

          const snapshot = await query.get();
          for (const doc of snapshot.docs) {
            if (!seenMsgIds.has(doc.id)) {
              seenMsgIds.add(doc.id);
              const data = doc.data();
              messages.push({
                ...data,
                msgId: doc.id,
                agreeCount: data.agreeCount ?? 0,
                disagreeCount: data.disagreeCount ?? 0,
                heartCount: data.likeCount ?? data.heartCount ?? 0,
                replyCount: data.replyCount ?? 0,
              });
            }
          }
        }
      } catch (fsErr) {
        console.warn("Firestore fallback messages notice:", fsErr);
      }
    }

    // Sort by createdAt descending and slice to limit
    messages.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    if (messages.length > limit) {
      messages = messages.slice(0, limit);
    }

    if (messages.length > 0) {
      try {
        const likeChecks = await Promise.all(
          messages.map((m) =>
            docClient.send(new QueryCommand({
              TableName: TABLES.RealTimeChat,
              KeyConditionExpression: "roomId = :r AND sk = :s",
              ExpressionAttributeValues: {
                ":r": `ROOM#${cleanRoomId}`,
                ":s": `LIKE#${m.msgId}#${resolvedUserId}`,
              },
              Limit: 1,
            }))
          )
        );
        messages = messages.map((m, i) => ({
          ...m,
          userReaction: likeChecks[i].Items?.[0]?.reaction ?? null,
        }));
      } catch (likeErr) {
        console.warn("Failed to hydrate userReaction:", likeErr);
      }

      try {
        const voteChecks = await Promise.all(
          messages.map((m) =>
            docClient.send(new GetCommand({
              TableName: TABLES.RealTimeChat,
              Key: { roomId: `ROOM#${cleanRoomId}`, sk: `VOTE#${m.msgId}#${resolvedUserId}` },
            }))
          )
        );
        messages = messages.map((m, i) => ({
          ...m,
          userVote: voteChecks[i].Item?.vote ?? null,
        }));
      } catch (voteErr) {
        console.warn("Failed to hydrate userVote:", voteErr);
      }
    }

    // 3. Room-wide type counts — accurately count all active messages (including bot posts, predictions, debates, trivia, battles)
    const countedMsgIds = new Set<string>();
    const trueCounts = { post: 0, debate: 0, prediction: 0, trivia: 0, battle: 0 };

    function classifyAndCount(mId: string, rawType?: string, rawPostType?: string) {
      if (!mId || countedMsgIds.has(mId)) return;
      countedMsgIds.add(mId);
      const t = (rawType || rawPostType || "post").toLowerCase().trim();
      if (t === "debate") trueCounts.debate++;
      else if (t === "prediction" || t === "predictions_live") trueCounts.prediction++;
      else if (t === "trivia" || t === "quiz") trueCounts.trivia++;
      else if (t === "battle") trueCounts.battle++;
      else trueCounts.post++;
    }

    // A. Count from all active DynamoDB messages in this room (paginated to ensure complete accuracy)
    const countCandidates = Array.from(new Set([`ROOM#${cleanRoomId}`, cleanRoomId]));
    for (const cand of countCandidates) {
      try {
        let lastKey: Record<string, any> | undefined = undefined;
        do {
          const typeQueryRes: any = await docClient.send(new QueryCommand({
            TableName: TABLES.RealTimeChat,
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :mPrefix)",
            ExpressionAttributeValues: {
              ":r": cand,
              ":mPrefix": "MSG#",
            },
            ProjectionExpression: "sk, msgId, id, chatId, #t, postType",
            ExpressionAttributeNames: { "#t": "type" },
            ExclusiveStartKey: lastKey,
          }));

          if (typeQueryRes.Items && typeQueryRes.Items.length > 0) {
            for (const item of typeQueryRes.Items) {
              const mId = extractMsgId(item, cleanRoomId);
              classifyAndCount(mId, item.type, item.postType);
            }
          }
          lastKey = typeQueryRes.LastEvaluatedKey;
        } while (lastKey);
      } catch (dynCountErr) {
        console.warn("[Messages GET] Fast type counting notice:", dynCountErr);
      }
    }

    // B. Count from Firestore fallback rooms if any active messages exist there
    for (const collName of ["roarRooms", "watchAlongRooms"]) {
      try {
        const roomRef = db.collection(getFirestoreCollection(collName)).doc(cleanRoomId);
        const roomSnap = await roomRef.get();
        if (roomSnap.exists) {
          const fsMsgsSnap = await roomRef.collection("messages").select("type", "postType").get();
          for (const doc of fsMsgsSnap.docs) {
            classifyAndCount(doc.id, doc.data().type, doc.data().postType);
          }
        }
      } catch {
        // Firestore count best-effort
      }
    }

    // C. Also factor in loaded messages array to ensure 100% parity with feed
    for (const m of messages) {
      classifyAndCount(m.msgId, m.type, m.postType);
    }

    // D. Self-heal ROOM#META in DynamoDB with the accurate true counts
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: `ROOM#${cleanRoomId}`, sk: "ROOM#META" },
        UpdateExpression: "SET typeCounts = :counts",
        ExpressionAttributeValues: { ":counts": trueCounts },
      }));
    } catch {
      // Best-effort cache update
    }

    return NextResponse.json({
      success: true,
      messages,
      pagination: {
        limit,
        hasMore: messages.length === limit,
        nextCursor: null,
      },
      counts: trueCounts,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/rooms/messages error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}




// export async function POST(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> }
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const body = await req.json();
//     const {
//       text,
//       type = "chat",
//       mediaUrls,
//       sideA,
//       sideB,
//       predictionOptions,
//       closesAt,
//       closeAfterMinutes,
//       memGifUrl,
//       memTag,
//       questions,
//       matchTitle,
//       matchStartAt,
//       matchEndAt,
//       triviaQuestions,
//       battleQuestions,
//       clientMsgId,
//       channelId,
//       channelSlug,
//     } = body;

//     if (!text?.trim()) {
//       return NextResponse.json({ error: "text is required" }, { status: 400 });
//     }

//     let [resolved, roomSnap] = await Promise.all([
//       resolveUser(user.email, user.userId),
//       db.collection("roarRooms").doc(roomId).get(),
//     ]);

//     let isWatchalongFallback = false;
//     if (!roomSnap.exists) {
//       roomSnap = await db.collection("watchAlongRooms").doc(roomId).get();
//       if (roomSnap.exists) isWatchalongFallback = true;
//     }

//     const resolvedUserId = resolved?.id || user.userId;
//     const now = Date.now();
//     const msgId = clientMsgId || `msg_${now}_${Math.random().toString(36).substring(2, 9)}`;

//     const message: RoomMessage = {
//       msgId,
//       roomId,
//       authorUid: resolvedUserId,
//       authorUsername: (resolved?.snap?.data() as any)?.username || user.email?.split("@")[0] || "User",
//       authorBadge: (resolved?.snap?.data() as any)?.badge || "Fan",
//       authorEmail: user.email,
//       text: text.trim(),
//       type,
//       fireCount: 0,
//       noChanceCount: 0,
//       heartCount: 0,
//       agreeCount: 0,
//       disagreeCount: 0,
//       replyCount: 0,
//       createdAt: now,
//       ...(channelId && { channelId }),
//       ...(channelSlug && { channelSlug }),
//       ...(matchStartAt && { matchStartAt }),
//       ...(matchEndAt && { matchEndAt }),
//       ...(mediaUrls?.length && { mediaUrls }),
//       ...(sideA && { sideA }),
//       ...(sideB && { sideB }),
//       ...(questions?.length && { questions }),
//       ...(matchTitle && { matchTitle }),
//       ...(memGifUrl && { memGifUrl }),
//       ...(memTag && { memTag }),
//       ...(triviaQuestions?.length && { triviaQuestions }),
//       ...(battleQuestions?.length && { battleQuestions }),
//     } as RoomMessage;

//     // ── Dual-Write to DynamoDB RealTimeChat & Firebase ────────────────────────
//     const dynamoMessage = {
//       ...message,
//       roomId: `ROOM#${roomId}`,
//       sk: `MSG#${roomId}#${now}#${msgId}`,
//       chatId: msgId,
//       senderId: resolvedUserId,
//       content: text.trim(),
//       updatedAt: now,
//     };

//     await dualWrite(`roarRooms/${roomId}/messages`, msgId, "RealTimeChat", dynamoMessage);

//     // ── Award points async ───────────────────────────────────────────────────
//     const roarPostType = ROOM_TYPE_TO_POST_TYPE[type] ?? "post";
//     try {
//       await awardRoarPoints({
//         actualUserId: resolvedUserId,
//         authUserId: user.userId,
//         userName: message.authorUsername,
//         userEmail: user.email,
//         userExists: true,
//         postType: roarPostType,
//         transactionId: `roar_room_${msgId}`,
//         metadata: {
//           postId: msgId,
//           roomId,
//           type,
//           statement: text.trim(),
//         },
//       });
//     } catch (ptErr) {
//       console.warn("Points notice:", ptErr);
//     }

//     return NextResponse.json({ success: true, msgId, message });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/rooms/messages error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      text, type = "chat", mediaUrls, sideA, sideB, memGifUrl, memTag,
      questions, matchTitle, matchStartAt, matchEndAt, triviaQuestions,
      battleQuestions, clientMsgId, channelId, channelSlug,
    } = body;

    if (!text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });

    const cleanRoomId = (roomId || "").replace(/^ROOM#/, "");
    const resolved = await resolveUser(user.email, user.userId);
    const resolvedUserId = resolved?.id || user.userId;
    const now = Date.now();
    const msgId = clientMsgId || `msg_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const dynamoMessage = {
      roomId: `ROOM#${cleanRoomId}`,
      sk: `MSG#${cleanRoomId}#${now}#${msgId}`,
      msgId, chatId: msgId,
      authorUid: resolvedUserId,
      authorUsername: resolved?.username || user.email?.split("@")[0] || "User",
      authorBadge: resolved?.badge || "Fan",
      authorAvatarUrl: resolved?.avatarUrl,
      authorEmail: user.email,
      text: text.trim(), type,
      fireCount: 0, noChanceCount: 0, heartCount: 0,
      agreeCount: 0, disagreeCount: 0, replyCount: 0,
      createdAt: now, updatedAt: now,
      ...(channelId && { channelId }),
      ...(channelSlug && { channelSlug }),
      ...(matchStartAt && { matchStartAt }),
      ...(matchEndAt && { matchEndAt }),
      ...(mediaUrls?.length && { mediaUrls }),
      ...(sideA && { sideA }),
      ...(sideB && { sideB }),
      ...(questions?.length && { questions }),
      ...(matchTitle && { matchTitle }),
      ...(memGifUrl && { memGifUrl }),
      ...(memTag && { memTag }),
      ...(triviaQuestions?.length && { triviaQuestions }),
      ...(battleQuestions?.length && { battleQuestions }),
    };

    await docClient.send(new PutCommand({ TableName: TABLES.RealTimeChat, Item: dynamoMessage }));

    // ── Bump room-level per-type counter (drives the header category counts) ──
    const countKey =
      type === "debate" ? "debate" :
        type === "prediction" || type === "predictions_live" ? "prediction" :
          type === "trivia" ? "trivia" :
            type === "battle" ? "battle" : "post";

    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: `ROOM#${cleanRoomId}`, sk: "ROOM#META" },
        UpdateExpression: "SET typeCounts = if_not_exists(typeCounts, :emptyMap)",
        ExpressionAttributeValues: { ":emptyMap": { post: 0, debate: 0, prediction: 0, trivia: 0, battle: 0 } },
      }));
      await docClient.send(new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: `ROOM#${cleanRoomId}`, sk: "ROOM#META" },
        UpdateExpression: "ADD typeCounts.#k :one",
        ExpressionAttributeNames: { "#k": countKey },
        ExpressionAttributeValues: { ":one": 1 },
      }));
    } catch (countErr) {
      console.warn("Failed to bump room type count:", countErr);
    }

    const roarPostType = ROOM_TYPE_TO_POST_TYPE[type] ?? "post";
    awardRoarPoints({
      actualUserId: resolvedUserId,
      authUserId: user.userId,
      userName: dynamoMessage.authorUsername,
      userEmail: user.email,
      userExists: true,
      postType: roarPostType,
      transactionId: `roar_room_${msgId}`,
      metadata: { postId: msgId, roomId, type, statement: text.trim() },
    }).catch((ptErr) => console.warn("Points notice:", ptErr));

    // ── Notifications ──
    notifyMentions(text.trim(), roomId, msgId, resolvedUserId, dynamoMessage.authorUsername).catch(() => { });
    notifyFollowedRoomNewPost(roomId, dynamoMessage.authorUsername /* TODO: pass real roomName */, dynamoMessage.authorUsername).catch(() => { });
    if (type === "debate" || type === "trivia") {
      notifyRoomContentAnnounced(roomId, roomId /* TODO: pass real roomName */, type, text.trim()).catch(() => { });
    }

    return NextResponse.json({ success: true, msgId, message: dynamoMessage });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}