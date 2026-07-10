import { NextRequest, NextResponse } from "next/server";
// import cloudinary from "@/lib/cloudinary"; // <-- Add this
export const dynamic = "force-dynamic"; // <-- ADD THIS LINE TO DISABLE VERCEL CACHE
export const revalidate = 0;            // <-- ADD THIS LINE FOR EXTRA SAFETY
// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamRow {
  rank: number;
  abbr: string;
  name: string;
  qualified: boolean;
  m: number;
  w: number;
  l: number;
  nr: number;
  pts: number;
  nrr: string;
  logo: string;
}

export interface PlayerRow {
  rank: number;
  player: string;
  team: string;
  m: number;
  runs?: number;
  wickets?: number;
  avg: string;
  sr?: string;
  hs?: string;
  econ?: string;
}
export interface MatchCard {
  matchNo: number;
  date: string;
  day: string;
  time: string;
  teamA: string;
  teamAFull: string;
  teamB: string;
  teamBFull: string;
  venue: string;
  status: "upcoming" | "live" | "completed";
  result?: string;
  scoreA?: string;   // <-- Add this
  scoreB?: string;   // <-- Add this
  oversA?: string;   // <-- Add this
  oversB?: string;   // <-- Add this
}
export interface InternalMatchCard extends MatchCard {
  _isDesktop: boolean;
  _hasRealResult: boolean;
  _scoreA?: string;
  _scoreB?: string;
  _oversA?: string;
  _oversB?: string;
}

export interface ExtraStatRow {
  rank: number;
  player: string;
  team: string;
  value: string;
  subValue: string;
}

export interface PlayoffData {
  q1: MatchCard;
  eliminator: MatchCard;
  q2: MatchCard;
  final: MatchCard;
}

export interface HighestScoreRow {
  rank: number;
  player: string;
  team: string;
  score: string;
}


export interface TodayMatch {
  teamA: string;
  teamAFull: string;
  teamB: string;
  teamBFull: string;
  time: string;
  venue: string;
  matchNo: number;
  totalMatches: number;
}

export interface RecentMatch {
  teamA: string;
  teamB: string;
  result: string;
  scoreA?: string;
  scoreB?: string;
  oversA?: string;
  oversB?: string;
}

export interface IPLStatsResponse {
  teamLogos: Record<string, string>;
  pointsTable: TeamRow[];
  orangeCap: PlayerRow[];
  purpleCap: PlayerRow[];
  todayMatch: TodayMatch;
  recentMatch: RecentMatch;
  upcomingMatches: MatchCard[];
  recentMatches: MatchCard[];
  highestScores: HighestScoreRow[];
  playoffs: PlayoffData; // Added this
  extraStats: {
    battingAvg: ExtraStatRow[];
    bowlingAvg: ExtraStatRow[];
    bestBowling: ExtraStatRow[];
    mostEcon: ExtraStatRow[];
    maxSixes: ExtraStatRow[];
    maxFours: ExtraStatRow[];
    boundaries: ExtraStatRow[];
  };
}

// ─── Admin List Helpers ───────────────────────────────────────────────────────
// interface CloudinaryApiParams {
//   resource_type: string;
//   type: string;
//   prefix: string;
//   max_results: number;
//   next_cursor?: string;
// }

// interface CloudinaryResource {
//   public_id: string;
//   secure_url: string;
//   created_at: string;
//   bytes: number;
//   format: string;
//   display_name: string;
// }

// interface ScriptFileMeta {
//   id: string;
//   fileName: string;
//   url: string;
//   size: number;
//   sizeFormatted: string;
//   createdAt: string;
//   reportDate: string | null;
//   reportDateFormatted: string | null;
// }

// function formatFileSize(bytes: number): string {
//   if (bytes < 1024) return `${bytes} B`;
//   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
//   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
// }

// function extractReportDate(fileName: string): string | null {
//   const underscoreMatch = fileName.match(/(\d{4})_(\d{2})_(\d{2})(?:\.|$)/);
//   if (underscoreMatch) {
//     return `${underscoreMatch[1]}-${underscoreMatch[2]}-${underscoreMatch[3]}`;
//   }
//   const dashMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
//   return dashMatch ? dashMatch[1] : null;
// }

// function formatReportDate(dateStr: string | null): string | null {
//   if (!dateStr) return null;
//   try {
//     return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
//       day: "2-digit",
//       month: "short",
//       year: "numeric",
//     });
//   } catch {
//     return dateStr;
//   }
// }
// ─── Shared constants ─────────────────────────────────────────────────────────

// const MONTH_ABBR = [
//   "Jan", "Feb", "Mar", "Apr", "May", "Jun",
//   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
// ] as const;

// const MONTH_MAP: Record<string, number> = {
//   jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
//   jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
// };

// const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Known IPL team abbreviation → full name map used as a fallback lookup. */
// const TEAM_FULL: Record<string, string> = {
//   CSK:  "Chennai Super Kings",
//   MI:   "Mumbai Indians",
//   RCB:  "Royal Challengers Bengaluru",
//   KKR:  "Kolkata Knight Riders",
//   SRH:  "Sunrisers Hyderabad",
//   RR:   "Rajasthan Royals",
//   PBKS: "Punjab Kings",
//   DC:   "Delhi Capitals",
//   GT:   "Gujarat Titans",
//   LSG:  "Lucknow Super Giants",
// };

// ─── HTML parsing helpers ─────────────────────────────────────────────────────

