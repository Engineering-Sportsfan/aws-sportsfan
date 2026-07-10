


// // api/roar/posts/route.ts
// //with real mail id
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { awardRoarPoints } from "@/lib/roarPoints";
// import type { Post, PostType, SportType } from "@/app/models/Post";

// // ── Post types that support agree/disagree voting ─────────────────────────────
// const VOTABLE_TYPES = new Set<PostType>(["hot_take", "prediction", "debate"]);

// // ── Likeable post types (all types can now be liked/reacted to) ───────────────
// // Previously only "post" type had likes read. Expanding to all types means
// // users can react to hot_takes, debates, etc. If you want to keep likes
// // restricted to "post" only, revert this to: type === "post"
// const isLikeable = (_type: PostType) => true;

// // ── Shared helper ─────────────────────────────────────────────────────────────
// async function resolveUser(
//   email: string,
//   uid: string
// ): Promise<{
//   resolvedId: string;
//   snap: FirebaseFirestore.DocumentSnapshot;
//   ref: FirebaseFirestore.DocumentReference;
// } | null> {
//   const emailSnap = await db.collection("users").doc(email).get();
//   if (emailSnap.exists) {
//     return { resolvedId: email, snap: emailSnap, ref: db.collection("users").doc(email) };
//   }
//   const uidSnap = await db.collection("users").doc(uid).get();
//   if (uidSnap.exists) {
//     return { resolvedId: uid, snap: uidSnap, ref: db.collection("users").doc(uid) };
//   }
//   return null;
// }

// // ────────────────────────────────────────────────────────────────────────────
// // GET  /api/roar/posts
// // ────────────────────────────────────────────────────────────────────────────
// //
// // Quota cost per request (page of N posts, V votable, L likeable, Q quiz):
// //   1      — user doc (resolveUser, fired in parallel with posts query)
// //   N      — post docs
// //   V      — vote subcollection docs   (only hot_take / prediction / debate)
// //   L      — like subcollection docs   (all types by default)
// //   Q      — quizAnswer subcollection docs (only quiz)
// //   ───────────────────────────────────
// //   1 + N + V + L + Q  total reads
// //
// // All subcollection batches fire in one parallel Promise.all round-trip.
// // Pass ?includeUserState=false to skip all subcollection reads entirely.
// //
// // NEW vs previous version:
// //   • likeMap now also populates reactionMap (one read, two values — free)
// //   • userReaction is returned alongside userLiked in every post object
// //   • isLikeable() covers all post types so reactions work everywhere
// //
// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const { searchParams } = new URL(req.url);
//     const limit            = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
//     const sport            = searchParams.get("sport");
//     const lastCreatedAt    = searchParams.get("lastCreatedAt")
//       ? parseInt(searchParams.get("lastCreatedAt")!, 10)
//       : null;
//     const includeUserState = searchParams.get("includeUserState") !== "false";

//     // ── Build posts query ─────────────────────────────────────────────────────
//     let postsQuery = sport
//       ? db.collection("roarPosts").where("sport", "==", sport).orderBy("createdAt", "desc").limit(limit)
//       : db.collection("roarPosts").orderBy("createdAt", "desc").limit(limit);

//     if (lastCreatedAt !== null) {
//       postsQuery = postsQuery.startAfter(lastCreatedAt);
//     }

//     // ── Fire user resolution + posts query in parallel ────────────────────────
//     const [resolved, snapshot] = await Promise.all([
//       resolveUser(user.email, user.userId),
//       postsQuery.get(),
//     ]);

//     if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     const { resolvedId: resolvedUserId } = resolved;

//     if (snapshot.empty) {
//       return NextResponse.json({
//         success: true,
//         posts: [],
//         pagination: { limit, hasMore: false, nextCursor: null },
//       });
//     }

//     // ── Batch subcollection reads ─────────────────────────────────────────────
//     const voteMap     = new Map<string, string | null>();
//     const likeMap     = new Map<string, boolean>();
//     const reactionMap = new Map<string, string | null>(); // ← NEW: reaction type per post
//     const quizMap     = new Map<string, string | null>();

//     if (includeUserState) {
//       const docs = snapshot.docs;

//       const voteIndices: number[] = [];
//       const likeIndices: number[] = [];
//       const quizIndices: number[] = [];

//       docs.forEach((d, i) => {
//         const type = (d.data() as Post).type;
//         if (VOTABLE_TYPES.has(type)) voteIndices.push(i);
//         if (isLikeable(type))        likeIndices.push(i);
//         if (type === "quiz")         quizIndices.push(i);
//       });

//       const voteRefs = voteIndices.map((i) => docs[i].ref.collection("roarVotes").doc(resolvedUserId));
//       const likeRefs = likeIndices.map((i) => docs[i].ref.collection("likes").doc(resolvedUserId));
//       const quizRefs = quizIndices.map((i) => docs[i].ref.collection("quizAnswers").doc(resolvedUserId));

//       const [voteSnaps, likeSnaps, quizSnaps] = await Promise.all([
//         Promise.all(voteRefs.map((r) => r.get())),
//         Promise.all(likeRefs.map((r) => r.get())),
//         Promise.all(quizRefs.map((r) => r.get())),
//       ]);

//       voteIndices.forEach((docIdx, resultIdx) => {
//         const s = voteSnaps[resultIdx];
//         voteMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).vote ?? null) : null);
//       });

//       // ── Likes: capture both existence AND reaction type in one pass ──────────
//       likeIndices.forEach((docIdx, resultIdx) => {
//         const s   = likeSnaps[resultIdx];
//         const id  = docs[docIdx].id;
//         likeMap.set(id, s.exists);
//         // Legacy docs created before reaction support default to "heart"
//         reactionMap.set(id, s.exists ? ((s.data() as any).reaction ?? "heart") : null);
//       });

//       quizIndices.forEach((docIdx, resultIdx) => {
//         const s = quizSnaps[resultIdx];
//         quizMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).selectedOption ?? null) : null);
//       });
//     }

//     // ── Assemble response ─────────────────────────────────────────────────────
//     const posts = snapshot.docs.map((doc) => {
//       const data           = doc.data() as Post;
//       const userVote       = voteMap.get(doc.id) ?? null;
//       const userLiked      = likeMap.get(doc.id) ?? false;
//       const userReaction   = reactionMap.get(doc.id) ?? null; // ← NEW
//       const quizUserAnswer = quizMap.get(doc.id) ?? null;

