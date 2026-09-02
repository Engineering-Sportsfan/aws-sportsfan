import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import type { Post } from "@/app/models/Post";

export const dynamic = "force-dynamic";

// GET  /api/roar/feed?filter=For+You&limit=20&lastDocId=xxx
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter") ?? "For You";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastDocId = searchParams.get("lastDocId");

    let posts: Post[] = [];
    let fetchedFromDynamo = false;

    // 1. Try querying DynamoDB first using status-createdAt-index
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: TABLES.SocialAndContent,
        IndexName: "status-createdAt-index",
        KeyConditionExpression: "#s = :active",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":active": "active" },
        ScanIndexForward: false, // newest first
        Limit: 500
      }));

      if (res.Items) {
        posts = res.Items.map((item) => ({
          ...(item as any),
          postId: (item.contentId as string).replace(/^POST#/, "")
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Feed GET] DynamoDB GSI lookup failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const query = db
          .collection("roarPosts")
          .where("status", "==", "active")
          .orderBy("createdAt", "desc")
          .limit(500);

        const snapshot = await query.get();
        posts = snapshot.docs.map((doc) => ({
          ...(doc.data() as Post),
          postId: doc.id,
        }));
      } catch (fsErr) {
        console.error("[Feed GET] Firestore fallback failed:", fsErr);
        return NextResponse.json({ error: "Failed to load feed" }, { status: 500 });
      }
    }

    // Apply filters in-memory
    if (filter === "Cricket") {
      posts = posts.filter((p) => p.sport === "cricket");
    } else if (filter === "Football") {
      posts = posts.filter((p) => p.sport === "football");
    } else if (filter === "Live") {
      posts = posts.filter((p) => p.isLive === true);
    } else if (filter === "Predictions") {
      posts = posts.filter((p) => p.type === "prediction");
    }

    // Paginate the filtered array in-memory
    let startIndex = 0;
    if (lastDocId) {
      const idx = posts.findIndex((p) => p.postId === lastDocId);
      if (idx !== -1) {
        startIndex = idx + 1;
      }
    }

    const paginatedPosts = posts.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < posts.length;
    const lastDoc = paginatedPosts[paginatedPosts.length - 1];

    const userInfo = await getUserInfo(user.userId, undefined, user.email);
    const resolvedUserId = userInfo.actualUserId;

    const postsWithVote = await Promise.all(
      paginatedPosts.map(async (p) => {
        let userVote = null;
        let fetchedVoteFromDynamo = false;

        // Try DynamoDB vote lookup
        try {
          const voteRes = await docClient.send(new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: `POST#${p.postId}`,
              sk: `VOTE#${resolvedUserId}`
            }
          }));
          if (voteRes.Item) {
            userVote = voteRes.Item.vote;
            fetchedVoteFromDynamo = true;
          } else {
            // Check legacy vote lookup
            const voteLegacyRes = await docClient.send(new GetCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: `POST#${p.postId}`,
                sk: `VOTE#${user.userId}`
              }
            }));
            if (voteLegacyRes.Item) {
              userVote = voteLegacyRes.Item.vote;
              fetchedVoteFromDynamo = true;
            }
          }
        } catch (dynErr) {
          console.warn("[Feed GET] DynamoDB vote check failed for post:", p.postId, dynErr);
        }

        // Fallback: Check Firestore
        if (!fetchedVoteFromDynamo) {
          try {
            const docRef = db.collection("roarPosts").doc(p.postId);
            const voteSnap = await docRef.collection("votes").doc(resolvedUserId).get();
            if (voteSnap.exists) {
              userVote = (voteSnap.data() as any).vote;
            }
          } catch (fsErr) {
            console.warn("[Feed GET] Firestore fallback vote check failed:", fsErr);
          }
        }

        return {
          ...p,
          userVote,
        };
      })
    );

    return NextResponse.json({
      success: true,
      posts: postsWithVote,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && lastDoc ? { lastDocId: lastDoc.postId } : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/feed error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