// function stripTags(html: string): string {
//   return html
//     .replace(/<[^>]+>/g, " ")
//     .replace(/&amp;/g, "&")
//     .replace(/&nbsp;/g, " ")
//     .replace(/&lt;/g, "<")
//     .replace(/&gt;/g, ">")
//     .replace(/&#\d+;/g, "")
//     .replace(/\s+/g, " ")
//     .trim();
// }

// function extractRows(html: string): string[][] {
//   const rows: string[][] = [];
//   const cleaned = html
//     .replace(/<script[\s\S]*?<\/script>/gi, "")
//     .replace(/<style[\s\S]*?<\/style>/gi, "");

//   const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
//   let trMatch: RegExpExecArray | null;
//   while ((trMatch = trRegex.exec(cleaned)) !== null) {
//     const cells: string[] = [];
//     const imgSources: string[] = []; 
//     const tdRegex = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
//     let tdMatch: RegExpExecArray | null;
    
//     while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
//       cells.push(stripTags(tdMatch[1]));
      
//       // Look for images and extract their source safely
//       const imgRegex = /<img\b[^>]*>/gi;
//       let imgMatch: RegExpExecArray | null;
//       while ((imgMatch = imgRegex.exec(tdMatch[1])) !== null) {
//         const imgTag = imgMatch[0];
//         const dataSrc = imgTag.match(/data-src=["']([^"']+)["']/i);
//         const src = imgTag.match(/src=["']([^"']+)["']/i);
        
//         // 🛠️ THE FIX: Prioritize data-src over standard src!
//         const bestSrc = (dataSrc && dataSrc[1]) || (src && src[1]);
//         if (bestSrc) imgSources.push(bestSrc);
//       }
//     }
//     if (cells.length > 0) {
//       cells.push(JSON.stringify(imgSources)); 
//       rows.push(cells);
//     }
//   }
//   return rows;
// }

// function extractTables(html: string): string[] {
//   const tables: string[] = [];
//   let depth = 0;
//   let start = -1;
//   const tokenRe = /(<table\b)|(<\/table>)/gi;
//   let m: RegExpExecArray | null;
//   while ((m = tokenRe.exec(html)) !== null) {
//     if (m[1]) {
//       if (depth === 0) start = m.index;
//       depth++;
//     } else {
//       depth--;
//       if (depth === 0 && start !== -1) {
//         tables.push(html.slice(start, m.index + m[0].length));
//         start = -1;
//       }
//     }
//   }
//   return tables;
// }

// ─── Points-table parser ──────────────────────────────────────────────────────

// function parsePointsTable(html: string): TeamRow[] {
//   const rows = extractRows(html);
//   return rows
//     .filter((row) => /^\d{1,2}$/.test(row[0]) && Number(row[0]) <= 10)
//     .map((row): TeamRow => {
//       const rank = Number(row[0]);
//       let abbr = "";
//       let name = "";
//       let offset = 1;

//       if (/^[A-Z]{2,5}$/.test(row[1])) {
//         abbr = row[1];
//         name = row[2] || "";
//         offset = 3;
//       } else {
//         const mm = row[1].match(/^([A-Z]{2,5})\s+(.*)/);
//         if (mm) { abbr = mm[1]; name = mm[2]; }
//         else    { name = row[1]; }
//         offset = 2;
//       }

//       if (!abbr && name) {
//         const found = Object.keys(TEAM_FULL).find(
//           (key) => TEAM_FULL[key].toLowerCase() === name.trim().toLowerCase()
//         );
//         abbr = found || name.substring(0, 3).toUpperCase();
//       }

//       // 🛠️ THE FIX: Smartly grab the true team logo
//       // let logo = "";
//       // try {
//       //   const imgsStr = row[row.length - 1] || "[]";
//       //   if (imgsStr.startsWith("[")) {
//       //     const imgs: string[] = JSON.parse(imgsStr);
//       //     if (imgs.length > 0) {
//       //       const lowerAbbr = abbr.toLowerCase();
//       //       // Find an image that explicitly contains the abbreviation or name
//       //       const matchedImg = imgs.find(s => {
//       //         const u = s.toLowerCase();
//       //         return u.includes(`/${lowerAbbr}.`) || u.includes(`-${lowerAbbr}.`) || u.includes(`_${lowerAbbr}.`) || u.includes(lowerAbbr);
//       //       });
//       //       // Filter out generic UI icons
//       //       const validImgs = imgs.filter(s => !s.match(/(up|down|trend|arrow|icon|minus|plus)/i));
//       //       logo = matchedImg || validImgs[0] || imgs[0] || "";
//       //     }
//       //   } else {
//       //     logo = imgsStr;
//       //   }
//       // } catch {
//       //   logo = "";
//       // }
//       const logo = `/teams/${abbr.toUpperCase()}.png`;

//       return {
//         rank, abbr, name, logo,
//         qualified: rank <= 4,
//         m:   Number(row[offset])     || 0,
//         w:   Number(row[offset + 1]) || 0,
//         l:   Number(row[offset + 2]) || 0,
//         nr:  Number(row[offset + 3]) || 0,
//         pts: Number(row[offset + 4]) || 0,
//         nrr: row[offset + 5] || "0.000",
//       };
//     });
// }
// ─── Caps parser ──────────────────────────────────────────────────────────────

// function mapPlayerRow(row: string[], type: "orange" | "purple", pointsTable: TeamRow[]): PlayerRow | null {
//   if (!/^\d+$/.test(row[0])) return null;
//   const rank = Number(row[0]);

