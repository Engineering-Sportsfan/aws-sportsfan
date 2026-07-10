
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

//  Helper: extract ID from URL 
function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

//  GET single post 
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const doc = await db.collection("players360Posts").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ post: { id: doc.id, ...doc.data() } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

//  PUT update post 
export async function PUT(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const docRef = db.collection("players360Posts").doc(id);
    const doc    = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const allowedFields = [
      "playerName", "title", "category", "image",
      "logo", "catlogo", "hasVideo",
    ];
    const numericFields = ["likes", "comments", "live", "shares"];

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    allowedFields.forEach(field => {
      if (body[field] !== undefined) updates[field] = body[field];
    });

    numericFields.forEach(field => {
      if (body[field] !== undefined) updates[field] = Number(body[field]) || 0;
    });

    if (body.category !== undefined) updates.category = body.category ?? [];
    if (body.catlogo  !== undefined) updates.catlogo  = body.catlogo  ?? [];

    await docRef.update(updates);

    const updated = await docRef.get();

    return NextResponse.json({
      success: true,
      post: { id: updated.id, ...updated.data() },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

//  DELETE post 
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const docRef = db.collection("players360Posts").doc(id);
    const doc    = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: `Post ${id} deleted successfully`,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}