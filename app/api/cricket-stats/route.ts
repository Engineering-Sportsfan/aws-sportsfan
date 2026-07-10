// api/cricket-stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

type MatchDoc = Record<string, unknown>;

type SeasonSummary = {
  total: number;
  completed: number;
};

const getNumber = (value: unknown) =>
  typeof value === "number" ? value : Number(value) || 0;

const getString = (value: unknown) =>
  typeof value === "string" ? value : "";

const getBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : value === "true" || value === "1";

// GET - Aggregated statistics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const season = searchParams.get("season");
    const team = searchParams.get("team");
    
    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> =
      db.collection("matches");
    
    if (season) {
      query = query.where("season", "==", season);
    }
    
    const snapshot = await query.get();
    let matches: MatchDoc[] = snapshot.docs.map((doc) => doc.data());
    
    // Filter by team involvement
    if (team) {
      matches = matches.filter((m) => getString(m.team1) === team || getString(m.team2) === team);
    }
    
    const totalMatches = matches.length;
    const completedMatches = matches.filter((m) => !getBoolean(m.isNoResult));
    
    // Team wins
    const teamWins: Record<string, number> = {};
    matches.forEach((m) => {
      const winner = getString(m.winner);
      if (winner && winner !== "No Result") {
        teamWins[winner] = (teamWins[winner] || 0) + 1;
      }
    });
    
    // Batting first vs chasing
    const battingFirstWins = matches.filter((m) => 
      getString(m.tossDecision) === "bat" && getString(m.winner) === getString(m.team1) && !getBoolean(m.isNoResult)
    ).length;
    
    const chasingWins = matches.filter((m) => 
      getString(m.tossDecision) === "field" && getString(m.winner) === getString(m.team2) && !getBoolean(m.isNoResult)
    ).length;
    
    // Average scores
    const avgFirstInnings = matches.reduce((sum: number, m) => {
      const inning1 = m.inning1 as Record<string, unknown> | undefined;
      return sum + getNumber(inning1?.runs);
    }, 0) / (matches.length || 1);
    
    const avgSecondInnings = matches.reduce((sum: number, m) => {
      const inning2 = m.inning2 as Record<string, unknown> | undefined;
      return sum + getNumber(inning2?.runs);
    }, 0) / (matches.length || 1);
    
    // Highest totals
    const highestTotal = matches.length
      ? Math.max(...matches.map((m) => {
        const inning1 = m.inning1 as Record<string, unknown> | undefined;
        const inning2 = m.inning2 as Record<string, unknown> | undefined;
        return Math.max(getNumber(inning1?.runs), getNumber(inning2?.runs));
      }))
      : 0;
    
    // Most common venues
    const venueCount: Record<string, number> = {};
    matches.forEach((m) => {
      const venue = getString(m.venue);
      if (!venue) return;
      venueCount[venue] = (venueCount[venue] || 0) + 1;
    });
    const topVenues = Object.entries(venueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    // Season summary
    const seasonsMap: Record<string, SeasonSummary> = {};
    matches.forEach((m) => {
      const seasonValue = getString(m.season) || "unknown";
      if (!seasonsMap[seasonValue]) {
        seasonsMap[seasonValue] = { total: 0, completed: 0 };
      }
      seasonsMap[seasonValue].total++;
      if (!getBoolean(m.isNoResult)) {
        seasonsMap[seasonValue].completed++;
      }
    });
    
    return NextResponse.json({
      success: true,
      stats: {
        totalMatches,
        completedMatches: completedMatches.length,
        noResultMatches: totalMatches - completedMatches.length,
        teamWins,
        tossDecisions: {
          battingFirstWins,
          chasingWins,
          battingFirstWinPercent: totalMatches ? (battingFirstWins / totalMatches * 100).toFixed(1) : 0,
          chasingWinPercent: totalMatches ? (chasingWins / totalMatches * 100).toFixed(1) : 0,
        },
        averages: {
          firstInnings: Math.round(avgFirstInnings),
          secondInnings: Math.round(avgSecondInnings),
        },
        highestTotal,
        topVenues: topVenues.map(([name, count]) => ({ name, matches: count })),
        seasonSummary: seasonsMap,
      },
      filters: { season: season || "all", team: team || "all" },
    });
    
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching stats:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}