//   let player = "";
//   let team   = "";
//   let offset = 1;

//   if (row[2] && /^[A-Z]{2,5}$/.test(row[2])) {
//     player = row[1];
//     team   = row[2];
//     offset = 3;
//   } else {
//     const combined = row[1] || "";
//     const mm = combined.match(/^(.*?)\s+([A-Z]{2,5})$/);
//     if (mm) { player = mm[1]; team = mm[2]; }
//     else    { player = combined; team = row[2] || ""; }
//     offset = 3;
//   }

//   if (team) {
//     const found = Object.keys(TEAM_FULL).find(
//       (key) => TEAM_FULL[key].toLowerCase() === team.trim().toLowerCase()
//     );
//     if (found) team = found;
//   }

//   // 🛠️ THE ULTIMATE LOGO FIX: Cross-reference EVERY image filename!
//   if (!team) {
//     try {
//       const imgsStr = row[row.length - 1] || "[]";
//       if (imgsStr.startsWith("[")) {
//         const imgs: string[] = JSON.parse(imgsStr);
        
//         // Loop through all images found in the row (bypassing the cap badge)
//         for (const url of imgs) {
//           const urlLower = url.toLowerCase();
//           // Strip out Cloudinary paths to get strictly "srh.png"
//           const getFilename = (u: string) => u.split('/').pop()?.split('?')[0] || u;
//           const urlFilename = getFilename(urlLower);
          
//           if (urlFilename.match(/(cap|up|down|trend|arrow|icon|minus|plus)/)) continue;
          
//           // 1. Check if the filename matches a logo in the Points Table
//           const matchedTeam = pointsTable.find(t => {
//             if (!t.logo) return false;
//             const tFilename = getFilename(t.logo.toLowerCase());
//             return tFilename === urlFilename || 
//                    tFilename.replace(/\.[^/.]+$/, "") === urlFilename.replace(/\.[^/.]+$/, ""); // Match without extension
//           });
          
//           if (matchedTeam) {
//             team = matchedTeam.abbr;
//             break; // Found the team, stop looping!
//           }
          
//           // 2. Ultra-relaxed fallback using filename string matching
//           const foundAbbr = Object.keys(TEAM_FULL).find(abbr => {
//             const parts = TEAM_FULL[abbr].toLowerCase().split(" ");
//             return urlFilename.includes(abbr.toLowerCase()) || 
//                    urlFilename.includes(parts[0]) || 
//                    (parts.length > 1 && parts[1].length > 3 && urlFilename.includes(parts[1]));
//           });
          
//           if (foundAbbr) {
//             team = foundAbbr;
//             break;
//           }
//         }
//       }
//     } catch {
      
//     }
//   }

//   if (!team) team = "TBD"; // Fallback to prevent crashes

//   if (type === "orange") {
//     return {
//       rank, player, team,
//       runs: Number(row[offset])     || 0,
//       m:    Number(row[offset + 1]) || 0,
//       avg:  row[offset + 2] || "-",
//       hs:   row[offset + 3] || "-",
//       sr:   row[offset + 4] || "-",
//     };
//   }
  
//   return {
//     rank, player, team,
//     wickets: Number(row[offset])     || 0,
//     m:       Number(row[offset + 1]) || 0,
//     avg:     row[offset + 2] || "-",
//     econ:    row[offset + 3] || "-",
//     hs:      row[offset + 4] || "-",
//   };
// }


// function parseCaps(html: string, pointsTable: TeamRow[]): { orange: PlayerRow[]; purple: PlayerRow[] } {
//   const tables = extractTables(html);
//   if (tables.length >= 2) {
//     const orange = extractRows(tables[0]).map((r) => mapPlayerRow(r, "orange", pointsTable)).filter(Boolean) as PlayerRow[];
//     const purple = extractRows(tables[1]).map((r) => mapPlayerRow(r, "purple", pointsTable)).filter(Boolean) as PlayerRow[];
//     return { orange, purple };
//   }

//   if (tables.length === 1) {
//     const tbodyRe = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/gi;
//     const bodies: string[] = [];
//     let bm: RegExpExecArray | null;
//     while ((bm = tbodyRe.exec(tables[0])) !== null) bodies.push(bm[1]);

//     if (bodies.length >= 2) {
//       const orange = extractRows(bodies[0]).map((r) => mapPlayerRow(r, "orange", pointsTable)).filter(Boolean) as PlayerRow[];
//       const purple = extractRows(bodies[1]).map((r) => mapPlayerRow(r, "purple", pointsTable)).filter(Boolean) as PlayerRow[];
//       return { orange, purple };
//     }
//   }

//   const rows = extractRows(html);
//   const orange: PlayerRow[] = [];
//   const purple: PlayerRow[] = [];
//   let section: "orange" | "purple" | "" = "";

//   for (const row of rows) {
//     const text = row.join(" ").toLowerCase();
//     if (text.includes("orange") || text.includes("batting") || text.includes("run")) {
//       section = "orange"; continue;
//     }
//     if (text.includes("purple") || text.includes("bowling") || text.includes("wicket")) {
//       section = "purple"; continue;
//     }
//     if (!section) continue;
//     const p = mapPlayerRow(row, section, pointsTable);
//     if (p) (section === "orange" ? orange : purple).push(p);
//   }

//   return { orange, purple };
// }

// ─── Date / time helpers (shared by matches parser) ──────────────────────────

