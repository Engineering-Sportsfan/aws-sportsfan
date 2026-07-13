
// // api/roar/rooms/[roomId]/messages/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { awardRoarPoints } from "@/lib/roarPoints";
// import { getUserInfo } from "@/lib/userPoints";
// import type { RoomMessage, MessageType } from "@/app/models/RoomMessage";
// import type { PostType } from "@/app/models/Post";

// // ── Shared helper ─────────────────────────────────────────────────────────────
// // NOTE: previously this checked `users/{email}` before `users/{uid}` locally.
// // That diverged from getUserInfo (used by /api/createpost via awardUserPoints,
// // and now by /api/roar/posts), which checks `users/{uid}` first and has extra
// // sanitized-email fallbacks. The mismatch meant the same person's room
// // messages could resolve to a *different* users/{id} doc than their ROAR
// // posts or social posts — splitting activityLog, totalPoints, and the
// // votes/reactions subcollections (causing userVote/userLiked to read back
// // wrong after a refresh). We now use getUserInfo everywhere so there's a
// // single source of truth for "what is this user's doc ID".
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

// // ── Message types that support agree/disagree voting (single vote per msg) ───
// const VOTABLE_TYPES = new Set(["hottake", "prediction", "hot_take", "debate"]);

// // ── Message types that hold MULTIPLE independent questions per message,     ──
// // ── needing one vote per (user, questionIndex) instead of one per (user).   ──
// // predictions_live was previously missing from any votable set at all, which
// // is why a saved vote never came back after a refresh — the GET route simply
// // never looked it up.
// const MULTI_QUESTION_VOTABLE_TYPES = new Set(["predictions_live"]);

// // ── PostType map for awardRoarPoints ──────────────────────────────────────────
// const ROOM_TYPE_TO_POST_TYPE: Partial<Record<string, PostType | "post">> = {
//   debate: "debate",
//   prediction: "prediction",
//   post: "post",
//   hottake: "hot_take",
//   hot_take: "hot_take",
//   raw_reactions: "post",
//   memory: "post",
//   quiz: "quiz",
// };



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

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }
//     const resolvedUserId = resolved.id;

//     const messagesRef = db
//       .collection("roarRooms")
//       .doc(roomId)
//       .collection("messages");

//     let query = messagesRef.orderBy("createdAt", "desc").limit(limit);

//     const since = searchParams.get("since");

//     if (since) {
//       query = messagesRef
//         .where("createdAt", ">", parseInt(since, 10))
//         .orderBy("createdAt", "desc")
//         .limit(limit);
//     } else if (lastCreatedAt) {
//       query = query.startAfter(parseInt(lastCreatedAt, 10));
//     } else if (lastDocId) {
//       const cursorDoc = await messagesRef.doc(lastDocId).get();
//       if (cursorDoc.exists) query = query.startAfter(cursorDoc);
//     }

//     const snapshot = await query.get();
//     if (snapshot.empty) {
//       return NextResponse.json({
//         success: true,
//         messages: [],
//         pagination: { limit, hasMore: false, nextCursor: null },
//       });
//     }

//     // ── Batch vote reads only (reactions now read from doc map field) ─────────
//     const votableIndices: number[] = [];
//     const votePromises: Promise<FirebaseFirestore.DocumentSnapshot>[] = [];

//     // predictions_live: fetch ALL of this user's vote docs for the message in
//     // one query (there can be one per question), instead of a single doc.
//     const multiVotableIndices: number[] = [];
//     const multiVotePromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

//     snapshot.docs.forEach((doc, i) => {
//       const type = (doc.data() as RoomMessage).type;
//       if (VOTABLE_TYPES.has(type)) {
//         votableIndices.push(i);
//         votePromises.push(doc.ref.collection("votes").doc(resolvedUserId).get());
//       } else if (MULTI_QUESTION_VOTABLE_TYPES.has(type)) {
//         multiVotableIndices.push(i);
//         multiVotePromises.push(
//           doc.ref.collection("votes").where("userId", "==", resolvedUserId).get()
//         );
//       }
//     });

//     // ── Batch-fetch live avatarUrl/badge per unique author ────────────────────
//     const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
//     const uniqueAuthorUids = Array.from(
//       new Set(snapshot.docs.map((d) => (d.data() as RoomMessage).authorUid))
//     );

//     const [voteResults, multiVoteResults, authorSnaps] = await Promise.all([
//       Promise.all(votePromises),
//       Promise.all(multiVotePromises),
//       Promise.all(uniqueAuthorUids.map((uid) => db.collection("users").doc(uid).get())),
//     ]);

//     uniqueAuthorUids.forEach((uid, i) => {
//       const s = authorSnaps[i];
//       const data = s.exists ? (s.data() as any) : null;
//       authorMap.set(uid, {
//         avatarUrl: data?.avatarUrl ?? null,
//         badge: data?.badge ?? null,
//       });
//     });

//     // Build vote lookup map (single-question votable types)
//     const userVoteByIndex = new Map<number, string | null>();
//     votableIndices.forEach((docIdx, resultIdx) => {
//       const snap = voteResults[resultIdx];
//       userVoteByIndex.set(docIdx, snap.exists ? ((snap.data() as any).vote ?? null) : null);
//     });

//     // Build per-question vote lookup map (predictions_live)
//     const userPredictionVotesByIndex = new Map<number, Record<number, string>>();
//     multiVotableIndices.forEach((docIdx, resultIdx) => {
//       const querySnap = multiVoteResults[resultIdx];
//       const votesMap: Record<number, string> = {};
//       querySnap.docs.forEach((d) => {
//         const data = d.data() as any;
//         if (typeof data.questionIndex === "number" && typeof data.vote === "string") {
//           votesMap[data.questionIndex] = data.vote;
//         }
//       });
//       userPredictionVotesByIndex.set(docIdx, votesMap);
//     });

