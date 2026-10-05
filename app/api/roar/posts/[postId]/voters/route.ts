import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { resolveUserProfiles, formatCleanUsername } from "@/lib/roarRoomHelpers";

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
        TableName: TABLES.SocialAndContent,
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

    const postRef = db.collection(getFirestoreCollection("roarPosts")).doc(postId);
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
        TableName: TABLES.SocialAndContent,
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

    const agree: { uid: string; username: string; avatarUrl?: string; badge?: string }[] = [];
    const disagree: { uid: string; username: string; avatarUrl?: string; badge?: string }[] = [];

    const voterUids = votesData.map((v) => v.id);
    const profileMap = await resolveUserProfiles(voterUids);

    votesData.forEach((voteItem) => {
      const { vote } = voteItem as { vote: "agree" | "disagree" };
      const uid = voteItem.id;
      const p = profileMap.get(uid);
      const entry = {
        uid,
        username: p?.username || formatCleanUsername(uid),
        avatarUrl: p?.avatarUrl,
        badge: p?.badge || "Fan",
      };
      if (vote === "agree") agree.push(entry);
      else disagree.push(entry);
    });

    return NextResponse.json({
      success: true,
      sideA: postData.sideA ?? "Side A",
      sideB: postData.sideB ?? "Side B",
      totalVotes: voterUids.length,
      totalVoters: voterUids.length,
      agree,
      disagree,
      voters: {
        agree,
        disagree,
        [postData.sideA ?? "Side A"]: agree,
        [postData.sideB ?? "Side B"]: disagree,
      },
      options: [
        { label: postData.sideA ?? "Side A", text: postData.sideA ?? "Side A", voteValue: "agree", count: agree.length, users: agree, voters: agree },
        { label: postData.sideB ?? "Side B", text: postData.sideB ?? "Side B", voteValue: "disagree", count: disagree.length, users: disagree, voters: disagree },
      ],
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/posts/[postId]/voters error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}