// api/admin/store/addExperience/route.ts

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
      let experienceData: any = null;
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          experienceData = { id, ...getRes.Item };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddExperience GET] DynamoDB get failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            experienceData = { id: doc.id, ...doc.data() };
          }
        } catch (fsErr) {
          console.error("[AddExperience GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!experienceData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: experienceData });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "experiences" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => ({
          id: (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddExperience GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "experiences").get();
        list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[AddExperience GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching experience(s):", error);
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
      type,
      tag,
      tagColor,
      image,
      governanceState,
      status,
      athlete,
      athleteImg,
      host,
      hostRole,
      eventStartsAt,
      duration,
      onlineLink,
      price,
      rewardCoins,
      totalSeats,
      seatsBooked,
      agenda,
      inclusions,
      rules,
    } = body;

    // Required fields validation
    if (
      !title ||
      !description ||
      !type ||
      !athlete ||
      !host ||
      !eventStartsAt ||
      !duration ||
      price === undefined ||
      totalSeats === undefined
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if ((type === "online" || type === "hybrid") && !onlineLink) {
      return NextResponse.json(
        { success: false, error: "Online link is required for online/hybrid experiences" },
        { status: 400 }
      );
    }

    const sb = Number(seatsBooked) || 0;
    const ts = Number(totalSeats) || 0;

    if (sb > ts) {
      return NextResponse.json(
        { success: false, error: "seatsBooked cannot be greater than totalSeats" },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const now = Date.now();
    const priceInPaise = Number(price) * 100;

    const newExperience = {
      category: "experiences",
      productType: "experience",
      title,
      description,
      type,
      tag: tag || "",
      tagColor: tagColor || "",
      image: image || "",
      governanceState: governanceState || "pending review",
      status: status || "draft",
      athlete,
      athleteImg: athleteImg || "",
      host,
      hostRole: hostRole || "",
      eventStartsAt,
      duration,
      onlineLink: (type === "online" || type === "hybrid") ? (onlineLink || "") : "",
      price: Number(price),
      priceInPaise,
      rewardCoins: Number(rewardCoins) || 0,
      totalSeats: ts,
      seatsBooked: sb,
      agenda: Array.isArray(agenda) ? agenda : [],
      inclusions: Array.isArray(inclusions) ? inclusions : [],
      rules: Array.isArray(rules) ? rules : [],
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
          id,
          ...newExperience
        }
      }));
    } catch (dynErr) {
      console.warn("[AddExperience POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(newExperience);
    } catch (fsErr) {
      console.warn("[AddExperience POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding experience:", error);
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
      type,
      tag,
      tagColor,
      image,
      governanceState,
      status,
      athlete,
      athleteImg,
      host,
      hostRole,
      eventStartsAt,
      duration,
      onlineLink,
      price,
      rewardCoins,
      totalSeats,
      seatsBooked,
      agenda,
      inclusions,
      rules,
    } = body;

    // Required fields validation
    if (
      !title ||
      !description ||
      !type ||
      !athlete ||
      !host ||
      !eventStartsAt ||
      !duration ||
      price === undefined ||
      totalSeats === undefined
    ) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if ((type === "online" || type === "hybrid") && !onlineLink) {
      return NextResponse.json(
        { success: false, error: "Online link is required for online/hybrid experiences" },
        { status: 400 }
      );
    }

    const sb = Number(seatsBooked) || 0;
    const ts = Number(totalSeats) || 0;

    if (sb > ts) {
      return NextResponse.json(
        { success: false, error: "seatsBooked cannot be greater than totalSeats" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const priceInPaise = Number(price) * 100;

    const updatedExperience = {
      title,
      description,
      type,
      tag: tag || "",
      tagColor: tagColor || "",
      image: image || "",
      governanceState: governanceState || "pending review",
      status: status || "draft",
      athlete,
      athleteImg: athleteImg || "",
      host,
      hostRole: hostRole || "",
      eventStartsAt,
      duration,
      onlineLink: (type === "online" || type === "hybrid") ? (onlineLink || "") : "",
      price: Number(price),
      priceInPaise,
      rewardCoins: Number(rewardCoins) || 0,
      totalSeats: ts,
      seatsBooked: sb,
      agenda: Array.isArray(agenda) ? agenda : [],
      inclusions: Array.isArray(inclusions) ? inclusions : [],
      rules: Array.isArray(rules) ? rules : [],
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
          ...updatedExperience,
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`
        }
      }));
    } catch (dynErr) {
      console.warn("[AddExperience PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("storeProducts").doc(id).set(updatedExperience, { merge: true });
    } catch (fsErr) {
      console.warn("[AddExperience PUT] Firestore fallback update failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating experience:", error);
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
      console.warn("[AddExperience DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync/Fallback to Firestore
    try {
      await db.collection("storeProducts").doc(id).delete();
    } catch (fsErr) {
      console.warn("[AddExperience DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting experience:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
