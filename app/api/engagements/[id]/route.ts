// app/api/engagements/[id]/route.ts — Single Engagement GET, PUT/PATCH, DELETE
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementItem } from "@/types/engagements";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id] ────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    let item: any = null;

    // Try DynamoDB first
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) {
        item = getRes.Item;
      }
    } catch (dynErr: any) {
      console.warn("DynamoDB get engagement notice:", dynErr?.message || dynErr);
    }

    // Fallback to Firestore
    if (!item) {
      const snap = await db.collection("engagements").doc(id).get();
      if (snap.exists) {
        item = { id: snap.id, ...snap.data() };
      }
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, engagement: item });
  } catch (error: unknown) {
    console.error("GET /api/engagements/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/engagements/[id] — Update engagement ────────────────────────────
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Fetch existing
    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing) {
      const snap = await db.collection("engagements").doc(id).get();
      if (snap.exists) existing = { id: snap.id, ...snap.data() };
    }

    if (!existing) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const updatedItem: EngagementItem = {
      ...existing,
      ...body,
      id,
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${(updatedItem.type || existing.type).toUpperCase()}`,
      ...updatedItem,
    };

    await dualWrite("engagements", id, "SocialAndContent", dynamoItem);

    return NextResponse.json({
      success: true,
      message: "Engagement updated successfully",
      engagement: updatedItem,
    });
  } catch (error: unknown) {
    console.error("PUT /api/engagements/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to update engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/engagements/[id] — Delete engagement ─────────────────────────
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
    } catch (dynErr: any) {
      console.warn("DynamoDB delete engagement notice:", dynErr?.message || dynErr);
    }

    // Delete from Firestore
    try {
      await db.collection("engagements").doc(id).delete();
    } catch (fbErr: any) {
      console.warn("Firestore delete engagement notice:", fbErr?.message || fbErr);
    }

    return NextResponse.json({ success: true, message: "Engagement deleted successfully" });
  } catch (error: unknown) {
    console.error("DELETE /api/engagements/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
