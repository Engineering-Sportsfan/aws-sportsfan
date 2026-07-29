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

    const snapshot = await db.collection("storeProducts").where("category", "==", "experiences").get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ success: true, data });
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
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("storeProducts").add(newExperience);

    return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
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

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

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
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.update(updatedExperience);

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

    const docRef = db.collection("storeProducts").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await docRef.delete();
    
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting experience:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
