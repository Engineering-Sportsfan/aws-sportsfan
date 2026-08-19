// api/admin/store/addMembership/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface MembershipInput {
  name: string;
  period: string;
  governance_state?: string;
  popular?: boolean;
  rewardCoins?: number;
  price: string | number;
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
      let membershipData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          membershipData = { id, ...getRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddMembership GET] DynamoDB get failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            membershipData = { id: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error("[AddMembership GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!membershipData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: membershipData });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "memberships" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => ({
          id: (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddMembership GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "memberships").get();
        list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[AddMembership GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
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

    const membershipId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    // Check if membership tier already exists
    let membershipExists = false;
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${membershipId}`, sk: `PRODUCT#${membershipId}` }
      }));
      if (getRes.Item) membershipExists = true;
    } catch (e) {}

    if (!membershipExists) {
      const docSnap = await db.collection("storeProducts").doc(membershipId).get();
      if (docSnap.exists) membershipExists = true;
    }

    if (membershipExists) {
      return NextResponse.json(
        { success: false, error: `A membership tier named "${name}" already exists` },
        { status: 409 }
      );
    }

    const now = Date.now();
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
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          entityId: `PRODUCT#${membershipId}`,
          sk: `PRODUCT#${membershipId}`,
          ...newMembership
        }
      }));
    } catch (dynErr) {
      console.warn("[AddMembership POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(membershipId).set(newMembership);
    } catch (fsErr) {
      console.warn("[AddMembership POST] Firestore sync failed:", fsErr);
    }

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

    const now = Date.now();
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
      updatedAt: now,
    };

    // 1. Update in DynamoDB first
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
      const existingItem = getRes.Item;
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          ...existingItem,
          ...updatedMembership,
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`
        }
      }));
    } catch (dynErr) {
      console.warn("[AddMembership PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(updatedMembership, { merge: true });
    } catch (fsErr) {
      console.warn("[AddMembership PUT] Firestore fallback failed:", fsErr);
    }

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

    // 1. Delete from DynamoDB first
    try {
      await docClient.send(new DeleteCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
    } catch (dynErr) {
      console.warn("[AddMembership DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).delete();
    } catch (fsErr) {
      console.warn("[AddMembership DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting membership:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
