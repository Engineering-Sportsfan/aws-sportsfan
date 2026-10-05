// app/api/admin/sports/[id]/route.ts — Edit & Delete Sport
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { DeleteCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── PUT /api/admin/sports/[id] — Update a sport ────────────────────────────
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ success: false, error: "Sport name is required" }, { status: 400 });
    }

    const now = Date.now();
    const updatedItem = {
      id,
      name,
      updatedAt: now,
    };

    // 1. Update in DynamoDB MS_Sports
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.MS_Sports,
          Item: {
            entityId: `SPORT#${id}`,
            sk: "SPORT#META",
            ...updatedItem,
          },
        })
      );
    } catch (dynErr) {
      console.warn("[Sports PUT] DynamoDB update notice:", dynErr);
    }

    // 2. Dual-write to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("sports")).doc(id).set(updatedItem, { merge: true });
      } catch (fsErr) {
        console.warn("[Sports PUT] Firestore update notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, sport: updatedItem });
  } catch (error) {
    console.error("[PUT /api/admin/sports/[id]] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update sport" }, { status: 500 });
  }
}

// ─── DELETE /api/admin/sports/[id] — Delete a sport ─────────────────────────
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // 1. Delete from DynamoDB MS_Sports
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.MS_Sports,
          Key: { entityId: `SPORT#${id}`, sk: "SPORT#META" },
        })
      );
    } catch (dynErr) {
      console.warn("[Sports DELETE] DynamoDB delete notice:", dynErr);
    }

    // 2. Delete from Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("sports")).doc(id).delete();
      } catch (fsErr) {
        console.warn("[Sports DELETE] Firestore delete notice:", fsErr);
      }
    }

    return NextResponse.json({ success: true, message: `Sport '${id}' deleted successfully` });
  } catch (error) {
    console.error("[DELETE /api/admin/sports/[id]] error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete sport" }, { status: 500 });
  }
}
