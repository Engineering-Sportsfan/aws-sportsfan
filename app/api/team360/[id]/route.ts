// app/api/team360/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

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

    const doc = await db.collection("team360Posts").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ post: { id: doc.id, ...doc.data() } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT update post 
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const docRef = db.collection("team360Posts").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    // Strings
    if (body.teamName !== undefined) updates.teamName = body.teamName;
    if (body.title !== undefined) updates.title = body.title;

    // Numbers
    if (body.likes !== undefined) updates.likes = Number(body.likes) || 0;
    if (body.comments !== undefined) updates.comments = Number(body.comments) || 0;
    if (body.live !== undefined) updates.live = Number(body.live) || 0;
    if (body.shares !== undefined) updates.shares = Number(body.shares) || 0;

    // Media
    if (body.image !== undefined) updates.image = body.image;
    if (body.logo !== undefined) updates.logo = body.logo;

    // Arrays
    if (body.category !== undefined) {
      updates.category = body.category ?? [];
    }

    if (body.catlogo !== undefined) {
      updates.catlogo = body.catlogo ?? [];
    }

    // Boolean
    if (body.hasVideo !== undefined) {
      updates.hasVideo = body.hasVideo;
    }

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

    const docRef = db.collection("team360Posts").doc(id);
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