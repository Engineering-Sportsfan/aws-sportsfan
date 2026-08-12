// app/api/roar/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { Post } from "@/app/models/Post";
import {
  getGlobalTier,
  getGlobalTierProgress,
  getAllFeatureBadges,
  getSpecialBadges,
  FEATURE_ICONS,
  FeatureKey,
} from "@/lib/roarBadges";

export const dynamic = "force-dynamic";

// ── Canonical doc resolution ──
async function resolveUserDoc(userId: string, email: string) {
  // Try direct lookup from DynamoDB first
  try {
    const getRes = await docClient.send(new GetCommand({
      TableName: "IdentityAndAccess",
      Key: { entityId: `USER#${userId}`, sk: "USER#META" }
    }));
    if (getRes.Item) {
      return { id: userId, data: getRes.Item };
    }
  } catch (dynErr) {
    console.warn("[profile resolveUserDoc] DynamoDB direct get failed:", dynErr);
  }

  // Try direct lookup with email as partition key next
  if (email && email !== userId) {
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: `USER#${email}`, sk: "USER#META" }
      }));
      if (getRes.Item) {
        return { id: email, data: getRes.Item };
      }
    } catch (dynErr) {
      console.warn("[profile resolveUserDoc] DynamoDB direct get by email failed:", dynErr);
    }
  }

  // Check by email in DynamoDB GSI
  if (email) {
    try {
      const emailRes = await docClient.send(new QueryCommand({
        TableName: "IdentityAndAccess",
        IndexName: "email-index",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: { ":email": email },
        Limit: 5
      }));
      if (emailRes.Items && emailRes.Items.length > 0) {
        const metaItem = emailRes.Items.find(item => item.sk === "USER#META");
        const item = metaItem || emailRes.Items[0];
        const uid = (item.entityId as string).replace(/^USER#/, "");
        return { id: uid, data: item };
      }
    } catch (dynErr) {
      console.warn("[profile resolveUserDoc] DynamoDB email GSI check failed:", dynErr);
    }
  }

  // Fallback to Firestore
  let docRef = db.collection("users").doc(userId);
  let snap = await docRef.get();
  if (!snap.exists) {
    docRef = db.collection("users").doc(email);
    snap = await docRef.get();
    if (!snap.exists) return null;
  }
  return { id: docRef.id, data: snap.data() };
}

