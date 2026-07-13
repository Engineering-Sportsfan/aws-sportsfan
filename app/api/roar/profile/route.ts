// // app/api/roar/profile/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { getUserInfo } from "@/lib/userPoints";
// import type { User } from "@/app/models/RoarUser";
// import type { BadgeProgress } from "@/app/models/BadgeProgress";
// import type { Post } from "@/app/models/Post";
// import {
//   getGlobalTier,
//   getGlobalTierProgress,
//   getAllFeatureBadges,
//   getSpecialBadges,
//   FEATURE_ICONS,
//   FeatureKey,
// } from "@/lib/roarBadges";

// // ── Canonical doc resolution ───────────────────────────────────────────────
// async function resolveUserDoc(userId: string, email: string) {
//   let docRef = db.collection("users").doc(userId);
//   let snap = await docRef.get();
//   if (!snap.exists) {
//     docRef = db.collection("users").doc(email);
//     snap = await docRef.get();
//     if (!snap.exists) return null;
//   }
//   return { docRef, snap };
// }

// // GET: Inquire profile stats (Service 2 - fully merged with legacy predictions, hot takes and accuracy data)
// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const { searchParams } = new URL(req.url);
//     const targetUserId = searchParams.get("userId");

//     let docRef, snap;

//     if (targetUserId) {
//       // ── Other user's profile — resolve through getUserInfo's fallback
//       // chain instead of a bare doc-ID lookup.
//       //
//       // targetUserId typically arrives here as whatever ID some other part
//       // of the app attached to a post/message/reaction (authorUid, reactor
//       // userId, etc). Not every write path resolves that ID through
//       // getUserInfo before storing it, so targetUserId is not guaranteed to
//       // be the literal users/{id} doc ID. Resolving here means:
//       //   1. It's still correct for write paths that already resolve properly.
//       //   2. It's now also correct for write paths that don't (yet).
//       //   3. It self-heals old/legacy docs written before those paths were fixed.
//       const info = await getUserInfo(targetUserId);
//       if (!info.exists) {
//         return NextResponse.json({ error: "Profile not found" }, { status: 404 });
//       }
//       docRef = db.collection("users").doc(info.actualUserId);
//       snap = await docRef.get();
//       if (!snap.exists) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
//     } else {
//       // Self
//       const resolved = await resolveUserDoc(user.userId, user.email);
//       if (!resolved) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
//       ({ docRef, snap } = resolved);
//     }

//     const resolvedUserId = docRef.id;
//     const userData = snap.data() as any;

//     const [postsSnap, rivalSnap] = await Promise.all([
//       db.collection("roarPosts").where("authorUid", "==", resolvedUserId).get(),
//       db.collection("rivals").doc(resolvedUserId).get(),
//     ]);

//     const predictionStats = userData.predictionStats ?? {};
//     const resolvedPredictionCount = predictionStats.participated ?? 0;
//     const correctPredictionCount = predictionStats.correct ?? 0;
//     const accuracy = resolvedPredictionCount > 0
//       ? Math.round((correctPredictionCount / resolvedPredictionCount) * 100) : 0;

//     const allPosts = postsSnap.docs.map((d) => ({ ...(d.data() as Post), postId: d.id }));
//     const sortedPosts = allPosts.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

//     const actCounts = userData.activityCounts ?? {};

//     const featureCounts: Partial<Record<FeatureKey, number>> = {
//       post:        actCounts.ROAR_POST ?? 0,
//       debate:      actCounts.ROAR_DEBATE_PARTICIPATE ?? 0,
//       prediction:  actCounts.ROAR_PREDICTION_PARTICIPATE ?? 0,
//       trivia:      actCounts.ROAR_TRIVIA_CORRECT ?? 0,       
//       fanBattle:   actCounts.ROAR_BATTLE_PARTICIPATE ?? 0,    
//       community:   actCounts.likesReceived ?? 0,              
//       shares:      actCounts.ROAR_SHARE ?? 0,                 
//       comments:    actCounts.ROAR_COMMENT ?? 0,               
//       media:       actCounts.ROAR_MEDIA_UPLOAD ?? 0,          
//     };

//     const featureBadges = getAllFeatureBadges(featureCounts);

//     // Attach the full per-level icon set (L1..L5) to each feature badge so
//     // the UI can render one icon per level in a row, not just the icon for
//     // the currently-achieved level. FEATURE_ICONS[feature] is a fixed
//     // 5-element tuple defined in lib/roarBadges.ts — this doesn't change
//     // any derivation logic, it just carries the extra icons array alongside
//     // the already-computed level/progress/label fields.
//     const featureBadgesWithIcons = featureBadges.map((fb) => ({
//       ...fb,
//       icons: FEATURE_ICONS[fb.feature], // [l1Icon, l2Icon, l3Icon, l4Icon, l5Icon]
//     }));

