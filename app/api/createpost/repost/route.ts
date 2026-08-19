// app/api/createpost/repost/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { v4 as uuidv4 } from "uuid";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

async function fetchOriginalPost(id: string): Promise<Record<string, unknown> | null> {
  const candidates = [`POST#${id}`, `POST_ROAR#${id}`, id];

  for (const contentId of candidates) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": contentId },
          Limit: 1,
        })
      );
      if (res.Items && res.Items.length > 0) {
        return res.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn(`DynamoDB fetch original post candidate ${contentId} notice:`, err);
    }
  }

  // Fallback to Firebase
  try {
    const doc = await db.collection("socialPosts").doc(id).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() } as Record<string, unknown>;
    }
  } catch (err) {
    console.warn("Firebase fetch original post fallback notice:", err);
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { postId, userId, userName, userEmail = "", quoteText } = body as {
      postId: string;
      userId: string;
      userName: string;
      userEmail?: string;
      quoteText?: string;
    };

    if (!postId || !userId || !userName) {
      return NextResponse.json(
        { success: false, error: "postId, userId, and userName are required" },
        { status: 400 }
      );
    }

    const originalData = await fetchOriginalPost(postId);
    if (!originalData) {
      return NextResponse.json(
        { success: false, error: "Original post not found" },
        { status: 404 }
      );
    }

    const alreadyReposted = ((originalData.repostedBy as string[]) || []).includes(userId);
    if (!quoteText && alreadyReposted) {
      return NextResponse.json(
        { success: false, error: "You have already reposted this post" },
        { status: 409 }
      );
    }

    const now = Date.now();
    const docId = uuidv4();

    if (quoteText) {
      const newPost = {
        id: docId,
        userName,
        userHandle: (originalData.userHandle as string) ?? userName.toLowerCase().replace(/\s+/g, ""),
        userAvatar: "",
        userEmail,
        content: quoteText,
        media: [],
        poll: null,
        likes: 0,
        likedBy: [],
        reactions: {},
        repostCount: 0,
        repostedBy: [],
        isQuoteRepost: true,
        isRepost: false,
        originalPostId: postId,
        quotedPost: {
          id: postId,
          userName: originalData.userName,
          userHandle: originalData.userHandle,
          content: originalData.content || originalData.text || "",
          media: originalData.media || [],
          createdAt: originalData.createdAt,
        },
        createdAt: now,
        updatedAt: now,
      };

      const dynamoItem = {
        contentId: `POST#${docId}`,
        sk: `POST#${now}`,
        postId: docId,
        ...newPost,
      };

      await dualWrite("socialPosts", docId, "SocialAndContent", dynamoItem);

      // Increment original post's repostCount
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "SocialAndContent",
            Key: {
              contentId: (originalData.contentId as string) || `POST#${postId}`,
              sk: (originalData.sk as string) || `POST#${originalData.createdAt || now}`,
            },
            UpdateExpression: "SET repostCount = if_not_exists(repostCount, :zero) + :inc, updatedAt = :u",
            ExpressionAttributeValues: {
              ":inc": 1,
              ":zero": 0,
              ":u": now,
            },
          })
        );
      } catch (err) {
        console.warn("DynamoDB increment repost count notice:", err);
      }

      try {
        await db.collection("socialPosts").doc(postId).update({
          repostCount: FieldValue.increment(1),
        });
      } catch (fbErr) {
        console.warn("Firebase increment repost sync notice:", fbErr);
      }

      return NextResponse.json(
        { success: true, data: { ...newPost, id: docId }, type: "quote" },
        { status: 201 }
      );
    } else {
      const newPost = {
        id: docId,
        userName,
        userHandle: (originalData.userHandle as string) ?? userName.toLowerCase().replace(/\s+/g, ""),
        userAvatar: "",
        userEmail,
        content: originalData.content || originalData.text || "",
        media: originalData.media || [],
        poll: null,
        likes: 0,
        likedBy: [],
        reactions: {},
        repostCount: 0,
        repostedBy: [],
        isRepost: true,
        isQuoteRepost: false,
        originalPostId: postId,
        quotedPost: null,
        createdAt: now,
        updatedAt: now,
      };

      const dynamoItem = {
        contentId: `POST#${docId}`,
        sk: `POST#${now}`,
        postId: docId,
        ...newPost,
      };

      await dualWrite("socialPosts", docId, "SocialAndContent", dynamoItem);

      // Mark original as reposted by this user + increment count
      const updatedRepostedBy = [...((originalData.repostedBy as string[]) || []), userId];
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "SocialAndContent",
            Key: {
              contentId: (originalData.contentId as string) || `POST#${postId}`,
              sk: (originalData.sk as string) || `POST#${originalData.createdAt || now}`,
            },
            UpdateExpression: "SET repostCount = if_not_exists(repostCount, :zero) + :inc, repostedBy = :rb, updatedAt = :u",
            ExpressionAttributeValues: {
              ":inc": 1,
              ":zero": 0,
              ":rb": updatedRepostedBy,
              ":u": now,
            },
          })
        );
      } catch (err) {
        console.warn("DynamoDB repost update notice:", err);
      }

      try {
        await db.collection("socialPosts").doc(postId).update({
          repostCount: FieldValue.increment(1),
          repostedBy: FieldValue.arrayUnion(userId),
        });
      } catch (fbErr) {
        console.warn("Firebase repost sync notice:", fbErr);
      }

      return NextResponse.json(
        { success: true, data: { ...newPost, id: docId }, type: "repost" },
        { status: 201 }
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/createpost/repost error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}