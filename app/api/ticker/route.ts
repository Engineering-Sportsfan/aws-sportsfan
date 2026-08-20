import { NextRequest, NextResponse } from "next/server";
import { cacheService } from "../../../lib/cacheService";

export const dynamic = "force-dynamic";

const ROANUZ_PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "";
const ROANUZ_API_KEY = process.env.ROANUZ_API_KEY || "";
const ROANUZ_AUTH_URL = "https://auth.cricketapi.com/v5/token/";
const ROANUZ_BASE_URL = "https://cricketapi.com/v5";

interface TickerItem {
  id: string;
  type: "live_score" | "news" | "sports_update" | "moments";
  sport: "cricket" | "football";
  text: string;
  badge: string;
  status: string;
}

const DEMO_UPDATES: TickerItem[] = [
  { id: "demo_1", type: "live_score", sport: "cricket", text: "🏏 LIVE · India vs Sri Lanka · 1st Test, Galle", badge: "1st Test - Galle", status: "live" },
  { id: "demo_2", type: "moments", sport: "cricket", text: "🔥 WICKET! Ashwin strikes! K. Mendis lbw b Ashwin 42 - SL 187/3", badge: "1st Test - Galle", status: "live" },
  { id: "demo_3", type: "sports_update", sport: "cricket", text: "🏏 DRINKS BREAK · Sri Lanka trailing by 115 runs", badge: "1st Test - Galle", status: "live" },
];

async function getRoanuzToken(): Promise<string | null> {
  if (!ROANUZ_PROJECT_KEY || !ROANUZ_API_KEY) return null;
  const cached = cacheService.get<string>("roanuz:token");
  if (cached) return cached;
  try {
    const res = await fetch(ROANUZ_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: ROANUZ_API_KEY, project_key: ROANUZ_PROJECT_KEY }),
    });
    if (!res.ok) { console.warn("[Roanuz] Auth failed:", res.status); return null; }
    const data = await res.json();
    const token = data?.data?.access_token || data?.access_token || null;
    if (token) cacheService.set("roanuz:token", token, 82800);
    return token;
  } catch (e) { console.warn("[Roanuz] Auth error:", e); return null; }
}

async function fetchRoanuzFeaturedMatches(token: string): Promise<any[]> {
  const cached = cacheService.get<any[]>("roanuz:featured");
  if (cached) return cached;
  try {
    const res = await fetch(`${ROANUZ_BASE_URL}/match/featured/`, {
      headers: { "rs-token": token, "project-key": ROANUZ_PROJECT_KEY },
    });
    if (!res.ok) { console.warn("[Roanuz] Featured failed:", res.status, await res.text()); return []; }
    const data = await res.json();
    const matches = data?.data?.matches || data?.matches || [];
    cacheService.set("roanuz:featured", matches, 30);
    return matches;
  } catch (e) { console.warn("[Roanuz] Featured error:", e); return []; }
}

