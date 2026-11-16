// app/api/matches/[id]/summaries/route.ts — Match Completion Summaries & Recognitions API
import { NextRequest, NextResponse } from "next/server";
import {
  getUserMatchPlayerSummary,
  getMatchSnapshotSummary,
  getFanOfTheMatchSummary,
  cleanMatchKey,
} from "@/lib/matchPlayerSummary";
import { resolveRequestUserId } from "@/lib/fanJourneyService";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }> | { id: string };
}

async function getMatchRecognitionCount(cleanMatchId: string): Promise<number> {
  const matchCandidates = [
    `MATCH#${cleanMatchId}`,
    cleanMatchId,
    `MATCH-${cleanMatchId}`,
    cleanMatchId.replace(/^MATCH-/i, ""),
  ];

  let count = 0;
  for (const table of getCandidateTableNames(TABLES.MatchMoments)) {
    for (const mKey of matchCandidates) {
      try {
        const res = await docClient.send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
            ExpressionAttributeValues: {
              ":eId": mKey,
              ":skpfx": "RECOGNITION#",
            },
            Select: "COUNT",
          })
        );
        if (typeof res.Count === "number" && res.Count > 0) {
          count = Math.max(count, res.Count);
        }
      } catch {
        // try next key / table
      }
    }
    if (count > 0) break;
  }
  return count;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = await params;
    const matchId = cleanMatchKey(resolvedParams.id);
    if (!matchId) {
      return NextResponse.json({ success: false, error: "Invalid matchId" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const userId = await resolveRequestUserId(req);
    const type = (searchParams.get("type") || "all").toLowerCase().trim();

    // 1. User Summary (Personalized Progress)
    if (type === "user" || type === "user_summary" || type === "player") {
      const userSummary = await getUserMatchPlayerSummary({
        matchId,
        userId: userId || undefined,
      });
      return NextResponse.json({
        success: true,
        matchId,
        type: "user_summary",
        data: userSummary,
      });
    }

    // 2. Match Summary (Match Snapshot)
    if (type === "match" || type === "match_summary" || type === "snapshot") {
      const matchSummary = await getMatchSnapshotSummary(matchId);
      return NextResponse.json({
        success: true,
        matchId,
        type: "match_summary",
        data: matchSummary,
      });
    }

    // 3. Fan of the Match Summary
    if (type === "fotm" || type === "fan_of_the_match" || type === "fan_of_match") {
      const fanOfTheMatch = await getFanOfTheMatchSummary(matchId);
      return NextResponse.json({
        success: true,
        matchId,
        type: "fan_of_the_match",
        data: fanOfTheMatch,
      });
    }

    // 4. All Summaries + Recognition Count
    const [userSummary, matchSummary, fanOfTheMatch, recognitionsCount] = await Promise.all([
      userId ? getUserMatchPlayerSummary({ matchId, userId }) : null,
      getMatchSnapshotSummary(matchId),
      getFanOfTheMatchSummary(matchId),
      getMatchRecognitionCount(matchId),
    ]);

    return NextResponse.json({
      success: true,
      matchId,
      userId: userId || null,
      data: {
        userSummary,
        matchSummary,
        fanOfTheMatch,
        recognitionsCount,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to load match summaries";
    console.error("GET /api/matches/[id]/summaries error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