/**
 * Attempt to parse a freeform date string such as:
 * "May 07", "07 May", "May 07, 2026", "07/05/2026", "2026-05-07"
 * Returns a Date at midnight local time, or null if unrecognised.
 */
// function parseDateStr(raw: string): Date | null {
//   const s = raw.trim();

//   // 🛠️ THE FIX: Added ^ to anchor to the start, and \b to prevent matching "20" out of "2026"
//   let m = s.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2})\b(?:,?\s*(\d{4}))?/);
//   if (m) {
//     const mo = MONTH_MAP[m[1].toLowerCase().slice(0, 3)];
//     if (mo !== undefined) {
//       const yr = m[3] ? Number(m[3]) : 2026;
//       return new Date(yr, mo, Number(m[2]));
//     }
//   }

//   // 🛠️ THE FIX: Added ^ to anchor to the start
//   m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})(?:,?\s*(\d{4}))?/);
//   if (m) {
//     const mo = MONTH_MAP[m[2].toLowerCase().slice(0, 3)];
//     if (mo !== undefined) {
//       const yr = m[3] ? Number(m[3]) : 2026;
//       return new Date(yr, mo, Number(m[1]));
//     }
//   }

//   // ISO "2026-05-07"
//   m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
//   if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

//   // "DD/MM/YYYY"
//   m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
//   if (m) {
//     const yr = m[3] ? Number(m[3]) : 2026;
//     return new Date(yr, Number(m[2]) - 1, Number(m[1]));
//   }

//   return null;
// }

// /** Format a Date as "May 07". */
// function fmtDate(d: Date): string {
//   return `${MONTH_ABBR[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
// }

// /** Strip a date back to midnight for day-level comparisons. */
// function midnight(d: Date): Date {
//   return new Date(d.getFullYear(), d.getMonth(), d.getDate());
// }

// ─── Matches parser ───────────────────────────────────────────────────────────

/**
 * Parses the IPL fixtures HTML into `todayMatch`, `recentMatch`, and
 * `upcomingMatches`.  The parser is intentionally defensive: it uses keyword
 * and pattern matching on cell content rather than fixed column indices so it
 * tolerates minor variations in the CDN table structure.
 *
 * Column detection heuristics (applied per-row):
 *  • Match number  – a lone integer in [1, 74]
 *  • Date          – a cell parseable by parseDateStr()
 *  • Time          – "H:MM AM/PM" or "H:MM IST"
 *  • Team abbrs    – 2–5 uppercase letters found in TEAM_FULL
 *  • Venue         – longest non-date, non-result, non-time cell (> 15 chars)
 *  • Result        – cell containing "won by", "no result", "tied", "abandoned"
 *  • Scores        – cell matching "d+/d+" pattern
 *  • Overs         – cell matching "d+.d+" or "(d+.d+)"
 */
// ─── Matches parser ───────────────────────────────────────────────────────────

/**
 * Parses the IPL fixtures HTML into `todayMatch`, `recentMatch`, and
 * `upcomingMatches`. 
 */
// ─── Matches parser ───────────────────────────────────────────────────────────

// function parseMatches(html: string): {
//   todayMatch: TodayMatch;
//   recentMatch: RecentMatch;
//   upcomingMatches: MatchCard[];
//   recentMatches: MatchCard[];
//   allCards: MatchCard[]; 
//   rawCompletedMatches: InternalMatchCard[];
// } {
//   const now = new Date();
//   if (now.getFullYear() < 2026) now.setFullYear(2026);
//   const todayMidnight = midnight(now);
  
//   const cleanedText = html
//     .replace(/<script[\s\S]*?<\/script>/gi, " ")
//     .replace(/<style[\s\S]*?<\/style>/gi, " ")
//     .replace(/<[^>]+>/g, " ")
//     .replace(/&nbsp;/g, " ")  // <-- Add this line to fix hidden spaces
//     .replace(/&amp;/g, "&")   // <-- Add this line for safe decoding
//     .replace(/\s+/g, " ")
//     .trim();

//   const rawBlocks = cleanedText.split(/(?=MATCH\s+\d+\b)/gi);
//   const cardsMap = new Map<number, InternalMatchCard>();

//   for (const block of rawBlocks) {
//     if (!/MATCH\s+\d+/i.test(block)) continue;
//     const matchNoMatch = block.match(/MATCH\s+(\d+)/i);
//     const matchNo = matchNoMatch ? Number(matchNoMatch[1]) : 0;

//     let resultText: string | undefined;
//     const resultMatch = block.match(/([a-z\s]+won by \d+\s+(?:runs?|wickets?|wkts?|wkt)(?:\s*\([^)]+\))?|no result|tied|abandoned|match tied)/i);
//     if (resultMatch) resultText = resultMatch[1].trim();

//     // 🛠️ THE FIX: More forgiving regex for spaces, hyphens, and formatting variations
//    // 🛠️ THE ULTIMATE FIX: Handles scores with OR without overs safely
//     // Matches "180/5 (20.0)", "180-5", "180/5", or "180 (20.0)" while ignoring plain dates/match numbers.
//     const scoreMatches = [...block.matchAll(/(\d{1,3}\s*[\/-]\s*\d{1,2}(?:\s*\(\s*[\d\.]+[^)]*\))?|\d{1,3}\s*\(\s*[\d\.]+[^)]*\))/gi)];
    
//     let scoreA, oversA, scoreB, oversB;
    
//     if (scoreMatches.length >= 1) {
//       const matchStr = scoreMatches[0][0];
//       const sMatch = matchStr.match(/(\d{1,3}(?:\s*[\/-]\s*\d{1,2})?)/);
//       const oMatch = matchStr.match(/\(\s*([\d\.]+)/);
      
