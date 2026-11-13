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
  MessageSquare,
  Award,
  Clock,
} from "lucide-react";
import CoreEngineStepper from "../../components/CoreEngineStepper";
import { sortMatchMoments, formatMomentTimingBadge } from "@/lib/matchMomentTimeline";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  tournament?: string;
  status?: string;
}

interface MatchMomentItem {
  id: string;
  momentId: string;
  matchId: string;
  innings: number;
  phase?: string;
  overs: string;
  score: string;
  matchOverTimestamp: string;
  event: string;
  matchMoment: string;
  description?: string;
  createdAt?: number;
  status?: string;
}

function MomentListContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || "";

  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId);
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
            tournament: m.tournament ? String(m.tournament) : undefined,
            status: m.status ? String(m.status) : undefined,
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
  const fetchMoments = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedMatchId
        ? `/api/match-moments?matchId=${encodeURIComponent(selectedMatchId)}&_t=${Date.now()}`
        : `/api/match-moments?_t=${Date.now()}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setMoments(sortMatchMoments(json.data));
      } else {
        setMoments([]);
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Failed to load match moments" });
    } finally {
      setLoading(false);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchMoments();
  }, [fetchMoments]);

  const handleDeleteMoment = async (momentId: string, overText?: string, itemMatchId?: string) => {
    if (!confirm(`Are you sure you want to delete this moment${overText ? ` (${overText})` : ""}? This action cannot be undone.`)) {
      return;
    }
    try {
      const matchParam = itemMatchId || selectedMatchId || "none";
      const res = await fetch(
        `/api/match-moments?momentId=${encodeURIComponent(momentId)}&matchId=${encodeURIComponent(matchParam)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ type: "success", text: `Moment deleted successfully.` });
        setMoments((prev) => prev.filter((m) => m.momentId !== momentId && m.id !== momentId));
      } else {
        setFeedback({ type: "error", text: json.error || "Failed to delete moment" });
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Network error deleting moment" });
    }
  };

  const filteredMoments = useMemo(() => {
    return moments.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        m.momentId.toLowerCase().includes(q) ||
        (m.event || "").toLowerCase().includes(q) ||
        (m.matchMoment || "").toLowerCase().includes(q) ||
        (m.overs || "").includes(q) ||
        (m.score || "").toLowerCase().includes(q)
      );
    });
  }, [moments, searchQuery]);

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper currentStepKey="moment" matchId={selectedMatchId} compact />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                ⚡
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Moment List
              </h1>
              <p className="text-xs text-gray-400">
                Review logged over events, anchors, and proceed directly to fan engagement setup
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchMoments}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10"
            title="Refresh Moments"
          >
            <RefreshCw size={15} />
          </button>
          <Link href={`/admin/core-engine/match-moments/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all shadow-md">
              <Plus size={15} />
              <span>Add Moment</span>
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

      {/* Match Selector & Search Bar */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-white/10 grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Filter by Match Fixture
          </label>
          <select
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
          >
            <option value="">-- All Matches --</option>
            <option value="none">None (No Match / General Moments)</option>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.team1} vs {m.team2}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Search Moment / Play Event
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by event headline, over, phase..."
              className="w-full bg-[#0a0d17] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Moments List */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 space-y-2">
          <RefreshCw size={24} className="animate-spin mx-auto text-amber-500" />
          <p className="text-xs">Loading match moments...</p>
        </div>
      ) : filteredMoments.length === 0 ? (
        <div className="p-12 rounded-2xl bg-[#111625] border border-white/10 text-center space-y-3">
          <p className="text-sm text-gray-300">No match moments found for the selected filter.</p>
          <Link href={`/admin/core-engine/match-moments/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs">
              + Add a New Moment
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMoments.map((m) => (
            <div
              key={`${m.matchId || ""}_${m.momentId}`}
              className="p-4 sm:p-5 rounded-2xl bg-[#111625] border border-white/10 hover:border-white/20 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              {/* Left Info */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    {formatMomentTimingBadge(m)}
                  </span>
                  {m.score && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/5 font-mono">
                      Score: {m.score}
                    </span>
                  )}
                  {m.matchOverTimestamp && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock size={11} /> {m.matchOverTimestamp}
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-black text-white">
                  {m.event || m.matchMoment}
                </h3>

                {m.matchMoment && m.matchMoment !== m.event && (
                  <p className="text-xs text-amber-300/80 font-medium">
                    Anchor: {m.matchMoment}
                  </p>
                )}

                {m.description && (
                  <p className="text-xs text-gray-400 line-clamp-2">
                    {m.description}
                  </p>
                )}
              </div>

              {/* Right Actions */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {/* Add Engagement CTA */}
                <Link
                  href={`/admin/core-engine/engagement-setup/add?matchId=${m.matchId || selectedMatchId}&momentId=${m.momentId}`}
                >
                  <button className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black transition-all flex items-center gap-1 shadow-sm">
                    <MessageSquare size={13} />
                    <span>+ Add Engagement</span>
                  </button>
                </Link>

                {/* Recognition CTA */}
                <Link
                  href={`/admin/core-engine/visible-recognition/add?matchId=${m.matchId || selectedMatchId}&momentId=${m.momentId}`}
                >
                  <button className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-xs font-bold transition-all border border-purple-500/30 flex items-center gap-1">
                    <Award size={13} />
                    <span>Recognise</span>
                  </button>
                </Link>

                {/* Edit */}
                <Link
                  href={`/admin/core-engine/match-moments/add?editId=${m.momentId}&matchId=${m.matchId || selectedMatchId}`}
                >
                  <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10" title="Edit Moment">
                    <Edit3 size={14} />
                  </button>
                </Link>

                {/* Delete */}
                <button
                  onClick={() => handleDeleteMoment(m.momentId, formatMomentTimingBadge(m), m.matchId)}
                  className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/20"
                  title="Delete Moment"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MomentListPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Moment List...</div>}>
      <MomentListContent />
    </Suspense>
  );
}
