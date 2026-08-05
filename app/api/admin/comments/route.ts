// api/admin/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, ScanCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface Comment {
  id: string;
  commentId?: string;
  contentId: string;
  contentType: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string;
  commentText: string;
  parentCommentId?: string;
  likes?: number;
  likedBy?: string[];
  timestamp?: number;
  createdAt: number;
  updatedAt: number;
  isFlagged?: boolean;
  flaggedAt?: number | null;
  metadata?: {
    contentTitle?: string;
    contentUrl?: string;
  };
}

// ─── GET: Fetch all comments for admin ───────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeContentTypes = searchParams.get("includeContentTypes") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");
    const lastDocId = searchParams.get("lastDocId");
    const searchQuery = searchParams.get("search")?.toLowerCase() || "";
    const contentType = searchParams.get("contentType")?.trim().toLowerCase() || "";

    let comments: Comment[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan first
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "SocialAndContent",
        FilterExpression: "begins_with(sk, :p) OR attribute_exists(commentId)",
        ExpressionAttributeValues: { ":p": "COMMENT#" }
      }));

      if (scanRes.Items && scanRes.Items.length > 0) {
        comments = scanRes.Items.map(item => ({
          id: item.commentId || (item.sk as string).replace(/^COMMENT#/, ""),
          commentId: item.commentId || (item.sk as string).replace(/^COMMENT#/, ""),
          contentId: item.contentId,
          contentType: item.contentType || "general",
          userId: item.userId || "",
          userName: item.userName || "Fan",
          userEmail: item.userEmail,
          userAvatar: item.userAvatar,
          commentText: item.commentText || "",
          parentCommentId: item.parentCommentId,
          likes: item.likes ?? 0,
          likedBy: item.likedBy ?? [],
          timestamp: item.timestamp,
          createdAt: item.createdAt || Date.now(),
          updatedAt: item.updatedAt || Date.now(),
          isFlagged: item.isFlagged ?? false,
          flaggedAt: item.flaggedAt,
          metadata: item.metadata
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AdminComments GET] DynamoDB scan failed, falling back:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || comments.length === 0) {
      try {
        const snapshot = await db.collection("comments").orderBy("createdAt", "desc").get();
        comments = snapshot.docs.map((doc) => ({
          id: doc.id,
          commentId: doc.id,
          ...(doc.data() as any),
        }));
      } catch (fsErr) {
        console.error("[AdminComments GET] Firestore fallback failed:", fsErr);
      }
    }

    if (includeContentTypes) {
      const contentTypes = Array.from(
        new Set(
          comments
            .map((c) => String(c.contentType || "").trim())
            .filter(Boolean)
        )
      ).sort();

      return NextResponse.json({
        success: true,
        contentTypes,
      });
    }

    // Filter in-memory
    if (contentType) {
      comments = comments.filter((comment) =>
        String(comment.contentType || "").trim().toLowerCase().includes(contentType)
      );
    }

    if (searchQuery) {
      comments = comments.filter((comment) =>
        comment.commentText.toLowerCase().includes(searchQuery) ||
        comment.userName.toLowerCase().includes(searchQuery) ||
        comment.userEmail?.toLowerCase().includes(searchQuery)
      );
    }

    // Sort by createdAt desc
    comments.sort((a, b) => b.createdAt - a.createdAt);

    // Pagination
    let startIndex = 0;
    if (lastDocId) {
      const idx = comments.findIndex(c => c.id === lastDocId);
      if (idx !== -1) startIndex = idx + 1;
    }

    const pagedComments = comments.slice(startIndex, startIndex + limit);
    const hasMore = comments.length > startIndex + limit;
    const lastDoc = pagedComments[pagedComments.length - 1];

    return NextResponse.json({
      success: true,
      comments: pagedComments,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? { lastDocId: lastDoc?.id } : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Admin delete comment ────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");

    if (!commentId) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB first
    try {
      // Find comment item to get PK and SK
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "SocialAndContent",
        FilterExpression: "commentId = :cid OR sk = :sk",
        ExpressionAttributeValues: {
          ":cid": commentId,
          ":sk": `COMMENT#${commentId}`
        }
      }));

      const commentItem = scanRes.Items?.[0];
      if (commentItem) {
        await docClient.send(new DeleteCommand({
          TableName: "SocialAndContent",
          Key: { contentId: commentItem.contentId, sk: commentItem.sk }
        }));
      }

      // Find and delete replies
      const repliesRes = await docClient.send(new ScanCommand({
        TableName: "SocialAndContent",
        FilterExpression: "parentCommentId = :pid",
        ExpressionAttributeValues: { ":pid": commentId }
      }));

      if (repliesRes.Items) {
        for (const reply of repliesRes.Items) {
          await docClient.send(new DeleteCommand({
            TableName: "SocialAndContent",
            Key: { contentId: reply.contentId, sk: reply.sk }
          })).catch(() => {});
        }
      }
    } catch (dynErr) {
      console.warn("[AdminComments DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync/Fallback to Firestore
    try {
      const commentRef = db.collection("comments").doc(commentId);
      await commentRef.delete();

      const repliesSnapshot = await db.collection("comments")
        .where("parentCommentId", "==", commentId)
        .get();

      const batch = db.batch();
      repliesSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } catch (fsErr) {
      console.warn("[AdminComments DELETE] Firestore fallback delete failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Comment and its replies deleted successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting comment:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH: Admin flag/unflag comment ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { commentId, isFlagged } = body;

    if (!commentId || typeof isFlagged !== "boolean") {
      return NextResponse.json({ error: "commentId and isFlagged are required" }, { status: 400 });
    }

    const now = Date.now();
    let updatedComment: any = null;

    // 1. Update in DynamoDB first
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "SocialAndContent",
        FilterExpression: "commentId = :cid OR sk = :sk",
        ExpressionAttributeValues: {
          ":cid": commentId,
          ":sk": `COMMENT#${commentId}`
        }
      }));

      const commentItem = scanRes.Items?.[0];
      if (commentItem) {
        await docClient.send(new UpdateCommand({
          TableName: "SocialAndContent",
          Key: { contentId: commentItem.contentId, sk: commentItem.sk },
          UpdateExpression: "SET isFlagged = :f, flaggedAt = :fa, updatedAt = :u",
          ExpressionAttributeValues: {
            ":f": isFlagged,
            ":fa": isFlagged ? now : null,
            ":u": now
          }
        }));
        updatedComment = {
          ...commentItem,
          isFlagged,
          flaggedAt: isFlagged ? now : null,
          updatedAt: now
        };
      }
    } catch (dynErr) {
      console.warn("[AdminComments PATCH] DynamoDB update failed:", dynErr);
    }

    // 2. Sync/Fallback to Firestore
    try {
      const commentRef = db.collection("comments").doc(commentId);
      await commentRef.update({
        isFlagged,
        flaggedAt: isFlagged ? now : null,
        updatedAt: now,
      });

      if (!updatedComment) {
        const doc = await commentRef.get();
        if (doc.exists) {
          updatedComment = { id: doc.id, ...doc.data() };
        }
      }
    } catch (fsErr) {
      console.warn("[AdminComments PATCH] Firestore fallback update failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: isFlagged ? "Comment flagged successfully" : "Comment unflagged successfully",
      comment: updatedComment || { id: commentId },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating comment flag:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
