import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      senderUserId,
      receiverUserId,
      senderName,
      receiverName,
    } = body;

    if (
      !senderUserId ||
      !receiverUserId
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing fields",
        },
        { status: 400 }
      );
    }

    const existing = await db
      .collection("followRequests")
      .where(
        "senderUserId",
        "==",
        senderUserId
      )
      .where(
        "receiverUserId",
        "==",
        receiverUserId
      )
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({
        success: true,
        alreadyExists: true,
      });
    }

     const requestRef = await db
.collection("followRequests")
.add({
  senderUserId,
  receiverUserId,
  senderName: senderName || "",
  receiverName: receiverName || "",
  status: "pending",
  createdAt: Date.now(),
});
const receiverDoc =
  await db
    .collection("users")
    .doc(receiverUserId)
    .get();

const receiverEmail =
  receiverDoc.data()?.email;

if (receiverEmail) {
  await db
    .collection("notifications")
    .add({
      recipientEmail:
        receiverEmail,

      type:
        "FOLLOW_REQUEST",

      requestId:
        requestRef.id,

      senderUserId,
      senderName,

      message:
        `${senderName} sent you a follow request`,

      isRead: false,

      createdAt:
        Date.now(),
    });
}

    return NextResponse.json({
      success: true,
     requestId: requestRef.id,
    });
  } catch (error) {
    console.error(
      "Follow request error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        message:
          "Unable to create request",
      },
      { status: 500 }
    );
  }
}