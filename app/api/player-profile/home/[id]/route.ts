import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}



export async function GET(req: NextRequest) {
  try {
  
    const url = new URL(req.url);
   console.log("Pathname:", url.pathname);
    
    
    const id = getIdFromUrl(req);
     if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const doc = await db.collection("playershome").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      post: { id: doc.id, ...doc.data() },  // ✅ singular "post"
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}




export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const newPost = {
      ...body,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("playershome").add(newPost);

    return NextResponse.json({
      success: true,
      id: docRef.id,
      post: {
        id: docRef.id,
        ...newPost,
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Unexpected error";

    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}

//  PUT
export async function PUT(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const id = pathParts[pathParts.length - 1];

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Post id is required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const docRef = db.collection("playershome").doc(id);

    await docRef.update({
      ...body,
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Post updated successfully",
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Unexpected error";

    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}


//  DELETE single post using query param
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const id = pathParts[pathParts.length - 1];

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Post id is required" },
        { status: 400 }
      );
    }

    const docRef = db.collection("playershome").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Unexpected error";

    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}