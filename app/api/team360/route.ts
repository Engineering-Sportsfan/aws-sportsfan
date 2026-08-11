// app/api/team360/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET all posts
export async function GET() {
  try {
    let posts: any[] = [];

    // 1. Try DynamoDB SocialAndContent table
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "begins_with(contentId, :tPrefix)",
          ExpressionAttributeValues: {
            ":tPrefix": "TEAM_POST#",
          },
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        posts = scanRes.Items.map((item) => ({
          id: item.id || (item.contentId as string).replace(/^TEAM_POST#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[team360 GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (posts.length === 0 && db) {
      const snap = await db
        .collection("team360Posts")
        .orderBy("createdAt", "desc")
        .get();

      posts = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
    }

    posts.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({ posts, total: posts.length });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST create new post
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      teamName,
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
    if (!teamName || !title || !image || !logo) {
      return NextResponse.json(
        { error: "teamName, title, image and logo are required" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const id = `tpost_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newPost = {
      id,
      teamName,
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
        contentId: `TEAM_POST#${id}`,
        sk: `POST#${now}`,
        ...newPost,
      },
      firestoreRef: db.collection("team360Posts").doc(id),
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}