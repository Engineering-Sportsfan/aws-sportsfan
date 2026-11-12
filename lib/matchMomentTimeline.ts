// lib/matchMomentTimeline.ts
// Canonical Match Moment timeline ordering, phase inference, pre-match/post-match presets,
// and display formatting shared across API routes and Core Engine admin selectors.

export interface MomentPresetOption {
  id: string;
  timingLabel: string;
  label: string;
  defaultAnchor: string;
  phase: "Pre Match" | "1st Innings" | "Innings Break" | "2nd Innings" | "Post Match";
  defaultOvers?: string;
}

export const PRE_MATCH_TIMING_PRESETS: MomentPresetOption[] = [
  {
    id: "PM-DISCOVERY",
    timingLabel: "T–48h",
    label: "Match Discovery (T–48h)",
    defaultAnchor: "Match Discovery",
    phase: "Pre Match",
  },
  {
    id: "PM-DAY-BEFORE",
    timingLabel: "T–24h to Start-of-match",
    label: "Before match day (T–24h to Start-of-match)",
    defaultAnchor: "Before match day",
    phase: "Pre Match",
  },
  {
    id: "PM-2H",
    timingLabel: "T–2h",
    label: "Before match (T–2h)",
    defaultAnchor: "Before match",
    phase: "Pre Match",
  },
  {
    id: "PM-60M",
    timingLabel: "T–60m",
    label: "Before toss (T–60m)",
    defaultAnchor: "Before toss",
    phase: "Pre Match",
  },
  {
    id: "PM-TOSS",
    timingLabel: "T–30m",
    label: "Toss time (T–30m)",
    defaultAnchor: "Toss time",
    phase: "Pre Match",
  },
  {
    id: "PM-AFTER-TOSS-29",
    timingLabel: "T–29m",
    label: "After toss (T–29m)",
    defaultAnchor: "After toss",
    phase: "Pre Match",
  },
  {
    id: "PM-AFTER-TOSS-25",
    timingLabel: "T–25m",
    label: "After toss (T–25m)",
    defaultAnchor: "After toss",
    phase: "Pre Match",
  },
  {
    id: "PM-ANTHEMS",
    timingLabel: "T–5m",
    label: "National Anthems (T–5m)",
    defaultAnchor: "National Anthems",
    phase: "Pre Match",
  },
];

export const INNINGS_BREAK_PRESETS: MomentPresetOption[] = [
  {
    id: "BRK-END-1ST",
    timingLabel: "End of 1st innings",
    label: "End of 1st innings",
    defaultAnchor: "End of 1st innings",
    phase: "Innings Break",
    defaultOvers: "",
  },
];

export const POST_MATCH_TIMING_PRESETS: MomentPresetOption[] = [
  {
    id: "POST-RESULT",
    timingLabel: "Final result",
    label: "Final result · Match Result",
    defaultAnchor: "Match Result",
    phase: "Post Match",
  },
  {
    id: "POST-POTM",
    timingLabel: "Player of the Match",
    label: "Player of the Match",
    defaultAnchor: "Player of the Match",
    phase: "Post Match",
  },
];

export const IN_PLAY_CHECKPOINT_PRESETS: MomentPresetOption[] = [
  {
    id: "INN-LAUNCH",
    timingLabel: "0.1 overs",
    label: "0.1 overs · T20 phase of play / Launch",
    defaultAnchor: "T20 phase of play / Launch",
    phase: "1st Innings",
    defaultOvers: "0.1",
  },
  {
    id: "INN-PP-END",
    timingLabel: "Powerplay end",
    label: "Powerplay end · T20 phase of play / Consolidate",
    defaultAnchor: "T20 phase of play / Consolidate",
    phase: "1st Innings",
    defaultOvers: "6.0",
  },
  {
    id: "INN-ACCEL",
    timingLabel: "14.0 overs",
    label: "14.0 over · T20 phase of play / Accelerate",
    defaultAnchor: "T20 phase of play / Accelerate",
    phase: "1st Innings",
    defaultOvers: "14.0",
  },
  {
    id: "INN-FINISH",
    timingLabel: "17.0 overs",
    label: "17.0 overs · T20 phase of play / Finish",
    defaultAnchor: "T20 phase of play / Finish",
    phase: "1st Innings",
    defaultOvers: "17.0",
  },
  {
    id: "INN-END-1",
    timingLabel: "20 overs",
    label: "20 overs · End of 1st innings",
    defaultAnchor: "End of 1st innings",
    phase: "1st Innings",
    defaultOvers: "20",
  },
];

