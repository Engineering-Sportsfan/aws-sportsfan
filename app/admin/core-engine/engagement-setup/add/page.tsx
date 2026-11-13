"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  List,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Zap,
  Trash2,
  HelpCircle,
  BarChart2,
  Target,
  Scale,
  Bell,
  CalendarClock,
  Trophy,
  Upload,
} from "lucide-react";
import CoreEngineStepper from "../../components/CoreEngineStepper";
import {
  sortMatchMoments,
  formatMomentOptionLabel,
  formatMomentTimingBadge,
  isPreMatchMoment,
  computePreMatchScheduledTimeMs,
  getPostMatchMomentKind,
  parseMatchStartMs,
} from "@/lib/matchMomentTimeline";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  team1_short?: string;
  team2_short?: string;
  format?: string;
  date?: string;
  time?: string;
  status?: string;
}

const TEAM_COUNTRY_ISO: Record<string, string> = {
  india: "in",
  ind: "in",
  "new zealand": "nz",
  nz: "nz",
  australia: "au",
  aus: "au",
  england: "gb-eng",
  eng: "gb-eng",
  pakistan: "pk",
  pak: "pk",
  "south africa": "za",
  sa: "za",
  "sri lanka": "lk",
  sl: "lk",
  bangladesh: "bd",
  ban: "bd",
  afghanistan: "af",
  afg: "af",
  ireland: "ie",
  ire: "ie",
  zimbabwe: "zw",
  zw: "zw",
  zim: "zw",
  usa: "us",
  netherlands: "nl",
  ned: "nl",
  scotland: "gb-sct",
  sco: "gb-sct",
};

function deriveTeamCode(name?: string, explicitShort?: string): string {
  if (explicitShort && explicitShort.trim()) return explicitShort.trim().toUpperCase().slice(0, 4);
  const clean = String(name || "").trim();
  if (!clean) return "TBD";
  const lower = clean.toLowerCase();
  const knownCodes: Record<string, string> = {
    india: "IND",
    "new zealand": "NZ",
    australia: "AUS",
    england: "ENG",
    pakistan: "PAK",
    "south africa": "SA",
    "sri lanka": "SL",
    bangladesh: "BAN",
    afghanistan: "AFG",
    ireland: "IRE",
    zimbabwe: "ZIM",
    "west indies": "WI",
  };
  if (knownCodes[lower]) return knownCodes[lower];
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 4);
  return clean.slice(0, 3).toUpperCase();
}

function deriveFlagUrl(nameOrCode?: string): string {
  const key = String(nameOrCode || "").trim().toLowerCase();
  const iso = TEAM_COUNTRY_ISO[key];
  return iso ? `https://flagcdn.com/w80/${iso}.png` : "";
}

function formatDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function computeMatchStartMs(match?: MatchOption | null): number | null {
  if (!match?.date) return null;
  return parseMatchStartMs(match.date, match.time);
}

