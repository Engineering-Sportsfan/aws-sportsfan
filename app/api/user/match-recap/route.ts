// app/api/user/match-recap/route.ts — Personalized Match Recap Microservice (TABLES.GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import {
  cleanMatchId,
  cleanSeriesId,
  computeUserMatchRecap,
  getUserMatchRecap,
  resolveRequestUserId,
  saveUserMatchRecap,
} from "@/lib/fanJourneyService";
import type { UserMatchRecap } from "@/types/betweenMatchJourney";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = await resolveRequestUserId(req);
    const matchId = cleanMatchId(searchParams.get("matchId"));
    const seriesId = cleanSeriesId(searchParams.get("seriesId"));
    const recompute = searchParams.get("recompute") === "true";

    if (!userId || !matchId) {
      return NextResponse.json(
        { success: false, error: "userId and matchId are required" },
        { status: 400 }
      );
    }

    let recap: UserMatchRecap | null = recompute ? null : await getUserMatchRecap(userId, matchId);
    const source = recap ? "snapshot" : "computed";

    if (!recap) {
      recap = await computeUserMatchRecap(userId, matchId, seriesId || undefined);
    }

    return NextResponse.json(
      { success: true, source, recap },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch user match recap";
    console.error("GET /api/user/match-recap error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = await resolveRequestUserId(req, body.userId);
    const matchId = cleanMatchId(body.matchId);
    const seriesId = cleanSeriesId(body.seriesId);

    if (!userId || !matchId) {
      return NextResponse.json(
        { success: false, error: "userId and matchId are required" },
        { status: 400 }
      );
    }

    const mode = body.mode === "manual" ? "manual" : "compute";

    if (mode === "manual" && body.stats) {
      const recap = await saveUserMatchRecap({
        userId,
        matchId,
        seriesId: seriesId || "",
        fanArchetype: body.fanArchetype || "ANALYTICAL",
        stats: {
          totalInteractions: Number(body.stats.totalInteractions || 0),
          predictionsCorrect: Number(body.stats.predictionsCorrect || 0),
          predictionsTotal: Number(body.stats.predictionsTotal || 0),
          sxpEarned: Number(body.stats.sxpEarned || 0),
        },
        topMomentReacted: body.topMomentReacted || {
          momentId: "",
          title: "",
          reactionsCount: 0,
          mediaUrl: "",
        },
        seriesProgress: body.seriesProgress || {
          cumulativeInteractions: Number(body.stats.totalInteractions || 0),
          cumulativePredictionsCorrect: Number(body.stats.predictionsCorrect || 0),
          cumulativePredictionsTotal: Number(body.stats.predictionsTotal || 0),
          totalSeriesSxp: Number(body.stats.sxpEarned || 0),
          leaderboardPercentile: 1,
        },
        generatedAt: Date.now(),
      });
      return NextResponse.json({ success: true, mode: "manual", recap });
    }

    const recap = await computeUserMatchRecap(userId, matchId, seriesId || undefined);
    return NextResponse.json({ success: true, mode: "compute", recap });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save or compute match recap";
    console.error("POST /api/user/match-recap error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