/** Map phase to canonical numeric innings slot (0=Pre Match, 1=1st/Break, 2=2nd, 3=Post Match). */
export function inferMomentInnings(phase?: string | null, rawInnings?: unknown): number {
  const p = String(phase || "").trim().toLowerCase();
  if (p.includes("pre")) return 0;
  if (p.includes("post")) return 3;
  if (p.includes("2nd") || p.includes("second")) return 2;
  if (p.includes("break")) return 1;
  if (p.includes("1st") || p.includes("first")) return 1;
  if (rawInnings !== undefined && rawInnings !== null && rawInnings !== "") {
    const n = Number(rawInnings);
    if (!Number.isNaN(n)) return n;
  }
  return 1;
}

/** Extract minutes relative to match start for Pre-Match strings (e.g. T–48h -> -2880, T-29m -> -29). */
export function parsePreMatchOffsetMinutes(text: string): number | null {
  const s = String(text || "").trim().toLowerCase();
  if (!s) return null;

  const tMatch = s.match(
    /(?:^|[\s([\-–—])t?\s*[-–—]\s*(\d+(?:\.\d+)?)\s*(h(?:ours?|rs?)?|m(?:in(?:utes?|s)?)?)\b/i
  );
  if (tMatch) {
    const val = parseFloat(tMatch[1]);
    const unit = tMatch[2].toLowerCase();
    if (!Number.isNaN(val)) {
      return unit.startsWith("h") ? -val * 60 : -val;
    }
  }

  if (s.includes("match discovery")) return -2880;
  if (s.includes("before match day")) return -1440;
  if (s.includes("before match")) return -120;
  if (s.includes("before toss")) return -60;
  if (s.includes("toss time") || (s.includes("toss") && !s.includes("after toss"))) return -30;
  if (s.includes("after toss")) return -29;
  if (s.includes("national anthem")) return -5;
  return null;
}

/** Parse cricket over value into comparable tenths (e.g. "4.6" -> 46, "10.2" -> 102, "20 overs" -> 200). */
export function parseCricketOverSortValue(m: any): number | null {
  const rawOvers = String(m?.overs ?? "").trim().toLowerCase();
  const timing = String(m?.timingLabel || m?.matchOverTimestamp || "").trim().toLowerCase();
  const headline = String(m?.event || m?.matchMoment || "").trim().toLowerCase();

  const parseFromStr = (str: string): number | null => {
    const match = str.match(/(\d{1,3})(?:\.(\d))?/);
    if (!match) return null;
    const major = parseInt(match[1], 10);
    const minor = match[2] !== undefined ? parseInt(match[2], 10) : 0;
    if (Number.isNaN(major) || Number.isNaN(minor)) return null;
    return major * 10 + minor;
  };

  if (rawOvers) {
    if (rawOvers.includes("powerplay")) return 60;
    if (rawOvers.includes("end of 1st innings")) return 200;
    const parsed = parseFromStr(rawOvers);
    if (parsed !== null) return parsed;
  }

  if (timing.includes("powerplay") || headline.includes("powerplay end")) return 60;
  if (timing.includes("end of 1st innings") || headline.includes("end of 1st innings")) return 200;

  // Match "14.0 over" / "0.1 overs" if stored inside timingLabel
  const ovTextMatch = `${timing} ${headline}`.match(/\b(\d{1,3}(?:\.\d)?)\s*over/i);
  if (ovTextMatch) {
    return parseFromStr(ovTextMatch[1]);
  }

  return null;
}

function getPostMatchSubOrder(text: string): number {
  const s = text.toLowerCase();
  if (s.includes("final result") || (s.includes("match result") && !s.includes("over"))) return 10;
  if (s.includes("presentation") || s.includes("trophy")) return 20;
  if (s.includes("player of the match") || s.includes("potm")) return 30;
  return 50;
}

export interface MomentTimelineRank {
  /** 0 = Pre Match, 1 = 1st Innings, 2 = Innings Break, 3 = 2nd Innings, 4 = Post Match */
  bucket: number;
  subOrder: number;
  explicitOrder: number;
  createdAt: number;
  momentId: string;
}

/** Computes canonical top-to-bottom timeline rank matching full cricket lifecycle order. */
export function getMomentTimelineRank(m: any): MomentTimelineRank {
  const phase = String(m?.phase || "").trim().toLowerCase();
  const timing = String(m?.timingLabel || m?.preMatchOffset || m?.matchOverTimestamp || "").trim();
  const eventStr = String(m?.event || "").trim();
  const anchorStr = String(m?.matchMoment || "").trim();
  const oversStr = String(m?.overs ?? "").trim();
  const combinedText = `${timing} ${oversStr} ${eventStr} ${anchorStr}`.trim();

  const explicitOrder =
    m?.timelineOrder !== undefined && m?.timelineOrder !== null && !Number.isNaN(Number(m.timelineOrder))
      ? Number(m.timelineOrder)
      : m?.sortOrder !== undefined && m?.sortOrder !== null && !Number.isNaN(Number(m.sortOrder))
      ? Number(m.sortOrder)
      : Number.MAX_SAFE_INTEGER;

  const createdAt = Number(m?.createdAt || 0);
  const momentId = String(m?.momentId || m?.id || "");
  const numericOver = parseCricketOverSortValue(m);

  // 1. Pre-Match bucket (0)
  const preMatchMin = parsePreMatchOffsetMinutes(combinedText);
  const isPreMatch =
    phase.includes("pre") ||
    Number(m?.innings) === 0 ||
    (preMatchMin !== null && !phase.includes("1st") && !phase.includes("2nd") && numericOver === null);

  if (isPreMatch) {
    return {
      bucket: 0,
      subOrder: preMatchMin !== null ? preMatchMin : 0,
      explicitOrder,
      createdAt,
      momentId,
    };
  }

  // 2. Post-Match bucket (4)
  const isPostMatch =
    phase.includes("post") ||
    Number(m?.innings) === 3 ||
    ((combinedText.toLowerCase().includes("final result") ||
      combinedText.toLowerCase().includes("player of the match")) &&
      numericOver === null);

  if (isPostMatch) {
    return {
      bucket: 4,
      subOrder: getPostMatchSubOrder(combinedText),
      explicitOrder,
      createdAt,
      momentId,
    };
  }

  // 3. Innings Break bucket (2): strictly after 1st Innings (including 20 overs) & before 2nd Innings
  const isBreakPhase =
    phase.includes("break") ||
    (numericOver === null &&
      combinedText.toLowerCase().includes("end of 1st innings") &&
      !phase.includes("2nd"));

  if (isBreakPhase) {
    return {
      bucket: 2,
      subOrder: 0,
      explicitOrder,
      createdAt,
      momentId,
    };
  }

  // 4. Innings 2 vs Innings 1 (buckets 3 vs 1)
  const inn = Number(m?.innings);
  const isSecondInnings = phase.includes("2nd") || phase.includes("second") || (inn === 2 && !phase.includes("1st"));
  const bucket = isSecondInnings ? 3 : 1;

  return {
    bucket,
    subOrder: numericOver !== null ? numericOver : Number.MAX_SAFE_INTEGER - 1,
    explicitOrder,
    createdAt,
    momentId,
  };
}

/** Comparator sorting moments top-to-bottom in chronological match journey order. */
export function compareMatchMoments(a: any, b: any): number {
  const ra = getMomentTimelineRank(a);
  const rb = getMomentTimelineRank(b);
  if (ra.bucket !== rb.bucket) return ra.bucket - rb.bucket;
  if (ra.subOrder !== rb.subOrder) return ra.subOrder - rb.subOrder;
  if (ra.explicitOrder !== rb.explicitOrder) return ra.explicitOrder - rb.explicitOrder;
  if (ra.createdAt !== rb.createdAt) return ra.createdAt - rb.createdAt;
  return ra.momentId.localeCompare(rb.momentId);
}

/** Returns a new array of moments sorted in canonical match timeline order. */
export function sortMatchMoments<T>(moments: T[]): T[] {
  return [...(moments || [])].sort(compareMatchMoments);
}

/** Concise timing/phase badge for moment cards and dropdown options (avoids fake "Over " when non-over). */
export function formatMomentTimingBadge(m: any): string {
  const rank = getMomentTimelineRank(m);
  const oversStr = String(m?.overs ?? "").trim();
  const timing = String(m?.timingLabel || m?.preMatchOffset || m?.matchOverTimestamp || "").trim();

  if (rank.bucket === 0) {
    // Only display timingLabel / T-offset if it looks like a relative offset or checkpoint (avoid noisy IST creation timestamps if any)
    const offsetTag = timing && !/\bIST\b/i.test(timing) ? timing : "";
    return offsetTag ? `Pre Match · ${offsetTag}` : "Pre Match";
  }

  if (rank.bucket === 2) {
    return timing && timing.toLowerCase() !== "innings break" ? `Innings Break · ${timing}` : "Innings Break";
  }

  if (rank.bucket === 4) {
    const postTag = timing && !/\bIST\b/i.test(timing) ? timing : "";
    return postTag ? `Post Match · ${postTag}` : "Post Match";
  }

  const innLabel = rank.bucket === 3 ? "2nd Inn" : "1st Inn";
  if (oversStr) {
    const cleanOv = oversStr.replace(/\s*overs?$/i, "").trim();
    if (/^\d{1,3}(\.\d)?$/.test(cleanOv)) {
      return `${innLabel} · ${cleanOv} ov`;
    }
    return `${innLabel} · ${oversStr}`;
  }
  if (timing && !/\bIST\b/i.test(timing)) {
    return `${innLabel} · ${timing}`;
  }
  return String(m?.phase || "").trim() || (rank.bucket === 3 ? "2nd Innings" : "1st Innings");
}

/** Concise <option> label for moment selectors across Core Engine admin pages. */
export function formatMomentOptionLabel(m: any, matchPrefix?: string): string {
  const badge = formatMomentTimingBadge(m);
  const score = m?.score ? ` (${m.score})` : "";
  const headline = String(m?.event || m?.matchMoment || m?.momentId || "Moment").trim();
  const prefix = matchPrefix ? `[${matchPrefix}] ` : "";
  return `${prefix}[${badge}]${score} — ${headline}`;
}

/** True when a moment belongs to the Pre-Match window (Match Discovery T–48h through National Anthems T–5m). */
export function isPreMatchMoment(m: any): boolean {
  if (!m) return false;
  return getMomentTimelineRank(m).bucket === 0;
}

/** True when a moment belongs to Post Match (Final result / Match Result / Player of the Match). */
export function isPostMatchMoment(m: any): boolean {
  if (!m) return false;
  return getMomentTimelineRank(m).bucket === 4;
}

/** Identifies whether a moment is specifically Final result or Player of the Match. */
export function getPostMatchMomentKind(m: any): "final_result" | "player_of_the_match" | null {
  if (!m) return null;
  const text = `${m?.timingLabel || ""} ${m?.matchOverTimestamp || ""} ${m?.event || ""} ${m?.matchMoment || ""} ${m?.phase || ""}`.toLowerCase();
  if (text.includes("player of the match") || /\bpotm\b/.test(text)) {
    return "player_of_the_match";
  }
  if (text.includes("final result") || (text.includes("match result") && !text.includes("over"))) {
    return "final_result";
  }
  return isPostMatchMoment(m) ? "final_result" : null;
}

/** Negative offset in milliseconds relative to match start for Pre-Match moments (e.g. T–48h => -48h, T–5m => -5m). */
export function parsePreMatchOffsetMs(m: any): number | null {
  const raw = String(m?.timingLabel || m?.preMatchOffset || m?.matchOverTimestamp || m?.event || m?.matchMoment || "")
    .replace(/[\u2013\u2014]/g, "-")
    .trim();
  const match = raw.match(/T\s*-\s*(\d+(?:\.\d+)?)\s*([hm])/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (!Number.isFinite(val)) return null;
  const unit = match[2].toLowerCase();
  return -(unit === "h" ? val * 3600 * 1000 : val * 60 * 1000);
}

/** Suggested launch timestamp (ms) when attaching an engagement to a Pre-Match moment. */
export function computePreMatchScheduledTimeMs(moment: any, matchStartMs?: number | null): number | null {
  if (!matchStartMs || !Number.isFinite(matchStartMs)) return null;
  const offset = parsePreMatchOffsetMs(moment);
  if (offset === null) return null;
  return matchStartMs + offset;
}

