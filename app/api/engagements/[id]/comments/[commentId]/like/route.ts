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

    // 1. Fetch current comment item from DynamoDB SocialAndContent
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: {
            contentId: `ENGAGEMENT#${cleanEngId}`,
            sk: `COMMENT#${commentId}`,
          },
        })
      );

      if (getRes.Item) {
        itemFoundInDynamo = true;
        currentLikes = Number(getRes.Item.likesCount || getRes.Item.likes || 0);
        likedBy = Array.isArray(getRes.Item.likedBy) ? getRes.Item.likedBy : [];
      }
    } catch (dynErr) {
      console.warn("[CommentLike POST] DynamoDB get notice:", dynErr);
    }

    // 1b. Check Firestore if not found in DynamoDB or to get full likedBy
    let fsCommentRef: any = null;
    if (db) {
      try {
        fsCommentRef = db
          .collection(getFirestoreCollection("engagements"))
          .doc(cleanEngId)
          .collection("comments")
          .doc(commentId);

        if (!itemFoundInDynamo) {
          const snap = await fsCommentRef.get();
          if (snap.exists) {
            const data = snap.data() || {};
            currentLikes = Number(data.likesCount || data.likes || 0);
            likedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
          }
        }
      } catch (fsErr) {
        console.warn("[CommentLike POST] Firestore lookup notice:", fsErr);
      }
    }

    const alreadyLiked = likedBy.includes(userId) || likedBy.includes("me");
    const liked = !alreadyLiked;
    const nextLikes = Math.max(0, currentLikes + (liked ? 1 : -1));
    const nextLikedBy = liked
      ? Array.from(new Set([...likedBy, userId]))
      : likedBy.filter((u: string) => u !== userId && u !== "me");

    // Dual-write to DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: {
            contentId: `ENGAGEMENT#${cleanEngId}`,
            sk: `COMMENT#${commentId}`,
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
