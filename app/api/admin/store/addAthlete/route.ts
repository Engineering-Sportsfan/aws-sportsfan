// api/admin/store/addAthlete/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

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
      let athleteData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          athleteData = { id, ...getRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddAthlete GET] DynamoDB get failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            athleteData = { id: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error("[AddAthlete GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!athleteData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: athleteData });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "athletes" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => ({
          id: (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddAthlete GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "athletes").get();
        list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[AddAthlete GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
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
          id: i + 1,
          title: item.title,
          type: item.type,
          price: formatPriceString(item.price),
          preview: Boolean(item.preview),
        });
      }
    }

    const id = uuidv4();
    const now = Date.now();

    const newAthlete = {
      athleteId: id,
      category: "athletes",
      name,
      discipline,
      bio,
      image,
      governance_state: governance_state || "pending review",
      rewardCoins: Number(rewardCoins) || 0,
      listings: formattedListings,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`,
          ...newAthlete
        }
      }));
    } catch (dynErr) {
      console.warn("[AddAthlete POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(newAthlete);
    } catch (fsErr) {
      console.warn("[AddAthlete POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
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
          id: i + 1,
          title: item.title,
          type: item.type,
          price: formatPriceString(item.price),
          preview: Boolean(item.preview),
        });
      }
    }

    const now = Date.now();
    const updatedAthlete = {
      name,
      discipline,
      bio,
      image,
      governance_state: governance_state || "pending review",
      rewardCoins: Number(rewardCoins) || 0,
      listings: formattedListings,
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
          ...updatedAthlete,
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`
        }
      }));
    } catch (dynErr) {
      console.warn("[AddAthlete PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(updatedAthlete, { merge: true });
    } catch (fsErr) {
      console.warn("[AddAthlete PUT] Firestore fallback failed:", fsErr);
    }

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

    // 1. Delete from DynamoDB first
    try {
      await docClient.send(new DeleteCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
    } catch (dynErr) {
      console.warn("[AddAthlete DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).delete();
    } catch (fsErr) {
      console.warn("[AddAthlete DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting athlete:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
