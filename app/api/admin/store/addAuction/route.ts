// api/admin/store/addAuction/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Timestamp } from "firebase-admin/firestore";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

function formatTimestamp(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") return new Date(val).toISOString();
  if (typeof val.toDate === "function") return val.toDate().toISOString();
  try {
    return new Date(val).toISOString();
  } catch (e) {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    
    if (id) {
      let auctionData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          auctionData = { id, ...getRes.Item };
          if (auctionData.endsAt) {
            auctionData.endsAt = formatTimestamp(auctionData.endsAt);
          }
          if (auctionData.paymentDeadline) {
            auctionData.paymentDeadline = formatTimestamp(auctionData.paymentDeadline);
          }
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddAuction GET] DynamoDB get failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            const data = doc.data();
            auctionData = { id: doc.id, ...data };
            if (auctionData.endsAt) {
              auctionData.endsAt = formatTimestamp(auctionData.endsAt);
            }
            if (auctionData.paymentDeadline) {
              auctionData.paymentDeadline = formatTimestamp(auctionData.paymentDeadline);
            }
          }
        } catch (fsErr) {
          console.error("[AddAuction GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!auctionData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: auctionData });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "Auctions" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => {
          const d = { ...item };
          if (d.endsAt) d.endsAt = formatTimestamp(d.endsAt);
          if (d.paymentDeadline) d.paymentDeadline = formatTimestamp(d.paymentDeadline);
          return {
            id: (item.entityId as string).replace(/^PRODUCT#/, ""),
            ...d
          };
        });
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddAuction GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "Auctions").get();
        list = snapshot.docs.map(doc => {
          const d = doc.data();
          if (d.endsAt) d.endsAt = formatTimestamp(d.endsAt);
          if (d.paymentDeadline) d.paymentDeadline = formatTimestamp(d.paymentDeadline);
          return { id: doc.id, ...d };
        });
      } catch (fsErr) {
        console.error("[AddAuction GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
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
      price,
      reservePrice,
      minIncrement,
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

    const durationMs = durationUnit === "days" 
      ? durationVal * 24 * 60 * 60 * 1000 
      : durationVal * 60 * 60 * 1000;

    const id = uuidv4();
    const now = Date.now();
    const endsAtEpoch = now + durationMs;
    const paymentDeadlineEpoch = endsAtEpoch + 24 * 60 * 60 * 1000;

    const newAuction = {
      category: "Auctions",
      title,
      description,
      image,
      governance_state: governance_state || "pending review",
      pricePaise,
      reservePrice: reservePriceInt,
      minIncrementPaise,
      endsAt: endsAtEpoch,
      paymentDeadline: paymentDeadlineEpoch,
      status: "active",
      createdAt: now,
      updatedAt: now,
      biddersCount: 0,
      currentBidPaise: null,
      highestBidderId: null,
      winnerId: null,
      winnerPaymentStatus: null,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`,
          id,
          ...newAuction
        }
      }));
    } catch (dynErr) {
      console.warn("[AddAuction POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const fsEndsAt = Timestamp.fromDate(new Date(endsAtEpoch));
      const fsPaymentDeadline = Timestamp.fromDate(new Date(paymentDeadlineEpoch));
      await db.collection("storeProducts").doc(id).set({
        ...newAuction,
        endsAt: fsEndsAt,
        paymentDeadline: fsPaymentDeadline
      });
    } catch (fsErr) {
      console.warn("[AddAuction POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
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

    const now = Date.now();
    const updatedAuction: any = {
      title,
      description,
      image,
      governance_state: governance_state || "pending review",
      pricePaise,
      reservePrice: reservePriceInt,
      minIncrementPaise,
      updatedAt: now,
    };

    let endsAtEpoch: number | null = null;
    let paymentDeadlineEpoch: number | null = null;

    if (endsAt) {
      const endsAtDate = new Date(endsAt);
      endsAtEpoch = endsAtDate.getTime();
      paymentDeadlineEpoch = endsAtEpoch + 24 * 60 * 60 * 1000;
      updatedAuction.endsAt = endsAtEpoch;
      updatedAuction.paymentDeadline = paymentDeadlineEpoch;
    }

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
          ...updatedAuction,
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`
        }
      }));
    } catch (dynErr) {
      console.warn("[AddAuction PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const fsUpdate: any = { ...updatedAuction };
      if (endsAtEpoch && paymentDeadlineEpoch) {
        fsUpdate.endsAt = Timestamp.fromDate(new Date(endsAtEpoch));
        fsUpdate.paymentDeadline = Timestamp.fromDate(new Date(paymentDeadlineEpoch));
      }
      await db.collection("storeProducts").doc(id).set(fsUpdate, { merge: true });
    } catch (fsErr) {
      console.warn("[AddAuction PUT] Firestore fallback failed:", fsErr);
    }

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

    // 1. Delete from DynamoDB first
    try {
      await docClient.send(new DeleteCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
    } catch (dynErr) {
      console.warn("[AddAuction DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).delete();
    } catch (fsErr) {
      console.warn("[AddAuction DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting auction:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