//     const globalXp = userData.totalPoints ?? userData.reputationScore ?? 0;
//     const legacyGlobalTier = getGlobalTier(globalXp);
//     const globalTierProgress = getGlobalTierProgress(globalXp);

//     const specialBadges = getSpecialBadges(
//       {
//         longestStreak: userData.longestStreak ?? userData.currentStreak ?? 0,
//         hasViralPost: userData.hasViralPost ?? false,      
//         hasSeasonTop100: userData.hasSeasonTop100 ?? false, 
//         hasSeasonTop3: userData.hasSeasonTop3 ?? false,
//       },
//       featureBadges
//     );

//     // Merge and return the legacy format plus our new optimized gamification fields
//     return NextResponse.json({
//       success: true,
//       user: {
//         ...userData,
//         accuracy,
//         predictionStats,
//         predictionCount: resolvedPredictionCount,
//         correctPredictions: correctPredictionCount,
//         actualUserId: resolvedUserId,
//         badge: userData.badge ?? null,
//         favPlayer: userData.favPlayer ?? null,
//         about: userData.about ?? null,
//         avatarUrl: userData.avatarUrl ?? null,

//         // New Gamification Fields (Service 2 - dynamic lookup parameters)
//         totalXP: userData.totalXP ?? globalXp,
//         totalPoints: userData.totalPoints ?? globalXp,
//         reputationScore: userData.reputationScore ?? globalXp,
//         globalTier: userData.globalTier ?? legacyGlobalTier.tier,
//         subRank: userData.subRank ?? legacyGlobalTier.subRank,
//         currentLoginStreak: userData.currentLoginStreak ?? 0,
//         loginStreakMultiplier: userData.loginStreakMultiplier ?? 1.0,
//         streakFreezeCount: userData.streakFreezeCount ?? 0,
//         featureStats: userData.featureStats ?? {},
//         featureLevels: userData.featureLevels ?? {},
//         isCompletionist: userData.isCompletionist ?? false
//       },
//       globalTier: legacyGlobalTier,            
//       globalTierProgress,    
//       featureBadges: featureBadgesWithIcons,   // includes icons[] per feature
//       specialBadges,
//       predictions: sortedPosts.filter((p: any) => p.type === "prediction").slice(0, 20),
//       hotTakes: sortedPosts.filter((p: any) => p.type === "hot_take").slice(0, 10),
//       rival: rivalSnap.exists ? rivalSnap.data() : null,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/profile error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // PATCH: Update user profile settings (unchanged to prevent breakages)
// export async function PATCH(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     const body = await req.json();
//     const updates: Record<string, unknown> = { updatedAt: Date.now() };

//     if (body.username !== undefined) {
//       const v = String(body.username).trim().replace(/\s+/g, " ");
//       if (v.length >= 2 && v.length <= 30 && /^[A-Za-z0-9_ -]+$/.test(v)) {
//         updates.username = v;
//       } else {
//         return NextResponse.json({ error: "Invalid username." }, { status: 422 });
//       }
//     }

//     if (body.favPlayer !== undefined) {
//       updates.favPlayer = String(body.favPlayer).trim().slice(0, 60);
//     }

//     if (body.about !== undefined) {
//       updates.about = String(body.about).trim().slice(0, 300);
//     }

//     if (body.avatarUrl !== undefined) {
//       const v = String(body.avatarUrl).trim();
//       if (v.startsWith("data:image/") || v.startsWith("https://") || v.startsWith("http://")) {
//         updates.avatarUrl = v;
//       } else {
//         return NextResponse.json({ error: "Invalid avatarUrl." }, { status: 422 });
//       }
//     }

//     if (body.showPredHistory !== undefined) {
//       updates.showPredHistory = Boolean(body.showPredHistory);
//     }

//     if (body.showActivity !== undefined) {
//       updates.showActivity = Boolean(body.showActivity);
//     }

//     for (const field of ["fcmToken", "settings", "teams", "sports"]) {
//       if (body[field] !== undefined) updates[field] = body[field];
//     }

//     const meaningfulKeys = Object.keys(updates).filter((k) => k !== "updatedAt");
//     if (meaningfulKeys.length === 0) {
//       return NextResponse.json({ error: "No fields to update." }, { status: 400 });
//     }

//     const resolved = await resolveUserDoc(user.userId, user.email);
//     if (!resolved) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

//     await resolved.docRef.set(updates, { merge: true });

