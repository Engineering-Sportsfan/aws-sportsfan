import { NextRequest, NextResponse } from "next/server";
import { cacheService } from "../../../lib/cacheService";

export const dynamic = "force-dynamic";

const ROANUZ_PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "";
const ROANUZ_API_KEY = process.env.ROANUZ_API_KEY || "";
const ROANUZ_AUTH_URL = `https://api.sports.roanuz.com/v5/core/${ROANUZ_PROJECT_KEY}/auth/`;
const ROANUZ_BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${ROANUZ_PROJECT_KEY}`;

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

import axios from "axios";

async function getRoanuzToken(): Promise<string | null> {
  if (!ROANUZ_PROJECT_KEY || !ROANUZ_API_KEY) return null;
  const cached = cacheService.get<string>("roanuz:token");
  if (cached) return cached;
  try {
    const res = await axios.post(ROANUZ_AUTH_URL, { api_key: ROANUZ_API_KEY }, { headers: { "Content-Type": "application/json" } });
    const data = res.data;
    const token = data?.data?.token || data?.token || null;
    if (token) cacheService.set("roanuz:token", token, 15 * 60); // 15 mins
    return token;
  } catch (e: any) { 
    console.warn("[Roanuz] Auth error with axios:", e.message); 
    return null; 
  }
}

async function fetchRoanuzFeaturedMatches(token: string): Promise<any[]> {
  const cached = cacheService.get<any[]>("roanuz:featured");
  if (cached) return cached;
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/featured-matches-2/`, { headers: { "rs-token": token } });
    const data = res.data;
    const matches = data?.data?.matches || data?.matches || [];
    cacheService.set("roanuz:featured", matches, 30);
    return matches;
  } catch (e: any) { console.warn("[Roanuz] Featured error:", e.message); return []; }
}

