//api/cricket-articles/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

//  Helper: extract ID from URL 
function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET - Fetch single article by ID
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }
    const docRef = db.collection("cricketArticles").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: "Article not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      article: { id: doc.id, ...doc.data() },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT - Update article by ID
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }

    const docRef = db.collection("cricketArticles").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: "Article not found" },
        { status: 404 }
      );
    }

    const validBadges: BadgeType[] = ["FEATURE", "ANALYSIS", "OPINION", "NEWS"];
    
    if (body.badge && !validBadges.includes(body.badge)) {
      return NextResponse.json(
        { error: "Invalid badge type" },
        { status: 400 }
      );
    }

    //  ADDED 'description' to allowed fields
    const allowedFields = ["badge", "title", "description", "readTime", "author", "views", "image","tags"];
    
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    });

    // Validate description is an array if provided
    if (body.description !== undefined && !Array.isArray(body.description)) {
      return NextResponse.json(
        { error: "Description must be an array of strings" },
        { status: 400 }
      );
    }

    // Validate numeric conversions for views (if provided as string with "K")
    if (body.views !== undefined) {
      updates.views = body.views; // Keep as string with "K" format
    }

    // Validate tags is an array if provided
    if (body.tags !== undefined && !Array.isArray(body.tags)) {
      return NextResponse.json(
        { error: "Tags must be an array of strings" },
        { status: 400 }
      );
    }

    await docRef.update(updates);

    const updated = await docRef.get();

    return NextResponse.json({
      success: true,
      article: { id: updated.id, ...updated.data() },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE - Delete article by ID
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Article ID is required" }, { status: 400 });
    }


    const docRef = db.collection("cricketArticles").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { error: "Article not found" },
        { status: 404 }
      );
    }

    await docRef.delete();

    return NextResponse.json({
         success: true,
         message: `Post ${id} deleted successfully`,
       });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting article:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
