// \api\roar\rooms\[roomId]\channels\route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import type { Channel } from "@/app/models/Channel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const snapshot = await db
      .collection("roarRooms")
      .doc(roomId)
      .collection("channels")
      .where("isActive", "==", true)
      .orderBy("order", "asc")
      .get();

    const channels: Channel[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as Channel),
      channelId: doc.id,
    }));

    return NextResponse.json({ success: true, channels });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const roomSnap = await db.collection("roarRooms").doc(roomId).get();
    if (!roomSnap.exists) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, slug, icon, order, isActive } = body;

    if (!name?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }

    const normalizedSlug = slug.trim().toLowerCase().replace(/\s+/g, "-");
    const channelsRef = db.collection("roarRooms").doc(roomId).collection("channels");

    const existing = await channelsRef.where("slug", "==", normalizedSlug).limit(1).get();
    if (!existing.empty) {
      return NextResponse.json({ error: "A channel with this slug already exists" }, { status: 409 });
    }

    const ref = channelsRef.doc();
    const channel: Channel = {
      channelId: ref.id,
      roomId,
      name: name.trim(),
      slug: normalizedSlug,
      icon: icon || "",
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: Number.isFinite(order) ? Number(order) : 0,
      createdAt: Date.now(),
    };

    await ref.set(channel);
    return NextResponse.json({ success: true, channel });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}