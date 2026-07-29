import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface MembershipInput {
  name: string;
  period: string;
  governance_state?: string;
  popular?: boolean;
  rewardCoins?: number;
  price: string | number; // Plain number (e.g. 3999) from request payload
  color: string;
  gradientFrom: string;
  gradientTo: string;
  benefits: string[];
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

    const snapshot = await db.collection("storeProducts").where("category", "==", "memberships").get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Error fetching membership(s):", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name,
      period,
      governance_state = "pending review",
      popular = false,
      rewardCoins = 0,
      price,
      color,
      gradientFrom,
      gradientTo,
      benefits = [],
    } = body as MembershipInput;

    // Required fields validation
    if (!name || !period || price === undefined || price === "" || !color || !gradientFrom || !gradientTo) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, period, price, color, gradientFrom, gradientTo)" },
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

    // Validate benefits: minimum 1 benefits row required
    if (!Array.isArray(benefits) || benefits.length === 0) {
      return NextResponse.json(
        { success: false, error: "Membership plan must have at least one benefit" },
        { status: 400 }
      );
    }

    for (let i = 0; i < benefits.length; i++) {
      if (!benefits[i] || typeof benefits[i] !== "string" || benefits[i].trim() === "") {
        return NextResponse.json(
          { success: false, error: `Benefit entry ${i + 1} must be a non-empty string` },
          { status: 400 }
        );
      }
    }

    // Generate membershipId slug from name
    const membershipId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // Check if membership tier already exists
    const docRef = db.collection("storeProducts").doc(membershipId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return NextResponse.json(
        { success: false, error: `A membership tier named "${name}" already exists` },
        { status: 409 }
      );
    }

    const newMembership = {
      membershipId,
      category: "memberships",
      name,
      period,
      governance_state: governance_state || "pending review",
      popular: Boolean(popular),
      rewardCoins: Number(rewardCoins) || 0,
      price: formatPriceString(rawPrice),
      pricePaise: rawPrice * 100,
      color,
      gradientFrom,
      gradientTo,
      benefits: benefits.map(b => b.trim()),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.set(newMembership);

    return NextResponse.json({ success: true, id: membershipId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding membership:", error);
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
      period,
      governance_state = "pending review",
      popular = false,
      rewardCoins = 0,
      price,
      color,
      gradientFrom,
      gradientTo,
      benefits = [],
    } = body as MembershipInput;

    if (!name || !period || price === undefined || price === "" || !color || !gradientFrom || !gradientTo) {
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

    if (!Array.isArray(benefits) || benefits.length === 0) {
      return NextResponse.json(
        { success: false, error: "Membership plan must have at least one benefit" },
        { status: 400 }
      );
    }

    for (let i = 0; i < benefits.length; i++) {
      if (!benefits[i] || typeof benefits[i] !== "string" || benefits[i].trim() === "") {
        return NextResponse.json(
          { success: false, error: `Benefit entry ${i + 1} must be a non-empty string` },
          { status: 400 }
        );
      }
    }

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Notice we do not check for name conflicts if they rename it because the doc ID was derived from the name initially.
    // In a real app we might want to either block renaming or change doc ID, but updating doc ID in Firestore is delete+create.
    // For simplicity, we just update the current document.

    const updatedMembership = {
      name,
      period,
      governance_state: governance_state || "pending review",
      popular: Boolean(popular),
      rewardCoins: Number(rewardCoins) || 0,
      price: formatPriceString(rawPrice),
      pricePaise: rawPrice * 100,
      color,
      gradientFrom,
      gradientTo,
      benefits: benefits.map(b => b.trim()),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.update(updatedMembership);

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating membership:", error);
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
    console.error("Error deleting membership:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
