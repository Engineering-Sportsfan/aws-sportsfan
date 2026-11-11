// app/api/series/[seriesId]/awards/route.ts — Community Awards Microservice (TABLES.GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import {
  autoComputeMatchAwards,
  cleanMatchId,
  cleanSeriesId,
  deleteCommunityAward,
  getSeriesAwards,
  upsertCommunityAward,
} from "@/lib/fanJourneyService";
import type { CommunityAwardType } from "@/types/betweenMatchJourney";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ seriesId: string }> };

const VALID_AWARD_TYPES = new Set<CommunityAwardType>([
  "fan_of_the_match",
  "prediction_oracle",
  "top_analyst",
]);

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { seriesId } = await params;
    const cleanS = cleanSeriesId(seriesId);
    if (!cleanS) {
      return NextResponse.json({ success: false, error: "seriesId is required" }, { status: 400 });
    }

    const matchId = cleanMatchId(req.nextUrl.searchParams.get("matchId"));
    const awards = await getSeriesAwards(cleanS, matchId || undefined);

    return NextResponse.json(
      { success: true, seriesId: cleanS, awards, count: awards.length },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch community awards";
    console.error("GET /api/series/[seriesId]/awards error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { seriesId } = await params;
    const cleanS = cleanSeriesId(seriesId);
    const body = await req.json().catch(() => ({}));
    const matchId = cleanMatchId(body.matchId);

    if (!cleanS || !matchId) {
      return NextResponse.json(
        { success: false, error: "seriesId and matchId are required" },
        { status: 400 }
      );
    }

    const creditSxpBonus = body.creditSxpBonus !== false;

    if (body.mode === "auto_compute") {
      const requestedTypes: CommunityAwardType[] = Array.isArray(body.awardTypes)
        ? body.awardTypes.filter((t: any) => VALID_AWARD_TYPES.has(t))
        : ["fan_of_the_match", "prediction_oracle", "top_analyst"];

      const awards = await autoComputeMatchAwards(cleanS, matchId, requestedTypes, creditSxpBonus);
      return NextResponse.json({
        success: true,
        mode: "auto_compute",
        seriesId: cleanS,
        matchId,
        awards,
        count: awards.length,
      });
    }

    const awardType = body.awardType as CommunityAwardType;
    if (!VALID_AWARD_TYPES.has(awardType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Valid awardType required (${Array.from(VALID_AWARD_TYPES).join(", ")})`,
        },
        { status: 400 }
      );
    }

    if (!body.winner?.userId || !body.winner?.userName) {
      return NextResponse.json(
        { success: false, error: "winner.userId and winner.userName are required for manual award dispatch" },
        { status: 400 }
      );
    }

    const award = await upsertCommunityAward(
      {
        awardId: body.awardId,
        seriesId: cleanS,
        matchId,
        awardType,
        awardTitle: String(
          body.awardTitle ||
            (awardType === "fan_of_the_match"
              ? "Fan of the Match"
              : awardType === "prediction_oracle"
              ? "Prediction Oracle"
              : "Top Analyst")
        ),
        winner: body.winner,
        badgeAwardedUrl: String(body.badgeAwardedUrl || ""),
        sxpBonusAwarded: Number(body.sxpBonusAwarded ?? 150),
      },
      { creditSxpBonus }
    );

    return NextResponse.json({ success: true, mode: "manual", award });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to dispatch community award";
    console.error("POST /api/series/[seriesId]/awards error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { seriesId } = await params;
    const cleanS = cleanSeriesId(seriesId);
    const matchId = cleanMatchId(req.nextUrl.searchParams.get("matchId"));
    const awardType = req.nextUrl.searchParams.get("awardType") as CommunityAwardType;

    if (!cleanS || !matchId || !VALID_AWARD_TYPES.has(awardType)) {
      return NextResponse.json(
        { success: false, error: "seriesId, matchId, and valid awardType are required" },
        { status: 400 }
      );
    }

    await deleteCommunityAward(cleanS, matchId, awardType);
    return NextResponse.json({ success: true, deleted: { seriesId: cleanS, matchId, awardType } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete community award";
    console.error("DELETE /api/series/[seriesId]/awards error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

