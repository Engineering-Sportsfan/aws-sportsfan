import { NextRequest, NextResponse } from "next/server";
import { cacheService } from "../../../lib/cacheService";

export const dynamic = "force-dynamic";

const ROANUZ_PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "";
const ROANUZ_API_KEY = process.env.ROANUZ_API_KEY || "";
const ROANUZ_AUTH_URL = `https://api.sports.roanuz.com/v5/core/${ROANUZ_PROJECT_KEY}/auth/`;
const ROANUZ_BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${ROANUZ_PROJECT_KEY}`;

interface TickerItem {
  id: string;
  type: "live_score" | "news" | "sports_update" | "moments" | "ball_by_ball" | "over_summary";
  sport: "cricket" | "football";
  text: string;
  badge: string;
  status: string;
  is_four?: boolean;
  is_six?: boolean;
  is_wicket?: boolean;
}

const DEMO_UPDATES: TickerItem[] = [
  { id: "demo_1", type: "live_score", sport: "cricket", text: "🏏 LIVE · India vs Sri Lanka · 1st Test, Galle", badge: "1st Test - Galle", status: "live" },
  { id: "demo_2", type: "moments", sport: "cricket", text: "🔥 WICKET! Ashwin strikes! K. Mendis lbw b Ashwin 42 - SL 187/3", badge: "1st Test - Galle", status: "live" },
  { id: "demo_3", type: "sports_update", sport: "cricket", text: "🏏 DRINKS BREAK · Sri Lanka trailing by 115 runs", badge: "1st Test - Galle", status: "live" },
  { id: "demo_bbb_1_20.5", type: "ball_by_ball", sport: "cricket", text: "🔵 FOUR! K L Rahul punches it through the covers!", badge: "1st Test - Galle", status: "live", is_four: true },
  { id: "demo_bbb_2_20.2", type: "ball_by_ball", sport: "cricket", text: "💥 SIX! Rishabh Pant goes big over mid-wicket!", badge: "1st Test - Galle", status: "live", is_six: true },
  { id: "demo_bbb_3_19.6", type: "ball_by_ball", sport: "cricket", text: "🔴 WICKET! Kamindu Mendis is out! Caught by Gill.", badge: "1st Test - Galle", status: "live", is_wicket: true },
  { id: "demo_bbb_4_19.3", type: "ball_by_ball", sport: "cricket", text: "🏏 Good running between the wickets! 2 runs added.", badge: "1st Test - Galle", status: "live", is_four: false, is_six: false, is_wicket: false },
  { id: "demo_bbb_5_19.1", type: "ball_by_ball", sport: "cricket", text: "🔵 FOUR! Beautiful drive from Shubman Gill!", badge: "1st Test - Galle", status: "live", is_four: true },
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

async function fetchRoanuzMatchScore(token: string, matchKey: string): Promise<any | null> {
  const cacheKey = `roanuz:match:${matchKey}`;
  const cached = cacheService.get<any>(cacheKey);
  if (cached) return cached;
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/match/${matchKey}/`, { headers: { "rs-token": token } });
    const match = res.data?.data || res.data;
    cacheService.set(cacheKey, match, 15);
    return match;
  } catch (e: any) { console.warn("[Roanuz] Match score error:", e.message); return null; }
}