//     // ── Assemble response ─────────────────────────────────────────────────────
//     const messages = snapshot.docs.map((doc, i) => {
//       const data = doc.data() as RoomMessage;
//       const author = authorMap.get(data.authorUid);
//       return {
//         ...data,
//         msgId: doc.id,
//         agreeCount: data.agreeCount ?? 0,
//         disagreeCount: data.disagreeCount ?? 0,

//         // Total reaction count across all emoji types
//         heartCount: (data as any).likeCount ?? 0,

//         // Individual emoji counts
//         fireCount: (data as any).fireCount ?? 0,
//         mindblownCount: (data as any).mindblownCount ?? 0,
//         goatCount: (data as any).goatCount ?? 0,
//         clapCount: (data as any).clapCount ?? 0,
//         nochanceCount: (data as any).nochanceCount ?? 0,
//         laughCount: (data as any).laughCount ?? 0,
//         sadCount: (data as any).sadCount ?? 0,
//         thumbCount: (data as any).thumbCount ?? 0,

//         replyCount: data.replyCount ?? 0,
//         userVote: userVoteByIndex.has(i) ? userVoteByIndex.get(i) : null,

//         // predictions_live: map of questionIndex -> vote ("agree" | "disagree"
//         // | "option_N"), used by the client to restore selection + disable
//         // already-answered questions after a refresh.
//         userPredictionVotes: userPredictionVotesByIndex.has(i) ? userPredictionVotesByIndex.get(i) : undefined,

//         // Read userReaction from the reactions map on the doc itself —
//         // written by likesection as reactions.{userId}: "fire"|"heart" etc.
//         // Zero extra reads vs the old likes subcollection approach.
//         userReaction: (data as any).reactions?.[resolvedUserId] ?? null,
//         closesAt: data.closesAt ?? 0,

//         authorAvatarUrl: author?.avatarUrl ?? null,
//         authorBadge: author?.badge ?? data.authorBadge,
//       };
//     });

//     const lastDoc = snapshot.docs[snapshot.docs.length - 1];
//     const lastMsg = messages[messages.length - 1];

//     return NextResponse.json({
//       success: true,
//       messages,
//       pagination: {
//         limit,
//         hasMore: messages.length === limit,
//         nextCursor:
//           messages.length === limit
//             ? { lastDocId: lastDoc?.id, lastCreatedAt: lastMsg?.createdAt ?? null }
//             : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/rooms/messages error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

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
//     }: {
//       text: string;
//       type: MessageType;
//       mediaUrls?: string[];
//       sideA?: string;
//       sideB?: string;
//       predictionOptions?: string[];
//       closesAt?: number;
//       closeAfterMinutes?: number;
//       memGifUrl?: string;
//       memTag?: string;
//       questions?: { question: string; options: { label: string; emoji: string }[] }[];
//       matchTitle?: string;
//     } = body;

//     if (!text?.trim()) {
//       return NextResponse.json({ error: "text is required" }, { status: 400 });
//     }

//     // ── Resolve user + room in parallel ───────────────────────────────────────
//     const [resolved, roomSnap] = await Promise.all([
//       resolveUser(user.email, user.userId),
//       db.collection("roarRooms").doc(roomId).get(),
//     ]);

//     if (!roomSnap.exists) {
//       return NextResponse.json({ error: "Room not found" }, { status: 404 });
//     }
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }

//     const { id: resolvedUserId, snap: userSnap } = resolved;
//     const userData = userSnap.data() as { username: string; badge: string };
//     const roomRef = db.collection("roarRooms").doc(roomId);
//     const now = Date.now();
//     const msgRef = roomRef.collection("messages").doc();
//     const normalizedCloseAfter = Number(closeAfterMinutes);
//     const requestedClosesAt = Number(closesAt);

//     // ⭐ FIX: Allow both "prediction" and "predictions_live" types
//     const predictionClosesAt = (type === "prediction" || type === "predictions_live")
//       ? Number.isFinite(requestedClosesAt) && requestedClosesAt > now
//         ? requestedClosesAt
//         : Number.isFinite(normalizedCloseAfter) && normalizedCloseAfter > 0
//           ? now + Math.min(Math.max(normalizedCloseAfter, 1), 24 * 60) * 60_000
//           : now + 2 * 60_000
//       : undefined;

//     const message: RoomMessage = {
//       msgId: msgRef.id,
//       roomId,
//       authorUid: resolvedUserId,
//       authorUsername: userData.username,
//       authorBadge: userData.badge,
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
//       ...(mediaUrls?.length && { mediaUrls }),
//       ...(sideA && { sideA }),
//       ...(sideB && { sideB }),
//       ...(questions?.length && { questions }),
//       ...(matchTitle && { matchTitle }),
//       ...(type === "prediction" && Array.isArray(predictionOptions) && {
//         predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
//       }),
//       // ⭐ FIX: Include closesAt for predictions_live too
//       ...(predictionClosesAt !== undefined && { closesAt: predictionClosesAt }),
//       ...(memGifUrl && { memGifUrl }),
//       ...(memTag && { memTag }),
//     };

//     // Atomic batch: write message + increment room fan count
//     const batch = db.batch();
//     batch.set(msgRef, message);
//     batch.update(roomRef, { fanCount: FieldValue.increment(1) });
//     await batch.commit();

//     // ── Award points — non-fatal, fire and forget ─────────────────────────────
//     const roarPostType = ROOM_TYPE_TO_POST_TYPE[type] ?? "post";
//     const transactionId = `roar_room_${msgRef.id}`;

//     awardRoarPoints({
//       actualUserId: resolvedUserId,
//       authUserId: user.userId,
//       userName: userData.username,
//       userEmail: user.email,
//       userExists: true,
//       postType: roarPostType,
//       transactionId,
//       metadata: {
//         postId: msgRef.id,
//         roomId,
//         type,
//         ...(sideA && { sideA }),
//         ...(sideB && { sideB }),
//         ...(type === "prediction" && Array.isArray(predictionOptions) && {
//           predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
//         }),
//       },
//     }).catch((err) => {
//       console.warn(`[POST rooms/messages] Failed to award points for ${roarPostType}:`, err);
//     });

