import { NextResponse } from "next/server";
import axios from "axios";

const ROANUZ_PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "";
const ROANUZ_API_KEY = process.env.ROANUZ_API_KEY || "";
const ROANUZ_BASE_URL = `https://api.sports.roanuz.com/v5/cricket/${ROANUZ_PROJECT_KEY}`;

async function fetchToken() {
  try {
    const res = await axios.post(`https://api.sports.roanuz.com/v5/core/${ROANUZ_PROJECT_KEY}/auth/`, { api_key: ROANUZ_API_KEY });
    return res.data?.data?.token || res.data?.token || null;
  } catch (e) {
    return null;
  }
}

async function fetchRoanuzMatchScore(token: string, matchKey: string) {
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/match/${matchKey}/`, { headers: { "rs-token": token } });
    return res.data?.data;
  } catch (e) {
    return null;
  }
}

export async function GET() {
  try {
    const token = await fetchToken();
    if (!token) return NextResponse.json({ success: false, error: "Auth failed" });

    const tourRes = await axios.get(`${ROANUZ_BASE_URL}/association/icc/featured-tournaments/`, { headers: { "rs-token": token } });
    const tournaments = tourRes.data?.data?.tournaments || [];

    let allMatches: any[] = [];
    for (let i = 0; i < Math.min(tournaments.length, 25); i++) {
      try {
        const fixRes = await axios.get(`${ROANUZ_BASE_URL}/tournament/${tournaments[i].key}/fixtures/`, { headers: { "rs-token": token } });
        allMatches.push(...(fixRes.data?.data?.matches || []));
      } catch (e) {}
    }

    const fixResGlobal = await axios.get(`${ROANUZ_BASE_URL}/fixtures/`, { headers: { "rs-token": token } });
    const monthDays = fixResGlobal.data?.data?.month?.days || [];
    const globalMatches: any[] = [];
    for (const day of monthDays) {
      if (day.matches) {
        globalMatches.push(...day.matches);
      }
    }

    const now = Date.now() / 1000;
    const completed = allMatches.filter(m => m.status === "completed").sort((a, b) => b.start_at - a.start_at);
    
    // Check both featured tournament matches and global monthly fixtures for live/upcoming
    const combinedMatches = [...allMatches, ...globalMatches];
    const uniqueMatchesMap = new Map();
    for (const m of combinedMatches) {
      if (!uniqueMatchesMap.has(m.key)) uniqueMatchesMap.set(m.key, m);
    }
    const uniqueMatches = Array.from(uniqueMatchesMap.values());

    const live = uniqueMatches.filter(m => m.status === "started");
    const upcoming = uniqueMatches.filter(m => m.status === "not_started" && m.start_at > now).sort((a, b) => a.start_at - b.start_at);

    const highlightsRaw = completed.slice(0, 5);
    
    // If no live/upcoming, fallback to some completed so it's not empty, or just return what we have
    const liveAndUpcomingRaw = [...live, ...upcoming].slice(0, 5);
    if (liveAndUpcomingRaw.length === 0) {
      liveAndUpcomingRaw.push(...completed.slice(5, 10)); // fallback to older matches so it's never completely blank
    }

    const highlights = [];
    for (const m of highlightsRaw) {
      const details = await fetchRoanuzMatchScore(token, m.key) || m;
      const teamA = details.teams?.a || details.team1 || {};
      const teamB = details.teams?.b || details.team2 || {};
      
      let summary = m.title || m.name || "";
      if (details.play?.live?.score?.msg) summary = details.play.live.score.msg;

      const formatScore = (innings: any) => {
        const runs = innings?.score?.runs;
        if (runs === undefined || runs === null) return "-";
        const wickets = innings?.score?.wickets ?? 0;
        return `${runs}/${wickets}`;
      };

      highlights.push({
        id: m.key,
        status: "DONE",
        competition: (m.tournament?.name || "Cricket Match").substring(0, 20) + ((m.tournament?.name?.length || 0) > 20 ? "..." : ""),
        sportEmoji: "🏏",
        teamA: { flag: teamA.code || "A", name: (teamA.name || "Team A").substring(0, 12), score: formatScore(details.play?.innings?.a_1) },
        teamB: { flag: teamB.code || "B", name: (teamB.name || "Team B").substring(0, 12), score: formatScore(details.play?.innings?.b_1) },
        summary: summary.substring(0, 30) + (summary.length > 30 ? "..." : "")
      });
    }

    const liveAndUpcoming = [];
    for (const m of liveAndUpcomingRaw) {
      const details = m.status === "started" ? (await fetchRoanuzMatchScore(token, m.key) || m) : m;
      const teamA = details.teams?.a || details.team1 || {};
      const teamB = details.teams?.b || details.team2 || {};
      
      let scoreLine = `${teamA.code || "A"} vs ${teamB.code || "B"}`;
      if (details.status === "started" && details.play?.live?.score) {
        scoreLine = `${details.play.live.score.runs}/${details.play.live.score.wickets ?? 0} (${details.play.live.score.overs ?? 0})`;
      } else if (details.status === "not_started") {
        const date = new Date(m.start_at * 1000);
        scoreLine = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      liveAndUpcoming.push({
        id: m.key,
        status: m.status === "started" ? "LIVE" : (m.status === "completed" ? "DONE" : "UPCOMING"),
        sportEmoji: "🏏",
        sport: "Cricket",
        subtitle: (m.name || "Cricket Match").substring(0, 25),
        scoreLine,
        metaLine: (m.tournament?.short_name || "Series").substring(0, 20),
        buttonText: m.status === "started" ? "Watch Live" : (m.status === "completed" ? "View Highlights" : "Set Reminder"),
        buttonAction: "none"
      });
    }

    return NextResponse.json({ success: true, highlights, liveAndUpcoming });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
