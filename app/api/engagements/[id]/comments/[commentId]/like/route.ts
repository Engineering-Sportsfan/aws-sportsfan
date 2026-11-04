import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const cleanEngId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const cleanCommentId = String(commentId || "").replace(/^COMMENT#/, "").trim();
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req);
    const userId =
      authUser?.userId ||
      authUser?.email ||
      body?.userId ||
      req.headers.get("x-user-id") ||
      "guest_fan";

    let currentLikes = 0;
    let likedBy: string[] = [];
    let itemFoundInDynamo = false;
    let matchedContentId = `ENGAGEMENT#${cleanEngId}`;

    const contentCandidates = Array.from(new Set([
      `ENGAGEMENT#${cleanEngId}`,
      cleanEngId,
      `RECOGNITION#${cleanEngId}`,
      `MOMENT#${cleanEngId}`,
      String(id || "").trim(),
    ]));

    // 1. Fetch current comment item from DynamoDB SocialAndContent across candidates
    for (const cCand of contentCandidates) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: cCand,
              sk: `COMMENT#${cleanCommentId}`,
            },
          })
        );

        if (getRes.Item) {
          itemFoundInDynamo = true;
          matchedContentId = cCand;
          currentLikes = Number(getRes.Item.likesCount || getRes.Item.likes || 0);
          likedBy = Array.isArray(getRes.Item.likedBy) ? getRes.Item.likedBy : [];
          break;
        }
      } catch (dynErr) {
        console.warn("[CommentLike POST] DynamoDB get notice:", dynErr);
      }
    }

    // 1b. Check Firestore to merge full likedBy
    let fsCommentRef: any = null;
    if (db) {
      try {
        fsCommentRef = db
          .collection(getFirestoreCollection("engagements"))
          .doc(cleanEngId)
          .collection("comments")
          .doc(cleanCommentId);

        const snap = await fsCommentRef.get();
        if (snap.exists) {
          const data = snap.data() || {};
          const fsLikedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
          likedBy = Array.from(new Set([...likedBy, ...fsLikedBy]));
          currentLikes = Math.max(currentLikes, Number(data.likesCount || data.likes || 0), likedBy.length);
        }
      } catch (fsErr) {
        console.warn("[CommentLike POST] Firestore lookup notice:", fsErr);
      }
    }

    const cleanTargetUid = String(userId).replace(/^USER#/i, "").toLowerCase();
    const alreadyLiked = likedBy.some((u: string) => {
      const cu = String(u).replace(/^USER#/i, "").toLowerCase();
      return cu === cleanTargetUid || cu === "me";
    });
    const liked = !alreadyLiked;
    const nextLikedBy = liked
      ? Array.from(new Set([...likedBy, userId]))
      : likedBy.filter((u: string) => {
          const cu = String(u).replace(/^USER#/i, "").toLowerCase();
          return cu !== cleanTargetUid && cu !== "me";
        });
    const nextLikes = nextLikedBy.length;

    // Dual-write to DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: {
            contentId: matchedContentId,
            sk: `COMMENT#${cleanCommentId}`,
          },
          UpdateExpression: "SET likesCount = :lc, likes = :lc, likedBy = :lb",
          ExpressionAttributeValues: {
            ":lc": nextLikes,
            ":lb": nextLikedBy,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[CommentLike POST] DynamoDB update notice:", dynErr);
    }

    // Dual-write to Firestore
    if (fsCommentRef) {
      try {
        await fsCommentRef.set({
          likesCount: nextLikes,
          likes: nextLikes,
          likedBy: nextLikedBy,
        }, { merge: true });
      } catch (fsErr) {
        console.warn("[CommentLike POST] Firestore update notice:", fsErr);
      }
    }

    return NextResponse.json({
      success: true,
      liked,
      likesCount: nextLikes,
      likes: nextLikes,
      likedBy: nextLikedBy,
    });
  } catch (error: any) {
    console.error("POST /api/engagements/[id]/comments/[commentId]/like error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to like comment" },
      { status: 500 }
    );
  }
}
