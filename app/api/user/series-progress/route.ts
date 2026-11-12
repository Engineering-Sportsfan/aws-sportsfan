// app/api/user/series-progress/route.ts — User Series Progress & Leaderboard Snapshot Microservice (TABLES.GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import {
  cleanSeriesId,
  computeUserSeriesProgress,
  getSeriesLeaderboard,
  getUserSeriesProgress,
  resolveRequestUserId,
  saveUserSeriesProgress,
} from "@/lib/fanJourneyService";
import type { UserSeriesProgress } from "@/types/betweenMatchJourney";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const seriesId = cleanSeriesId(searchParams.get("seriesId"));
    if (!seriesId) {
      return NextResponse.json(
        { success: false, error: "seriesId is required" },
        { status: 400 }
      );
    }

    const leaderboardOnly = searchParams.get("leaderboardOnly") === "true";
    const includeLeaderboard = leaderboardOnly || searchParams.get("includeLeaderboard") !== "false";
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const limit = isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 200);

    if (leaderboardOnly) {
      const leaderboard = await getSeriesLeaderboard(seriesId, limit);
      return NextResponse.json(
        { success: true, seriesId, leaderboard, count: leaderboard.length },
        { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
      );
    }

    const userId = await resolveRequestUserId(req);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required (or pass leaderboardOnly=true)" },
        { status: 400 }
      );
    }

    const recompute = searchParams.get("recompute") === "true";
    const matchIdsRaw = searchParams.get("matchIds");
    const explicitMatchIds = matchIdsRaw
      ? matchIdsRaw.split(",").map((m) => m.trim()).filter(Boolean)
      : undefined;

    let progress: UserSeriesProgress | null = recompute
      ? null
      : await getUserSeriesProgress(userId, seriesId);
    const source = progress ? "snapshot" : "computed";

    if (!progress) {
      progress = await computeUserSeriesProgress(userId, seriesId, explicitMatchIds);
    }

    const leaderboard = includeLeaderboard ? await getSeriesLeaderboard(seriesId, limit) : undefined;

    // Refresh live rank/percentile onto response if leaderboard is fetched
    if (leaderboard && leaderboard.length > 0) {
      const entry = leaderboard.find((e) => e.userId.toLowerCase() === userId.toLowerCase());
      if (entry) {
        const pct = Number((entry.rank / leaderboard.length).toFixed(4));
        progress.leaderboard = {
          rank: entry.rank,
          totalParticipants: leaderboard.length,
          percentile: pct,
          badgeTier: entry.badgeTier,
        };
      }
    }

    return NextResponse.json(
      { success: true, source, progress, leaderboard },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch series progress";
    console.error("GET /api/user/series-progress error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = await resolveRequestUserId(req, body.userId);
    const seriesId = cleanSeriesId(body.seriesId);

    if (!userId || !seriesId) {
      return NextResponse.json(
        { success: false, error: "userId and seriesId are required" },
        { status: 400 }
      );
    }

    if (body.mode === "manual" && body.stats) {
      const correct = Number(body.stats.cumulativePredictionsCorrect || 0);
      const total = Number(body.stats.cumulativePredictionsTotal || 0);
      const accuracyPercent =
        body.stats.accuracyPercent !== undefined
          ? Number(body.stats.accuracyPercent)
          : total > 0
          ? Math.round((correct / total) * 100)
          : 0;

      const progress = await saveUserSeriesProgress({
        userId,
        seriesId,
        userName: String(body.userName || userId),
        userAvatar: String(body.userAvatar || ""),
        fanArchetype: body.fanArchetype || "ANALYTICAL",
        favoritePlayers: Array.isArray(body.favoritePlayers) ? body.favoritePlayers : [],
        favoriteClub: String(body.favoriteClub || ""),
        stats: {
          cumulativeInteractions: Number(body.stats.cumulativeInteractions || 0),
          cumulativePredictionsCorrect: correct,
          cumulativePredictionsTotal: total,
          accuracyPercent,
          totalSeriesSxp: Number(body.stats.totalSeriesSxp || 0),
        },
        leaderboard: body.leaderboard || {
          rank: 1,
          totalParticipants: 1,
          percentile: 1,
          badgeTier: "BRONZE",
        },
        updatedAt: Date.now(),
      });

      return NextResponse.json({ success: true, mode: "manual", progress });
    }

    const explicitMatchIds = Array.isArray(body.matchIds) ? body.matchIds : undefined;
    const progress = await computeUserSeriesProgress(userId, seriesId, explicitMatchIds);
    return NextResponse.json({ success: true, mode: "compute", progress });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to save or compute series progress";
    console.error("POST /api/user/series-progress error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

