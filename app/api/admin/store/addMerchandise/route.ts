import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface MerchandiseInput {
  title: string;
  athlete: string;
  subCategory: string;
  serialNo: string;
  certified: boolean;
  price: string | number;
  rewardCoins?: number;
  governance_state?: string;
  image: string;
  ownerHistory?: string[];
}

function formatPriceString(priceVal: string | number): string {
  const clean = String(priceVal).replace(/[^0-9]/g, "");
  const num = parseInt(clean, 10);
  if (isNaN(num)) return "₹0";
  return "₹" + num.toLocaleString('en-IN');
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
    console.error("Error fetching merchandise(s):", error);
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
      governance_state = "pending review",
      image,
      ownerHistory = [],
    } = body as MerchandiseInput;

    // Required fields validation
    if (!title || !athlete || !subCategory || !serialNo || !image || price === undefined || price === "") {
      return NextResponse.json(
        { success: false, error: "Missing required fields (title, athlete, subCategory, serialNo, image, price)" },
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

    const docRef = db.collection("storeProducts").doc();
    const merchandiseId = docRef.id;

    const newMerchandise = {
      merchandiseId,
      category: "memorabilia",
      productType: "merchandise",
      title,
      athlete,
      subCategory,
      serialNo,
      certified: Boolean(certified),
      price: formatPriceString(rawPrice),
      pricePaise: rawPrice * 100,
      rewardCoins: Number(rewardCoins) || 0,
      governance_state: governance_state || "pending review",
      image,
      ownerHistory: Array.isArray(ownerHistory) ? ownerHistory.map(o => o.trim()).filter(Boolean) : [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(newMerchandise);

    return NextResponse.json({ success: true, id: merchandiseId }, { status: 201 });
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
      governance_state = "pending review",
      image,
      ownerHistory = [],
    } = body as MerchandiseInput;

    if (!title || !athlete || !subCategory || !serialNo || !image || price === undefined || price === "") {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const cleanPriceStr = String(price).replace(/[^0-9]/g, "");
    const rawPrice = parseInt(cleanPriceStr, 10);
    if (isNaN(rawPrice) || rawPrice < 0) {
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

    const updatedMerchandise = {
      title,
      athlete,
      subCategory,
      serialNo,
      certified: Boolean(certified),
      price: formatPriceString(rawPrice),
      pricePaise: rawPrice * 100,
      rewardCoins: Number(rewardCoins) || 0,
      governance_state: governance_state || "pending review",
      image,
      ownerHistory: Array.isArray(ownerHistory) ? ownerHistory.map(o => o.trim()).filter(Boolean) : [],
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