//     return NextResponse.json({ success: true, msgId: msgRef.id, message });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/rooms/messages error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }





// // api/roar/rooms/[roomId]/messages/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { awardRoarPoints } from "@/lib/roarPoints";
// import { getUserInfo } from "@/lib/userPoints";
// import type { RoomMessage, MessageType } from "@/app/models/RoomMessage";
// import type { PostType } from "@/app/models/Post";

// // ── Shared helper ─────────────────────────────────────────────────────────────
// // NOTE: previously this checked `users/{email}` before `users/{uid}` locally.
// // That diverged from getUserInfo (used by /api/createpost via awardUserPoints,
// // and now by /api/roar/posts), which checks `users/{uid}` first and has extra
// // sanitized-email fallbacks. The mismatch meant the same person's room
// // messages could resolve to a *different* users/{id} doc than their ROAR
// // posts or social posts — splitting activityLog, totalPoints, and the
// // votes/reactions subcollections (causing userVote/userLiked to read back
// // wrong after a refresh). We now use getUserInfo everywhere so there's a
// // single source of truth for "what is this user's doc ID".

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

// // ── Message types that support agree/disagree voting (single vote per msg) ───
// const VOTABLE_TYPES = new Set(["hottake", "prediction", "hot_take", "debate"]);

// // ── Message types that hold MULTIPLE independent questions per message,     ──
// // ── needing one vote per (user, questionIndex) instead of one per (user).   ──
// // predictions_live was previously missing from any votable set at all, which
// // is why a saved vote never came back after a refresh — the GET route simply
// // never looked it up.
// // const MULTI_QUESTION_VOTABLE_TYPES = new Set(["predictions_live"]);
// const MULTI_QUESTION_VOTABLE_TYPES = new Set(["predictions_live", "battle"]);
// const MULTI_QUESTION_ANSWERABLE_TYPES = new Set(["trivia"]);

// // ── PostType map for awardRoarPoints ──────────────────────────────────────────
// const ROOM_TYPE_TO_POST_TYPE: Partial<Record<string, PostType | "post">> = {
//   debate: "debate",
//   prediction: "prediction",
//   post: "post",
//   hottake: "hot_take",
//   hot_take: "hot_take",
//   raw_reactions: "post",
//   memory: "post",
//   quiz: "quiz",
//   trivia: "quiz",
//   battle: "prediction",
// };

// // ── Room-level type counters (mirrors of fanCount) ────────────────────────────
// // Kept as simple increment/decrement fields on the room doc so the client can
// // show accurate category badge counts (Posts/Debates/Predictions) without
// // having to load every paginated message into memory first.
// const COUNT_FIELD_BY_TYPE: Partial<Record<string, "postCount" | "debateCount" | "predictionCount">> = {
//   post: "postCount",
//   chat: "postCount",
//   debate: "debateCount",
//   prediction: "predictionCount",
// };

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

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }
//     const resolvedUserId = resolved.id;

//     const roomRef = db.collection("roarRooms").doc(roomId);
//     // Fetched in parallel with the messages query below — used only to read
//     // postCount/debateCount/predictionCount for the category badge counts.
//     const roomSnapPromise = roomRef.get();

//     const messagesRef = db
//       .collection("roarRooms")
//       .doc(roomId)
//       .collection("messages");

//     let query = messagesRef.orderBy("createdAt", "desc").limit(limit);

//     const since = searchParams.get("since");

//     if (since) {
//       query = messagesRef
//         .where("createdAt", ">", parseInt(since, 10))
//         .orderBy("createdAt", "desc")
//         .limit(limit);
//     } else if (lastCreatedAt) {
//       query = query.startAfter(parseInt(lastCreatedAt, 10));
//     } else if (lastDocId) {
//       const cursorDoc = await messagesRef.doc(lastDocId).get();
//       if (cursorDoc.exists) query = query.startAfter(cursorDoc);
//     }

//     const [snapshot, roomSnapForEmpty] = await Promise.all([query.get(), roomSnapPromise]);

//     if (snapshot.empty) {
//       const roomDataEmpty = roomSnapForEmpty.exists ? (roomSnapForEmpty.data() as any) : null;
//       return NextResponse.json({
//         success: true,
//         messages: [],
//         pagination: { limit, hasMore: false, nextCursor: null },
//         counts: {
//           post: roomDataEmpty?.postCount ?? 0,
//           debate: roomDataEmpty?.debateCount ?? 0,
//           prediction: roomDataEmpty?.predictionCount ?? 0,
//         },
//       });
//     }

//     // ── Batch vote reads only (reactions now read from doc map field) ─────────
//     const votableIndices: number[] = [];
//     const votePromises: Promise<FirebaseFirestore.DocumentSnapshot>[] = [];

//     // predictions_live: fetch ALL of this user's vote docs for the message in
//     // one query (there can be one per question), instead of a single doc.
//     const multiVotableIndices: number[] = [];
//     const multiVotePromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

//     snapshot.docs.forEach((doc, i) => {
//       const type = (doc.data() as RoomMessage).type;
//       if (VOTABLE_TYPES.has(type)) {
//         votableIndices.push(i);
//         votePromises.push(doc.ref.collection("votes").doc(resolvedUserId).get());
//       } else if (MULTI_QUESTION_VOTABLE_TYPES.has(type)) {
//         multiVotableIndices.push(i);
//         multiVotePromises.push(
//           doc.ref.collection("votes").where("userId", "==", resolvedUserId).get()
//         );
//       }
//     });

//     // ── Batch-fetch live avatarUrl/badge per unique author ────────────────────
//     const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
//     const uniqueAuthorUids = Array.from(
//       new Set(snapshot.docs.map((d) => (d.data() as RoomMessage).authorUid))
//     );

//     const [voteResults, multiVoteResults, authorSnaps] = await Promise.all([
//       Promise.all(votePromises),
//       Promise.all(multiVotePromises),
//       Promise.all(uniqueAuthorUids.map((uid) => db.collection("users").doc(uid).get())),
//     ]);

