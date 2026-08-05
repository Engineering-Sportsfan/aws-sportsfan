// api/admin/store/addMerchandise/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

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
      let merchandiseData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          merchandiseData = { id, ...getRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddMerchandise GET] DynamoDB get failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            merchandiseData = { id: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error("[AddMerchandise GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!merchandiseData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: merchandiseData });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "memorabilia" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => ({
          id: (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddMerchandise GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "memorabilia").get();
        list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[AddMerchandise GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
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

    // Check unique serialNo across storeProducts in DynamoDB
    let serialExists = false;
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND serialNo = :sn",
        ExpressionAttributeValues: {
          ":p": "PRODUCT#",
          ":sn": serialNo
        }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        serialExists = true;
      }
    } catch (e) {
      console.warn("DynamoDB serialNo scan notice:", e);
    }

    if (!serialExists) {
      const snapshot = await db.collection("storeProducts")
        .where("serialNo", "==", serialNo)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        serialExists = true;
      }
    }

    if (serialExists) {
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

    const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const documentId = `${baseSlug}-${Date.now()}`;
    const now = Date.now();

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
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          entityId: `PRODUCT#${documentId}`,
          sk: `PRODUCT#${documentId}`,
          ...newMerchandise
        }
      }));
    } catch (dynErr) {
      console.warn("[AddMerchandise POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(documentId).set(newMerchandise);
    } catch (fsErr) {
      console.warn("[AddMerchandise POST] Firestore sync failed:", fsErr);
    }

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

    // Check unique serialNo excluding self in DynamoDB
    let serialExists = false;
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND serialNo = :sn",
        ExpressionAttributeValues: {
          ":p": "PRODUCT#",
          ":sn": serialNo
        }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        serialExists = scanRes.Items.some(item => (item.entityId as string).replace(/^PRODUCT#/, "") !== id);
      }
    } catch (e) {
      console.warn("DynamoDB serialNo scan check notice:", e);
    }

    if (!serialExists) {
      const snapshot = await db.collection("storeProducts")
        .where("serialNo", "==", serialNo)
        .get();
      serialExists = snapshot.docs.some(doc => doc.id !== id);
    }

    if (serialExists) {
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

    const now = Date.now();
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
          ...updatedMerchandise,
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`
        }
      }));
    } catch (dynErr) {
      console.warn("[AddMerchandise PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(updatedMerchandise, { merge: true });
    } catch (fsErr) {
      console.warn("[AddMerchandise PUT] Firestore fallback failed:", fsErr);
    }

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

    // 1. Delete from DynamoDB first
    try {
      await docClient.send(new DeleteCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
    } catch (dynErr) {
      console.warn("[AddMerchandise DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).delete();
    } catch (fsErr) {
      console.warn("[AddMerchandise DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting merchandise:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
