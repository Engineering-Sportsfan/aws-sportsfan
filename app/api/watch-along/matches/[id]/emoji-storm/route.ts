// app/api/watch-along/matches/[id]/emoji-storm/route.ts — Migrated to AWS DynamoDB (RealTimeChat)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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

    let reactions: Record<string, number> = {};

    // 1. Read from DynamoDB RealTimeChat
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ROOM#watchalong_${id}`,
            sk: "EMOJI_STORM#COUNTS",
          },
        })
      );

      if (getRes.Item) {
        ALLOWED_EMOJIS.forEach((e) => {
          reactions[e] = Number(getRes.Item?.[e] || 0);
        });
        return NextResponse.json({ success: true, reactions });
      }
    } catch (e) {
      console.warn("[emoji-storm GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    const countsDoc = await db.collection("watchAlongMatches").doc(id)
      .collection("emojiReactions").doc("counts").get();

    if (!countsDoc.exists) {
      ALLOWED_EMOJIS.forEach((e) => { reactions[e] = 0; });
      return NextResponse.json({ success: true, reactions });
    }

    const { updatedAt, ...fsReactions } = countsDoc.data() as Record<string, unknown>;
    void updatedAt;

    ALLOWED_EMOJIS.forEach((e) => {
      reactions[e] = Number(fsReactions[e] || 0);
    });

    return NextResponse.json({ success: true, reactions });
  } catch (error) {
    console.error("[emoji-storm GET]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches/[id]/emoji-storm
   Send one or more emoji reactions
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

    const tally: Record<string, number> = {};
    for (const e of raw) tally[e] = (tally[e] || 0) + 1;

    const now = Date.now();

    // 1. Primary write to DynamoDB RealTimeChat
    try {
      const updateExprParts: string[] = [];
      const exprAttrNames: Record<string, string> = {};
      const exprAttrValues: Record<string, any> = { ":now": now };

      let idx = 0;
      for (const [emoji, count] of Object.entries(tally)) {
        const nameKey = `#e${idx}`;
        const valKey = `:v${idx}`;
        exprAttrNames[nameKey] = emoji;
        exprAttrValues[valKey] = count;
        updateExprParts.push(`${nameKey} ${valKey}`);
        idx++;
      }

      await docClient.send(
        new UpdateCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ROOM#watchalong_${id}`,
            sk: "EMOJI_STORM#COUNTS",
          },
          UpdateExpression: `ADD ${updateExprParts.join(", ")} SET updatedAt = :now`,
          ExpressionAttributeNames: exprAttrNames,
          ExpressionAttributeValues: exprAttrValues,
        })
      );
    } catch (dynErr) {
      console.warn("[emoji-storm POST] DynamoDB update notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    try {
      const fsUpdates: Record<string, unknown> = { updatedAt: now };
      for (const [emoji, count] of Object.entries(tally)) {
        fsUpdates[emoji] = FieldValue.increment(count);
      }

      const countsRef = db.collection("watchAlongMatches").doc(id)
        .collection("emojiReactions").doc("counts");
      await countsRef.set(fsUpdates, { merge: true });
    } catch (fsErr) {
      console.warn("[emoji-storm POST] Firestore mirror notice:", fsErr);
    }

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

    const now = Date.now();
    const reset: Record<string, unknown> = { updatedAt: now };
    ALLOWED_EMOJIS.forEach((e) => { reset[e] = 0; });

    // 1. Reset in DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#watchalong_${id}`,
            sk: "EMOJI_STORM#COUNTS",
            ...reset,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[emoji-storm DELETE] DynamoDB reset notice:", dynErr);
    }

    // 2. Reset in Firestore
    try {
      await db.collection("watchAlongMatches").doc(id)
        .collection("emojiReactions").doc("counts").set(reset);
    } catch (fsErr) {
      console.warn("[emoji-storm DELETE] Firestore reset notice:", fsErr);
    }

    return NextResponse.json({ success: true, message: "Emoji counts reset" });
  } catch (error) {
    console.error("[emoji-storm DELETE]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}