async function fetchRoanuzMatchScore(token: string, matchKey: string): Promise<any | null> {
  const cacheKey = `roanuz:match:${matchKey}`;
  const cached = cacheService.get<any>(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(`${ROANUZ_BASE_URL}/match/${matchKey}/`, {
      headers: { "rs-token": token, "project-key": ROANUZ_PROJECT_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.data || data;
    cacheService.set(cacheKey, match, 15);
    return match;
  } catch (e) { console.warn("[Roanuz] Match score error:", e); return null; }
}

function formatMatchToTickerItems(match: any): TickerItem[] {
  const items: TickerItem[] = [];
  const matchKey = match?.key || match?.match_key || "unknown";
  const team1 = match?.teams?.a?.name || match?.team1?.name || "Team A";
  const team2 = match?.teams?.b?.name || match?.team2?.name || "Team B";
  const tournament = match?.tournament?.name || match?.competition?.name || "Cricket";
  const status = match?.status || "not_started";
  const scoreA = match?.live_score?.a || match?.scores?.team_a;
  const scoreB = match?.live_score?.b || match?.scores?.team_b;

  if (status === "started" || status === "live" || status === "in_progress") {
    let scoreText = "";
    if (scoreA && scoreB) {
      scoreText = `${team1} ${scoreA.runs || 0}/${scoreA.wickets || 0} (${scoreA.overs || 0}) vs ${team2} ${scoreB.runs || 0}/${scoreB.wickets || 0} (${scoreB.overs || 0})`;
    } else if (scoreA) {
      scoreText = `${team1} ${scoreA.runs || 0}/${scoreA.wickets || 0} (${scoreA.overs || 0}) vs ${team2}`;
    } else {
      scoreText = `${team1} vs ${team2}`;
    }
    items.push({ id: `cricket_${matchKey}_score`, type: "live_score", sport: "cricket", text: `🏏 LIVE · ${scoreText}`, badge: tournament, status: "live" });
    const recentEvent = match?.recent_event || match?.last_ball;
    if (recentEvent) {
      const desc = recentEvent?.description || recentEvent?.text || "";
      if (desc) items.push({ id: `cricket_${matchKey}_event`, type: "moments", sport: "cricket", text: `🔥 ${desc}`, badge: tournament, status: "live" });
    }
  } else if (status === "completed" || status === "finished" || status === "result") {
    const result = match?.result?.text || "Match Complete";
    items.push({ id: `cricket_${matchKey}_result`, type: "moments", sport: "cricket", text: `🏏 RESULT · ${team1} vs ${team2} · ${result}`, badge: tournament, status: "ended" });
  } else {
    const startTime = match?.start_at || match?.scheduled || null;
    const timeStr = startTime ? new Date(startTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "TBD";
    items.push({ id: `cricket_${matchKey}_upcoming`, type: "sports_update", sport: "cricket", text: `🏏 UPCOMING · ${team1} vs ${team2} · ${timeStr}`, badge: tournament, status: "not_started" });
  }
  return items;
}

async function fetchCricketTicker(): Promise<TickerItem[]> {
  const token = await getRoanuzToken();
  if (!token) { console.warn("[Roanuz] No token, using demo"); return DEMO_UPDATES.filter(u => u.sport === "cricket"); }
  const featuredMatches = await fetchRoanuzFeaturedMatches(token);
  if (!featuredMatches.length) { console.warn("[Roanuz] No featured matches, using demo"); return DEMO_UPDATES.filter(u => u.sport === "cricket"); }
  const allItems: TickerItem[] = [];
  await Promise.all(featuredMatches.slice(0, 5).map(async (m: any) => {
    const matchKey = m?.key || m?.match_key;
    if (!matchKey) return;
    const score = await fetchRoanuzMatchScore(token, matchKey);
    const items = formatMatchToTickerItems(score ? { ...m, ...score } : m);
    allItems.push(...items);
  }));
  return allItems.length ? allItems : DEMO_UPDATES.filter(u => u.sport === "cricket");
}

function fetchFootballTicker(): TickerItem[] {
  const timeSeed = Math.floor(Date.now() / 30000);
  return [{ id: "football_demo_1", type: "live_score", sport: "football", text: `⚽ LIVE · India ${timeSeed % 3} - ${(timeSeed + 1) % 2} Kuwait (${(timeSeed % 90) + 1}')`, badge: "FIFA World Cup Qualifier", status: "live" }];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sports = searchParams.get("sports")?.split(",") || ["cricket", "football"];
    const types = searchParams.get("types")?.split(",") || ["live_score", "sports_update", "news", "moments"];
    const limit = parseInt(searchParams.get("limit") || "20");
    const [cricketItems, footballItems] = await Promise.all([
      sports.includes("cricket") ? fetchCricketTicker() : Promise.resolve([]),
      sports.includes("football") ? Promise.resolve(fetchFootballTicker()) : Promise.resolve([]),
    ]);
    const allItems: TickerItem[] = [];
    const max = Math.max(cricketItems.length, footballItems.length);
    for (let i = 0; i < max; i++) {
      if (cricketItems[i]) allItems.push(cricketItems[i]);
      if (footballItems[i]) allItems.push(footballItems[i]);
    }
    const filtered = allItems.filter(item => types.includes(item.type));
    return NextResponse.json({ success: true, total: filtered.length, items: filtered.slice(0, limit), fetched_at: new Date().toISOString(), source: ROANUZ_PROJECT_KEY ? "roanuz" : "demo" });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
