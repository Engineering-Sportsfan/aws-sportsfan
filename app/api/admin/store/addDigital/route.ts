import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface DigitalProductInput {
  title: string;
  description: string;
  type: string;
  creator: string;
  image: string;
  governance_state?: string;
  duration: string;
  lessons?: number;
  hasPreview?: boolean;
  rewardCoins?: number;
  price: string | number; // Plain number (e.g. 3999) from request payload
  highlights?: string[];
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
      title,
      description,
      type,
      creator,
      image,
      governance_state = "pending review",
      duration,
      lessons = 0,
      hasPreview = false,
      rewardCoins = 0,
      price,
      highlights = [],
    } = body as DigitalProductInput;

    // Required fields validation
    if (!title || !description || !type || !creator || !image || !duration || price === undefined || price === "") {
      return NextResponse.json(
        { success: false, error: "Missing required fields (title, description, type, creator, image, duration, price)" },
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

    // Validate highlights if provided
    if (Array.isArray(highlights)) {
      for (let i = 0; i < highlights.length; i++) {
        if (!highlights[i] || typeof highlights[i] !== "string" || highlights[i].trim() === "") {
          return NextResponse.json(
            { success: false, error: "Highlight entries must be non-empty strings" },
            { status: 400 }
          );
        }
      }
    }

    const docRef = db.collection("storeProducts").doc();
    const digitalProductId = docRef.id;

    const newDigitalProduct = {
      // Category 1: Admin Filled / Calculated
      digitalProductId, // document ID field
      category: "digital",
      title,
      description,
      type,
      creator,
      image,
      governance_state: governance_state || "pending review",
      duration,
      lessons: Number(lessons) || 0,
      hasPreview: Boolean(hasPreview),
      rewardCoins: Number(rewardCoins) || 0,
      price: formatPriceString(rawPrice),
      pricePaise: rawPrice * 100,
      highlights: Array.isArray(highlights) ? highlights.map(h => h.trim()) : [],

      // Category 2: System / Lifecycle defaults
      progress: null, // Always null on creation

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(newDigitalProduct);

    return NextResponse.json({ success: true, id: digitalProductId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding digital product:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