//     return NextResponse.json({ success: true, updatedFields: meaningfulKeys });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("PATCH /api/roar/profile error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// app/api/roar/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import type { User } from "@/app/models/RoarUser";
import type { BadgeProgress } from "@/app/models/BadgeProgress";
import type { Post } from "@/app/models/Post";
import {
  getGlobalTier,
  getGlobalTierProgress,
  getAllFeatureBadges,
  getSpecialBadges,
  FEATURE_ICONS,
  FeatureKey,
} from "@/lib/roarBadges";

// ── Canonical doc resolution ───────────────────────────────────────────────
async function resolveUserDoc(userId: string, email: string) {
  let docRef = db.collection("users").doc(userId);
  let snap = await docRef.get();
  if (!snap.exists) {
    docRef = db.collection("users").doc(email);
    snap = await docRef.get();
    if (!snap.exists) return null;
  }
  return { docRef, snap };
}

// GET: Inquire profile stats (Service 2 - fully merged with legacy predictions, hot takes and accuracy data)
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get("userId");

    let docRef, snap;

    if (targetUserId) {
      // ── Other user's profile — resolve through getUserInfo's fallback
      // chain instead of a bare doc-ID lookup.
      //
      // targetUserId typically arrives here as whatever ID some other part
      // of the app attached to a post/message/reaction (authorUid, reactor
      // userId, etc). Not every write path resolves that ID through
      // getUserInfo before storing it, so targetUserId is not guaranteed to
      // be the literal users/{id} doc ID. Resolving here means:
      //   1. It's still correct for write paths that already resolve properly.
      //   2. It's now also correct for write paths that don't (yet).
      //   3. It self-heals old/legacy docs written before those paths were fixed.
      const info = await getUserInfo(targetUserId);
      if (!info.exists) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      docRef = db.collection("users").doc(info.actualUserId);
      snap = await docRef.get();
      if (!snap.exists) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    } else {
      // Self
      const resolved = await resolveUserDoc(user.userId, user.email);
      if (!resolved) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      ({ docRef, snap } = resolved);
    }

    const resolvedUserId = docRef.id;
    const userData = snap.data() as any;

    const [postsSnap, rivalSnap] = await Promise.all([
      db.collection("roarPosts").where("authorUid", "==", resolvedUserId).get(),
      db.collection("rivals").doc(resolvedUserId).get(),
    ]);

    const predictionStats = userData.predictionStats ?? {};
    const resolvedPredictionCount = predictionStats.participated ?? 0;
    const correctPredictionCount = predictionStats.correct ?? 0;
    const accuracy = resolvedPredictionCount > 0
      ? Math.round((correctPredictionCount / resolvedPredictionCount) * 100) : 0;

    const allPosts = postsSnap.docs.map((d) => ({ ...(d.data() as Post), postId: d.id }));
    const sortedPosts = allPosts.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    // const actCounts = userData.activityCounts ?? {};
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

    // Attach the full per-level icon set (L1..L5) to each feature badge so
    // the UI can render one icon per level in a row, not just the icon for
    // the currently-achieved level. FEATURE_ICONS[feature] is a fixed
    // 5-element tuple defined in lib/roarBadges.ts — this doesn't change
    // any derivation logic, it just carries the extra icons array alongside
    // the already-computed level/progress/label fields.
    const featureBadgesWithIcons = featureBadges.map((fb) => ({
      ...fb,
      icons: FEATURE_ICONS[fb.feature], // [l1Icon, l2Icon, l3Icon, l4Icon, l5Icon]
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

    // Merge and return the legacy format plus our new optimized gamification fields
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
        // LinkedIn-style optional cover/banner photo shown behind the avatar.
        coverPhotoUrl: userData.coverPhotoUrl ?? null,

        // New Gamification Fields (Service 2 - dynamic lookup parameters)
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
      featureBadges: featureBadgesWithIcons,   // includes icons[] per feature
      specialBadges,
      predictions: sortedPosts.filter((p: any) => p.type === "prediction").slice(0, 20),
      hotTakes: sortedPosts.filter((p: any) => p.type === "hot_take").slice(0, 10),
      rival: rivalSnap.exists ? rivalSnap.data() : null,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH: Update user profile settings (unchanged to prevent breakages)
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

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

    // Optional LinkedIn-style cover/banner photo. An empty string is treated
    // as an explicit "clear the cover photo" signal from the client (see
    // Profile.tsx's SAVE handler) rather than a validation failure — leaving
    // the field out entirely, by contrast, means "don't touch it".
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

    await resolved.docRef.set(updates, { merge: true });

    return NextResponse.json({ success: true, updatedFields: meaningfulKeys });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/roar/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}