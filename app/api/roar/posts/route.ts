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
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, UpdateCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import type { Post, PostType, SportType } from "@/app/models/Post";

export const dynamic = "force-dynamic";

// ── Post types that support agree/disagree voting ─────────────────────────────
const VOTABLE_TYPES = new Set<PostType>(["hot_take", "prediction", "debate"]);

const isLikeable = (_type: PostType) => true;

// ── filter param → query clause mapping ───────────────────────────────────────
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

  // Replace underscores/dots with spaces, collapse repeats, trim.
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
  snap?: FirebaseFirestore.DocumentSnapshot;
  ref?: FirebaseFirestore.DocumentReference;
  userData: { username?: string; badge: string; [key: string]: any };
  derivedUserName: string;
} | null> {
  const info = await getUserInfo(uid, undefined, email);
  if (!info.exists) return null;

  let userData: any = null;
  let snap: FirebaseFirestore.DocumentSnapshot | undefined;
  const ref = db.collection("users").doc(info.actualUserId);

  // 1. Try DynamoDB
  try {
    const userRes = await docClient.send(new GetCommand({
      TableName: "IdentityAndAccess",
      Key: {
        entityId: `USER#${info.actualUserId}`,
        sk: "USER#META"
      }
    }));
    if (userRes.Item) {
      userData = userRes.Item;
    }
  } catch (dynErr) {
    console.warn("[Posts resolveUser] DynamoDB lookup failed:", dynErr);
  }

  // 2. Fallback to Firestore
  if (!userData) {
    try {
      snap = await ref.get();
      if (snap.exists) {
        userData = snap.data();
      }
    } catch (fsErr) {
      console.warn("[Posts resolveUser] Firestore fallback failed:", fsErr);
    }
  }

  if (!userData) return null;

  return {
    resolvedId: info.actualUserId,
    snap,
    ref,
    userData: {
      ...userData,
      badge: userData.badge || "FAN"
    },
    derivedUserName: cleanDisplayName(info.userName),
  };
}

