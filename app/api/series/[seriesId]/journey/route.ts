// app/api/series/[seriesId]/journey/route.ts — Single Series Journey State Microservice (TABLES.SportsData)
import { NextRequest, NextResponse } from "next/server";
import {
  getSeriesJourneyState,
  upsertSeriesJourneyState,
  advanceSeriesJourneyStage,
  cleanSeriesId,
} from "@/lib/fanJourneyService";
import { JOURNEY_STAGE_ORDER, type JourneyStage } from "@/types/betweenMatchJourney";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ seriesId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { seriesId } = await params;
    const cleanId = cleanSeriesId(seriesId);
    if (!cleanId) {
      return NextResponse.json({ success: false, error: "seriesId is required" }, { status: 400 });
    }

    const journey = await getSeriesJourneyState(cleanId);
    return NextResponse.json(
      {
        success: true,
        exists: Boolean(journey),
        journey: journey ?? {
          seriesId: cleanId,
          seriesName: cleanId,
          currentStage: "DAY_0" as JourneyStage,
          currentMatchId: "",
          nextMatchId: "",
          matchIds: [],
          match1CompletedAt: 0,
          match2ScheduledAt: 0,
          venue: { stadium: "", city: "" },
          rivalryTally: { teamAId: "IND", teamAFans: 0, teamBId: "NZ", teamBFans: 0 },
          autoAdvanceEnabled: true,
          updatedAt: Date.now(),
        },
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch series journey state";
    console.error("GET /api/series/[seriesId]/journey error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { seriesId } = await params;
    const cleanId = cleanSeriesId(seriesId);
    if (!cleanId) {
      return NextResponse.json({ success: false, error: "seriesId is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedStage = (body.nextStage || body.currentStage) as JourneyStage | undefined;

    if (requestedStage && !JOURNEY_STAGE_ORDER.includes(requestedStage)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid stage '${requestedStage}'. Allowed: ${JOURNEY_STAGE_ORDER.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // If caller only requests advancing to the next stage (or passes only nextStage without other fields)
    const isStageOnlyAdvance =
      Boolean(body.advanceNext) ||
      (Boolean(requestedStage) &&
        Object.keys(body).every((k) => ["nextStage", "currentStage", "advanceNext"].includes(k)));

    const journey = isStageOnlyAdvance
      ? await advanceSeriesJourneyStage(cleanId, requestedStage)
      : await upsertSeriesJourneyState({
          ...body,
          seriesId: cleanId,
          currentStage: requestedStage,
        });

    return NextResponse.json({
      success: true,
      currentStage: journey.currentStage,
      journey,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update series journey state";
    console.error("POST /api/series/[seriesId]/journey error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteParams) {
  return POST(req, context);
}

