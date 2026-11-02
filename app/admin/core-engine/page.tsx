"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Trophy,
  Sparkles,
  Zap,
  Award,
  Check,
  Trash2,
  Edit3,
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
  X,
  RotateCcw,
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
  tournament?: string;
  stage?: string;
  status?: string;
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
  userEmail?: string | null;
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
  updatedAt?: number;
  sk?: string;
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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#8b949e",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  color: "#e6edf3",
  outline: "none",
  boxSizing: "border-box",
};

function CoreEngineVisualRecognitionContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams?.get("matchId") || "";
  const urlMomentId = searchParams?.get("momentId") || "";

  // ── MATCH & MOMENTS SELECTION STATE (No default selection!) ────────────────
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId || "");
  const [loadingMatches, setLoadingMatches] = useState(false);

  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(urlMomentId || "");
  const [loadingMoments, setLoadingMoments] = useState(false);

  // ── PARTICIPANTS STATE ─────────────────────────────────────────────────────
  const [participants, setParticipants] = useState<ParticipantUser[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  // ── RECOGNITIONS LIST STATE ────────────────────────────────────────────────
  const [recognitions, setRecognitions] = useState<VisualRecognitionItem[]>([]);
  const [loadingRecognitions, setLoadingRecognitions] = useState(false);

  // ── RECOGNITION FORM STATE (No predefined defaults, start empty!) ──────────
  const [targetType, setTargetType] = useState<"all" | "user" | "">("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [customUserName, setCustomUserName] = useState<string>("");

  const [selectedArchetype, setSelectedArchetype] = useState<string>("");
  const [badgeIcon, setBadgeIcon] = useState<string>("");
  const [themeColor, setThemeColor] = useState<string>("#f59e0b");
  const [headline, setHeadline] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  // Rewards breakdown (starts empty / 0)
  const [accuracySxp, setAccuracySxp] = useState<number | "">("");
  const [participationSxp, setParticipationSxp] = useState<number | "">("");
  const [streakBonusSxp, setStreakBonusSxp] = useState<number | "">("");

  // Social proof metrics
  const [stanceCount, setStanceCount] = useState<number | "">("");
  const [crowdSharePercent, setCrowdSharePercent] = useState<number | "">("");
  const [stadiumRoars, setStadiumRoars] = useState<string>("");

  // Re-engagement Hook
  const [nextMomentPrompt, setNextMomentPrompt] = useState<string>("");
  const [startsInSeconds, setStartsInSeconds] = useState<number | "">("");

  // ── EDITING STATE ──────────────────────────────────────────────────────────
  const [editingRecognitionId, setEditingRecognitionId] = useState<string | null>(null);
  const [editingOriginalSk, setEditingOriginalSk] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Toast / Status feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4500);
  };

  // ── FETCH MATCHES ──────────────────────────────────────────────────────────
  const loadMatches = useCallback(async () => {
    setLoadingMatches(true);
    try {
      const res = await fetch("/api/matches?limit=100");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const list: MatchOption[] = json.data.map((m: any) => {
          const id = m.match_id || m.id || (m.entityId ? m.entityId.replace(/^MATCH#/, "") : "");
          return { ...m, match_id: id };
        });
        setMatches(list);
        if (urlMatchId && list.some((m) => m.match_id === urlMatchId)) {
          setSelectedMatchId(urlMatchId);
        }
      } else {
        setMatches([]);
      }
    } catch {
      setMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }, [urlMatchId]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // ── FETCH MOMENTS FOR SELECTED MATCH ───────────────────────────────────────
  const fetchMoments = useCallback(async () => {
    if (!selectedMatchId) {
      setMoments([]);
      setSelectedMomentId("");
      return;
    }
    setLoadingMoments(true);
    try {
      const res = await fetch(`/api/match-moments?matchId=${encodeURIComponent(selectedMatchId)}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setMoments(json.data);
        if (urlMomentId && json.data.some((m: any) => (m.momentId || m.id) === urlMomentId)) {
          setSelectedMomentId(urlMomentId);
        }
      } else {
        setMoments([]);
        setSelectedMomentId("");
      }
    } catch {
      setMoments([]);
      setSelectedMomentId("");
    } finally {
      setLoadingMoments(false);
    }
  }, [selectedMatchId, urlMomentId]);

  useEffect(() => {
    fetchMoments();
  }, [fetchMoments]);

  // ── FETCH PARTICIPANTS FOR CHOSEN MOMENT ───────────────────────────────────
  useEffect(() => {
    if (!selectedMatchId || !selectedMomentId) {
      setParticipants([]);
      return;
    }
    let cancelled = false;
    setLoadingParticipants(true);

    const mId = encodeURIComponent(selectedMatchId);
    const momId = encodeURIComponent(selectedMomentId);

    fetch(`/api/visible-recognition/participants?matchId=${mId}&momentId=${momId}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.participants)) {
          setParticipants(json.participants);
        } else {
          setParticipants([]);
        }
      })
      .catch(() => {
        if (!cancelled) setParticipants([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingParticipants(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMatchId, selectedMomentId]);

  // ── FETCH RECOGNITIONS (BY MATCH / ALL) ─────────────────────────────────────
  const fetchRecognitions = useCallback(async () => {
    setLoadingRecognitions(true);
    try {
      let url = "/api/visible-recognition";
      if (selectedMatchId) {
        url += `?matchId=${encodeURIComponent(selectedMatchId)}`;
        if (selectedMomentId) {
          url += `&momentId=${encodeURIComponent(selectedMomentId)}`;
        }
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecognitions(json.data);
      } else {
        setRecognitions([]);
      }
    } catch {
      setRecognitions([]);
    } finally {
      setLoadingRecognitions(false);
    }
  }, [selectedMatchId, selectedMomentId]);

  useEffect(() => {
    fetchRecognitions();
  }, [fetchRecognitions]);

  // ── ACTIVE OBJECTS ─────────────────────────────────────────────────────────
  const activeMatch = useMemo(() => {
    return matches.find((m) => m.match_id === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  const activeMoment = useMemo(() => {
    return moments.find((m) => (m.momentId || m.id) === selectedMomentId) || null;
  }, [moments, selectedMomentId]);

  const activeParticipant = useMemo(() => {
    if (targetType !== "user" || !selectedUserId) return null;
    return participants.find((p) => p.userId === selectedUserId) || null;
  }, [participants, targetType, selectedUserId]);

  const computedTotalSxp = useMemo(() => {
    return (
      (typeof accuracySxp === "number" ? accuracySxp : 0) +
      (typeof participationSxp === "number" ? participationSxp : 0) +
      (typeof streakBonusSxp === "number" ? streakBonusSxp : 0)
    );
  }, [accuracySxp, participationSxp, streakBonusSxp]);

  // ── ARCHETYPE CHANGE HANDLER ───────────────────────────────────────────────
  const handleArchetypeChange = (archId: string) => {
    setSelectedArchetype(archId);
    if (!archId) return;
    const arch = ARCHETYPES.find((a) => a.id === archId);
    if (arch) {
      setBadgeIcon(arch.icon);
      setThemeColor(arch.color);
      setHeadline(arch.defaultHeadline);
      setMessage(arch.defaultMessage);
      setAccuracySxp(arch.accuracySxp);
      setParticipationSxp(arch.participationSxp);
      setStreakBonusSxp(arch.streakBonus);
      if (!stadiumRoars) setStadiumRoars("+120 Roars");
      if (!startsInSeconds) setStartsInSeconds(30);
    }
  };

  // ── CLEAR FORM HANDLER ─────────────────────────────────────────────────────
  const handleClearForm = () => {
    setEditingRecognitionId(null);
    setEditingOriginalSk(null);
    setTargetType("");
    setSelectedUserId("");
    setCustomUserName("");
    setSelectedArchetype("");
    setBadgeIcon("");
    setHeadline("");
    setMessage("");
    setThemeColor("#f59e0b");
    setAccuracySxp("");
    setParticipationSxp("");
    setStreakBonusSxp("");
    setStanceCount("");
    setCrowdSharePercent("");
    setStadiumRoars("");
    setNextMomentPrompt("");
    setStartsInSeconds("");
    showToast("success", "Form cleared!");
  };

  // ── EDIT RECOGNITION (POPULATES FORM) ───────────────────────────────────────
  const handleStartEdit = (rec: VisualRecognitionItem) => {
    setEditingRecognitionId(rec.recognitionId || rec.id);
    setEditingOriginalSk(rec.sk || null);

    // If match/moment not matching currently selected, switch them
    if (rec.matchId && rec.matchId !== selectedMatchId) {
      setSelectedMatchId(rec.matchId);
    }
    if (rec.momentId && rec.momentId !== selectedMomentId) {
      setSelectedMomentId(rec.momentId);
    }

    setTargetType(rec.targetType || "all");
    setSelectedUserId(rec.targetUserId || "");
    setCustomUserName(rec.targetUserName || "");
    setSelectedArchetype(rec.archetype || "");
    setBadgeIcon(rec.badgeIcon || "🔮");
    setHeadline(rec.headline || "");
    setMessage(rec.message || "");
    setThemeColor(rec.themeColor || "#f59e0b");

    setAccuracySxp(rec.rewards?.accuracySxp ?? 0);
    setParticipationSxp(rec.rewards?.participationSxp ?? 0);
    setStreakBonusSxp(rec.rewards?.streakBonusSxp ?? 0);

    setStanceCount(rec.communityImpact?.stanceCount ?? "");
    setCrowdSharePercent(rec.communityImpact?.crowdSharePercent ?? "");
    setStadiumRoars(rec.communityImpact?.stadiumRoars ?? "");

    setNextMomentPrompt(rec.reengagementHook?.nextMomentPrompt ?? "");
    setStartsInSeconds(rec.reengagementHook?.startsInSeconds ?? 30);

    formRef.current?.scrollIntoView({ behavior: "smooth" });
    showToast("success", `Editing recognition "${rec.headline || rec.recognitionId}"`);
  };

  // ── SUBMIT / DISPATCH OR UPDATE ────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMatchId) {
      showToast("error", "Please select a Match from the dropdown");
      return;
    }

    if (!selectedMomentId) {
      showToast("error", "Please select a Match Moment from the dropdown");
      return;
    }

    if (!targetType) {
      showToast("error", "Please select Target Audience (All Fans or Particular User)");
      return;
    }

    if (targetType === "user" && !selectedUserId && !customUserName.trim()) {
      showToast("error", "Please select or enter the target participant user");
      return;
    }

    if (!headline.trim() || !message.trim()) {
      showToast("error", "Headline and Recognition Message are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: any = {
        recognitionId: editingRecognitionId || undefined,
        originalSk: editingOriginalSk || undefined,
        isEdit: Boolean(editingRecognitionId),
        matchId: selectedMatchId,
        momentId: selectedMomentId,
        targetType,
        targetUserId: targetType === "user" ? (selectedUserId || `usr_custom_${Date.now()}`) : null,
        targetUserName:
          targetType === "user"
            ? (activeParticipant?.userName || customUserName.trim() || "Valued Fan")
            : "All Participants",
        targetUserAvatar: activeParticipant?.userAvatar || null,
        targetUserEmail:
          activeParticipant?.userEmail ||
          (selectedUserId && selectedUserId.includes("@") ? selectedUserId : null),
        roomId: "NMryj1w7t8mJpGzEvF9q",
        archetype: selectedArchetype || "CUSTOM",
        badgeIcon: badgeIcon.trim() || "🏆",
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
          stadiumRoars: stadiumRoars.trim() || "+120 Roars",
        },
        reengagementHook: {
          nextMomentPrompt: nextMomentPrompt.trim(),
          startsInSeconds: Number(startsInSeconds) || 30,
        },
        status: "dispatched",
      };

      const endpoint = "/api/visible-recognition";
      const method = editingRecognitionId ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast("success", data.message || (editingRecognitionId ? "Recognition updated!" : "Recognition dispatched!"));
        handleClearForm();
        fetchRecognitions();
      } else {
        showToast("error", data.error || "Failed to process recognition");
      }
    } catch (err: any) {
      showToast("error", err.message || "Network error processing recognition");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── DELETE RECOGNITION ─────────────────────────────────────────────────────
  const handleDeleteRecognition = async (rec: VisualRecognitionItem) => {
    if (!confirm(`Are you sure you want to delete recognition "${rec.headline || rec.recognitionId}"?`)) {
      return;
    }

    try {
      const recId = rec.recognitionId || rec.id;
      const res = await fetch(
        `/api/visible-recognition?recognitionId=${encodeURIComponent(recId)}&matchId=${encodeURIComponent(rec.matchId)}&momentId=${encodeURIComponent(rec.momentId)}&targetType=${encodeURIComponent(rec.targetType)}&targetUserId=${encodeURIComponent(rec.targetUserId || "")}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        showToast("success", "Recognition deleted successfully");
        if (editingRecognitionId === recId) {
          handleClearForm();
        }
        fetchRecognitions();
      } else {
        showToast("error", json.error || "Failed to delete recognition");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to delete recognition");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "20px 24px",
      }}
    >
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 24,
            zIndex: 9999,
            background: toast.type === "success" ? "#1f6feb" : "#da3633",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              marginLeft: 8,
              padding: 0,
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Sparkles size={22} color="#f59e0b" />
            Core Engine • Visible Recognition Studio
          </h1>
          <p style={{ fontSize: 13, color: "#8b949e", margin: "4px 0 0" }}>
            Dispatch instant visible recognition cards to fans with zero-loss retention psychology (DynamoDB MatchMoments table).
          </p>
        </div>

        {/* Section Navigation Tabs (Same as match-moments) */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Link
            href="/admin/core-engine/matches"
            style={{
              background: "#161b22",
              color: "#c9d1d9",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Trophy size={14} color="#58a6ff" />
            Section 1: Match Setup
          </Link>

          <Link
            href={selectedMatchId ? `/admin/core-engine/match-moments?matchId=${selectedMatchId}` : "/admin/core-engine/match-moments"}
            style={{
              background: "#161b22",
              color: "#c9d1d9",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Zap size={14} color="#f59e0b" />
            Section 2: Match Moments Studio
          </Link>

          <span
            style={{
              background: "#1f6feb",
              color: "#fff",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 12,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Award size={14} />
            Section 3: Visible Recognition
          </span>
        </div>
      </div>

      {/* Top Match Bar Selector Dropdown (Like match-moments top bar) */}
      <div
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: "12px 16px",
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#8b949e", textTransform: "uppercase" }}>
            Active Match:
          </span>
          <select
            value={selectedMatchId}
            onChange={(e) => {
              setSelectedMatchId(e.target.value);
              setSelectedMomentId("");
              setSelectedUserId("");
            }}
            style={{
              background: "#0d1117",
              color: selectedMatchId ? "#58a6ff" : "#8b949e",
              border: "1px solid #388bfd",
              borderRadius: 6,
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
              minWidth: 280,
              maxWidth: 550,
            }}
          >
            <option value="">-- Select Match --</option>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.team1} vs {m.team2} {m.tournament ? `| ${m.tournament}` : ""} — {m.match_id} ({m.venue || "Stadium"})
              </option>
            ))}
          </select>
          {loadingMatches && <RefreshCw size={14} className="animate-spin" color="#58a6ff" />}
        </div>

        {selectedMatchId && activeMatch && (
          <div style={{ fontSize: 12, color: "#8b949e" }}>
            Format: <span style={{ color: "#fff", fontWeight: 600 }}>{activeMatch.format || "T20"}</span> · Venue:{" "}
            <span style={{ color: "#fff", fontWeight: 600 }}>{activeMatch.venue || activeMatch.city || "Live Ground"}</span>
          </div>
        )}
      </div>

      {/* Main Workspace: Left Column (Form) & Right Column (Preview) */}
      <div
        ref={formRef}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: 20,
          marginBottom: 30,
        }}
      >
        {/* Left Column: Craft Recognition Form */}
        <div
          style={{
            background: "#161b22",
            border: editingRecognitionId ? "1.5px solid #f59e0b" : "1px solid #30363d",
            borderRadius: 8,
            padding: 20,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "1px solid #21262d",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: editingRecognitionId ? "#f59e0b" : "#fff",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {editingRecognitionId ? <Edit3 size={16} /> : <Award size={16} color="#f59e0b" />}
                {editingRecognitionId ? `Edit Visual Recognition (${editingRecognitionId})` : "Create Visual Recognition"}
              </h2>
              <p style={{ fontSize: 12, color: "#8b949e", margin: "2px 0 0" }}>
                Select match moment and delivery scope, craft affirmation copy, and dispatch.
              </p>
            </div>

            {editingRecognitionId && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#f59e0b",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  fontWeight: 700,
                }}
              >
                EDIT MODE
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* 1. Match Moment Dropdown */}
            <div>
              <label style={labelStyle}>1. Match Moment *</label>
              <select
                value={selectedMomentId}
                onChange={(e) => {
                  setSelectedMomentId(e.target.value);
                  setSelectedUserId("");
                }}
                disabled={!selectedMatchId}
                style={{
                  ...inputStyle,
                  fontWeight: 600,
                  color: selectedMomentId ? "#58a6ff" : "#8b949e",
                }}
              >
                <option value="">
                  {!selectedMatchId
                    ? "-- Select a Match First in Top Bar --"
                    : moments.length === 0
                    ? "-- No Match Moments Found (Record in Tab 2) --"
                    : "-- Select Match Moment --"}
                </option>
                {moments.map((mom) => (
                  <option key={mom.momentId || mom.id} value={mom.momentId || mom.id}>
                    {mom.momentId || mom.id} | Over {mom.overs || "0.0"} (Inn {mom.innings || 1}) — {mom.event || "Moment"} ({mom.score || "Live"})
                  </option>
                ))}
              </select>
              {loadingMoments && (
                <div style={{ fontSize: 11, color: "#8b949e", marginTop: 4 }}>Loading match moments...</div>
              )}
            </div>

            {/* 2. Target Delivery Scope Dropdown */}
            <div>
              <label style={labelStyle}>2. Target Delivery Scope *</label>
              <select
                value={targetType}
                onChange={(e) => {
                  const val = e.target.value as "all" | "user" | "";
                  setTargetType(val);
                  if (val !== "user") {
                    setSelectedUserId("");
                    setCustomUserName("");
                  }
                }}
                style={{
                  ...inputStyle,
                  fontWeight: 600,
                  color: targetType ? "#e6edf3" : "#8b949e",
                }}
              >
                <option value="">-- Select Target Delivery Scope --</option>
                <option value="all">📢 All Moment Participants (Stadium Roar Broadcast)</option>
                <option value="user">👤 Particular User (VIP Spotlight)</option>
              </select>
            </div>

            {/* If Particular User: Participant Dropdown */}
            {targetType === "user" && (
              <div
                style={{
                  background: "#0d1117",
                  border: "1px solid rgba(139, 92, 246, 0.4)",
                  borderRadius: 6,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ ...labelStyle, color: "#c084fc", margin: 0 }}>
                      Select Moment Participant User *
                    </label>
                    <span style={{ fontSize: 11, color: "#8b949e" }}>
                      {participants.length} voter(s) recorded
                    </span>
                  </div>

                  <select
                    value={selectedUserId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedUserId(val);
                      const p = participants.find((item) => item.userId === val);
                      if (p) {
                        setCustomUserName(p.userName);
                      }
                    }}
                    disabled={loadingParticipants || !selectedMomentId}
                    style={{
                      ...inputStyle,
                      fontWeight: 600,
                      color: selectedUserId ? "#c084fc" : "#8b949e",
                    }}
                  >
                    <option value="">
                      {!selectedMomentId
                        ? "-- Select Match Moment First --"
                        : loadingParticipants
                        ? "-- Loading real participants... --"
                        : participants.length === 0
                        ? "-- No recorded voters for this moment (enter custom user below) --"
                        : "-- Select Participant User --"}
                    </option>
                    {participants.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.userName} {p.userEmail ? `(${p.userEmail})` : `(${p.userId})`} — Choice: {p.selectedOptionLabel || p.selectedOptionId || "Voter"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional manual override */}
                <div>
                  <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>
                    Or Custom User Name / ID Override:
                  </label>
                  <input
                    type="text"
                    value={customUserName}
                    onChange={(e) => setCustomUserName(e.target.value)}
                    placeholder="e.g. Rahul Sharma or USER#123"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {/* 3. Archetype Preset Dropdown */}
            <div>
              <label style={labelStyle}>3. Recognition Archetype (Optional Preset)</label>
              <select
                value={selectedArchetype}
                onChange={(e) => handleArchetypeChange(e.target.value)}
                style={{
                  ...inputStyle,
                  fontWeight: 600,
                  color: selectedArchetype ? "#f59e0b" : "#8b949e",
                }}
              >
                <option value="">-- Select Recognition Archetype --</option>
                {ARCHETYPES.map((arch) => (
                  <option key={arch.id} value={arch.id}>
                    {arch.icon} {arch.name} [{arch.badgeLabel}] (+{arch.accuracySxp + arch.participationSxp + arch.streakBonus} SXP)
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Headline & Icon */}
            <div>
              <label style={labelStyle}>4. Celebration Headline & Icon *</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={badgeIcon}
                  onChange={(e) => setBadgeIcon(e.target.value)}
                  placeholder="🔮"
                  style={{
                    ...inputStyle,
                    width: 50,
                    textAlign: "center",
                    fontSize: 16,
                  }}
                  title="Emoji Badge"
                />
                <input
                  type="text"
                  required
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Tactical Visionary! or Fearless Stand!"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  style={{
                    width: 38,
                    height: 36,
                    padding: 2,
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  title="Accent Color"
                />
              </div>
            </div>

            {/* 5. Message */}
            <div>
              <label style={labelStyle}>5. Affirmation Message *</label>
              <textarea
                required
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe how the fan's vote or prediction impacted the stadium roar..."
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  lineHeight: "1.5",
                }}
              />
            </div>

            {/* 6. Rewards Breakdown */}
            <div
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <label style={{ ...labelStyle, color: "#f59e0b", margin: 0 }}>
                  6. SXP Rewards Breakdown
                </label>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    fontWeight: 700,
                    color: "#f59e0b",
                    background: "rgba(245, 158, 11, 0.15)",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  +{computedTotalSxp} Total SXP
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <span style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>
                    Accuracy SXP:
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={accuracySxp}
                    onChange={(e) => setAccuracySxp(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "#34d399", display: "block", marginBottom: 4 }}>
                    Effort / Participation:
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={participationSxp}
                    onChange={(e) => setParticipationSxp(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "#c084fc", display: "block", marginBottom: 4 }}>
                    Streak Bonus:
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={streakBonusSxp}
                    onChange={(e) => setStreakBonusSxp(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* 7. Next Over Retention Hook (Optional) */}
            <div
              style={{
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: 12,
              }}
            >
              <label style={{ ...labelStyle, color: "#58a6ff", marginBottom: 6 }}>
                7. Next Moment Retention Hook
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={nextMomentPrompt}
                  onChange={(e) => setNextMomentPrompt(e.target.value)}
                  placeholder="e.g. Next over starts in 25s — Bumrah strikes! Keep your streak alive!"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="number"
                  min="5"
                  value={startsInSeconds}
                  onChange={(e) => setStartsInSeconds(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="30s"
                  style={{ ...inputStyle, width: 70, textAlign: "center" }}
                  title="Countdown seconds"
                />
              </div>
            </div>

            {/* Form Action Buttons: Submit + Clear Form */}
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                type="submit"
                disabled={isSubmitting || !selectedMomentId}
                style={{
                  flex: 1,
                  background: editingRecognitionId ? "#f59e0b" : "#238636",
                  color: editingRecognitionId ? "#000" : "#fff",
                  border: editingRecognitionId ? "1px solid #d97706" : "1px solid #2ea043",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isSubmitting || !selectedMomentId ? "not-allowed" : "pointer",
                  opacity: isSubmitting || !selectedMomentId ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : editingRecognitionId ? (
                  <>
                    <Edit3 size={14} />
                    <span>Update Recognition</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>
                      {targetType === "user"
                        ? `Send Recognition to ${activeParticipant?.userName || customUserName || "User"}`
                        : "Dispatch Recognition (All Participants)"}
                    </span>
                  </>
                )}
              </button>

              {/* Dedicated Clear Form Button */}
              <button
                type="button"
                onClick={handleClearForm}
                style={{
                  background: "#21262d",
                  color: "#c9d1d9",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RotateCcw size={14} />
                <span>Clear Form</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Live Mobile Preview Card */}
        <div
          style={{
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
              paddingBottom: 12,
              borderBottom: "1px solid #21262d",
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Smartphone size={16} color="#c084fc" />
              Fan Device Live Preview
            </h3>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "#34d399",
                background: "rgba(52, 211, 153, 0.1)",
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid rgba(52, 211, 153, 0.2)",
              }}
            >
              LIVE SYNC
            </span>
          </div>

          {/* Device Frame */}
          <div
            style={{
              width: "100%",
              maxWidth: 320,
              background: "#090d16",
              borderRadius: 24,
              border: "2px solid #30363d",
              padding: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.6)",
            }}
          >
            <div
              style={{
                width: 60,
                height: 4,
                background: "#21262d",
                borderRadius: 2,
                margin: "0 auto 10px",
              }}
            />

            {/* Recognition Card Mockup */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(22, 27, 34, 0.95) 0%, rgba(13, 17, 23, 0.98) 100%)",
                border: `1.5px solid ${themeColor}60`,
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: `0 8px 24px -6px ${themeColor}30`,
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  background: `linear-gradient(90deg, ${themeColor}25 0%, rgba(255,255,255,0.02) 100%)`,
                  borderBottom: `1px solid ${themeColor}30`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{badgeIcon || "🏆"}</span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      color: themeColor,
                      letterSpacing: "0.5px",
                    }}
                  >
                    {targetType === "user" ? "VIP SPOTLIGHT" : "STADIUM BROADCAST"}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "#8b949e", fontFamily: "monospace" }}>
                  Over {activeMoment?.overs || "0.0"}
                </span>
              </div>

              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {targetType === "user" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      background: "rgba(139, 92, 246, 0.15)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      borderRadius: 8,
                      padding: "4px 8px",
                    }}
                  >
                    <span style={{ fontSize: 12 }}>👤</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#c084fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Awarded to @{activeParticipant?.userName || customUserName || "Valued Fan"}
                    </span>
                  </div>
                )}

                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>
                    {headline || "Celebration Title..."}
                  </h4>
                  <p style={{ fontSize: 12, color: "#c9d1d9", margin: 0, lineHeight: "1.4" }}>
                    {message || "Recognition affirmation copy celebrating fan contribution..."}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 8px",
                    background: "#0d1117",
                    borderRadius: 6,
                    border: "1px solid #21262d",
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "#8b949e" }}>Total Reward:</span>
                  <span style={{ color: "#f59e0b", fontWeight: 700, fontFamily: "monospace" }}>
                    +{computedTotalSxp} SXP
                  </span>
                </div>

                {nextMomentPrompt && (
                  <div
                    style={{
                      paddingTop: 6,
                      borderTop: "1px solid #21262d",
                    }}
                  >
                    <div
                      style={{
                        background: "linear-gradient(90deg, #1f6feb, #8b5cf6)",
                        color: "#fff",
                        padding: "6px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: "center",
                      }}
                    >
                      {nextMomentPrompt}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dispatched Recognitions Log Table (With Edit & Delete buttons) */}
      <div
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "1px solid #21262d",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "#fff",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <MessageSquare size={16} color="#58a6ff" />
              All Dispatched Recognitions
              {selectedMatchId ? ` for ${selectedMatchId}` : " (All Matches)"}
            </h3>
            <p style={{ fontSize: 12, color: "#8b949e", margin: "2px 0 0" }}>
              Click Edit to modify any recognition. The updated record is delivered directly to the frontend.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchRecognitions}
            style={{
              background: "#0d1117",
              color: "#c9d1d9",
              border: "1px solid #30363d",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RefreshCw size={13} className={loadingRecognitions ? "animate-spin" : ""} />
            <span>Refresh List</span>
          </button>
        </div>

        {loadingRecognitions ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#8b949e", fontSize: 13 }}>
            <RefreshCw size={18} className="animate-spin" style={{ margin: "0 auto 8px" }} />
            <div>Loading recognitions...</div>
          </div>
        ) : recognitions.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "36px 16px",
              color: "#8b949e",
              fontSize: 13,
              background: "#0d1117",
              borderRadius: 6,
              border: "1px dashed #30363d",
            }}
          >
            No recognitions found for this selection. Craft and dispatch your first recognition card using the form above!
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #30363d",
                    color: "#8b949e",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  <th style={{ padding: "8px 12px" }}>Moment / Match</th>
                  <th style={{ padding: "8px 12px" }}>Target Scope</th>
                  <th style={{ padding: "8px 12px" }}>Archetype & Headline</th>
                  <th style={{ padding: "8px 12px" }}>Affirmation Message</th>
                  <th style={{ padding: "8px 12px" }}>Total SXP</th>
                  <th style={{ padding: "8px 12px" }}>Created At</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recognitions.map((rec) => {
                  const recId = rec.recognitionId || rec.id;
                  const isCurrentEditing = editingRecognitionId === recId;
                  return (
                    <tr
                      key={recId}
                      style={{
                        borderBottom: "1px solid #21262d",
                        background: isCurrentEditing ? "rgba(245, 158, 11, 0.08)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#58a6ff" }}>
                        <div>{rec.momentId}</div>
                        <div style={{ fontSize: 10, color: "#8b949e" }}>{rec.matchId}</div>
                      </td>

                      <td style={{ padding: "10px 12px" }}>
                        {rec.targetType === "all" ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "rgba(31, 111, 235, 0.15)",
                              color: "#58a6ff",
                              border: "1px solid rgba(31, 111, 235, 0.3)",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            <Users size={12} /> All Fans
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "rgba(139, 92, 246, 0.15)",
                              color: "#c084fc",
                              border: "1px solid rgba(139, 92, 246, 0.3)",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            <User size={12} /> {rec.targetUserName || rec.targetUserId || "User"}
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "#fff" }}>
                          <span>{rec.badgeIcon || "🏆"}</span>
                          <span>{rec.headline}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#8b949e", fontFamily: "monospace" }}>
                          {rec.archetype}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: "10px 12px",
                          color: "#c9d1d9",
                          maxWidth: 300,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={rec.message}
                      >
                        {rec.message}
                      </td>

                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#f59e0b", fontWeight: 700 }}>
                        +{rec.rewards?.totalSxp || 0}
                      </td>

                      <td style={{ padding: "10px 12px", fontSize: 11, color: "#8b949e", fontFamily: "monospace" }}>
                        {rec.createdAt ? new Date(rec.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Live"}
                      </td>

                      <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(rec)}
                            style={{
                              background: "#21262d",
                              color: "#58a6ff",
                              border: "1px solid #388bfd",
                              borderRadius: 6,
                              padding: "4px 8px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Edit this recognition"
                          >
                            <Edit3 size={13} />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteRecognition(rec)}
                            style={{
                              background: "transparent",
                              color: "#f85149",
                              border: "1px solid #da3633",
                              borderRadius: 6,
                              padding: "4px 8px",
                              fontSize: 12,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Delete recognition"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoreEnginePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            background: "#0d1117",
            color: "#e6edf3",
            padding: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <RefreshCw size={20} className="animate-spin" color="#58a6ff" />
          <span>Loading Visual Recognition Studio...</span>
        </div>
      }
    >
      <CoreEngineVisualRecognitionContent />
    </Suspense>
  );
}