async function fetchBallByBall(token: string, matchKey: string): Promise<any[]> {
  const cacheKey = `roanuz:bbb:${matchKey}`;
  const cached = cacheService.get<any[]>(cacheKey);
  if (cached) return cached;
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/match/${matchKey}/ball-by-ball/`, { headers: { "rs-token": token } });
    const balls = res.data?.data?.over?.balls || [];
    cacheService.set(cacheKey, balls, 10);
    return balls;
  } catch (e: any) { console.warn("[Roanuz] Ball-by-ball error:", e.message); return []; }
}

async function fetchOverSummary(token: string, matchKey: string): Promise<any[]> {
  const cacheKey = `roanuz:overs:${matchKey}`;
  const cached = cacheService.get<any[]>(cacheKey);
  if (cached) return cached;
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/match/${matchKey}/over-summary/`, { headers: { "rs-token": token } });
    const summaries = res.data?.data?.summaries || [];
    cacheService.set(cacheKey, summaries, 30);
    return summaries;
  } catch (e: any) { console.warn("[Roanuz] Over summary error:", e.message); return []; }
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
    
    // Play status label
    if (match?.play_status && match.play_status !== "live") {
      const playStatusMap: Record<string, string> = {
        lunch_break: "🍽️ LUNCH BREAK", tea_break: "☕ TEA BREAK",
        drinks: "💧 DRINKS BREAK", innings_break: "🔄 INNINGS BREAK",
        stumps: "🌙 STUMPS", rain_delay: "🌧️ RAIN DELAY",
      };
      const label = playStatusMap[match.play_status] || match.play_status.replace(/_/g, " ").toUpperCase();
      items.push({ id: `cricket_${matchKey}_playstatus`, type: "sports_update", sport: "cricket", text: `${label} · ${scoreText}`, badge: tournament, status: "live" });
    }
  } else if (status === "completed" || status === "finished" || status === "result") {
    items.push({ id: `cricket_${matchKey}_result`, type: "moments", sport: "cricket", text: `🏏 RESULT · ${scoreText} · ${result}`, badge: tournament, status: "ended" });
  } else {
    const startTime = match?.start_at || match?.scheduled || null;
    const timeStr = startTime ? new Date(startTime * 1000).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "TBD";
    items.push({ id: `cricket_${matchKey}_upcoming`, type: "sports_update", sport: "cricket", text: `🏏 UPCOMING · ${team1} vs ${team2} · ${timeStr}`, badge: tournament, status: "not_started" });
  }
  return items;
}

function formatBallByBallItems(balls: any[], matchName: string, matchKey: string): TickerItem[] {
  const items: TickerItem[] = [];
  for (const ball of balls.slice(0, 5)) {
    if (!ball.comment) continue;
    const isWicket = ball.bowler?.is_wicket || !!ball.wicket;
    const isFour = ball.batsman?.is_four;
    const isSix = ball.batsman?.is_six;
    const emoji = isWicket ? "🔴 WICKET!" : isSix ? "💥 SIX!" : isFour ? "🔵 FOUR!" : "🏏";
    items.push({ 
      id: `bbb_${matchKey}_${ball.key}`, 
      type: "ball_by_ball", 
      sport: "cricket", 
      text: `${emoji} ${ball.comment}`, 
      badge: matchName, 
      status: "live",
      is_four: !!isFour,
      is_six: !!isSix,
      is_wicket: !!isWicket
    });
  }
  return items;
}

function formatOverSummaryItems(summaries: any[], matchName: string, matchKey: string): TickerItem[] {
  const recent = summaries.slice(-3).reverse();
  return recent.filter(s => s.over_number !== undefined).map((s, i) => ({
    id: `over_${matchKey}_${s.over_number ?? i}`,
    type: "over_summary" as const,
    sport: "cricket" as const,
    text: `📊 OVER ${s.over_number}: ${s.runs} runs${s.wickets ? `, ${s.wickets} wkt` : ""}`,
    badge: matchName,
    status: "live"
  }));
}