async function markExpiredPredictionClosed(postId: string, post: PredictionCloseCandidate, now: number) {
  if (post.type !== "prediction" || !post.authorUid || !post.closesAt || post.closesAt > now || post.closedAt || post.resolvedAt) return;

  const latestNow = Date.now();

  // 1. Update in DynamoDB first
  try {
    await docClient.send(new UpdateCommand({
      TableName: "SocialAndContent",
      Key: {
        contentId: `POST#${postId}`,
        sk: `POST#META`
      },
      UpdateExpression: "SET closedAt = :now, updatedAt = :now",
      ExpressionAttributeValues: { ":now": latestNow }
    }));
  } catch (dynErr) {
    console.warn("[markExpiredPredictionClosed] DynamoDB update failed:", dynErr);
  }

  // 2. Sync to Firestore
  try {
    const postRef = db.collection("roarPosts").doc(postId);
    await db.runTransaction(async (tx) => {
      const freshPostSnap = await tx.get(postRef);
      if (!freshPostSnap.exists) return;
      const freshPost = freshPostSnap.data() as PredictionCloseCandidate;
      if (freshPost.type !== "prediction" || freshPost.resolvedAt || freshPost.closedAt || !freshPost.closesAt || freshPost.closesAt > latestNow || !freshPost.authorUid) return;

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
  } catch (fsErr) {
    console.warn("[markExpiredPredictionClosed] Firestore fallback failed:", fsErr);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET  /api/roar/posts
// ────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
    const sport = searchParams.get("sport");
    const filter = searchParams.get("filter");
    const lastCreatedAt = searchParams.get("lastCreatedAt")
      ? parseInt(searchParams.get("lastCreatedAt")!, 10)
      : null;
    const includeUserState = searchParams.get("includeUserState") !== "false";

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    const { resolvedId: resolvedUserId } = resolved;

    let posts: Post[] = [];
    let fetchedFromDynamo = false;

    // 1. Query DynamoDB using status-createdAt-index
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        IndexName: "status-createdAt-index",
        KeyConditionExpression: "#s = :active",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":active": "active" },
        ScanIndexForward: false,
        Limit: 500
      }));

      if (res.Items && res.Items.length > 0) {
        posts = res.Items.map((item) => ({
          ...(item as any),
          postId: item.postId || (item.contentId as string).replace(/^POST#/, "")
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Posts GET] DynamoDB query failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
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
          postsQuery = postsQuery.where("sport", "==", sport);
        }

        postsQuery = postsQuery.orderBy("createdAt", "desc").limit(500);

        const snapshot = await postsQuery.get();
        posts = snapshot.docs.map((doc) => ({
          ...(doc.data() as Post),
          postId: doc.id,
        }));
      } catch (fsErr) {
        console.error("[Posts GET] Firestore fallback failed:", fsErr);
      }
    }

    // Filter in-memory if loaded from DynamoDB
    if (fetchedFromDynamo) {
      if (filter && SPORT_FILTERS[filter]) {
        posts = posts.filter((p) => p.sport === SPORT_FILTERS[filter]);
      } else if (filter && TYPE_FILTERS[filter]) {
        posts = posts.filter((p) => p.type === TYPE_FILTERS[filter]);
      } else if (filter === "Live") {
        posts = posts.filter((p) => p.isLive === true);
      } else if (sport) {
        posts = posts.filter((p) => p.sport === sport);
      }
    }

    // Sort by createdAt desc
    posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Apply cursor pagination
    if (lastCreatedAt !== null) {
      const idx = posts.findIndex((p) => (p.createdAt || 0) < lastCreatedAt);
      posts = idx !== -1 ? posts.slice(idx) : [];
    }

    const paginatedPosts = posts.slice(0, limit);

    if (paginatedPosts.length === 0) {
      return NextResponse.json({
        success: true,
        posts: [],
        pagination: { limit, hasMore: false, nextCursor: null },
      });
    }

    const closeNotificationsSettled = Date.now();
    await Promise.all(
      paginatedPosts.map((p) => markExpiredPredictionClosed(p.postId, p as PredictionCloseCandidate, closeNotificationsSettled))
    );

    // ── Batch subcollection reads ─────────────────────────────────────────────
    const voteMap = new Map<string, string | null>();
    const likeMap = new Map<string, boolean>();
    const reactionMap = new Map<string, string | null>();
    const quizMap = new Map<string, string | null>();

    if (includeUserState) {
      await Promise.all(
        paginatedPosts.map(async (p) => {
          const type = p.type;
          const postId = p.postId;

          // 1. Vote check
          if (VOTABLE_TYPES.has(type)) {
            let vote: string | null = null;
            let fetchedVote = false;
            try {
              const voteRes = await docClient.send(new GetCommand({
                TableName: "SocialAndContent",
                Key: { contentId: `POST#${postId}`, sk: `VOTE#${resolvedUserId}` }
              }));
              if (voteRes.Item) {
                vote = voteRes.Item.vote ?? null;
                fetchedVote = true;
              }
            } catch (e) {}

            if (!fetchedVote) {
              try {
                const voteSnap = await db.collection("roarPosts").doc(postId).collection("roarVotes").doc(resolvedUserId).get();
                if (voteSnap.exists) {
                  vote = (voteSnap.data() as any)?.vote ?? null;
                }
              } catch (e) {}
            }
            voteMap.set(postId, vote);
          }

          // 2. Like check
          if (isLikeable(type)) {
            let liked = false;
            let reaction: string | null = null;
            let fetchedLike = false;
            try {
              const likeRes = await docClient.send(new GetCommand({
                TableName: "SocialAndContent",
                Key: { contentId: `POST#${postId}`, sk: `LIKE#${resolvedUserId}` }
              }));
              if (likeRes.Item) {
                liked = true;
                reaction = likeRes.Item.reaction ?? "heart";
                fetchedLike = true;
              }
            } catch (e) {}

            if (!fetchedLike) {
              try {
                const likeSnap = await db.collection("roarPosts").doc(postId).collection("likes").doc(resolvedUserId).get();
                if (likeSnap.exists) {
                  liked = true;
                  reaction = (likeSnap.data() as any)?.reaction ?? "heart";
                }
              } catch (e) {}
            }
            likeMap.set(postId, liked);
            reactionMap.set(postId, reaction);
          }

          // 3. Quiz answer check
          if (type === "quiz") {
            let selectedOption: string | null = null;
            let fetchedQuiz = false;
            try {
              const quizRes = await docClient.send(new GetCommand({
                TableName: "SocialAndContent",
                Key: { contentId: `POST#${postId}`, sk: `QUIZ#${resolvedUserId}` }
              }));
              if (quizRes.Item) {
                selectedOption = quizRes.Item.selectedOption ?? null;
                fetchedQuiz = true;
              }
            } catch (e) {}

            if (!fetchedQuiz) {
              try {
                const quizSnap = await db.collection("roarPosts").doc(postId).collection("quizAnswers").doc(resolvedUserId).get();
                if (quizSnap.exists) {
                  selectedOption = (quizSnap.data() as any)?.selectedOption ?? null;
                }
              } catch (e) {}
            }
            quizMap.set(postId, selectedOption);
          }
        })
      );
    }

    // ── Batch-fetch live avatarUrl/badge per unique author ────────────────────
    const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
    const uniqueAuthorUids = Array.from(new Set(paginatedPosts.map((d) => d.authorUid).filter(Boolean)));

    await Promise.all(
      uniqueAuthorUids.map(async (uid) => {
        let avatarUrl: string | null = null;
        let badge: string | null = null;
        let fetchedAuthor = false;

        try {
          const userRes = await docClient.send(new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${uid}`, sk: "USER#META" }
          }));
          if (userRes.Item) {
            avatarUrl = userRes.Item.avatarUrl ?? null;
            badge = userRes.Item.badge ?? null;
            fetchedAuthor = true;
          }
        } catch (e) {}

        if (!fetchedAuthor) {
          try {
            const snap = await db.collection("users").doc(uid).get();
            if (snap.exists) {
              const data = snap.data() as any;
              avatarUrl = data?.avatarUrl ?? null;
              badge = data?.badge ?? null;
            }
          } catch (e) {}
        }

        authorMap.set(uid, { avatarUrl, badge });
      })
    );

    // ── Assemble response ─────────────────────────────────────────────────────
    const resultPosts = paginatedPosts.map((data) => {
      const userVote = voteMap.get(data.postId) ?? null;
      const userLiked = likeMap.get(data.postId) ?? false;
      const userReaction = reactionMap.get(data.postId) ?? null;
      const quizUserAnswer = quizMap.get(data.postId) ?? null;
      const author = authorMap.get(data.authorUid);

      const effectiveClosedAt = data.type === "prediction" && !data.resolvedAt && data.closesAt && data.closesAt <= Date.now()
        ? (data.closedAt ?? data.closesAt)
        : data.closedAt;

      return {
        ...data,
        ...(effectiveClosedAt && { closedAt: effectiveClosedAt }),
        likeCount: data.likeCount ?? 0,
        authorAvatarUrl: author?.avatarUrl ?? null,
        authorBadge: author?.badge ?? data.authorBadge,
        ...(includeUserState && { userVote, userLiked, userReaction, quizUserAnswer }),
        quizCorrectOption:
          data.type === "quiz" && !quizUserAnswer ? undefined : data.quizCorrectOption,
      };
    });

    const lastPost = resultPosts[resultPosts.length - 1];

    return NextResponse.json({
      success: true,
      posts: resultPosts,
      pagination: {
        limit,
        hasMore: posts.length > limit,
        nextCursor: posts.length > limit ? { lastCreatedAt: lastPost?.createdAt ?? null } : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/posts error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// POST  /api/roar/posts
// ────────────────────────────────────────────────────────────────────────────
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

    const { resolvedId: resolvedUserId, userData, ref: userDocRef, derivedUserName } = resolved;
    const resolvedUsername = userData.username || derivedUserName;

    const now = Date.now();
    const normalizedCloseAfter = Number(closeAfterMinutes);
    const requestedClosesAt = Number(closesAt);
    const predictionClosesAt = type === "prediction"
      ? (Number.isFinite(requestedClosesAt) && requestedClosesAt > now
        ? requestedClosesAt
        : now + Math.max(1, Math.min(10080, Number.isFinite(normalizedCloseAfter) ? normalizedCloseAfter : 60)) * 60 * 1000)
      : undefined;

    const postId = `post_${Math.random().toString(36).substring(2, 15)}`;

    const newPost: Post = {
      postId,
      authorUid: resolvedUserId,
      authorUsername: resolvedUsername,
      authorBadge: userData.badge,
      authorEmail: user.email,
      type,
      sport,
      text: text?.trim() || quizQuestion?.trim() || "",
      ...(sideA && { sideA }),
      ...(sideB && { sideB }),
      ...(type === "prediction" && Array.isArray(predictionOptions) && {
        predictionOptions: predictionOptions.map((option) => String(option).trim()).filter(Boolean).slice(0, 6)
      }),
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
      likeCount: 0,
      isLive: false,
      status: "active",
      mediaUrls: mediaUrls || [],
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put to DynamoDB SocialAndContent table
    try {
      await docClient.send(new PutCommand({
        TableName: "SocialAndContent",
        Item: {
          contentId: `POST#${postId}`,
          sk: `POST#META`,
          ...newPost
        }
      }));

      // Increment user counter in IdentityAndAccess table
      const counterField = type === "prediction" ? "predictionCount" : "hotTakeCount";
      await docClient.send(new UpdateCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: `USER#${resolvedUserId}`, sk: "USER#META" },
        UpdateExpression: "ADD #cnt :one SET updatedAt = :now",
        ExpressionAttributeNames: { "#cnt": counterField },
        ExpressionAttributeValues: { ":one": 1, ":now": now }
      })).catch(() => {});
    } catch (dynErr) {
      console.warn("[Posts POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const postRef = db.collection("roarPosts").doc(postId);
      const batch = db.batch();
      batch.set(postRef, newPost);

      const counterField = type === "prediction" ? "predictionCount" : "hotTakeCount";
      const userDocUpdate: Record<string, unknown> = {
        [counterField]: FieldValue.increment(1),
        updatedAt: now,
      };
      if (!userData.username && derivedUserName) {
        userDocUpdate.username = derivedUserName;
      }
      if (userDocRef) {
        batch.update(userDocRef, userDocUpdate);
      }

      await batch.commit();
    } catch (fsErr) {
      console.warn("[Posts POST] Firestore sync failed:", fsErr);
    }

    // Award points — non-fatal, fire-and-forget
    awardRoarPoints({
      actualUserId: resolvedUserId,
      authUserId: user.userId,
      userName: resolvedUsername,
      userEmail: user.email,
      userExists: true,
      postType: type,
      transactionId: `roar_post_${postId}`,
      metadata: { postId, sport },
    }).catch((err) => console.error("Failed to award points for post:", err));

    return NextResponse.json({ success: true, postId, post: newPost });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/posts error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
