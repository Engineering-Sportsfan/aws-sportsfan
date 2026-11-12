"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  RefreshCw,
  Trophy,
  Award,
  Clock,
  Check,
  X,
} from "lucide-react";
import CoreEngineStepper from "../../components/CoreEngineStepper";
import { sortMatchMoments, formatMomentOptionLabel } from "@/lib/matchMomentTimeline";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
}

interface MatchMomentItem {
  momentId: string;
  matchId: string;
  phase?: string;
  overs: string;
  score: string;
  event: string;
}

interface OptionItem {
  id: string;
  text: string;
  label?: string;
}

interface EngagementItem {
  id: string;
  loopId?: string;
  momentId?: string;
  matchId?: string;
  roomId?: string;
  type: string;
  title: string;
  subtitle?: string;
  inputPlaceholder?: string;
  expressData?: {
    placeholder?: string;
    responseMode?: string;
    totalResponses?: number;
  };
  totalResponses?: number;
  options: OptionItem[];
  timerMinutes?: number;
  durationMinutes?: number;
  status?: string;
  correctOptionId?: string;
  winningChoiceId?: string;
  outcomeWinningChoiceId?: string;
  outcomeNotes?: string;
  outcomeResolvedAt?: string;
  totalVotes?: number;
  voteDistribution?: Record<string, number>;
  createdAt?: string | number;
  expiresAt?: string | number | null;
  likes?: number;
  shares?: number;
}

function EngagementListContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || "";
  const urlMomentId = searchParams.get("momentId") || "";

  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId);
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(urlMomentId);

  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Outcome Settle Modal
  const [settleModalItem, setSettleModalItem] = useState<EngagementItem | null>(null);
  const [selectedWinningId, setSelectedWinningId] = useState<string>("");
  const [settleNotes, setSettleNotes] = useState<string>("");
  const [isSettling, setIsSettling] = useState(false);

  // Live timer tick
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load matches
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
          }));
          setMatches(list);
        }
      } catch (err) {
        console.warn("Failed to load matches", err);
      }
    };
    fetchMatches();
  }, [selectedMatchId]);

  // Load moments for selected match
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
  }, [selectedMatchId]);

  // Load engagements
  const fetchEngagements = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/engagements?excludeFlipArena=true&source=match_moment&limit=1000&_t=${Date.now()}`;
      if (selectedMatchId) {
        url += `&matchId=${encodeURIComponent(selectedMatchId)}`;
      }
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.engagements)) {
        setEngagements(json.engagements);
      } else {
        setEngagements([]);
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Failed to load engagements" });
    } finally {
      setLoading(false);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchEngagements();
  }, [fetchEngagements]);

  // Timer calculation
  const getTimerStatus = (eng: EngagementItem) => {
    const timerMins = Number(eng.timerMinutes || eng.durationMinutes || 4);
    const createdMs =
      typeof eng.createdAt === "number" && eng.createdAt > 0
        ? eng.createdAt
        : eng.createdAt
        ? new Date(eng.createdAt).getTime()
        : 0;

    const expiryMs =
      eng.expiresAt && Number(eng.expiresAt) > 0
        ? Number(eng.expiresAt)
        : createdMs > 0
        ? createdMs + timerMins * 60 * 1000
        : null;

    const isExpired = eng.status === "expired" || (expiryMs !== null && currentTime >= expiryMs);

    let remainingText = "";
    if (expiryMs !== null) {
      if (currentTime < expiryMs) {
        const diffMs = expiryMs - currentTime;
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        remainingText = `${mins}m ${secs.toString().padStart(2, "0")}s left`;
      } else {
        remainingText = `Timed out (${timerMins}m)`;
      }
    } else {
      remainingText = `${timerMins}m timer`;
    }

    return { isExpired, remainingText };
  };

  // Delete engagement
  const handleDeleteEngagement = async (id: string) => {
    if (!confirm("Are you sure you want to delete this engagement?")) return;
    try {
      let res = await fetch(`/api/engagements?id=${encodeURIComponent(id)}&matchId=${encodeURIComponent(selectedMatchId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        res = await fetch(`/api/engagements/${encodeURIComponent(id)}?matchId=${encodeURIComponent(selectedMatchId)}`, {
          method: "DELETE",
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedback({ type: "success", text: "Engagement deleted successfully." });
        setEngagements((prev) => prev.filter((e) => e.id !== id && e.loopId !== id));
      } else {
        setFeedback({ type: "error", text: data.error || "Failed to delete engagement" });
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Failed to delete engagement" });
    }
  };

  // Open Settle Modal
  const handleOpenSettleModal = (eng: EngagementItem) => {
    setSettleModalItem(eng);
    setSelectedWinningId(eng.outcomeWinningChoiceId || eng.winningChoiceId || "");
    setSettleNotes(eng.outcomeNotes || "");
  };

  // Submit Settlement
  const handleConfirmSettle = async () => {
    if (!settleModalItem || !selectedWinningId) {
      setFeedback({ type: "error", text: "Please select the winning choice" });
      return;
    }

    setIsSettling(true);
    try {
      const selectedOption = settleModalItem.options?.find((o) => o.id === selectedWinningId);
      const res = await fetch(`/api/engagements/${encodeURIComponent(settleModalItem.id)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winningChoiceId: selectedWinningId,
          winningChoiceText: selectedOption?.text || selectedOption?.label || selectedWinningId,
          outcomeNotes: settleNotes.trim(),
          matchId: selectedMatchId || settleModalItem.matchId,
          roomId: settleModalItem.roomId || "NMryj1w7t8mJpGzEvF9q",
          engagement: settleModalItem,
          isEdit: Boolean(settleModalItem.status === "settled" || settleModalItem.outcomeWinningChoiceId),
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setFeedback({ type: "success", text: "Outcome revealed & settled successfully!" });
        setEngagements((prev) =>
          prev.map((item) =>
            item.id === settleModalItem.id
              ? {
                  ...item,
                  status: "settled",
                  winningChoiceId: selectedWinningId,
                  outcomeWinningChoiceId: selectedWinningId,
                  outcomeNotes: settleNotes.trim(),
                }
              : item
          )
        );
        setSettleModalItem(null);
      } else {
        setFeedback({ type: "error", text: data.error || "Failed to settle outcome" });
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Network error settling outcome" });
    } finally {
      setIsSettling(false);
    }
  };

  const filteredEngagements = useMemo(() => {
    return engagements.filter((e) => {
      if (selectedMomentId && e.momentId && e.momentId !== selectedMomentId) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "settled" && e.status !== "settled") return false;
        if (statusFilter === "active" && e.status === "settled") return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          (e.title || "").toLowerCase().includes(q) ||
          (e.loopId || "").toLowerCase().includes(q) ||
          (e.momentId || "").toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }
      return true;
    });
  }, [engagements, selectedMomentId, typeFilter, statusFilter, searchQuery]);

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper
        currentStepKey="engagement"
        matchId={selectedMatchId}
        momentId={selectedMomentId}
        compact
      />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                🎯
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Engagement List
              </h1>
              <p className="text-xs text-gray-400">
                Manage polls, predictions, live countdowns, and reveal visible outcomes for fans
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchEngagements}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10"
            title="Refresh Engagements"
          >
            <RefreshCw size={15} />
          </button>
          <Link
            href={`/admin/core-engine/engagement-setup/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}
          >
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:opacity-95 text-black text-xs font-black transition-all shadow-md">
              <Plus size={15} />
              <span>Add Engagement</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Alert toast */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-300"
          }`}
        >
          <span>{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-gray-400 hover:text-white text-sm">
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar (Match & Moment Selector) */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-white/10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-center">
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Match Fixture
          </label>
          <select
            value={selectedMatchId}
            onChange={(e) => {
              setSelectedMatchId(e.target.value);
              setSelectedMomentId("");
            }}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
          >
            <option value="">-- All Matches --</option>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.team1} vs {m.team2}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Filter by Moment
          </label>
          <select
            value={selectedMomentId}
            onChange={(e) => setSelectedMomentId(e.target.value)}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
          >
            <option value="">-- All Moments --</option>
            {moments.map((m) => (
              <option key={m.momentId} value={m.momentId}>
                {formatMomentOptionLabel(m)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Type Filter
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
          >
            <option value="all">All Types</option>
            <option value="poll">Poll</option>
            <option value="prediction">Prediction</option>
            <option value="express">Express</option>
            <option value="debate">Debate</option>
            <option value="question">Trivia</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Status Filter
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-medium"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="settled">Settled Only</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Search Prompt
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search question, prompt..."
              className="w-full bg-[#0a0d17] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Engagements List */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 space-y-2">
          <RefreshCw size={24} className="animate-spin mx-auto text-cyan-500" />
          <p className="text-xs">Loading engagements...</p>
        </div>
      ) : filteredEngagements.length === 0 ? (
        <div className="p-12 rounded-2xl bg-[#111625] border border-white/10 text-center space-y-3">
          <p className="text-sm text-gray-300">No engagements found matching the selected filters.</p>
          <Link
            href={`/admin/core-engine/engagement-setup/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}
          >
            <button className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs">
              + Add a New Engagement
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEngagements.map((eng) => {
            const { isExpired, remainingText } = getTimerStatus(eng);
            const isExpressTextOnly = eng.type === "express" && (!Array.isArray(eng.options) || eng.options.length === 0);
            const isSettled = eng.status === "settled" || Boolean(eng.winningChoiceId || eng.outcomeWinningChoiceId);
            const winningOpt = eng.options?.find(
              (o) => o.id === (eng.winningChoiceId || eng.outcomeWinningChoiceId)
            );

            return (
              <div
                key={eng.id}
                className="p-4 sm:p-5 rounded-2xl bg-[#111625] border border-white/10 hover:border-white/20 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left Info */}
                <div className="space-y-2 min-w-0 max-w-2xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black text-[10px] uppercase">
                      {eng.type}
                    </span>

                    {/* Timer badge */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                        isExpired
                          ? "bg-slate-500/20 text-slate-300"
                          : "bg-emerald-500/20 text-emerald-400 animate-pulse"
                      }`}
                    >
                      <Clock size={11} /> {remainingText}
                    </span>

                    {/* Settled Status */}
                    {isExpressTextOnly ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">
                        ✍️ Open Input Box ({Number(eng.totalResponses ?? eng.totalVotes ?? 0)} responses)
                      </span>
                    ) : isSettled ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        ✅ Settled: {winningOpt?.text || eng.winningChoiceId}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        ⏳ Pending Outcome
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {eng.title}
                  </h3>

                  {/* Options pills */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {isExpressTextOnly && (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-pink-500/10 text-pink-200 border border-pink-500/25">
                        ✍️ Open Fan Text Input (No Options) — &ldquo;{eng.inputPlaceholder || eng.expressData?.placeholder || "Write your thoughts..."}&rdquo;
                      </span>
                    )}
                    {eng.options?.map((opt, i) => {
                      const isWin = opt.id === (eng.winningChoiceId || eng.outcomeWinningChoiceId);
                      return (
                        <span
                          key={opt.id || i}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${
                            isWin
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold"
                              : "bg-white/[0.03] border-white/10 text-gray-300"
                          }`}
                        >
                          {isWin && "🏆 "}
                          {opt.text || opt.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Reveal / Settle Outcome CTA (not applicable to open-text Express engagements) */}
                  {!isExpressTextOnly && (
                    <button
                      onClick={() => handleOpenSettleModal(eng)}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-black text-xs font-black transition-all flex items-center gap-1 shadow-sm"
                    >
                      <Trophy size={13} />
                      <span>{isSettled ? "Edit Outcome" : "Reveal Visible Outcome"}</span>
                    </button>
                  )}

                  {/* Recognition CTA */}
                  <Link
                    href={`/admin/core-engine/visible-recognition/add?matchId=${eng.matchId || selectedMatchId}&momentId=${eng.momentId || ""}`}
                  >
                    <button className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-bold transition-all border border-purple-500/30 flex items-center gap-1">
                      <Award size={13} />
                      <span>Recognise</span>
                    </button>
                  </Link>

                  {/* Edit */}
                  <Link
                    href={`/admin/core-engine/engagement-setup/add?editId=${eng.id}&matchId=${eng.matchId || selectedMatchId}`}
                  >
                    <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10" title="Edit Engagement">
                      <Edit3 size={14} />
                    </button>
                  </Link>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteEngagement(eng.id)}
                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/20"
                    title="Delete Engagement"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SETTLE OUTCOME MODAL ── */}
      {settleModalItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111625] border border-amber-500/40 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Trophy size={18} className="text-amber-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Reveal Visible Outcome
                </h3>
              </div>
              <button
                onClick={() => setSettleModalItem(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-1">Engagement Prompt:</p>
              <h4 className="text-sm font-bold text-white bg-[#0a0d17] p-3 rounded-xl border border-white/5">
                {settleModalItem.title}
              </h4>
            </div>

            <div>
              <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
                Select Winning Choice *
              </label>
              <div className="space-y-2">
                {settleModalItem.options?.map((opt) => {
                  const isSelected = selectedWinningId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedWinningId(opt.id)}
                      className={`w-full p-3 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                        isSelected
                          ? "bg-amber-500/20 border-amber-500 text-amber-200 ring-2 ring-amber-500/30"
                          : "bg-[#0a0d17] border-white/10 text-gray-300 hover:border-white/20"
                      }`}
                    >
                      <span>{opt.text || opt.label}</span>
                      {isSelected && <Check size={16} className="text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Outcome Notes / Ground Truth
              </label>
              <input
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                placeholder="e.g. Clean bowled on 4th ball of 14th over"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setSettleModalItem(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSettling || !selectedWinningId}
                onClick={handleConfirmSettle}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-black font-black text-xs transition-all shadow-md disabled:opacity-50"
              >
                {isSettling ? "Settling..." : "Confirm & Reveal Outcome"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EngagementListPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Engagement List...</div>}>
      <EngagementListContent />
    </Suspense>
  );
}
