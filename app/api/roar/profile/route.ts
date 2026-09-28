// app/api/roar/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import type { Post } from "@/app/models/Post";
import {
  getGlobalTier,
  getGlobalTierProgress,
  getAllFeatureBadges,
  getSpecialBadges,
  FEATURE_ICONS,
  FeatureKey,
} from "@/lib/roarBadges";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

function extractCandidateKeys(raw?: string | null): string[] {
  if (!raw) return [];
  const candidates = new Set<string>();
  const clean = String(raw).trim().replace(/^USER#/i, "");
  if (!clean) return [];

  candidates.add(clean);
  candidates.add(clean.toLowerCase());

  if (clean.includes("@")) {
    const lower = clean.toLowerCase();
    candidates.add(lower);
    candidates.add(lower.replace(/[@.]/g, "_"));
    candidates.add(lower.replace(/@/g, "_"));
  } else {
    // Check if sanitized email with underscores (e.g. antarip_nag28_ssss_edu_in, srikakulamchandu_gmail_com)
    const parts = clean.split("_");
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].toLowerCase();
      const secondLast = parts.length >= 2 ? parts[parts.length - 2].toLowerCase() : "";
      const tlds = ["com", "in", "org", "net", "edu", "io", "co", "ac", "gov", "app", "dev", "ai", "uk", "au", "ca"];

      if (tlds.includes(last)) {
        if (["edu", "co", "ac", "gov", "org", "net"].includes(secondLast) && parts.length >= 4) {
          const domain = parts.slice(parts.length - 3).join(".");
          const localParts = parts.slice(0, parts.length - 3);

          candidates.add(`${localParts.join("_")}@${domain}`.toLowerCase());
          candidates.add(`${localParts.join(".")}@${domain}`.toLowerCase());
          candidates.add(`${localParts.join("-")}@${domain}`.toLowerCase());
          candidates.add(`${localParts.join("")}@${domain}`.toLowerCase());
        } else if (parts.length >= 3) {
          const domain = parts.slice(parts.length - 2).join(".");
          const localParts = parts.slice(0, parts.length - 2);

          candidates.add(`${localParts.join("_")}@${domain}`.toLowerCase());
          candidates.add(`${localParts.join(".")}@${domain}`.toLowerCase());
          candidates.add(`${localParts.join("-")}@${domain}`.toLowerCase());
          candidates.add(`${localParts.join("")}@${domain}`.toLowerCase());
        }
      }
    }
    const match = clean.match(/^(.+)_([a-zA-Z0-9]+)_([a-zA-Z0-9]+)$/);
    if (match) {
      candidates.add(`${match[1]}@${match[2]}.${match[3]}`.toLowerCase());
      candidates.add(`${match[1].replace(/_/g, ".")}@${match[2]}.${match[3]}`.toLowerCase());
    }
  }

  return Array.from(candidates);
}

