// app/api/athletes/[id]/route.ts
//
// GET    /api/athletes/[id]   -> profile (MS_Players, entityId=ATHLETE#<id>, sk=PROFILE#META)
//                                + all AFFIL#...#STATS rows (MS_Transactions)
//
// CORRECTED: confirmed via app/api/ms_players/route.ts (the list route) —
// it ONLY scans MS_Players and filters sk=PROFILE#META, nothing else.
// So athletics items with entityId="ATHLETE#<id>" actually live in the
// SAME MS_Players table as the cricket entityId="PLAYER#<id>" items —
// NOT in the original 6-master-table SportsData architecture as the
// handbook's routing matrix would suggest. This route was previously
// pointed at SportsData, which was wrong; do not repeat that mistake.
//
// Same Next.js 15 gotcha as ms_players/[id]/route.ts: `params` is a
// Promise and must be awaited, and the dynamic folder segment name
// must match the destructured key exactly. This folder is [id], so
// the destructure below MUST be `{ id }`.

import { NextRequest, NextResponse } from "next/server";
import { docClient as ddb } from "@/lib/dynamodb";
import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const MS_PLAYERS_TABLE = process.env.MS_PLAYERS_TABLE || "MS_Players";
const MS_TRANSACTIONS_TABLE = process.env.MS_TRANSACTIONS_TABLE || "MS_Transactions";

type RouteParams = { params: Promise<{ id: string }> };

// ---------- GET: profile + stats ----------

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const entityId = `ATHLETE#${id}`;

    const profileResult = await ddb.send(
      new GetCommand({
        TableName: MS_PLAYERS_TABLE,
        Key: { entityId, sk: "PROFILE#META" },
      })
    );

    if (!profileResult.Item) {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }

    // Same fetch pattern confirmed in ms_players/[id]/route.ts for
    // cricket: stats rows live in MS_TRANSACTIONS_TABLE under the SAME
    // entityId as the profile, sk begins_with "AFFIL#". Athletics rows
    // should follow the identical convention (entityId="ATHLETE#<id>"
    // instead of "PLAYER#<id>") unless proven otherwise.
    const statsResult = await ddb.send(
      new QueryCommand({
        TableName: MS_TRANSACTIONS_TABLE,
        KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":entityId": entityId,
          ":prefix": "AFFIL#",
        },
      })
    );

    return NextResponse.json({
      athlete: profileResult.Item,
      stats: statsResult.Items || [],
    });
  } catch (error) {
    console.error("GET /api/athletes/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch athlete" },
      { status: 500 }
    );
  }
}

// ---------- PUT: partial update ----------

const UPDATABLE_FIELDS = [
  "name",
  "bio",
  "coachName",
  "gender",
  "heightCm",
  "weightKg",
  "profileImage",
  "welcomeVideoUrl",
  "country",
  "flag",
  "birthPlace",
  "dateOfBirth",
  "firstOlympicGames",
  "nationality",
];

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const entityId = `ATHLETE#${id}`;
    const body = await request.json();

    const updates = Object.entries(body).filter(([key]) =>
      UPDATABLE_FIELDS.includes(key)
    );

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const setClauses: string[] = ["#updatedAt = :updatedAt"];
    const expressionValues: Record<string, unknown> = {
      ":updatedAt": new Date().toISOString(),
    };
    const expressionNames: Record<string, string> = { "#updatedAt": "updatedAt" };

    updates.forEach(([key, value], i) => {
      const nameKey = `#f${i}`;
      const valueKey = `:v${i}`;
      setClauses.push(`${nameKey} = ${valueKey}`);
      expressionNames[nameKey] = key;
      expressionValues[valueKey] = value;
    });

    const result = await ddb.send(
      new UpdateCommand({
        TableName: MS_PLAYERS_TABLE,
        Key: { entityId, sk: "PROFILE#META" },
        UpdateExpression: `SET ${setClauses.join(", ")}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
        ConditionExpression: "attribute_exists(entityId)",
        ReturnValues: "ALL_NEW",
      })
    );

    return NextResponse.json({ athlete: result.Attributes });
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Athlete not found" }, { status: 404 });
    }
    console.error("PUT /api/athletes/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to update athlete" },
      { status: 500 }
    );
  }
}

// ---------- DELETE ----------

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const entityId = `ATHLETE#${id}`;

    const statsResult = await ddb.send(
      new QueryCommand({
        TableName: MS_TRANSACTIONS_TABLE,
        KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":entityId": entityId,
          ":prefix": "AFFIL#",
        },
      })
    );

    await Promise.all(
      (statsResult.Items || []).map((item: Record<string, unknown>) =>
        ddb.send(
          new DeleteCommand({
            TableName: MS_TRANSACTIONS_TABLE,
            Key: { entityId: item.entityId, sk: item.sk },
          })
        )
      )
    );

    await ddb.send(
      new DeleteCommand({
        TableName: MS_PLAYERS_TABLE,
        Key: { entityId, sk: "PROFILE#META" },
      })
    );

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("DELETE /api/athletes/[id] failed:", error);
    return NextResponse.json(
      { error: "Failed to delete athlete" },
      { status: 500 }
    );
  }
}