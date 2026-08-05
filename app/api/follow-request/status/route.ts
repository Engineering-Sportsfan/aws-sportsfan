import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const senderUserId = searchParams.get("senderUserId");
    const receiverUserId = searchParams.get("receiverUserId");

    if (!senderUserId || !receiverUserId) {
      return NextResponse.json(
        {
          success: false,
          status: "none",
        },
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
      console.warn("[follow-request status GET] DynamoDB notice:", dynErr);
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
    console.error("GET /api/follow-request/status error:", error);
    return NextResponse.json(
      {
        success: false,
        status: "none",
      },
      { status: 500 },
    );
  }
}