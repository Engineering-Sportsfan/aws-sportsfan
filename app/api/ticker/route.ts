import { NextRequest, NextResponse } from "next/server";
import { cacheService } from "../../../lib/cacheService";
import fs from "fs";
import path from "path";

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

function loadLocalSportradarData(sport: "cricket" | "football"): any[] {
  try {
    const filename = sport === "cricket" ? "sportradar_cricket_today.json" : "sportradar_football_today.json";
    const filePath = `/Users/prishadureja/Desktop/${filename}`;
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(fileContent);
      let list = data.sport_events || data.schedules || [];
      return list.map((item: any) => {
        if (item.sport_event) {
          return {
            ...item.sport_event,
            status: item.sport_event_status?.status || item.sport_event?.status || "not_started"
          };
        }
        return item;
      });
    }
  } catch (e) {
    console.warn(`[Ticker] Failed to load local fallback data for ${sport}:`, e);
  }
  return [];
}

async function fetchCricketTicker(): Promise<TickerItem[]> {
  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `ticker:cricket:${today}`;
  
  const cached = cacheService.get<TickerItem[]>(cacheKey);
  if (cached) return cached;

  let events: any[] = [];
  if (SR_API_KEY) {
    try {
      const res = await fetchWithTimeout(
        `${CRICKET_URL}/${today}/schedule.json?api_key=${SR_API_KEY}`,
        { next: { revalidate: 30 } } as any,
        3000
      );
      if (res.ok) {
        const data = await res.json();
        events = data.sport_events || [];
      } else {
        events = loadLocalSportradarData("cricket");
      }
    } catch (err) {
      events = loadLocalSportradarData("cricket");
    }
  } else {
    events = loadLocalSportradarData("cricket");
  }

  const timeSeed = Math.floor(Date.now() / 15000);
  const items: TickerItem[] = events.slice(0, 100).map((e: any, i: number) => {
    const team1 = e.competitors?.[0]?.name || "Team A";
    const team2 = e.competitors?.[1]?.name || "Team B";
    let status = e.status || "not_started";
    const tournament = e.tournament?.name || "Cricket";

    // Simulate at least some live matches for rich demo
    if (i < 2) {
      status = "live";
    }

    let text = "";
    let type: TickerItem["type"] = "sports_update";

    if (status === "live") {
      const runs = 140 + (timeSeed % 80) + (i * 5);
      const wickets = (timeSeed % 4) + 1;
      const overs = (timeSeed % 15) + "." + (timeSeed % 6);
      text = `🏏 LIVE · ${team1} vs ${team2} · ${runs}/${wickets} (${overs} ovs)`;
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

  cacheService.set(cacheKey, items, 15); // cache for 15s to allow updates
  return items;
}

async function fetchSoccerTicker(): Promise<TickerItem[]> {
  const today = new Date().toISOString().split("T")[0];
  const cacheKey = `ticker:soccer:${today}`;

  const cached = cacheService.get<TickerItem[]>(cacheKey);
  if (cached) return cached;

  let events: any[] = [];
  if (SR_API_KEY) {
    try {
      const res = await fetchWithTimeout(
        `${SOCCER_URL}/schedules/${today}/schedules.json?api_key=${SR_API_KEY}`,
        { next: { revalidate: 30 } } as any,
        3000
      );
      if (res.ok) {
        const data = await res.json();
        events = data.sport_events || [];
      } else {
        events = loadLocalSportradarData("football");
      }
    } catch (err) {
      events = loadLocalSportradarData("football");
    }
  } else {
    events = loadLocalSportradarData("football");
  }

  const timeSeed = Math.floor(Date.now() / 30000);
  const items: TickerItem[] = events.slice(0, 100).map((e: any, i: number) => {
    const team1 = e.competitors?.[0]?.name || "Team A";
    const team2 = e.competitors?.[1]?.name || "Team B";
    let status = e.status || "not_started";
    const tournament = e.tournament?.name || "Football";

    // Simulate at least some live matches for rich demo
    if (i < 2) {
      status = "live";
    }

    let text = "";
    let type: TickerItem["type"] = "sports_update";

    if (status === "live" || status === "inprogress") {
      const score1 = (timeSeed + i) % 3;
      const score2 = (timeSeed + 1) % 2;
      const minute = (timeSeed % 90) + 1;
      text = `⚽ LIVE · ${team1} ${score1} - ${score2} ${team2} (${minute}')`;
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

  cacheService.set(cacheKey, items, 15); // cache for 15s to allow updates
  return items;
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

    const merged = [...apiItems, ...filteredMock].filter(item => types.includes(item.type));

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
