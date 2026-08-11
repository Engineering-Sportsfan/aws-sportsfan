// app/api/players360/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET all posts with pagination
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let posts: any[] = [];

    // 1. Try DynamoDB SocialAndContent table
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "begins_with(contentId, :pPrefix)",
          ExpressionAttributeValues: {
            ":pPrefix": "PLAYER_POST#",
          },
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        posts = scanRes.Items.map((item) => ({
          id: item.id || (item.contentId as string).replace(/^PLAYER_POST#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[players360 GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (posts.length === 0 && db) {
      let query = db.collection("players360Posts")
        .orderBy("createdAt", "desc")
        .limit(limit);

      if (lastDocId && lastDocCreatedAt) {
        const lastDocRef = db.collection("players360Posts").doc(lastDocId);
        const lastDoc = await lastDocRef.get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }

      const snap = await query.get();
      posts = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
    }

    posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paginated = posts.slice(0, limit);
    const lastDoc = paginated[paginated.length - 1];

    return NextResponse.json({
      success: true,
      posts: paginated,
      pagination: {
        limit,
        hasMore: posts.length > limit,
        nextCursor: paginated.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.createdAt,
            }
          : null,
      },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Fetch posts error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST create new post
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      playerName,
      title,
      category,
      likes,
      comments,
      live,
      shares,
      image,
      logo,
      catlogo,
      hasVideo,
    } = body;

    // Validation
    if (!playerName || !title || !image || !logo) {
      return NextResponse.json(
        { error: "playerName, title, image and logo are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = `post_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newPost = {
      id,
      playerName,
      title,
      category: category ?? [],
      likes: Number(likes) || 0,
      comments: Number(comments) || 0,
      live: Number(live) || 0,
      shares: Number(shares) || 0,
      image,
      logo,
      catlogo: catlogo ?? [],
      hasVideo: hasVideo ?? false,
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write
    await dualWrite({
      tableName: "SocialAndContent",
      dynamoItem: {
        contentId: `PLAYER_POST#${id}`,
        sk: `POST#${now}`,
        ...newPost,
      },
      firestoreRef: db.collection("players360Posts").doc(id),
      firestoreData: newPost,
    });

    return NextResponse.json(
      {
        success: true,
        id,
        post: newPost,
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Create post error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}