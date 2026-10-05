// app/api/admin/channels/[id]/route.ts — Edit & Delete Channel
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── PUT /api/admin/channels/[id] — Update a channel ────────────────────────
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ success: false, error: "Channel name is required" }, { status: 400 });
    }

    const now = Date.now();
    const updatedItem = {
      id,
      name,
      updatedAt: now,
    };

    // 1. Update in DynamoDB SocialAndContent table
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: "CONFIG#CHANNELS",
            sk: `CHANNEL#${id}`,
            entityId: `CHANNEL#${id}`,
            ...updatedItem,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Channels PUT] DynamoDB update notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("channels")).doc(id).set(updatedItem, { merge: true });
      } catch (fsErr) {
        console.warn("[Channels PUT] Firestore update notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, channel: updatedItem });
  } catch (error) {
    console.error("[PUT /api/admin/channels/[id]] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update channel" }, { status: 500 });
  }
}

// ─── DELETE /api/admin/channels/[id] — Delete a channel ─────────────────────
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // 1. Delete from DynamoDB SocialAndContent table
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: "CONFIG#CHANNELS", sk: `CHANNEL#${id}` },
        })
      );
    } catch (dynErr) {
      console.warn("[Channels DELETE] DynamoDB delete notice:", dynErr);
    }

    // 2. Delete from Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("channels")).doc(id).delete();
      } catch (fsErr) {
        console.warn("[Channels DELETE] Firestore delete notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, message: `Channel '${id}' deleted successfully` });
  } catch (error) {
    console.error("[DELETE /api/admin/channels/[id]] error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete channel" }, { status: 500 });
  }
}
