// app/api/ask-ai/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const sessionCache = new Map<string, { data: Record<string, unknown>; timestamp: number }>();
const CACHE_DURATION = 5000;

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

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const query = (body.query as string | undefined)?.trim();
    const sessionId = (body.sessionId as string | undefined) || crypto.randomUUID();
    const history = Array.isArray(body.history) ? body.history : [];
    const notify = body.notify === true;

    if (!query) {
      return NextResponse.json({ error: "Empty query" }, { status: 400 });
    }

    const PYTHON_AI_URL = process.env.PYTHON_AI_URL;
    if (!PYTHON_AI_URL) {
      console.error("[ask-ai] PYTHON_AI_URL not configured");
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    // --- Call Python AI service ---
    let answer = "";
    let sources: string[] = [];
    let metadata: Record<string, unknown> = {};

    try {
      const aiRes = await fetch(`${PYTHON_AI_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.PYTHON_AI_KEY ?? "",
        },
        body: JSON.stringify({
          query,
          conversation_history: history,
          user_id: resolved.id,
          session_id: sessionId,
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text().catch(() => "");
        console.error(`[ask-ai] Python service returned ${aiRes.status}: ${errText}`);
        throw new Error(`Python service returned ${aiRes.status}`);
      }

      const data = await aiRes.json();
      answer = data.answer ?? "";
      sources = data.sources ?? [];
      metadata = data.metadata ?? {};
    } catch (err) {
      console.error("[ask-ai] Python call failed:", err);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const now = Date.now();
    const userMessageId = `msg_${now}_user_${Math.random().toString(36).slice(2, 7)}`;
    const assistantMessageId = `msg_${now + 1}_asst_${Math.random().toString(36).slice(2, 7)}`;
    

    // --- Dual Write to DynamoDB & Firestore ---
    try {
      
      // 1. Session Meta in DynamoDB
      await dualWrite({
        tableName: "RealTimeChat",
        dynamoItem: {
          roomId: `ASKAI#${resolved.id}`,
          sk: `SESSION#${sessionId}`,
          sessionId,
          userId: resolved.id,
          userEmail: user.email,
          userName: resolved.username,
          updatedAt: now,
        },
        firestoreRef: db
          .collection("askaiConversations")
          .doc(resolved.id)
          .collection("sessions")
          .doc(sessionId),
        firestoreData: {
          updatedAt: FieldValue.serverTimestamp(),
          userId: resolved.id,
          userEmail: user.email,
          userName: resolved.username,
        },
      });

      // 2. User Message in DynamoDB
      await dualWrite({
        tableName: "RealTimeChat",
        dynamoItem: {
          roomId: `ASKAI#${resolved.id}#${sessionId}`,
          sk: `MSG#${now}#${userMessageId}`,
          id: userMessageId,
          role: "user",
          content: query,
          timestamp: now,
        },
        firestoreRef: db
          .collection("askaiConversations")
          .doc(resolved.id)
          .collection("sessions")
          .doc(sessionId)
          .collection("messages")
          .doc(userMessageId),
        firestoreData: {
          role: "user",
          content: query,
          timestamp: FieldValue.serverTimestamp(),
        },
      });

      // 3. Assistant Message in DynamoDB
      await dualWrite({
        tableName: "RealTimeChat",
        dynamoItem: {
          roomId: `ASKAI#${resolved.id}#${sessionId}`,
          sk: `MSG#${now + 1}#${assistantMessageId}`,
          id: assistantMessageId,
          role: "assistant",
          content: answer,
          sources,
          metadata,
          timestamp: now + 1,
        },
        firestoreRef: db
          .collection("askaiConversations")
          .doc(resolved.id)
          .collection("sessions")
          .doc(sessionId)
          .collection("messages")
          .doc(assistantMessageId),
        firestoreData: {
          role: "assistant",
          content: answer,
          sources,
          metadata,
          timestamp: FieldValue.serverTimestamp(),
        },
      });

      sessionCache.delete(resolved.id);
    } catch (err) {
      console.error("[ask-ai] Storage write notice:", err);
    }

    return NextResponse.json({
      answer,
      sources,
      sessionId,
      userMessageId,
      messageId: assistantMessageId,
    });
  } catch (error) {
    console.error("[ask-ai] Unhandled error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const cached = sessionCache.get(resolved.id);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }

    let sessionId: string | null = null;
    let messages: any[] = [];

    // 1. Try DynamoDB
    try {
      const qSessions = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :rId AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":rId": `ASKAI#${resolved.id}`,
            ":skPrefix": "SESSION#",
          },
          ScanIndexForward: false,
          Limit: 1,
        })
      );

      if (qSessions.Items && qSessions.Items.length > 0) {
        sessionId = qSessions.Items[0].sessionId || qSessions.Items[0].sk.replace(/^SESSION#/, "");

        const qMsgs = await docClient.send(
          new QueryCommand({
            TableName: "RealTimeChat",
            KeyConditionExpression: "roomId = :rId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":rId": `ASKAI#${resolved.id}#${sessionId}`,
              ":skPrefix": "MSG#",
            },
            ScanIndexForward: true,
            Limit: 50,
          })
        );

        if (qMsgs.Items && qMsgs.Items.length > 0) {
          messages = qMsgs.Items.map((item) => ({
            id: item.id || item.sk,
            role: item.role,
            content: item.content,
          }));
        }
      }
    } catch (e) {
      console.warn("[ask-ai GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (messages.length === 0 && !sessionId) {
      if (db) {
        const sessionsSnap = await db
          .collection("askaiConversations")
          .doc(resolved.id)
          .collection("sessions")
          .orderBy("updatedAt", "desc")
          .limit(1)
          .get();

        if (!sessionsSnap.empty) {
          const sessionDoc = sessionsSnap.docs[0];
          sessionId = sessionDoc.id;

          const messagesSnap = await db
            .collection("askaiConversations")
            .doc(resolved.id)
            .collection("sessions")
            .doc(sessionId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .limit(50)
            .get();

          messages = messagesSnap.docs.map((doc) => ({
            id: doc.id,
            role: doc.data().role as "user" | "assistant",
            content: doc.data().content as string,
          }));
        }
      }
    }

    const responseData = { messages, sessionId };
    sessionCache.set(resolved.id, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("[ask-ai GET] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (sessionId) {
      return NextResponse.json(
        { error: "Use /api/ask-ai/{id} to delete a specific session" },
        { status: 400 }
      );
    }

    // 1. Delete from DynamoDB
    try {
      const qSessions = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :rId",
          ExpressionAttributeValues: { ":rId": `ASKAI#${resolved.id}` },
        })
      );

      if (qSessions.Items) {
        for (const sItem of qSessions.Items) {
          const sId = sItem.sessionId || sItem.sk.replace(/^SESSION#/, "");
          // Delete all messages in session
          const qMsgs = await docClient.send(
            new QueryCommand({
              TableName: "RealTimeChat",
              KeyConditionExpression: "roomId = :rId",
              ExpressionAttributeValues: { ":rId": `ASKAI#${resolved.id}#${sId}` },
            })
          );
          if (qMsgs.Items) {
            for (const mItem of qMsgs.Items) {
              await docClient.send(
                new DeleteCommand({
                  TableName: "RealTimeChat",
                  Key: { roomId: mItem.roomId, sk: mItem.sk },
                })
              );
            }
          }
          // Delete session
          await docClient.send(
            new DeleteCommand({
              TableName: "RealTimeChat",
              Key: { roomId: sItem.roomId, sk: sItem.sk },
            })
          );
        }
      }
    } catch (e) {
      console.warn("[ask-ai DELETE] DynamoDB notice:", e);
    }

    // 2. Delete from Firestore
    if (db) {
      const sessionsSnap = await db
        .collection("askaiConversations")
        .doc(resolved.id)
        .collection("sessions")
        .get();

      const OPS_PER_BATCH = 400;
      let batch = db.batch();
      let opCount = 0;

      for (const sessionDoc of sessionsSnap.docs) {
        const messagesSnap = await sessionDoc.ref.collection("messages").get();
        for (const msgDoc of messagesSnap.docs) {
          batch.delete(msgDoc.ref);
          opCount++;
          if (opCount >= OPS_PER_BATCH) {
            await batch.commit();
            batch = db.batch();
            opCount = 0;
          }
        }
        batch.delete(sessionDoc.ref);
        opCount++;
        if (opCount >= OPS_PER_BATCH) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }
      if (opCount > 0) await batch.commit();
    }

    sessionCache.delete(resolved.id);
    return NextResponse.json({ success: true, message: "All sessions deleted" });
  } catch (error) {
    console.error("[ask-ai DELETE] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}