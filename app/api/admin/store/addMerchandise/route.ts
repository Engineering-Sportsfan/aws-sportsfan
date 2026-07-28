import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface MerchandiseInput {
  title: string;
  athlete: string;
  subCategory: "Signed Jerseys" | "Equipment" | "Match-worn Gear" | "Trophies & Medals" | "Other";
  serialNo: string;
  certified?: boolean;
  price: number;
  rewardCoins?: number;
  governance_state: "pending review" | "approved" | "rejected";
  image: string;
  ownerHistory?: string[];
}

function formatPriceString(priceVal: number): string {
  return "₹" + priceVal.toLocaleString('en-IN');
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");

    if (id) {
      const doc = await db.collection("storeProducts").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { id: doc.id, ...doc.data() } });
    }

    const snapshot = await db.collection("storeProducts").where("category", "==", "memorabilia").get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Error fetching merchandise:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      title,
      athlete,
      subCategory,
      serialNo,
      certified = false,
      price,
      rewardCoins = 0,
      governance_state,
      image,
      ownerHistory = [],
    } = body as MerchandiseInput;

    // Server-side required validation
    if (!title || !athlete || !subCategory || !serialNo || price === undefined || price === null || !governance_state || !image) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (title, athlete, subCategory, serialNo, price, governance_state, image)" },
        { status: 400 }
      );
    }

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Price must be a valid non-negative number" },
        { status: 400 }
      );
    }

    // Check unique serialNo across storeProducts
    const snapshot = await db.collection("storeProducts")
      .where("serialNo", "==", serialNo)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      return NextResponse.json(
        { success: false, error: `Serial Number "${serialNo}" is already in use by another product` },
        { status: 409 }
      );
    }

    // Map display labels to actual stored values (validation check)
    const validStates = ["pending review", "approved", "rejected"];
    if (!validStates.includes(governance_state)) {
      return NextResponse.json(
        { success: false, error: "Invalid governance state value" },
        { status: 400 }
      );
    }

    // Generate slug/timestamp based document ID
    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const documentId = `${baseSlug}-${Date.now()}`;

    const newMerchandise = {
      category: "memorabilia",
      title,
      athlete,
      subCategory,
      serialNo,
      certified: Boolean(certified),
      price: formatPriceString(numericPrice),
      pricePaise: Math.round(numericPrice * 100),
      rewardCoins: Number(rewardCoins) || 0,
      governance_state,
      image,
      ownerHistory: Array.isArray(ownerHistory) ? ownerHistory.filter(x => x && x.trim() !== "") : [],
      status: "available",
      lockedBy: null,
      lockExpiresAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection("storeProducts").doc(documentId).set(newMerchandise);

    return NextResponse.json({ success: true, id: documentId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding merchandise:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
    }

    const body = await req.json();

    const {
      title,
      athlete,
      subCategory,
      serialNo,
      certified = false,
      price,
      rewardCoins = 0,
      governance_state,
      image,
      ownerHistory = [],
    } = body as MerchandiseInput;

    if (!title || !athlete || !subCategory || !serialNo || price === undefined || price === null || !governance_state || !image) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const numericPrice = Number(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return NextResponse.json(
        { success: false, error: "Price must be a valid non-negative number" },
        { status: 400 }
      );
    }

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Check unique serialNo excluding self
    const snapshot = await db.collection("storeProducts")
      .where("serialNo", "==", serialNo)
      .get();

    const isDuplicate = snapshot.docs.some(doc => doc.id !== id);
    if (isDuplicate) {
      return NextResponse.json(
        { success: false, error: `Serial Number "${serialNo}" is already in use by another product` },
        { status: 409 }
      );
    }

    const validStates = ["pending review", "approved", "rejected"];
    if (!validStates.includes(governance_state)) {
      return NextResponse.json(
        { success: false, error: "Invalid governance state value" },
        { status: 400 }
      );
    }

    const updatedMerchandise = {
      title,
      athlete,
      subCategory,
      serialNo,
      certified: Boolean(certified),
      price: formatPriceString(numericPrice),
      pricePaise: Math.round(numericPrice * 100),
      rewardCoins: Number(rewardCoins) || 0,
      governance_state,
      image,
      ownerHistory: Array.isArray(ownerHistory) ? ownerHistory.filter(x => x && x.trim() !== "") : [],
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.update(updatedMerchandise);

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating merchandise:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
    }

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting merchandise:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
