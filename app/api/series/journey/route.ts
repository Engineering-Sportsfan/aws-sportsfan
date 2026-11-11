// app/api/series/journey/route.ts — Series Journey List & Creation Microservice (TABLES.SportsData)
import { NextRequest, NextResponse } from "next/server";
import {
  listSeriesJourneys,
  upsertSeriesJourneyState,
  cleanSeriesId,
} from "@/lib/fanJourneyService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limitParam = parseInt(req.nextUrl.searchParams.get("limit") || "50", 10);
    const limit = isNaN(limitParam) ? 50 : Math.min(Math.max(limitParam, 1), 200);
    const journeys = await listSeriesJourneys(limit);

    return NextResponse.json(
      { success: true, journeys, count: journeys.length },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch series journeys";
    console.error("GET /api/series/journey error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !cleanSeriesId(body.seriesId)) {
      return NextResponse.json(
        { success: false, error: "seriesId is required" },
        { status: 400 }
      );
    }

    const journey = await upsertSeriesJourneyState({
      ...body,
      seriesId: cleanSeriesId(body.seriesId),
    });

    return NextResponse.json({ success: true, journey });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save series journey state";
    console.error("POST /api/series/journey error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

