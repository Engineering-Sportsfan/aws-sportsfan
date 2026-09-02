// app/api/ms_teams/route.ts — MS_Clubs (Nations/Clubs master table)
// GET  -> list teams (optionally filtered by sportId / country)
// POST -> create a new team/club profile
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const CLUBS_TABLE = TABLES.MS_Clubs;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sportId = searchParams.get("sportId");
    const country = searchParams.get("country");

    // MS_Clubs is small (one row per team/club) — a filtered scan is fine here.
    // Swap for a GSI query (e.g. sportId-index) if this table grows large.
    const filterParts: string[] = ["sk = :sk"];
    const values: Record<string, unknown> = { ":sk": "CLUB#META" };

    if (sportId) {
      filterParts.push("sportId = :sportId");
      values[":sportId"] = sportId;
    }
    if (country) {
      filterParts.push("country = :country");
      values[":country"] = country;
    }

    const res = await docClient.send(
      new ScanCommand({
        TableName: CLUBS_TABLE,
        FilterExpression: filterParts.join(" AND "),
        ExpressionAttributeValues: values,
      })
    );

    return NextResponse.json(
      { success: true, teams: res.Items ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/teams error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { team_id, sportId, levelFormatId, coreInfo } = body;

    if (!team_id || !coreInfo?.teamName || !coreInfo?.country) {
      return NextResponse.json(
        { error: "team_id, coreInfo.teamName and coreInfo.country are required" },
        { status: 400 }
      );
    }

    const entityId = `CLUB#${team_id}`;

    const item = {
      entityId,
      sk: "CLUB#META",
      clubName: coreInfo.teamName,
      clubType: coreInfo.clubType ?? "National Team",
      country: coreInfo.country,
      flag: coreInfo.flag,
      shortName: coreInfo.shortName,
      captain: coreInfo.captain,
      viceCaptain: coreInfo.viceCaptain,
      headCoach: coreInfo.headCoach,
      homeGround: coreInfo.homeGround,
      founded: coreInfo.founded,
      logoUrl: coreInfo.logoUrl,
      teamPhotoUrl: coreInfo.teamPhotoUrl,
      bio: coreInfo.bio,
      sportId,
      levelFormatId,
      createdAt: new Date().toISOString(),
    };

    // Prevent silently clobbering an existing team — use PUT to update instead.
    await docClient.send(
      new PutCommand({
        TableName: CLUBS_TABLE,
        Item: item,
        ConditionExpression: "attribute_not_exists(entityId)",
      })
    );

    return NextResponse.json({ success: true, team: item }, { status: 201 });
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      return NextResponse.json(
        { error: "A team with this team_id already exists — use PUT to update it" },
        { status: 409 }
      );
    }
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/teams error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}