function formatMatchTimeDisplay(match?: MatchOption | null, startMs?: number | null): string {
  const timeLabel = String(match?.time || "").trim() || (startMs ? new Date(startMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "7:30 PM");
  if (!startMs) {
    return match?.date ? `${match.date} · ${timeLabel}` : `Upcoming · ${timeLabel}`;
  }
  const now = new Date();
  const target = new Date(startMs);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const dayDiff = Math.round((startTarget - startToday) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return `Today • ${timeLabel}`;
  if (dayDiff === 1) return `Tomorrow • ${timeLabel}`;
  const datePart = target.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${datePart} • ${timeLabel}`;
}

interface MatchMomentItem {
  momentId: string;
  matchId: string;
  innings: number;
  phase?: string;
  overs: string;
  score: string;
  timingLabel?: string;
  preMatchOffset?: string;
  matchOverTimestamp?: string;
  event: string;
  matchMoment: string;
  createdAt?: number;
}

interface OptionItem {
  id: string;
  text: string;
}

type EngType = "poll" | "prediction" | "express" | "debate" | "question" | "follow" | "match_result";

const ENGAGEMENT_TYPES: { type: EngType; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string; desc: string }[] = [
  {
    type: "poll",
    label: "Poll",
    icon: BarChart2,
    color: "#388bfd",
    desc: "Gauge fan sentiment on match developments",
  },
  {
    type: "prediction",
    label: "Prediction",
    icon: Target,
    color: "#f59e0b",
    desc: "Predict next delivery, over runs, or milestone",
  },
  {
    type: "express",
    label: "Express",
    icon: Zap,
    color: "#ec4899",
    desc: "Open fan input box — fans write their reaction freely (no options)",
  },
  {
    type: "debate",
    label: "Debate",
    icon: Scale,
    color: "#8b5cf6",
    desc: "2-sided tactical discussion with crowd stance",
  },
  {
    type: "question",
    label: "Trivia",
    icon: HelpCircle,
    color: "#10b981",
    desc: "Cricket knowledge test with verified correct answer",
  },
  {
    type: "follow",
    label: "Follow",
    icon: Bell,
    color: "#a855f7",
    desc: "Upcoming match Follow & Remind Me card for fan chat",
  },
  {
    type: "match_result",
    label: "Result / POTM",
    icon: Trophy,
    color: "#38bdf8",
    desc: "Final Match Snapshot & Top Performer (POTM) card",
  },
];

const blankOptionsFor = (type: EngType | ""): OptionItem[] => {
  if (type === "express" || type === "follow" || type === "match_result") return [];
  const count = type === "question" ? 4 : 2;
  return Array.from({ length: count }, (_, i) => ({ id: String(i + 1), text: "" }));
};

function AddEngagementContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || "";
  const urlMomentId = searchParams.get("momentId") || "";
  const editId = searchParams.get("editId");

  // Selection states
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId);
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(urlMomentId);

  // Form Fields
  const [engType, setEngType] = useState<EngType>("poll");
  const [loopId, setLoopId] = useState<string>("");
  const [engQuestion, setEngQuestion] = useState<string>("");
  const [engTimer, setEngTimer] = useState<number | "">("");
  const [postLock, setPostLock] = useState<string>("");
  const [engOptions, setEngOptions] = useState<OptionItem[]>(() => blankOptionsFor("poll"));
  const [correctOptionId, setCorrectOptionId] = useState<string>("");
  const [resolveStatus, setResolveStatus] = useState<string>("active");

  // Scheduling state (shown for Pre-Match moments: Match Discovery T-48h ... National Anthems T-5m)
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAtLocal, setScheduledAtLocal] = useState<string>("");

  // Follow engagement card fields
  const [followTeam1Code, setFollowTeam1Code] = useState<string>("");
  const [followTeam1Flag, setFollowTeam1Flag] = useState<string>("");
  const [followTeam2Code, setFollowTeam2Code] = useState<string>("");
  const [followTeam2Flag, setFollowTeam2Flag] = useState<string>("");
  const [followMatchLabel, setFollowMatchLabel] = useState<string>("T20 INTERNATIONAL");
  const [followMatchDate, setFollowMatchDate] = useState<string>("");
  const [followBroadcastTime, setFollowBroadcastTime] = useState<string>("");
  const [followMatchTimeLabel, setFollowMatchTimeLabel] = useState<string>("");
  const [followMatchStartMs, setFollowMatchStartMs] = useState<number | null>(null);
  const [followPreviewNowMs, setFollowPreviewNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (engType !== "follow") return;
    setFollowPreviewNowMs(Date.now());
    const timer = setInterval(() => setFollowPreviewNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [engType]);

  // Final Result / Player of the Match (Match Snapshot & Top Performer) fields
  const [resultShowSnapshot, setResultShowSnapshot] = useState<boolean>(true);
  const [resultTeam1Name, setResultTeam1Name] = useState<string>("");
  const [resultTeam1Code, setResultTeam1Code] = useState<string>("");
  const [resultTeam1Flag, setResultTeam1Flag] = useState<string>("");
  const [resultTeam1Score, setResultTeam1Score] = useState<string>("");
  const [resultTeam2Name, setResultTeam2Name] = useState<string>("");
  const [resultTeam2Code, setResultTeam2Code] = useState<string>("");
  const [resultTeam2Flag, setResultTeam2Flag] = useState<string>("");
  const [resultTeam2Score, setResultTeam2Score] = useState<string>("");
  const [resultSummary, setResultSummary] = useState<string>("");
  const [resultShowTopPerformer, setResultShowTopPerformer] = useState<boolean>(true);
  const [resultPerformerLabel, setResultPerformerLabel] = useState<string>("Top Performer");
  const [resultPlayerName, setResultPlayerName] = useState<string>("");
  const [resultPlayerStats, setResultPlayerStats] = useState<string>("");
  const [resultPlayerImageUrl, setResultPlayerImageUrl] = useState<string>("");
  const [uploadingPlayerPhoto, setUploadingPlayerPhoto] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
    loopId?: string;
  } | null>(null);

  // Fetch matches
  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch(`/api/matches?coreOnly=true&limit=1000&_t=${Date.now()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const list: MatchOption[] = json.data.map((m: Record<string, unknown>) => ({
            match_id: String(m.match_id || m.id || ""),
            team1: String(m.team1 || ""),
            team2: String(m.team2 || ""),
            team1_short: m.team1_short ? String(m.team1_short) : undefined,
            team2_short: m.team2_short ? String(m.team2_short) : undefined,
            format: m.format ? String(m.format) : undefined,
            date: m.date ? String(m.date) : (m.start_date ? String(m.start_date) : undefined),
            time: m.time ? String(m.time) : undefined,
            status: m.status ? String(m.status) : undefined,
          }));
          setMatches(list);
        }
      } catch (err) {
        console.warn("Failed to fetch matches", err);
      }
    };
    fetchMatches();
  }, [selectedMatchId]);

  // Fetch moments for active match
  useEffect(() => {
    if (!selectedMatchId) return;
    const fetchMoments = async () => {
      try {
        const res = await fetch(`/api/match-moments?matchId=${encodeURIComponent(selectedMatchId)}&_t=${Date.now()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setMoments(sortMatchMoments(json.data));
        } else {
          setMoments([]);
        }
      } catch (err) {
        console.warn("Failed to fetch moments", err);
      }
    };
    fetchMoments();
  }, [selectedMatchId, selectedMomentId]);

  // Active match and moment objects
  const activeMatch = useMemo(() => {
    return matches.find((m) => m.match_id === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  const activeMoment = useMemo(() => {
    return moments.find((m) => m.momentId === selectedMomentId) || null;
  }, [moments, selectedMomentId]);

  const isPreMatch = useMemo(() => isPreMatchMoment(activeMoment), [activeMoment]);
  const postMatchKind = useMemo(() => getPostMatchMomentKind(activeMoment), [activeMoment]);

  // Auto-populate Follow & Match Result card fields from active match
  useEffect(() => {
    if (editId || !activeMatch) return;
    const t1Name = String(activeMatch.team1 || "").trim();
    const t2Name = String(activeMatch.team2 || "").trim();
    const t1Code = deriveTeamCode(t1Name, activeMatch.team1_short);
    const t2Code = deriveTeamCode(t2Name, activeMatch.team2_short);
    const t1Flag = deriveFlagUrl(t1Name) || deriveFlagUrl(t1Code);
    const t2Flag = deriveFlagUrl(t2Name) || deriveFlagUrl(t2Code);
    const mDate = String(activeMatch.date || "").trim();
    const bTime = String(activeMatch.time || "").trim();
    const startMs = parseMatchStartMs(mDate, bTime);
    const fmt = String(activeMatch.format || "T20").toUpperCase();
    const matchLabel = fmt.includes("INTERNATIONAL") ? fmt : fmt === "T20" || fmt === "T20I" ? "T20 INTERNATIONAL" : fmt;

    setFollowTeam1Code(t1Code);
    setFollowTeam2Code(t2Code);
    setFollowTeam1Flag(t1Flag);
    setFollowTeam2Flag(t2Flag);
    setFollowMatchLabel(matchLabel);
    setFollowMatchDate(mDate);
    setFollowBroadcastTime(bTime);
    setFollowMatchStartMs(startMs);
    setFollowMatchTimeLabel(formatMatchTimeDisplay(activeMatch, startMs));

    setResultTeam1Name(t1Name || t1Code);
    setResultTeam1Code(t1Code);
    setResultTeam1Flag(t1Flag);
    setResultTeam2Name(t2Name || t2Code);
    setResultTeam2Code(t2Code);
    setResultTeam2Flag(t2Flag);

    if (engType === "follow" && !engQuestion.trim()) {
      setEngQuestion(`${t1Code} vs ${t2Code}`);
    }
  }, [activeMatch, engType, editId]);

  // When admin selects Final result or Player of the Match moment, pre-configure Result / POTM card
  useEffect(() => {
    if (editId || !postMatchKind) return;
    setEngType("match_result");
    setEngOptions([]);
    setResultShowSnapshot(true);
    setResultShowTopPerformer(true);
    setResultPerformerLabel(postMatchKind === "player_of_the_match" ? "Player of the Match" : "Top Performer");
  }, [postMatchKind, editId]);

  // Reset schedule mode cleanly when moving off a Pre-Match moment (non-edit)
  useEffect(() => {
    if (!editId && !isPreMatch) {
      setScheduleMode("immediate");
      setScheduledAtLocal("");
    }
  }, [isPreMatch, editId]);

  // Auto-generate loopId if not editing
  useEffect(() => {
    if (editId || !selectedMomentId) return;
    const momentBase = selectedMomentId.replace(/^MM-/, "");
    setLoopId(`LOOP-${momentBase}-${Date.now().toString().slice(-2)}`);
  }, [selectedMomentId, editId]);

  // If editId, load engagement to edit
  useEffect(() => {
    if (!editId) return;
    const loadEngagement = async () => {
      try {
        const res = await fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&includeScheduled=true&limit=1000&_t=${Date.now()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.engagements)) {
          const eng = json.engagements.find((e: Record<string, unknown>) => e.id === editId || e.loopId === editId);
          if (eng) {
            if (eng.matchId) setSelectedMatchId(String(eng.matchId));
            if (eng.momentId) setSelectedMomentId(String(eng.momentId));
            if (eng.type) setEngType(String(eng.type) as EngType);
            if (eng.loopId) setLoopId(String(eng.loopId));
            setEngQuestion(String(eng.title || ""));
            const loadedType = String(eng.type || "");
            if (loadedType === "express" || loadedType === "follow" || loadedType === "match_result") {
              setEngTimer("");
              setPostLock("");
            } else {
              setEngTimer(Number(eng.timerMinutes) || 4);
              setPostLock(String(eng.postLock || ""));
            }
            const rawSched = Number(eng.scheduledStartTime || eng.startTime || 0);
            if (eng.isScheduled || eng.status === "scheduled" || rawSched > Date.now()) {
              setScheduleMode("scheduled");
              if (rawSched > 0) setScheduledAtLocal(formatDatetimeLocal(rawSched));
            }
            if (String(eng.type) === "express") {
              setEngOptions([]);
            } else if (String(eng.type) === "follow") {
              setEngOptions([]);
              const fd = (eng.followData || {}) as Record<string, unknown>;
              if (fd.team1Code) setFollowTeam1Code(String(fd.team1Code));
              if (fd.team1Flag) setFollowTeam1Flag(String(fd.team1Flag));
              if (fd.team2Code) setFollowTeam2Code(String(fd.team2Code));
              if (fd.team2Flag) setFollowTeam2Flag(String(fd.team2Flag));
              if (fd.matchLabel) setFollowMatchLabel(String(fd.matchLabel));
              if (fd.matchDate) setFollowMatchDate(String(fd.matchDate));
              if (fd.broadcastTime) setFollowBroadcastTime(String(fd.broadcastTime));
              if (fd.matchTimeLabel) setFollowMatchTimeLabel(String(fd.matchTimeLabel));
              if (fd.matchStartMs) setFollowMatchStartMs(Number(fd.matchStartMs));
            } else if (String(eng.type) === "match_result") {
              setEngOptions([]);
              const mr = (eng.matchResultData || {}) as Record<string, unknown>;
              setResultShowSnapshot(mr.showSnapshot !== false);
              if (mr.team1Name) setResultTeam1Name(String(mr.team1Name));
              if (mr.team1Code) setResultTeam1Code(String(mr.team1Code));
              if (mr.team1Flag) setResultTeam1Flag(String(mr.team1Flag));
              if (mr.team1Score) setResultTeam1Score(String(mr.team1Score));
              if (mr.team2Name) setResultTeam2Name(String(mr.team2Name));
              if (mr.team2Code) setResultTeam2Code(String(mr.team2Code));
              if (mr.team2Flag) setResultTeam2Flag(String(mr.team2Flag));
              if (mr.team2Score) setResultTeam2Score(String(mr.team2Score));
              if (mr.resultSummary) setResultSummary(String(mr.resultSummary));
              setResultShowTopPerformer(mr.showTopPerformer !== false);
              if (mr.performerLabel) setResultPerformerLabel(String(mr.performerLabel));
              if (mr.playerName) setResultPlayerName(String(mr.playerName));
              if (mr.playerStats) setResultPlayerStats(String(mr.playerStats));
              if (mr.playerImageUrl) setResultPlayerImageUrl(String(mr.playerImageUrl));
            } else if (Array.isArray(eng.options) && eng.options.length > 0) {
              setEngOptions(eng.options.map((o: Record<string, unknown>, idx: number) => ({ id: String(o.id || idx + 1), text: String(o.text || "") })));
            }
            if (eng.correctOptionId) {
              setCorrectOptionId(String(eng.correctOptionId));
            }
            setResolveStatus(String(eng.status || "active"));
          }
        }
      } catch (err) {
        console.warn("Failed to load engagement to edit", err);
      }
    };
    loadEngagement();
  }, [editId]);

  const handleTypeChange = (type: EngType) => {
    setEngType(type);
    setCorrectOptionId("");
    setEngOptions(blankOptionsFor(type));
    if (type === "follow" && activeMatch) {
      const t1 = followTeam1Code || deriveTeamCode(activeMatch.team1, activeMatch.team1_short);
      const t2 = followTeam2Code || deriveTeamCode(activeMatch.team2, activeMatch.team2_short);
      if (!engQuestion.trim()) setEngQuestion(`${t1} vs ${t2}`);
    }
  };

  const handleOptionTextChange = (id: string, text: string) => {
    setEngOptions((prev) =>
      prev.map((opt) => (opt.id === id ? { ...opt, text } : opt))
    );
  };

  const handleAddOption = () => {
    const nextId = String(engOptions.length + 1);
    setEngOptions((prev) => [...prev, { id: nextId, text: "" }]);
  };

  const handleRemoveOption = (id: string) => {
    if (engOptions.length <= 2) return;
    setEngOptions((prev) => prev.filter((opt) => opt.id !== id));
  };

  const handlePlayerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPlayerPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data?.success && data?.url) {
        setResultPlayerImageUrl(String(data.url));
      } else {
        setSubmitResult({ success: false, message: data?.message || "Failed to upload player photo" });
      }
    } catch {
      setSubmitResult({ success: false, message: "Upload failed — you can paste a photo URL directly." });
    } finally {
      setUploadingPlayerPhoto(false);
    }
  };

  const handleResetForm = () => {
    setEngType("poll");
    setEngQuestion("");
    setEngTimer("");
    setPostLock("");
    setScheduleMode("immediate");
    setScheduledAtLocal("");
    setResultTeam1Score("");
    setResultTeam2Score("");
    setResultSummary("");
    setResultPlayerName("");
    setResultPlayerStats("");
    setResultPlayerImageUrl("");
    setEngOptions(blankOptionsFor("poll"));
    setCorrectOptionId("");
    setSubmitResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatchId) {
      setSubmitResult({ success: false, message: "Please select a match" });
      return;
    }
    if (!selectedMomentId) {
      setSubmitResult({ success: false, message: "Please select a match moment to attach this engagement to" });
      return;
    }
    const resolvedTitle =
      engType === "follow" && !engQuestion.trim()
        ? `${followTeam1Code || activeMatch?.team1 || "IND"} vs ${followTeam2Code || activeMatch?.team2 || "NZ"}`
        : engType === "match_result" && !engQuestion.trim()
        ? resultShowSnapshot && (resultTeam1Name || activeMatch?.team1)
          ? `${resultTeam1Name || activeMatch?.team1 || "Team 1"} ${resultTeam1Score}`.trim() +
            ` vs ${resultTeam2Name || activeMatch?.team2 || "Team 2"} ${resultTeam2Score}`.trim()
          : resultPlayerName.trim()
          ? `${resultPerformerLabel || "Top Performer"}: ${resultPlayerName.trim()}`
          : "Match Snapshot"
        : engQuestion.trim();

    if (!resolvedTitle) {
      setSubmitResult({ success: false, message: "Question / Prompt is required" });
      return;
    }
    if (engType === "match_result") {
      if (!resultShowSnapshot && !resultShowTopPerformer) {
        setSubmitResult({ success: false, message: "Enable Match Snapshot or Top Performer (or both)" });
        return;
      }
      if (resultShowSnapshot && (!resultTeam1Score.trim() || !resultTeam2Score.trim())) {
        setSubmitResult({ success: false, message: "Please enter scores for both teams (e.g. 198/5 (20))" });
        return;
      }
      if (resultShowTopPerformer && !resultPlayerName.trim()) {
        setSubmitResult({ success: false, message: "Please enter the Top Performer / Player of the Match name" });
        return;
      }
    }
    if (engType !== "express" && engType !== "follow" && engType !== "match_result" && engOptions.some((o) => !o.text.trim())) {
      setSubmitResult({ success: false, message: "All option fields must have text" });
      return;
    }
    if (engType === "question" && !correctOptionId) {
      setSubmitResult({ success: false, message: "Please select the correct answer for the trivia question" });
      return;
    }

    let scheduledStartMs: number | undefined;
    if (isPreMatch && scheduleMode === "scheduled") {
      const parsed = scheduledAtLocal ? new Date(scheduledAtLocal).getTime() : NaN;
      if (!scheduledAtLocal || isNaN(parsed)) {
        setSubmitResult({ success: false, message: "Please select a valid Scheduled Date & Time for this Pre-Match engagement" });
        return;
      }
      scheduledStartMs = parsed;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    const isFutureSched = Boolean(scheduledStartMs && scheduledStartMs > Date.now() + 30000);

    const payload: Record<string, unknown> = {
      id: editId || undefined,
      title: resolvedTitle,
      subtitle: `${activeMatch?.team1 || ""} vs ${activeMatch?.team2 || ""} · ${
        activeMoment ? formatMomentTimingBadge(activeMoment) : "Live"
      }`,
      type: engType,
      sport: "cricket",
      status: isFutureSched ? "scheduled" : resolveStatus || "active",
      ...(scheduledStartMs
        ? {
            startTime: scheduledStartMs,
            scheduledStartTime: scheduledStartMs,
            postingTime: scheduledStartMs,
            isScheduled: isFutureSched,
          }
        : {}),
      ...(engType !== "express" && engType !== "follow" && engType !== "match_result" ? { timerMinutes: Number(engTimer) || 4 } : {}),
      options:
        engType === "express" || engType === "follow" || engType === "match_result"
          ? []
          : engOptions.map((o) => ({ id: o.id, text: o.text.trim() })),
      ...(engType === "express"
        ? {
            inputPlaceholder: "Write your thoughts...",
            expressData: {
              prompt: resolvedTitle,
              question: resolvedTitle,
              responseMode: "text",
              placeholder: "Write your thoughts...",
              options: [],
              totalVotes: 0,
              totalResponses: 0,
            },
          }
        : {}),
      ...(engType === "follow"
        ? {
            followData: {
              team1Name: activeMatch?.team1 || followTeam1Code || "Team 1",
              team1Code: followTeam1Code.trim() || deriveTeamCode(activeMatch?.team1, activeMatch?.team1_short),
              team1Flag: followTeam1Flag.trim(),
              team2Name: activeMatch?.team2 || followTeam2Code || "Team 2",
              team2Code: followTeam2Code.trim() || deriveTeamCode(activeMatch?.team2, activeMatch?.team2_short),
              team2Flag: followTeam2Flag.trim(),
              matchLabel: followMatchLabel.trim() || "T20 INTERNATIONAL",
              matchDate: followMatchDate.trim() || activeMatch?.date || "",
              broadcastTime: followBroadcastTime.trim() || activeMatch?.time || "",
              matchTimeLabel: followMatchTimeLabel.trim() || "Upcoming",
              matchStartMs:
                followMatchStartMs ||
                parseMatchStartMs(followMatchDate || activeMatch?.date, followBroadcastTime || activeMatch?.time) ||
                undefined,
              statusLabel:
                activeMatch?.status === "completed"
                  ? "Completed"
                  : activeMatch?.status === "live"
                  ? "LIVE"
                  : "Upcoming",
            },
          }
        : {}),
      ...(engType === "match_result"
        ? {
            matchResultData: {
              showSnapshot: resultShowSnapshot,
              snapshotHeading: "Match Snapshot",
              team1Name: resultTeam1Name.trim() || activeMatch?.team1 || "India",
              team1Code: resultTeam1Code.trim() || deriveTeamCode(resultTeam1Name || activeMatch?.team1, activeMatch?.team1_short),
              team1Flag: resultTeam1Flag.trim() || deriveFlagUrl(resultTeam1Name || activeMatch?.team1),
              team1Score: resultTeam1Score.trim(),
              team2Name: resultTeam2Name.trim() || activeMatch?.team2 || "New Zealand",
              team2Code: resultTeam2Code.trim() || deriveTeamCode(resultTeam2Name || activeMatch?.team2, activeMatch?.team2_short),
              team2Flag: resultTeam2Flag.trim() || deriveFlagUrl(resultTeam2Name || activeMatch?.team2),
              team2Score: resultTeam2Score.trim(),
              resultSummary: resultSummary.trim(),
              showTopPerformer: resultShowTopPerformer,
              performerLabel: resultPerformerLabel.trim() || "Top Performer",
              playerName: resultPlayerName.trim(),
              playerStats: resultPlayerStats.trim(),
              playerImageUrl: resultPlayerImageUrl.trim(),
              mode:
                resultShowSnapshot && resultShowTopPerformer
                  ? "combined"
                  : resultShowTopPerformer
                  ? "player_of_the_match"
                  : "final_result",
            },
          }
        : {}),
      correctOptionId: engType === "question" ? correctOptionId : undefined,
      ...(engType !== "express" && engType !== "follow" && engType !== "match_result" ? { postLock: postLock.trim() } : {}),
      coinStake: 10,
      loopId:
        loopId.trim() ||
        `LOOP-${String(activeMoment?.overs || activeMoment?.timingLabel || "ENG")
          .trim()
          .replace(/\s+/g, "-")}-${Date.now().toString(36)}`,
      momentId: selectedMomentId,
      matchId: selectedMatchId,
      innings: activeMoment?.innings ?? 1,
      overNumber: activeMoment?.overs || "",
      scoreState: activeMoment?.score || "",
      anchorTrigger: activeMoment?.matchMoment || activeMoment?.event || "",
      sportsMoment: activeMoment?.matchMoment || activeMoment?.event || "",
      source: "match_moment",
    };

    try {
      const res = await fetch("/api/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          message: editId
            ? `Engagement updated successfully!`
            : `Engagement pushed live to fans!`,
          loopId: String(payload.loopId),
        });
      } else {
        setSubmitResult({
          success: false,
          message: data.error || "Failed to save engagement",
        });
      }
    } catch (err: unknown) {
      setSubmitResult({
        success: false,
        message: (err as Error).message || "Network error saving engagement",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper
        currentStepKey="engagement"
        matchId={selectedMatchId}
        momentId={selectedMomentId}
        compact
      />

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/admin/core-engine/engagement-setup/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-white/10">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>🎯</span>
              <span>{editId ? "Edit Engagement" : "Add Engagement"}</span>
            </h1>
            <p className="text-xs text-gray-400">
              Deploy live polls, predictions, express taps, or trivia attached to match moments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/admin/core-engine/engagement-setup/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5">
              <List size={14} />
              <span>Engagement List</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Success / Error Toast */}
      {submitResult && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold ${
            submitResult.success
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {submitResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{submitResult.message}</span>
          </div>
          {submitResult.success && (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/core-engine/engagement-setup/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1 transition-all border border-white/15"
              >
                <List size={13} />
                <span>View in Engagement List</span>
              </Link>
              <Link
                href={`/admin/core-engine/visible-recognition/add?matchId=${selectedMatchId}&momentId=${selectedMomentId}`}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1 transition-all"
              >
                <span>Proceed to Recognise Fans</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Match & Moment Binding */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <span>🏏</span> Anchor Binding (Match & Moment)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Select Match *
              </label>
              <select
                value={selectedMatchId}
                onChange={(e) => {
                  setSelectedMatchId(e.target.value);
                  setSelectedMomentId("");
                }}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="">-- Select Match --</option>
                {matches.map((m) => (
                  <option key={m.match_id} value={m.match_id}>
                    {m.team1} vs {m.team2} ({m.format || "Match"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Select Moment Trigger *
              </label>
              <select
                value={selectedMomentId}
                onChange={(e) => setSelectedMomentId(e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
              >
                <option value="">-- Choose a Moment --</option>
                {moments.map((m) => (
                  <option key={m.momentId} value={m.momentId}>
                    {formatMomentOptionLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pre-Match Scheduling Option (Match Discovery T-48h ... National Anthems T-5m) */}
          {isPreMatch && (
            <div className="mt-4 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarClock size={15} className="text-indigo-400 shrink-0" />
                  <div>
                    <h4 className="text-xs font-black text-indigo-300 uppercase tracking-wider">
                      Pre-Match Delivery Schedule ({formatMomentTimingBadge(activeMoment)})
                    </h4>
                    <p className="text-[11px] text-gray-400">
                      Scheduled pre-match engagements stay hidden from fans and appear in frontend UI chat only when the scheduled time hits.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setScheduleMode("immediate")}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                      scheduleMode === "immediate"
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                        : "bg-[#0a0d17] border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    Publish Immediately
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleMode("scheduled");
                      if (!scheduledAtLocal) {
                        const matchMs = computeMatchStartMs(activeMatch);
                        const autoMs = computePreMatchScheduledTimeMs(activeMoment, matchMs);
                        setScheduledAtLocal(formatDatetimeLocal(autoMs || Date.now() + 30 * 60 * 1000));
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                      scheduleMode === "scheduled"
                        ? "bg-indigo-500/25 border-indigo-400 text-indigo-200"
                        : "bg-[#0a0d17] border-white/10 text-gray-400 hover:text-white"
                    }`}
                  >
                    Schedule Launch Time
                  </button>
                </div>
              </div>

              {scheduleMode === "scheduled" && (
                <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-2 border-t border-indigo-500/20">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-indigo-200 uppercase tracking-wider mb-1">
                      Scheduled Go-Live Date &amp; Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={scheduledAtLocal}
                      onChange={(e) => setScheduledAtLocal(e.target.value)}
                      className="w-full bg-[#0a0d17] border border-indigo-400/40 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-400"
                    />
                  </div>
                  {computeMatchStartMs(activeMatch) && (
                    <button
                      type="button"
                      onClick={() => {
                        const autoMs = computePreMatchScheduledTimeMs(activeMoment, computeMatchStartMs(activeMatch));
                        if (autoMs) setScheduledAtLocal(formatDatetimeLocal(autoMs));
                      }}
                      className="px-3 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-[11px] font-bold transition-all shrink-0"
                    >
                      Auto-fill ({activeMoment?.timingLabel || "Moment Offset"})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Choose Engagement Type */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-pink-400 flex items-center gap-2">
              <span>⚡</span> Engagement Type
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {ENGAGEMENT_TYPES.map((et) => {
              const Icon = et.icon;
              const isSelected = engType === et.type;
              return (
                <button
                  key={et.type}
                  type="button"
                  onClick={() => handleTypeChange(et.type)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "bg-cyan-500/15 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.3)] ring-2 ring-cyan-500/30"
                      : "bg-[#0a0d17] border-white/5 hover:border-white/20"
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                    style={{ background: `${et.color}20`, color: et.color }}
                  >
                    <Icon size={16} />
                  </div>
                  <h4 className="text-xs font-black text-white">{et.label}</h4>
                  <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-tight">
                    {et.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 3: Prompt & Choices / Express Input */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-5">
          <div className="border-b border-white/5 pb-3 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-2">
              <span>{engType === "follow" ? "🔔" : engType === "match_result" ? "🏆" : "✍️"}</span>{" "}
              {engType === "express"
                ? "Express Prompt"
                : engType === "follow"
                ? "Follow Upcoming Match Card"
                : engType === "match_result"
                ? "Final Result (Match Snapshot) & Top Performer"
                : "Prompt & Fan Options"}
            </h3>
            {engType === "question" && (
              <span className="text-[11px] text-emerald-400 font-bold">
                ✓ Click radio on correct answer
              </span>
            )}
          </div>

          {engType === "follow" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Match Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={engQuestion}
                    onChange={(e) => setEngQuestion(e.target.value)}
                    placeholder="e.g. IND vs NZ"
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Format / Series Label
                  </label>
                  <input
                    type="text"
                    value={followMatchLabel}
                    onChange={(e) => setFollowMatchLabel(e.target.value)}
                    placeholder="T20 INTERNATIONAL"
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Match Date (from Match)
                  </label>
                  <input
                    type="date"
                    value={followMatchDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setFollowMatchDate(newDate);
                      const start = parseMatchStartMs(newDate, followBroadcastTime);
                      setFollowMatchStartMs(start);
                      if (newDate) {
                        setFollowMatchTimeLabel(formatMatchTimeDisplay({ ...activeMatch, date: newDate, time: followBroadcastTime } as any, start));
                      }
                    }}
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Broadcast Time (from Match)
                  </label>
                  <input
                    type="text"
                    value={followBroadcastTime}
                    onChange={(e) => {
                      const newTime = e.target.value;
                      setFollowBroadcastTime(newTime);
                      const start = parseMatchStartMs(followMatchDate, newTime);
                      setFollowMatchStartMs(start);
                      if (followMatchDate || newTime) {
                        setFollowMatchTimeLabel(formatMatchTimeDisplay({ ...activeMatch, date: followMatchDate, time: newTime } as any, start));
                      }
                    }}
                    placeholder="e.g. 19:30 IST or 7:30 PM"
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Match Date &amp; Time Label
                  </label>
                  <input
                    type="text"
                    value={followMatchTimeLabel}
                    onChange={(e) => setFollowMatchTimeLabel(e.target.value)}
                    placeholder="Tomorrow • 7:30 PM"
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Countdown Target (Match Start Date &amp; Time)
                </label>
                <input
                  type="datetime-local"
                  value={followMatchStartMs ? formatDatetimeLocal(followMatchStartMs) : ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw) {
                      setFollowMatchStartMs(null);
                      return;
                    }
                    const parsed = new Date(raw).getTime();
                    if (!Number.isNaN(parsed) && parsed > 0) {
                      setFollowMatchStartMs(parsed);
                    }
                  }}
                  className="w-full sm:max-w-xs bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  Prefilled from Match Date &amp; Broadcast Time. Reverse countdown ticks down to this time on frontend and changes status to LIVE at 0.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Team 1 Code
                    </label>
                    <input
                      type="text"
                      value={followTeam1Code}
                      onChange={(e) => setFollowTeam1Code(e.target.value)}
                      placeholder="IND"
                      className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500 uppercase"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Team 1 Flag URL
                    </label>
                    <input
                      type="text"
                      value={followTeam1Flag}
                      onChange={(e) => setFollowTeam1Flag(e.target.value)}
                      placeholder="https://flagcdn.com/w80/in.png"
                      className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Team 2 Code
                    </label>
                    <input
                      type="text"
                      value={followTeam2Code}
                      onChange={(e) => setFollowTeam2Code(e.target.value)}
                      placeholder="NZ"
                      className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500 uppercase"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                      Team 2 Flag URL
                    </label>
                    <input
                      type="text"
                      value={followTeam2Flag}
                      onChange={(e) => setFollowTeam2Flag(e.target.value)}
                      placeholder="https://flagcdn.com/w80/nz.png"
                      className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Frontend Follow Card Preview */}
              {(() => {
                const diffMs = followMatchStartMs ? followMatchStartMs - followPreviewNowMs : null;
                const isFollowLive = diffMs !== null && diffMs <= 0;
                const countdownPreview = (() => {
                  if (diffMs === null) return "Soon ›";
                  if (diffMs <= 0) return "LIVE";
                  const totalSec = Math.ceil(diffMs / 1000);
                  const h = Math.floor(totalSec / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  const s = totalSec % 60;
                  const mm = String(m).padStart(2, "0");
                  const ss = String(s).padStart(2, "0");
                  return h >= 1 ? `${h}h ${mm}m ›` : `${mm}m ${ss}s ›`;
                })();
                return (
              <div className="max-w-sm rounded-2xl bg-[#070612] border border-purple-500/30 overflow-hidden shadow-lg">
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/10 text-xs">
                  {isFollowLive ? (
                    <span className="font-black text-rose-400 pb-1 border-b-2 border-rose-500 inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      LIVE
                    </span>
                  ) : (
                    <span className="font-bold text-white pb-1 border-b-2 border-purple-500">
                      Upcoming
                    </span>
                  )}
                  <span className={`text-[11px] font-semibold tabular-nums ${isFollowLive ? "text-white/50 text-sm" : "text-white/75"}`}>
                    {isFollowLive ? "›" : countdownPreview}
                  </span>
                </div>
                <div className="p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    {followTeam1Flag ? (
                      <img src={followTeam1Flag} alt={followTeam1Code} className="w-11 h-7 rounded object-cover border border-white/15" />
                    ) : (
                      <div className="w-11 h-7 rounded bg-white/10 flex items-center justify-center text-[10px] font-black">{followTeam1Code || "T1"}</div>
                    )}
                    <div className="text-center flex-1 min-w-0">
                      <div className="text-base font-black text-white tracking-tight truncate">
                        {engQuestion || `${followTeam1Code || "IND"} vs ${followTeam2Code || "NZ"}`}
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                        {followMatchLabel || "T20 INTERNATIONAL"}
                      </div>
                      <div className="text-[11px] text-white/80 font-medium mt-0.5">
                        {followMatchTimeLabel || "Tomorrow • 7:30 PM"}
                      </div>
                    </div>
                    {followTeam2Flag ? (
                      <img src={followTeam2Flag} alt={followTeam2Code} className="w-11 h-7 rounded object-cover border border-white/15" />
                    ) : (
                      <div className="w-11 h-7 rounded bg-white/10 flex items-center justify-center text-[10px] font-black">{followTeam2Code || "T2"}</div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="py-1.5 rounded-lg border border-purple-500/80 bg-purple-500/15 text-center text-xs font-bold text-white shadow-[0_0_10px_rgba(168,85,247,0.25)]">
                      Following
                    </div>
                    <div className="py-1.5 rounded-lg border border-purple-500/40 bg-white/[0.03] text-center text-xs font-bold text-white/90">
                      Remind Me
                    </div>
                  </div>
                </div>
              </div>
                );
              })()}
            </div>
          ) : engType === "match_result" ? (
            <div className="space-y-5">
              {/* Section Toggles */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-sky-500/10 border border-sky-500/25">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resultShowSnapshot}
                    onChange={(e) => setResultShowSnapshot(e.target.checked)}
                    className="accent-sky-400"
                  />
                  <span>Include Match Snapshot (Final Score)</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resultShowTopPerformer}
                    onChange={(e) => setResultShowTopPerformer(e.target.checked)}
                    className="accent-sky-400"
                  />
                  <span>Include Top Performer / Player of the Match</span>
                </label>
              </div>

              {resultShowSnapshot && (
                <div className="p-4 rounded-xl bg-[#0a0d17] border border-white/10 space-y-3">
                  <div className="text-[11px] font-black text-sky-300 uppercase tracking-wider">
                    1. Match Snapshot
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Team 1</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={resultTeam1Name}
                          onChange={(e) => setResultTeam1Name(e.target.value)}
                          placeholder="India"
                          className="bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                        />
                        <input
                          type="text"
                          value={resultTeam1Score}
                          onChange={(e) => setResultTeam1Score(e.target.value)}
                          placeholder="198/5 (20)"
                          className="bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white font-bold focus:outline-none focus:border-sky-400"
                        />
                      </div>
                      <input
                        type="text"
                        value={resultTeam1Flag}
                        onChange={(e) => setResultTeam1Flag(e.target.value)}
                        placeholder="Flag URL (https://flagcdn.com/w80/in.png)"
                        className="w-full bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-sky-400"
                      />
                    </div>

                    <div className="space-y-2 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Team 2</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={resultTeam2Name}
                          onChange={(e) => setResultTeam2Name(e.target.value)}
                          placeholder="New Zealand"
                          className="bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                        />
                        <input
                          type="text"
                          value={resultTeam2Score}
                          onChange={(e) => setResultTeam2Score(e.target.value)}
                          placeholder="187/8 (20)"
                          className="bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white font-bold focus:outline-none focus:border-sky-400"
                        />
                      </div>
                      <input
                        type="text"
                        value={resultTeam2Flag}
                        onChange={(e) => setResultTeam2Flag(e.target.value)}
                        placeholder="Flag URL (https://flagcdn.com/w80/nz.png)"
                        className="w-full bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-sky-400"
                      />
                    </div>
                  </div>
                  <input
                    type="text"
                    value={resultSummary}
                    onChange={(e) => setResultSummary(e.target.value)}
                    placeholder="Optional Result Line (e.g. India won by 11 runs)"
                    className="w-full bg-[#0d111c] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                  />
                </div>
              )}

              {resultShowTopPerformer && (
                <div className="p-4 rounded-xl bg-[#0a0d17] border border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-black text-sky-300 uppercase tracking-wider">
                      2. Top Performer / Player of the Match
                    </div>
                    <div className="flex items-center gap-1.5">
                      {["Top Performer", "Player of the Match"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setResultPerformerLabel(preset)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            resultPerformerLabel === preset
                              ? "bg-sky-500/20 border-sky-400 text-sky-200"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Section Title
                      </label>
                      <input
                        type="text"
                        value={resultPerformerLabel}
                        onChange={(e) => setResultPerformerLabel(e.target.value)}
                        placeholder="Top Performer"
                        className="w-full bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Player Name *
                      </label>
                      <input
                        type="text"
                        value={resultPlayerName}
                        onChange={(e) => setResultPlayerName(e.target.value)}
                        placeholder="Suryakumar Yadav"
                        className="w-full bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white font-semibold focus:outline-none focus:border-sky-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Stats Summary Line
                      </label>
                      <input
                        type="text"
                        value={resultPlayerStats}
                        onChange={(e) => setResultPlayerStats(e.target.value)}
                        placeholder="65 (39) • 2 Fours • 6 Sixes"
                        className="w-full bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      type="text"
                      value={resultPlayerImageUrl}
                      onChange={(e) => setResultPlayerImageUrl(e.target.value)}
                      placeholder="Player Photo URL (optional — initials badge used if blank)"
                      className="flex-1 bg-[#0d111c] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                    />
                    <label className="px-3 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                      <Upload size={13} />
                      <span>{uploadingPlayerPhoto ? "Uploading..." : "Upload Photo"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingPlayerPhoto}
                        onChange={handlePlayerPhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Live Preview matching Final Result & Top Performer UI */}
              <div className="max-w-md space-y-2.5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Frontend Card Preview
                </div>

                {resultShowSnapshot && (
                  <div className="rounded-xl bg-[#0b101b] border border-white/10 p-3.5 shadow-lg space-y-2.5">
                    <div className="text-sm font-bold text-white">Match Snapshot</div>
                    <div className="grid grid-cols-2 gap-3 items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {resultTeam1Flag ? (
                          <img src={resultTeam1Flag} alt={resultTeam1Name} className="w-11 h-8 rounded-md object-cover border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-11 h-8 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                            {resultTeam1Code || "T1"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white/90 truncate">{resultTeam1Name || "India"}</div>
                          <div className="text-sm sm:text-base font-extrabold text-white tabular-nums truncate">
                            {resultTeam1Score || "198/5 (20)"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 min-w-0">
                        {resultTeam2Flag ? (
                          <img src={resultTeam2Flag} alt={resultTeam2Name} className="w-11 h-8 rounded-md object-cover border border-white/10 shrink-0" />
                        ) : (
                          <div className="w-11 h-8 rounded-md bg-white/10 flex items-center justify-center text-[10px] font-black text-white shrink-0">
                            {resultTeam2Code || "T2"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white/90 truncate">{resultTeam2Name || "New Zealand"}</div>
                          <div className="text-sm sm:text-base font-extrabold text-white tabular-nums truncate">
                            {resultTeam2Score || "187/8 (20)"}
                          </div>
                        </div>
                      </div>
                    </div>
                    {resultSummary.trim() && (
                      <div className="text-[11px] font-semibold text-emerald-400 pt-1 border-t border-white/5">
                        {resultSummary}
                      </div>
                    )}
                  </div>
                )}

                {resultShowTopPerformer && (
                  <div className="rounded-xl bg-[#0b101b] border border-white/10 p-3.5 shadow-lg flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-b from-[#0284c7] to-[#1e3a8a] border border-sky-400/30 overflow-hidden shrink-0 flex items-center justify-center text-white font-black text-sm">
                      {resultPlayerImageUrl ? (
                        <img src={resultPlayerImageUrl} alt={resultPlayerName} className="w-full h-full object-cover object-top" />
                      ) : (
                        <span>
                          {(resultPlayerName || "Player")
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() || "")
                            .join("") || "PM"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-[#60a5fa]">
                        {resultPerformerLabel || "Top Performer"}
                      </div>
                      <div className="text-base font-extrabold text-white truncate">
                        {resultPlayerName || "Suryakumar Yadav"}
                      </div>
                      <div className="text-xs text-white/75 truncate">
                        {resultPlayerStats || "65 (39) • 2 Fours • 6 Sixes"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                {engType === "express" ? "Express Prompt *" : "Question / Prompt *"}
              </label>
              <textarea
                rows={2}
                required
                value={engQuestion}
                onChange={(e) => setEngQuestion(e.target.value)}
                placeholder={
                  engType === "express"
                    ? "e.g. What's your instant reaction right now? Write in your own words!"
                    : "e.g. Will India score 180+ runs in 20 overs?"
                }
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
              />
            </div>
          )}

          {engType !== "express" && engType !== "follow" && engType !== "match_result" && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Options / Choices ({engOptions.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="text-[11px] text-cyan-400 hover:underline font-bold flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Option
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {engOptions.map((opt, idx) => (
                    <div
                      key={opt.id}
                      className="p-3 rounded-xl bg-[#0a0d17] border border-white/10 flex items-center gap-2"
                    >
                      {engType === "question" && (
                        <input
                          type="radio"
                          name="correctOption"
                          checked={correctOptionId === opt.id}
                          onChange={() => setCorrectOptionId(opt.id)}
                          title="Mark as correct answer"
                          className="cursor-pointer text-emerald-500 focus:ring-emerald-500"
                        />
                      )}
                      <span className="w-6 h-6 rounded-md bg-white/5 text-gray-400 text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        required
                        value={opt.text}
                        onChange={(e) => handleOptionTextChange(opt.id, e.target.value)}
                        placeholder={`Option ${idx + 1} text`}
                        className="w-full bg-transparent border-none text-xs text-white focus:outline-none"
                      />
                      {engOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(opt.id)}
                          className="text-gray-500 hover:text-red-400 p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/5">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Countdown Timer (Minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={engTimer}
                    onChange={(e) => setEngTimer(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 4"
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Post Lock Over / Boundary
                  </label>
                  <input
                    type="text"
                    value={postLock}
                    onChange={(e) => setPostLock(e.target.value)}
                    placeholder="e.g. End of 12th Over"
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={handleResetForm}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>

          <div className="flex items-center gap-2">
            <Link href={`/admin/core-engine/engagement-setup/list?matchId=${selectedMatchId}`}>
              <button
                type="button"
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-black font-extrabold text-xs transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={15} />
              <span>{isSubmitting ? "Pushing Engagement..." : editId ? "Update Engagement" : "Push Live to Fans"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function AddEngagementPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Add Engagement...</div>}>
      <AddEngagementContent />
    </Suspense>
  );
}
