"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Trophy,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  HelpCircle,
  BarChart2,
  Target,
  Scale,
  Zap,
  Flame,
  Award,
  Check,
  X,
  Plus,
  Trash2,
  Radio,
  Eye,
  Filter,
  Users,
  User,
  Send,
  MessageSquare,
  Gift,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  ChevronRight,
  TrendingUp,
  Search,
} from "lucide-react";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  team1_short?: string;
  team2_short?: string;
  venue?: string;
  city?: string;
  date?: string;
  time?: string;
  format?: string;
  stage?: string;
  status?: string;
  momentCount?: number;
}

interface MatchMomentItem {
  id: string;
  momentId: string;
  matchId: string;
  innings: number;
  overs: string;
  score: string;
  matchOverTimestamp: string;
  event: string;
  matchMoment: string;
  description: string;
  createdAt: number;
  status: string;
}

interface ParticipantUser {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  selectedOptionId?: string;
  selectedOptionLabel?: string;
  votedAt?: number;
}

interface VisualRecognitionItem {
  id: string;
  recognitionId: string;
  matchId: string;
  momentId: string;
  targetType: "all" | "user";
  targetUserId?: string | null;
  targetUserName?: string | null;
  targetUserAvatar?: string | null;
  archetype: string;
  badgeIcon: string;
  headline: string;
  message: string;
  themeColor: string;
  rewards: {
    accuracySxp: number;
    participationSxp: number;
    streakBonusSxp: number;
    totalSxp: number;
  };
  communityImpact?: {
    stanceCount?: number;
    crowdSharePercent?: number;
    stadiumRoars?: string;
  };
  reengagementHook?: {
    nextMomentPrompt?: string;
    startsInSeconds?: number;
    nextMomentId?: string;
  };
  status?: string;
  createdAt?: number;
}

const ARCHETYPES = [
  {
    id: "SHARP_ORACLE",
    name: "Sharp Oracle",
    icon: "🔮",
    color: "#8b5cf6",
    badgeLabel: "ELITE IQ",
    defaultHeadline: "Tactical Visionary!",
    defaultMessage: "Spot-on cricket IQ! You called this decisive play before the bowler even began his run-up.",
    accuracySxp: 10,
    participationSxp: 2,
    streakBonus: 3,
  },
  {
    id: "FEARLESS_MAVERICK",
    name: "Fearless Maverick",
    icon: "⚡",
    color: "#f59e0b",
    badgeLabel: "ZERO LOSS COURAGE",
    defaultHeadline: "Fearless Stand!",
    defaultMessage: "You backed the daring play with conviction! Your bold stand pushed the stadium volume meter to peak roar.",
    accuracySxp: 0,
    participationSxp: 2,
    streakBonus: 0,
  },
  {
    id: "STADIUM_PULSE_MAKER",
    name: "Stadium Pulse Maker",
    icon: "📢",
    color: "#3b82f6",
    badgeLabel: "CROWD VOICE",
    defaultHeadline: "Voice on the Big Screen!",
    defaultMessage: "Your vote amplified the live fan sentiment. You and thousands of fans shaped the match momentum!",
    accuracySxp: 5,
    participationSxp: 2,
    streakBonus: 1,
  },
  {
    id: "CLUTCH_CALLER",
    name: "Clutch Caller",
    icon: "🎯",
    color: "#10b981",
    badgeLabel: "CLUTCH INSTINCT",
    defaultHeadline: "Clutch Instinct Unlocked!",
    defaultMessage: "Under high pressure in the death overs, your instincts held firm. Precision prediction logged!",
    accuracySxp: 15,
    participationSxp: 2,
    streakBonus: 5,
  },
  {
    id: "MOMENT_MVP",
    name: "Moment MVP",
    icon: "🏆",
    color: "#ec4899",
    badgeLabel: "FAN MVP",
    defaultHeadline: "Fan of the Moment!",
    defaultMessage: "Extraordinary engagement! You led the fan leaderboard during this over with unwavering support.",
    accuracySxp: 20,
    participationSxp: 5,
    streakBonus: 5,
  },
];

function VisibleRecognitionContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams?.get("matchId") || "";
  const urlMomentId = searchParams?.get("momentId") || "";

  // ─── MATCH & MOMENTS SELECTION STATE ───────────────────────────────────────
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId || "");
  const [manualMatchInput, setManualMatchInput] = useState<string>("");
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(urlMomentId || "");
  const [loadingMoments, setLoadingMoments] = useState(false);
  const [inningsFilter, setInningsFilter] = useState<number>(0); // 0 = all, 1 = inn 1, 2 = inn 2

  // ─── RECOGNITIONS LIST STATE ──────────────────────────────────────────────
  const [recognitions, setRecognitions] = useState<VisualRecognitionItem[]>([]);
  const [loadingRecognitions, setLoadingRecognitions] = useState(false);

  // ─── PARTICIPANTS / VOTERS LIST FOR CHOSEN MOMENT ─────────────────────────
  const [participants, setParticipants] = useState<ParticipantUser[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // ─── RECOGNITION FORM STATE ───────────────────────────────────────────────
  const [targetType, setTargetType] = useState<"all" | "user">("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [customUserName, setCustomUserName] = useState<string>("");

  const [selectedArchetype, setSelectedArchetype] = useState<string>("SHARP_ORACLE");
  const [badgeIcon, setBadgeIcon] = useState<string>("🔮");
  const [themeColor, setThemeColor] = useState<string>("#8b5cf6");
  const [headline, setHeadline] = useState<string>("Tactical Visionary!");
  const [message, setMessage] = useState<string>(
    "Spot-on cricket IQ! You called this decisive play before the bowler even began his run-up."
  );

  // Rewards breakdown
  const [accuracySxp, setAccuracySxp] = useState<number>(10);
  const [participationSxp, setParticipationSxp] = useState<number>(2);
  const [streakBonusSxp, setStreakBonusSxp] = useState<number>(3);

  // Social proof & community metrics
  const [stanceCount, setStanceCount] = useState<number>(3420);
  const [crowdSharePercent, setCrowdSharePercent] = useState<number>(38);
  const [stadiumRoars, setStadiumRoars] = useState<string>("+140 Roars");

  // Re-engagement Hook (Next-over onboarding)
  const [nextMomentPrompt, setNextMomentPrompt] = useState<string>(
    "Over 11 begins in 25s — can Bumrah strike again? Defend your streak now!"
  );
  const [startsInSeconds, setStartsInSeconds] = useState<number>(25);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  };

  // ─── FETCH MATCHES (only from /api/matches — same source as the Matches page) ───
  const loadMatches = useCallback(async () => {
    setLoadingMatches(true);
    try {
      const res = await fetch("/api/matches?limit=100");
      const json = await res.json();

      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const directoryMatches: MatchOption[] = json.data.map((m: any) => {
          const id = m.match_id || m.id || (m.entityId ? m.entityId.replace(/^MATCH#/, "") : "");
          return { ...m, match_id: id };
        });

        setMatches(directoryMatches);

        // Only auto-select when coming from a URL param (e.g. from Match Moments page link)
        // Otherwise leave empty — user must explicitly click a match card
        if (urlMatchId) {
          setSelectedMatchId(urlMatchId);
        }
      } else {
        setMatches([]);
        setSelectedMatchId("");
      }
    } catch (e) {
      console.warn("Failed to load matches", e);
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [urlMatchId]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // ─── FETCH MOMENTS ONLY WHEN A MATCH IS EXPLICITLY SELECTED ───────────────
  // Moments are always scoped to the selected matchId (stored as entityId=MATCH#<id> in DynamoDB)
  const fetchMoments = useCallback(async () => {
    if (!selectedMatchId) {
      // No match selected — clear moments
      setMoments([]);
      setSelectedMomentId("");
      return;
    }
    setLoadingMoments(true);
    try {
      const res = await fetch(`/api/match-moments?matchId=${selectedMatchId}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setMoments(json.data);
        // If arriving via URL param with a specific momentId, pre-select it
        if (urlMomentId && json.data.some((m: any) => m.momentId === urlMomentId || m.id === urlMomentId)) {
          setSelectedMomentId(urlMomentId);
        } else {
          // Do NOT auto-select — let user click a moment card
          setSelectedMomentId("");
        }
      } else {
        setMoments([]);
        setSelectedMomentId("");
      }
    } catch (e) {
      console.warn("Failed to load moments", e);
      setMoments([]);
      setSelectedMomentId("");
    } finally {
      setLoadingMoments(false);
    }
  }, [selectedMatchId, urlMomentId]);

  useEffect(() => {
    fetchMoments();
  }, [fetchMoments]);

  // ─── FETCH RECOGNITIONS FOR SELECTED MOMENT / MATCH ───────────────────────
  const fetchRecognitions = useCallback(async () => {
    if (!selectedMatchId) return;
    setLoadingRecognitions(true);
    try {
      let url = `/api/visible-recognition?matchId=${selectedMatchId}`;
      if (selectedMomentId) {
        url += `&momentId=${selectedMomentId}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecognitions(json.data);
      } else {
        setRecognitions([]);
      }
    } catch (e) {
      console.warn("Failed to fetch recognitions", e);
    } finally {
      setLoadingRecognitions(false);
    }
  }, [selectedMatchId, selectedMomentId]);

  useEffect(() => {
    fetchRecognitions();
  }, [fetchRecognitions]);

  // ─── SIMULATE OR FETCH PARTICIPANTS FOR CHOSEN MOMENT ─────────────────────
  useEffect(() => {
    if (!selectedMomentId) {
      setParticipants([]);
      return;
    }
    setLoadingParticipants(true);

    // Mock participants sample based on moment
    const sampleParticipants: ParticipantUser[] = [
      {
        userId: "usr_abhay_45",
        userName: "Abhay Sharma",
        userAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop",
        selectedOptionId: "opt_a",
        selectedOptionLabel: "6-10 Runs (Predicted Squeeze)",
        votedAt: Date.now() - 140000,
      },
      {
        userId: "usr_suzy_89",
        userName: "Suzy Patel",
        userAvatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
        selectedOptionId: "opt_b",
        selectedOptionLabel: "11-15 Runs (Boundary Surge)",
        votedAt: Date.now() - 120000,
      },
      {
        userId: "usr_vikram_22",
        userName: "Vikram Malhotra",
        userAvatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop",
        selectedOptionId: "opt_a",
        selectedOptionLabel: "6-10 Runs (Predicted Squeeze)",
        votedAt: Date.now() - 95000,
      },
      {
        userId: "usr_rohit_fan_07",
        userName: "Rohit Fanclub India",
        userAvatar: null,
        selectedOptionId: "opt_b",
        selectedOptionLabel: "11-15 Runs (Boundary Surge)",
        votedAt: Date.now() - 60000,
      },
    ];

    setParticipants(sampleParticipants);
    setLoadingParticipants(false);
  }, [selectedMomentId]);

  // ─── ACTIVE MATCH & MOMENT OBJECTS ────────────────────────────────────────
  const activeMatch = useMemo(() => {
    return matches.find((m) => (m.match_id || (m as any).id) === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  const activeMoment = useMemo(() => {
    return moments.find((m) => m.momentId === selectedMomentId || m.id === selectedMomentId);
  }, [moments, selectedMomentId]);

  const activeParticipant = useMemo(() => {
    if (targetType !== "user" || !selectedUserId) return null;
    return participants.find((p) => p.userId === selectedUserId) || null;
  }, [participants, targetType, selectedUserId]);

  const filteredMoments = useMemo(() => {
    if (inningsFilter === 0) return moments;
    return moments.filter((m) => m.innings === inningsFilter);
  }, [moments, inningsFilter]);

  // Total SXP
  const computedTotalSxp = useMemo(() => {
    return Number(accuracySxp || 0) + Number(participationSxp || 0) + Number(streakBonusSxp || 0);
  }, [accuracySxp, participationSxp, streakBonusSxp]);

  // ─── ARCHETYPE PRESET APPLIER ─────────────────────────────────────────────
  const handleSelectArchetype = (archId: string) => {
    setSelectedArchetype(archId);
    const item = ARCHETYPES.find((a) => a.id === archId);
    if (!item) return;

    setBadgeIcon(item.icon);
    setThemeColor(item.color);
    setHeadline(item.defaultHeadline);
    setMessage(item.defaultMessage);
    setAccuracySxp(item.accuracySxp);
    setParticipationSxp(item.participationSxp);
    setStreakBonusSxp(item.streakBonus);

    showToast("success", `Applied ${item.name} template`);
  };

  // ─── DISPATCH VISUAL RECOGNITION HANDLER ──────────────────────────────────
  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMatchId || !selectedMomentId) {
      showToast("error", "Please select both a Match and a Match Moment first");
      return;
    }

    if (targetType === "user" && !selectedUserId && !customUserName.trim()) {
      showToast("error", "Please choose or specify the target participant user");
      return;
    }

    if (!headline.trim() || !message.trim()) {
      showToast("error", "Headline and Recognition Message are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        matchId: selectedMatchId,
        momentId: selectedMomentId,
        targetType,
        targetUserId: targetType === "user" ? (selectedUserId || `usr_custom_${Date.now()}`) : null,
        targetUserName:
          targetType === "user"
            ? (activeParticipant?.userName || customUserName.trim() || "Valued Fan")
            : "All Participants",
        targetUserAvatar: activeParticipant?.userAvatar || null,
        archetype: selectedArchetype as any,
        badgeIcon,
        headline: headline.trim(),
        message: message.trim(),
        themeColor,
        rewards: {
          accuracySxp: Number(accuracySxp) || 0,
          participationSxp: Number(participationSxp) || 0,
          streakBonusSxp: Number(streakBonusSxp) || 0,
          totalSxp: computedTotalSxp,
        },
        communityImpact: {
          stanceCount: Number(stanceCount) || 0,
          crowdSharePercent: Number(crowdSharePercent) || 0,
          stadiumRoars,
        },
        reengagementHook: {
          nextMomentPrompt: nextMomentPrompt.trim(),
          startsInSeconds: Number(startsInSeconds) || 30,
        },
        status: "dispatched",
      };

      const res = await fetch("/api/visible-recognition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast("success", data.message || "Visual Recognition dispatched successfully!");
        fetchRecognitions();
      } else {
        showToast("error", data.error || "Failed to dispatch recognition");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to dispatch recognition");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── DELETE RECOGNITION HANDLER ───────────────────────────────────────────
  const handleDeleteRecognition = async (rec: VisualRecognitionItem) => {
    if (!confirm(`Delete recognition "${rec.headline}"?`)) return;

    try {
      const res = await fetch(
        `/api/visible-recognition?recognitionId=${rec.recognitionId || rec.id}&matchId=${rec.matchId}&momentId=${rec.momentId}&targetType=${rec.targetType}&targetUserId=${rec.targetUserId || ""}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        showToast("success", "Recognition deleted successfully from MatchMoments table");
        fetchRecognitions();
      } else {
        showToast("error", json.error || "Failed to delete");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to delete");
    }
  };

  // Manual Match Switcher
  const handleSwitchMatch = (idToSwitch: string) => {
    const clean = idToSwitch.trim().replace(/^MATCH#/, "");
    if (!clean) return;
    setSelectedMatchId(clean);
    setManualMatchInput("");
    showToast("success", `Switched active match to ${clean}`);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-[#e6edf3] p-4 sm:p-6 lg:p-8">
      {/* Toast alert */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-2xl text-sm font-medium border transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
            toast.type === "success"
              ? "bg-[#064e3b] text-[#34d399] border-[#059669]"
              : "bg-[#7f1d1d] text-[#fca5a5] border-[#dc2626]"
          }`}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {toast.text}
        </div>
      )}

      {/* Header Banner */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#21262d] pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 via-purple-500/20 to-blue-500/20 border border-amber-500/30 text-amber-400">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2 flex-wrap">
                  Visible Recognition Engine
                  <span className="text-xs font-mono uppercase bg-purple-900/40 text-purple-300 border border-purple-700/50 px-2 py-0.5 rounded-full">
                    Core Retention Loop
                  </span>
                  <span className="text-xs font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-700/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    📦 DynamoDB: MatchMoments Table
                  </span>
                </h1>
                <p className="text-sm text-[#8b949e] mt-0.5">
                  Resolve user responses, validate fan contribution to the stadium pulse, and dispatch instant celebratory cards.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/admin/core-engine/match-moments?matchId=${selectedMatchId}`}
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-[#161b22] hover:bg-[#21262d] text-[#c9d1d9] border border-[#30363d] flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Section 2: Match Moments Studio
            </Link>
            <Link
              href="/admin/core-engine/matches"
              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-[#161b22] hover:bg-[#21262d] text-[#c9d1d9] border border-[#30363d] flex items-center gap-1.5 transition-colors"
            >
              <Trophy className="w-3.5 h-3.5 text-blue-400" />
              Section 1: Match Setup
            </Link>
          </div>
        </div>

        {/* Quick Explanation Alert */}
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-purple-950/30 to-[#0d1117] border border-blue-900/40 flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-[#8b949e]">
            <span className="font-semibold text-blue-300">Psychological Retention Rule:</span> In live sports, 60–75% of fan predictions are incorrect. If fans receive a cold failure message or zero acknowledgement, churn spikes within 2–3 overs. Visual recognition guarantees that <strong className="text-white">every participant feels their vote shaped the live match pulse</strong>, preserves their streak, and hooks them into the next over.
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 1: MATCH SELECTION BAR                                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mb-6 p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Trophy className="w-4 h-4" />
              Step 1: Select Active Match
            </label>
            <span className="text-xs text-[#8b949e]">
              {selectedMatchId
                ? <>Selected: <strong className="text-white font-mono">{selectedMatchId}</strong>{activeMatch ? ` — ${activeMatch.team1} vs ${activeMatch.team2}` : ""}</>
                : "No match selected — click a match card below"}
            </span>
          </div>

          {/* Quick Manual Match ID Entry */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Or paste Match ID..."
                value={manualMatchInput}
                onChange={(e) => setManualMatchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && manualMatchInput.trim()) {
                    handleSwitchMatch(manualMatchInput);
                  }
                }}
                className="w-48 sm:w-60 px-3 py-1.5 rounded-lg bg-[#0d1117] border border-[#30363d] text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <button
              type="button"
              onClick={() => manualMatchInput.trim() && handleSwitchMatch(manualMatchInput)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-semibold text-white transition-colors"
            >
              Switch
            </button>
            <button
              type="button"
              onClick={loadMatches}
              title="Refresh match list"
              className="p-1.5 rounded-lg bg-[#0d1117] hover:bg-[#21262d] text-[#c9d1d9] border border-[#30363d]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMatches ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Match Cards Grid */}
        {loadingMatches ? (
          <div className="flex items-center gap-2 text-sm text-[#8b949e] py-4">
            <RefreshCw className="w-4 h-4 animate-spin" /> Loading matches…
          </div>
        ) : matches.length === 0 ? (
          <div className="py-6 text-center text-sm text-[#8b949e] border border-dashed border-[#30363d] rounded-xl">
            No matches found in the database.{" "}
            <Link href="/admin/core-engine/matches" className="text-amber-400 hover:underline">
              Create a match first →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {matches.map((m) => {
              const mId = m.match_id || (m as any).id;
              const isSelected = mId === selectedMatchId;
              const hasMoments = (m.momentCount || 0) > 0;

              return (
                <button
                  key={mId}
                  type="button"
                  onClick={() => setSelectedMatchId(mId)}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? "bg-gradient-to-r from-amber-950/40 via-blue-950/30 to-[#1f2937] border-amber-500 shadow-lg shadow-amber-950/20"
                      : "bg-[#0d1117] border-[#30363d] hover:border-[#484f58] text-[#8b949e]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-[#21262d] text-[#c9d1d9]">
                      {[m.format, m.stage].filter(Boolean).join(" • ")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {hasMoments && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-950/80 text-amber-300 border border-amber-700/60 shadow-sm animate-pulse">
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                          {m.momentCount} {m.momentCount === 1 ? "Moment" : "Moments"}
                        </span>
                      )}
                      {m.status && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                            m.status === "live"
                              ? "bg-emerald-950/70 text-emerald-400 border border-emerald-700/50"
                              : "bg-blue-950/50 text-blue-300 border border-blue-800/40"
                          }`}
                        >
                          {m.status}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-white truncate">
                    {m.team1} vs {m.team2}
                  </div>
                  <div className="text-xs text-[#8b949e] truncate mt-0.5 font-mono">
                    {m.match_id}
                  </div>
                  <div className="text-xs text-[#8b949e] truncate mt-0.5">
                    {m.venue || m.city || ""} {(m.venue || m.city) && m.date ? "•" : ""} {m.date || ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 2: MOMENTS OF THE SELECTED MATCH                               */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mb-6 p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Zap className="w-4 h-4" />
                Step 2: Select Match Moment
              </label>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/40">
                {selectedMatchId ? `${moments.length} Moments Recorded` : "Select a match first"}
              </span>
            </div>
            {selectedMatchId && (
            <p className="text-xs text-[#8b949e] mt-0.5">
              Moments for <strong className="text-white">{activeMatch ? `${activeMatch.team1} vs ${activeMatch.team2}` : selectedMatchId}</strong> — Match ID: <code className="text-white font-mono">{selectedMatchId}</code>
            </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchMoments}
              className="px-2.5 py-1 text-xs rounded-lg bg-[#0d1117] hover:bg-[#21262d] text-[#c9d1d9] border border-[#30363d] flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingMoments ? "animate-spin text-blue-400" : ""}`} />
              Refresh
            </button>

            <div className="flex items-center gap-1.5 bg-[#0d1117] p-1 rounded-lg border border-[#30363d]">
              <button
                type="button"
                onClick={() => setInningsFilter(0)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  inningsFilter === 0 ? "bg-[#21262d] text-white" : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                All Overs
              </button>
              <button
                type="button"
                onClick={() => setInningsFilter(1)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  inningsFilter === 1 ? "bg-[#21262d] text-white" : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                Innings 1
              </button>
              <button
                type="button"
                onClick={() => setInningsFilter(2)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  inningsFilter === 2 ? "bg-[#21262d] text-white" : "text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                Innings 2
              </button>
            </div>
          </div>
        </div>

        {!selectedMatchId ? (
          <div className="py-8 text-center rounded-xl bg-[#0d1117] border border-dashed border-[#30363d]">
            <Trophy className="w-8 h-8 text-amber-500/40 mx-auto mb-2" />
            <p className="text-sm text-[#8b949e]">
              ↑ Select a match above to view its moments
            </p>
          </div>
        ) : loadingMoments ? (
          <div className="py-8 text-center text-sm text-[#8b949e] flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            Loading match moments from MatchMoments table...
          </div>
        ) : filteredMoments.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-[#0d1117] border border-dashed border-[#30363d] space-y-3">
            <p className="text-sm text-[#c9d1d9]">
              No match moments found in <strong className="text-white">MatchMoments</strong> table for match <code className="text-amber-400">{selectedMatchId}</code>.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href={`/admin/core-engine/match-moments?matchId=${selectedMatchId}`}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d] flex items-center gap-1.5"
              >
                Create Moment for {selectedMatchId} in Match Moments Studio <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-1">
            {filteredMoments.map((mom) => {
              const momId = mom.momentId || mom.id;
              const isSelected = momId === selectedMomentId;
              return (
                <button
                  key={momId}
                  type="button"
                  onClick={() => setSelectedMomentId(momId)}
                  className={`p-3.5 rounded-xl border text-left transition-all relative ${
                    isSelected
                      ? "bg-gradient-to-br from-blue-950/70 to-purple-950/50 border-blue-500 shadow-md shadow-blue-950/40 text-white ring-1 ring-blue-500"
                      : "bg-[#0d1117] border-[#30363d] hover:border-[#484f58] text-[#c9d1d9]"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono font-bold text-amber-400">
                      Over {mom.overs || "0.0"}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#21262d] text-[#8b949e]">
                      Inn {mom.innings || 1}
                    </span>
                  </div>
                  <div className="text-sm font-semibold truncate mb-1 text-white">
                    {mom.event || "Match Moment"}
                  </div>
                  <div className="text-xs text-[#8b949e] line-clamp-2 leading-relaxed">
                    {mom.matchMoment || mom.description || "Live cricket over event"}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#21262d]">
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                      {mom.score || "Score N/A"}
                    </span>
                    <span className="text-[10px] font-mono text-[#8b949e]">
                      {mom.matchOverTimestamp || "Live"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 3: RECOGNITION STUDIO & FORM (TWO-COLUMN WORKSPACE)             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: THE VISUAL RECOGNITION CREATOR FORM (7 COLS) */}
        <div className="lg:col-span-7 bg-[#161b22] border border-[#30363d] rounded-2xl p-5 sm:p-6 shadow-xl">
          <form onSubmit={handleDispatch} className="space-y-6">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  Step 3: Craft Visual Recognition
                </h2>
                <p className="text-xs text-[#8b949e]">
                  Linked to: <strong className="text-white">{activeMoment?.event || selectedMomentId || "Selected Moment"}</strong> (Over {activeMoment?.overs || "N/A"})
                </p>
              </div>

              {/* Status pill */}
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                Live Broadcast Ready
              </span>
            </div>

            {/* AUDIENCE TARGET SELECTOR: GENERAL FOR ALL VS PARTICULAR USER */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#c9d1d9] mb-2">
                1. Target Audience & Delivery Scope
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTargetType("all")}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    targetType === "all"
                      ? "bg-gradient-to-r from-blue-950/50 to-indigo-950/50 border-blue-500 shadow-md text-white"
                      : "bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]"
                  }`}
                >
                  <Users className={`w-5 h-5 mt-0.5 shrink-0 ${targetType === "all" ? "text-blue-400" : "text-[#8b949e]"}`} />
                  <div>
                    <div className="text-sm font-semibold text-white">All Moment Participants</div>
                    <div className="text-xs text-[#8b949e] mt-0.5">
                      Stadium roar broadcast to everyone who voted or engaged in this moment.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType("user")}
                  className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                    targetType === "user"
                      ? "bg-gradient-to-r from-purple-950/50 to-pink-950/50 border-purple-500 shadow-md text-white"
                      : "bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]"
                  }`}
                >
                  <User className={`w-5 h-5 mt-0.5 shrink-0 ${targetType === "user" ? "text-purple-400" : "text-[#8b949e]"}`} />
                  <div>
                    <div className="text-sm font-semibold text-white">Particular User (VIP Spotlight)</div>
                    <div className="text-xs text-[#8b949e] mt-0.5">
                      Personalized recognition for an individual participant with custom copy.
                    </div>
                  </div>
                </button>
              </div>

              {/* PARTICULAR USER SELECTOR (SHOWN IF USER SCOPE ACTIVE) */}
              {targetType === "user" && (
                <div className="mt-3 p-3.5 rounded-xl bg-[#0d1117] border border-purple-900/40 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-purple-300">Select Moment Participant:</span>
                    <span className="text-[#8b949e]">
                      {participants.length} recorded participants
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                    {participants.map((p) => {
                      const isChosen = selectedUserId === p.userId;
                      return (
                        <button
                          key={p.userId}
                          type="button"
                          onClick={() => {
                            setSelectedUserId(p.userId);
                            setCustomUserName(p.userName);
                          }}
                          className={`p-2 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
                            isChosen
                              ? "bg-purple-950/50 border-purple-500 text-white"
                              : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9]"
                          }`}
                        >
                          {p.userAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.userAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-purple-900/50 flex items-center justify-center text-xs text-purple-300 font-bold">
                              {p.userName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="truncate flex-1">
                            <div className="text-xs font-semibold text-white truncate">{p.userName}</div>
                            <div className="text-[10px] text-amber-400 truncate">{p.selectedOptionLabel || p.selectedOptionId}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Manual user override */}
                  <div className="pt-2 border-t border-[#21262d] flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Or enter custom User Name / ID..."
                      value={customUserName}
                      onChange={(e) => setCustomUserName(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ARCHETYPE / PSYCHOLOGICAL MOTIVATOR TEMPLATES */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#c9d1d9] mb-2">
                2. Recognition Archetype & Emotional Tone
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ARCHETYPES.map((arch) => {
                  const isSelected = selectedArchetype === arch.id;
                  return (
                    <button
                      key={arch.id}
                      type="button"
                      onClick={() => handleSelectArchetype(arch.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "bg-gradient-to-br from-[#1f2937] to-[#111827] border-white/50 shadow-md"
                          : "bg-[#0d1117] border-[#30363d] hover:border-[#484f58] text-[#8b949e]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xl">{arch.icon}</span>
                        <span
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold"
                          style={{ color: arch.color, backgroundColor: `${arch.color}15` }}
                        >
                          {arch.badgeLabel}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-white truncate">{arch.name}</div>
                      <div className="text-[10px] text-[#8b949e] truncate mt-0.5">
                        +{arch.accuracySxp + arch.participationSxp + arch.streakBonus} Total SXP
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* HEADLINE & CUSTOM AFFIRMATION MESSAGE */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#c9d1d9] mb-1.5">
                  3. Celebration Headline / Title
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={badgeIcon}
                    onChange={(e) => setBadgeIcon(e.target.value)}
                    className="w-12 text-center py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-base text-white focus:outline-none focus:border-amber-500"
                    title="Emoji Badge"
                  />
                  <input
                    type="text"
                    required
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g. Tactical Visionary! or Fearless Stand!"
                    className="flex-1 px-3.5 py-2 rounded-lg bg-[#0d1117] border border-[#30363d] text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="color"
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value)}
                    className="w-10 h-10 p-0.5 rounded-lg bg-[#0d1117] border border-[#30363d] cursor-pointer"
                    title="Theme Accent Color"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#c9d1d9]">
                    4. Recognition Message (Value of Contribution Affirmation)
                  </label>
                  <span className="text-[11px] text-[#8b949e]">
                    Why did their participation matter?
                  </span>
                </div>
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell the fan how their vote or debate voice defined the crowd roar so they are energized to participate again..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0d1117] border border-[#30363d] text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>
            </div>

            {/* GAMIFICATION SXP BREAKDOWN */}
            <div className="p-4 rounded-xl bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Gift className="w-4 h-4" />
                  5. SXP Rewards Breakdown (Zero-Loss Principle)
                </label>
                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded">
                  +{computedTotalSxp} Total SXP
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[#8b949e] block mb-1">Accuracy SXP:</span>
                  <input
                    type="number"
                    min="0"
                    value={accuracySxp}
                    onChange={(e) => setAccuracySxp(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <span className="text-emerald-400 block mb-1 font-medium">Guaranteed Effort XP:</span>
                  <input
                    type="number"
                    min="1"
                    value={participationSxp}
                    onChange={(e) => setParticipationSxp(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-emerald-800/40 text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <span className="text-purple-400 block mb-1">Streak Bonus:</span>
                  <input
                    type="number"
                    min="0"
                    value={streakBonusSxp}
                    onChange={(e) => setStreakBonusSxp(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#161b22] border border-[#30363d] text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* RETENTION HOOK: NEXT OVER RE-ENGAGEMENT */}
            <div className="p-4 rounded-xl bg-[#0d1117] border border-[#30363d]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" />
                  6. Next Over Re-Engagement Teaser (Retention Loop)
                </label>
                <span className="text-[11px] text-[#8b949e]">
                  Starts in {startsInSeconds}s
                </span>
              </div>
              <input
                type="text"
                value={nextMomentPrompt}
                onChange={(e) => setNextMomentPrompt(e.target.value)}
                placeholder="e.g. Over 11 begins in 25s — Bumrah attacks! Ready to defend your streak?"
                className="w-full px-3.5 py-2 rounded-lg bg-[#161b22] border border-[#30363d] text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* DISPATCH SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={isSubmitting || !selectedMomentId}
              className={`w-full py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-xl transition-all ${
                isSubmitting || !selectedMomentId
                  ? "bg-[#21262d] text-[#8b949e] cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-500 via-orange-500 to-purple-600 hover:from-amber-400 hover:to-purple-500 text-white shadow-amber-900/30 active:scale-[0.99]"
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Dispatching Visual Recognition Card to MatchMoments...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {targetType === "all"
                    ? "Dispatch Stadium Recognition (All Participants)"
                    : `Send VIP Recognition to ${activeParticipant?.userName || customUserName || "User"}`}
                </>
              )}
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: LIVE INTERACTIVE MOBILE DEVICE CARD PREVIEW (5 COLS) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#21262d] pb-3 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-400" />
                Live Fan Device Preview
              </h3>
              <span className="text-[10px] font-mono uppercase bg-blue-950/60 text-blue-400 border border-blue-800/40 px-2 py-0.5 rounded-full">
                Sub-800ms Broadcast Delivery
              </span>
            </div>

            {/* Mobile frame wrapper */}
            <div className="mx-auto max-w-[340px] rounded-3xl p-3 bg-gradient-to-b from-[#1c2128] to-[#090d16] border-2 border-[#30363d] shadow-2xl">
              {/* Phone Speaker Notch */}
              <div className="w-20 h-3.5 bg-[#090d16] rounded-full mx-auto mb-3 border border-[#21262d]" />

              {/* In-App Visual Recognition Card Preview */}
              <div
                className="rounded-2xl p-4 relative overflow-hidden transition-all duration-300 shadow-2xl border"
                style={{
                  backgroundColor: "#0d1117",
                  borderColor: `${themeColor}60`,
                  boxShadow: `0 10px 30px -10px ${themeColor}40`,
                }}
              >
                {/* Glowing Aura Accent */}
                <div
                  className="absolute -top-16 -right-16 w-32 h-32 rounded-full blur-2xl pointer-events-none opacity-40"
                  style={{ backgroundColor: themeColor }}
                />

                {/* Top Badge Banner */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-2xl">{badgeIcon}</span>
                    <span
                      className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ color: themeColor, backgroundColor: `${themeColor}20` }}
                    >
                      {ARCHETYPES.find((a) => a.id === selectedArchetype)?.badgeLabel || "RECOGNITION"}
                    </span>
                  </div>

                  <span className="text-[10px] font-mono text-[#8b949e]">
                    Over {activeMoment?.overs || "10.2"}
                  </span>
                </div>

                {/* Target Avatar / Global Label */}
                <div className="flex items-center gap-2 mb-2.5">
                  {targetType === "user" && activeParticipant?.userAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeParticipant.userAvatar}
                      alt=""
                      className="w-6 h-6 rounded-full border border-purple-400 object-cover"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: `${themeColor}30`, color: themeColor }}
                    >
                      {targetType === "all" ? "🏟️" : (customUserName || "U").slice(0, 1)}
                    </div>
                  )}

                  <span className="text-xs font-semibold text-white truncate">
                    {targetType === "all"
                      ? "Stadium Roar • All Participants"
                      : (activeParticipant?.userName || customUserName || "Valued Fan")}
                  </span>
                </div>

                {/* Card Headline */}
                <h4 className="text-base font-bold text-white mb-1.5 tracking-tight">
                  {headline || "Celebration Title"}
                </h4>

                {/* Affirmation Copy */}
                <p className="text-xs text-[#c9d1d9] leading-relaxed mb-3">
                  {message || "Recognition message celebrating the fan's contribution..."}
                </p>

                {/* Community Voice / Social Proof Pill */}
                <div className="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-[11px] text-[#8b949e] mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-white">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    {stanceCount.toLocaleString()} fans stood with you
                  </span>
                  <span className="font-mono text-amber-400 font-bold">
                    {crowdSharePercent}% of crowd
                  </span>
                </div>

                {/* Rewards Pill */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-gradient-to-r from-amber-950/30 to-purple-950/30 border border-amber-500/30 mb-3">
                  <div className="text-[10px] text-[#8b949e]">
                    <span className="text-emerald-400">+{participationSxp} Effort XP</span>
                    {accuracySxp > 0 && <span className="text-amber-300"> • +{accuracySxp} Win IQ</span>}
                    {streakBonusSxp > 0 && <span className="text-purple-300"> • +{streakBonusSxp} Streak</span>}
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400">
                    +{computedTotalSxp} SXP
                  </span>
                </div>

                {/* Retention Action Teaser Button */}
                <div className="pt-2 border-t border-[#21262d]">
                  <div className="text-[10px] text-[#8b949e] mb-1.5 flex items-center justify-between">
                    <span>Next moment in: <strong className="text-white">{startsInSeconds}s</strong></span>
                    <span className="text-emerald-400 font-medium">Streak Protected 🔥</span>
                  </div>
                  <button
                    type="button"
                    className="w-full py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center gap-1 shadow-md"
                  >
                    <span>{nextMomentPrompt || "Call Next Over"}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Bottom Phone Indicator */}
              <div className="w-28 h-1 bg-[#21262d] rounded-full mx-auto mt-4" />
            </div>
          </div>

          {/* Real-time Push Specs Info Card */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] space-y-2.5 text-xs text-[#8b949e]">
            <div className="font-bold text-white flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-emerald-400" />
              Real-time Ingestion & Storage Architecture
            </div>
            <p>
              When dispatched, this recognition is stored directly into the <strong className="text-white">DynamoDB MatchMoments</strong> table collocated under the match entity.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded bg-[#0d1117] border border-[#21262d]">
                <span className="text-blue-300 block font-bold">Partition Key (entityId):</span>
                MATCH#{selectedMatchId || "MATCH_ID"}
              </div>
              <div className="p-2 rounded bg-[#0d1117] border border-[#21262d]">
                <span className="text-purple-300 block font-bold">Sort Key (sk):</span>
                RECOGNITION#{selectedMomentId || "MOMENT_ID"}#{targetType === "all" ? "GLOBAL" : "USER"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 4: DISPATCHED RECOGNITIONS AUDIT LIST                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="mt-8 bg-[#161b22] border border-[#30363d] rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#21262d] pb-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              Dispatched Recognitions Log
            </h3>
            <p className="text-xs text-[#8b949e]">
              Visual recognitions sent to fans for {activeMatch?.team1} vs {activeMatch?.team2}
            </p>
          </div>

          <button
            type="button"
            onClick={fetchRecognitions}
            className="px-3 py-1.5 rounded-lg bg-[#0d1117] hover:bg-[#21262d] text-xs text-[#c9d1d9] border border-[#30363d] flex items-center gap-1.5 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingRecognitions ? "animate-spin" : ""}`} />
            Refresh Log
          </button>
        </div>

        {loadingRecognitions ? (
          <div className="py-8 text-center text-sm text-[#8b949e] flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            Loading recognitions from MatchMoments table...
          </div>
        ) : recognitions.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#8b949e] rounded-xl bg-[#0d1117] border border-dashed border-[#30363d]">
            No recognitions have been dispatched for this match moment yet. Use the studio above to create your first card!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#21262d] text-[#8b949e] uppercase font-mono">
                  <th className="py-2.5 px-3">Moment</th>
                  <th className="py-2.5 px-3">Target Scope</th>
                  <th className="py-2.5 px-3">Archetype & Title</th>
                  <th className="py-2.5 px-3">Affirmation Message</th>
                  <th className="py-2.5 px-3">Rewards</th>
                  <th className="py-2.5 px-3">Dispatched At</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {recognitions.map((rec) => (
                  <tr key={rec.recognitionId || rec.id} className="hover:bg-[#1f242c] transition-colors">
                    <td className="py-3 px-3 font-mono text-amber-400 whitespace-nowrap">
                      {rec.momentId}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {rec.targetType === "all" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/60 text-blue-300 border border-blue-800/40">
                          <Users className="w-3 h-3" /> All Fans
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/40">
                          <User className="w-3 h-3" /> {rec.targetUserName || rec.targetUserId || "User"}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{rec.badgeIcon || "🔮"}</span>
                        <span className="font-semibold text-white">{rec.headline}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#8b949e]">
                        {rec.archetype}
                      </span>
                    </td>

                    <td className="py-3 px-3 max-w-xs truncate text-[#c9d1d9]" title={rec.message}>
                      {rec.message}
                    </td>

                    <td className="py-3 px-3 font-mono text-amber-400 font-bold whitespace-nowrap">
                      +{rec.rewards?.totalSxp || 0} SXP
                    </td>

                    <td className="py-3 px-3 text-[#8b949e] whitespace-nowrap font-mono text-[11px]">
                      {rec.createdAt ? new Date(rec.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recent"}
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDeleteRecognition(rec)}
                        className="p-1.5 rounded hover:bg-red-950/50 text-[#8b949e] hover:text-red-400 transition-colors"
                        title="Delete Recognition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VisibleRecognitionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090d16] text-[#e6edf3] p-8 flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
          <span className="text-sm font-medium">Loading Visible Recognition Engine...</span>
        </div>
      }
    >
      <VisibleRecognitionContent />
    </Suspense>
  );
}
