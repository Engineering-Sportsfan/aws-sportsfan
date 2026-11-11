// app/api/user/match-intent/route.ts — User Match Intent Checklist Microservice (TABLES.GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import {
  cleanMatchId,
  getMatchIntentAggregates,
  getUserMatchIntent,
  resolveRequestUserId,
  saveUserMatchIntent,
  DEFAULT_WATCHING_INTENT_OPTIONS,
} from "@/lib/fanJourneyService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const matchId = cleanMatchId(req.nextUrl.searchParams.get("matchId"));
    if (!matchId) {
      return NextResponse.json(
        { success: false, error: "matchId is required" },
        { status: 400 }
      );
    }

    const userId = await resolveRequestUserId(req);
    if (!userId) {
      const aggregates = await getMatchIntentAggregates(matchId);
      return NextResponse.json(
        {
          success: true,
          intent: {
            userId: "",
            matchId,
            selectedMoments: [],
            availableOptions: DEFAULT_WATCHING_INTENT_OPTIONS,
            updatedAt: Date.now(),
          },
          aggregates,
        },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    const data = await getUserMatchIntent(userId, matchId);
    return NextResponse.json(
      { success: true, ...data },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch match intent checklist";
    console.error("GET /api/user/match-intent error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = await resolveRequestUserId(req, body.userId);
    const matchId = cleanMatchId(body.matchId);

    if (!userId || !matchId) {
      return NextResponse.json(
        { success: false, error: "userId and matchId are required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.selectedMoments)) {
      return NextResponse.json(
        { success: false, error: "selectedMoments array is required" },
        { status: 400 }
      );
    }

    const saved = await saveUserMatchIntent(
      userId,
      matchId,
      body.selectedMoments,
      Array.isArray(body.availableOptions) ? body.availableOptions : undefined
    );

    return NextResponse.json({
      success: true,
      saved: saved.intent.selectedMoments,
      ...saved,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save match intent checklist";
    console.error("POST /api/user/match-intent error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}

