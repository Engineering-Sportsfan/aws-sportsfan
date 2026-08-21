import { NextResponse } from "next/server";
import axios from "axios";
import { getRoanuzToken } from "../ticker/route"; // Need to export getRoanuzToken or duplicate it

const ROANUZ_BASE_URL = "https://api.sports.roanuz.com/v5/cricket";
const PROJECT_KEY = process.env.ROANUZ_PROJECT_KEY || "";
const API_KEY = process.env.ROANUZ_API_KEY || "";

async function fetchToken() {
  try {
    const res = await axios.post(`https://api.sports.roanuz.com/v5/core/${PROJECT_KEY}/auth/`, { api_key: API_KEY });
    return res.data?.data?.token;
  } catch (e) {
    return null;
  }
}

async function fetchRoanuzMatchScore(token: string, matchKey: string) {
  try {
    const res = await axios.get(`${ROANUZ_BASE_URL}/${PROJECT_KEY}/match/${matchKey}/`, { headers: { "rs-token": token } });
    return res.data?.data;
  } catch (e) {
    return null;
  }
}

export async function GET() {
  try {
    const token = await fetchToken();
    if (!token) return NextResponse.json({ success: false, items: [] });

    // For featured matches, we'll hit featured-matches-2/ as it's the fastest way to get recent top matches
    const featuredRes = await axios.get(`${ROANUZ_BASE_URL}/${PROJECT_KEY}/featured-matches-2/`, { headers: { "rs-token": token } });
    const rawMatches = featuredRes.data?.data?.matches || [];
    
    const items = [];
    for (let i = 0; i < Math.min(rawMatches.length, 3); i++) {
      const match = rawMatches[i];
      let details = match;
      if (match.status === "started" || match.status === "completed") {
         const score = await fetchRoanuzMatchScore(token, match.key);
         if (score) details = score;
      }

      const teamA = details.teams?.a || details.team1;
      const teamB = details.teams?.b || details.team2;
      const innings = details.play?.innings || {};
      
      let scoreA = "";
      let scoreB = "";
      let overs = "";
      
      if (innings.a_1?.score_str) scoreA = innings.a_1.score_str;
      else if (innings.a_1?.score) scoreA = `${innings.a_1.score.runs}/${innings.a_1.wickets || 0}`;
      
      if (innings.b_1?.score_str) scoreB = innings.b_1.score_str;
      else if (innings.b_1?.score) scoreB = `${innings.b_1.score.runs}/${innings.b_1.wickets || 0}`;

      if (details.play?.live?.score?.overs) {
         overs = `${details.play.live.score.overs}`;
      }

      items.push({
        type: "live",
        id: details.key,
        status: details.status === "started" ? "LIVE" : "COMPLETED",
        isFootball: false,
        competition: details.tournament?.name || details.competition?.name || "Cricket Tournament",
        matchLabel: `Cricket · ${details.sub_title || details.format || "Match"}`,
        teamAName: teamA?.name || "Team A",
        teamAShort: teamA?.code || "TMA",
        teamAScore: scoreA || "-",
        teamBName: teamB?.name || "Team B",
        teamBShort: teamB?.code || "TMB",
        teamBScore: scoreB || "-",
        oversLabel: overs,
        overSummary: [],
        result: details.play?.result?.msg || details.result?.text || "Match Finished",
        manOfMatch: "",
        bgImageUrl: "/images/cricketground.avif",
        fanCount: Math.floor(Math.random() * 5000),
        ctaLabel: details.status === "started" ? "Match Center" : "View Highlights",
      });
    }

    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    return NextResponse.json({ success: false, items: [], error: error.message });
  }
}