//       return {
//         ...data,
//         postId:    doc.id,
//         likeCount: data.likeCount ?? 0,
//         ...(includeUserState && { userVote, userLiked, userReaction, quizUserAnswer }),
//         // Hide correct answer until the user has answered
//         quizCorrectOption:
//           data.type === "quiz" && !quizUserAnswer ? undefined : data.quizCorrectOption,
//       };
//     });

//     const lastPost = posts[posts.length - 1];

//     return NextResponse.json({
//       success: true,
//       posts,
//       pagination: {
//         limit,
//         hasMore: posts.length === limit,
//         nextCursor: posts.length === limit ? { lastCreatedAt: lastPost?.createdAt ?? null } : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/posts error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ────────────────────────────────────────────────────────────────────────────
// // POST  /api/roar/posts
// // ────────────────────────────────────────────────────────────────────────────
// //
// // Quota cost per request:
// //   1  — user doc read (resolveUser)
// //   1  — batch commit (postRef.set + userDocRef.update)
// //   1  — transaction idempotency read inside awardRoarPoints
// //   1  — leaderboard batch commit inside awardRoarPoints
// //   ─────────────────────────────────────────────
// //   2 reads + 2 writes total  (unchanged)
// //
// export async function POST(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const body = await req.json();
//     const {
//       type,
//       text,
//       sport = "cricket",
//       sideA,
//       sideB,
//       matchId,
//       confidence,
//       audience = "Everyone",
//       mediaUrls,
//       quizQuestion,
//       quizOptions,
//       quizCorrectOption,
//       quizTimer,
//       quizPoints,
//       memGifUrl,
//       memTag,
//     }: {
//       type: PostType;
//       text: string;
//       sport: SportType;
//       sideA?: string;
//       sideB?: string;
//       matchId?: string;
//       confidence?: number;
//       audience?: string;
//       mediaUrls?: string[];
//       quizQuestion?: string;
//       quizOptions?: { label: string; text: string }[];
//       quizCorrectOption?: string;
//       quizTimer?: number;
//       quizPoints?: number;
//       memGifUrl?: string;
//       memTag?: string;
//     } = body;

//     if (!type || (!text?.trim() && !quizQuestion?.trim() && (!mediaUrls || mediaUrls.length === 0))) {
//       return NextResponse.json({ error: "type and text (or quiz question) are required" }, { status: 400 });
//     }

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

//     const { resolvedId: resolvedUserId, snap: userSnap, ref: userDocRef } = resolved;
//     const userData = userSnap.data() as { username: string; badge: string; [key: string]: any };

//     const now     = Date.now();
//     const postRef = db.collection("roarPosts").doc();

//     const newPost: Post = {
//       postId:         postRef.id,
//       authorUid:      resolvedUserId,
//       authorUsername: userData.username,
//       authorBadge:    userData.badge,
//       type,
//       sport,
//       text: text?.trim() || quizQuestion?.trim() || "",
//       ...(sideA             && { sideA }),
//       ...(sideB             && { sideB }),
//       ...(matchId           && { matchId }),
//       ...(confidence !== undefined && { confidence }),
//       ...(quizQuestion      && { quizQuestion }),
//       ...(quizOptions       && { quizOptions }),
//       ...(quizCorrectOption && { quizCorrectOption }),
//       ...(quizTimer         && { quizTimer }),
//       ...(quizPoints        && { quizPoints }),
//       ...(memGifUrl         && { memGifUrl }),
//       ...(memTag            && { memTag }),
//       quizParticipants: 0,
//       audience,
//       agreeCount:    0,
//       disagreeCount: 0,
//       replyCount:    0,
//       isLive:        false,
//       status:        "active",
//       mediaUrls:     mediaUrls || [],
//       createdAt:     now,
//       updatedAt:     now,
//     };

//     const batch = db.batch();
//     batch.set(postRef, newPost);

//     const counterField = type === "prediction" ? "predictionCount" : "hotTakeCount";
//     batch.update(userDocRef, { [counterField]: FieldValue.increment(1), updatedAt: now });

//     await batch.commit();

//     // Award points — non-fatal, fire-and-forget
//     awardRoarPoints({
//       actualUserId:  resolvedUserId,
//       authUserId:    user.userId,
//       userName:      userData.username ?? resolvedUserId,
//       userEmail:     user.email,
//       userExists:    true,
//       postType:      type,
//       transactionId: `roar_post_${postRef.id}`,
//       metadata:      { postId: postRef.id, sport },
//     }).catch((err) => console.error("Failed to award points for post:", err));

//     return NextResponse.json({ success: true, postId: postRef.id, post: newPost });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/posts error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }





// // api/roar/posts/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { awardRoarPoints } from "@/lib/roarPoints";
// import { getUserInfo } from "@/lib/userPoints";
// import type { Post, PostType, SportType } from "@/app/models/Post";

// // ── Post types that support agree/disagree voting ─────────────────────────────
// const VOTABLE_TYPES = new Set<PostType>(["hot_take", "prediction", "debate"]);


// const isLikeable = (_type: PostType) => true;

// type PredictionCloseCandidate = Partial<Post> & { authorUid?: string };

// function cleanDisplayName(raw: string | undefined | null): string {
//   if (!raw) return "RoarUser";

//   let name = raw.trim();
//   if (!name) return "RoarUser";
//   name = name.replace(/_[a-z0-9-]+_(com|net|org|io|co)$/i, "");

//   // Replace underscores/dots (typical email-local-part separators) with
//   // spaces, collapse repeats, trim.
//   name = name.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();

//   if (!name) return "RoarUser";


//   name = name
//     .split(" ")
//     .map((word) =>
//       /[A-Z]/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
//     )
//     .join(" ");

//   return name;
// }


// async function resolveUser(
//   email: string,
//   uid: string
// ): Promise<{
//   resolvedId: string;
//   snap: FirebaseFirestore.DocumentSnapshot;
//   ref: FirebaseFirestore.DocumentReference;
//   derivedUserName: string;
// } | null> {
//   const info = await getUserInfo(uid, undefined, email);
//   if (!info.exists) return null;

//   const ref = db.collection("users").doc(info.actualUserId);
//   const snap = await ref.get();
//   if (!snap.exists) return null;

