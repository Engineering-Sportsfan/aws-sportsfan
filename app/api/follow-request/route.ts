import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(
  req: NextRequest
) {
  try {
    const { searchParams } =
      new URL(req.url);

    const senderUserId =
      searchParams.get(
        "senderUserId"
      );

    const receiverUserId =
      searchParams.get(
        "receiverUserId"
      );

    if (
      !senderUserId ||
      !receiverUserId
    ) {
      return NextResponse.json(
        {
          success: false,
          status: "none",
        },
        { status: 400 }
      );
    }

    const snap = await db
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

    if (snap.empty) {
      return NextResponse.json({
        success: true,
        status: "none",
      });
    }

    const data =
      snap.docs[0].data();

    return NextResponse.json({
      success: true,
      status:
        data.status ||
        "none",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        success: false,
        status: "none",
      },
      { status: 500 }
    );
  }
}