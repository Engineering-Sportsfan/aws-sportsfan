import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface MemorabiliaInput {
  subCategory: string;
  title: string;
  athlete: string;
  image: string;
  serialNo: string;
  certified?: boolean;
  governance_state?: string;
  rewardCoins?: number;
  price: string | number; // Plain number (e.g. 14999) from request payload
  ownerHistory?: string[];
}

function formatPriceString(priceVal: string | number): string {
  const clean = String(priceVal).replace(/[^0-9]/g, "");
  const num = parseInt(clean, 10);
  if (isNaN(num)) return "₹0";
  return "₹" + num.toLocaleString('en-IN');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      subCategory,
      title,
      athlete,
      image,
      serialNo,
      certified = false,
      governance_state = "pending review",
      rewardCoins = 0,
      price,
      ownerHistory = [],
    } = body as MemorabiliaInput;

    // Required fields validation
    if (!subCategory || !title || !athlete || !image || !serialNo || price === undefined || price === "") {
      return NextResponse.json(
        { success: false, error: "Missing required fields (subCategory, title, athlete, image, serialNo, price)" },
        { status: 400 }
      );
    }

    // Validate price is positive numeric
    const cleanPriceStr = String(price).replace(/[^0-9]/g, "");
    const rawPrice = parseInt(cleanPriceStr, 10);
    if (isNaN(rawPrice) || rawPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Price must be a valid non-negative number" },
        { status: 400 }
      );
    }

    // Check uniqueness of serialNo
    const dupQuery = await db.collection("storeProducts")
      .where("serialNo", "==", serialNo)
      .limit(1)
      .get();

    if (!dupQuery.empty) {
      return NextResponse.json(
        { success: false, error: "A memorabilia item with this serial number already exists" },
        { status: 409 }
      );
    }

    // Validate owner history if provided
    if (Array.isArray(ownerHistory)) {
      for (let i = 0; i < ownerHistory.length; i++) {
        if (!ownerHistory[i] || typeof ownerHistory[i] !== "string" || ownerHistory[i].trim() === "") {
          return NextResponse.json(
            { success: false, error: "Ownership history entries must be non-empty strings" },
            { status: 400 }
          );
        }
      }
    }

    const docRef = db.collection("storeProducts").doc();
    const memorabiliaId = docRef.id;

    const newMemorabilia = {
      // Category 1: Admin Filled / Calculated
      memorabiliaId, // document ID field
      category: "memorabilia",
      subCategory,
      title,
      athlete,
      image,
      serialNo,
      certified: Boolean(certified),
      governance_state: governance_state || "pending review",
      rewardCoins: Number(rewardCoins) || 0,
      price: formatPriceString(rawPrice),
      pricePaise: rawPrice * 100,
      ownerHistory: Array.isArray(ownerHistory) ? ownerHistory.map(o => o.trim()) : [],

      // Category 2: System Managed defaults
      status: "available",
      lockedBy: null,
      lockExpiresAt: null,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(newMemorabilia);

    return NextResponse.json({ success: true, id: memorabiliaId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding memorabilia:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
