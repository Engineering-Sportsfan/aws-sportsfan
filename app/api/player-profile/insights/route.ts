// app/api/player-profile/insights/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── POST: Create Insights & Strengths 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerProfilesId, insights, strengths } = body;

    if (!playerProfilesId) {
      return NextResponse.json(
        { success: false, message: "PlayerProfileId is required" },
        { status: 400 }
      );
    }

    const sanitizedInsights = (insights || []).map(
      (item: { title: string; description: string }) => ({
        title: item.title || "",
        description: item.description || "",
      })
    );

    const sanitizedStrengths = (strengths || []).filter(
      (s: unknown) => typeof s === "string" && s.trim().length > 0
    );

    const now = Date.now();
    const id = `insight_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const insightsData = {
      id,
      playerProfilesId,
      insights: sanitizedInsights,
      strengths: sanitizedStrengths,
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `PLAYER_INSIGHT#${id}`,
        sk: "INSIGHT#META",
        ...insightsData,
      },
      firestoreRef: db.collection("playerInsights").doc(id),
      firestoreData: insightsData,
    });

    return NextResponse.json({
      success: true,
      insightsDoc: insightsData,
    });
  } catch (error) {
    console.error("Create insights error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── GET: List Insights
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerProfileId = searchParams.get("playerProfileId");
    const limit = parseInt(searchParams.get("limit") || "20");

    let insightsDocs: any[] = [];

    // 1. Try DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :iPrefix)";
      const exprVals: Record<string, any> = {
        ":iPrefix": "PLAYER_INSIGHT#",
      };

      if (playerProfileId) {
        filterExpr += " AND (playerProfilesId = :ppId OR playerProfileId = :ppId)";
        exprVals[":ppId"] = playerProfileId;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        insightsDocs = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^PLAYER_INSIGHT#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[player-profile insights GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (insightsDocs.length === 0 && db) {
      let query: FirebaseFirestore.Query = db.collection("playerInsights");

      if (playerProfileId) {
        query = query.where("playerProfileId", "==", playerProfileId);
      }

      query = query.orderBy("createdAt", "desc").limit(limit);
      const snapshot = await query.get();

      insightsDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    insightsDocs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paged = insightsDocs.slice(0, limit);

    return NextResponse.json({
      success: true,
      insightsDocs: paged,
      pagination: {
        limit,
        hasMore: insightsDocs.length > limit,
      },
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