//       if (sMatch) scoreA = sMatch[1].replace(/\s+/g, "").replace("-", "/");
//       if (oMatch) oversA = oMatch[1];
//     }
    
//     if (scoreMatches.length >= 2) {
//       const matchStr = scoreMatches[1][0];
//       const sMatch = matchStr.match(/(\d{1,3}(?:\s*[\/-]\s*\d{1,2})?)/);
//       const oMatch = matchStr.match(/\(\s*([\d\.]+)/);
      
//       if (sMatch) scoreB = sMatch[1].replace(/\s+/g, "").replace("-", "/");
//       if (oMatch) oversB = oMatch[1];
//     }
//     let dateStr = "TBD", dayName = "TBD", timeStr = "7:30 PM IST";
//     let matchDate: Date | null = null;
//     let _isDesktop = false;
    
//     const dateTimeMatch = block.match(/(([A-Za-z]{3,9}\s+\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9})(?:,?\s*\d{4})?)[,\s]+([A-Za-z]{3,9})[,\s]+(\d{1,2}:\d{2}\s*(?:AM|PM)\s*IST)/i);
    
//     if (dateTimeMatch) {
//       matchDate = parseDateStr(dateTimeMatch[1]);
//       if (matchDate) {
//         dateStr = fmtDate(matchDate);
//         dayName = dateTimeMatch[3].slice(0, 3);
//       }
//       timeStr = dateTimeMatch[4].toUpperCase();
//       _isDesktop = true;
//     } else {
//       const timeMatch = block.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)\s*IST)/i);
//       if (timeMatch) timeStr = timeMatch[1].toUpperCase();

//       if (resultText || /Completed/i.test(block)) {
//         matchDate = now;
//         dateStr = "Completed"; dayName = "";
//       }
//     }

//     const words = block.split(/\s+/);
//     const foundTeams: string[] = [];
//     for (const w of words) {
//       const cleanW = w.replace(/[^A-Z]/g, "");
//       if (TEAM_FULL[cleanW] && !foundTeams.includes(cleanW)) foundTeams.push(cleanW);
//     }
    
//     let venue = "TBD";
//     const teamsRegexStr = Object.keys(TEAM_FULL).join("|");
//     const venueMatch = block.match(new RegExp(`IST\\s+([A-Za-z\\s,]+?)\\s+(?:${teamsRegexStr})`, "i"));
//     const shortVenueMatch = block.match(new RegExp(`MATCH\\s+\\d+\\s+([A-Za-z\\s,]+?)\\s+(?:${teamsRegexStr})`, "i"));
//     let potentialVenue = venueMatch ? venueMatch[1].trim() : (shortVenueMatch ? shortVenueMatch[1].trim() : "");
//     potentialVenue = potentialVenue.replace(/\d{1,2}\s+[A-Za-z]{3,9}.*?(?:IST|AM|PM)/gi, "").replace(/\d{1,2}:\d{2}\s*(?:AM|PM)?\s*IST/gi, "").trim();
//     if (potentialVenue.length >= 3) venue = potentialVenue;

//     const teamA = foundTeams[0] || "TBD";
//     const teamB = foundTeams[1] || "TBD";
//     if (teamA === "TBD" && matchNo < 71) continue; 

//     const isPast = matchDate ? midnight(matchDate).getTime() < todayMidnight.getTime() : false;
//     const hasRealResult = !!resultText;
//     const status = (hasRealResult || isPast) ? "completed" : "upcoming";
//     const finalResult = resultText || (isPast ? "Pending Score" : undefined);

//     const newCard: InternalMatchCard = {
//       matchNo, date: dateStr, day: dayName, time: timeStr,
//       teamA, teamAFull: TEAM_FULL[teamA] || teamA,
//       teamB, teamBFull: TEAM_FULL[teamB] || teamB,
//       venue, status, result: finalResult,
//       _isDesktop, _hasRealResult: hasRealResult,
//       ...(scoreA && { _scoreA: scoreA }),
//       ...(scoreB && { _scoreB: scoreB }),
//       ...(oversA && { _oversA: oversA }),
//       ...(oversB && { _oversB: oversB }),
//     };

//     const existingCard = cardsMap.get(matchNo);
    
//     if (!existingCard) {
//       cardsMap.set(matchNo, newCard);
//     } else {
//       const merged: InternalMatchCard = { ...existingCard };

//       if (newCard._hasRealResult) {
//         merged.result = newCard.result;
//         merged._hasRealResult = true;
//       }

//       if (newCard.teamA !== "TBD" && merged.teamA === "TBD") {
//         merged.teamA = newCard.teamA;
//         merged.teamAFull = newCard.teamAFull;
//       }
//       if (newCard.teamB !== "TBD" && merged.teamB === "TBD") {
//         merged.teamB = newCard.teamB;
//         merged.teamBFull = newCard.teamBFull;
//       }
//       if (newCard.venue !== "TBD" && newCard.venue.length > 3) {
//         merged.venue = newCard.venue;
//       }

//       if (newCard.date !== "TBD" && newCard.date !== "Completed") {
//         merged.date = newCard.date;
//         merged.day = newCard.day;
//         merged.time = newCard.time;
//       }

//       const mergedDateObj = parseDateStr(merged.date + " 2026");
//       const mergedIsPast = mergedDateObj ? midnight(mergedDateObj).getTime() < todayMidnight.getTime() : false;
      