//   return {
//     resolvedId: info.actualUserId,
//     snap,
//     ref,
//     derivedUserName: cleanDisplayName(info.userName),
//   };
// }


// // GET  /api/roar/posts
 

// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const { searchParams } = new URL(req.url);
//     const limit            = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
//     const sport            = searchParams.get("sport");
//     const lastCreatedAt    = searchParams.get("lastCreatedAt")
//       ? parseInt(searchParams.get("lastCreatedAt")!, 10)
//       : null;
//     const includeUserState = searchParams.get("includeUserState") !== "false";

//     // ── Build posts query ─────────────────────────────────────────────────────
//     let postsQuery = sport
//       ? db.collection("roarPosts").where("sport", "==", sport).orderBy("createdAt", "desc").limit(limit)
//       : db.collection("roarPosts").orderBy("createdAt", "desc").limit(limit);

//     if (lastCreatedAt !== null) {
//       postsQuery = postsQuery.startAfter(lastCreatedAt);
//     }

//     // ── Fire user resolution + posts query in parallel ────────────────────────
//     const [resolved, snapshot] = await Promise.all([
//       resolveUser(user.email, user.userId),
//       postsQuery.get(),
//     ]);

//     if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     const { resolvedId: resolvedUserId } = resolved;

//     if (snapshot.empty) {
//       return NextResponse.json({
//         success: true,
//         posts: [],
//         pagination: { limit, hasMore: false, nextCursor: null },
//       });
//     }

//     // ── Batch subcollection reads ─────────────────────────────────────────────
//     const voteMap     = new Map<string, string | null>();
//     const likeMap     = new Map<string, boolean>();
//     const reactionMap = new Map<string, string | null>(); // ← NEW: reaction type per post
//     const quizMap     = new Map<string, string | null>();

//     if (includeUserState) {
//       const docs = snapshot.docs;

//       const voteIndices: number[] = [];
//       const likeIndices: number[] = [];
//       const quizIndices: number[] = [];

//       docs.forEach((d, i) => {
//         const type = (d.data() as Post).type;
//         if (VOTABLE_TYPES.has(type)) voteIndices.push(i);
//         if (isLikeable(type))        likeIndices.push(i);
//         if (type === "quiz")         quizIndices.push(i);
//       });

//       const voteRefs = voteIndices.map((i) => docs[i].ref.collection("roarVotes").doc(resolvedUserId));
//       const likeRefs = likeIndices.map((i) => docs[i].ref.collection("likes").doc(resolvedUserId));
//       const quizRefs = quizIndices.map((i) => docs[i].ref.collection("quizAnswers").doc(resolvedUserId));

//       const [voteSnaps, likeSnaps, quizSnaps] = await Promise.all([
//         Promise.all(voteRefs.map((r) => r.get())),
//         Promise.all(likeRefs.map((r) => r.get())),
//         Promise.all(quizRefs.map((r) => r.get())),
//       ]);

//       voteIndices.forEach((docIdx, resultIdx) => {
//         const s = voteSnaps[resultIdx];
//         voteMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).vote ?? null) : null);
//       });

//       // ── Likes: capture both existence AND reaction type in one pass ──────────
//       likeIndices.forEach((docIdx, resultIdx) => {
//         const s   = likeSnaps[resultIdx];
//         const id  = docs[docIdx].id;
//         likeMap.set(id, s.exists);
//         // Legacy docs created before reaction support default to "heart"
//         reactionMap.set(id, s.exists ? ((s.data() as any).reaction ?? "heart") : null);
//       });

//       quizIndices.forEach((docIdx, resultIdx) => {
//         const s = quizSnaps[resultIdx];
//         quizMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).selectedOption ?? null) : null);
//       });
//     }

//     // ── Assemble response ─────────────────────────────────────────────────────
//     const posts = snapshot.docs.map((doc) => {
//       const data           = doc.data() as Post;
//       const userVote       = voteMap.get(doc.id) ?? null;
//       const userLiked      = likeMap.get(doc.id) ?? false;
//       const userReaction   = reactionMap.get(doc.id) ?? null; // ← NEW
//       const quizUserAnswer = quizMap.get(doc.id) ?? null;

//       return {
//         ...data,
//         postId:    doc.id,
//         likeCount: data.likeCount ?? 0,
//         ...(includeUserState && { userVote, userLiked, userReaction, quizUserAnswer }),
//         // Hide correct answer until the user has answered
//         quizCorrectOption:
//           data.type === "quiz" && !quizUserAnswer ? undefined : data.quizCorrectOption,
//       };
//     });

//     const lastPost = posts[posts.length - 1];

//     return NextResponse.json({
//       success: true,
//       posts,
//       pagination: {
//         limit,
//         hasMore: posts.length === limit,
//         nextCursor: posts.length === limit ? { lastCreatedAt: lastPost?.createdAt ?? null } : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/posts error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // POST  /api/roar/posts
// // 

// //
// export async function POST(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const body = await req.json();
//     const {
//       type,
//       text,
//       sport = "cricket",
//       sideA,
//       sideB,
//       matchId,
//       confidence,
//       audience = "Everyone",
//       mediaUrls,
//       quizQuestion,
//       quizOptions,
//       quizCorrectOption,
//       quizTimer,
//       quizPoints,
//       memGifUrl,
//       memTag,
//     }: {
//       type: PostType;
//       text: string;
//       sport: SportType;
//       sideA?: string;
//       sideB?: string;
//       matchId?: string;
//       confidence?: number;
//       audience?: string;
//       mediaUrls?: string[];
//       quizQuestion?: string;
//       quizOptions?: { label: string; text: string }[];
//       quizCorrectOption?: string;
//       quizTimer?: number;
//       quizPoints?: number;
//       memGifUrl?: string;
//       memTag?: string;
//     } = body;

//     if (!type || (!text?.trim() && !quizQuestion?.trim() && (!mediaUrls || mediaUrls.length === 0))) {
//       return NextResponse.json({ error: "type and text (or quiz question) are required" }, { status: 400 });
//     }

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

//     const { resolvedId: resolvedUserId, snap: userSnap, ref: userDocRef, derivedUserName } = resolved;
//     const userData = userSnap.data() as { username?: string; badge: string; [key: string]: any };