//     uniqueAuthorUids.forEach((uid, i) => {
//       const s = authorSnaps[i];
//       const data = s.exists ? (s.data() as any) : null;
//       authorMap.set(uid, {
//         avatarUrl: data?.avatarUrl ?? null,
//         badge: data?.badge ?? null,
//       });
//     });

//     // Build vote lookup map (single-question votable types)
//     const userVoteByIndex = new Map<number, string | null>();
//     votableIndices.forEach((docIdx, resultIdx) => {
//       const snap = voteResults[resultIdx];
//       userVoteByIndex.set(docIdx, snap.exists ? ((snap.data() as any).vote ?? null) : null);
//     });

//     // Build per-question vote lookup map (predictions_live)
//     const userPredictionVotesByIndex = new Map<number, Record<number, string>>();
//     multiVotableIndices.forEach((docIdx, resultIdx) => {
//       const querySnap = multiVoteResults[resultIdx];
//       const votesMap: Record<number, string> = {};
//       querySnap.docs.forEach((d) => {
//         const data = d.data() as any;
//         if (typeof data.questionIndex === "number" && typeof data.vote === "string") {
//           votesMap[data.questionIndex] = data.vote;
//         }
//       });
//       userPredictionVotesByIndex.set(docIdx, votesMap);
//     });

//     // ── Assemble response ─────────────────────────────────────────────────────
//     const messages = snapshot.docs.map((doc, i) => {
//       const data = doc.data() as RoomMessage;
//       const author = authorMap.get(data.authorUid);
//       return {
//         ...data,
//         msgId: doc.id,
//         agreeCount: data.agreeCount ?? 0,
//         disagreeCount: data.disagreeCount ?? 0,

//         // Total reaction count across all emoji types
//         heartCount: (data as any).likeCount ?? 0,

//         // Individual emoji counts
//         fireCount: (data as any).fireCount ?? 0,
//         mindblownCount: (data as any).mindblownCount ?? 0,
//         goatCount: (data as any).goatCount ?? 0,
//         clapCount: (data as any).clapCount ?? 0,
//         nochanceCount: (data as any).nochanceCount ?? 0,
//         laughCount: (data as any).laughCount ?? 0,
//         sadCount: (data as any).sadCount ?? 0,
//         thumbCount: (data as any).thumbCount ?? 0,

//         replyCount: data.replyCount ?? 0,
//         userVote: userVoteByIndex.has(i) ? userVoteByIndex.get(i) : null,

//         // predictions_live: map of questionIndex -> vote ("agree" | "disagree"
//         // | "option_N"), used by the client to restore selection + disable
//         // already-answered questions after a refresh.
//         userPredictionVotes: userPredictionVotesByIndex.has(i) ? userPredictionVotesByIndex.get(i) : undefined,

//         // Read userReaction from the reactions map on the doc itself —
//         // written by likesection as reactions.{userId}: "fire"|"heart" etc.
//         // Zero extra reads vs the old likes subcollection approach.
//         userReaction: (data as any).reactions?.[resolvedUserId] ?? null,
//         closesAt: data.closesAt ?? 0,

//         authorAvatarUrl: author?.avatarUrl ?? null,
//         authorBadge: author?.badge ?? data.authorBadge,
//       };
//     });

//     const lastDoc = snapshot.docs[snapshot.docs.length - 1];
//     const lastMsg = messages[messages.length - 1];

//     const roomSnap = await roomSnapPromise;
//     const roomData = roomSnap.exists ? (roomSnap.data() as any) : null;

//     return NextResponse.json({
//       success: true,
//       messages,
//       pagination: {
//         limit,
//         hasMore: messages.length === limit,
//         nextCursor:
//           messages.length === limit
//             ? { lastDocId: lastDoc?.id, lastCreatedAt: lastMsg?.createdAt ?? null }
//             : null,
//       },
//       counts: {
//         post: roomData?.postCount ?? 0,
//         debate: roomData?.debateCount ?? 0,
//         prediction: roomData?.predictionCount ?? 0,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/rooms/messages error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

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
//     }: {
//       text: string;
//       type: MessageType;
//       mediaUrls?: string[];
//       sideA?: string;
//       sideB?: string;
//       predictionOptions?: string[];
//       closesAt?: number;
//       closeAfterMinutes?: number;
//       memGifUrl?: string;
//       memTag?: string;
//       questions?: { question: string; options: { label: string; emoji: string }[] }[];
//       matchTitle?: string;
//     } = body;

//     if (!text?.trim()) {
//       return NextResponse.json({ error: "text is required" }, { status: 400 });
//     }

//     // ── Resolve user + room in parallel ───────────────────────────────────────
//     const [resolved, roomSnap] = await Promise.all([
//       resolveUser(user.email, user.userId),
//       db.collection("roarRooms").doc(roomId).get(),
//     ]);

//     if (!roomSnap.exists) {
//       return NextResponse.json({ error: "Room not found" }, { status: 404 });
//     }
//     if (!resolved) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }

//     const { id: resolvedUserId, snap: userSnap } = resolved;
//     const userData = userSnap.data() as { username: string; badge: string };
//     const roomRef = db.collection("roarRooms").doc(roomId);
//     const now = Date.now();
//     const msgRef = roomRef.collection("messages").doc();
//     const normalizedCloseAfter = Number(closeAfterMinutes);
//     const requestedClosesAt = Number(closesAt);

//     // ⭐ FIX: Allow both "prediction" and "predictions_live" types
//     const predictionClosesAt = (type === "prediction" || type === "predictions_live")
//       ? Number.isFinite(requestedClosesAt) && requestedClosesAt > now
//         ? requestedClosesAt
//         : Number.isFinite(normalizedCloseAfter) && normalizedCloseAfter > 0
//           ? now + Math.min(Math.max(normalizedCloseAfter, 1), 24 * 60) * 60_000
//           : now + 2 * 60_000
//       : undefined;