//       merged.status = (merged._hasRealResult || mergedIsPast) ? "completed" : "upcoming";
      
//       if (merged.status === "completed" && !merged._hasRealResult) {
//         merged.result = "Pending Score";
//       } else if (merged.status === "upcoming" && !merged._hasRealResult) {
//         merged.result = undefined;
//       }

//       if (newCard._scoreA) merged._scoreA = newCard._scoreA;
//       if (newCard._scoreB) merged._scoreB = newCard._scoreB;
//       if (newCard._oversA) merged._oversA = newCard._oversA;
//       if (newCard._oversB) merged._oversB = newCard._oversB;

//       cardsMap.set(matchNo, merged);
//     }
//   }

//   const cards = Array.from(cardsMap.values());
//   cards.sort((a: InternalMatchCard, b: InternalMatchCard) => a.matchNo - b.matchNo);

//   const cleanCards: MatchCard[] = cards.map(({ _isDesktop, _hasRealResult, _scoreA, _scoreB, _oversA, _oversB, ...rest }) => ({
//     ...rest,
//     scoreA: _scoreA,
//     scoreB: _scoreB,
//     oversA: _oversA,
//     oversB: _oversB
//   }) as MatchCard);

//   return { 
//     todayMatch: {} as TodayMatch,
//     recentMatch: {} as RecentMatch,
//     allCards: cleanCards,
//     rawCompletedMatches: cards.filter(c => c.status === "completed").sort((a: InternalMatchCard, b: InternalMatchCard) => b.matchNo - a.matchNo),
//     recentMatches: cleanCards.filter(c => c.status === "completed").sort((a: MatchCard, b: MatchCard) => b.matchNo - a.matchNo),
//     upcomingMatches: cleanCards.filter(c => c.status !== "completed") 
//   };
// }

// function parseAllStats(html: string, pointsTable: TeamRow[]) {
//   const tables = extractTables(html);
  
//   const parseGenericRows = (rows: string[][]) => {
//     return rows.filter(r => {
//       if (r.length < 3) return false;
//       const col0 = r[0]?.trim().toLowerCase();
//       const col1 = r[1]?.trim().toLowerCase();
//       return col0 !== "#" && col0 !== "rank" && col1 !== "player" && col1 !== "team";
//     }).map((row, index) => {
//       const rank = index + 1; 
//       let player = "", team = "", value = "", subValue = "";
//       const imgStrs = row[row.length - 1] || "[]";
//       const dataCells = row.slice(0, -1); 

//       const teamIdx = dataCells.findIndex((c, i) => i > 0 && /^[A-Z]{2,5}$/.test(c.trim()) && TEAM_FULL[c.trim()]);
      
//       if (teamIdx > 0) {
//         player = dataCells.slice(1, teamIdx).join(" ").trim();
//         team = dataCells[teamIdx].trim();
//         value = dataCells[teamIdx + 1]?.trim() || "";
//         subValue = dataCells[teamIdx + 2]?.trim() || ""; 
//       } else {
//         const raw = dataCells[1]?.trim() || "";
//         const mm = raw.match(/^(.*?)\s+([A-Z]{2,5})$/);
//         if (mm && TEAM_FULL[mm[2]]) {
//           player = mm[1]; team = mm[2];
//         } else {
//           player = raw;
//           team = dataCells[2]?.trim() || "";
//         }
//         value = dataCells[3]?.trim() || dataCells[dataCells.length - 1]?.trim() || "";
//         subValue = dataCells[4]?.trim() || ""; 
//       }

//       if (!team || !TEAM_FULL[team]) {
//         try {
//           if (imgStrs.startsWith("[")) {
//             const imgs: string[] = JSON.parse(imgStrs);
//             for (const url of imgs) {
//               const urlLower = url.toLowerCase();
//               const getFilename = (u: string) => u.split('/').pop()?.split('?')[0] || u;
//               const urlFilename = getFilename(urlLower);
//               if (urlFilename.match(/(cap|up|down|trend|arrow|icon|minus|plus)/)) continue;
//               const matchedTeam = pointsTable.find(t => {
//                 if (!t.logo) return false;
//                 const tFilename = getFilename(t.logo.toLowerCase());
//                 return tFilename === urlFilename || tFilename.replace(/\.[^/.]+$/, "") === urlFilename.replace(/\.[^/.]+$/, "");
//               });
//               if (matchedTeam) { team = matchedTeam.abbr; break; }
//               const foundAbbr = Object.keys(TEAM_FULL).find(abbr => {
//                 const parts = TEAM_FULL[abbr].toLowerCase().split(" ");
//                 return urlFilename.includes(abbr.toLowerCase()) || urlFilename.includes(parts[0]) || (parts.length > 1 && parts[1].length > 3 && urlFilename.includes(parts[1]));
//               });
//               if (foundAbbr) { team = foundAbbr; break; }
//             }
//           }
//         } catch {}
//       }
//       if (!team) team = "TBD";
//       return { rank, player, team, value, subValue };
//     });
//   };

//   const parsedTables = tables.map(t => parseGenericRows(extractRows(t)));

//   // Exact map to your 8 CDN tables, zero guesswork.
//   const rawHighest = parsedTables[0] || [];
//   const highestScores = rawHighest.map(r => ({ rank: r.rank, player: r.player, team: r.team, score: r.value }));