//     // Prefer the doc's own `username` field; fall back to getUserInfo's
//     // *cleaned* derived name if the doc doesn't have one set (legacy/partial
//     // profiles). derivedUserName is already cleaned inside resolveUser().
//     const resolvedUsername = userData.username || derivedUserName;

//     const now     = Date.now();
//     const postRef = db.collection("roarPosts").doc();

//     const newPost: Post = {
//       postId:         postRef.id,
//       authorUid:      resolvedUserId,
//       authorUsername: resolvedUsername,
//       authorBadge:    userData.badge,
//       type,
//       sport,
//       text: text?.trim() || quizQuestion?.trim() || "",
//       ...(sideA             && { sideA }),
//       ...(sideB             && { sideB }),
//       ...(matchId           && { matchId }),
//       ...(confidence !== undefined && { confidence }),
//       ...(quizQuestion      && { quizQuestion }),
//       ...(quizOptions       && { quizOptions }),
//       ...(quizCorrectOption && { quizCorrectOption }),
//       ...(quizTimer         && { quizTimer }),
//       ...(quizPoints        && { quizPoints }),
//       ...(memGifUrl         && { memGifUrl }),
//       ...(memTag            && { memTag }),
//       quizParticipants: 0,
//       audience,
//       agreeCount:    0,
//       disagreeCount: 0,
//       replyCount:    0,
//       isLive:        false,
//       status:        "active",
//       mediaUrls:     mediaUrls || [],
//       createdAt:     now,
//       updatedAt:     now,
//     };

//     const batch = db.batch();
//     batch.set(postRef, newPost);

//     // Single update() call on userDocRef — Firestore counts this as one
//     // write regardless of how many fields are in the object, and a batch
//     // must not call update() twice on the same ref (the second call would
//     // silently overwrite the first's field map in some SDKs). Merging the
//     // counter increment and the username backfill into one object keeps
//     // this at exactly 1 write to this doc, same as before the fix.
//     const counterField = type === "prediction" ? "predictionCount" : "hotTakeCount";
//     const userDocUpdate: Record<string, unknown> = {
//       [counterField]: FieldValue.increment(1),
//       updatedAt: now,
//     };
//     // Backfill the user doc's own `username` field if it was missing, so
//     // future reads (here and elsewhere) don't need the fallback at all.
//     // Uses the already-cleaned derivedUserName — never the raw email-local
//     // part — so the stored field doesn't perpetuate the underscore bug.
//     if (!userData.username && derivedUserName) {
//       userDocUpdate.username = derivedUserName;
//     }
//     batch.update(userDocRef, userDocUpdate);

//     await batch.commit();

//     // Award points — non-fatal, fire-and-forget
//     awardRoarPoints({
//       actualUserId:  resolvedUserId,
//       authUserId:    user.userId,
//       userName:      resolvedUsername,
//       userEmail:     user.email,
//       userExists:    true,
//       postType:      type,
//       transactionId: `roar_post_${postRef.id}`,
//       metadata:      { postId: postRef.id, sport },
//     }).catch((err) => console.error("Failed to award points for post:", err));

//     return NextResponse.json({ success: true, postId: postRef.id, post: newPost });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/posts error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }



// // api/roar/posts/route.ts
// //
// // GET  /api/roar/posts?filter=For+You&limit=30&lastCreatedAt=xxx
// // GET  /api/roar/posts?sport=cricket&limit=30&lastCreatedAt=xxx   (legacy form, still works)
// // POST /api/roar/posts
// //

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { awardRoarPoints } from "@/lib/roarPoints";
// import { getUserInfo } from "@/lib/userPoints";
// import type { Post, PostType, SportType } from "@/app/models/Post";

// // ── Post types that support agree/disagree voting ─────────────────────────────
// const VOTABLE_TYPES = new Set<PostType>(["hot_take", "prediction", "debate"]);

// const isLikeable = (_type: PostType) => true;

// // ── filter param → query clause mapping (from feed/route.ts) ─────────────────
// const SPORT_FILTERS: Record<string, string> = { Cricket: "cricket", Football: "football" };
// const TYPE_FILTERS: Record<string, PostType> = {
//   Predictions: "prediction",
//   Debates: "debate",
//   "Hot Takes": "hot_take",
//   Quizzes: "quiz",
// };

// type PredictionCloseCandidate = Partial<Post> & { authorUid?: string };

// function cleanDisplayName(raw: string | undefined | null): string {
//   if (!raw) return "RoarUser";

//   let name = raw.trim();
//   if (!name) return "RoarUser";
//   name = name.replace(/_[a-z0-9-]+_(com|net|org|io|co)$/i, "");

//   // Replace underscores/dots (typical email-local-part separators) with
//   // spaces, collapse repeats, trim.
//   name = name.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();

//   if (!name) return "RoarUser";

//   name = name
//     .split(" ")
//     .map((word) =>
//       /[A-Z]/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
//     )
//     .join(" ");

//   return name;
// }

// async function resolveUser(
//   email: string,
//   uid: string
// ): Promise<{
//   resolvedId: string;
//   snap: FirebaseFirestore.DocumentSnapshot;
//   ref: FirebaseFirestore.DocumentReference;
//   derivedUserName: string;
// } | null> {
//   const info = await getUserInfo(uid, undefined, email);
//   if (!info.exists) return null;

//   const ref = db.collection("users").doc(info.actualUserId);
//   const snap = await ref.get();
//   if (!snap.exists) return null;

//   return {
//     resolvedId: info.actualUserId,
//     snap,
//     ref,
//     derivedUserName: cleanDisplayName(info.userName),
//   };
// }

// // GET  /api/roar/posts

// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const { searchParams } = new URL(req.url);
//     const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
//     const sport = searchParams.get("sport");
//     const filter = searchParams.get("filter"); // ← NEW, from feed/route.ts
//     const lastCreatedAt = searchParams.get("lastCreatedAt")
//       ? parseInt(searchParams.get("lastCreatedAt")!, 10)
//       : null;
//     const includeUserState = searchParams.get("includeUserState") !== "false";

//     // ── Build posts query ─────────────────────────────────────────────────────
//     // status == "active" is always applied now (carried over from feed/route.ts).
//     let postsQuery: FirebaseFirestore.Query = db
//       .collection("roarPosts")
//       .where("status", "==", "active");

