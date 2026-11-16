// app/api/user/match-kpis/route.ts — Fan KPIs Pentagon Radar Microservice (TABLES.GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import {
  cleanMatchId,
  cleanSeriesId,
  computeUserMatchKPIs,
  getUserMatchKPIs,
  resolveRequestUserId,
  saveUserMatchKPIs,
} from "@/lib/fanJourneyService";
import type { UserMatchKPIs } from "@/types/betweenMatchJourney";

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

    let kpis: UserMatchKPIs | null = recompute ? null : await getUserMatchKPIs(userId, matchId);
    const source = kpis ? "snapshot" : "computed";

    if (!kpis) {
      kpis = await computeUserMatchKPIs(userId, matchId, seriesId || undefined);
    }

    return NextResponse.json(
      {
        success: true,
        source,
        userId: kpis.userId,
        matchId: kpis.matchId,
        seriesId: kpis.seriesId,
        overallScore: kpis.overallScore,
        kpis: kpis.kpis,
        radarData: kpis.radarData,
        generatedAt: kpis.generatedAt,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch user match KPIs";
    console.error("GET /api/user/match-kpis error:", err);
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

    if (mode === "manual" && body.kpis) {
      const overallScore =
        typeof body.overallScore === "number"
          ? body.overallScore
          : Math.round(
              (Number(body.kpis.knowledge?.score || 0) +
                Number(body.kpis.prediction?.score || 0) +
                Number(body.kpis.participation?.score || 0) +
                Number(body.kpis.community?.score || 0) +
                Number(body.kpis.insight?.score || 0)) /
                5
            );

      const radarData =
        Array.isArray(body.radarData) && body.radarData.length > 0
          ? body.radarData
          : [
              {
                subject: "Knowledge",
                value: Number(body.kpis.knowledge?.score || 0),
                fullMark: 100,
                pillar: "Knowledge",
                score: Number(body.kpis.knowledge?.score || 0),
              },
              {
                subject: "Prediction",
                value: Number(body.kpis.prediction?.score || 0),
                fullMark: 100,
                pillar: "Prediction",
                score: Number(body.kpis.prediction?.score || 0),
              },
              {
                subject: "Participation",
                value: Number(body.kpis.participation?.score || 0),
                fullMark: 100,
                pillar: "Participation",
                score: Number(body.kpis.participation?.score || 0),
              },
              {
                subject: "Community",
                value: Number(body.kpis.community?.score || 0),
                fullMark: 100,
                pillar: "Community",
                score: Number(body.kpis.community?.score || 0),
              },
              {
                subject: "Insight",
                value: Number(body.kpis.insight?.score || 0),
                fullMark: 100,
                pillar: "Insight",
                score: Number(body.kpis.insight?.score || 0),
              },
            ];

      const saved = await saveUserMatchKPIs({
        userId,
        matchId,
        seriesId: seriesId || "",
        overallScore,
        kpis: body.kpis,
        radarData,
        generatedAt: Date.now(),
      });

      return NextResponse.json({
        success: true,
        mode: "manual",
        overallScore: saved.overallScore,
        kpis: saved.kpis,
        radarData: saved.radarData,
      });
    }

    const computed = await computeUserMatchKPIs(userId, matchId, seriesId || undefined);
    return NextResponse.json({
      success: true,
      mode: "compute",
      overallScore: computed.overallScore,
      kpis: computed.kpis,
      radarData: computed.radarData,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to compute or save match KPIs";
    console.error("POST /api/user/match-kpis error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
