// scripts/seed-roar-demo.ts
// Seeds the ROAR demo room (room_1794564790526_juxls71):
//   • Auction journey "Auction-93993"  – 15 days x (poll + debate + prediction), fan posts stored as comments
//   • 3 matches x 15 engagement cards (match + moments + engagements + votes + comments)
// All rows keep their own (backdated / future-dated) createdAt. Nothing goes through the public API, so no
// points, notifications or "now" timestamps are produced.
//
//   npx tsx scripts/seed-roar-demo.ts                       # DRY RUN (no AWS access needed, writes nothing)
//   npx tsx scripts/seed-roar-demo.ts --out plan.json       # DRY RUN + dump the full plan to a file
//   npx tsx scripts/seed-roar-demo.ts --commit              # writes (dev tables only, APP_ENV=dev)
//   npx tsx scripts/seed-roar-demo.ts --delete              # removes exactly the rows this script creates
//
// Flags: --force-env (allow non-dev tables, use with care)
import "./data/loadEnv"; // must stay first: loads .env.local before the DynamoDB client is created
import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../lib/dynamodb";
import { TABLES } from "../lib/tableNames";
import { withEngagementGsiKeys } from "../lib/engagementList";
import { AUCTION_DAYS } from "./data/roarAuctionDays";

const ARGS = process.argv.slice(2);
const has = (f: string) => ARGS.includes(f);
const COMMIT = has("--commit");
const DELETE = has("--delete");
const FORCE_ENV = has("--force-env");
const OUT = ARGS.includes("--out") ? ARGS[ARGS.indexOf("--out") + 1] : "";

const BATCH = "roar-demo-1";
const DEFAULT_ROOM_ID = "room_1794564790526_juxls71"; // dev room
const ROOM_ID = ARGS.includes("--room-id") ? String(ARGS[ARGS.indexOf("--room-id") + 1] || "").trim() : DEFAULT_ROOM_ID;
// Use when the matches already exist (created via POST /api/matches): do not write/overwrite/delete the MATCH#META rows.
const SKIP_MATCH_META = has("--skip-match-meta");
const AUCTION_ID = "Auction-93993";
const FAR_FUTURE = Date.UTC(2027, 11, 31);
const DURATION_MIN = 4320;
const SEED = { seedDemo: true, seedBatchId: BATCH };

// ───────────────────────── helpers ─────────────────────────
const h = (s: string, n = 6) => createHash("sha1").update(s).digest("hex").slice(0, n);
const hInt = (s: string) => parseInt(h(s, 8), 16);
/** IST wall-clock -> epoch ms */
const istMs = (y: number, mo: number, d: number, hh: number, mm: number) => Date.UTC(y, mo - 1, d, hh, mm) - 330 * 60000;
const fmtIst = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }) + " IST";

// ───────────────────────── users ─────────────────────────
interface User { key: string; entityId: string; name: string; uid: string; username: string; avatarUrl?: string; badge?: string; found: boolean }
// Real values taken from IdentityAndAccess (USER#META). `entityId` is only the table key — `uid` is the userId
// the app uses for votes/comments. Prince's META has no userId field, so it follows the app's convention
// (email with "@" and "." replaced by "_"), the same normalisation the engagements API uses.
const USER_DEFS = [
  {
    key: "prince", entityId: "princechandu357@gmail.com", email: "princechandu357@gmail.com", name: "Prince Chandu",
    uid: "princechandu357_gmail_com",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1790597722/profile-images/nih47zfxzkjmu1aeacrd.jpg",
  },
  {
    key: "chandu", entityId: "chandu.srikakulam@sportsfan360.com", email: "chandu.srikakulam@sportsfan360.com", name: "Chandu Srikakulam",
    uid: "chandu_srikakulam_sportsfan360_com",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1790954815/profile-images/cg5pb1nudvoxk9zukwjv.jpg",
  },
  {
    key: "albrain", entityId: "albrain_antony_sportsfan360_com", email: "albrain.antony@sportsfan360.com", name: "Albrain Antony",
    uid: "albrain_antony_sportsfan360_com",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1790960409/profile-images/djenn0njdscp3sllub5e.jpg",
  },
  {
    key: "rahul", entityId: "rahul.yadav@sportsfan360.com", email: "rahul.yadav@sportsfan360.com", name: "Rahul Yadav",
    uid: "rahul_yadav_sportsfan360_com",
    avatarUrl: "https://lh3.googleusercontent.com/a/ACg8ocIWJL8fDOjQ_Y-aaLPtCdeN_-qJjkogk_lu_FJDSp5aczXtw38=s96-c",
  },
];

