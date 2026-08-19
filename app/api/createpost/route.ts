// app/api/createpost/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { v4 as uuidv4 } from "uuid";
import { awardUserPoints } from "@/lib/userPoints";
import cloudinary from "@/lib/cloudinary";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { Post, Poll, PollOption, CreatePostPayload, MediaItem } from "@/types/createposts";

export const dynamic = "force-dynamic";

const POST_POINTS_REWARD = 12;

interface PollInput {
  options: string[];
}

// ─── POST /api/createpost — Create a new post ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let userName: string | undefined;
    let userHandle: string | undefined;
    let userAvatar: string | undefined;
    let content: string | undefined;
    let pollInput: PollInput | null = null;
    let userId: string | undefined;
    let userEmail: string | undefined;
    const mediaItems: MediaItem[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();

      userName = formData.get("userName") as string;
      userHandle = formData.get("userHandle") as string;
      userAvatar = formData.get("userAvatar") as string;
      content = formData.get("content") as string;
      userId = formData.get("userId") as string;
      userEmail = formData.get("userEmail") as string;

      const pollStr = formData.get("poll") as string;
      if (pollStr) {
        try {
          pollInput = JSON.parse(pollStr) as PollInput;
        } catch (e) {
          console.error("Failed to parse poll:", e);
        }
      }

      const mediaFiles = formData.getAll("media") as File[];
      if (mediaFiles && mediaFiles.length > 0) {
        for (const file of mediaFiles) {
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

          const uploadRes = await cloudinary.uploader.upload(base64, {
            folder: `social-posts/${userId || "anonymous"}`,
            resource_type: "auto",
            transformation: [{ quality: "auto", fetch_format: "auto" }],
          });

          mediaItems.push({
            url: uploadRes.secure_url,
            type: file.type.startsWith("video") ? "video" : "image",
            name: file.name,
          });
        }
      }
    } else {
      const body: CreatePostPayload & {
        userId?: string;
        userEmail?: string;
      } = await req.json();

      userName = body.userName;
      userHandle = body.userHandle;
      userAvatar = body.userAvatar;
      content = body.content;

      if (body.poll && typeof body.poll === "object" && Array.isArray(body.poll.options)) {
        pollInput = { options: body.poll.options };
      }

      userId = body.userId;
      userEmail = body.userEmail;

      if (body.media && body.media.length > 0) {
        mediaItems.push(...body.media);
      }
    }

    if (!userName || !userHandle) {
      return NextResponse.json(
        { success: false, error: "userName and userHandle are required" },
        { status: 400 }
      );
    }

    if (!content && mediaItems.length === 0 && !pollInput) {
      return NextResponse.json(
        { success: false, error: "Post must have content, media, or a poll" },
        { status: 400 }
      );
    }

    let builtPoll: Poll | null = null;
    if (pollInput && Array.isArray(pollInput.options) && pollInput.options.length >= 2) {
      const options: PollOption[] = pollInput.options
        .filter((option: string) => option.trim() !== "")
        .map((optionText: string) => ({
          id: uuidv4(),
          text: optionText.trim(),
          votes: 0,
        }));

      if (options.length >= 2) {
        builtPoll = {
          options,
          totalVotes: 0,
          endsAt: Date.now() + 24 * 60 * 60 * 1000,
          createdAt: Date.now(),
          votedBy: [],
        };
      }
    }

    const now = Date.now();
    const docId = uuidv4();

    const newPostData = {
      id: docId,
      userName,
      userHandle,
      userAvatar: userAvatar || "",
      content: content || "",
      media: mediaItems,
      userEmail: userEmail || "",
      poll: builtPoll,
      likes: 0,
      likedBy: [],
      createdAt: now,
      updatedAt: now,
      status: "active",
      cardType: "post",
    };

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const dynamoItem = {
      contentId: `POST#${docId}`,
      sk: `POST#${now}`,
      postId: docId,
      ...newPostData,
    };

    await dualWrite("socialPosts", docId, "SocialAndContent", dynamoItem);

    // ── Award Points ─────────────────────────────────────────────────────────
    let pointsAwarded = 0;
    if (userId) {
      try {
        await awardUserPoints({
          actualUserId: userId,
          userName: userName,
          userEmail: userEmail || "",
          userExists: true,
          points: POST_POINTS_REWARD,
          reason: "CREATE_POST",
          transactionId: `${userId}_${docId}_CREATE_POST`,
          metadata: { postId: docId },
        });
        pointsAwarded = POST_POINTS_REWARD;
      } catch (pointsErr) {
        console.error("[createpost] Failed to award points:", pointsErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: { ...newPostData, id: docId },
        pointsAwarded,
        message: pointsAwarded
          ? `Post created! +${pointsAwarded} points awarded!`
          : "Post created successfully!",
      },
      { status: 201 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/createpost error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── GET /api/createpost — Fetch posts (paginated) ───────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

    // 1. Scan DynamoDB SocialAndContent table for posts
    let posts: Post[] = [];

    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "begins_with(contentId, :postPrefix) OR begins_with(sk, :postPrefix)",
          ExpressionAttributeValues: {
            ":postPrefix": "POST",
          },
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        posts = scanRes.Items.map((item) => ({
          id: (item.postId as string) || (item.id as string) || (item.contentId as string)?.replace(/^POST#/, ""),
          userName: (item.userName as string) || (item.authorUsername as string) || "Fan",
          userHandle: (item.userHandle as string) || (item.authorUid as string) || "@sportsfan",
          userAvatar: (item.userAvatar as string) || (item.avatar as string) || "",
          content: (item.content as string) || (item.text as string) || "",
          media: (item.media as MediaItem[]) || [],
          userEmail: (item.userEmail as string) || "",
          poll: (item.poll as Poll) || null,
          likes: (item.likes as number) || (item.likeCount as number) || 0,
          likedBy: (item.likedBy as string[]) || [],
          createdAt: (item.createdAt as number) || Date.now(),
          updatedAt: (item.updatedAt as number) || Date.now(),
          ...item,
        })) as Post[];

        posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }
    } catch (err) {
      console.warn("DynamoDB social posts scan notice:", err);
    }

    // Fallback to Firebase
    if (posts.length === 0) {
      try {
        const snapshot = await db
          .collection("socialPosts")
          .orderBy("createdAt", "desc")
          .limit(limit)
          .get();

        posts = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...(doc.data() as Omit<Post, "id">),
          }))
          .filter((post) => (post as Record<string, unknown>).removed !== true);
      } catch (fbErr) {
        console.warn("Firebase socialPosts fallback notice:", fbErr);
      }
    }

    const paginated = posts.slice(0, limit);
    const lastDoc = paginated[paginated.length - 1];

    return NextResponse.json({
      success: true,
      posts: paginated,
      pagination: {
        limit,
        hasMore: posts.length > limit,
        nextCursor:
          posts.length > limit
            ? {
                lastDocId: lastDoc?.id,
                lastDocCreatedAt: lastDoc?.createdAt,
              }
            : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/createpost error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}