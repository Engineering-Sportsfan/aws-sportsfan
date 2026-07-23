// app/api/roar/onboarding-config/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

type ConfigType = "sports" | "engagement" | "followEntities";
const VALID_TYPES: ConfigType[] = ["sports", "engagement", "followEntities"];

function collectionFor(type: ConfigType) {
  return db.collection("roarOnboardingConfig").doc(type).collection("items");
}

// This route only manages the option lists (sports, follow-entity sections,
// engagement options) used to populate onboarding/preferences fields. It is
// not tied to any individual user, so it deliberately has no auth checks —
// unlike api/roar/onboarding/route.ts, which handles a signed-in user's own
// selections and does require auth.

// ?type=sports|engagement|followEntities (required)
// ?all=true — admin form passes this to also see inactive items
export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") as ConfigType | null;
    const includeInactive = req.nextUrl.searchParams.get("all") === "true";

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "type must be one of sports|engagement|followEntities" }, { status: 400 });
    }

    let query: FirebaseFirestore.Query = collectionFor(type);
    if (!includeInactive) query = query.where("active", "==", true);
    query = query.orderBy("order", "asc");

    const snap = await query.get();
    const items = snap.docs.map((d) => d.data());

    return NextResponse.json({ success: true, type, items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, item } = body as { type: ConfigType; item: any };

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!item?.label) {
      return NextResponse.json({ error: "item.label is required" }, { status: 400 });
    }
    if (type === "followEntities" && (!item.sportId || !item.category)) {
      return NextResponse.json({ error: "followEntities requires sportId and category" }, { status: 400 });
    }

    const ref = collectionFor(type).doc();
    const now = Date.now();
    const data = {
      ...item,
      id: ref.id,
      order: typeof item.order === "number" ? item.order : now,
      active: item.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(data);

    return NextResponse.json({ success: true, item: data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id, updates } = body as { type: ConfigType; id: string; updates: any };

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const ref = collectionFor(type).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await ref.update({ ...updates, updatedAt: Date.now() });
    const updated = await ref.get();

    return NextResponse.json({ success: true, item: updated.data() });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") as ConfigType | null;
    const id = req.nextUrl.searchParams.get("id");

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await collectionFor(type).doc(id).delete();
    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/roar/onboarding-config error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}