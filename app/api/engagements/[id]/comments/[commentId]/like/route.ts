import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { id, commentId } = await params;
    const cleanEngId = id.replace(/^ENGAGEMENT#/, "");
    const authUser = await getUser(req);
    const userId = authUser?.userId || "anon_user";

    // Check current like status
    let currentLikes = 0;
    let nextLikes = 1;
    let liked = true;

    // 1. Try reading comment from DynamoDB
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
        currentLikes = Number(getRes.Item.likesCount || getRes.Item.likes || 0);
        const likedBy = Array.isArray(getRes.Item.likedBy) ? getRes.Item.likedBy : [];
        if (likedBy.includes(userId)) {
          liked = false;
          nextLikes = Math.max(0, currentLikes - 1);
        } else {
          liked = true;
          nextLikes = currentLikes + 1;
        }

        const updatedLikedBy = liked
          ? [...likedBy, userId]
          : likedBy.filter((u: string) => u !== userId);

        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.SocialAndContent,
            Key: {
              contentId: `ENGAGEMENT#${cleanEngId}`,
              sk: `COMMENT#${commentId}`,
            },
            UpdateExpression: "SET likesCount = :lc, likedBy = :lb",
            ExpressionAttributeValues: {
              ":lc": nextLikes,
              ":lb": updatedLikedBy,
            },
          })
        );
      }
    } catch (dynErr) {
      console.warn("[CommentLike POST] DynamoDB notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    try {
      const commRef = db
        .collection(getFirestoreCollection("engagements"))
        .doc(cleanEngId)
        .collection("comments")
        .doc(commentId);

      await commRef.update({
        likesCount: FieldValue.increment(liked ? 1 : -1),
      });
    } catch (fsErr) {
      console.warn("[CommentLike POST] Firestore notice:", fsErr);
    }

    return NextResponse.json({
      success: true,
      liked,
      likesCount: nextLikes,
    });
  } catch (error: any) {
    console.error("POST /api/engagements/[id]/comments/[commentId]/like error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to like comment" },
      { status: 500 }
    );
  }
}