//   return {
//     highestScores,
//     extraStats: {
//       battingAvg: parsedTables[1] || [],
//       bowlingAvg: parsedTables[2] || [],
//       bestBowling: parsedTables[3] || [],
//       mostEcon: parsedTables[4] || [],
//       maxSixes: parsedTables[5] || [],
//       maxFours: parsedTables[6] || [],
//       boundaries: parsedTables[7] || [],
//     }
//   };
// }




// ─── CORS headers ─────────────────────────────────────────────────────────────

// const CORS_HEADERS = {
//   "Access-Control-Allow-Origin":  "*",
//   "Access-Control-Allow-Methods": "GET, OPTIONS",
//   "Access-Control-Allow-Headers": "Content-Type",
//   "Cache-Control": "no-store, no-cache, must-revalidate", // <-- ADD THIS LINE
// };

// const POINTS_TABLE_URL = "https://res.cloudinary.com/dflnsufit/raw/upload/v1778977742/sf360/scripts/IPL_Points_Table_2026.html";
// const CAPS_URL = "https://res.cloudinary.com/dflnsufit/raw/upload/v1778977754/sf360/scripts/IPL_Caps_2026.html";
// const MATCHES_URL = "https://res.cloudinary.com/dflnsufit/raw/upload/v1778978436/sf360/scripts/IPL_Fixtures_2026.html";
// const STATS_URL = "https://res.cloudinary.com/dflnsufit/raw/upload/v1778977593/sf360/scripts/ipl2026_dashboard.html"; // <-- Added this

