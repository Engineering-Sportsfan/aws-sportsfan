// app/api/player-profile/insights/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

export async function GET(req: NextRequest) {
  try {
    const playerProfilesId = getIdFromUrl(req);

    if (!playerProfilesId) {
      return NextResponse.json(
        { success: false, message: "playerProfilesId required" },
        { status: 400 }
      );
    }

    let insightsDoc: any = null;

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :iPrefix) AND (playerProfilesId = :ppId OR playerProfileId = :ppId OR id = :ppId)",
          ExpressionAttributeValues: {
            ":iPrefix": "PLAYER_INSIGHT#",
            ":ppId": playerProfilesId,
          },
          Limit: 1,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        insightsDoc = {
          id: scanRes.Items[0].id || (scanRes.Items[0].entityId as string).replace(/^PLAYER_INSIGHT#/, ""),
          ...scanRes.Items[0],
        };
      }
    } catch (e) {
      console.warn("[player-profile insights [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!insightsDoc && db) {
      const snapshot = await db
        .collection("playerInsights")
        .where("playerProfilesId", "==", playerProfilesId)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        insightsDoc = { id: doc.id, ...doc.data() };
      } else {
        const docById = await db.collection("playerInsights").doc(playerProfilesId).get();
        if (docById.exists) {
          insightsDoc = { id: docById.id, ...docById.data() };
        }
      }
    }

    if (!insightsDoc) {
      return NextResponse.json(
        { success: false, message: "Insights doc not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      insightsDoc,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "Fetch failed: " + (error as Error).message,
      },
      { status: 500 }
    );
  }
}

// ─── PUT: Update Insights & Strengths 
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const body = await req.json();
    const { insights, strengths } = body;

    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `PLAYER_INSIGHT#${id}`, sk: "INSIGHT#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing && db) {
      const doc = await db.collection("playerInsights").doc(id).get();
      if (doc.exists) existing = doc.data();
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Insights doc not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    if (insights !== undefined) {
      updateData.insights = (insights || []).map(
        (item: { title: string; description: string }) => ({
          title: item.title || "",
          description: item.description || "",
        })
      );
    }

    if (strengths !== undefined) {
      updateData.strengths = (strengths || []).filter(
        (s: unknown) => typeof s === "string" && s.trim().length > 0
      );
    }

    const updatedDoc = {
      ...existing,
      ...updateData,
      id,
    };

    // Dual-write
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `PLAYER_INSIGHT#${id}`,
        sk: "INSIGHT#META",
        ...updatedDoc,
      },
      firestoreRef: db.collection("playerInsights").doc(id),
      firestoreData: updateData,
    });

    return NextResponse.json({
      success: true,
      insightsDoc: updatedDoc,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete Insights Doc 
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "SportsData",
          Key: { entityId: `PLAYER_INSIGHT#${id}`, sk: "INSIGHT#META" },
        })
      );
    } catch (e) {
      console.warn("[player-profile insights [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const docRef = db.collection("playerInsights").doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.delete();
      }
    }

    return NextResponse.json({
      success: true,
      message: "Insights doc deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}