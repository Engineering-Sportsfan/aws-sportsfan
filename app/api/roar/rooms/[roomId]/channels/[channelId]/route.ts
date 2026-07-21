// \api\roar\rooms\[roomId]\channels\[channelId]\route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; channelId: string }> }
) {
  try {
    const { roomId, channelId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, icon, order, isActive } = body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (icon !== undefined) updates.icon = icon;
    if (order !== undefined) updates.order = Number(order);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    await db.collection("roarRooms").doc(roomId).collection("channels").doc(channelId).update(updates);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// export async function DELETE(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string; channelId: string }> }
// ) {
//   try {
//     const { roomId, channelId } = await params;
//     const user = await getUser(req);
//     if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//     // Soft delete — keeps old messages' channelId/channelSlug meaningful.
//     await db.collection("roarRooms").doc(roomId).collection("channels").doc(channelId).update({ isActive: false });
//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; channelId: string }> }
) {
  try {
    const { roomId, channelId } = await params;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const hard = req.nextUrl.searchParams.get("hard") === "true";
    const channelRef = db.collection("roarRooms").doc(roomId).collection("channels").doc(channelId);

    if (hard) {
      // True delete — doc is gone. Old messages referencing this channelId
      // will no longer resolve to a channel doc; handle that in the UI
      // (e.g. render channelSlug as plain text, skip the lookup).
      await channelRef.delete();
    } else {
      // Soft delete / deactivate — keeps old messages' channelId/channelSlug meaningful.
      await channelRef.update({ isActive: false });
    }

    return NextResponse.json({ success: true, hard });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}