export async function GET(_req: NextRequest) {
  return NextResponse.json({ message: "API temporarily paused for static mode" }, { status: 200 });

  // try {
  //   const searchParams = req.nextUrl.searchParams;
  //   const mode = searchParams.get("mode") || "latest"; // "latest" is default for frontend
  //   const nextCursor = searchParams.get("nextCursor");

  //   // ── MODE: LIST (For the Admin Panel) ──────────────────────────────────────
  //   if (mode === "list") {
  //     const params: CloudinaryApiParams = {
  //       resource_type: "raw",
  //       type: "upload",
  //       prefix: "sf360/scripts", // Looks inside your scripts folder
  //       max_results: 100,        // Raised to 100 because there are 4 files per day
  //     };
  //     if (nextCursor) params.next_cursor = nextCursor;

  //     const result = await cloudinary.api.resources(params);

  //     const files: ScriptFileMeta[] = result.resources
  //       .map((r: CloudinaryResource) => {
  //         const fileName = r.display_name || r.public_id.split("/").pop() || r.public_id;
  //         const reportDate = extractReportDate(fileName);
  //         return {
  //           id: r.public_id,
  //           fileName,
  //           url: r.secure_url,
  //           size: r.bytes,
  //           sizeFormatted: formatFileSize(r.bytes),
  //           createdAt: r.created_at,
  //           reportDate,
  //           reportDateFormatted: formatReportDate(reportDate),
  //         };
  //       })
  //       // 👇 Add the explicit types here
  //       .sort((a: ScriptFileMeta, b: ScriptFileMeta) => {
  //         // Sorts newest to oldest based on the date in the filename
  //         if (!a.reportDate && !b.reportDate) return 0;
  //         if (!a.reportDate) return 1;
  //         if (!b.reportDate) return -1;
  //         return b.reportDate.localeCompare(a.reportDate);
  //       });

  //     const datedFiles = files.filter(f => !!f.reportDate);

  //     return NextResponse.json({
  //       success: true,
  //       files: datedFiles,
  //       totalCount: datedFiles.length,
  //       pagination: {
  //         hasMore: !!result.next_cursor,
  //         nextCursor: result.next_cursor || null,
  //       },
  //     });
  //   }

  //  // ── MODE: LATEST (Auto-Detect Latest Available Data) ──────

  //   // 1. Ask Cloudinary to list the most recently uploaded Points Tables
  //   const listParams: CloudinaryApiParams = {
  //     resource_type: "raw",
  //     type: "upload",
  //     prefix: "sf360/scripts/IPL_Points_Table", 
  //     max_results: 10, // Check the last 10 uploads to find the newest date
  //   };

  //   const result = await cloudinary.api.resources(listParams);
    
  //   // 2. Extract the dates from the filenames and find the absolute newest one
  //   const validDates = result.resources
  //     .map((r: CloudinaryResource) => {
  //       const fileName = r.display_name || r.public_id.split("/").pop() || r.public_id;
  //       return extractReportDate(fileName);
  //     })
  //     .filter((date: string | null): date is string => !!date)
  //     .sort((a: string, b: string) => b.localeCompare(a)); // Sort newest to oldest

  //   if (validDates.length === 0) {
  //     throw new Error("No IPL data files found in Cloudinary.");
  //   }

  //   // 3. Format the newest date string (e.g., "2026_05_22")
  //   const targetDateStr = validDates[0].replace(/-/g, "_");
  //   const baseUrl = "https://res.cloudinary.com/dflnsufit/raw/upload/sf360/scripts";

  //   // 4. Instantly fetch all 4 files for this confirmed latest date
  //   const [pointsRes, capsRes, matchesRes, statsRes] = await Promise.all([
  //     fetch(`${baseUrl}/IPL_Points_Table_${targetDateStr}.html`, { cache: "no-store" }),
  //     fetch(`${baseUrl}/IPL_Caps_${targetDateStr}.html`,         { cache: "no-store" }),
  //     fetch(`${baseUrl}/IPL_Fixtures_${targetDateStr}.html`,      { cache: "no-store" }),
  //     fetch(`${baseUrl}/ipl2026_dashboard_${targetDateStr}.html`, { cache: "no-store" }),
  //   ]);

  //   if (!pointsRes.ok || !capsRes.ok) {
  //      throw new Error(`Failed to fetch core data for confirmed date: ${targetDateStr}`);
  //   }

  //   // 5. Extract the HTML
  //   const [pointsHtml, capsHtml, matchesHtml, statsHtml] = await Promise.all([
  //     pointsRes.text(), 
  //     capsRes.text(), 
  //     matchesRes.ok ? matchesRes.text() : Promise.resolve(""),
  //     statsRes.ok ? statsRes.text() : Promise.resolve("") 
  //   ]);

  //   // 👇 Everything below here stays exactly the same as your current code! 👇
  //   const pointsTable = parsePointsTable(pointsHtml);
  //   const { orange: orangeCap, purple: purpleCap } = parseCaps(capsHtml, pointsTable);
  //   // ...
    
  //   // 👇 ADD THIS LINE BACK IN
  //   const matchesData = parseMatches(matchesHtml); 
    
  //   // Replace the old parsedDashboard with this:
  //   const parsedDashboard = statsHtml ? parseAllStats(statsHtml, pointsTable) : {
  //     highestScores: [],
  //     extraStats: {
  //       battingAvg: [], bowlingAvg: [], bestBowling: [],
  //       mostEcon: [], maxSixes: [], maxFours: [], boundaries: []
  //     }
  //   };
  //   // Playoff Logic
  //   const getMatch = (no: number, fallbackA: string, fallbackB: string): MatchCard => {
  //     const match = matchesData.allCards.find(c => c.matchNo === no);
  //     const tA = (match?.teamA && match.teamA !== "TBD") ? match.teamA : fallbackA;
  //     const tB = (match?.teamB && match.teamB !== "TBD") ? match.teamB : fallbackB;
  //     return {
  //       matchNo: no,
  //       date: match?.date || "TBD",
  //       day: match?.day || "TBD",
  //       time: match?.time || "7:30 PM IST",
  //       teamA: tA,
  //       teamAFull: TEAM_FULL[tA] || tA,
  //       teamB: tB,
  //       teamBFull: TEAM_FULL[tB] || tB,
  //       venue: match?.venue || "TBD",
  //       status: match?.status || "upcoming",
  //       result: match?.result
  //     };
  //   };

  //   // Removed dynamic top4 fallback to ensure playoffs stay strictly "TBD" until officially scheduled
  //   const playoffs: PlayoffData = {
  //     q1: getMatch(71, "TBD", "TBD"),
  //     eliminator: getMatch(72, "TBD", "TBD"),
  //     q2: getMatch(73, "TBD", "TBD"),
  //     final: getMatch(74, "TBD", "TBD"),
  //   };

  //   // Construct Today/Recent match from matchesData
  //   const now = new Date();
  //   if (now.getFullYear() < 2026) now.setFullYear(2026);
  //   const todayMidnight = midnight(now);
  //   const upcoming = matchesData.allCards.filter(c => c.status !== "completed");
  //   const todayCards = upcoming.filter(c => {
  //     const d = parseDateStr(c.date + ` 2026`);
  //     return d && midnight(d).getTime() === todayMidnight.getTime();
  //   });
  //   const todaySource = todayCards[0] ?? upcoming[0];
  //   const todayMatch = {
  //     teamA: todaySource?.teamA || "TBD", teamAFull: todaySource?.teamAFull || "TBD",
  //     teamB: todaySource?.teamB || "TBD", teamBFull: todaySource?.teamBFull || "TBD",
  //     time: todaySource?.time || "7:30 PM IST", venue: todaySource?.venue || "TBD",
  //     matchNo: todaySource?.matchNo || 1, totalMatches: 74
  //   };

  //  // ✅ THE FIX: Always grab the chronologically latest match
  //   const lastComp = matchesData.rawCompletedMatches[0];
  //   const recentMatch = {
  //     teamA: lastComp?.teamA || "TBD", teamB: lastComp?.teamB || "TBD",
  //     result: lastComp?.result || "No recent match",
  //     scoreA: lastComp?._scoreA, scoreB: lastComp?._scoreB,
  //     oversA: lastComp?._oversA, oversB: lastComp?._oversB,
  //   };

  //   // const teamLogos: Record<string, string> = {};
  //   // pointsTable.forEach(t => { if (t.logo) teamLogos[t.abbr] = t.logo; });
    
  //   // ADD this in its place:
  //   const teamLogos: Record<string, string> = Object.fromEntries(
  //     Object.keys(TEAM_FULL).map(abbr => [abbr, `/teams/${abbr}.png`])
  //   );

  //   const response: IPLStatsResponse = {
  //     teamLogos, pointsTable, orangeCap, purpleCap, todayMatch, recentMatch,
  //     // Removed the filter so all past matches stay in the list!
  //     recentMatches: matchesData.recentMatches,
  //     upcomingMatches: matchesData.upcomingMatches,
  //     highestScores: parsedDashboard.highestScores,  
  //     extraStats: parsedDashboard.extraStats,       // <-- This passes all 8 categories to the frontend!
  //     playoffs
  //   };

  //   return NextResponse.json(response, { status: 200, headers: CORS_HEADERS });
  // } catch  {
  //   return NextResponse.json({ error: "Failed to load stats" }, { status: 500, headers: CORS_HEADERS });
  // }
}
export async function OPTIONS() {
  return NextResponse.json({}, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
