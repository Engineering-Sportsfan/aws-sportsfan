import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      title,
      description,
      image,
      governance_state,
      price, // starting price in rupees
      reservePrice, // minimum price to sell, in paise (direct from UI input label "paise")
      minIncrement, // min increment in rupees
      durationValue,
      durationUnit,
    } = body;

    // Required fields validation
    if (
      !title ||
      !description ||
      !image ||
      price === undefined ||
      reservePrice === undefined ||
      minIncrement === undefined ||
      !durationValue ||
      !durationUnit
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const pricePaise = Number(price) * 100;
    const minIncrementPaise = Number(minIncrement) * 100;
    const reservePriceInt = Number(reservePrice);

    if (reservePriceInt < pricePaise) {
      return NextResponse.json(
        { success: false, error: "Reserve price cannot be less than starting price" },
        { status: 400 }
      );
    }

    if (minIncrementPaise <= 0) {
      return NextResponse.json(
        { success: false, error: "Min increment must be greater than 0" },
        { status: 400 }
      );
    }

    const durationVal = Number(durationValue);
    if (isNaN(durationVal) || durationVal <= 0) {
      return NextResponse.json(
        { success: false, error: "Duration must be a positive number" },
        { status: 400 }
      );
    }

    // Compute endsAt and paymentDeadline server-side
    const durationMs = durationUnit === "days" 
      ? durationVal * 24 * 60 * 60 * 1000 
      : durationVal * 60 * 60 * 1000;

    const now = new Date();
    const endsAtDate = new Date(now.getTime() + durationMs);
    const paymentDeadlineDate = new Date(endsAtDate.getTime() + 24 * 60 * 60 * 1000);

    const newAuction = {
      // Category 1 Fields
      category: "Auctions",
      title,
      description,
      image,
      governance_state: governance_state || "pending review",
      pricePaise,
      reservePrice: reservePriceInt,
      minIncrementPaise,
      endsAt: Timestamp.fromDate(endsAtDate),
      paymentDeadline: Timestamp.fromDate(paymentDeadlineDate),
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),

      // Category 2 Fields (System Managed Defaults)
      biddersCount: 0,
      currentBidPaise: null,
      highestBidderId: null,
      winnerId: null,
      winnerPaymentStatus: null,
    };

    const docRef = await db.collection("storeProducts").add(newAuction);

    return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding auction:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