async function fetchCricketTicker(): Promise<TickerItem[]> {
  const token = await getRoanuzToken();
  if (!token) {
    return DEMO_UPDATES.filter(u => u.sport === "cricket");
  }

  // 1. Global fixtures
  let globalLive: any[] = [];
  let globalUpcoming: any[] = [];
  let globalCompleted: any[] = [];
  const now = Date.now() / 1000;
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/fixtures/`, { headers: { "rs-token": token } });
    const days = res.data?.data?.month?.days || [];
    for (const day of days) {
      for (const m of (day.matches || [])) {
        if (m.status === "started") globalLive.push(m);
        else if (m.status === "not_started" && m.start_at > now) globalUpcoming.push(m);
        else if (m.status === "completed") globalCompleted.push(m);
      }
    }
  } catch (e: any) { console.warn("[Roanuz] Global fixtures error:", e.message); }

  // 2. Featured tournament fixtures
  let tournaments: any[] = cacheService.get("roanuz:tournaments") || [];
  if (!tournaments.length) {
    try {
      const res = await axios.get(`${ROANUZ_BASE_URL}/association/icc/featured-tournaments/`, { headers: { "rs-token": token } });
      tournaments = res.data?.data?.tournaments || [];
      cacheService.set("roanuz:tournaments", tournaments, 60 * 60);
    } catch (e: any) { console.warn("[Roanuz] Tournaments error:", e.message); }
  }
  let tournamentMatches: any[] = [];
  for (let i = 0; i < Math.min(tournaments.length, 5); i++) {
    const tKey = tournaments[i].key;
    const cacheKey = `roanuz:fixtures:${tKey}`;
    let matches = cacheService.get<any[]>(cacheKey) || [];
    if (!matches.length) {
      try {
        const res = await axios.get(`${ROANUZ_BASE_URL}/tournament/${tKey}/fixtures/`, { headers: { "rs-token": token } });
        matches = res.data?.data?.matches || [];
        cacheService.set(cacheKey, matches, 15 * 60);
      } catch (e: any) { console.warn("[Roanuz] Fixtures error:", e.message); }
    }
    tournamentMatches.push(...matches);
  }

  // 3. Deduplicate and merge
  const seen = new Set<string>();
  const allLive: any[] = [];
  const allUpcoming: any[] = [];
  const allCompleted: any[] = [];
  for (const m of [...globalLive, ...tournamentMatches.filter(m => m.status === "started")]) {
    if (!seen.has(m.key)) { seen.add(m.key); allLive.push(m); }
  }
  for (const m of [...globalUpcoming, ...tournamentMatches.filter(m => m.status === "not_started" && m.start_at > now)]) {
    if (!seen.has(m.key)) { seen.add(m.key); allUpcoming.push(m); }
  }
  for (const m of [...globalCompleted, ...tournamentMatches.filter(m => m.status === "completed")]) {
    if (!seen.has(m.key)) { seen.add(m.key); allCompleted.push(m); }
  }

  const items: TickerItem[] = [];

  // 4. LIVE matches
  for (const match of allLive.slice(0, 3)) {
    const details = await fetchRoanuzMatchScore(token, match.key);
    const displayMatch = details || match;
    const matchName = displayMatch.short_name || displayMatch.name || "Cricket";
    items.push(...formatMatchToTickerItems(displayMatch));
    const balls = await fetchBallByBall(token, match.key);
    if (balls.length > 0) items.push(...formatBallByBallItems(balls, matchName, match.key));
    const overs = await fetchOverSummary(token, match.key);
    if (overs.length > 0) items.push(...formatOverSummaryItems(overs, matchName, match.key));
  }

  // 5. Upcoming
  for (const match of allUpcoming.slice(0, 3)) {
    items.push(...formatMatchToTickerItems(match));
  }

  // 6. Recent completed
  for (const match of allCompleted.slice(0, 2)) {
    const details = await fetchRoanuzMatchScore(token, match.key);
    const displayMatch = details || match;
    const matchName = displayMatch.short_name || displayMatch.name || "Cricket";
    items.push(...formatMatchToTickerItems(displayMatch));
    
    // Fetch last balls and over summary for highlights
    const balls = await fetchBallByBall(token, match.key);
    if (balls.length > 0) items.push(...formatBallByBallItems(balls, matchName, match.key));
    const overs = await fetchOverSummary(token, match.key);
    if (overs.length > 0) items.push(...formatOverSummaryItems(overs, matchName, match.key));
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
  return [
    { id: "football_live_auth_ok", type: "live_score", sport: "football", text: `⚽ FOOTBALL API CONNECTED! Waiting for live matches...`, badge: "Football Update", status: "live" }
  ];
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sports = searchParams.get("sports")?.split(",") || ["cricket", "football"];
    const types = searchParams.get("types")?.split(",") || ["live_score", "sports_update", "news", "moments", "ball_by_ball", "over_summary"];
    const limit = parseInt(searchParams.get("limit") || "30");
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
