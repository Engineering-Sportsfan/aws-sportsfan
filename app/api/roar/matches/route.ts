import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand, PutCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET /api/roar/matches
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let matches: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try fetching from DynamoDB first
    try {
      const res = await docClient.send(new ScanCommand({
        TableName: "SportsData",
        FilterExpression: "sk = :m",
        ExpressionAttributeValues: { ":m": "MATCH#META" }
      }));

      if (res.Items) {
        matches = res.Items.map(item => ({
          id: (item.entityId as string).replace(/^MATCH#/, "") || item.id,
          ...item
        }));
        // Sort in memory by kickoff_time asc
        matches.sort((a, b) => (a.kickoff_time || 0) - (b.kickoff_time || 0));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Matches GET] DynamoDB fetch failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await db.collection("matches").orderBy("kickoff_time", "asc").get();
        matches = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (fsErr) {
        console.error("[Matches GET] Firestore fallback failed:", fsErr);
      }
    }

    return NextResponse.json({ success: true, matches });
  } catch (error: any) {
    console.error("GET /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to load matches." }, { status: 500 });
  }
}

// POST /api/roar/matches
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sport, competition, team_a, team_b, kickoff_time, stage, status } = body;

    if (!sport || !team_a || !team_b || !kickoff_time) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const matchId = `match_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();

    const matchData = {
      sport,
      competition: competition || "",
      team_a,
      team_b,
      kickoff_time: Number(kickoff_time),
      stage: stage || "group",
      status: status || "upcoming",
      created_at: now,
      updated_at: now
    };

    // 1. Put to DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: "SportsData",
        Item: {
          entityId: `MATCH#${matchId}`,
          sk: "MATCH#META",
          ...matchData
        }
      }));
    } catch (dynErr) {
      console.warn("[Matches POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("matches").doc(matchId).set(matchData);
    } catch (fsErr) {
      console.warn("[Matches POST] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id: matchId });
  } catch (error: any) {
    console.error("POST /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to create match." }, { status: 500 });
  }
}

// PATCH /api/roar/matches
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing match ID parameter." }, { status: 400 });
    }

    const body = await req.json();
    const updateData: any = {
      sport: body.sport,
      competition: body.competition || "",
      team_a: body.team_a,
      team_b: body.team_b,
      kickoff_time: Number(body.kickoff_time),
      stage: body.stage || "group",
      status: body.status || "upcoming",
      updated_at: Date.now()
    };

    // 1. Update in DynamoDB
    try {
      let updateExpression = "SET";
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      Object.keys(updateData).forEach((key, index) => {
        const valKey = `:val${index}`;
        const nameKey = `#name${index}`;
        updateExpression += ` ${nameKey} = ${valKey},`;
        expressionAttributeNames[nameKey] = key;
        expressionAttributeValues[valKey] = updateData[key];
      });

      updateExpression = updateExpression.slice(0, -1);

      await docClient.send(new UpdateCommand({
        TableName: "SportsData",
        Key: { entityId: `MATCH#${id}`, sk: "MATCH#META" },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues
      }));
    } catch (dynErr) {
      console.warn("[Matches PATCH] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("matches").doc(id).update(updateData);
    } catch (fsErr) {
      console.warn("[Matches PATCH] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, message: `Match ${id} updated successfully.` });
  } catch (error: any) {
    console.error("PATCH /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to update match." }, { status: 500 });
  }
}

// DELETE /api/roar/matches
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing match ID parameter." }, { status: 400 });
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(new DeleteCommand({
        TableName: "SportsData",
        Key: { entityId: `MATCH#${id}`, sk: "MATCH#META" }
      }));
    } catch (dynErr) {
      console.warn("[Matches DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("matches").doc(id).delete();
    } catch (fsErr) {
      console.warn("[Matches DELETE] Firestore fallback sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, message: `Match ${id} deleted successfully.` });
  } catch (error: any) {
    console.error("DELETE /api/roar/matches error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete match." }, { status: 500 });
  }
}
