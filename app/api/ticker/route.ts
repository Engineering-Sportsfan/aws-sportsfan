import { NextRequest, NextResponse } from "next/server";
import { cacheService } from "../../../lib/cacheService";

const SR_API_KEY = process.env.SPORTRADAR_API_KEY || "";
const CRICKET_URL = `https://api.sportradar.com/cricket-t2/en/schedules`;
const SOCCER_URL = `https://api.sportradar.com/soccer/trial/v4/en`;

export const dynamic = "force-dynamic";

interface TickerItem {
  id: string;
  type: "live_score" | "news" | "sports_update" | "moments";
  sport: "cricket" | "football";
  text: string;
  badge: string;
  status: string;
}

// Robust fallback/mock updates to guarantee a working demo even if APIs are rate-limited or matches are offline
const MOCK_UPDATES: TickerItem[] = [
  {
    id: "mock_1",
    type: "live_score",
    sport: "cricket",
    text: "🏏 LIVE · India 287/4 (48.2 ovs) vs Pakistan 242/8 (45.0 ovs)",
    badge: "ICC Champions Trophy",
    status: "live"
  },
  {
    id: "mock_2",
    type: "moments",
    sport: "cricket",
    text: "🔥 WICKET! Bumrah dismisses Babar Azam for 3 - PAK 45/3 (9.4 ovs)",
    badge: "ICC",
    status: "live"
  },
  {
    id: "mock_3",
    type: "live_score",
    sport: "football",
    text: "⚽ GOAL! India 1 - 0 Kuwait (Chhetri 38')",
    badge: "FIFA World Cup Qualifier",
    status: "live"
  },
  {
    id: "mock_4",
    type: "news",
    sport: "football",
    text: "📢 Live medal chance tonight! Manu Bhaker wins GOLD at the Games",
    badge: "Gold",
    status: "ended"
  }
];

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    } as any);
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function fetchCricketTicker(): Promise<TickerItem[]> {
  if (!SR_API_KEY) return [];
  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `ticker:cricket:${today}`;
  
  const cached = cacheService.get<TickerItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `${CRICKET_URL}/${today}/schedule.json?api_key=${SR_API_KEY}`,
      { next: { revalidate: 30 } } as any,
      3000
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events = data.sport_events || [];

    const items: TickerItem[] = events.slice(0, 100).map((e: any, i: number) => {
      const team1 = e.competitors?.[0]?.name || "Team A";
      const team2 = e.competitors?.[1]?.name || "Team B";
      const status = e.status || "not_started";
      const tournament = e.tournament?.name || "Cricket";

      let text = "";
      let type: TickerItem["type"] = "sports_update";

      if (status === "live") {
        text = `🏏 LIVE · ${team1} vs ${team2}`;
        type = "live_score";
      } else if (status === "closed" || status === "ended") {
        text = `🏏 RESULT · ${team1} vs ${team2} · Match Complete`;
        type = "moments";
      } else {
        text = `🏏 UPCOMING · ${team1} vs ${team2} · ${new Date(e.scheduled).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
        type = "sports_update";
      }

      return {
        id: `cricket_${e.id || i}`,
        type,
        sport: "cricket" as const,
        text,
        badge: tournament,
        status,
      };
    });

    cacheService.set(cacheKey, items, 30); // cache for 30 seconds
    return items;
  } catch (err) {
    console.warn("[Ticker] Cricket API fetch error or timeout:", err);
    return [];
  }
}

async function fetchSoccerTicker(): Promise<TickerItem[]> {
  if (!SR_API_KEY) return [];
  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `ticker:soccer:${today}`;

  const cached = cacheService.get<TickerItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `${SOCCER_URL}/schedules/${today}/schedules.json?api_key=${SR_API_KEY}`,
      { next: { revalidate: 30 } } as any,
      3000
    );
    if (!res.ok) return [];
    const data = await res.json();
    const events = data.sport_events || [];

    const items: TickerItem[] = events.slice(0, 100).map((e: any, i: number) => {
      const team1 = e.competitors?.[0]?.name || "Team A";
      const team2 = e.competitors?.[1]?.name || "Team B";
      const status = e.status || "not_started";
      const tournament = e.tournament?.name || "Football";

      let text = "";
      let type: TickerItem["type"] = "sports_update";

      if (status === "live" || status === "inprogress") {
        text = `⚽ LIVE · ${team1} vs ${team2}`;
        type = "live_score";
      } else if (status === "closed" || status === "ended") {
        text = `⚽ RESULT · ${team1} vs ${team2} · FT`;
        type = "moments";
      } else {
        text = `⚽ UPCOMING · ${team1} vs ${team2} · ${new Date(e.scheduled).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
        type = "sports_update";
      }

      return {
        id: `football_${e.id || i}`,
        type,
        sport: "football" as const,
        text,
        badge: tournament,
        status,
      };
    });

    cacheService.set(cacheKey, items, 30); // cache for 30 seconds
    return items;
  } catch (err) {
    console.warn("[Ticker] Soccer API fetch error or timeout:", err);
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sports = searchParams.get("sports")?.split(",") || ["cricket", "football"];
    const types = searchParams.get("types")?.split(",") || ["live_score", "sports_update", "news", "moments"];
    const limit = parseInt(searchParams.get("limit") || "20");

    const matchId = searchParams.get("matchId");
    const team = searchParams.get("team");

    const [cricketItems, soccerItems] = await Promise.all([
      sports.includes("cricket") ? fetchCricketTicker() : Promise.resolve([]),
      sports.includes("football") ? fetchSoccerTicker() : Promise.resolve([]),
    ]);

    // Interleave live updates
    let apiItems: TickerItem[] = [];
    const max = Math.max(cricketItems.length, soccerItems.length);
    for (let i = 0; i < max; i++) {
      if (cricketItems[i]) apiItems.push(cricketItems[i]);
      if (soccerItems[i]) apiItems.push(soccerItems[i]);
    }

    // Apply strict filtering if the user is inside a specific Match Room
    if (matchId) {
      apiItems = apiItems.filter((item) => item.id.includes(matchId));
    } else if (team) {
      const t = team.toLowerCase();
      apiItems = apiItems.filter((item) => item.text.toLowerCase().includes(t));
    }

    // Merge API results with high-quality mock data so demo is always rich/populated
    let filteredMock = MOCK_UPDATES.filter(
      item => sports.includes(item.sport) && types.includes(item.type)
    );

    // If a specific match room is requested, strictly filter mock data too to avoid spam
    if (matchId) {
      filteredMock = filteredMock.filter((item) => item.id.includes(matchId));
    } else if (team) {
      const t = team.toLowerCase();
      filteredMock = filteredMock.filter((item) => item.text.toLowerCase().includes(t));
    }

    const merged = [...filteredMock, ...apiItems].filter(item => types.includes(item.type));

    return NextResponse.json({
      success: true,
      total: merged.length,
      items: merged.slice(0, limit),
      fetched_at: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
