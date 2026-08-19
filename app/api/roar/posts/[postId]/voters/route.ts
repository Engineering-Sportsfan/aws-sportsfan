// api/roar/posts/[postId]/voters/route.ts
//
// Returns the list of voters for a debate post, grouped by side (agree / disagree).
// Only the post author is allowed to call this endpoint.

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
    const resolvedParams = await params;
    const { postId } = resolvedParams;

    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch parent post from DynamoDB first
    let postItem: any = null;
    let fetchedPostFromDynamo = false;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        postItem = qRes.Items[0];
        fetchedPostFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Voters GET] DynamoDB post fetch failed:", dynErr);
    }

    const postRef = db.collection("roarPosts").doc(postId);
    let postExists = fetchedPostFromDynamo;
    let fallbackPostData: any = null;

    if (!postExists) {
      try {
        const snap = await postRef.get();
        if (snap.exists) {
          postExists = true;
          fallbackPostData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[Voters GET] Firestore post fetch failed:", fsErr);
      }
    }

    if (!postExists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const postData = postItem || fallbackPostData || {};

    // Only the post author may see the voter list
    if (
      postData.authorUid !== user.userId &&
      postData.authorUid !== user.email
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (postData.type !== "debate") {
      return NextResponse.json(
        { error: "Voter list is only available for debate posts" },
        { status: 400 },
      );
    }

    // 2. Fetch all votes from DynamoDB first
    let votesData: any[] = [];
    let fetchedVotesFromDynamo = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "SocialAndContent",
        KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "VOTE#" }
      }));
      if (res.Items) {
        votesData = res.Items.map(item => ({
          id: (item.sk as string).replace(/^VOTE#/, ""),
          ...item
        }));
        fetchedVotesFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Voters GET] DynamoDB votes fetch failed:", dynErr);
    }

    // Fallback: Check Firestore for votes
    if (!fetchedVotesFromDynamo) {
      try {
        const votesSnap = await postRef.collection("roarVotes").get();
        votesData = votesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (fsErr) {
        console.error("[Voters GET] Firestore votes fetch failed:", fsErr);
      }
    }

    const agree: { uid: string; username: string; avatarUrl?: string }[] = [];
    const disagree: { uid: string; username: string; avatarUrl?: string }[] = [];

    const voterUids = votesData.map((v) => v.id);
    const usernameByUid = new Map<string, { username: string; avatarUrl?: string }>();

    if (voterUids.length > 0) {
      let fetchedProfiles = false;
      try {
        const keys = voterUids.map(uid => ({
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
          usernameByUid.set(uid, {
            username: item.username || item.userName || uid,
            avatarUrl: item.avatarUrl,
          });
        });
        fetchedProfiles = true;
      } catch (dynErr) {
        console.warn("[Voters GET] DynamoDB batch profile lookup failed:", dynErr);
      }

      // Fallback: Check Firestore
      if (!fetchedProfiles || usernameByUid.size < voterUids.length) {
        try {
          const missingUserIds = voterUids.filter(uid => !usernameByUid.has(uid));
          const userRefs = missingUserIds.map((uid) => db.collection("users").doc(uid));
          const userSnaps = userRefs.length > 0 ? await db.getAll(...userRefs) : [];
          userSnaps.forEach((snap) => {
            if (snap.exists) {
              const d = snap.data() as { username?: string; avatarUrl?: string };
              usernameByUid.set(snap.id, {
                username: d.username ?? snap.id,
                avatarUrl: d.avatarUrl,
              });
            }
          });
        } catch (fsErr) {
          console.error("[Voters GET] Firestore fallback profile lookup failed:", fsErr);
        }
      }
    }

    votesData.forEach((voteItem) => {
      const { vote } = voteItem as { vote: "agree" | "disagree" };
      const uid = voteItem.id;
      const info = usernameByUid.get(uid) ?? { username: uid, avatarUrl: undefined };
      const entry = { uid, username: info.username, avatarUrl: info.avatarUrl };
      if (vote === "agree") agree.push(entry);
      else disagree.push(entry);
    });

    return NextResponse.json({
      success: true,
      sideA: postData.sideA ?? "Side A",
      sideB: postData.sideB ?? "Side B",
      voters: { agree, disagree },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/posts/[postId]/voters error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}