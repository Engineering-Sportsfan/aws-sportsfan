// app/api/ask-ai/[id]/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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

// GET: Get a specific session by ID
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    let session: any = null;
    let messages: any[] = [];

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ASKAI#${resolved.id}`,
            sk: `SESSION#${sessionId}`,
          },
        })
      );

      if (getRes.Item) {
        session = { id: sessionId, ...getRes.Item };

        const qMsgs = await docClient.send(
          new QueryCommand({
            TableName: "RealTimeChat",
            KeyConditionExpression: "roomId = :rId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":rId": `ASKAI#${resolved.id}#${sessionId}`,
              ":skPrefix": "MSG#",
            },
            ScanIndexForward: true,
          })
        );

        if (qMsgs.Items) {
          messages = qMsgs.Items.map((item) => ({
            id: item.id || item.sk,
            role: item.role,
            content: item.content,
          }));
        }
      }
    } catch (e) {
      console.warn("[ask-ai [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!session && db) {
      const sessionRef = db
        .collection("askaiConversations")
        .doc(resolved.id)
        .collection("sessions")
        .doc(sessionId);

      const sessionDoc = await sessionRef.get();
      if (!sessionDoc.exists) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      session = { id: sessionDoc.id, ...sessionDoc.data() };
      const messagesSnap = await sessionRef
        .collection("messages")
        .orderBy("timestamp", "asc")
        .get();

      messages = messagesSnap.docs.map((doc) => ({
        id: doc.id,
        role: doc.data().role,
        content: doc.data().content,
      }));
    }

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      session,
      messages,
    });
  } catch (error) {
    console.error("[ask-ai GET session] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH: Rename a specific session
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const title = (body.title as string | undefined)?.trim();
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    if (title.length > 60) {
      return NextResponse.json({ error: "Title must be 60 characters or fewer" }, { status: 400 });
    }

    const now = Date.now();

    // Dual write update customTitle
    await dualWrite({
      tableName: "RealTimeChat",
      dynamoItem: {
        roomId: `ASKAI#${resolved.id}`,
        sk: `SESSION#${sessionId}`,
        customTitle: title,
        updatedAt: now,
      },
      firestoreRef: db
        .collection("askaiConversations")
        .doc(resolved.id)
        .collection("sessions")
        .doc(sessionId),
      firestoreData: { customTitle: title },
    });

    return NextResponse.json({ success: true, sessionId, title });
  } catch (error) {
    console.error("[ask-ai PATCH session] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Delete a specific session
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const { id: sessionId } = await params;
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB
    try {
      const qMsgs = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :rId",
          ExpressionAttributeValues: { ":rId": `ASKAI#${resolved.id}#${sessionId}` },
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
      await docClient.send(
        new DeleteCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ASKAI#${resolved.id}`,
            sk: `SESSION#${sessionId}`,
          },
        })
      );
    } catch (e) {
      console.warn("[ask-ai [id] DELETE] DynamoDB notice:", e);
    }

    // 2. Delete from Firestore
    if (db) {
      const sessionRef = db
        .collection("askaiConversations")
        .doc(resolved.id)
        .collection("sessions")
        .doc(sessionId);

      const sessionDoc = await sessionRef.get();
      if (sessionDoc.exists) {
        const messagesSnap = await sessionRef.collection("messages").get();
        const batch = db.batch();
        messagesSnap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        batch.delete(sessionRef);
        await batch.commit();
      }
    }

    return NextResponse.json({ success: true, message: "Session deleted" });
  } catch (error) {
    console.error("[ask-ai DELETE session] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}