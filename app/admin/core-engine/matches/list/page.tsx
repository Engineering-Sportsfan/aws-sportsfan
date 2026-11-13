"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  ArrowRight,
  RefreshCw,
  Zap,
  CheckCircle2,
  X,
} from "lucide-react";
import CoreEngineStepper from "../../components/CoreEngineStepper";

interface MatchItem {
  match_id: string;
  id?: string;
  team1: string;
  team2: string;
  team1_short?: string;
  team2_short?: string;
  tournament?: string;
  format?: string;
  venue?: string;
  city?: string;
  date?: string;
  time?: string;
  status?: string;
  stage?: string;
  total_overs?: number;
  season?: number | string;
  createdAt?: string | number;
}

function MatchListContent() {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "upcoming" | "completed">("all");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeModalMatch, setCompleteModalMatch] = useState<{ id: string; title: string } | null>(null);
  const [sendUserSummary, setSendUserSummary] = useState(true);
  const [sendMatchSummary, setSendMatchSummary] = useState(true);
  const [sendFanOfMatchSummary, setSendFanOfMatchSummary] = useState(true);

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/matches?coreOnly=true&limit=1000&_t=${Date.now()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const list: MatchItem[] = json.data.map((m: Record<string, unknown>) => ({
          match_id: String(m.match_id || m.id || (m.entityId ? String(m.entityId).replace(/^MATCH#/, "") : "")),
          team1: String(m.team1 || ""),
          team2: String(m.team2 || ""),
          team1_short: m.team1_short ? String(m.team1_short) : undefined,
          team2_short: m.team2_short ? String(m.team2_short) : undefined,
          tournament: m.tournament ? String(m.tournament) : undefined,
          format: m.format ? String(m.format) : undefined,
          venue: m.venue ? String(m.venue) : undefined,
          city: m.city ? String(m.city) : undefined,
          date: m.date ? String(m.date) : undefined,
          time: m.time ? String(m.time) : undefined,
          status: m.status ? String(m.status) : undefined,
          stage: m.stage ? String(m.stage) : undefined,
          total_overs: typeof m.total_overs === "number" ? m.total_overs : undefined,
          season: typeof m.season === "string" || typeof m.season === "number" ? m.season : undefined,
          createdAt: typeof m.createdAt === "string" || typeof m.createdAt === "number" ? m.createdAt : undefined,
        }));
        setMatches(list);
      } else {
        setMatches([]);
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Failed to load matches" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleDeleteMatch = async (matchId: string, matchTitle?: string) => {
    if (!confirm(`Are you sure you want to delete this match${matchTitle ? ` (${matchTitle})` : ""}? This action cannot be undone.`)) {
      return;
    }
    try {
      let res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
      if (!res.ok) {
        res = await fetch(`/api/matches?match_id=${matchId}`, { method: "DELETE" });
      }
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ type: "success", text: `Match deleted successfully.` });
        setMatches((prev) => prev.filter((m) => m.match_id !== matchId && m.id !== matchId));
      } else {
        setFeedback({ type: "error", text: json.error || "Failed to delete match" });
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Network error deleting match" });
    }
  };

  const handleOpenCompleteModal = (matchId: string, matchTitle?: string) => {
    setCompleteModalMatch({ id: matchId, title: matchTitle || matchId });
    setSendUserSummary(true);
    setSendMatchSummary(true);
    setSendFanOfMatchSummary(true);
  };

  const handleConfirmCompleteMatch = async () => {
    if (!completeModalMatch) return;
    const matchId = completeModalMatch.id;
    setCompletingId(matchId);
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          sendUserSummary,
          sendMatchSummary,
          sendFanOfMatchSummary,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setMatches((prev) =>
          prev.map((m) => (m.match_id === matchId ? { ...m, status: "completed" } : m))
        );
        const parts: string[] = [];
        if (sendUserSummary) {
          const sentCount = Number(json.playerSummariesGenerated || 0);
          parts.push(`${sentCount} User Summaries`);
        }
        if (sendMatchSummary) parts.push("Match Summary");
        if (sendFanOfMatchSummary) parts.push("Fan of the Match");

        setFeedback({
          type: "success",
          text: `Match marked completed. Dispatched: ${parts.length > 0 ? parts.join(", ") : "no summaries"}.`,
        });
        setCompleteModalMatch(null);
      } else {
        setFeedback({ type: "error", text: json.error || "Failed to mark match completed" });
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Network error updating match" });
    } finally {
      setCompletingId(null);
    }
  };

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        m.match_id.toLowerCase().includes(query) ||
        (m.team1 || "").toLowerCase().includes(query) ||
        (m.team2 || "").toLowerCase().includes(query) ||
        (m.tournament || "").toLowerCase().includes(query) ||
        (m.venue || "").toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" ||
        (m.status || "upcoming").toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [matches, searchQuery, statusFilter]);

  const liveCount = matches.filter((m) => (m.status || "").toLowerCase() === "live").length;
  const upcomingCount = matches.filter((m) => (m.status || "").toLowerCase() === "upcoming").length;
  const completedCount = matches.filter((m) => (m.status || "").toLowerCase() === "completed").length;

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper currentStepKey="match" compact />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-600 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                🏏
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Match List
              </h1>
              <p className="text-xs text-gray-400">
                Manage fixtures, live status, and drill into moments & fan engagements
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchMatches}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10"
            title="Refresh Matches"
          >
            <RefreshCw size={15} />
          </button>
          <Link href="/admin/core-engine/matches/add">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md">
              <Plus size={15} />
              <span>Add Match</span>
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

      {/* Stats Summary Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setStatusFilter("all")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "all"
              ? "bg-pink-500/15 border-pink-500/40 text-pink-300"
              : "bg-[#111625] border-white/5 text-gray-400 hover:border-white/20"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider block">Total Matches</span>
          <span className="text-2xl font-black text-white">{matches.length}</span>
        </div>

        <div
          onClick={() => setStatusFilter("live")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "live"
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
              : "bg-[#111625] border-white/5 text-gray-400 hover:border-white/20"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider block">Live Now</span>
          <span className="text-2xl font-black text-emerald-400">{liveCount}</span>
        </div>

        <div
          onClick={() => setStatusFilter("upcoming")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "upcoming"
              ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
              : "bg-[#111625] border-white/5 text-gray-400 hover:border-white/20"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider block">Upcoming</span>
          <span className="text-2xl font-black text-amber-400">{upcomingCount}</span>
        </div>

        <div
          onClick={() => setStatusFilter("completed")}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
            statusFilter === "completed"
              ? "bg-slate-500/15 border-slate-500/40 text-slate-300"
              : "bg-[#111625] border-white/5 text-gray-400 hover:border-white/20"
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider block">Completed</span>
          <span className="text-2xl font-black text-slate-300">{completedCount}</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-3.5 rounded-2xl bg-[#111625] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-96">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by team, venue, match ID, series..."
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400 w-full sm:w-auto justify-end">
          <span>Showing {filteredMatches.length} of {matches.length} matches</span>
        </div>
      </div>

      {/* Match Table / Cards */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 space-y-2">
          <RefreshCw size={24} className="animate-spin mx-auto text-pink-500" />
          <p className="text-xs">Loading matches from database...</p>
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-12 rounded-2xl bg-[#111625] border border-white/10 text-center space-y-3">
          <p className="text-sm text-gray-300">No matches found matching your filters.</p>
          <Link href="/admin/core-engine/matches/add">
            <button className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs">
              + Add a New Match
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMatches.map((m) => {
            const isLive = (m.status || "").toLowerCase() === "live";
            const isCompleted = (m.status || "").toLowerCase() === "completed";

            return (
              <div
                key={m.match_id}
                className="p-4 sm:p-5 rounded-2xl bg-[#111625] border border-white/10 hover:border-white/20 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                {/* Left Info */}
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        isLive
                          ? "bg-emerald-500/20 text-emerald-400 animate-pulse border border-emerald-500/40"
                          : isCompleted
                          ? "bg-slate-500/20 text-slate-300"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {m.status || "upcoming"}
                    </span>
                    {m.format && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/5">
                        {m.format}
                      </span>
                    )}
                    {m.stage && (
                      <span className="text-[10px] font-medium text-gray-400">
                        · {m.stage}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-black text-white">
                    {m.team1} <span className="text-pink-400 text-xs font-bold">vs</span> {m.team2}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                    {m.tournament && <span>🏆 {m.tournament}</span>}
                    {m.venue && <span>📍 {m.venue}{m.city ? `, ${m.city}` : ""}</span>}
                    {m.date && <span>📅 {m.date} {m.time || ""}</span>}
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Add Moment CTA */}
                  <Link href={`/admin/core-engine/match-moments/add?matchId=${m.match_id}`}>
                    <button className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all flex items-center gap-1 shadow-sm">
                      <Zap size={13} />
                      <span>+ Add Moment</span>
                    </button>
                  </Link>

                  {/* Moment List */}
                  <Link href={`/admin/core-engine/match-moments/list?matchId=${m.match_id}`}>
                    <button className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition-all border border-white/10 flex items-center gap-1">
                      <span>Moments</span>
                      <ArrowRight size={12} />
                    </button>
                  </Link>

                  {!isCompleted && (
                    <button
                      onClick={() => handleOpenCompleteModal(m.match_id, `${m.team1} vs ${m.team2}`)}
                      disabled={completingId === m.match_id}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 text-emerald-300 text-xs font-bold transition-all border border-emerald-500/30 flex items-center gap-1 shadow-sm"
                      title="Mark Completed & Select Summaries to Send"
                    >
                      <CheckCircle2 size={13} />
                      <span>{completingId === m.match_id ? "Completing..." : "Mark Complete"}</span>
                    </button>
                  )}

                  {/* Edit */}
                  <Link href={`/admin/core-engine/matches/add?editId=${m.match_id}`}>
                    <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10" title="Edit Match">
                      <Edit3 size={14} />
                    </button>
                  </Link>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteMatch(m.match_id, `${m.team1} vs ${m.team2}`)}
                    className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/20"
                    title="Delete Match"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Match Completion & Summary Dispatch Modal */}
      {completeModalMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0b101b] border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Match Completion</span>
                <h3 className="text-lg font-black text-white mt-1">Complete Match & Dispatch Summaries</h3>
                <p className="text-xs text-gray-400 mt-0.5">{completeModalMatch.title}</p>
              </div>
              <button
                onClick={() => setCompleteModalMatch(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-300">
              Marking this match as <strong className="text-emerald-400">Completed</strong> finalizes the match in the system. Select which summary cards to post directly to the match room for fans:
            </p>

            <div className="space-y-3">
              {/* Checkbox 1: User Summary */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-emerald-500/30 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={sendUserSummary}
                  onChange={(e) => setSendUserSummary(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-600 text-emerald-500 focus:ring-emerald-500 bg-black/40 cursor-pointer"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>User Summary (Personalized Progress)</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-semibold border border-blue-500/20">Per User</span>
                  </div>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    Delivers each active fan their personal progress card showing their Interactions, Predictions (e.g. 8/10), SXP earned, fan persona, and leaderboard standing.
                  </p>
                </div>
              </label>

              {/* Checkbox 2: Match Summary */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-purple-500/30 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={sendMatchSummary}
                  onChange={(e) => setSendMatchSummary(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-600 text-purple-500 focus:ring-purple-500 bg-black/40 cursor-pointer"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Match Summary (Match Snapshot)</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded font-semibold border border-purple-500/20">All Fans</span>
                  </div>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    Broadcasts the overall in-app match room engagement summary (Total Actions, Total Moments, Total Participants) across all fans to the entire room.
                  </p>
                </div>
              </label>

              {/* Checkbox 3: Fan of the Match */}
              <label className="flex items-start gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10 hover:border-amber-500/30 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={sendFanOfMatchSummary}
                  onChange={(e) => setSendFanOfMatchSummary(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-600 text-amber-500 focus:ring-amber-500 bg-black/40 cursor-pointer"
                />
                <div className="flex-1 text-xs">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>Fan of the Match Summary</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded font-semibold border border-amber-500/20">Leaderboard #1</span>
                  </div>
                  <p className="text-gray-400 text-[11px] mt-0.5">
                    Celebrates the highest-scoring fan of this match with a spotlight award card and rank #1 leaderboard recognition.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setCompleteModalMatch(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={completingId === completeModalMatch.id}
                onClick={handleConfirmCompleteMatch}
                className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20"
              >
                <CheckCircle2 size={14} />
                <span>{completingId === completeModalMatch.id ? "Completing..." : "Confirm & Complete"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatchListPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Match List...</div>}>
      <MatchListContent />
    </Suspense>
  );
}
