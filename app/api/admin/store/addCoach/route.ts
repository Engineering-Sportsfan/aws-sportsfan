import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

interface Slot {
  date: string;
  day: string;
  time: string;
  num: number;
  status: string;
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

    const docRef = db.collection("storeProducts").doc(coachId);
    
    // Check if exists
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return NextResponse.json(
        { success: false, error: "Coach with this coachId already exists" },
        { status: 409 }
      );
    }

    // Write main doc
    await docRef.set({
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Write slots subcollection
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
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    return NextResponse.json({ success: true, id: coachId }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding coach:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
