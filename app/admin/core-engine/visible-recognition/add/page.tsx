"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  List,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Users,
  User,
} from "lucide-react";
import CoreEngineStepper from "../../components/CoreEngineStepper";
import { sortMatchMoments, formatMomentOptionLabel } from "@/lib/matchMomentTimeline";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  format?: string;
}

interface MatchMomentItem {
  momentId: string;
  matchId: string;
  phase?: string;
  overs: string;
  score: string;
  event: string;
}

interface ParticipantUser {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  userEmail?: string | null;
}

interface EngagementOption {
  id: string;
  title: string;
  type: string;
  matchId?: string;
  momentId?: string;
  loopId?: string;
  recognitionId?: string;
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

function AddRecognitionContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || "";
  const urlMomentId = searchParams.get("momentId") || "";
  const urlEngagementId = searchParams.get("engagementId") || "";
  const editId = searchParams.get("editId");

  // Selection states
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId);
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(urlMomentId);
  const [engagements, setEngagements] = useState<EngagementOption[]>([]);
  const [selectedEngagementId, setSelectedEngagementId] = useState<string>(urlEngagementId);

  const [participants, setParticipants] = useState<ParticipantUser[]>([]);

  // Form Fields
  const [targetType, setTargetType] = useState<"all" | "user">("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [customUserName, setCustomUserName] = useState<string>("");
  const [selectedArchetype, setSelectedArchetype] = useState<string>("");
  const [badgeIcon, setBadgeIcon] = useState<string>("🏆");
  const [themeColor, setThemeColor] = useState<string>("#8b5cf6");
  const [headline, setHeadline] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  // Rewards
  const [accuracySxp, setAccuracySxp] = useState<number | "">("");
  const [participationSxp, setParticipationSxp] = useState<number | "">("");
  const [streakBonusSxp, setStreakBonusSxp] = useState<number | "">("");

  // Social Impact
  const [stanceCount, setStanceCount] = useState<number | "">("");
  const crowdSharePercent = 72;
  const [stadiumRoars, setStadiumRoars] = useState<string>("");

  // Re-engagement
  const [nextMomentPrompt, setNextMomentPrompt] = useState<string>("");
  const startsInSeconds = 30;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Fetch matches
  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch(`/api/matches?coreOnly=true&limit=1000&_t=${Date.now()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const list = json.data.map((m: Record<string, unknown>) => ({
            match_id: String(m.match_id || m.id || ""),
            team1: String(m.team1 || ""),
            team2: String(m.team2 || ""),
          }));
          setMatches(list);
        }
      } catch (err) {
        console.warn("Failed to fetch matches", err);
      }
    };
    fetchMatches();
  }, [selectedMatchId]);

  // Fetch moments for match
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

  // Fetch participants for moment
  useEffect(() => {
    if (!selectedMatchId || !selectedMomentId) return;
    const fetchParticipants = async () => {
      try {
        const res = await fetch(
          `/api/visible-recognition/participants?matchId=${encodeURIComponent(selectedMatchId)}&momentId=${encodeURIComponent(selectedMomentId)}`
        );
        const json = await res.json();
        if (json.success && Array.isArray(json.participants)) {
          setParticipants(json.participants);
        }
      } catch (err) {
        console.warn("Failed to fetch participants", err);
      }
    };
    fetchParticipants();

    const fetchMomentEngagements = async () => {
      try {
        const res = await fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&includeScheduled=true&limit=1000&_t=${Date.now()}`);
        const json = await res.json();
        const rawList = Array.isArray(json.engagements)
          ? json.engagements
          : Array.isArray(json.data)
          ? json.data
          : [];
        const cleanM = selectedMatchId.replace(/^MATCH#/i, "").trim().toLowerCase();
        const cleanMom = selectedMomentId.replace(/^MOMENT#/i, "").trim().toLowerCase();
        const filtered = rawList.filter((e: EngagementOption) => {
          const eMatch = String(e.matchId || "").replace(/^MATCH#/i, "").trim().toLowerCase();
          const eMom = String(e.momentId || e.loopId || "").replace(/^MOMENT#/i, "").trim().toLowerCase();
          return eMatch === cleanM && eMom === cleanMom;
        });
        setEngagements(filtered);
        if (filtered.length === 1 && !selectedEngagementId) {
          setSelectedEngagementId(filtered[0].id);
        }
      } catch (err) {
        console.warn("Failed to fetch moment engagements", err);
      }
    };
    fetchMomentEngagements();
  }, [selectedMatchId, selectedMomentId]);

  // Apply archetype preset
  const handleSelectArchetype = (archId: string) => {
    setSelectedArchetype(archId);
    const arch = ARCHETYPES.find((a) => a.id === archId);
    if (arch) {
      setBadgeIcon(arch.icon);
      setThemeColor(arch.color);
      setHeadline(arch.defaultHeadline);
      setMessage(arch.defaultMessage);
      setAccuracySxp(arch.accuracySxp);
      setParticipationSxp(arch.participationSxp);
      setStreakBonusSxp(arch.streakBonus);
    }
  };

  const handleResetForm = () => {
    setSelectedArchetype("");
    setBadgeIcon("🏆");
    setThemeColor("#8b5cf6");
    setHeadline("");
    setMessage("");
    setAccuracySxp("");
    setParticipationSxp("");
    setStreakBonusSxp("");
    setStanceCount("");
    setStadiumRoars("");
    setNextMomentPrompt("");
    setSubmitResult(null);
  };

  const computedTotalSxp =
    (typeof accuracySxp === "number" ? accuracySxp : 0) +
    (typeof participationSxp === "number" ? participationSxp : 0) +
    (typeof streakBonusSxp === "number" ? streakBonusSxp : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatchId || !selectedMomentId) {
      setSubmitResult({ success: false, message: "Please select a match and a moment" });
      return;
    }
    if (!headline.trim() || !message.trim()) {
      setSubmitResult({ success: false, message: "Headline and Message are required" });
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    const payload = {
      recognitionId: editId || undefined,
      matchId: selectedMatchId,
      momentId: selectedMomentId,
      engagementId: selectedEngagementId || undefined,
      targetType,
      targetUserId: targetType === "user" ? (selectedUserId || `usr_custom_${Date.now()}`) : null,
      targetUserName:
        targetType === "user"
          ? (customUserName.trim() || selectedUserId || "Top Fan")
          : "All Participants",
      targetUserAvatar: null,
      roomId: "NMryj1w7t8mJpGzEvF9q",
      archetype: selectedArchetype,
      badgeIcon,
      headline: headline.trim(),
      message: message.trim(),
      themeColor,
      rewards: {
        accuracySxp: typeof accuracySxp === "number" ? accuracySxp : 0,
        participationSxp: typeof participationSxp === "number" ? participationSxp : 0,
        streakBonusSxp: typeof streakBonusSxp === "number" ? streakBonusSxp : 0,
        totalSxp: computedTotalSxp,
      },
      communityImpact: {
        stanceCount: Number(stanceCount) || 0,
        crowdSharePercent: Number(crowdSharePercent) || 0,
        stadiumRoars: stadiumRoars.trim() || "+120 Roars",
      },
      reengagementHook: {
        nextMomentPrompt: nextMomentPrompt.trim(),
        startsInSeconds: Number(startsInSeconds) || 30,
      },
      status: "dispatched",
      isEdit: Boolean(editId),
    };

    try {
      const res = await fetch("/api/visible-recognition", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          message: editId ? "Recognition updated successfully!" : "Recognition dispatched live to fans!",
        });
      } else {
        setSubmitResult({
          success: false,
          message: data.error || "Failed to dispatch recognition",
        });
      }
    } catch (err: unknown) {
      setSubmitResult({
        success: false,
        message: (err as Error).message || "Network error dispatching recognition",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper
        currentStepKey="recognition"
        matchId={selectedMatchId}
        momentId={selectedMomentId}
        compact
      />

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/admin/core-engine/visible-recognition/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-white/10">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>🏆</span>
              <span>{editId ? "Edit Recognition" : "Add Recognition"}</span>
            </h1>
            <p className="text-xs text-gray-400">
              Reward participating fans with archetype badges, SXP points, and stadium roars
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/admin/core-engine/visible-recognition/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5">
              <List size={14} />
              <span>Recognition List</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Alert toast */}
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
                href="/admin/core-engine/overview"
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1 transition-all"
              >
                <span>View Loop Overview</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Binding */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-2">
              <span>🏏</span> Match & Moment Context
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Match Fixture *
              </label>
              <select
                value={selectedMatchId}
                onChange={(e) => {
                  setSelectedMatchId(e.target.value);
                  setSelectedMomentId("");
                  setSelectedEngagementId("");
                }}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
              >
                <option value="">-- Choose Match --</option>
                {matches.map((m) => (
                  <option key={m.match_id} value={m.match_id}>
                    {m.team1} vs {m.team2} ({m.format || "Match"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Moment Trigger *
              </label>
              <select
                value={selectedMomentId}
                onChange={(e) => {
                  setSelectedMomentId(e.target.value);
                  setSelectedEngagementId("");
                }}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
              >
                <option value="">-- Choose Moment --</option>
                {moments.map((m) => (
                  <option key={m.momentId} value={m.momentId}>
                    {formatMomentOptionLabel(m)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Linked Engagement (1:1)
              </label>
              <select
                value={selectedEngagementId}
                onChange={(e) => setSelectedEngagementId(e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
              >
                <option value="">-- Optional: Select Engagement --</option>
                {engagements.map((eng) => (
                  <option key={eng.id} value={eng.id}>
                    [{String(eng.type || "loop").toUpperCase()}] {eng.title || eng.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Target Audience */}
          <div className="pt-3 border-t border-white/5 space-y-3">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Target Audience
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setTargetType("all")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                  targetType === "all"
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-[#0a0d17] border-white/10 text-gray-400"
                }`}
              >
                <Users size={14} />
                <span>All Participants</span>
              </button>

              <button
                type="button"
                onClick={() => setTargetType("user")}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                  targetType === "user"
                    ? "bg-purple-500/20 border-purple-500 text-purple-300"
                    : "bg-[#0a0d17] border-white/10 text-gray-400"
                }`}
              >
                <User size={14} />
                <span>Particular User</span>
              </button>
            </div>

            {targetType === "user" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Select Participant</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="">-- Choose User --</option>
                    {participants.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.userName} ({p.userId})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-400 mb-1">Or Custom User Name</label>
                  <input
                    type="text"
                    value={customUserName}
                    onChange={(e) => setCustomUserName(e.target.value)}
                    placeholder="e.g. Rahul Yadav"
                    className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Archetype Selector */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-pink-400 flex items-center gap-2">
              <span>🔮</span> Select Archetype Persona
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {ARCHETYPES.map((arch) => {
              const isSelected = selectedArchetype === arch.id;
              return (
                <button
                  key={arch.id}
                  type="button"
                  onClick={() => handleSelectArchetype(arch.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "bg-purple-500/15 border-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.3)] ring-2 ring-purple-500/30"
                      : "bg-[#0a0d17] border-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="text-2xl mb-1.5">{arch.icon}</div>
                  <h4 className="text-xs font-black text-white">{arch.name}</h4>
                  <span
                    className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded mt-1 inline-block"
                    style={{ background: `${arch.color}25`, color: arch.color }}
                  >
                    {arch.badgeLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Headline, Message & Rewards */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-5">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span>✍️</span> Recognition Copy & SXP Reward Engine
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Headline *
              </label>
              <input
                type="text"
                required
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="e.g. Tactical Visionary!"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Recognition Message *
              </label>
              <textarea
                rows={2}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Recognition copy displayed to fan..."
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-3 border-t border-white/5">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Accuracy SXP
                </label>
                <input
                  type="number"
                  value={accuracySxp}
                  onChange={(e) => setAccuracySxp(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 10"
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Participation SXP
                </label>
                <input
                  type="number"
                  value={participationSxp}
                  onChange={(e) => setParticipationSxp(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 2"
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Streak Bonus SXP
                </label>
                <input
                  type="number"
                  value={streakBonusSxp}
                  onChange={(e) => setStreakBonusSxp(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 3"
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col justify-center items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Total SXP
                </span>
                <span className="text-2xl font-black text-amber-300">
                  +{computedTotalSxp} SXP
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-white/5">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Crowd Roars Tag
                </label>
                <input
                  type="text"
                  value={stadiumRoars}
                  onChange={(e) => setStadiumRoars(e.target.value)}
                  placeholder="e.g. +120 Roars"
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Stance Count
                </label>
                <input
                  type="number"
                  value={stanceCount}
                  onChange={(e) => setStanceCount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="e.g. 450"
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Next Moment Teaser Hook
                </label>
                <input
                  type="text"
                  value={nextMomentPrompt}
                  onChange={(e) => setNextMomentPrompt(e.target.value)}
                  placeholder="e.g. Next Over starting in 30s"
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={handleResetForm}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
          >
            <RotateCcw size={14} />
            <span>Clear & Reset</span>
          </button>

          <div className="flex items-center gap-2">
            <Link href={`/admin/core-engine/visible-recognition/list?matchId=${selectedMatchId}`}>
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
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white font-extrabold text-xs transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={15} />
              <span>{isSubmitting ? "Dispatching..." : editId ? "Update Recognition" : "Dispatch to Fans"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function AddRecognitionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Add Recognition...</div>}>
      <AddRecognitionContent />
    </Suspense>
  );
}