//     if (filter && SPORT_FILTERS[filter]) {
//       postsQuery = postsQuery.where("sport", "==", SPORT_FILTERS[filter]);
//     } else if (filter && TYPE_FILTERS[filter]) {
//       postsQuery = postsQuery.where("type", "==", TYPE_FILTERS[filter]);
//     } else if (filter === "Live") {
//       postsQuery = postsQuery.where("isLive", "==", true);
//     } else if (sport) {
//       // legacy plain ?sport= param, unchanged behavior
//       postsQuery = postsQuery.where("sport", "==", sport);
//     }
//     // filter === "For You" (or no filter/sport at all) → no extra where()

//     postsQuery = postsQuery.orderBy("createdAt", "desc").limit(limit);

//     if (lastCreatedAt !== null) {
//       postsQuery = postsQuery.startAfter(lastCreatedAt);
//     }

//     // ── Fire user resolution + posts query in parallel ────────────────────────
//     const [resolved, snapshot] = await Promise.all([
//       resolveUser(user.email, user.userId),
//       postsQuery.get(),
//     ]);

//     if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     const { resolvedId: resolvedUserId } = resolved;

//     if (snapshot.empty) {
//       return NextResponse.json({
//         success: true,
//         posts: [],
//         pagination: { limit, hasMore: false, nextCursor: null },
//       });
//     }

//     // ── Batch subcollection reads ─────────────────────────────────────────────
//     const voteMap = new Map<string, string | null>();
//     const likeMap = new Map<string, boolean>();
//     const reactionMap = new Map<string, string | null>();
//     const quizMap = new Map<string, string | null>();

//     if (includeUserState) {
//       const docs = snapshot.docs;

//       const voteIndices: number[] = [];
//       const likeIndices: number[] = [];
//       const quizIndices: number[] = [];

//       docs.forEach((d, i) => {
//         const type = (d.data() as Post).type;
//         if (VOTABLE_TYPES.has(type)) voteIndices.push(i);
//         if (isLikeable(type)) likeIndices.push(i);
//         if (type === "quiz") quizIndices.push(i);
//       });

//       const voteRefs = voteIndices.map((i) => docs[i].ref.collection("roarVotes").doc(resolvedUserId));
//       const likeRefs = likeIndices.map((i) => docs[i].ref.collection("likes").doc(resolvedUserId));
//       const quizRefs = quizIndices.map((i) => docs[i].ref.collection("quizAnswers").doc(resolvedUserId));

//       const [voteSnaps, likeSnaps, quizSnaps] = await Promise.all([
//         Promise.all(voteRefs.map((r) => r.get())),
//         Promise.all(likeRefs.map((r) => r.get())),
//         Promise.all(quizRefs.map((r) => r.get())),
//       ]);

//       voteIndices.forEach((docIdx, resultIdx) => {
//         const s = voteSnaps[resultIdx];
//         voteMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).vote ?? null) : null);
//       });

//       // ── Likes: capture both existence AND reaction type in one pass ──────────
//       likeIndices.forEach((docIdx, resultIdx) => {
//         const s = likeSnaps[resultIdx];
//         const id = docs[docIdx].id;
//         likeMap.set(id, s.exists);
//         // Legacy docs created before reaction support default to "heart"
//         reactionMap.set(id, s.exists ? ((s.data() as any).reaction ?? "heart") : null);
//       });

//       quizIndices.forEach((docIdx, resultIdx) => {
//         const s = quizSnaps[resultIdx];
//         quizMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).selectedOption ?? null) : null);
//       });
//     }

//     // ── Assemble response ─────────────────────────────────────────────────────
//     const posts = snapshot.docs.map((doc) => {
//       const data = doc.data() as Post;
//       const userVote = voteMap.get(doc.id) ?? null;
//       const userLiked = likeMap.get(doc.id) ?? false;
//       const userReaction = reactionMap.get(doc.id) ?? null;
//       const quizUserAnswer = quizMap.get(doc.id) ?? null;

//       return {
//         ...data,
//         postId: doc.id,
//         likeCount: data.likeCount ?? 0,
//         ...(includeUserState && { userVote, userLiked, userReaction, quizUserAnswer }),
//         // Hide correct answer until the user has answered
//         quizCorrectOption:
//           data.type === "quiz" && !quizUserAnswer ? undefined : data.quizCorrectOption,
//       };
//     });

//     const lastPost = posts[posts.length - 1];

//     return NextResponse.json({
//       success: true,
//       posts,
//       pagination: {
//         limit,
//         hasMore: posts.length === limit,
//         nextCursor: posts.length === limit ? { lastCreatedAt: lastPost?.createdAt ?? null } : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/posts error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // POST  /api/roar/posts

// export async function POST(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const body = await req.json();
//     const {
//       type,
//       text,
//       sport = "cricket",
//       sideA,
//       sideB,
//       matchId,
//       confidence,
//       audience = "Everyone",
//       mediaUrls,
//       quizQuestion,
//       quizOptions,
//       quizCorrectOption,
//       quizTimer,
//       quizPoints,
//       memGifUrl,
//       memTag,
//     }: {
//       type: PostType;
//       text: string;
//       sport: SportType;
//       sideA?: string;
//       sideB?: string;
//       matchId?: string;
//       confidence?: number;
//       audience?: string;
//       mediaUrls?: string[];
//       quizQuestion?: string;
//       quizOptions?: { label: string; text: string }[];
//       quizCorrectOption?: string;
//       quizTimer?: number;
//       quizPoints?: number;
//       memGifUrl?: string;
//       memTag?: string;
//     } = body;

//     if (!type || (!text?.trim() && !quizQuestion?.trim() && (!mediaUrls || mediaUrls.length === 0))) {
//       return NextResponse.json({ error: "type and text (or quiz question) are required" }, { status: 400 });
//     }

//     const resolved = await resolveUser(user.email, user.userId);
//     if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

//     const { resolvedId: resolvedUserId, snap: userSnap, ref: userDocRef, derivedUserName } = resolved;
//     const userData = userSnap.data() as { username?: string; badge: string; [key: string]: any };

//     // Prefer the doc's own `username` field; fall back to getUserInfo's
//     // *cleaned* derived name if the doc doesn't have one set (legacy/partial
//     // profiles). derivedUserName is already cleaned inside resolveUser().
//     const resolvedUsername = userData.username || derivedUserName;

//     const now = Date.now();
//     const postRef = db.collection("roarPosts").doc();

