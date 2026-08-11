// app/api/club-profile/insights/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

// ─── GET: Single Insights Doc ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `CLUB_INSIGHT#${id}`,
            sk: "INSIGHT#META",
          },
        })
      );
      if (getRes.Item) {
        const item = getRes.Item;
        return NextResponse.json({
          success: true,
          insightsDoc: {
            id: item.id || id,
            ...item,
          },
        });
      }
    } catch (e) {
      console.warn("[club-profile insights [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const doc = await db.collection("clubInsights").doc(id).get();
      if (doc.exists) {
        return NextResponse.json({
          success: true,
          insightsDoc: { id: doc.id, ...doc.data() },
        });
      }
    }

    return NextResponse.json(
      { success: false, message: "Insights doc not found" },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Fetch failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── PUT: Update Insights & Strengths ────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const body = await req.json();
    const { insights, strengths } = body;

    let existingData: Record<string, unknown> = {};

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: {
            entityId: `CLUB_INSIGHT#${id}`,
            sk: "INSIGHT#META",
          },
        })
      );
      if (getRes.Item) {
        existingData = getRes.Item as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[club-profile insights [id] PUT] DynamoDB check:", e);
    }

    if (Object.keys(existingData).length === 0 && db) {
      const existing = await db.collection("clubInsights").doc(id).get();
      if (existing.exists) {
        existingData = existing.data() as Record<string, unknown>;
      }
    }

    const updateData: Record<string, unknown> = {
      ...existingData,
      id,
      updatedAt: Date.now(),
    };

    if (insights !== undefined) {
      updateData.insights = insights.map(
        (item: { title: string; description: string }) => ({
          title: item.title || "",
          description: item.description || "",
        })
      );
    }

    if (strengths !== undefined) {
      updateData.strengths = strengths.filter(
        (s: unknown) => typeof s === "string" && (s as string).trim().length > 0
      );
    }

    const dynamoItem = {
      entityId: `CLUB_INSIGHT#${id}`,
      sk: "INSIGHT#META",
      ...updateData,
    };

    await dualWrite("clubInsights", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      insightsDoc: { id, ...updateData },
    });
  } catch (error) {
    console.error("Update insights error:", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE: Remove Insights Doc ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await dualDelete("clubInsights", id, "SportsData", {
      entityId: `CLUB_INSIGHT#${id}`,
      sk: "INSIGHT#META",
    });

    return NextResponse.json({ success: true, message: "Insights doc deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}