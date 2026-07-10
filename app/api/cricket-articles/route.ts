//api/cricket-articles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

// POST - Create a new article
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      badge,
      title,
      description,
      readTime,
      author,
      views,
      image,
      tags,
    } = body;

    // Validation
    const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];
    
    if (!title || !image) {
      return NextResponse.json(
        { error: "title and image are required" },
        { status: 400 }
      );
    }

    if (badge && !validBadges.includes(badge)) {
      return NextResponse.json(
        { error: "Invalid badge type. Must be FEATURE, ANALYSIS, OPINION, or NEWS" },
        { status: 400 }
      );
    }

    const newArticle = {
      badge: badge || "NEWS",
      title,
      description,
      author,
      readTime: readTime || "5 min read",
      views: views || "0 views",
      image,
      tags: Array.isArray(tags) ? tags : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("cricketArticles").add(newArticle);

    return NextResponse.json(
      {
        success: true,
        id: docRef.id,
        article: { id: docRef.id, ...newArticle },
      },
      { status: 201 }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}





export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const badge = searchParams.get("badge");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let query = db.collection("cricketArticles").orderBy("createdAt", "desc");

    // Filter by badge if provided
    if (badge && ["FEATURE", "ANALYSIS", "OPINION", "NEWS"].includes(badge)) {
      query = query.where("badge", "==", badge);
    }

    query = query.limit(limit);

    // Use cursor-based pagination instead of offset
    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("cricketArticles").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();

    const articles = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get last document for next page cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      articles,
      pagination: {
        limit,
        hasMore: articles.length === limit,
        nextCursor: articles.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching articles:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
