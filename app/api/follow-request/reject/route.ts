import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    let requestData: any = null;

    // 1. Try get from DynamoDB
    try {
      const rRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `FOLLOWREQ#${requestId}`, sk: "REQ#META" },
        }),
      );
      if (rRes.Item) requestData = rRes.Item;
    } catch {}

    // Fallback to Firestore for requestData
    if (!requestData) {
      const doc = await db.collection("followRequests").doc(requestId).get();
      if (doc.exists) requestData = doc.data();
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `FOLLOWREQ#${requestId}`, sk: "REQ#META" },
        }),
      );

      if (requestData) {
        await docClient.send(
          new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: {
              entityId: `USER#${requestData.senderUserId}`,
              sk: `FOLLOWREQ#${requestData.receiverUserId}`,
            },
          }),
        );
        await docClient.send(
          new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: {
              entityId: `USER#${requestData.receiverUserId}`,
              sk: `FOLLOWREQRX#${requestData.senderUserId}`,
            },
          }),
        );
      }
    } catch (dynErr) {
      console.error("[follow-request reject] DynamoDB error:", dynErr);
    }

    // 2. Delete from Firestore
    try {
      await db.collection("followRequests").doc(requestId).delete();

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
      console.error("[follow-request reject] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Reject follow request error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}