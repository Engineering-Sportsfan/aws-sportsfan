import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches/[id]/chat
   Returns paginated chat messages for a match
   Query: ?limit=50
   ───────────────────────────────────────────── */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 50);

    // Query subcollection directly — no need to check parent doc exists
    let query = db.collection("watchAlongMatches").doc(id)
      .collection("chats")
      .orderBy("createdAt", "desc");

    const since = searchParams.get("since");
    if (since) {
      const sinceTimestamp = parseInt(since);
      if (!isNaN(sinceTimestamp)) {
        query = query.where("createdAt", ">", sinceTimestamp);
      }
    }

    const snapshot = await query.limit(limit).get();

    const chats = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .reverse();

    return NextResponse.json({ success: true, chats });
  } catch (error) {
    console.error("[match chat GET]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches/[id]/chat
   Send a new chat message
   Body: { user: string, text: string, color?: string }
   ───────────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { user, text, color } = body;

    if (!user?.trim() || !text?.trim()) {
      return NextResponse.json(
        { success: false, message: "user and text are required" },
        { status: 400 }
      );
    }

    const chatData = {
      user: user.trim(),
      text: text.trim(),
      color: color || "text-pink-400",
      createdAt: Date.now(),
    };

    // Write directly to subcollection — no parent check needed
    const docRef = await db.collection("watchAlongMatches").doc(id)
      .collection("chats").add(chatData);

    return NextResponse.json({ success: true, chat: { id: docRef.id, ...chatData } });
  } catch (error) {
    console.error("[match chat POST]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   DELETE  /api/watch-along/matches/[id]/chat
   Admin: delete a specific chat message
   Body: { chatId: string }
   ───────────────────────────────────────────── */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const isAuth = await isAuthorizedForMatch(user, id);
    if (!isAuth) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const { chatId } = await req.json();

    if (!chatId) {
      return NextResponse.json({ success: false, message: "chatId is required" }, { status: 400 });
    }

    // Delete directly — no parent check needed
    await db.collection("watchAlongMatches").doc(id)
      .collection("chats").doc(chatId).delete();

    return NextResponse.json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error("[match chat DELETE]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}