async function resolveUsers(): Promise<User[]> {
  return USER_DEFS.map((d) => ({
    key: d.key, entityId: d.entityId, name: d.name, uid: d.uid, username: d.name, avatarUrl: d.avatarUrl, badge: "Fan", found: true,
  }));
}

// ───────────────────────── plan model ─────────────────────────
type TableKey = "SocialAndContent" | "MatchMoments" | "SportsData";
interface Op { table: TableKey; key: Record<string, string>; item: Record<string, any>; kind: string; at: number }
const ops: Op[] = [];
const tableName = (t: TableKey) => TABLES[t];
const push = (table: TableKey, item: Record<string, any>, kind: string, at: number) => {
  const key: Record<string, string> = table === "SocialAndContent" ? { contentId: item.contentId, sk: item.sk } : { entityId: item.entityId, sk: item.sk };
  ops.push({ table, key, item, kind, at });
};

const COMMENT_POOL = [
  "Good question — I'm going with my gut on this one.",
  "Context matters here; watch the next few overs.",
  "Love this format, makes the match feel alive.",
  "Respect to both sides today.",
  "Not convinced yet, let's see how the next phase plays out.",
  "This is where the match could turn.",
  "Bold call, but I'll back it.",
  "Tough one. Both sides have a case.",
];

type EngType = "poll" | "prediction" | "debate" | "question" | "express";
const TAGS: Record<EngType, string[]> = {
  poll: ["📊 POLL", "⚡ MATCH MOMENT"],
  prediction: ["🎯 PREDICTION", "💎 +10 SXP"],
  debate: ["⚖️ DEBATE", "🔥 LIVE VERDICT"],
  question: ["❓ QUESTION", "⚡ MATCH MOMENT"],
  express: ["⚡ EXPRESS", "🚀 PULSE"],
};

interface CardInput {
  idKey: string;
  createdAt: number;
  type: EngType;
  title: string;
  subtitle: string;
  options: string[];
  matchId?: string;
  momentId?: string;
  seriesId?: string;
  matchPhase?: string;
  anchorTrigger?: string;
  overNumber?: string;
  innings?: number;
  auctionId?: string;
  questionId?: string;
  voters: User[];
  comments: { user: User; text: string; at: number }[];
  creator: User;
}

