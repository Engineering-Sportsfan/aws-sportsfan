// app/api/audio-messages/route.ts — BACKEND
// Audio messages for audio drops (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

// POST - User sends message
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audioId, audioTitle, userId, userName, message, rating } = body;

    const msgId = randomUUID();
    const messageData = {
      id: msgId,
      audioId: audioId || "",
      audioTitle: audioTitle || "",
      userId: userId || "",
      userName: userName || "Anonymous",
      message: message || "",
      rating: rating || null,
      createdAt: Date.now(),
      isRead: false,
      isFlagged: false,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      await docClient.send(
        new PutCommand({
          TableName: "SocialAndContent",
          Item: {
            entityId: `AUDIO#${audioId || "ALL"}`,
            sk: `MSG#${msgId}`,
            ...messageData,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[audio-messages POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db.collection("audioMessages").doc(msgId).set(messageData);
    } catch (fsErr) {
      console.error("[audio-messages POST] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: messageData,
    });
  } catch (error: unknown) {
    console.error("audio-message POST error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save message" },
      { status: 500 },
    );
  }
}

// GET - Fetch messages with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const audioId = searchParams.get("audioId");
    const countOnly = searchParams.get("count") === "true";
    const limit = parseInt(searchParams.get("limit") || "100");

    let messages: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB First
    try {
      if (audioId) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "SocialAndContent",
            KeyConditionExpression: "entityId = :e AND begins_with(sk, :p)",
            ExpressionAttributeValues: {
              ":e": `AUDIO#${audioId}`,
              ":p": "MSG#",
            },
            Limit: limit,
          }),
        );
        if (qRes.Items && qRes.Items.length > 0) {
          messages = qRes.Items.map((item) => ({
            id: item.id || (item.sk as string).replace(/^MSG#/, ""),
            ...item,
          }));
          fetchedFromDynamo = true;
        }
      } else {
        const sRes = await docClient.send(
          new ScanCommand({
            TableName: "SocialAndContent",
            FilterExpression: "begins_with(entityId, :e) AND begins_with(sk, :p)",
            ExpressionAttributeValues: {
              ":e": "AUDIO#",
              ":p": "MSG#",
            },
            Limit: limit,
          }),
        );
        if (sRes.Items && sRes.Items.length > 0) {
          messages = sRes.Items.map((item) => ({
            id: item.id || (item.sk as string).replace(/^MSG#/, ""),
            ...item,
          }));
          fetchedFromDynamo = true;
        }
      }
    } catch (dynErr) {
      console.warn("[audio-messages GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      let query: FirebaseFirestore.Query = db.collection("audioMessages");
      if (audioId) {
        query = query.where("audioId", "==", audioId);
      }
      query = query.orderBy("createdAt", "desc").limit(limit);

      const snapshot = await query.get();
      messages = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    messages.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const stats = {
      total: messages.length,
      unread: messages.filter((m) => !m.isRead).length,
      flagged: messages.filter((m) => m.isFlagged).length,
      totalAudios: new Set(messages.map((m) => m.audioId)).size,
    };

    if (status === "unread") {
      messages = messages.filter((m) => !m.isRead);
    } else if (status === "flagged") {
      messages = messages.filter((m) => m.isFlagged);
    }

    if (countOnly) {
      return NextResponse.json({
        success: true,
        count: messages.length,
      });
    }

    return NextResponse.json({
      success: true,
      signals: messages,
      messages,
      stats,
      count: messages.length,
    });
  } catch (error: unknown) {
    console.error("audio-message GET error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

// PATCH - Update message status (mark as read/unread, flag/unflag)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { messageId, isRead, isFlagged } = body;

    if (!messageId) {
      return NextResponse.json(
        { success: false, message: "messageId is required" },
        { status: 400 },
      );
    }

    const updateData: any = { updatedAt: Date.now() };
    if (isRead !== undefined) updateData.isRead = isRead;
    if (isFlagged !== undefined) updateData.isFlagged = isFlagged;

    // Fetch existing document to merge
    let existingMessage: any = null;
    try {
      const sRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "id = :id OR sk = :sk",
          ExpressionAttributeValues: {
            ":id": messageId,
            ":sk": `MSG#${messageId}`,
          },
          Limit: 1,
        }),
      );
      if (sRes.Items && sRes.Items.length > 0) {
        existingMessage = sRes.Items[0];
      }
    } catch {}

    if (!existingMessage) {
      const docSnap = await db.collection("audioMessages").doc(messageId).get();
      if (docSnap.exists) {
        existingMessage = { id: docSnap.id, ...docSnap.data() };
      }
    }

    const updatedMessage = {
      ...(existingMessage || { id: messageId }),
      ...updateData,
    };

    // 1. Update DynamoDB
    if (existingMessage?.entityId && existingMessage?.sk) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: "SocialAndContent",
            Item: {
              ...existingMessage,
              ...updateData,
            },
          }),
        );
      } catch (dynErr) {
        console.error("[audio-messages PATCH] DynamoDB error:", dynErr);
      }
    }

    // 2. Update Firestore
    try {
      await db.collection("audioMessages").doc(messageId).set(updateData, { merge: true });
    } catch (fsErr) {
      console.error("[audio-messages PATCH] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Message updated successfully",
      updatedMessage,
    });
  } catch (error: unknown) {
    console.error("audio-message PATCH error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update message" },
      { status: 500 },
    );
  }
}

// DELETE - Delete a message
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const messageId = searchParams.get("messageId");

    if (!messageId) {
      return NextResponse.json(
        { success: false, message: "messageId is required" },
        { status: 400 },
      );
    }

    // 1. Delete from DynamoDB
    try {
      const sRes = await docClient.send(
        new ScanCommand({
          TableName: "SocialAndContent",
          FilterExpression: "id = :id OR sk = :sk",
          ExpressionAttributeValues: {
            ":id": messageId,
            ":sk": `MSG#${messageId}`,
          },
          Limit: 1,
        }),
      );
      if (sRes.Items && sRes.Items.length > 0) {
        const item = sRes.Items[0];
        await docClient.send(
          new DeleteCommand({
            TableName: "SocialAndContent",
            Key: { entityId: item.entityId, sk: item.sk },
          }),
        );
      }
    } catch (dynErr) {
      console.error("[audio-messages DELETE] DynamoDB error:", dynErr);
    }

    // 2. Delete from Firestore
    try {
      await db.collection("audioMessages").doc(messageId).delete();
    } catch (fsErr) {
      console.error("[audio-messages DELETE] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error: unknown) {
    console.error("audio-message DELETE error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete message" },
      { status: 500 },
    );
  }
}