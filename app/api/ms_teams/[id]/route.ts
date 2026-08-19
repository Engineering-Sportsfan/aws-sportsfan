// app/api/teams/[teamId]/route.ts — single team, backed by MS_Clubs + MS_Transactions
// GET    -> team profile + every stint/record/analytics row under it (mirrors the
//           docx "one query by entityId pulls everything" fetch flow)
// PUT    -> update team profile fields (partial update)
// DELETE -> delete the team's MS_Clubs row + all its MS_Transactions rows
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const CLUBS_TABLE = "MS_Clubs";
const TRANSACTIONS_TABLE = "MS_Transactions";

function clubEntityId(teamId: string) {
  return teamId.startsWith("CLUB#") ? teamId : `CLUB#${teamId}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const entityId = clubEntityId(teamId);

    const [profileRes, stintsRes] = await Promise.all([
      docClient.send(
        new GetCommand({
          TableName: CLUBS_TABLE,
          Key: { entityId, sk: "CLUB#META" },
        })
      ),
      docClient.send(
        new QueryCommand({
          TableName: TRANSACTIONS_TABLE,
          KeyConditionExpression: "entityId = :e",
          ExpressionAttributeValues: { ":e": entityId },
        })
      ),
    ]);

    if (!profileRes.Item) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const stats = stintsRes.Items?.find((i) => (i.sk as string)?.endsWith("#STATS"));

    return NextResponse.json(
      {
        success: true,
        team: profileRes.Item,
        record_highlight: stats?.record ?? null,
        analytics: stats?.analytics ?? null,
        stints: stintsRes.Items ?? [],
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/teams/[teamId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const entityId = clubEntityId(teamId);
    const body = await req.json();

    // Only allow updating known profile fields — never entityId/sk.
    const updatable = [
      "clubName",
      "clubType",
      "country",
      "flag",
      "shortName",
      "captain",
      "viceCaptain",
      "headCoach",
      "homeGround",
      "founded",
      "logoUrl",
      "teamPhotoUrl",
      "bio",
      "sportId",
      "levelFormatId",
    ];

    const updates = Object.entries(body).filter(([k]) => updatable.includes(k));
    if (updates.length === 0) {
      return NextResponse.json(
        { error: `No updatable fields provided. Allowed: ${updatable.join(", ")}` },
        { status: 400 }
      );
    }

    const setParts: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};

    updates.forEach(([key, value], i) => {
      const nameKey = `#f${i}`;
      const valueKey = `:v${i}`;
      setParts.push(`${nameKey} = ${valueKey}`);
      names[nameKey] = key;
      values[valueKey] = value;
    });
    setParts.push("#updatedAt = :updatedAt");
    names["#updatedAt"] = "updatedAt";
    values[":updatedAt"] = new Date().toISOString();

    const res = await docClient.send(
      new UpdateCommand({
        TableName: CLUBS_TABLE,
        Key: { entityId, sk: "CLUB#META" },
        UpdateExpression: `SET ${setParts.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(entityId)",
        ReturnValues: "ALL_NEW",
      })
    );

    return NextResponse.json({ success: true, team: res.Attributes });
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/teams/[teamId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const entityId = clubEntityId(teamId);

    // Delete the profile row
    await docClient.send(
      new DeleteCommand({
        TableName: CLUBS_TABLE,
        Key: { entityId, sk: "CLUB#META" },
      })
    );

    // Delete every stint/record/analytics row under the same entityId
    const stints = await docClient.send(
      new QueryCommand({
        TableName: TRANSACTIONS_TABLE,
        KeyConditionExpression: "entityId = :e",
        ExpressionAttributeValues: { ":e": entityId },
      })
    );

    const items = stints.Items ?? [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [TRANSACTIONS_TABLE]: chunk.map((item) => ({
              DeleteRequest: { Key: { entityId: item.entityId, sk: item.sk } },
            })),
          },
        })
      );
    }

    return NextResponse.json({ success: true, deletedStints: items.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/teams/[teamId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}