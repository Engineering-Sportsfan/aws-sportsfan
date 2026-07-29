import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

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

    const snapshot = await db.collection("storeProducts").where("category", "==", "events").get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ success: true, data });
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("storeProducts").add(newEvent);

    return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
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

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

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
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.update(updatedEvent);

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

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await docRef.delete();
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting event:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
