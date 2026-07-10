import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";

type RouteContext = { params: Promise<{ id: string }> };

/* ─────────────────────────────────────────────
   Firestore structure:
   watchAlongMatches/{id}/emojiReactions/counts
   {
     "🔥": 8421,
     "💪": 6234,
     ...
     updatedAt: number
   }

   Single document with one field per emoji —
   FieldValue.increment keeps concurrent taps safe
   without needing transactions.
   ───────────────────────────────────────────── */

const ALLOWED_EMOJIS = new Set([
  "🔥","💪","😱","🏏","👏","🎉","❤️","🚀","😮","🤩",
]);

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches/[id]/emoji-storm
   Returns aggregated emoji reaction counts
   ───────────────────────────────────────────── */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    // Read counts doc directly — skip parent match check
    const countsDoc = await db.collection("watchAlongMatches").doc(id)
      .collection("emojiReactions").doc("counts").get();

    if (!countsDoc.exists) {
      const empty: Record<string, number> = {};
      ALLOWED_EMOJIS.forEach((e) => { empty[e] = 0; });
      return NextResponse.json({ success: true, reactions: empty });
    }

    const { updatedAt, ...reactions } = countsDoc.data() as Record<string, unknown>;
    void updatedAt;

    return NextResponse.json({ success: true, reactions });
  } catch (error) {
    console.error("[emoji-storm GET]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches/[id]/emoji-storm
   Send one or more emoji reactions (max 10 per request)
   Body: { emoji: string }
     or  { emojis: string[] }
   ───────────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();

    const raw: string[] = body.emojis
      ? body.emojis
      : body.emoji
      ? [body.emoji]
      : [];

    if (raw.length === 0) {
      return NextResponse.json(
        { success: false, message: "Provide emoji or emojis[]" },
        { status: 400 }
      );
    }
    if (raw.length > 10) {
      return NextResponse.json(
        { success: false, message: "Max 10 emojis per request" },
        { status: 400 }
      );
    }

    const invalid = raw.filter((e) => !ALLOWED_EMOJIS.has(e));
    if (invalid.length > 0) {
      return NextResponse.json(
        { success: false, message: `Unsupported emoji(s): ${invalid.join(" ")}` },
        { status: 400 }
      );
    }

    // Tally duplicates locally → one Firestore write
    const tally: Record<string, number> = {};
    for (const e of raw) tally[e] = (tally[e] || 0) + 1;

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [emoji, count] of Object.entries(tally)) {
      updates[emoji] = FieldValue.increment(count);
    }

    // Write directly — skip match check AND skip re-read after write
    const countsRef = db.collection("watchAlongMatches").doc(id)
      .collection("emojiReactions").doc("counts");
    await countsRef.set(updates, { merge: true });

    // Return the sent tally instead of re-reading (saves 1 read)
    return NextResponse.json({ success: true, reactions: tally });
  } catch (error) {
    console.error("[emoji-storm POST]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   DELETE  /api/watch-along/matches/[id]/emoji-storm
   Admin: reset all emoji counts for the match
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

    // Reset directly — skip match check
    const reset: Record<string, unknown> = { updatedAt: Date.now() };
    ALLOWED_EMOJIS.forEach((e) => { reset[e] = 0; });

    await db.collection("watchAlongMatches").doc(id)
      .collection("emojiReactions").doc("counts").set(reset);

    return NextResponse.json({ success: true, message: "Emoji counts reset" });
  } catch (error) {
    console.error("[emoji-storm DELETE]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}