//     const message: RoomMessage = {
//       msgId: msgRef.id,
//       roomId,
//       authorUid: resolvedUserId,
//       authorUsername: userData.username,
//       authorBadge: userData.badge,
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
//       ...(mediaUrls?.length && { mediaUrls }),
//       ...(sideA && { sideA }),
//       ...(sideB && { sideB }),
//       ...(questions?.length && { questions }),
//       ...(matchTitle && { matchTitle }),
//       ...(type === "prediction" && Array.isArray(predictionOptions) && {
//         predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
//       }),
//       // ⭐ FIX: Include closesAt for predictions_live too
//       ...(predictionClosesAt !== undefined && { closesAt: predictionClosesAt }),
//       ...(memGifUrl && { memGifUrl }),
//       ...(memTag && { memTag }),
//     };

//     // Atomic batch: write message + increment room fan count + type-specific count
//     const countField = COUNT_FIELD_BY_TYPE[type];

//     const batch = db.batch();
//     batch.set(msgRef, message);
//     batch.update(roomRef, {
//       fanCount: FieldValue.increment(1),
//       ...(countField && { [countField]: FieldValue.increment(1) }),
//     });
//     await batch.commit();

//     // ── Award points — non-fatal, fire and forget ─────────────────────────────
//     const roarPostType = ROOM_TYPE_TO_POST_TYPE[type] ?? "post";
//     const transactionId = `roar_room_${msgRef.id}`;

//     awardRoarPoints({
//       actualUserId: resolvedUserId,
//       authUserId: user.userId,
//       userName: userData.username,
//       userEmail: user.email,
//       userExists: true,
//       postType: roarPostType,
//       transactionId,
//       metadata: {
//         postId: msgRef.id,
//         roomId,
//         type,
//         ...(sideA && { sideA }),
//         ...(sideB && { sideB }),
//         ...(type === "prediction" && Array.isArray(predictionOptions) && {
//           predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
//         }),
//       },
//     }).catch((err) => {
//       console.warn(`[POST rooms/messages] Failed to award points for ${roarPostType}:`, err);
//     });

//     return NextResponse.json({ success: true, msgId: msgRef.id, message });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/rooms/messages error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// api/roar/rooms/[roomId]/messages/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { awardRoarPoints } from "@/lib/roarPoints";
import { getUserInfo } from "@/lib/userPoints";
import type { RoomMessage, MessageType } from "@/app/models/RoomMessage";
import type { PostType } from "@/app/models/Post";

// ── Shared helper ─────────────────────────────────────────────────────────────
// NOTE: previously this checked `users/{email}` before `users/{uid}` locally.
// That diverged from getUserInfo (used by /api/createpost via awardUserPoints,
// and now by /api/roar/posts), which checks `users/{uid}` first and has extra
// sanitized-email fallbacks. The mismatch meant the same person's room
// messages could resolve to a *different* users/{id} doc than their ROAR
// posts or social posts — splitting activityLog, totalPoints, and the
// votes/reactions subcollections (causing userVote/userLiked to read back
// wrong after a refresh). We now use getUserInfo everywhere so there's a
// single source of truth for "what is this user's doc ID".

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; snap: FirebaseFirestore.DocumentSnapshot } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  return { id: info.actualUserId, snap };
}

// ── Message types that support agree/disagree voting (single vote per msg) ───
const VOTABLE_TYPES = new Set(["hottake", "prediction", "hot_take", "debate"]);

// ── Message types that hold MULTIPLE independent questions per message,     ──
// ── needing one vote per (user, questionIndex) instead of one per (user).   ──
// predictions_live was previously missing from any votable set at all, which
// is why a saved vote never came back after a refresh — the GET route simply
// never looked it up.
// battle: player-A/player-B voting, one vote per (user, questionIndex) — same
// shape as predictions_live, so it reuses the exact same vote-doc pattern and
// the /vote route.
const MULTI_QUESTION_VOTABLE_TYPES = new Set(["predictions_live", "battle"]);

// ── Message types that hold MULTIPLE independent trivia questions per       ──
// ── message, where "voting" means submitting a correctness-checked answer   ──
// ── rather than a plain agree/disagree/option vote. These are answered via  ──
// ── the separate /trivia-answer route and read back from the               ──
// ── `triviaAnswers` subcollection (not `votes`).                           ──
const MULTI_QUESTION_ANSWERABLE_TYPES = new Set(["trivia"]);

// ── PostType map for awardRoarPoints ──────────────────────────────────────────
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

