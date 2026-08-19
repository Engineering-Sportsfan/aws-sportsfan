// app/api/roar/fans/[username]/profile/route.ts
// Public endpoint — returns any fan's ROAR profile by username.
// Used when clicking on another user's avatar in posts/comments.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Post } from "@/app/models/Post";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    // Must be logged in to view any profile
    const requestingUser = await getUser(req);
    if (!requestingUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const { username } = resolvedParams;
    if (!username) {
      return NextResponse.json({ error: "Username required" }, { status: 400 });
    }

    let userData: any = null;
    let resolvedUserId = "";
    let fetchedUserFromDynamo = false;

    // 1. Try finding user in DynamoDB first by username Scan
    try {
      const res = await docClient.send(new ScanCommand({
        TableName: "IdentityAndAccess",
        FilterExpression: "username = :u AND sk = :s",
        ExpressionAttributeValues: {
          ":u": username,
          ":s": "USER#META"
        },
        Limit: 1
      }));

      if (res.Items && res.Items.length > 0) {
        userData = res.Items[0];
        resolvedUserId = (userData.entityId as string).replace(/^USER#/, "");
        fetchedUserFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[FanProfile GET] DynamoDB username scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedUserFromDynamo) {
      try {
        const usersSnap = await db
          .collection("users")
          .where("username", "==", username)
          .limit(1)
          .get();

        if (!usersSnap.empty) {
          const userDoc = usersSnap.docs[0];
          resolvedUserId = userDoc.id;
          userData = userDoc.data();
        }
      } catch (fsErr) {
        console.error("[FanProfile GET] Firestore fallback user check failed:", fsErr);
      }
    }

    if (!userData || !userData.username || !userData.badge) {
      return NextResponse.json({ error: "Fan not found or not onboarded" }, { status: 404 });
    }

    let badges: any[] = [];
    let posts: any[] = [];
    let rivalData: any = null;
    let fetchedBadgesFromDynamo = false;
    let fetchedPostsFromDynamo = false;
    let fetchedRivalFromDynamo = false;

    // Fetch badges, posts, and rivals from DynamoDB first
    try {
      const badgesRes = await docClient.send(new QueryCommand({
        TableName: "GamificationAndWallet",
        KeyConditionExpression: "userId = :u AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":u": `USER#${resolvedUserId}`,
          ":p": "BADGE#"
        }
      }));
      if (badgesRes.Items) {
        badges = badgesRes.Items.map(item => ({
          ...item,
          badgeId: (item.sk as string).replace(/^BADGE#/, "")
        }));
        fetchedBadgesFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[FanProfile GET] DynamoDB badges fetch failed:", dynErr);
    }

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
      console.warn("[FanProfile GET] DynamoDB posts fetch failed:", dynErr);
    }

    try {
      const getRival = await docClient.send(new GetCommand({
        TableName: "SportsData",
        Key: { entityId: `RIVAL#${resolvedUserId}`, sk: `RIVAL#${resolvedUserId}` }
      }));
      if (getRival.Item) {
        rivalData = getRival.Item;
        fetchedRivalFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[FanProfile GET] DynamoDB rival fetch failed:", dynErr);
    }

    // Fallbacks
    if (!fetchedBadgesFromDynamo) {
      try {
        const badgesSnap = await db.collection("roarBadges").doc(resolvedUserId).collection("roarProgress").get();
        badges = badgesSnap.docs.map((d) => ({ ...d.data(), badgeId: d.id }));
      } catch (fsErr) {
        console.error("[FanProfile GET] Firestore badges fallback failed:", fsErr);
      }
    }

    if (!fetchedPostsFromDynamo) {
      try {
        const postsSnap = await db.collection("roarPosts").where("authorUid", "==", resolvedUserId).get();
        posts = postsSnap.docs.map((d) => ({ ...(d.data() as Post), postId: d.id }));
      } catch (fsErr) {
        console.error("[FanProfile GET] Firestore posts fallback failed:", fsErr);
      }
    }

    if (!fetchedRivalFromDynamo) {
      try {
        const rivalSnap = await db.collection("rivals").doc(resolvedUserId).get();
        rivalData = rivalSnap.exists ? rivalSnap.data() : null;
      } catch (fsErr) {
        console.error("[FanProfile GET] Firestore rival fallback failed:", fsErr);
      }
    }

    const accuracy =
      userData.predictionCount > 0
        ? Math.round((userData.correctPredictions / userData.predictionCount) * 100)
        : 0;

    const sortedPosts = posts.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

    // Only expose public fields — no email, no FCM token etc.
    return NextResponse.json({
      success: true,
      user: {
        username: userData.username,
        handle: userData.handle ?? userData.username,
        badge: userData.badge,
        avatarUrl: userData.avatarUrl ?? null,
        favPlayer: userData.favPlayer ?? null,
        about: userData.about ?? null,
        fanSince: userData.fanSince ?? null,
        yearsFandom: userData.yearsFandom ?? null,
        reputationScore: userData.reputationScore ?? 0,
        predictionCount: userData.predictionCount ?? 0,
        hotTakeCount: userData.hotTakeCount ?? 0,
        correctPredictions: userData.correctPredictions ?? 0,
        accuracy,
        showPredHistory: userData.showPredHistory !== false,
      },
      badges,
      predictions:
        userData.showPredHistory !== false
          ? sortedPosts.filter((p: any) => p.type === "prediction").slice(0, 20)
          : [],
      hotTakes: sortedPosts.filter((p: any) => p.type === "hot_take").slice(0, 10),
      rival: rivalData,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/fans/[username]/profile error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
