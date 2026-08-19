// api/admin/store/addCoach/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface Slot {
  date: string;
  day: string;
  time: string;
  num: number;
  status: string;
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    
    if (id) {
      let coachData: any = null;
      let fetchedFromDynamo = false;
      let slots: any[] = [];

      // 1. Try DynamoDB first
      try {
        const getRes = await docClient.send(new GetCommand({
          TableName: "StoreAndCommerce",
          Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
        }));
        if (getRes.Item) {
          coachData = { id, ...getRes.Item };
          
          // Get slots
          const qRes = await docClient.send(new QueryCommand({
            TableName: "StoreAndCommerce",
            KeyConditionExpression: "entityId = :pk AND begins_with(sk, :sk)",
            ExpressionAttributeValues: { ":pk": `PRODUCT#${id}`, ":sk": "SLOT#" }
          }));
          slots = qRes.Items || [];
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AddCoach GET] DynamoDB query failed, trying Firestore:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        try {
          const doc = await db.collection("storeProducts").doc(id).get();
          if (doc.exists) {
            coachData = { id: doc.id, ...doc.data() };
            const slotsSnap = await db.collection("storeProducts").doc(id).collection("slots").get();
            slots = slotsSnap.docs.map(slotDoc => slotDoc.data());
          }
        } catch (fsErr) {
          console.error("[AddCoach GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!coachData) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      
      return NextResponse.json({ success: true, data: { ...coachData, slots } });
    }

    let list: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "StoreAndCommerce",
        FilterExpression: "begins_with(entityId, :p) AND category = :cat",
        ExpressionAttributeValues: { ":p": "PRODUCT#", ":cat": "coaches" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        list = scanRes.Items.map(item => ({
          id: (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AddCoach GET list] DynamoDB scan failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || list.length === 0) {
      try {
        const snapshot = await db.collection("storeProducts").where("category", "==", "coaches").get();
        list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fsErr) {
        console.error("[AddCoach GET list] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching coach(es):", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      coachId,
      name,
      title,
      role,
      tagline,
      about,
      category = "coaches",
      experience,
      image,
      pricePaise,
      rating,
      reviews,
      rewardCoins,
      nextSlot,
      verified,
      governance_state,
      sourcing_model,
      achievements,
      certifications,
      specializations,
      services,
      reviewList,
      slots = [],
    } = body;

    if (!coachId || !name || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (coachId, name, title)" },
        { status: 400 }
      );
    }

    // Check if exists in DynamoDB
    let coachExists = false;
    try {
      const getRes = await docClient.send(new GetCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${coachId}`, sk: `PRODUCT#${coachId}` }
      }));
      if (getRes.Item) coachExists = true;
    } catch (e) {}

    if (!coachExists) {
      const docSnap = await db.collection("storeProducts").doc(coachId).get();
      if (docSnap.exists) coachExists = true;
    }

    if (coachExists) {
      return NextResponse.json(
        { success: false, error: "Coach with this coachId already exists" },
        { status: 409 }
      );
    }

    const now = Date.now();
    const newCoach = {
      coachId,
      name,
      title,
      role,
      tagline,
      about,
      category,
      experience,
      image,
      pricePaise: Number(pricePaise) || 0,
      rating: Number(rating) || 0,
      reviews: Number(reviews) || 0,
      rewardCoins: Number(rewardCoins) || 0,
      nextSlot,
      verified: Boolean(verified),
      governance_state,
      sourcing_model,
      achievements: achievements || [],
      certifications: certifications || [],
      specializations: specializations || [],
      services: services || [],
      reviewList: reviewList || [],
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "StoreAndCommerce",
        Item: {
          entityId: `PRODUCT#${coachId}`,
          sk: `PRODUCT#${coachId}`,
          ...newCoach
        }
      }));

      // Write slots to DynamoDB
      if (slots && slots.length > 0) {
        for (let i = 0; i < slots.length; i++) {
          const slot: Slot = slots[i];
          const slotNumStr = String(i + 1).padStart(3, '0');
          const slotId = `slot_${slotNumStr}`;
          await docClient.send(new PutCommand({
            TableName: "StoreAndCommerce",
            Item: {
              entityId: `PRODUCT#${coachId}`,
              sk: `SLOT#${slotId}`,
              id: slotId,
              date: slot.date,
              day: slot.day,
              time: slot.time,
              num: Number(slot.num) || 0,
              status: slot.status || "available",
              bookedBy: null,
              lockedBy: null,
              lockExpiresAt: null,
              orderId: null,
              createdAt: now,
              updatedAt: now
            }
          })).catch(() => {});
        }
      }
    } catch (dynErr) {
      console.warn("[AddCoach POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("storeProducts").doc(coachId);
      await docRef.set(newCoach);
      if (slots && slots.length > 0) {
        const batch = db.batch();
        slots.forEach((slot: Slot, index: number) => {
          const slotNumStr = String(index + 1).padStart(3, '0');
          const slotId = `slot_${slotNumStr}`;
          const slotRef = docRef.collection("slots").doc(slotId);
          batch.set(slotRef, {
            date: slot.date,
            day: slot.day,
            time: slot.time,
            num: Number(slot.num) || 0,
            status: slot.status || "available",
            bookedBy: null,
            lockedBy: null,
            lockExpiresAt: null,
            orderId: null,
            createdAt: now,
            updatedAt: now,
          });
        });
        await batch.commit();
      }
    } catch (fsErr) {
      console.warn("[AddCoach POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id: coachId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding coach:", error);
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
      coachId,
      name,
      title,
      role,
      tagline,
      about,
      category = "coaches",
      experience,
      image,
      pricePaise,
      rating,
      reviews,
      rewardCoins,
      nextSlot,
      verified,
      governance_state,
      sourcing_model,
      achievements,
      certifications,
      specializations,
      services,
      reviewList,
      slots = [],
    } = body;

    if (!name || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, title)" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const updatedCoach = {
      name,
      title,
      role,
      tagline,
      about,
      category,
      experience,
      image,
      pricePaise: Number(pricePaise) || 0,
      rating: Number(rating) || 0,
      reviews: Number(reviews) || 0,
      rewardCoins: Number(rewardCoins) || 0,
      nextSlot,
      verified: Boolean(verified),
      governance_state,
      sourcing_model,
      achievements: achievements || [],
      certifications: certifications || [],
      specializations: specializations || [],
      services: services || [],
      reviewList: reviewList || [],
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
          ...updatedCoach,
          entityId: `PRODUCT#${id}`,
          sk: `PRODUCT#${id}`
        }
      }));

      // Delete old slots
      const qRes = await docClient.send(new QueryCommand({
        TableName: "StoreAndCommerce",
        KeyConditionExpression: "entityId = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": `PRODUCT#${id}`, ":sk": "SLOT#" }
      }));
      if (qRes.Items) {
        for (const item of qRes.Items) {
          await docClient.send(new DeleteCommand({
            TableName: "StoreAndCommerce",
            Key: { entityId: item.entityId, sk: item.sk }
          })).catch(() => {});
        }
      }

      // Write new slots
      if (slots && slots.length > 0) {
        for (let i = 0; i < slots.length; i++) {
          const slot: Slot = slots[i];
          const slotNumStr = String(i + 1).padStart(3, '0');
          const slotId = `slot_${slotNumStr}`;
          await docClient.send(new PutCommand({
            TableName: "StoreAndCommerce",
            Item: {
              entityId: `PRODUCT#${id}`,
              sk: `SLOT#${slotId}`,
              id: slotId,
              date: slot.date,
              day: slot.day,
              time: slot.time,
              num: Number(slot.num) || 0,
              status: slot.status || "available",
              bookedBy: null,
              lockedBy: null,
              lockExpiresAt: null,
              orderId: null,
              createdAt: now,
              updatedAt: now
            }
          })).catch(() => {});
        }
      }
    } catch (dynErr) {
      console.warn("[AddCoach PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("storeProducts").doc(id);
      await docRef.set(updatedCoach, { merge: true });

      const slotsRef = docRef.collection("slots");
      const oldSlots = await slotsRef.get();
      if (!oldSlots.empty) {
        const deleteBatch = db.batch();
        oldSlots.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();
      }

      if (slots && slots.length > 0) {
        const insertBatch = db.batch();
        slots.forEach((slot: Slot, index: number) => {
          const slotNumStr = String(index + 1).padStart(3, '0');
          const slotId = `slot_${slotNumStr}`;
          const slotRef = docRef.collection("slots").doc(slotId);
          insertBatch.set(slotRef, {
            date: slot.date,
            day: slot.day,
            time: slot.time,
            num: Number(slot.num) || 0,
            status: slot.status || "available",
            bookedBy: null,
            lockedBy: null,
            lockExpiresAt: null,
            orderId: null,
            createdAt: now,
            updatedAt: now,
          });
        });
        await insertBatch.commit();
      }
    } catch (fsErr) {
      console.warn("[AddCoach PUT] Firestore fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating coach:", error);
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
      // Delete slots
      const qRes = await docClient.send(new QueryCommand({
        TableName: "StoreAndCommerce",
        KeyConditionExpression: "entityId = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": `PRODUCT#${id}`, ":sk": "SLOT#" }
      }));
      if (qRes.Items) {
        for (const item of qRes.Items) {
          await docClient.send(new DeleteCommand({
            TableName: "StoreAndCommerce",
            Key: { entityId: item.entityId, sk: item.sk }
          })).catch(() => {});
        }
      }

      // Delete coach
      await docClient.send(new DeleteCommand({
        TableName: "StoreAndCommerce",
        Key: { entityId: `PRODUCT#${id}`, sk: `PRODUCT#${id}` }
      }));
    } catch (dynErr) {
      console.warn("[AddCoach DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("storeProducts").doc(id);
      const slotsRef = docRef.collection("slots");
      const oldSlots = await slotsRef.get();
      if (!oldSlots.empty) {
        const deleteBatch = db.batch();
        oldSlots.forEach(doc => deleteBatch.delete(doc.ref));
        await deleteBatch.commit();
      }
      await docRef.delete();
    } catch (fsErr) {
      console.warn("[AddCoach DELETE] Firestore fallback delete failed:", fsErr);
    }
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting coach:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
