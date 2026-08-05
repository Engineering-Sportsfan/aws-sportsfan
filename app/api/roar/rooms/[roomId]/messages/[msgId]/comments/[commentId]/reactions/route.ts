// api/roar/rooms/[roomId]/messages/[msgId]/comments/[commentId]/reactions/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string; commentId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolvedParams = await params;
    const { roomId, msgId, commentId } = resolvedParams;

    // 1. Fetch parent check & reactions from DynamoDB first
    let reactorsData: any[] = [];
    let commentExists = false;
    let fetchedFromDynamo = false;

    try {
      // Check if comment exists
      const commentRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND sk = :s",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `COMMENT#${msgId}#${commentId}` },
        Limit: 1
      }));

      if (commentRes.Items && commentRes.Items.length > 0) {
        commentExists = true;

        // Query reactions
        const reactionsRes = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": `LIKE#${commentId}#` },
          Limit: 100
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
    } catch (dynErr) {
      console.warn("[CommentReactions] DynamoDB fetch failed, trying Firestore:", dynErr);
    }

    // Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const commentRef = db
          .collection("roarRooms").doc(roomId)
          .collection("messages").doc(msgId)
          .collection("comments").doc(commentId);

        const snap = await commentRef.get();
        if (snap.exists) {
          commentExists = true;
          const likesSnap = await commentRef.collection("likes").orderBy("reactedAt", "desc").limit(100).get();
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
        console.error("[CommentReactions] Firestore fallback failed:", fsErr);
      }
    }

    if (!commentExists) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    if (reactorsData.length === 0) {
      return NextResponse.json({ success: true, reactors: [], total: 0 });
    }

    // 2. Fetch User Profiles
    const userIds = reactorsData.map(r => r.userId);
    const profileMap = new Map<string, any>();

    // Try DynamoDB batch get first
    let fetchedProfiles = false;
    try {
      const keys = userIds.map(uid => ({
        entityId: `USER#${uid}`,
        sk: "USER#META"
      }));

      const batchResults = await docClient.send(new BatchGetCommand({
        RequestItems: {
          "IdentityAndAccess": {
            Keys: keys
          }
        }
      }));

      const items = batchResults.Responses?.["IdentityAndAccess"] || [];
      items.forEach(item => {
        const uid = (item.entityId as string).replace(/^USER#/, "");
        profileMap.set(uid, item);
      });
      fetchedProfiles = true;
    } catch (dynErr) {
      console.warn("[CommentReactions] DynamoDB batch get profiles failed:", dynErr);
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
        console.warn("[CommentReactions] Firestore profiles fallback failed:", fsErr);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}