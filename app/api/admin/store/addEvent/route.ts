// api/admin/store/addEvent/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    
    if (id) {
      let eventData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          eventData = { id, ...getRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddEvent GET] DynamoDB get failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            eventData = { id: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error("[AddEvent GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!eventData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: eventData });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "events" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => ({
          id: (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddEvent GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "events").get();
        list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[AddEvent GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching event(s):", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      title,
      subtitle,
      description,
      type,
      dates,
      image,
      price,
      seats,
      seatsLeft,
      governance_state,
      icon,
      color,
      bg,
      badge,
      badgeColor,
      rewardCoins,
      perks,
      memento,
    } = body;

    // Required fields validation
    if (
      !title ||
      !subtitle ||
      !description ||
      !type ||
      !dates ||
      !image ||
      price === undefined ||
      seats === undefined ||
      seatsLeft === undefined
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (Number(seatsLeft) > Number(seats)) {
      return NextResponse.json(
        { success: false, error: "seatsLeft cannot be greater than seats" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const now = Date.now();
    const pricePaise = Number(price) * 100;

    const newEvent = {
      category: "events",
      governance_state: governance_state || "pending review",
      title,
      subtitle,
      description,
      type,
      dates,
      icon: icon || "",
      image,
      color: color || "",
      bg: bg || "",
      badge: badge || "",
      badgeColor: badgeColor || "",
      price: Number(price),
      pricePaise,
      rewardCoins: Number(rewardCoins) || 0,
      seats: Number(seats),
      seatsLeft: Number(seatsLeft),
      perks: Array.isArray(perks) ? perks : [],
      memento: memento || { label: "", price: 0 },
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
          ...newEvent
        }
      }));
    } catch (dynErr) {
      console.warn("[AddEvent POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(newEvent);
    } catch (fsErr) {
      console.warn("[AddEvent POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding event:", error);
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
      subtitle,
      description,
      type,
      dates,
      image,
      price,
      seats,
      seatsLeft,
      governance_state,
      icon,
      color,
      bg,
      badge,
      badgeColor,
      rewardCoins,
      perks,
      memento,
    } = body;

    // Required fields validation
    if (
      !title ||
      !subtitle ||
      !description ||
      !type ||
      !dates ||
      !image ||
      price === undefined ||
      seats === undefined ||
      seatsLeft === undefined
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (Number(seatsLeft) > Number(seats)) {
      return NextResponse.json(
        { success: false, error: "seatsLeft cannot be greater than seats" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const pricePaise = Number(price) * 100;

    const updatedEvent = {
      governance_state: governance_state || "pending review",
      title,
      subtitle,
      description,
      type,
      dates,
      icon: icon || "",
      image,
      color: color || "",
      bg: bg || "",
      badge: badge || "",
      badgeColor: badgeColor || "",
      price: Number(price),
      pricePaise,
      rewardCoins: Number(rewardCoins) || 0,
      seats: Number(seats),
      seatsLeft: Number(seatsLeft),
      perks: Array.isArray(perks) ? perks : [],
      memento: memento || { label: "", price: 0 },
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
          ...updatedEvent,
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`
        }
      }));
    } catch (dynErr) {
      console.warn("[AddEvent PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(updatedEvent, { merge: true });
    } catch (fsErr) {
      console.warn("[AddEvent PUT] Firestore fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating event:", error);
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
      console.warn("[AddEvent DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).delete();
    } catch (fsErr) {
      console.warn("[AddEvent DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting event:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
