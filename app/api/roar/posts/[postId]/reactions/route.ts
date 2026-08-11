// api/roar/posts/[postId]/reactions/route.ts
// GET  /api/roar/posts/:postId/reactions
// GET  /api/roar/posts/:postId/reactions?roomId=xyz

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const { postId } = resolvedParams;
    if (!postId) return NextResponse.json({ error: "postId is required" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);
    const roomId = searchParams.get("roomId") || undefined;

    // 1. Existence check & fetch likes from DynamoDB first
    let reactorsData: any[] = [];
    let parentExists = false;
    let fetchedFromDynamo = false;

    try {
      if (roomId) {
        // Query parent room message in RealTimeChat
        const msgRes = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND sk = :s",
          ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `MSG#${postId}` },
          Limit: 1
        }));
        if (msgRes.Items && msgRes.Items.length > 0) {
          parentExists = true;
          // Fetch reactions for this message in RealTimeChat
          const reactionsRes = await docClient.send(new QueryCommand({
            TableName: "RealTimeChat",
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": `LIKE#${postId}#` },
            Limit: limit
          }));
          if (reactionsRes.Items) {
            reactorsData = reactionsRes.Items.map(item => ({
              userId: (item.sk as string).split("#")[2],
              reaction: item.reaction ?? "heart",
              reactedAt: item.reactedAt ?? 0
            }));
            fetchedFromDynamo = true;
          }
        }
      } else {
        // Query parent post in SocialAndContent
        const postRes = await docClient.send(new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" },
          Limit: 1
        }));
        if (postRes.Items && postRes.Items.length > 0) {
          parentExists = true;
          // Fetch likes for this post in SocialAndContent
          const reactionsRes = await docClient.send(new QueryCommand({
            TableName: "SocialAndContent",
            KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "LIKE#" },
            Limit: limit
          }));
          if (reactionsRes.Items) {
            reactorsData = reactionsRes.Items.map(item => ({
              userId: (item.sk as string).split("#")[1],
              reaction: item.reaction ?? "heart",
              reactedAt: item.reactedAt ?? 0
            }));
            fetchedFromDynamo = true;
          }
        }
      }
    } catch (dynErr) {
      console.warn("[Reactions] DynamoDB fetch failed, trying Firestore:", dynErr);
    }

    // Fallback: Check Firestore
    if (!fetchedFromDynamo) {
      try {
        const parentRef = roomId
          ? db.collection("roarRooms").doc(roomId).collection("messages").doc(postId)
          : db.collection("roarPosts").doc(postId);

        const parentSnap = await parentRef.get();
        if (parentSnap.exists) {
          parentExists = true;
          const likesSnap = await parentRef
              .collection("likes")
              .orderBy("reactedAt", "desc")
              .limit(limit)
              .get();

          reactorsData = likesSnap.docs.map(doc => {
            const data = doc.data();
            return {
              userId: doc.id,
              reaction: data.reaction ?? "heart",
              reactedAt: data.reactedAt ?? 0
            };
          });
        }
      } catch (fsErr) {
        console.warn("[Reactions] Firestore fetch failed:", fsErr);
      }
    }

    if (!parentExists) {
      return NextResponse.json({ error: roomId ? "Message not found" : "Post not found" }, { status: 404 });
    }

    if (reactorsData.length === 0) {
      return NextResponse.json({ success: true, reactors: [], total: 0 });
    }

    // 2. Fetch User Profiles in parallel
    const userIds = reactorsData.map(r => r.userId);
    const profileMap = new Map<string, any>();

    // Try DynamoDB batch get first
    let fetchedProfiles = false;
    try {
      const keys = userIds.map(uid => ({
        entityId: `USER#${uid}`,
        sk: "USER#META"
      }));

      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < keys.length; i += chunkSize) {
        chunks.push(keys.slice(i, i + chunkSize));
      }

      const batchResults = await Promise.all(chunks.map(chunk =>
        docClient.send(new BatchGetCommand({
          RequestItems: {
            "IdentityAndAccess": {
              Keys: chunk
            }
          }
        }))
      ));

      batchResults.forEach(res => {
        const items = res.Responses?.["IdentityAndAccess"] || [];
        items.forEach(item => {
          const uid = (item.entityId as string).replace(/^USER#/, "");
          profileMap.set(uid, item);
        });
      });
      fetchedProfiles = true;
    } catch (dynErr) {
      console.warn("[Reactions] DynamoDB batch get profiles failed, trying Firestore:", dynErr);
    }

    // Fallback: Fetch user profiles from Firestore
    if (!fetchedProfiles || profileMap.size < userIds.length) {
      try {
        const missingUserIds = userIds.filter(uid => !profileMap.has(uid));
        const profileSnaps = await Promise.all(
          missingUserIds.map((uid) => db.collection("users").doc(uid).get())
        );
        profileSnaps.forEach((snap, idx) => {
          const uid = missingUserIds[idx];
          if (snap.exists) {
            profileMap.set(uid, snap.data());
          }
        });
      } catch (fsErr) {
        console.warn("[Reactions] Firestore batch profiles fallback failed:", fsErr);
      }
    }

    const reactors = reactorsData.map(r => {
      const profile = profileMap.get(r.userId);
      return {
        userId: r.userId,
        username: profile?.username || profile?.userName || r.userId,
        avatarUrl: profile?.avatarUrl || undefined,
        badge: profile?.badge || "RISING_FAN",
        reaction: r.reaction,
        reactedAt: r.reactedAt
      };
    });

    // Sort by reactedAt desc
    reactors.sort((a, b) => b.reactedAt - a.reactedAt);

    return NextResponse.json({ success: true, reactors, total: reactors.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error(`GET /api/roar/posts/reactions error:`, error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}