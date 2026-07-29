import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface ListingInput {
  title: string;
  type: string;
  price: string | number;
  preview?: boolean;
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

    const snapshot = await db.collection("storeProducts").where("category", "==", "athletes").get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Error fetching athlete(s):", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name,
      discipline,
      bio,
      image,
      governance_state = "pending review",
      rewardCoins = 0,
      listings = [],
    } = body;

    // Required fields validation
    if (!name || !discipline || !bio || !image) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, discipline, bio, image)" },
        { status: 400 }
      );
    }

    // Validate listings if any
    const formattedListings = [];
    if (Array.isArray(listings)) {
      for (let i = 0; i < listings.length; i++) {
        const item: ListingInput = listings[i];
        if (!item.title || !item.type || item.price === undefined || item.price === "") {
          return NextResponse.json(
            { success: false, error: `Listing row ${i + 1} has missing fields (title, type, or price)` },
            { status: 400 }
          );
        }
        
        // validate price is numeric
        const cleanPrice = String(item.price).replace(/[^0-9]/g, "");
        if (!cleanPrice) {
          return NextResponse.json(
            { success: false, error: `Listing row ${i + 1} price must be a valid positive number` },
            { status: 400 }
          );
        }

        formattedListings.push({
          id: i + 1, // sequential id server-side (1, 2, 3...)
          title: item.title,
          type: item.type,
          price: formatPriceString(item.price),
          preview: Boolean(item.preview),
        });
      }
    }

    const docRef = db.collection("storeProducts").doc();
    const athleteId = docRef.id;

    const newAthlete = {
      athleteId,
      category: "athletes",
      name,
      discipline,
      bio,
      image,
      governance_state: governance_state || "pending review",
      rewardCoins: Number(rewardCoins) || 0,
      listings: formattedListings,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(newAthlete);

    return NextResponse.json({ success: true, id: athleteId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding athlete:", error);
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
      name,
      discipline,
      bio,
      image,
      governance_state = "pending review",
      rewardCoins = 0,
      listings = [],
    } = body;

    // Required fields validation
    if (!name || !discipline || !bio || !image) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, discipline, bio, image)" },
        { status: 400 }
      );
    }

    // Validate listings if any
    const formattedListings = [];
    if (Array.isArray(listings)) {
      for (let i = 0; i < listings.length; i++) {
        const item: ListingInput = listings[i];
        if (!item.title || !item.type || item.price === undefined || item.price === "") {
          return NextResponse.json(
            { success: false, error: `Listing row ${i + 1} has missing fields (title, type, or price)` },
            { status: 400 }
          );
        }
        
        // validate price is numeric
        const cleanPrice = String(item.price).replace(/[^0-9]/g, "");
        if (!cleanPrice) {
          return NextResponse.json(
            { success: false, error: `Listing row ${i + 1} price must be a valid positive number` },
            { status: 400 }
          );
        }

        formattedListings.push({
          id: i + 1, // sequential id server-side (1, 2, 3...)
          title: item.title,
          type: item.type,
          price: formatPriceString(item.price),
          preview: Boolean(item.preview),
        });
      }
    }

    const docRef = db.collection("storeProducts").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const updatedAthlete = {
      name,
      discipline,
      bio,
      image,
      governance_state: governance_state || "pending review",
      rewardCoins: Number(rewardCoins) || 0,
      listings: formattedListings,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.update(updatedAthlete);

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating athlete:", error);
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
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting athlete:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
