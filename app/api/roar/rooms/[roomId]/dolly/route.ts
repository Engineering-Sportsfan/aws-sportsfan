// api/roar/rooms/[roomId]/dolly/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; username: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  const data = snap.data() as { username?: string };
  return { id: info.actualUserId, username: data?.username ?? "Fan" };
}

// GET — load this user's private Dolly history for a room
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    let replies: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try reading from DynamoDB first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `DOLLY#${resolved.id}#`
        },
        Limit: 100
      }));

      if (res.Items) {
        replies = res.Items.map(item => ({
          id: (item.sk as string).split("#").pop(),
          question: item.question,
          answer: item.answer,
          createdAt: item.createdAt
        }));
        // Sort in memory by createdAt asc
        replies.sort((a, b) => a.createdAt - b.createdAt);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Dolly GET] DynamoDB fetch replies failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snap = await db
          .collection("roarRooms")
          .doc(roomId)
          .collection("dollyReplies")
          .where("userId", "==", resolved.id)
          .orderBy("createdAt", "asc")
          .limit(100)
          .get();

        replies = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            question: d.question,
            answer: d.answer,
            createdAt: d.createdAt,
          };
        });
      } catch (fsErr) {
        console.error("[Dolly GET] Firestore fallback replies failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, replies });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET dolly replies error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — ask Dolly, get a private answer, persist it
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const question = (body?.question as string | undefined)?.trim();
    if (!question) {
      return NextResponse.json({ error: "Question required" }, { status: 400 });
    }
    if (question.length > 300) {
      return NextResponse.json({ error: "Question too long" }, { status: 400 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const PYTHON_AI_URL = process.env.PYTHON_AI_URL;
    if (!PYTHON_AI_URL) {
      console.error("[dolly] PYTHON_AI_URL not configured");
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    // Pull recent context from DynamoDB first
    let recentReplies: any[] = [];
    let fetchedContextFromDynamo = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `DOLLY#${resolved.id}#`
        },
        Limit: 6
      }));
      if (res.Items) {
        recentReplies = res.Items.map(item => ({
          question: item.question,
          answer: item.answer,
          createdAt: item.createdAt
        }));
        // Sort newest first
        recentReplies.sort((a, b) => b.createdAt - a.createdAt);
        fetchedContextFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Dolly POST] DynamoDB context fetch failed:", dynErr);
    }

    if (!fetchedContextFromDynamo) {
      try {
        const recentSnap = await db
          .collection("roarRooms")
          .doc(roomId)
          .collection("dollyReplies")
          .where("userId", "==", resolved.id)
          .orderBy("createdAt", "desc")
          .limit(6)
          .get();

        recentReplies = recentSnap.docs.map((d) => d.data());
      } catch (fsErr) {
        console.warn("[Dolly POST] Firestore context fallback failed:", fsErr);
      }
    }

    const history = [...recentReplies]
      .reverse()
      .flatMap((d) => [
        { role: "user", content: d.question },
        { role: "assistant", content: d.answer },
      ]);

    let answer = "";
    try {
      const aiRes = await fetch(`${PYTHON_AI_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.PYTHON_AI_KEY ?? "",
        },
        body: JSON.stringify({
          query: question,
          conversation_history: history,
          user_id: resolved.id,
          session_id: `roar_room_${roomId}_${resolved.id}`,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => "");
        console.error(`[dolly] Python service returned ${aiRes.status}: ${errText}`);
        throw new Error(`Python service returned ${aiRes.status}`);
      }

      const data = await aiRes.json();
      answer = data.answer ?? "Sorry, I couldn't find an answer for that.";
    } catch (err) {
      console.error("[dolly] AI call failed:", err);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const now = Date.now();
    const replyId = `rep_${Math.random().toString(36).substring(2, 15)}`;
    const doc = {
      userId: resolved.id,
      question,
      answer,
      createdAt: now,
    };

    // 1. Put reply to DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `DOLLY#${resolved.id}#${replyId}`,
          ...doc
        }
      }));
    } catch (dynErr) {
      console.warn("[Dolly POST] DynamoDB save reply failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const replyRef = db
        .collection("roarRooms")
        .doc(roomId)
        .collection("dollyReplies")
        .doc(replyId);

      await replyRef.set(doc);
    } catch (fsErr) {
      console.warn("[Dolly POST] Firestore fallback save reply failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      reply: { id: replyId, ...doc },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST dolly reply error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}