async function fetchRoanuzMatchScore(token: string, matchKey: string): Promise<any | null> {
  const cacheKey = `roanuz:match:${matchKey}`;
  const cached = cacheService.get<any>(cacheKey);
  if (cached) return cached;
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/match/${matchKey}/`, { headers: { "rs-token": token } });
    const data = res.data;
    const match = data?.data || data;
    cacheService.set(cacheKey, match, 15);
    return match;
  } catch (e: any) { console.warn("[Roanuz] Match score error:", e.message); return null; }
}

function formatMatchToTickerItems(match: any): TickerItem[] {
  const items: TickerItem[] = [];
  const matchKey = match?.key || match?.match_key || "unknown";
  const team1 = match?.teams?.a?.name || match?.team1?.name || "Team A";
  const team2 = match?.teams?.b?.name || match?.team2?.name || "Team B";
  const tournament = match?.tournament?.name || match?.competition?.name || "Cricket";
  const status = match?.status || "not_started";
  
  const result = match?.play?.result?.msg || match?.result?.text || "Match Complete";
  let scoreText = `${team1} vs ${team2}`;
  
  if (match.play?.innings) {
    const innings = match.play.innings;
    let scores: string[] = [];
    if (innings.a_1?.score_str) scores.push(`${team1}: ${innings.a_1.score_str}`);
    else if (innings.a_1?.score) scores.push(`${team1}: ${innings.a_1.score.runs}/${innings.a_1.wickets || 0}`);
    
    if (innings.b_1?.score_str) scores.push(`${team2}: ${innings.b_1.score_str}`);
    else if (innings.b_1?.score) scores.push(`${team2}: ${innings.b_1.score.runs}/${innings.b_1.wickets || 0}`);
    
    if (innings.a_2?.score_str) scores.push(` & ${innings.a_2.score_str}`);
    else if (innings.a_2?.score) scores.push(` & ${innings.a_2.score.runs}/${innings.a_2.wickets || 0}`);
    
    if (innings.b_2?.score_str) scores.push(` & ${innings.b_2.score_str}`);
    else if (innings.b_2?.score) scores.push(` & ${innings.b_2.score.runs}/${innings.b_2.wickets || 0}`);
    if (scores.length > 0) scoreText = scores.join(" | ");
  }

  if (status === "started" || status === "live" || status === "in_progress") {
    items.push({ id: `cricket_${matchKey}_score`, type: "live_score", sport: "cricket", text: `🏏 LIVE · ${scoreText}`, badge: tournament, status: "live" });
  } else if (status === "completed" || status === "finished" || status === "result") {
    items.push({ id: `cricket_${matchKey}_result`, type: "moments", sport: "cricket", text: `🏏 RESULT · ${scoreText} · ${result}`, badge: tournament, status: "ended" });
  } else {
    const startTime = match?.start_at || match?.scheduled || null;
    const timeStr = startTime ? new Date(startTime * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "TBD";
    items.push({ id: `cricket_${matchKey}_upcoming`, type: "sports_update", sport: "cricket", text: `🏏 UPCOMING · ${team1} vs ${team2} · ${timeStr}`, badge: tournament, status: "not_started" });
  }
  return items;
}

async function fetchCricketTicker(): Promise<TickerItem[]> {
  const token = await getRoanuzToken();
  if (!token) return [];

  // 1. Fetch Featured Tournaments
  let tournaments: any[] = cacheService.get("roanuz:tournaments") || [];
  if (!tournaments.length) {
    try {
      const res = await axios.get(`${ROANUZ_BASE_URL}/association/icc/featured-tournaments/`, { headers: { "rs-token": token } });
      tournaments = res.data?.data?.tournaments || [];
      cacheService.set("roanuz:tournaments", tournaments, 60 * 60);
    } catch (e: any) {
      console.warn("[Roanuz] Tournaments error:", e.message);
    }
  }

  // 2. Fetch Fixtures for top 5 tournaments
  let allMatches: any[] = [];
  for (let i = 0; i < Math.min(tournaments.length, 5); i++) {
    const tKey = tournaments[i].key;
    const cacheKey = `roanuz:fixtures:${tKey}`;
    let matches = cacheService.get<any[]>(cacheKey) || [];
    if (!matches.length) {
      try {
        const res = await axios.get(`${ROANUZ_BASE_URL}/tournament/${tKey}/fixtures/`, { headers: { "rs-token": token } });
        matches = res.data?.data?.matches || [];
        cacheService.set(cacheKey, matches, 15 * 60);
      } catch (e: any) {
        console.warn("[Roanuz] Fixtures error:", e.message);
      }
    }
    allMatches.push(...matches);
  }

  // 3. Sort and filter matches
  const now = Date.now() / 1000;
  const liveMatches = allMatches.filter(m => m.status === "started");
  const upcomingMatches = allMatches.filter(m => m.status === "not_started" && m.start_at > now).sort((a, b) => a.start_at - b.start_at);
  const completedMatches = allMatches.filter(m => m.status === "completed").sort((a, b) => b.start_at - a.start_at);

  console.log(`[Roanuz] Found ${liveMatches.length} live, ${upcomingMatches.length} upcoming, ${completedMatches.length} completed matches.`);

  const selectedMatches = [...liveMatches.slice(0, 2), ...upcomingMatches.slice(0, 3), ...completedMatches.slice(0, 2)];
  
  const items: TickerItem[] = [];
  for (const match of selectedMatches) {
    let displayMatch = match;
    // Fetch detailed match score for live or recently completed matches to get runs and wickets
    if (match.status === "started" || match.status === "completed") {
      const details = await fetchRoanuzMatchScore(token, match.key);
      if (details) displayMatch = details;
    }
    items.push(...formatMatchToTickerItems(displayMatch));
  }

  return items.length ? items : DEMO_UPDATES.filter(u => u.sport === "cricket");
}

const ROANUZ_FOOTBALL_ACCESS_KEY = process.env.ROANUZ_FOOTBALL_ACCESS_KEY || "";
const ROANUZ_FOOTBALL_SECRET_KEY = process.env.ROANUZ_FOOTBALL_SECRET_KEY || "";
const ROANUZ_FOOTBALL_APP_ID = process.env.ROANUZ_FOOTBALL_APP_ID || "";
const ROANUZ_FOOTBALL_AUTH_URL = "https://api.footballapi.com/v1/auth/";

async function getRoanuzFootballToken(): Promise<string | null> {
  if (!ROANUZ_FOOTBALL_ACCESS_KEY || !ROANUZ_FOOTBALL_SECRET_KEY) return null;
  const cached = cacheService.get<string>("roanuz:football:token");
  if (cached) return cached;
  try {
    const res = await fetch(ROANUZ_FOOTBALL_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_key: ROANUZ_FOOTBALL_ACCESS_KEY,
        secret_key: ROANUZ_FOOTBALL_SECRET_KEY,
        app_id: ROANUZ_FOOTBALL_APP_ID,
        device_id: "sportsfan360_backend",
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const token = data?.auth?.access_token || null;
    if (token) cacheService.set("roanuz:football:token", token, 23 * 60 * 60);
    return token;
  } catch (e) { return null; }
}

async function fetchFootballTicker(): Promise<TickerItem[]> {
  const token = await getRoanuzFootballToken();
  if (!token) return [];
  // For now, returning a static live score placeholder until we integrate the full football endpoints
  // This confirms auth is working if it reaches here!
  return [
    { id: "football_live_auth_ok", type: "live_score", sport: "football", text: `⚽ FOOTBALL API CONNECTED! Waiting for live matches...`, badge: "Football Update", status: "live" }
  ];
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
