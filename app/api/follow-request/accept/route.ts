import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json(
        { success: false, message: "requestId required" },
        { status: 400 }
      );
    }

    const requestRef = db
      .collection("followRequests")
      .doc(requestId);

    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return NextResponse.json(
        { success: false, message: "Request not found" },
        { status: 404 }
      );
    }

    const requestData = requestDoc.data();

    if (!requestData) {
      return NextResponse.json(
        { success: false, message: "Invalid request" },
        { status: 400 }
      );
    }

    await requestRef.update({
      status: "accepted",
      acceptedAt: Date.now(),
    });

    const senderUserId =
      requestData.senderUserId;

    const receiverUserId =
      requestData.receiverUserId;

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
        following:
          admin.firestore.FieldValue.increment(1),
      });
    }

    if (!receiverSnap.empty) {
      await receiverSnap.docs[0].ref.update({
        followers:
          admin.firestore.FieldValue.increment(1),
      });
    }
    const notifSnap = await db
  .collection("notifications")
  .where(
    "requestId",
    "==",
    requestId
  )
  .get();

const batch = db.batch();

notifSnap.docs.forEach((doc) => {
  batch.delete(doc.ref);
});

await batch.commit();
    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        message: "Accept failed",
      },
      { status: 500 }
    );
  }
}