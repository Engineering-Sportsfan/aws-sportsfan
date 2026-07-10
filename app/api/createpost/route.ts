//api/createpost/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { v4 as uuidv4 } from "uuid";
import { awardUserPoints } from "@/lib/userPoints";
import cloudinary from "@/lib/cloudinary";
import type { Post, Poll, PollOption, CreatePostPayload, MediaItem } from "@/types/createposts";

const POST_POINTS_REWARD = 12;

// Type for the poll data coming from frontend
interface PollInput {
  options: string[];
}

// ─── POST  /api/createpost  — Create a new post ───────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Check if request is multipart/form-data (has files) or JSON
    const contentType = req.headers.get("content-type") || "";
    
    let userName: string | undefined;
    let userHandle: string | undefined;
    let userAvatar: string | undefined;
    let content: string | undefined;
    let pollInput: PollInput | null = null;
    let userId: string | undefined;
    let userEmail: string | undefined;
    let mediaItems: MediaItem[] = [];
    
    if (contentType.includes("multipart/form-data")) {
      // Handle form-data with file uploads
      const formData = await req.formData();
      
      userName = formData.get("userName") as string;
      userHandle = formData.get("userHandle") as string;
      userAvatar = formData.get("userAvatar") as string;
      content = formData.get("content") as string;
      userId = formData.get("userId") as string;
      userEmail = formData.get("userEmail") as string;
      
      // Parse poll if exists
      const pollStr = formData.get("poll") as string;
      if (pollStr) {
        try {
          pollInput = JSON.parse(pollStr) as PollInput;
        } catch (e) {
          console.error("Failed to parse poll:", e);
        }
      }
      
      // Handle media files
      const mediaFiles = formData.getAll("media") as File[];
      if (mediaFiles && mediaFiles.length > 0) {
        // Upload each file to Cloudinary
        for (const file of mediaFiles) {
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;
          
          const uploadRes = await cloudinary.uploader.upload(base64, {
            folder: `social-posts/${userId || "anonymous"}`,
            resource_type: "auto",
            transformation: [
              { quality: "auto", fetch_format: "auto" }
            ]
          });
          
          // Store as MediaItem type
          mediaItems.push({
            url: uploadRes.secure_url,
            type: file.type.startsWith("video") ? "video" : "image",
            name: file.name
          });
        }
      }
    } else {
      // Handle JSON request (legacy support without file uploads)
      const body: CreatePostPayload & {
        userId?: string;
        userEmail?: string;
      } = await req.json();
      
      userName = body.userName;
      userHandle = body.userHandle;
      userAvatar = body.userAvatar;
      content = body.content;
      
      // Handle poll from JSON body
      if (body.poll && typeof body.poll === 'object' && Array.isArray(body.poll.options)) {
        pollInput = { options: body.poll.options };
      }
      
      userId = body.userId;
      userEmail = body.userEmail;
      
      // For JSON requests, media should already be MediaItem[]
      if (body.media && body.media.length > 0) {
        mediaItems = body.media;
      }
    }

    // ── Validation ────────────────────────────────────────────────────────────
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

    // ── Build poll ────────────────────────────────────────────────────────────
    let builtPoll: Poll | null = null;
    if (pollInput && Array.isArray(pollInput.options) && pollInput.options.length >= 2) {
      const options: PollOption[] = pollInput.options
        .filter((option: string) => option.trim() !== "")
        .map((optionText: string) => ({ 
          id: uuidv4(), 
          text: optionText.trim(), 
          votes: 0 
        }));

      if (options.length < 2) {
        return NextResponse.json(
          { success: false, error: "Poll must have at least 2 non-empty options" },
          { status: 400 }
        );
      }

      builtPoll = {
        options,
        totalVotes: 0,
        endsAt: Date.now() + 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
        votedBy: [],
      };
    }

    // ── Save post with Cloudinary URLs ────────────────────────────────────────
    const now = Date.now();
    const newPost: Omit<Post, "id"> = {
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
    };

    const docRef = await db.collection("socialPosts").add(newPost);

    // ── Award +12 points ──────────────────────────────────────────────────────
    let pointsAwarded = 0;

    if (userId) {
      try {
        const userSnap = await db.collection("users").doc(userId).get();
        const userExists = userSnap.exists;

        let resolvedName: string = userName;
        let resolvedEmail: string = userEmail || "";

        if (userExists) {
          const data = userSnap.data();
          if (data) {
            resolvedName = data.firstName
              ? [data.firstName, data.lastName].filter(Boolean).join(" ")
              : data.name || userName;
            resolvedEmail = resolvedEmail || data.email || "";
          }
        } else {
          await db.collection("users").doc(userId).set({
            userId,
            email: resolvedEmail,
            name: resolvedName,
            firstName: resolvedName.split(" ")[0] || "",
            lastName: resolvedName.split(" ")[1] || "",
            totalPoints: 0,
            pointsBreakdown: {},
            createdAt: now,
            lastUpdated: now,
            status: "active",
            role: "user",
          });
        }

        await awardUserPoints({
          actualUserId: userId,
          userName: resolvedName,
          userEmail: resolvedEmail,
          userExists: true,
          points: POST_POINTS_REWARD,
          reason: "CREATE_POST",
          transactionId: `${userId}_${docRef.id}_CREATE_POST`,
          metadata: { postId: docRef.id },
        });

        pointsAwarded = POST_POINTS_REWARD;
        console.log(` Post created: ${docRef.id} | +${POST_POINTS_REWARD} pts awarded to ${userId}`);
      } catch (pointsErr) {
        console.error("[createpost] Failed to award points:", pointsErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: { id: docRef.id, ...newPost },
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

// ─── GET  /api/createpost  — Fetch posts (paginated) 
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let query = db
      .collection("socialPosts")
      .orderBy("createdAt", "desc")
      .limit(limit);

    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("socialPosts").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();
   const posts: Post[] = snapshot.docs
  .map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Post, "id">),
  }))
  .filter((post) => post.removed !== true);

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      posts,
      pagination: {
        limit,
       hasMore: snapshot.docs.length === limit,
        nextCursor:
          posts.length === limit
            ? {
                lastDocId: lastDoc?.id,
                lastDocCreatedAt: lastDoc?.data()?.createdAt,
              }
            : null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/createpost error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}