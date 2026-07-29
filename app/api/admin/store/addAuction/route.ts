import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    
    if (id) {
      const doc = await db.collection("storeProducts").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      
      const data = doc.data();
      if (data) {
        // Convert Timestamps to ISO strings for frontend
        if (data.endsAt && typeof data.endsAt.toDate === 'function') {
          data.endsAt = data.endsAt.toDate().toISOString();
        }
        if (data.paymentDeadline && typeof data.paymentDeadline.toDate === 'function') {
          data.paymentDeadline = data.paymentDeadline.toDate().toISOString();
        }
      }
      
      return NextResponse.json({ success: true, data: { id: doc.id, ...data } });
    }

    const snapshot = await db.collection("storeProducts").where("category", "==", "Auctions").get();
    const data = snapshot.docs.map(doc => {
      const d = doc.data();
      if (d.endsAt && typeof d.endsAt.toDate === 'function') {
        d.endsAt = d.endsAt.toDate().toISOString();
      }
      if (d.paymentDeadline && typeof d.paymentDeadline.toDate === 'function') {
        d.paymentDeadline = d.paymentDeadline.toDate().toISOString();
      }
      return { id: doc.id, ...d };
    });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Error fetching auction(s):", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

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

export async function PUT(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
    }

    const body = await req.json();

    const {
      title,
      description,
      image,
      governance_state,
      price,
      reservePrice,
      minIncrement,
      // For editing, we might not always update duration, but if they provide endsAt directly, we use it
      endsAt,
    } = body;

    // Required fields validation
    if (
      !title ||
      !description ||
      !image ||
      price === undefined ||
      reservePrice === undefined ||
      minIncrement === undefined
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

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const updatedAuction: any = {
      title,
      description,
      image,
      governance_state: governance_state || "pending review",
      pricePaise,
      reservePrice: reservePriceInt,
      minIncrementPaise,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (endsAt) {
      const endsAtDate = new Date(endsAt);
      const paymentDeadlineDate = new Date(endsAtDate.getTime() + 24 * 60 * 60 * 1000);
      updatedAuction.endsAt = Timestamp.fromDate(endsAtDate);
      updatedAuction.paymentDeadline = Timestamp.fromDate(paymentDeadlineDate);
    }

    await docRef.update(updatedAuction);

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating auction:", error);
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
    console.error("Error deleting auction:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