function addCard(c: CardInput): string {
  const id = `eng_${c.createdAt}_${h(c.idKey)}`;
  const optIds = (n: number) =>
    c.type === "question" ? Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i))
    : c.type === "prediction" ? Array.from({ length: n }, (_, i) => (i === 0 ? "left" : i === 1 ? "right" : String(i + 1)))
    : Array.from({ length: n }, (_, i) => String(i + 1));

  // votes (not for text-response express cards)
  const ids = optIds(c.options.length);
  const votes: { user: User; optionId: string; at: number }[] = [];
  if (c.type !== "express") {
    for (const u of c.voters) {
      const optionId = ids[hInt(u.key + id) % ids.length];
      votes.push({ user: u, optionId, at: c.createdAt + (60 + (hInt(id + u.key) % 300)) * 1000 });
    }
  }
  const options = c.options.map((text, i) => ({
    id: ids[i], text, votes: votes.filter((v) => v.optionId === ids[i]).length,
  }));
  const totalVotes = votes.length;
  const common = { durationMinutes: DURATION_MIN, timerMinutes: DURATION_MIN, expiresAt: FAR_FUTURE, startTime: c.createdAt, scheduledStartTime: c.createdAt };
  const data: Record<string, any> = {};
  if (c.type === "poll") data.pollData = { question: c.title, options, totalVotes, correctAnswer: "", answer: "", ...common };
  if (c.type === "prediction") data.predictionData = { question: c.title, options, coinStake: 10, totalVotes, status: "open", winningChoiceId: null, correctAnswer: "", answer: "", ...common };
  if (c.type === "debate") data.debateData = { question: c.title, topic: c.title, options, totalVotes, status: "open", winningChoiceId: null, verdict: null, ...common };
  if (c.type === "question") data.questionData = { question: c.title, options, correctOptionId: "", explanation: "", postLock: "", pointsReward: 10, ...common };
  if (c.type === "express")
    data.expressData = { question: c.title, prompt: c.title, responseMode: "text", placeholder: "Write your thoughts...", options: [], totalVotes: 0, totalResponses: c.comments.length, ...common };

  const engagement: Record<string, any> = {
    id,
    type: c.type,
    title: c.title,
    subtitle: c.subtitle,
    tags: TAGS[c.type],
    sport: "cricket",
    status: "active",
    creatorId: c.creator.uid,
    creatorName: c.creator.username,
    ...data,
    ...(c.type === "express" ? { inputPlaceholder: "Write your thoughts..." } : {}),
    postLock: "",
    options: c.type === "express" ? [] : options,
    winningChoiceId: null,
    outcomeNotes: null,
    resolvedAt: null,
    resolvedBy: null,
    timerMinutes: DURATION_MIN,
    durationMinutes: DURATION_MIN,
    likes: 0,
    shares: 0,
    totalEngaged: votes.length || c.comments.length,
    participationsCount: votes.length,
    commentsCount: c.comments.length,
    startTime: c.createdAt,
    scheduledStartTime: c.createdAt,
    postingTime: c.createdAt,
    isScheduled: false,
    notifiedLive: true,
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
    expiresAt: FAR_FUTURE,
    category: "match_moment",
    source: "match_moment",
    isMatchMoment: true,
    ...(c.seriesId ? { seriesId: c.seriesId } : {}),
    ...(c.matchId ? { matchId: c.matchId } : {}),
    ...(c.momentId ? { momentId: c.momentId, loopId: c.momentId } : {}),
    ...(c.matchPhase ? { matchPhase: c.matchPhase } : {}),
    ...(c.anchorTrigger ? { anchorTrigger: c.anchorTrigger } : {}),
    ...(c.overNumber ? { overNumber: c.overNumber } : {}),
    ...(c.innings ? { innings: c.innings } : {}),
    ...(c.auctionId ? { auctionId: c.auctionId } : {}),
    ...(c.questionId ? { questionId: c.questionId } : {}),
    roomId: ROOM_ID,
    ...SEED,
  };

  push("SocialAndContent", withEngagementGsiKeys({ contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META", entityId: `ENGAGEMENT#${c.type.toUpperCase()}`, ...engagement }), `engagement:${c.type}`, c.createdAt);
  push("MatchMoments", withEngagementGsiKeys({ entityId: `MATCH#${c.matchId || "GLOBAL"}`, sk: `LOOP#${c.momentId || id}`, contentId: `ENGAGEMENT#${id}`, ...engagement }), "engagement-mirror", c.createdAt);

  for (const v of votes) {
    push("SocialAndContent", {
      contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${v.user.uid}`, entityId: `VOTE#${c.type.toUpperCase()}`,
      userId: v.user.uid, userName: v.user.username, engagementId: id, type: c.type,
      selectedOptionId: v.optionId, votedAt: v.at, timestamp: v.at, createdAt: v.at, ...SEED,
    }, "vote", v.at);
    push("SocialAndContent", {
      contentId: `ENGAGEMENT#${id}`, sk: `USER#${v.user.uid}`, entityId: `USER_ENGAGEMENT#${c.type.toUpperCase()}`,
      userId: v.user.uid, engagementId: id, type: c.type, firstEngagedAt: v.at, updatedAt: v.at, ...SEED,
    }, "user-marker", v.at);
  }

  for (const cm of c.comments) {
    const commentId = `comm_${cm.at}_${h(id + cm.user.key + cm.text)}`;
    push("SocialAndContent", {
      contentId: `ENGAGEMENT#${id}`, sk: `COMMENT#${commentId}`, entityId: `COMMENT#${id}`,
      id: commentId, commentId, engagementId: id, parentId: null,
      authorUid: cm.user.uid, authorUsername: cm.user.username, authorAvatarUrl: cm.user.avatarUrl, authorBadge: cm.user.badge,
      text: cm.text, createdAt: cm.at, likesCount: 0,
      ...(c.matchId ? { matchId: c.matchId } : {}), ...(c.momentId ? { momentId: c.momentId } : {}), ...(c.seriesId ? { seriesId: c.seriesId } : {}),
      roomId: ROOM_ID, ...SEED,
    }, "comment", cm.at);
  }
  return id;
}

// ───────────────────────── auction ─────────────────────────
function buildAuction(users: User[]) {
  const desk = users.find((u) => u.key === "chandu")!;
  AUCTION_DAYS.forEach((day, di) => {
    const [y, mo, d] = day.date.split("-").map(Number);
    const n = String(di + 1).padStart(2, "0");
    const pollAt = istMs(y, mo, d, 14, 30);
    const debateAt = istMs(y, mo, d, 15, 5);
    const predAt = istMs(y, mo, d, 15, 10);
    const base = { auctionId: AUCTION_ID, matchPhase: day.phase, creator: desk, voters: users };

    // 6 fan posts = comments, 5 minutes apart after the 2:30 PM desk/poll card
    const comments = day.msgs.map((text, i) => ({ user: users[i % users.length], text, at: pollAt + (i + 1) * 5 * 60000 }));

    addCard({
      ...base, idKey: `auction-${day.date}-poll`, createdAt: pollAt, type: "poll",
      title: day.poll, subtitle: day.admin, options: day.choices, questionId: `Q-93993-D${n}-1`,
      anchorTrigger: `${day.title} · ${AUCTION_ID}`, comments,
    });
    addCard({
      ...base, idKey: `auction-${day.date}-debate`, createdAt: debateAt, type: "debate",
      title: `${day.title}: where do you stand?`, subtitle: `Fan debate · ${day.title}`, options: ["Back it", "Challenge it"], questionId: `Q-93993-D${n}-2`,
      anchorTrigger: `${day.title} · ${AUCTION_ID}`, comments: [],
    });
    addCard({
      ...base, idKey: `auction-${day.date}-prediction`, createdAt: predAt, type: "prediction",
      title: "Who will make the biggest impact?", subtitle: "Fan prediction · no cash / no stakes", options: ["Overseas star", "Indian talent", "Surprise pick"], questionId: `Q-93993-D${n}-3`,
      anchorTrigger: `${day.title} · ${AUCTION_ID}`, comments: [],
    });
  });
}

// ───────────────────────── matches ─────────────────────────
interface Card { off: number; type: EngType; title: string; options?: string[]; phase: string; label: string; innings?: number }
interface MatchDef {
  matchId: string; short: string; seriesId: string; team1: string; team2: string; tournament: string; gender: "male" | "female";
  format: string; stage: string; venue: string; city: string; date: string; timeLabel: string; startMs: number; cards: Card[];
}

const odiCards = (A: string, B: string, bands: string[]): Card[] => [
  { off: -120, type: "poll", title: "Pick your camp: who are you backing?", options: [A, B], phase: "PRE-MATCH", label: "T–2h" },
  { off: -60, type: "poll", title: "Pitch report: what will the surface favour?", options: ["Batters", "Seamers", "Spinners"], phase: "PRE-MATCH", label: "T–60m" },
  { off: -45, type: "prediction", title: "Who will win the toss?", options: [A, B], phase: "PRE-MATCH", label: "T–45m" },
  { off: -30, type: "debate", title: "Toss decision: bat first or bowl first?", options: ["Bat first", "Bowl first"], phase: "PRE-MATCH", label: "T–30m" },
  { off: -5, type: "express", title: "Anthems are on. Drop your first reaction.", phase: "PRE-MATCH", label: "T–5m" },
  { off: 45, type: "poll", title: "Powerplay done: which side is ahead?", options: [A, B], phase: "1ST INNINGS", label: "Powerplay end", innings: 1 },
  { off: 95, type: "prediction", title: "First-innings total: which band?", options: bands, phase: "1ST INNINGS", label: "Mid-innings", innings: 1 },
  { off: 150, type: "debate", title: "Final 10 overs: attack or consolidate?", options: ["Attack", "Consolidate"], phase: "1ST INNINGS", label: "Death overs", innings: 1 },
  { off: 205, type: "question", title: "Innings end: is the target gettable?", options: ["Comfortably", "A fair contest", "Difficult"], phase: "1ST INNINGS", label: "End of innings", innings: 1 },
  { off: 225, type: "prediction", title: "Who wins the match?", options: [A, B], phase: "INNINGS BREAK", label: "Innings break" },
  { off: 265, type: "poll", title: "Chase update: how is the tempo?", options: ["Ahead of the rate", "On the rate", "Behind the rate"], phase: "2ND INNINGS", label: "Chase powerplay", innings: 2 },
  { off: 330, type: "express", title: "Mid-chase pulse: one line on where the game is.", phase: "2ND INNINGS", label: "Mid-chase", innings: 2 },
  { off: 390, type: "debate", title: "Biggest turning point so far?", options: ["Early wickets", "The middle-over partnership", "A single big over"], phase: "2ND INNINGS", label: "Late chase", innings: 2 },
  { off: 450, type: "poll", title: "Death overs: who holds their nerve?", options: [A, B], phase: "2ND INNINGS", label: "Final overs", innings: 2 },
  { off: 510, type: "express", title: "Full time: your standout moment from today.", phase: "POST-MATCH", label: "Result" },
];

const testDay3Cards = (A: string, B: string): Card[] => [
  { off: -60, type: "poll", title: "Day 3 pitch: what will the surface do?", options: ["Help batters", "Help seamers", "Start to turn"], phase: "PRE-DAY", label: "T–60m" },
  { off: -30, type: "prediction", title: "Day 3, session 1: who wins it?", options: [A, B], phase: "PRE-DAY", label: "T–30m" },
  { off: 0, type: "express", title: "Day 3 is underway. What's your read on the morning?", phase: "SESSION 1", label: "Start of play" },
  { off: 20, type: "debate", title: "New ball: take it straight away or wait?", options: ["Take it now", "Wait"], phase: "SESSION 1", label: "New ball" },
  { off: 60, type: "poll", title: "Session 1 so far: who is ahead?", options: [A, B], phase: "SESSION 1", label: "Mid-session" },
  { off: 110, type: "prediction", title: "A milestone partnership before lunch?", options: ["Yes", "No"], phase: "SESSION 1", label: "Before lunch" },
  { off: 130, type: "express", title: "Lunch: what should the plan be for session 2?", phase: "LUNCH", label: "Lunch" },
  { off: 200, type: "debate", title: "Declaration or push for more runs?", options: ["Declare", "Bat on"], phase: "SESSION 2", label: "Session 2" },
  { off: 260, type: "poll", title: "Session 2 verdict: who won it?", options: [A, B, "Even"], phase: "SESSION 2", label: "Session 2 end" },
  { off: 290, type: "prediction", title: "Session 3: how many wickets?", options: ["0–2", "3–4", "5+"], phase: "TEA", label: "Tea" },
  { off: 330, type: "poll", title: "Is the pitch deteriorating?", options: ["Yes", "Not yet", "Hard to say"], phase: "SESSION 3", label: "Session 3" },
  { off: 370, type: "debate", title: "Review calls: are the umpires getting it right?", options: ["Mostly yes", "Mixed", "No"], phase: "SESSION 3", label: "Late session" },
  { off: 410, type: "poll", title: "Who is ahead at stumps?", options: [A, B, "Level"], phase: "SESSION 3", label: "Final hour" },
  { off: 430, type: "express", title: "Stumps: your Day 3 verdict.", phase: "STUMPS", label: "Stumps" },
  { off: 440, type: "prediction", title: "How will this Test finish?", options: [`${A} win`, `${B} win`, "Draw"], phase: "STUMPS", label: "Stumps" },
];

const MATCHES: MatchDef[] = [
  {
    matchId: "AUS-NZ-2026-TEST1-D3", short: "AUSNZ", seriesId: "AUS-NZ-2026-TEST", team1: "Australia", team2: "New Zealand",
    tournament: "Australia v New Zealand Test Series 2026", gender: "male", format: "Test", stage: "1st Test – Day 3",
    venue: "Perth Stadium", city: "Perth", date: "2026-12-11", timeLabel: "10:00 AM AWST (7:30 AM IST)",
    startMs: istMs(2026, 12, 11, 7, 30), cards: testDay3Cards("Australia", "New Zealand"),
  },
  {
    matchId: "INDAW-ENGAW-2026-ODI2", short: "INDAWENGAW", seriesId: "INDAW-ENGAW-2026-ODI", team1: "India A Women", team2: "England A Women",
    tournament: "India A Women v England A Women ODI Series 2026", gender: "female", format: "ODI", stage: "2nd ODI",
    venue: "Wankhede Stadium", city: "Mumbai", date: "2026-12-11", timeLabel: "9:00 AM IST",
    startMs: istMs(2026, 12, 11, 9, 0), cards: odiCards("India A Women", "England A Women", ["Below 220", "220–259", "260+"]),
  },
  {
    matchId: "IND-SL-2026-ODI1", short: "INDSL", seriesId: "IND-SL-2026-ODI", team1: "India", team2: "Sri Lanka",
    tournament: "India v Sri Lanka ODI Series 2026", gender: "male", format: "ODI", stage: "1st ODI (Day/Night)",
    venue: "Dr. Y.S. Rajasekhara Reddy ACA–VDCA Cricket Stadium", city: "Visakhapatnam", date: "2026-12-13", timeLabel: "2:00 PM IST (8:30 AM GMT)",
    startMs: istMs(2026, 12, 13, 14, 0), cards: odiCards("India", "Sri Lanka", ["Below 270", "270–319", "320+"]),
  },
];

const EVENT_LABEL: Record<EngType, string> = { poll: "Poll", prediction: "Prediction", debate: "Debate", question: "Question", express: "Express" };

function buildMatches(users: User[]) {
  const desk = users.find((u) => u.key === "chandu")!;
  for (const m of MATCHES) {
    const matchCreated = m.startMs - 3 * 24 * 3600 * 1000;
    const meta = {
      match_id: m.matchId, matchId: m.matchId, seriesId: m.seriesId,
      team1: m.team1, team2: m.team2,
      team1_short: m.team1.split(" ")[0].slice(0, 3).toUpperCase(), team2_short: m.team2.split(" ")[0].slice(0, 3).toUpperCase(),
      tournament: m.tournament, season: 2026, gender: m.gender, format: m.format, stage: m.stage,
      venue: m.venue, city: m.city, date: m.date, time: m.timeLabel, status: "upcoming",
      createdAt: matchCreated, updatedAt: matchCreated, ...SEED,
    };
    if (!SKIP_MATCH_META)
      for (const t of ["MatchMoments", "SportsData"] as TableKey[])
        push(t, { entityId: `MATCH#${m.matchId}`, pk: `MATCH#${m.matchId}`, sk: "MATCH#META", ...meta }, "match", matchCreated);

    m.cards.forEach((c, i) => {
      const nn = String(i + 1).padStart(2, "0");
      const at = m.startMs + c.off * 60000;
      const momentId = `MM-${m.short}-${nn}`;
      const matchMoment = c.title;
      const payload = {
        momentId, matchId: m.matchId, seriesId: m.seriesId, innings: c.innings || 1, phase: c.phase, overs: c.label, format: m.format, stage: m.stage,
        venue: m.venue, score: "", timingLabel: c.label, ...(c.off < 0 ? { preMatchOffset: c.label } : {}), timelineOrder: c.off,
        matchOverTimestamp: c.label, event: EVENT_LABEL[c.type], matchMoment, description: `${m.team1} vs ${m.team2} · ${m.stage}`,
        status: "active", createdAt: at, updatedAt: at, ...SEED,
      };
      for (const t of ["MatchMoments", "SportsData"] as TableKey[])
        push(t, { entityId: `MATCH#${m.matchId}`, pk: `MATCH#${m.matchId}`, sk: `MOMENT#${momentId}`, ...payload }, "moment", at);

      // 2 comments (all voters vote) — authors vary per card
      const a = users[i % users.length], b = users[(i + 1) % users.length];
      const comments = [
        { user: a, text: COMMENT_POOL[hInt(`${m.matchId}${nn}a`) % COMMENT_POOL.length], at: at + 3 * 60000 },
        { user: b, text: COMMENT_POOL[hInt(`${m.matchId}${nn}b`) % COMMENT_POOL.length], at: at + 5 * 60000 },
      ];
      addCard({
        idKey: `match-${m.matchId}-${nn}`, createdAt: at, type: c.type, title: c.title,
        subtitle: `${m.team1} vs ${m.team2} · ${m.stage}`, options: c.options || [],
        matchId: m.matchId, momentId, seriesId: m.seriesId, matchPhase: c.phase, anchorTrigger: `${m.stage} — ${c.label}`, overNumber: c.label, innings: c.innings,
        voters: users, comments, creator: desk,
      });
    });
  }
}

// ───────────────────────── run ─────────────────────────
async function inChunks<T>(arr: T[], size: number, fn: (x: T) => Promise<unknown>) {
  for (let i = 0; i < arr.length; i += size) await Promise.all(arr.slice(i, i + size).map(fn));
}

(async () => {
  const mode = DELETE ? "DELETE" : COMMIT ? "COMMIT" : "DRY RUN";
  console.log(`\n=== ROAR demo seed · ${mode} · batch ${BATCH} ===`);
  if (!/^room_[A-Za-z0-9_]+$/.test(ROOM_ID)) { console.error(`Invalid --room-id: "${ROOM_ID}"`); process.exit(1); }
  console.log(`Room ${ROOM_ID} · Auction ${AUCTION_ID}${SKIP_MATCH_META ? " · match META rows skipped" : ""}`);
  console.log(`Tables: SocialAndContent=${TABLES.SocialAndContent}  MatchMoments=${TABLES.MatchMoments}  SportsData=${TABLES.SportsData}  IdentityAndAccess=${TABLES.IdentityAndAccess}`);
  if ((COMMIT || DELETE) && !FORCE_ENV && !TABLES.SocialAndContent.endsWith("-dev")) {
    console.error("\nRefusing to write: tables are not the -dev tables. Set APP_ENV=dev (or pass --force-env if you really mean it).");
    process.exit(1);
  }

  const users = await resolveUsers();
  console.log("\nUsers:");
  for (const u of users) console.log(`  ${u.name.padEnd(18)} entityId=USER#${u.entityId}  ->  userId/authorUid=${u.uid}  username=${u.username}`);

  buildAuction(users);
  buildMatches(users);

  // ── summary
  const byKind = new Map<string, number>();
  const byTable = new Map<string, number>();
  for (const o of ops) {
    byKind.set(o.kind, (byKind.get(o.kind) || 0) + 1);
    byTable.set(tableName(o.table), (byTable.get(tableName(o.table)) || 0) + 1);
  }
  console.log("\nRows by table:");
  for (const [k, v] of byTable) console.log(`  ${k.padEnd(28)} ${v}`);
  console.log("Rows by kind:");
  for (const [k, v] of [...byKind].sort()) console.log(`  ${k.padEnd(28)} ${v}`);

  const cards = ops.filter((o) => o.kind.startsWith("engagement:"));
  const auctionCards = cards.filter((o) => o.item.auctionId);
  console.log(`\nEngagement cards: ${cards.length}  (auction ${auctionCards.length}, matches ${cards.length - auctionCards.length})`);
  for (const m of MATCHES) {
    console.log(`\n— ${m.team1} vs ${m.team2} · ${m.stage} · ${m.matchId}  (start ${fmtIst(m.startMs)})`);
    for (const o of cards.filter((x) => x.item.matchId === m.matchId).sort((a, b) => a.at - b.at))
      console.log(`   ${fmtIst(o.at).padEnd(24)} ${String(o.item.type).padEnd(10)} ${o.item.id}  ${o.item.title}`);
  }
  console.log(`\n— Auction ${AUCTION_ID} (first 2 days + last day)`);
  const days = [...new Set(auctionCards.map((o) => String(o.item.questionId).split("-")[2]))];
  for (const dKey of [days[0], days[1], days[days.length - 1]]) {
    for (const o of auctionCards.filter((x) => String(x.item.questionId).split("-")[2] === dKey).sort((a, b) => a.at - b.at)) {
      console.log(`   ${fmtIst(o.at).padEnd(24)} ${String(o.item.type).padEnd(10)} ${o.item.questionId}  ${o.item.id}  ${o.item.title}`);
      if (o.item.type === "poll")
        for (const c of ops.filter((x) => x.kind === "comment" && x.item.engagementId === o.item.id).sort((a, b) => a.at - b.at))
          console.log(`        ${fmtIst(c.at).padEnd(24)} 💬 ${c.item.authorUsername}: ${c.item.text}`);
    }
  }
  const nEng = ops.filter((o) => o.item.source === "match_moment" && o.kind.startsWith("engagement:"));
  console.log(`\nChecks: all ${nEng.length} cards have source=match_moment/isMatchMoment, roomId=${ROOM_ID}, seedDemo=true, notifiedLive=true, isScheduled=false`);
  const bad = nEng.filter((o) => !(o.item.isMatchMoment && o.item.roomId === ROOM_ID && o.item.seedDemo && o.item.notifiedLive === true && o.item.isScheduled === false));
  console.log(bad.length ? `  !! ${bad.length} cards violate the checks` : "  OK");

  if (OUT) {
    writeFileSync(OUT, JSON.stringify(ops.map((o) => ({ table: tableName(o.table), kind: o.kind, at: fmtIst(o.at), key: o.key, item: o.item })), null, 2));
    console.log(`\nFull plan written to ${OUT}`);
  }

  if (DELETE) {
    await inChunks(ops, 20, (o) => docClient.send(new DeleteCommand({ TableName: tableName(o.table), Key: o.key })));
    console.log(`\nDeleted ${ops.length} rows.`);
  } else if (COMMIT) {
    await inChunks(ops, 20, (o) => docClient.send(new PutCommand({ TableName: tableName(o.table), Item: o.item })));
    console.log(`\nWrote ${ops.length} rows.`);
  } else {
    console.log("\nDRY RUN — nothing was written. Re-run with --commit to write (dev tables only).");
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