// ── Direct DynamoDB user lookup by userId, email, or entityId ──
async function resolveUserDoc(targetId?: string | null, targetEmail?: string | null) {
  const candidateKeys = new Set<string>();

  const inputs = [targetId, targetEmail].filter(Boolean) as string[];
  if (inputs.length === 0) return null;

  for (const input of inputs) {
    const raw = String(input).trim();
    if (!raw) continue;
    const clean = raw.replace(/^USER#/i, "");
    if (!clean) continue;

    candidateKeys.add(raw);
    candidateKeys.add(clean);
    candidateKeys.add(clean.toLowerCase());
    candidateKeys.add(`USER#${clean}`);
    candidateKeys.add(`USER#${clean.toLowerCase()}`);

    if (clean.toLowerCase().startsWith("user_")) {
      const stripped = clean.slice(5);
      candidateKeys.add(stripped);
      candidateKeys.add(stripped.toLowerCase());
      candidateKeys.add(`USER#${stripped}`);
      candidateKeys.add(`USER#${stripped.toLowerCase()}`);
      extractCandidateKeys(stripped).forEach((k) => {
        candidateKeys.add(k);
        candidateKeys.add(k.toLowerCase());
        candidateKeys.add(`USER#${k}`);
        candidateKeys.add(`USER#${k.toLowerCase()}`);
      });
    }

    extractCandidateKeys(clean).forEach((k) => {
      candidateKeys.add(k);
      candidateKeys.add(k.toLowerCase());
      candidateKeys.add(`USER#${k}`);
      candidateKeys.add(`USER#${k.toLowerCase()}`);
    });
  }

  const tableNames = Array.from(new Set([
    TABLES.IdentityAndAccess,
    "IdentityAndAccess",
    "IdentityAndAccess-dev"
  ])).filter(Boolean);

  // 1. Direct GET by entityId across all table candidates
  for (const tableName of tableNames) {
    for (const cand of candidateKeys) {
      try {
        const entityId = cand.startsWith("USER#") ? cand : `USER#${cand}`;
        const getRes = await docClient.send(new GetCommand({
          TableName: tableName,
          Key: { entityId, sk: "USER#META" }
        }));
        if (getRes.Item) {
          const uid = getRes.Item.userId || getRes.Item.email || cand.replace(/^USER#/i, "");
          const targetEntityId = (getRes.Item.entityId as string) || entityId;
          return { id: uid, entityId: targetEntityId, tableName, data: getRes.Item };
        }
      } catch {}
    }
  }

  // 2. Query email-index for any email candidate
  for (const tableName of tableNames) {
    for (const cand of candidateKeys) {
      const cleanEmail = cand.replace(/^USER#/i, "").toLowerCase();
      if (cleanEmail.includes("@")) {
        try {
          const emailRes = await docClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: "email-index",
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: { ":email": cleanEmail },
          }));
          if (emailRes.Items && emailRes.Items.length > 0) {
            const meta = emailRes.Items.find(i => i.sk === "USER#META") || emailRes.Items[0];
            const uid = meta.userId || (meta.entityId as string).replace(/^USER#/i, "");
            return { id: uid, entityId: meta.entityId as string, tableName, data: meta };
          }
        } catch {}
      }
    }
  }

  // 3. Scan for userId = clean, email = clean, or username = clean (without restrictive evaluation limits)
  for (const tableName of tableNames) {
    for (const rawClean of candidateKeys) {
      const clean = rawClean.replace(/^USER#/i, "");
      try {
        const scanRes = await docClient.send(new ScanCommand({
          TableName: tableName,
          FilterExpression: "sk = :meta AND (userId = :c OR email = :c OR entityId = :uc OR username = :c)",
          ExpressionAttributeValues: {
            ":meta": "USER#META",
            ":c": clean,
            ":uc": `USER#${clean}`,
          },
        }));
        if (scanRes.Items && scanRes.Items.length > 0) {
          const meta = scanRes.Items[0];
          const uid = meta.userId || (meta.entityId as string).replace(/^USER#/i, "");
          return { id: uid, entityId: meta.entityId as string, tableName, data: meta };
        }
      } catch {}
    }
  }

  // 4. Fallback to Firestore
  for (const cand of candidateKeys) {
    const cleanCand = cand.replace(/^USER#/i, "");
    try {
      const snap = await db.collection(getFirestoreCollection("users")).doc(cleanCand).get();
      if (snap.exists) {
        return { id: snap.id, entityId: `USER#${snap.id}`, tableName: TABLES.IdentityAndAccess, data: snap.data() };
      }
    } catch {}
  }

  return null;
}

// GET: Inquire profile stats
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");
    const user = await getUser(req);

    if (!targetUserId && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let resolvedUserId = "";
    let userData: any = null;

    if (targetUserId) {
      const resolved = await resolveUserDoc(targetUserId, user?.email);
      if (resolved) {
        resolvedUserId = resolved.id;
        userData = resolved.data;
      } else {
        const info = await getUserInfo(targetUserId);
        if (!info.exists) {
          return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        }
        resolvedUserId = info.actualUserId;
        userData = {
          name: info.userName,
          username: info.userName,
          email: info.userEmail,
          userId: info.actualUserId,
        };
      }
    } else if (user) {
      // Self
      const resolved = await resolveUserDoc(user.userId, user.email);
      if (!resolved) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      resolvedUserId = resolved.id;
      userData = resolved.data;
    } else {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        onboardingCompleted: userData.onboardingCompleted ?? true,
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
        university: userData.university ?? userData.institution ?? null,
        institution: userData.institution ?? userData.university ?? null,
        favPlayer: userData.favPlayer ?? null,
        about: userData.about ?? null,
        avatarUrl: userData.avatarUrl || userData.photoURL || userData.picture || userData.image || userData.profilePicture || userData.avatar || null,
        photoURL: userData.photoURL || userData.picture || userData.image || userData.avatarUrl || null,
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
      updates.favPlayer = body.favPlayer ? String(body.favPlayer).trim().slice(0, 60) : "";
    }

    if (body.university !== undefined) {
      const u = body.university ? String(body.university).trim().slice(0, 100) : "";
      updates.university = u;
      updates.institution = u;
    }

    if (body.institution !== undefined) {
      const u = body.institution ? String(body.institution).trim().slice(0, 100) : "";
      updates.institution = u;
      updates.university = u;
    }

    if (body.about !== undefined) {
      updates.about = body.about ? String(body.about).trim().slice(0, 300) : "";
    }

    if (body.avatarUrl !== undefined) {
      const v = String(body.avatarUrl).trim();
      if (v.startsWith("data:image/")) {
        try {
          const uploadRes = await cloudinary.uploader.upload(v, {
            folder: "profile-images",
          });
          updates.avatarUrl = uploadRes.secure_url;
        } catch (uploadErr) {
          console.error("[profile PATCH] Cloudinary avatar upload failed:", uploadErr);
          updates.avatarUrl = v;
        }
      } else if (v.startsWith("https://") || v.startsWith("http://")) {
        updates.avatarUrl = v;
      } else {
        return NextResponse.json({ error: "Invalid avatarUrl." }, { status: 422 });
      }
    }

    if (body.coverPhotoUrl !== undefined) {
      const v = String(body.coverPhotoUrl).trim();
      if (v === "") {
        updates.coverPhotoUrl = null;
      } else if (v.startsWith("data:image/")) {
        try {
          const uploadRes = await cloudinary.uploader.upload(v, {
            folder: "profile-covers",
          });
          updates.coverPhotoUrl = uploadRes.secure_url;
        } catch (uploadErr) {
          console.error("[profile PATCH] Cloudinary cover photo upload failed:", uploadErr);
          updates.coverPhotoUrl = v;
        }
      } else if (v.startsWith("https://") || v.startsWith("http://")) {
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
    const targetEntityId = resolved.entityId || (resolved.data?.entityId as string) || (resolvedUserId.startsWith("USER#") ? resolvedUserId : `USER#${resolvedUserId}`);

    // Tables to update: the table where the user document was found, plus TABLES.IdentityAndAccess
    const targetTables = Array.from(new Set([
      resolved.tableName,
      TABLES.IdentityAndAccess,
      "IdentityAndAccess",
    ])).filter(Boolean) as string[];

    // Entity IDs to update: primary entityId, plus email-based entityId and userId-based entityId if different
    const targetEntityIds = Array.from(new Set([
      targetEntityId,
      resolved.data?.entityId,
      user.email ? `USER#${user.email.trim().toLowerCase()}` : null,
      resolved.data?.email ? `USER#${String(resolved.data.email).trim().toLowerCase()}` : null,
      resolvedUserId ? (resolvedUserId.startsWith("USER#") ? resolvedUserId : `USER#${resolvedUserId}`) : null,
    ])).filter(Boolean) as string[];

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

    // 1. Update in DynamoDB across all relevant tables and key variants
    for (const tbl of targetTables) {
      for (const eid of targetEntityIds) {
        try {
          await docClient.send(new UpdateCommand({
            TableName: tbl,
            Key: { entityId: eid, sk: "USER#META" },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
          }));
        } catch (dynErr) {
          console.warn(`[profile PATCH] DynamoDB update on ${tbl} (${eid}) failed:`, dynErr);
        }
      }
    }

    // 2. Sync to Firestore
    try {
      const usersCol = getFirestoreCollection("users");
      const firestoreDocIds = Array.from(new Set([
        resolvedUserId,
        user.email?.toLowerCase(),
        user.email,
        resolved.data?.email,
        resolved.data?.userId,
      ])).filter(Boolean) as string[];

      for (const docId of firestoreDocIds) {
        try {
          await db.collection(usersCol).doc(docId).set(updates, { merge: true });
        } catch {}
      }
    } catch (fsErr) {
      console.warn("[profile PATCH] Firestore fallback update profile failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      updatedFields: meaningfulKeys,
      user: {
        ...(resolved.data || {}),
        ...updates,
      },
      avatarUrl: updates.avatarUrl,
      coverPhotoUrl: updates.coverPhotoUrl,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/roar/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}