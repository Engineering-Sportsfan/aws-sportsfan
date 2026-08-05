// api/roar/rooms/[roomId]/dolly/[sessionId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveUser(email: string, userId: string) {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;
  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;
  return { id: info.actualUserId, username: (snap.data() as any)?.username ?? "Fan" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string; sessionId: string }> | { roomId: string; sessionId: string } }) {
  try {
    const { roomId, sessionId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    // 1. Verify session exists and belongs to user DynamoDB-first
    let sessionExists = false;
    try {
      const getSession = await docClient.send(new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `DOLLY_SESSION#${resolved.id}#${sessionId}` }
      }));
      if (getSession.Item) {
        sessionExists = true;
      }
    } catch (e) {}

    if (!sessionExists) {
      try {
        const sessionRef = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (sessionDoc.exists && sessionDoc.data()?.userId === resolved.id) {
          sessionExists = true;
        }
      } catch (e) {}
    }

    if (!sessionExists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let replies: any[] = [];
    let fetchedRepliesFromDynamo = false;

    // 2. Fetch replies DynamoDB-first
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `DOLLY_REPLY#${sessionId}#`
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
        // Sort asc
        replies.sort((a, b) => a.createdAt - b.createdAt);
        fetchedRepliesFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Session GET] DynamoDB replies query failed:", dynErr);
    }

    // Fallback: Check Firestore
    if (!fetchedRepliesFromDynamo) {
      try {
        const sessionRef = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
        const snap = await sessionRef.collection("replies").orderBy("createdAt", "asc").limit(100).get();
        replies = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[Session GET] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, replies });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string; sessionId: string }> | { roomId: string; sessionId: string } }) {
  try {
    const { roomId, sessionId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const question = (body?.question as string | undefined)?.trim();
    if (!question) return NextResponse.json({ error: "Question required" }, { status: 400 });
    if (question.length > 300) return NextResponse.json({ error: "Question too long" }, { status: 400 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    // 1. Verify session exists and ownership
    let sessionExists = false;
    try {
      const getSession = await docClient.send(new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `DOLLY_SESSION#${resolved.id}#${sessionId}` }
      }));
      if (getSession.Item) {
        sessionExists = true;
      }
    } catch (e) {}

    if (!sessionExists) {
      try {
        const sessionRef = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (sessionDoc.exists && sessionDoc.data()?.userId === resolved.id) {
          sessionExists = true;
        }
      } catch (e) {}
    }

    if (!sessionExists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const PYTHON_AI_URL = process.env.PYTHON_AI_URL;
    if (!PYTHON_AI_URL) return NextResponse.json({ error: "AI service not configured" }, { status: 500 });

    // 2. Fetch recent context DynamoDB-first
    let recentReplies: any[] = [];
    let fetchedContextFromDynamo = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `DOLLY_REPLY#${sessionId}#`
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
      console.warn("[Session POST] DynamoDB context fetch failed:", dynErr);
    }

    if (!fetchedContextFromDynamo) {
      try {
        const sessionRef = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
        const recentSnap = await sessionRef.collection("replies").orderBy("createdAt", "desc").limit(6).get();
        recentReplies = recentSnap.docs.map(d => d.data());
      } catch (fsErr) {
        console.warn("[Session POST] Firestore fallback context failed:", fsErr);
      }
    }

    const history = [...recentReplies].reverse()
      .flatMap(d => [{ role: "user", content: d.question }, { role: "assistant", content: d.answer }]);

    let answer = "";
    try {
      const aiRes = await fetch(`${PYTHON_AI_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.PYTHON_AI_KEY ?? "" },
        body: JSON.stringify({
          query: question,
          conversation_history: history,
          user_id: resolved.id,
          session_id: sessionId,
        }),
      });
      if (!aiRes.ok) throw new Error(`Python service returned ${aiRes.status}`);
      const data = await aiRes.json();
      answer = data.answer ?? "Sorry, I couldn't find an answer for that.";
    } catch (err) {
      console.error("[dolly] AI call failed:", err);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const now = Date.now();
    const replyId = `rep_${Math.random().toString(36).substring(2, 15)}`;
    const doc = { question, answer, createdAt: now };

    // 1. Put reply to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `DOLLY_REPLY#${sessionId}#${replyId}`,
          ...doc
        }
      }));

      // Update session title (if first reply) and updatedAt
      const isFirstReply = recentReplies.length === 0;
      await docClient.send(new UpdateCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `DOLLY_SESSION#${resolved.id}#${sessionId}` },
        UpdateExpression: isFirstReply ? "SET updatedAt = :now, title = :title" : "SET updatedAt = :now",
        ExpressionAttributeValues: isFirstReply ? { ":now": now, ":title": question.slice(0, 60) } : { ":now": now }
      })).catch(() => {});
    } catch (dynErr) {
      console.warn("[Session POST] DynamoDB save reply failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const sessionRef = db.collection("roarRooms").doc(roomId).collection("dollySessions").doc(sessionId);
      await sessionRef.collection("replies").doc(replyId).set(doc);

      const isFirstReply = recentReplies.length === 0;
      await sessionRef.set(
        { updatedAt: now, ...(isFirstReply ? { title: question.slice(0, 60) } : {}) },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn("[Session POST] Firestore fallback save reply failed:", fsErr);
    }

    return NextResponse.json({ success: true, reply: { id: replyId, ...doc } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — rename a session
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ roomId: string; sessionId: string }> | { roomId: string; sessionId: string } }) {
  try {
    const { roomId, sessionId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const { customTitle } = await req.json();
    if (!customTitle?.trim()) {
      return NextResponse.json({ success: false, error: "customTitle is required" }, { status: 400 });
    }

    const titleVal = customTitle.trim();

    // 1. Update in DynamoDB first
    try {
      await docClient.send(new UpdateCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `DOLLY_SESSION#${resolved.id}#${sessionId}` },
        UpdateExpression: "SET title = :t, customTitle = :t",
        ExpressionAttributeValues: { ":t": titleVal }
      }));
    } catch (dynErr) {
      console.warn("[Session PATCH] DynamoDB rename failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("roarRooms").doc(roomId)
        .collection("dollySessions").doc(sessionId)
        .update({ customTitle: titleVal, title: titleVal });
    } catch (fsErr) {
      console.warn("[Session PATCH] Firestore fallback rename failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[dolly] Failed to rename session:", err);
    return NextResponse.json({ success: false, error: "Failed to rename session" }, { status: 500 });
  }
}

// DELETE — soft-delete a session
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ roomId: string; sessionId: string }> | { roomId: string; sessionId: string } }) {
  try {
    const { roomId, sessionId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) return NextResponse.json({ error: "User profile not found" }, { status: 404 });

    const now = Date.now();

    // 1. Soft delete in DynamoDB first
    try {
      await docClient.send(new UpdateCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `DOLLY_SESSION#${resolved.id}#${sessionId}` },
        UpdateExpression: "SET softDeleted = :true, softDeletedAt = :now",
        ExpressionAttributeValues: { ":true": true, ":now": now }
      }));
    } catch (dynErr) {
      console.warn("[Session DELETE] DynamoDB soft-delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("roarRooms").doc(roomId)
        .collection("dollySessions").doc(sessionId)
        .update({ softDeleted: true, softDeletedAt: now });
    } catch (fsErr) {
      console.warn("[Session DELETE] Firestore fallback soft-delete failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[dolly] Failed to delete session:", err);
    return NextResponse.json({ success: false, error: "Failed to delete session" }, { status: 500 });
  }
}