import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const senderUserId = searchParams.get("senderUserId");
    const receiverUserId = searchParams.get("receiverUserId");

    if (!senderUserId || !receiverUserId) {
      return NextResponse.json(
        { success: false, status: "none" },
        { status: 400 },
      );
    }

    let status = "none";
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB First
    try {
      const qRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `USER#${senderUserId}`,
            sk: `FOLLOWREQ#${receiverUserId}`,
          },
        }),
      );
      if (qRes.Item) {
        status = qRes.Item.status || "none";
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[follow-request GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      const snap = await db
        .collection("followRequests")
        .where("senderUserId", "==", senderUserId)
        .where("receiverUserId", "==", receiverUserId)
        .limit(1)
        .get();

      if (!snap.empty) {
        const data = snap.docs[0].data();
        status = data.status || "none";
      }
    }

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("GET /api/follow-request error:", error);
    return NextResponse.json(
      { success: false, status: "none" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { senderUserId, receiverUserId } = body;

    if (!senderUserId || !receiverUserId) {
      return NextResponse.json(
        { success: false, message: "senderUserId and receiverUserId are required" },
        { status: 400 },
      );
    }

    const requestId = randomUUID();
    const now = Date.now();
    const reqData = {
      id: requestId,
      senderUserId,
      receiverUserId,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    // 1. Write to DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `FOLLOWREQ#${requestId}`,
            sk: "REQ#META",
            ...reqData,
          },
        }),
      );
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${senderUserId}`,
            sk: `FOLLOWREQ#${receiverUserId}`,
            requestId,
            ...reqData,
          },
        }),
      );
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${receiverUserId}`,
            sk: `FOLLOWREQRX#${senderUserId}`,
            requestId,
            ...reqData,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[follow-request POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore
    try {
      await db.collection("followRequests").doc(requestId).set(reqData);
    } catch (fsErr) {
      console.error("[follow-request POST] Firestore error:", fsErr);
    }

    return NextResponse.json(
      { success: true, requestId, status: "pending" },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/follow-request error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send follow request" },
      { status: 500 },
    );
  }
}