// GET: Inquire profile stats
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");

    let resolvedUserId = "";
    let userData: any = null;

    if (targetUserId) {
      const info = await getUserInfo(targetUserId);
      if (!info.exists) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      resolvedUserId = info.actualUserId;

      // Load profile details from DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${resolvedUserId}`, sk: "USER#META" }
        }));
        if (getRes.Item) {
          userData = getRes.Item;
        } else {
          const resolved = await resolveUserDoc(resolvedUserId, resolvedUserId.includes("@") ? resolvedUserId : "");
          if (resolved) {
            userData = resolved.data;
          }
        }
      } catch (dynErr) {
        console.warn("[profile GET] DynamoDB target user get failed:", dynErr);
      }

      if (!userData) {
        const snap = await db.collection("users").doc(resolvedUserId).get();
        if (snap.exists) {
          userData = snap.data();
        }
      }
    } else {
      // Self
      const resolved = await resolveUserDoc(user.userId, user.email);
      if (!resolved) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      resolvedUserId = resolved.id;
      userData = resolved.data;
    }

    if (!userData) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let posts: any[] = [];
    let rivalData: any = null;
    let fetchedPostsFromDynamo = false;
    let fetchedRivalsFromDynamo = false;

    // 1. Try fetching posts and rivals from DynamoDB first
    try {
      const keys = [`USER#${resolvedUserId}`, resolvedUserId];
      const postsPromises = keys.map(k => docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        IndexName: "authorId-createdAt-index",
        KeyConditionExpression: "authorId = :a",
        ExpressionAttributeValues: { ":a": k }
      })));

      const results = await Promise.all(postsPromises);
      const allDynamoPosts = results.flatMap(r => r.Items || []);
      if (allDynamoPosts.length > 0) {
        const seen = new Set();
        posts = allDynamoPosts
          .map(item => ({
            ...item,
            postId: (item.contentId as string).replace(/^POST#/, "")
          }))
          .filter(p => {
            if (seen.has(p.postId)) return false;
            seen.add(p.postId);
            return true;
          });
        fetchedPostsFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[profile GET] DynamoDB posts fetch failed:", dynErr);
    }

    try {
      const getRival = await docClient.send(new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `RIVAL#${resolvedUserId}`, sk: `RIVAL#${resolvedUserId}` }
      }));
      if (getRival.Item) {
        rivalData = getRival.Item;
        fetchedRivalsFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[profile GET] DynamoDB rivals fetch failed:", dynErr);
    }

    // 2. Fallbacks
    if (!fetchedPostsFromDynamo) {
      try {
        const postsSnap = await db.collection("roarPosts").where("authorUid", "==", resolvedUserId).get();
        posts = postsSnap.docs.map((d) => ({ ...(d.data() as Post), postId: d.id }));
      } catch (fsErr) {
        console.error("[profile GET] Firestore posts fallback failed:", fsErr);
      }
    }

    if (!fetchedRivalsFromDynamo) {
      try {
        const rivalSnap = await db.collection("rivals").doc(resolvedUserId).get();
        rivalData = rivalSnap.exists ? rivalSnap.data() : null;
      } catch (fsErr) {
        console.error("[profile GET] Firestore rivals fallback failed:", fsErr);
      }
    }

    const predictionStats = userData.predictionStats ?? {};
    const resolvedPredictionCount = predictionStats.participated ?? 0;
    const correctPredictionCount = predictionStats.correct ?? 0;
    const accuracy = resolvedPredictionCount > 0
      ? Math.round((correctPredictionCount / resolvedPredictionCount) * 100) : 0;

    const sortedPosts = posts.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    const liveFeatureStats = userData.featureStats ?? {};
    const actCounts = {
      ROAR_POST: liveFeatureStats.post ?? userData.activityCounts?.ROAR_POST ?? 0,
      ROAR_DEBATE: liveFeatureStats.debate ?? userData.activityCounts?.ROAR_DEBATE ?? 0,
      ROAR_PREDICTION: liveFeatureStats.predictions ?? userData.activityCounts?.ROAR_PREDICTION ?? 0,
      ROAR_DEBATE_PARTICIPATE: liveFeatureStats.debate_participate ?? userData.activityCounts?.ROAR_DEBATE_PARTICIPATE ?? 0,
      ROAR_PREDICTION_PARTICIPATE: liveFeatureStats.prediction_participate ?? userData.activityCounts?.ROAR_PREDICTION_PARTICIPATE ?? 0,
      ROAR_QUIZ: liveFeatureStats.trivia ?? userData.activityCounts?.ROAR_QUIZ ?? 0,

      ROAR_TRIVIA_CORRECT: liveFeatureStats.trivia ?? userData.activityCounts?.ROAR_TRIVIA_CORRECT ?? 0,
      ROAR_BATTLE_PARTICIPATE: liveFeatureStats.battles ?? userData.activityCounts?.ROAR_BATTLE_PARTICIPATE ?? 0,
      ROAR_SHARE: liveFeatureStats.shares ?? userData.activityCounts?.ROAR_SHARE ?? 0,
      ROAR_COMMENT: liveFeatureStats.comments ?? userData.activityCounts?.ROAR_COMMENT ?? 0,
      ROAR_MEDIA_UPLOAD: liveFeatureStats.media ?? userData.activityCounts?.ROAR_MEDIA_UPLOAD ?? 0,
      likesReceived: userData.activityCounts?.likesReceived ?? 0,
    };

    const featureCounts: Partial<Record<FeatureKey, number>> = {
      post: actCounts.ROAR_POST ?? 0,
      debate: actCounts.ROAR_DEBATE_PARTICIPATE ?? 0,
      prediction: actCounts.ROAR_PREDICTION_PARTICIPATE ?? 0,
      trivia: actCounts.ROAR_TRIVIA_CORRECT ?? 0,
      fanBattle: actCounts.ROAR_BATTLE_PARTICIPATE ?? 0,
      community: actCounts.likesReceived ?? 0,
      shares: actCounts.ROAR_SHARE ?? 0,
      comments: actCounts.ROAR_COMMENT ?? 0,
      media: actCounts.ROAR_MEDIA_UPLOAD ?? 0,
    };

    const featureBadges = getAllFeatureBadges(featureCounts);
    const featureBadgesWithIcons = featureBadges.map((fb) => ({
      ...fb,
      icons: FEATURE_ICONS[fb.feature],
    }));

    const globalXp = userData.totalPoints ?? userData.reputationScore ?? 0;
    const legacyGlobalTier = getGlobalTier(globalXp);
    const globalTierProgress = getGlobalTierProgress(globalXp);

    const specialBadges = getSpecialBadges(
      {
        longestStreak: userData.longestStreak ?? userData.currentStreak ?? 0,
        hasViralPost: userData.hasViralPost ?? false,
        hasSeasonTop100: userData.hasSeasonTop100 ?? false,
        hasSeasonTop3: userData.hasSeasonTop3 ?? false,
      },
      featureBadges
    );

    return NextResponse.json({
      success: true,
      user: {
        ...userData,
        accuracy,
        predictionStats,
        predictionCount: resolvedPredictionCount,
        correctPredictions: correctPredictionCount,
        actualUserId: resolvedUserId,
        badge: userData.badge ?? null,
        favPlayer: userData.favPlayer ?? null,
        about: userData.about ?? null,
        avatarUrl: userData.avatarUrl ?? null,
        coverPhotoUrl: userData.coverPhotoUrl ?? null,

        // New Gamification Fields
        totalXP: userData.totalXP ?? globalXp,
        totalPoints: userData.totalPoints ?? globalXp,
        reputationScore: userData.reputationScore ?? globalXp,
        globalTier: userData.globalTier ?? legacyGlobalTier.tier,
        subRank: userData.subRank ?? legacyGlobalTier.subRank,
        currentLoginStreak: userData.currentLoginStreak ?? 0,
        loginStreakMultiplier: userData.loginStreakMultiplier ?? 1.0,
        streakFreezeCount: userData.streakFreezeCount ?? 0,
        featureStats: userData.featureStats ?? {},
        featureLevels: userData.featureLevels ?? {},
        isCompletionist: userData.isCompletionist ?? false,
        activityCounts: actCounts,
      },
      globalTier: legacyGlobalTier,
      globalTierProgress,
      featureBadges: featureBadgesWithIcons,
      specialBadges,
      predictions: sortedPosts.filter((p: any) => p.type === "prediction").slice(0, 20),
      hotTakes: sortedPosts.filter((p: any) => p.type === "hot_take").slice(0, 10),
      rival: rivalData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH: Update user profile settings
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: Date.now(), email: user.email };

    if (body.username !== undefined) {
      const v = String(body.username).trim().replace(/\s+/g, " ");
      if (v.length >= 2 && v.length <= 30 && /^[A-Za-z0-9_ -]+$/.test(v)) {
        updates.username = v;
      } else {
        return NextResponse.json({ error: "Invalid username." }, { status: 422 });
      }
    }

    if (body.favPlayer !== undefined) {
      updates.favPlayer = String(body.favPlayer).trim().slice(0, 60);
    }

    if (body.about !== undefined) {
      updates.about = String(body.about).trim().slice(0, 300);
    }

    if (body.avatarUrl !== undefined) {
      const v = String(body.avatarUrl).trim();
      if (v.startsWith("data:image/") || v.startsWith("https://") || v.startsWith("http://")) {
        updates.avatarUrl = v;
      } else {
        return NextResponse.json({ error: "Invalid avatarUrl." }, { status: 422 });
      }
    }

    if (body.coverPhotoUrl !== undefined) {
      const v = String(body.coverPhotoUrl).trim();
      if (v === "") {
        updates.coverPhotoUrl = null;
      } else if (v.startsWith("data:image/") || v.startsWith("https://") || v.startsWith("http://")) {
        updates.coverPhotoUrl = v;
      } else {
        return NextResponse.json({ error: "Invalid coverPhotoUrl." }, { status: 422 });
      }
    }

    if (body.showPredHistory !== undefined) {
      updates.showPredHistory = Boolean(body.showPredHistory);
    }

    if (body.showActivity !== undefined) {
      updates.showActivity = Boolean(body.showActivity);
    }

    for (const field of ["fcmToken", "settings", "teams", "sports"]) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    const meaningfulKeys = Object.keys(updates).filter((k) => k !== "updatedAt");
    if (meaningfulKeys.length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const resolved = await resolveUserDoc(user.userId, user.email);
    if (!resolved) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const resolvedUserId = resolved.id;

    // 1. Update in DynamoDB first
    try {
      let updateExpression = "SET";
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      Object.keys(updates).forEach((key, index) => {
        const valKey = `:val${index}`;
        const nameKey = `#name${index}`;
        updateExpression += ` ${nameKey} = ${valKey},`;
        expressionAttributeNames[nameKey] = key;
        expressionAttributeValues[valKey] = updates[key];
      });

      updateExpression = updateExpression.slice(0, -1);

      await docClient.send(new UpdateCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: `USER#${resolvedUserId}`, sk: "USER#META" },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      }));
    } catch (dynErr) {
      console.warn("[profile PATCH] DynamoDB update profile failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("users").doc(resolvedUserId).set(updates, { merge: true });
    } catch (fsErr) {
      console.warn("[profile PATCH] Firestore fallback update profile failed:", fsErr);
    }

    return NextResponse.json({ success: true, updatedFields: meaningfulKeys });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/roar/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}