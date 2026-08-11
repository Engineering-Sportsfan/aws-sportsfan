
// //api/roar/onboarding/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import { FieldValue } from "firebase-admin/firestore";
// import { getUserInfo } from "@/lib/userPoints";
// import type { User } from "../../../models/RoarUser";

// export async function POST(req: NextRequest) {
//   console.log("Hit the onboarding api");
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const body = await req.json();
//     const { sports, badge, firstContribution, firstVote, repPointsAwarded } = body;

//     if (!sports?.length || !badge) {
//       return NextResponse.json(
//         { error: "sports and badge are required" },
//         { status: 400 },
//       );
//     }

//     const now = Date.now();
//     const repPoints = typeof repPointsAwarded === "number" ? repPointsAwarded : 0;

//     // ── Resolve user doc ID the same way posts/route.ts does ──────────────
//     // FIX (2026-06): this used to resolve the doc ID locally — try
//     // `users/{email}` first, fall back to `users/{userId}` only if that
//     // didn't exist — which is a different rule than getUserInfo uses
//     // (try uid, then email-field query, then sanitized/unsanitized email
//     // variants). For brand-new users that mismatch meant onboarding wrote
//     // the profile to one doc ID while posts/likes/votes (which all go
//     // through getUserInfo) read/wrote a different doc ID — so the new
//     // user's `username` field was never found by post creation, and every
//     // post they made rendered as the frontend's "RoarUser" fallback.
//     //
//     // Using getUserInfo here guarantees onboarding agrees with every other
//     // route on what a given user's canonical doc ID is. For a brand-new
//     // user, getUserInfo's lookups will all miss (exists: false), and it
//     // returns actualUserId: userId (the auth uid) — so we create the doc
//     // at users/{user.userId}, the same ID getUserInfo will resolve to on
//     // every subsequent request for this user.
//     const info = await getUserInfo(user.userId, undefined, user.email);
//     const resolvedUserId = info.exists ? info.actualUserId : user.userId;
//     const userDocRef = db.collection("users").doc(resolvedUserId);
//     const userDoc = await userDocRef.get();

//     let defaultUsername = user.name || user.email.split("@")[0];
//     if (userDoc.exists) {
//       const data = userDoc.data();
//       if (data?.firstName || data?.lastName) {
//         defaultUsername = `${data.firstName || ""} ${data.lastName || ""}`.trim();
//       } else if (data?.username) {
//         defaultUsername = data.username;
//       }
//     }

//     const hasFirstContribution = !!firstContribution;

//     const userData: User = {
//       uid: resolvedUserId,
//       username: defaultUsername,
//       handle: user.email.split("@")[0].toLowerCase(),
//       sports,
//       badge,
//       badgesUnlocked: [badge],
//       reputationScore: repPoints,
//       predictionCount: 0,
//       correctPredictions: 0,
//       hotTakeCount: hasFirstContribution ? 1 : 0,
//       rank: 9999,
//       rivalUid: null,
//       fcmToken: null,
//       settings: {
//         showPredictionHistory: true,
//         audience: "Everyone",
//       },
//       createdAt: now,
//       updatedAt: now,
//     };

//     // Write user doc
//     await userDocRef.set(userData, { merge: true });

//     // Seed starter badge progress
//     await db
//       .collection("roarBadges")
//       .doc(resolvedUserId)
//       .collection("roarProgress")
//       .doc(badge)
//       .set({
//         badgeId: badge,
//         uid: resolvedUserId,
//         unlocked: true,
//         progress: 100,
//         earnedAt: now,
//       });

//     // Seed progress=0 for all other badges so frontend can display them
//     const otherBadges = [
//       "ORACLE",
//       "BOLD_CALLER",
//       "CRICKET_HEAD",
//       "CONTRARIAN",
//       "OG_FAN",
//       "SEASONED_FAN",
//       "RISING_FAN",
//     ].filter((b) => b !== badge);

//     const batch = db.batch();
//     for (const b of otherBadges) {
//       const ref = db
//         .collection("roarBadges")
//         .doc(resolvedUserId)
//         .collection("roarProgress")
//         .doc(b);
//       batch.set(ref, {
//         badgeId: b,
//         uid: resolvedUserId,
//         unlocked: false,
//         progress: 0,
//       });
//     }

//     // First contribution post
//     if (firstContribution) {
//       const postRef = db.collection("roarPosts").doc();
//       const voteCounts =
//         firstVote === "agree"
//           ? { agreeCount: 1, disagreeCount: 0 }
//           : firstVote === "disagree"
//             ? { agreeCount: 0, disagreeCount: 1 }
//             : { agreeCount: 0, disagreeCount: 0 };

//       batch.set(postRef, {
//         postId: postRef.id,
//         authorUid: resolvedUserId,
//         authorUsername:  userData.username,
//         authorBadge: badge,
//         type: "hot_take",
//         sport: sports[0],
//         text: firstContribution,
//         audience: "Everyone",
//         ...voteCounts,
//         replyCount: 0,
//         isLive: false,
//         status: "active",
//         createdAt: now,
//         updatedAt: now,
//       });
//     }

//     await batch.commit();

//     return NextResponse.json({ success: true, badge, uid: resolvedUserId, username: userData.username, });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/roar/onboarding error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── GET: Fetch the current user's onboarding-set preferences ──────────
// // Used by the Preferences/settings screen to pre-populate the form with
// // whatever sports the user picked during onboarding (or last edited via PATCH).
// //
// // FIX (2026-06): aligned with getUserInfo resolution, same reasoning as POST
// // above — GET must look up the same doc ID that POST wrote to.
// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const info = await getUserInfo(user.userId, undefined, user.email);
//     const resolvedUserId = info.exists ? info.actualUserId : user.userId;
//     const userDoc = await db.collection("users").doc(resolvedUserId).get();