// ── Room-level type counters (mirrors of fanCount) ────────────────────────────
// Kept as simple increment/decrement fields on the room doc so the client can
// show accurate category badge counts (Posts/Debates/Predictions) without
// having to load every paginated message into memory first.
const COUNT_FIELD_BY_TYPE: Partial<Record<string, "postCount" | "debateCount" | "predictionCount" | "triviaCount" | "battleCount">> = {
  post: "postCount",
  chat: "postCount",
  debate: "debateCount",
  prediction: "predictionCount",
  trivia: "triviaCount",
  battle: "battleCount",
};

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

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
    const lastCreatedAt = searchParams.get("lastCreatedAt");
    const lastDocId = searchParams.get("lastDocId");

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const resolvedUserId = resolved.id;

    let roomRef = db.collection("roarRooms").doc(roomId);
    let roomSnap = await roomRef.get();
    let isWatchalongFallback = false;

    if (!roomSnap.exists) {
      roomRef = db.collection("watchAlongRooms").doc(roomId);
      roomSnap = await roomRef.get();
      if (!roomSnap.exists) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
      isWatchalongFallback = true;
    }

    // Fetched in parallel with the messages query below — used only to read
    // postCount/debateCount/predictionCount for the category badge counts.
    const roomSnapPromise = Promise.resolve(roomSnap);

    const messagesRef = roomRef.collection("messages");

    let query = messagesRef.orderBy("createdAt", "desc").limit(limit);

    const since = searchParams.get("since");

    if (since) {
      query = messagesRef
        .where("createdAt", ">", parseInt(since, 10))
        .orderBy("createdAt", "desc")
        .limit(limit);
    } else if (lastCreatedAt) {
      query = query.startAfter(parseInt(lastCreatedAt, 10));
    } else if (lastDocId) {
      const cursorDoc = await messagesRef.doc(lastDocId).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const [snapshot, roomSnapForEmpty] = await Promise.all([query.get(), roomSnapPromise]);

    if (snapshot.empty) {
      const roomDataEmpty = roomSnapForEmpty.exists ? (roomSnapForEmpty.data() as any) : null;
      return NextResponse.json({
        success: true,
        messages: [],
        pagination: { limit, hasMore: false, nextCursor: null },
        counts: {
          post: roomDataEmpty?.postCount ?? 0,
          debate: roomDataEmpty?.debateCount ?? 0,
          prediction: roomDataEmpty?.predictionCount ?? 0,
          trivia: roomDataEmpty?.triviaCount ?? 0,
          battle: roomDataEmpty?.battleCount ?? 0,
        },
      });
    }

    // ── Batch vote reads only (reactions now read from doc map field) ─────────
    const votableIndices: number[] = [];
    const votePromises: Promise<FirebaseFirestore.DocumentSnapshot>[] = [];

    // predictions_live / battle: fetch ALL of this user's vote docs for the
    // message in one query (there can be one per question), instead of a
    // single doc.
    const multiVotableIndices: number[] = [];
    const multiVotePromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

    // trivia: fetch ALL of this user's answer docs for the message in one
    // query (one per question), from the separate `triviaAnswers`
    // subcollection written by /trivia-answer.
    const answerableIndices: number[] = [];
    const answerPromises: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

    snapshot.docs.forEach((doc, i) => {
      const type = (doc.data() as RoomMessage).type;
      if (VOTABLE_TYPES.has(type)) {
        votableIndices.push(i);
        votePromises.push(doc.ref.collection("votes").doc(resolvedUserId).get());
      } else if (MULTI_QUESTION_VOTABLE_TYPES.has(type)) {
        multiVotableIndices.push(i);
        multiVotePromises.push(
          doc.ref.collection("votes").where("userId", "==", resolvedUserId).get()
        );
      } else if (MULTI_QUESTION_ANSWERABLE_TYPES.has(type)) {
        answerableIndices.push(i);
        answerPromises.push(
          doc.ref.collection("triviaAnswers").where("userId", "==", resolvedUserId).get()
        );
      }
    });

    // ── Batch-fetch live avatarUrl/badge per unique author ────────────────────
    const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
    const uniqueAuthorUids = Array.from(
      new Set(snapshot.docs.map((d) => (d.data() as RoomMessage).authorUid))
    );

    const [voteResults, multiVoteResults, answerResults, authorSnaps] = await Promise.all([
      Promise.all(votePromises),
      Promise.all(multiVotePromises),
      Promise.all(answerPromises),
      Promise.all(uniqueAuthorUids.map((uid) => db.collection("users").doc(uid).get())),
    ]);

    uniqueAuthorUids.forEach((uid, i) => {
      const s = authorSnaps[i];
      const data = s.exists ? (s.data() as any) : null;
      authorMap.set(uid, {
        avatarUrl: data?.avatarUrl ?? null,
        badge: data?.badge ?? null,
      });
    });

    // Build vote lookup map (single-question votable types)
    const userVoteByIndex = new Map<number, string | null>();
    votableIndices.forEach((docIdx, resultIdx) => {
      const snap = voteResults[resultIdx];
      userVoteByIndex.set(docIdx, snap.exists ? ((snap.data() as any).vote ?? null) : null);
    });

    // Build per-question vote lookup map (predictions_live / battle)
    const userPredictionVotesByIndex = new Map<number, Record<number, string>>();
    multiVotableIndices.forEach((docIdx, resultIdx) => {
      const querySnap = multiVoteResults[resultIdx];
      const votesMap: Record<number, string> = {};
      querySnap.docs.forEach((d) => {
        const data = d.data() as any;
        if (typeof data.questionIndex === "number" && typeof data.vote === "string") {
          votesMap[data.questionIndex] = data.vote;
        }
      });
      userPredictionVotesByIndex.set(docIdx, votesMap);
    });

    // Build per-question answer lookup map (trivia): questionIndex ->
    // { selectedOption, isCorrect }
    const userTriviaAnswersByIndex = new Map<
      number,
      Record<number, { selectedOption: string; isCorrect: boolean }>
    >();
    answerableIndices.forEach((docIdx, resultIdx) => {
      const querySnap = answerResults[resultIdx];
      const answersMap: Record<number, { selectedOption: string; isCorrect: boolean }> = {};
      querySnap.docs.forEach((d) => {
        const data = d.data() as any;
        if (typeof data.questionIndex === "number") {
          answersMap[data.questionIndex] = {
            selectedOption: data.selectedOption,
            isCorrect: !!data.isCorrect,
          };
        }
      });
      userTriviaAnswersByIndex.set(docIdx, answersMap);
    });

    // ── Assemble response ─────────────────────────────────────────────────────
    const messages = snapshot.docs.map((doc, i) => {
      const data = doc.data() as RoomMessage;
      const author = authorMap.get(data.authorUid);

      // Trivia questions must never leak `isCorrect` for a question this user
      // hasn't answered yet AND that hasn't closed — otherwise the client
      // could read the correct option straight off the network payload
      // before answering. Reveal only once answered or once closesAt passes.
      const userTriviaAnswers = userTriviaAnswersByIndex.get(i);
      const triviaExpired = data.closesAt ? data.closesAt <= Date.now() : false;
      const triviaQuestions = (data as any).triviaQuestions?.map((q: any, qi: number) => {
        const answered = userTriviaAnswers?.[qi];
        const revealCorrect = !!answered || triviaExpired;
        return {
          question: q.question,
          timerSeconds: q.timerSeconds,
          options: q.options.map((o: any) => ({
            label: o.label,
            text: o.text,
            ...(revealCorrect ? { isCorrect: o.isCorrect } : {}),
          })),
        };
      });

      return {
        ...data,
        msgId: doc.id,
        agreeCount: data.agreeCount ?? 0,
        disagreeCount: data.disagreeCount ?? 0,

        // Total reaction count across all emoji types
        heartCount: (data as any).likeCount ?? 0,

        // Individual emoji counts
        fireCount: (data as any).fireCount ?? 0,
        mindblownCount: (data as any).mindblownCount ?? 0,
        goatCount: (data as any).goatCount ?? 0,
        clapCount: (data as any).clapCount ?? 0,
        nochanceCount: (data as any).nochanceCount ?? 0,
        laughCount: (data as any).laughCount ?? 0,
        sadCount: (data as any).sadCount ?? 0,
        thumbCount: (data as any).thumbCount ?? 0,

        replyCount: data.replyCount ?? 0,
        userVote: userVoteByIndex.has(i) ? userVoteByIndex.get(i) : null,

        // predictions_live / battle: map of questionIndex -> vote
        // ("agree" | "disagree" | "option_N" | "playerA" | "playerB"), used
        // by the client to restore selection + disable already-answered
        // questions after a refresh.
        userPredictionVotes: userPredictionVotesByIndex.has(i) ? userPredictionVotesByIndex.get(i) : undefined,

        // trivia: map of questionIndex -> { selectedOption, isCorrect }, used
        // by the client to restore the answered state + correctness after a
        // refresh, without re-revealing unanswered questions' answers.
        userTriviaAnswers: userTriviaAnswersByIndex.has(i) ? userTriviaAnswersByIndex.get(i) : undefined,

        // Redacted/annotated trivia questions (only present on trivia msgs)
        ...(triviaQuestions && { triviaQuestions }),

        triviaParticipants: (data as any).triviaParticipants ?? {},
        battleVoteCounts: (data as any).battleVoteCounts ?? {},

        // Read userReaction from the reactions map on the doc itself —
        // written by likesection as reactions.{userId}: "fire"|"heart" etc.
        // Zero extra reads vs the old likes subcollection approach.
        userReaction: (data as any).reactions?.[resolvedUserId] ?? null,
        closesAt: data.closesAt ?? 0,

        authorAvatarUrl: author?.avatarUrl ?? null,
        authorBadge: author?.badge ?? data.authorBadge,
      };
    });

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const lastMsg = messages[messages.length - 1];

    const finalRoomSnap = await roomSnapPromise;
    const roomData = finalRoomSnap.exists ? (finalRoomSnap.data() as any) : null;

    return NextResponse.json({
      success: true,
      messages,
      pagination: {
        limit,
        hasMore: messages.length === limit,
        nextCursor:
          messages.length === limit
            ? { lastDocId: lastDoc?.id, lastCreatedAt: lastMsg?.createdAt ?? null }
            : null,
      },
      counts: {
        post: roomData?.postCount ?? 0,
        debate: roomData?.debateCount ?? 0,
        prediction: roomData?.predictionCount ?? 0,
        trivia: roomData?.triviaCount ?? 0,
        battle: roomData?.battleCount ?? 0,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/rooms/messages error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      text,
      type = "chat",
      mediaUrls,
      sideA,
      sideB,
      predictionOptions,
      closesAt,
      closeAfterMinutes,
      memGifUrl,
      memTag,
      questions,
      matchTitle, matchStartAt, matchEndAt,
      triviaQuestions,
      battleQuestions,
      clientMsgId,
    }: {
      text: string;
      type: MessageType;
      mediaUrls?: string[];
      sideA?: string;
      sideB?: string;
      predictionOptions?: string[];
      closesAt?: number;
      closeAfterMinutes?: number;
      memGifUrl?: string;
      memTag?: string;
      clientMsgId?: string;
      questions?: { question: string; options: { label: string; emoji: string }[] }[];
      matchTitle?: string; matchStartAt?: number; matchEndAt?: number
      triviaQuestions?: {
        question: string;
        timerSeconds?: number;
        options: { label: string; text?: string; isCorrect?: boolean }[];
      }[];
      battleQuestions?: {
        question?: string;
        playerA: { name: string; team?: string; image?: string };
        playerB: { name: string; team?: string; image?: string };
      }[];
    } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    // ── Type-specific payload validation ───────────────────────────────────────
    if (type === "trivia") {
      if (!Array.isArray(triviaQuestions) || triviaQuestions.length === 0) {
        return NextResponse.json({ error: "triviaQuestions is required for type=trivia" }, { status: 400 });
      }
      for (let i = 0; i < triviaQuestions.length; i++) {
        const q = triviaQuestions[i];
        if (!q.question?.trim()) {
          return NextResponse.json({ error: `triviaQuestions[${i}].question is required` }, { status: 400 });
        }
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return NextResponse.json({ error: `triviaQuestions[${i}] needs at least 2 options` }, { status: 400 });
        }
        if (!q.options.some((o) => o.isCorrect)) {
          return NextResponse.json({ error: `triviaQuestions[${i}] needs exactly one correct option` }, { status: 400 });
        }
      }
    }
    if (type === "battle") {
      if (!Array.isArray(battleQuestions) || battleQuestions.length === 0) {
        return NextResponse.json({ error: "battleQuestions is required for type=battle" }, { status: 400 });
      }
      for (let i = 0; i < battleQuestions.length; i++) {
        const q = battleQuestions[i];
        if (!q.playerA?.name?.trim() || !q.playerB?.name?.trim()) {
          return NextResponse.json({ error: `battleQuestions[${i}] needs both player names` }, { status: 400 });
        }
      }
    }

    // ── Resolve user + room in parallel ───────────────────────────────────────
    let [resolved, roomSnap] = await Promise.all([
      resolveUser(user.email, user.userId),
      db.collection("roarRooms").doc(roomId).get(),
    ]);

    let isWatchalongFallback = false;
    if (!roomSnap.exists) {
      roomSnap = await db.collection("watchAlongRooms").doc(roomId).get();
      if (!roomSnap.exists) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }
      isWatchalongFallback = true;
    }
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { id: resolvedUserId, snap: userSnap } = resolved;
    const userData = userSnap.data() as { username: string; badge: string };
    
    // Correctly point roomRef to watchAlongRooms if fallback is active
    const roomRef = isWatchalongFallback 
      ? db.collection("watchAlongRooms").doc(roomId) 
      : db.collection("roarRooms").doc(roomId);
    const now = Date.now();
    // const msgRef = roomRef.collection("messages").doc();
    const msgRef = clientMsgId
      ? roomRef.collection("messages").doc(clientMsgId)
      : roomRef.collection("messages").doc();

    if (clientMsgId) {
      const existing = await msgRef.get();
      if (existing.exists) {
        // Duplicate submit (double-tap / double-fire) — return the existing message instead of creating a second one.
        return NextResponse.json({ success: true, msgId: msgRef.id, message: existing.data() });
      }
    }
    const normalizedCloseAfter = Number(closeAfterMinutes);
    const requestedClosesAt = Number(closesAt);

    // ⭐ Timed-close window applies to prediction / predictions_live / battle.
    // Trivia is timed PER-QUESTION via each question's own timerSeconds on the
    // client, so it does NOT use this message-level closesAt window unless
    // explicitly passed (kept optional/backward compatible below).
    const isMultiCloseType = type === "prediction" || type === "predictions_live" || type === "battle";
    const predictionClosesAt = isMultiCloseType
      ? Number.isFinite(requestedClosesAt) && requestedClosesAt > now
        ? requestedClosesAt
        : Number.isFinite(normalizedCloseAfter) && normalizedCloseAfter > 0
          ? now + Math.min(Math.max(normalizedCloseAfter, 1), 24 * 60) * 60_000
          : now + 2 * 60_000
      : type === "trivia" && Number.isFinite(requestedClosesAt) && requestedClosesAt > now
        ? requestedClosesAt
        : undefined;

    // ── Normalize trivia/battle payloads for storage ───────────────────────────
    const normalizedTriviaQuestions = triviaQuestions?.map((q) => ({
      question: q.question.trim(),
      timerSeconds: Number.isFinite(q.timerSeconds) && (q.timerSeconds as number) > 0 ? q.timerSeconds : 15,
      options: q.options.map((o) => ({
        label: o.label,
        text: (o.text ?? o.label ?? "").toString().trim(),
        isCorrect: !!o.isCorrect,
      })),
    }));

    const normalizedBattleQuestions = battleQuestions?.map((q) => ({
      question: q.question?.trim() || "",
      playerA: {
        name: q.playerA.name.trim(),
        team: q.playerA.team?.trim() || "",
        image: q.playerA.image || "",
      },
      playerB: {
        name: q.playerB.name.trim(),
        team: q.playerB.team?.trim() || "",
        image: q.playerB.image || "",
      },
    }));

    const message: RoomMessage = {
      msgId: msgRef.id,
      roomId,
      authorUid: resolvedUserId,
      authorUsername: userData.username,
      authorBadge: userData.badge,
      authorEmail: user.email,
      text: text.trim(),
      type,
      fireCount: 0,
      noChanceCount: 0,
      heartCount: 0,
      agreeCount: 0,
      disagreeCount: 0,
      replyCount: 0,
      createdAt: now,
      ...(matchStartAt && { matchStartAt }),
      ...(matchEndAt && { matchEndAt }),
      ...(mediaUrls?.length && { mediaUrls }),
      ...(sideA && { sideA }),
      ...(sideB && { sideB }),
      ...(questions?.length && { questions }),
      ...(matchTitle && { matchTitle }),
      ...(type === "prediction" && Array.isArray(predictionOptions) && {
        predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
      }),
      //  Include closesAt for predictions_live / battle / (optionally) trivia
      ...(predictionClosesAt !== undefined && { closesAt: predictionClosesAt }),
      ...(memGifUrl && { memGifUrl }),
      ...(memTag && { memTag }),
      ...(type === "trivia" && normalizedTriviaQuestions?.length && {
        triviaQuestions: normalizedTriviaQuestions,
        triviaParticipants: {},
      }),
      ...(type === "battle" && normalizedBattleQuestions?.length && {
        battleQuestions: normalizedBattleQuestions,
        battleVoteCounts: {},
      }),
    } as RoomMessage;

    // Atomic batch: write message + increment room fan count + type-specific count
    const countField = COUNT_FIELD_BY_TYPE[type];

    const batch = db.batch();
    batch.set(msgRef, message);
    if (!isWatchalongFallback) {
      batch.update(roomRef, {
        fanCount: FieldValue.increment(1),
        ...(countField && { [countField]: FieldValue.increment(1) }),
      });
    }
    await batch.commit();

    // ── Award points — non-fatal, fire and forget ─────────────────────────────
    const roarPostType = ROOM_TYPE_TO_POST_TYPE[type] ?? "post";
    const transactionId = `roar_room_${msgRef.id}`;

    awardRoarPoints({
      actualUserId: resolvedUserId,
      authUserId: user.userId,
      userName: userData.username,
      userEmail: user.email,
      userExists: true,
      postType: roarPostType,
      transactionId,
      metadata: {
        postId: msgRef.id,
        roomId,
        type,
        statement: text.trim(),
        ...(sideA && { sideA }),
        ...(sideB && { sideB }),
        ...(type === "prediction" && Array.isArray(predictionOptions) && {
          predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
        }),
        ...(type === "trivia" && { questionCount: normalizedTriviaQuestions?.length ?? 0 }),
        ...(type === "battle" && { questionCount: normalizedBattleQuestions?.length ?? 0 }),
      },
    }).catch((err) => {
      console.warn(`[POST rooms/messages] Failed to award points for ${roarPostType}:`, err);
    });

    return NextResponse.json({ success: true, msgId: msgRef.id, message });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/rooms/messages error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}