//     const newPost: Post = {
//       postId: postRef.id,
//       authorUid: resolvedUserId,
//       authorUsername: resolvedUsername,
//       authorBadge: userData.badge,
//       type,
//       sport,
//       text: text?.trim() || quizQuestion?.trim() || "",
//       ...(sideA && { sideA }),
//       ...(sideB && { sideB }),
//       ...(type === "prediction" && Array.isArray(predictionOptions) && { predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6) }),
//       ...(matchId && { matchId }),
//       ...(confidence !== undefined && { confidence }),
//       ...(quizQuestion && { quizQuestion }),
//       ...(quizOptions && { quizOptions }),
//       ...(quizCorrectOption && { quizCorrectOption }),
//       ...(quizTimer && { quizTimer }),
//       ...(quizPoints && { quizPoints }),
//       ...(memGifUrl && { memGifUrl }),
//       ...(memTag && { memTag }),
//       quizParticipants: 0,
//       audience,
//       agreeCount: 0,
//       disagreeCount: 0,
//       replyCount: 0,
//       isLive: false,
//       status: "active",
//       mediaUrls: mediaUrls || [],
//       createdAt: now,
//       updatedAt: now,
//     };

//     const batch = db.batch();
//     batch.set(postRef, newPost);

//     // Single update() call on userDocRef — Firestore counts this as one
//     // write regardless of how many fields are in the object, and a batch
//     // must not call update() twice on the same ref (the second call would
//     // silently overwrite the first's field map in some SDKs). Merging the
//     // counter increment and the username backfill into one object keeps
//     // this at exactly 1 write to this doc, same as before the fix.
//     const counterField = type === "prediction" ? "predictionCount" : "hotTakeCount";
//     const userDocUpdate: Record<string, unknown> = {
//       [counterField]: FieldValue.increment(1),
//       updatedAt: now,
//     };
//     // Backfill the user doc's own `username` field if it was missing, so
//     // future reads (here and elsewhere) don't need the fallback at all.
//     // Uses the already-cleaned derivedUserName — never the raw email-local
//     // part — so the stored field doesn't perpetuate the underscore bug.
//     if (!userData.username && derivedUserName) {
//       userDocUpdate.username = derivedUserName;
//     }
//     batch.update(userDocRef, userDocUpdate);

//     await batch.commit();

//     // Award points — non-fatal, fire-and-forget
//     awardRoarPoints({
//       actualUserId: resolvedUserId,
//       authUserId: user.userId,
//       userName: resolvedUsername,
//       userEmail: user.email,
//       userExists: true,
//       postType: type,
//       transactionId: `roar_post_${postRef.id}`,
//       metadata: { postId: postRef.id, sport },
//     }).catch((err) => console.error("Failed to award points for post:", err));

//     return NextResponse.json({ success: true, postId: postRef.id, post: newPost });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/posts error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }







// api/roar/posts/route.ts
//
// GET  /api/roar/posts?filter=For+You&limit=30&lastCreatedAt=xxx
// GET  /api/roar/posts?sport=cricket&limit=30&lastCreatedAt=xxx   (legacy form, still works)
// POST /api/roar/posts
//

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { FieldValue } from "firebase-admin/firestore";
import { awardRoarPoints } from "@/lib/roarPoints";
import { getUserInfo } from "@/lib/userPoints";
import type { Post, PostType, SportType } from "@/app/models/Post";

// ── Post types that support agree/disagree voting ─────────────────────────────
const VOTABLE_TYPES = new Set<PostType>(["hot_take", "prediction", "debate"]);

const isLikeable = (_type: PostType) => true;

// ── filter param → query clause mapping (from feed/route.ts) ─────────────────
const SPORT_FILTERS: Record<string, string> = { Cricket: "cricket", Football: "football" };
const TYPE_FILTERS: Record<string, PostType> = {
  Predictions: "prediction",
  Debates: "debate",
  "Hot Takes": "hot_take",
  Quizzes: "quiz",
};

type PredictionCloseCandidate = Partial<Post> & { authorUid?: string };