//     if (!userDoc.exists) {
//       return NextResponse.json(
//         { error: "User has not completed onboarding yet" },
//         { status: 404 },
//       );
//     }

//     const data = userDoc.data();

//     return NextResponse.json({
//       success: true,
//       sports: data?.sports ?? [],
//       badge: data?.badge ?? null,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/onboarding error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── PATCH: Update sports after onboarding (Preferences screen) ────────
// // Onboarding requires sports + badge up front, so by the time a user can
// // reach the Preferences screen their users/{uid} doc is guaranteed to
// // exist — this does not upsert. A missing doc means the client routed
// // someone here who hasn't actually finished onboarding, which is a 404,
// // not something to silently paper over.
// //
// // FIX (2026-06): aligned with getUserInfo resolution, same reasoning as
// // POST/GET above.
// export async function PATCH(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const body = await req.json();
//     const { sports } = body;

//     if (!Array.isArray(sports) || sports.length === 0 || !sports.every((s) => typeof s === "string" && s.trim().length > 0)) {
//       return NextResponse.json(
//         { error: "sports must be a non-empty array of strings" },
//         { status: 400 },
//       );
//     }

//     const info = await getUserInfo(user.userId, undefined, user.email);
//     const resolvedUserId = info.exists ? info.actualUserId : user.userId;
//     const userDocRef = db.collection("users").doc(resolvedUserId);
//     const userDoc = await userDocRef.get();

//     if (!userDoc.exists) {
//       return NextResponse.json(
//         { error: "User has not completed onboarding yet" },
//         { status: 404 },
//       );
//     }

//     const trimmedSports = sports.map((s: string) => s.trim());
//     const now = Date.now();

//     await userDocRef.update({ sports: trimmedSports, updatedAt: now });

//     return NextResponse.json({
//       success: true,
//       sports: trimmedSports,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("PATCH /api/roar/onboarding error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }



// app/api/roar/onboarding/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// Same canonical resolution as /api/roar/profile/route.ts
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
    console.warn("[onboarding resolveUserDoc] DynamoDB direct get failed:", dynErr);
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
      console.warn("[onboarding resolveUserDoc] DynamoDB direct get by email failed:", dynErr);
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
      console.warn("[onboarding resolveUserDoc] DynamoDB email GSI check failed:", dynErr);
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

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveUserDoc(user.userId, user.email);
  if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

  const data = resolved.data;

  return NextResponse.json({
    success: true,
    sports: data?.sports ?? [],
    followEntities: data?.followEntities ?? [],
    engagementPrefs: data?.engagementPrefs ?? [],
    onboardingCompleted: data?.onboardingCompleted ?? false,
  });
}

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveUserDoc(user.userId, user.email);
  if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

  const body = await req.json();
  const { sports, followEntities, engagementPrefs } = body as {
    sports?: string[];
    followEntities?: string[];
    engagementPrefs?: string[];
  };

  const resolvedUserId = resolved.id;
  const updates = {
    sports: sports ?? [],
    followEntities: followEntities ?? [],
    engagementPrefs: engagementPrefs ?? [],
    onboardingCompleted: true,
    onboardingCompletedAt: Date.now(),
    email: user.email,
  };

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
      expressionAttributeValues[valKey] = (updates as any)[key];
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
    console.warn("[onboarding POST] DynamoDB update failed:", dynErr);
  }

  // 2. Sync to Firestore
  try {
    await db.collection("users").doc(resolvedUserId).set(updates, { merge: true });
  } catch (fsErr) {
    console.warn("[onboarding POST] Firestore fallback sync failed:", fsErr);
  }

  return NextResponse.json({ success: true, onboardingCompleted: true });
}

export async function PATCH(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const resolved = await resolveUserDoc(user.userId, user.email);
  if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

  const body = await req.json();
  const { sports, followEntities, engagementPrefs } = body as {
    sports?: string[];
    followEntities?: string[];
    engagementPrefs?: string[];
  };

  const resolvedUserId = resolved.id;
  const updates: Record<string, any> = { updatedAt: Date.now(), email: user.email };
  if (sports !== undefined) updates.sports = sports;
  if (followEntities !== undefined) updates.followEntities = followEntities;
  if (engagementPrefs !== undefined) updates.engagementPrefs = engagementPrefs;

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
    console.warn("[onboarding PATCH] DynamoDB update failed:", dynErr);
  }

  // 2. Sync to Firestore
  try {
    await db.collection("users").doc(resolvedUserId).set(updates, { merge: true });
  } catch (fsErr) {
    console.warn("[onboarding PATCH] Firestore fallback sync failed:", fsErr);
  }

  // Fetch updated data from DynamoDB first, then fallback to Firestore
  let finalData: any = null;
  try {
    const getRes = await docClient.send(new GetCommand({
      TableName: "IdentityAndAccess",
      Key: { entityId: `USER#${resolvedUserId}`, sk: "USER#META" }
    }));
    if (getRes.Item) {
      finalData = getRes.Item;
    }
  } catch (dynErr) {
    console.warn("[onboarding PATCH] Fetching updated profile failed:", dynErr);
  }

  if (!finalData) {
    try {
      const snap = await db.collection("users").doc(resolvedUserId).get();
      if (snap.exists) {
        finalData = snap.data();
      }
    } catch (fsErr) {
      console.warn("[onboarding PATCH] Firestore fallback fetch failed:", fsErr);
    }
  }

  return NextResponse.json({
    success: true,
    sports: finalData?.sports ?? [],
    followEntities: finalData?.followEntities ?? [],
    engagementPrefs: finalData?.engagementPrefs ?? [],
    onboardingCompleted: finalData?.onboardingCompleted ?? false,
  });
}