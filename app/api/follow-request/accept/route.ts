import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json(
        { success: false, message: "requestId required" },
        { status: 400 },
      );
    }

    let requestData: any = null;

    // 1. Try DynamoDB First
    try {
      const rRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `FOLLOWREQ#${requestId}`, sk: "REQ#META" },
        }),
      );
      if (rRes.Item) requestData = rRes.Item;
    } catch {}

    // 2. Fallback to Firestore
    if (!requestData) {
      const requestRef = db.collection("followRequests").doc(requestId);
      const requestDoc = await requestRef.get();
      if (requestDoc.exists) {
        requestData = requestDoc.data();
      }
    }

    if (!requestData) {
      return NextResponse.json(
        { success: false, message: "Request not found" },
        { status: 404 },
      );
    }

    const senderUserId = requestData.senderUserId;
    const receiverUserId = requestData.receiverUserId;
    const now = Date.now();

    // 1. Update in DynamoDB
    try {
      // Update follow request status
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...requestData,
            entityId: `FOLLOWREQ#${requestId}`,
            sk: "REQ#META",
            status: "accepted",
            acceptedAt: now,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...requestData,
            entityId: `USER#${senderUserId}`,
            sk: `FOLLOWREQ#${receiverUserId}`,
            status: "accepted",
            acceptedAt: now,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...requestData,
            entityId: `USER#${receiverUserId}`,
            sk: `FOLLOWREQRX#${senderUserId}`,
            status: "accepted",
            acceptedAt: now,
          },
        }),
      );

      // Increment sender's following and receiver's followers in IdentityAndAccess
      const senderMeta = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${senderUserId}`, sk: "USER#META" },
        }),
      );
      if (senderMeta.Item) {
        await docClient.send(
          new PutCommand({
            TableName: "IdentityAndAccess",
            Item: {
              ...senderMeta.Item,
              following: (senderMeta.Item.following || 0) + 1,
              updatedAt: now,
            },
          }),
        );
      }

      const receiverMeta = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${receiverUserId}`, sk: "USER#META" },
        }),
      );
      if (receiverMeta.Item) {
        await docClient.send(
          new PutCommand({
            TableName: "IdentityAndAccess",
            Item: {
              ...receiverMeta.Item,
              followers: (receiverMeta.Item.followers || 0) + 1,
              updatedAt: now,
            },
          }),
        );
      }
    } catch (dynErr) {
      console.error("[follow-request accept] DynamoDB error:", dynErr);
    }

    // 2. Update Firestore
    try {
      const requestRef = db.collection("followRequests").doc(requestId);
      await requestRef.update({
        status: "accepted",
        acceptedAt: now,
      });

      const senderSnap = await db
        .collection("users")
        .where("userId", "==", senderUserId)
        .limit(1)
        .get();

      const receiverSnap = await db
        .collection("users")
        .where("userId", "==", receiverUserId)
        .limit(1)
        .get();

      if (!senderSnap.empty) {
        await senderSnap.docs[0].ref.update({
          following: admin.firestore.FieldValue.increment(1),
        });
      }

      if (!receiverSnap.empty) {
        await receiverSnap.docs[0].ref.update({
          followers: admin.firestore.FieldValue.increment(1),
        });
      }

      const notifSnap = await db
        .collection("notifications")
        .where("requestId", "==", requestId)
        .get();

      const batch = db.batch();
      notifSnap.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (fsErr) {
      console.error("[follow-request accept] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Accept follow request error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Accept failed",
      },
      { status: 500 },
    );
  }
}