function cleanDisplayName(raw: string | undefined | null): string {
  if (!raw) return "RoarUser";

  let name = raw.trim();
  if (!name) return "RoarUser";
  name = name.replace(/_[a-z0-9-]+_(com|net|org|io|co)$/i, "");

  // Replace underscores/dots (typical email-local-part separators) with
  // spaces, collapse repeats, trim.
  name = name.replace(/[_.]+/g, " ").replace(/\s+/g, " ").trim();

  if (!name) return "RoarUser";

  name = name
    .split(" ")
    .map((word) =>
      /[A-Z]/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");

  return name;
}

async function resolveUser(
  email: string,
  uid: string
): Promise<{
  resolvedId: string;
  snap: FirebaseFirestore.DocumentSnapshot;
  ref: FirebaseFirestore.DocumentReference;
  derivedUserName: string;
} | null> {
  const info = await getUserInfo(uid, undefined, email);
  if (!info.exists) return null;

  const ref = db.collection("users").doc(info.actualUserId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  return {
    resolvedId: info.actualUserId,
    snap,
    ref,
    derivedUserName: cleanDisplayName(info.userName),
  };
}

async function markExpiredPredictionClosed(postId: string, post: PredictionCloseCandidate, now: number) {
  if (post.type !== "prediction" || !post.authorUid || !post.closesAt || post.closesAt > now || post.closedAt || post.resolvedAt) return;

  const postRef = db.collection("roarPosts").doc(postId);

  await db.runTransaction(async (tx) => {
    const freshPostSnap = await tx.get(postRef);
    if (!freshPostSnap.exists) return;
    const freshPost = freshPostSnap.data() as PredictionCloseCandidate;
    const latestNow = Date.now();
    if (freshPost.type !== "prediction" || freshPost.resolvedAt || freshPost.closedAt || !freshPost.closesAt || freshPost.closesAt > latestNow) return;

    tx.update(postRef, { closedAt: latestNow, updatedAt: latestNow });

    const notificationRef = db
      .collection("notifications")
      .doc(freshPost.authorUid)
      .collection("items")
      .doc(`roar_prediction_closed_${postId}`);
    const summaryRef = db.collection("notifications").doc(freshPost.authorUid).collection("meta").doc("summary");

    tx.set(notificationRef, {
      type: "ROAR_PREDICTION_RESOLVE_READY",
      title: "Prediction closed",
      subtitle: `Resolve now: ${String(freshPost.text ?? "Your prediction").slice(0, 90)}`,
      cta: "Resolve now",
      postId,
      postPreview: String(freshPost.text ?? "").slice(0, 120),
      read: false,
      createdAt: latestNow,
      updatedAt: latestNow,
    }, { merge: true });
    tx.set(summaryRef, { unreadCount: FieldValue.increment(1) }, { merge: true });
  });
}
// GET  /api/roar/posts

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
    const sport = searchParams.get("sport");
    const filter = searchParams.get("filter"); // ← NEW, from feed/route.ts
    const lastCreatedAt = searchParams.get("lastCreatedAt")
      ? parseInt(searchParams.get("lastCreatedAt")!, 10)
      : null;
    const includeUserState = searchParams.get("includeUserState") !== "false";

    // ── Build posts query ─────────────────────────────────────────────────────
    // status == "active" is always applied now (carried over from feed/route.ts).
    let postsQuery: FirebaseFirestore.Query = db
      .collection("roarPosts")
      .where("status", "==", "active");

    if (filter && SPORT_FILTERS[filter]) {
      postsQuery = postsQuery.where("sport", "==", SPORT_FILTERS[filter]);
    } else if (filter && TYPE_FILTERS[filter]) {
      postsQuery = postsQuery.where("type", "==", TYPE_FILTERS[filter]);
    } else if (filter === "Live") {
      postsQuery = postsQuery.where("isLive", "==", true);
    } else if (sport) {
      // legacy plain ?sport= param, unchanged behavior
      postsQuery = postsQuery.where("sport", "==", sport);
    }
    // filter === "For You" (or no filter/sport at all) → no extra where()

    postsQuery = postsQuery.orderBy("createdAt", "desc").limit(limit);

    if (lastCreatedAt !== null) {
      postsQuery = postsQuery.startAfter(lastCreatedAt);
    }

    // ── Fire user resolution + posts query in parallel ────────────────────────
    const [resolved, snapshot] = await Promise.all([
      resolveUser(user.email, user.userId),
      postsQuery.get(),
    ]);

    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    const { resolvedId: resolvedUserId } = resolved;

    if (snapshot.empty) {
      return NextResponse.json({
        success: true,
        posts: [],
        pagination: { limit, hasMore: false, nextCursor: null },
      });
    }

    const closeNotificationsSettled = Date.now();
    await Promise.all(snapshot.docs.map((doc) => markExpiredPredictionClosed(doc.id, doc.data() as PredictionCloseCandidate, closeNotificationsSettled)));

    // ── Batch subcollection reads ─────────────────────────────────────────────
    const voteMap = new Map<string, string | null>();
    const likeMap = new Map<string, boolean>();
    const reactionMap = new Map<string, string | null>();
    const quizMap = new Map<string, string | null>();

    if (includeUserState) {
      const docs = snapshot.docs;

      const voteIndices: number[] = [];
      const likeIndices: number[] = [];
      const quizIndices: number[] = [];

      docs.forEach((d, i) => {
        const type = (d.data() as Post).type;
        if (VOTABLE_TYPES.has(type)) voteIndices.push(i);
        if (isLikeable(type)) likeIndices.push(i);
        if (type === "quiz") quizIndices.push(i);
      });

      const voteRefs = voteIndices.map((i) => docs[i].ref.collection("roarVotes").doc(resolvedUserId));
      const likeRefs = likeIndices.map((i) => docs[i].ref.collection("likes").doc(resolvedUserId));
      const quizRefs = quizIndices.map((i) => docs[i].ref.collection("quizAnswers").doc(resolvedUserId));

      const [voteSnaps, likeSnaps, quizSnaps] = await Promise.all([
        Promise.all(voteRefs.map((r) => r.get())),
        Promise.all(likeRefs.map((r) => r.get())),
        Promise.all(quizRefs.map((r) => r.get())),
      ]);

      voteIndices.forEach((docIdx, resultIdx) => {
        const s = voteSnaps[resultIdx];
        voteMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).vote ?? null) : null);
      });

      // ── Likes: capture both existence AND reaction type in one pass ──────────
      likeIndices.forEach((docIdx, resultIdx) => {
        const s = likeSnaps[resultIdx];
        const id = docs[docIdx].id;
        likeMap.set(id, s.exists);
        // Legacy docs created before reaction support default to "heart"
        reactionMap.set(id, s.exists ? ((s.data() as any).reaction ?? "heart") : null);
      });

      quizIndices.forEach((docIdx, resultIdx) => {
        const s = quizSnaps[resultIdx];
        quizMap.set(docs[docIdx].id, s.exists ? ((s.data() as any).selectedOption ?? null) : null);
      });
    }

    // ── Batch-fetch live avatarUrl/badge per unique author ────────────────────
    // Posts never store these at creation time (see POST handler below — no
    // authorAvatarUrl field is ever written), so every author's CURRENT
    // avatar/badge is resolved here on every read instead, using the same
    // dedupe-then-Promise.all batching pattern as the vote/like/quiz reads
    // above. This means avatar changes show up everywhere immediately,
    // including on posts made before the change, and including for the
    // post's own author (no more special-casing authorUid === currentUserId
    // on the client — every author, including "you", is resolved the same way).
    const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
    const uniqueAuthorUids = Array.from(
      new Set(snapshot.docs.map((d) => (d.data() as Post).authorUid))
    );

    const authorSnaps = await Promise.all(
      uniqueAuthorUids.map((uid) => db.collection("users").doc(uid).get())
    );

    uniqueAuthorUids.forEach((uid, i) => {
      const s = authorSnaps[i];
      const data = s.exists ? (s.data() as any) : null;
      authorMap.set(uid, {
        avatarUrl: data?.avatarUrl ?? null,
        badge: data?.badge ?? null,
      });
    });

    // ── Assemble response ─────────────────────────────────────────────────────
    const posts = snapshot.docs.map((doc) => {
      const data = doc.data() as Post;
      const userVote = voteMap.get(doc.id) ?? null;
      const userLiked = likeMap.get(doc.id) ?? false;
      const userReaction = reactionMap.get(doc.id) ?? null;
      const quizUserAnswer = quizMap.get(doc.id) ?? null;
      const author = authorMap.get(data.authorUid);

      const effectiveClosedAt = data.type === "prediction" && !data.resolvedAt && data.closesAt && data.closesAt <= Date.now() ? (data.closedAt ?? data.closesAt) : data.closedAt;

      return {
        ...data,
        ...(effectiveClosedAt && { closedAt: effectiveClosedAt }),
        postId: doc.id,
        likeCount: data.likeCount ?? 0,
        // Live-resolved, not stored-on-post. authorAvatarUrl is intentionally
        // null (not a stale fallback) when the author's user doc has none set.
        authorAvatarUrl: author?.avatarUrl ?? null,
        // authorBadge falls back to the stamped-at-creation value only if the
        // live user doc lookup came back empty (e.g. deleted user doc), so an
        // old post doesn't lose its badge entirely.
        authorBadge: author?.badge ?? data.authorBadge,
        ...(includeUserState && { userVote, userLiked, userReaction, quizUserAnswer }),
        // Hide correct answer until the user has answered
        quizCorrectOption:
          data.type === "quiz" && !quizUserAnswer ? undefined : data.quizCorrectOption,
      };
    });

    const lastPost = posts[posts.length - 1];

    return NextResponse.json({
      success: true,
      posts,
      pagination: {
        limit,
        hasMore: posts.length === limit,
        nextCursor: posts.length === limit ? { lastCreatedAt: lastPost?.createdAt ?? null } : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/posts error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST  /api/roar/posts

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      type,
      text,
      sport = "cricket",
      sideA,
      sideB,
      matchId,
      confidence,
      audience = "Everyone",
      mediaUrls,
      quizQuestion,
      quizOptions,
      quizCorrectOption,
      quizTimer,
      quizPoints,
      memGifUrl,
      memTag,
      closesAt,
      closeAfterMinutes,
      predictionOptions,
    }: {
      type: PostType;
      text: string;
      sport: SportType;
      sideA?: string;
      sideB?: string;
      matchId?: string;
      confidence?: number;
      audience?: string;
      mediaUrls?: string[];
      quizQuestion?: string;
      quizOptions?: { label: string; text: string }[];
      quizCorrectOption?: string;
      quizTimer?: number;
      quizPoints?: number;
      memGifUrl?: string;
      memTag?: string;
      closesAt?: number;
      closeAfterMinutes?: number;
      predictionOptions?: string[];
    } = body;

    if (!type || (!text?.trim() && !quizQuestion?.trim() && (!mediaUrls || mediaUrls.length === 0))) {
      return NextResponse.json({ error: "type and text (or quiz question) are required" }, { status: 400 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const { resolvedId: resolvedUserId, snap: userSnap, ref: userDocRef, derivedUserName } = resolved;
    const userData = userSnap.data() as { username?: string; badge: string; [key: string]: any };

    // Prefer the doc's own `username` field; fall back to getUserInfo's
    // *cleaned* derived name if the doc doesn't have one set (legacy/partial
    // profiles). derivedUserName is already cleaned inside resolveUser().
    const resolvedUsername = userData.username || derivedUserName;

    const now = Date.now();
    const normalizedCloseAfter = Number(closeAfterMinutes);
    const requestedClosesAt = Number(closesAt);
    const predictionClosesAt = type === "prediction"
      ? (Number.isFinite(requestedClosesAt) && requestedClosesAt > now
        ? requestedClosesAt
        : now + Math.max(1, Math.min(10080, Number.isFinite(normalizedCloseAfter) ? normalizedCloseAfter : 60)) * 60 * 1000)
      : undefined;
    const postRef = db.collection("roarPosts").doc();
    const newPost: Post = {
      postId: postRef.id,
      authorUid: resolvedUserId,
      authorUsername: resolvedUsername,
      authorBadge: userData.badge,
      authorEmail: user.email,
      type,
      sport,
      text: text?.trim() || quizQuestion?.trim() || "",
      ...(sideA && { sideA }),
      ...(sideB && { sideB }),
      ...(type === "prediction" && Array.isArray(predictionOptions) && { predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6) }),
      ...(matchId && { matchId }),
      ...(confidence !== undefined && { confidence }),
      ...(quizQuestion && { quizQuestion }),
      ...(quizOptions && { quizOptions }),
      ...(quizCorrectOption && { quizCorrectOption }),
      ...(quizTimer && { quizTimer }),
      ...(quizPoints && { quizPoints }),
      ...(memGifUrl && { memGifUrl }),
      ...(memTag && { memTag }),
      ...(predictionClosesAt && { closesAt: predictionClosesAt }),
      quizParticipants: 0,
      audience,
      agreeCount: 0,
      disagreeCount: 0,
      replyCount: 0,
      isLive: false,
      status: "active",
      mediaUrls: mediaUrls || [],
      createdAt: now,
      updatedAt: now,
    };

    const batch = db.batch();
    batch.set(postRef, newPost);

    // Single update() call on userDocRef — Firestore counts this as one
    // write regardless of how many fields are in the object, and a batch
    // must not call update() twice on the same ref (the second call would
    // silently overwrite the first's field map in some SDKs). Merging the
    // counter increment and the username backfill into one object keeps
    // this at exactly 1 write to this doc, same as before the fix.
    const counterField = type === "prediction" ? "predictionCount" : "hotTakeCount";
    const userDocUpdate: Record<string, unknown> = {
      [counterField]: FieldValue.increment(1),
      updatedAt: now,
    };
    // Backfill the user doc's own `username` field if it was missing, so
    // future reads (here and elsewhere) don't need the fallback at all.
    // Uses the already-cleaned derivedUserName — never the raw email-local
    // part — so the stored field doesn't perpetuate the underscore bug.
    if (!userData.username && derivedUserName) {
      userDocUpdate.username = derivedUserName;
    }
    batch.update(userDocRef, userDocUpdate);

    await batch.commit();

    // Award points — non-fatal, fire-and-forget
    awardRoarPoints({
      actualUserId: resolvedUserId,
      authUserId: user.userId,
      userName: resolvedUsername,
      userEmail: user.email,
      userExists: true,
      postType: type,
      transactionId: `roar_post_${postRef.id}`,
      metadata: { postId: postRef.id, sport },
    }).catch((err) => console.error("Failed to award points for post:", err));

    return NextResponse.json({ success: true, postId: postRef.id, post: newPost });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/posts error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
