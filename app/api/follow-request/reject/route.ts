import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();

    if (!requestId) {
      return NextResponse.json(
        { success: false },
        { status: 400 }
      );
    }

    await db
      .collection("followRequests")
      .doc(requestId)
      .delete();
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
      },
      { status: 500 }
    );
  }
}