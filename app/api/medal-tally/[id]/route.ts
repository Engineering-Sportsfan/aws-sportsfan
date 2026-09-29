import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { TABLES, getFirestoreCollection, getEnv } from "@/lib/tableNames";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { formatISTTimestamp, MedalTallyData } from "@/lib/medalTallyService";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

/**
 * GET /api/medal-tally/[id]
 * Fetch a specific medal tally item by its ID from the active environment table.
 */
export async function GET(req: NextRequest, context: Params) {
  try {
    const rawParams = await context.params;
    const id = rawParams?.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing required tally ID" },
        { status: 400 }
      );
    }

    const currentTable = TABLES.SportsData;
    const candidateTables = getCandidateTableNames(currentTable);

    for (const table of candidateTables) {
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: table,
            Key: {
              entityId: "MEDAL_TALLY#CURRENT",
              sk: id === "current" || id === "medal_tally_current" ? "MEDAL_TALLY#META" : id,
            },
          })
        );

        if (res.Item) {
          return NextResponse.json({
            success: true,
            env: getEnv(),
            tableName: table,
            item: res.Item,
          });
        }
      } catch (err: any) {
        console.warn(`[GET /api/medal-tally/:id] DynamoDB read notice on "${table}":`, err?.message || err);
      }
    }

    return NextResponse.json(
      { success: false, error: `Medal tally item with ID "${id}" not found in [${currentTable}]` },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("[GET /api/medal-tally/:id] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch medal tally item" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/medal-tally/[id]
 * Updates a specific medal tally item by ID via dualWrite in the active environment table.
 */
export async function PUT(req: NextRequest, context: Params) {
  try {
    const rawParams = await context.params;
    const id = rawParams?.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing required tally ID" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const currentTable = TABLES.SportsData;
    const currentEnv = getEnv();

    const gold = Math.max(0, Number(body.gold) || 0);
    const silver = Math.max(0, Number(body.silver) || 0);
    const bronze = Math.max(0, Number(body.bronze) || 0);
    const total = gold + silver + bronze;
    const events = Math.max(0, Number(body.events) || 0);
    const now = Date.now();

    const record: MedalTallyData = {
      id,
      country: (body.country || "India").trim(),
      countryCode: (body.countryCode || "IN").trim().toUpperCase(),
      flag: body.flag || "🇮🇳",
      flagUrl: body.flagUrl || "https://flagcdn.com/w80/in.png",
      label: (body.label || "INDIA TODAY").trim().toUpperCase(),
      events,
      eventsLabel: body.eventsLabel || `${events} Events`,
      gold,
      silver,
      bronze,
      total,
      worldRank: body.worldRank !== undefined && body.worldRank !== null && body.worldRank !== "" ? body.worldRank : 3,
      rankLabel: body.rankLabel || "India Rank",
      competition: body.competition || "Asian Games",
      active: body.active !== false,
      env: currentEnv,
      tableName: currentTable,
      updatedAt: now,
      updatedAtIST: formatISTTimestamp(now),
      updatedBy: body.adminEmail || "Admin",
    };

    const dynamoItem = {
      entityId: "MEDAL_TALLY#CURRENT",
      sk: id === "current" || id === "medal_tally_current" ? "MEDAL_TALLY#META" : id,
      type: "medal_tally",
      ...record,
    };

    // Dual write to DynamoDB active table + Firestore
    await dualWrite("medal_tally", id, currentTable, dynamoItem);

    return NextResponse.json({
      success: true,
      message: `Medal tally item [${id}] updated in ${currentTable} (${currentEnv})`,
      env: currentEnv,
      tableName: currentTable,
      data: record,
    });
  } catch (error: any) {
    console.error("[PUT /api/medal-tally/:id] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to update medal tally item" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/medal-tally/[id]
 * Deletes a medal tally item by ID via dualDelete.
 */
export async function DELETE(req: NextRequest, context: Params) {
  try {
    const rawParams = await context.params;
    const id = rawParams?.id;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing required tally ID" },
        { status: 400 }
      );
    }

    const currentTable = TABLES.SportsData;

    await dualDelete(
      "medal_tally",
      id,
      currentTable,
      {
        entityId: "MEDAL_TALLY#CURRENT",
        sk: id === "current" || id === "medal_tally_current" ? "MEDAL_TALLY#META" : id,
      }
    );

    return NextResponse.json({
      success: true,
      message: `Medal tally item [${id}] deleted from ${currentTable}`,
      env: getEnv(),
      tableName: currentTable,
    });
  } catch (error: any) {
    console.error("[DELETE /api/medal-tally/:id] Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to delete medal tally item" },
      { status: 500 }
    );
  }
}
