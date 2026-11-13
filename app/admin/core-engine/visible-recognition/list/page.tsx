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
  overs: string;
  event: string;
}

interface VisualRecognitionItem {
  id: string;
  recognitionId: string;
  matchId: string;
  momentId: string;
  targetType: "all" | "user";
  targetUserId?: string | null;
  targetUserName?: string | null;
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
  status?: string;
  createdAt?: number;
}

function RecognitionListContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || "";
  const urlMomentId = searchParams.get("momentId") || "";

  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId);
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(urlMomentId);

  const [recognitions, setRecognitions] = useState<VisualRecognitionItem[]>([]);
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
          const list = json.data.map((m: Record<string, unknown>) => ({
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

  // Load moments
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

  // Load recognitions
  const fetchRecognitions = useCallback(async () => {
    setLoading(true);
    try {
      const url = selectedMatchId
        ? `/api/visible-recognition?matchId=${encodeURIComponent(selectedMatchId)}&_t=${Date.now()}`
        : `/api/visible-recognition?_t=${Date.now()}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecognitions(json.data);
      } else {
        setRecognitions([]);
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Failed to load recognitions" });
    } finally {
      setLoading(false);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchRecognitions();
  }, [fetchRecognitions]);

  const handleDeleteRecognition = async (rec: VisualRecognitionItem) => {
    if (!confirm(`Are you sure you want to delete recognition "${rec.headline}"?`)) return;
    try {
      const recId = rec.recognitionId || rec.id;
      const res = await fetch(
        `/api/visible-recognition?recognitionId=${encodeURIComponent(recId)}&matchId=${encodeURIComponent(rec.matchId)}&momentId=${encodeURIComponent(rec.momentId)}&targetType=${encodeURIComponent(rec.targetType)}&targetUserId=${encodeURIComponent(rec.targetUserId || "")}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedback({ type: "success", text: "Recognition deleted successfully." });
        setRecognitions((prev) => prev.filter((r) => r.recognitionId !== recId && r.id !== recId));
      } else {
        setFeedback({ type: "error", text: json.error || "Failed to delete recognition" });
      }
    } catch (err: unknown) {
      setFeedback({ type: "error", text: (err as Error).message || "Network error deleting recognition" });
    }
  };

  const filteredRecognitions = useMemo(() => {
    return recognitions.filter((r) => {
      if (selectedMomentId && r.momentId && r.momentId !== selectedMomentId) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchesQuery =
          (r.headline || "").toLowerCase().includes(q) ||
          (r.message || "").toLowerCase().includes(q) ||
          (r.archetype || "").toLowerCase().includes(q) ||
          (r.momentId || "").toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }
      return true;
    });
  }, [recognitions, selectedMomentId, searchQuery]);

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper
        currentStepKey="recognition"
        matchId={selectedMatchId}
        momentId={selectedMomentId}
        compact
      />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                🏆
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Recognition List
              </h1>
              <p className="text-xs text-gray-400">
                Review fan archetype spotlight cards and SXP economy rewards dispatched to second screens
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchRecognitions}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10"
            title="Refresh Recognitions"
          >
            <RefreshCw size={15} />
          </button>
          <Link
            href={`/admin/core-engine/visible-recognition/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}
          >
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md">
              <Plus size={15} />
              <span>Add Recognition</span>
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

      {/* Filter Bar */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
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
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
          >
            <option value="">-- All Matches --</option>
            <option value="none">None (No Match / General Recognitions)</option>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.team1} vs {m.team2}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Moment Trigger
          </label>
          <select
            value={selectedMomentId}
            onChange={(e) => setSelectedMomentId(e.target.value)}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
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
            Search Headline / Archetype
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search headline, persona..."
              className="w-full bg-[#0a0d17] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Recognition List */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 space-y-2">
          <RefreshCw size={24} className="animate-spin mx-auto text-purple-500" />
          <p className="text-xs">Loading recognitions...</p>
        </div>
      ) : filteredRecognitions.length === 0 ? (
        <div className="p-12 rounded-2xl bg-[#111625] border border-white/10 text-center space-y-3">
          <p className="text-sm text-gray-300">No recognition dispatched yet matching filters.</p>
          <Link
            href={`/admin/core-engine/visible-recognition/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}
          >
            <button className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs">
              + Dispatch Recognition
            </button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRecognitions.map((rec) => (
            <div
              key={rec.recognitionId || rec.id}
              className="p-5 rounded-2xl bg-[#111625] border border-white/10 hover:border-purple-500/30 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{rec.badgeIcon || "🔮"}</span>
                    <div>
                      <span className="font-mono text-xs font-black text-purple-400 block">
                        {rec.archetype || "RECOGNITION"}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {rec.targetType === "user" ? `User: ${rec.targetUserName || "Fan"}` : "Audience: All Participants"}
                      </span>
                    </div>
                  </div>

                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    +{rec.rewards?.totalSxp ?? 15} SXP
                  </span>
                </div>

                <h3 className="text-sm font-black text-white">{rec.headline}</h3>
                <p className="text-xs text-gray-300 leading-relaxed">{rec.message}</p>
              </div>

              <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                <span className="text-[11px] font-bold text-purple-400">
                  ✨ Spotlight Active
                </span>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/core-engine/visible-recognition/add?editId=${rec.recognitionId || rec.id}&matchId=${rec.matchId}`}
                  >
                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10">
                      <Edit3 size={13} />
                    </button>
                  </Link>
                  <button
                    onClick={() => handleDeleteRecognition(rec)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-all border border-red-500/20"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecognitionListPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Recognition List...</div>}>
      <RecognitionListContent />
    </Suspense>
  );
}
