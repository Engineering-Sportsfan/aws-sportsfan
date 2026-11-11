"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  List,
  Save,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { MATCH_MOMENTS_LIBRARY, MatchMomentTemplate } from "@/lib/data/matchMomentsData";
import CoreEngineStepper from "../../components/CoreEngineStepper";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  team1_short?: string;
  team2_short?: string;
  tournament?: string;
  format?: string;
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
}

const PHASE_OPTIONS = [
  "Pre Match",
  "1st Innings",
  "Innings Break",
  "2nd Innings",
  "Strategic Timeout",
  "Post Match",
];

const OVERS_PATTERN = /^\d{1,3}(\.[0-6])?$/;

const getCurrentISTTime = (): string =>
  `${new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} IST`;

const getNextMomentId = (teamCode: string, existing: MatchMomentItem[]): string => {
  const prefix = `MM-${teamCode || "MOM"}-`;
  const used = new Set(existing.map((m) => m.momentId));
  let max = 0;
  existing.forEach((m) => {
    if (m.momentId && m.momentId.startsWith(prefix)) {
      const n = parseInt(m.momentId.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  let next = max + 1;
  let id = `${prefix}${String(next).padStart(2, "0")}`;
  while (used.has(id)) {
    next += 1;
    id = `${prefix}${String(next).padStart(2, "0")}`;
  }
  return id;
};

function AddMomentContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId") || "";
  const editId = searchParams.get("editId");

  // Matches list
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId);

  // Existing moments for background ID calculation
  const [existingMoments, setExistingMoments] = useState<MatchMomentItem[]>([]);

  // Form Fields - starts empty for admin to enter
  const [momentId, setMomentId] = useState<string>("");
  const [phase, setPhase] = useState<string>("");
  const innings: 1 | 2 = phase === "2nd Innings" || phase === "Post Match" ? 2 : 1;
  const [overs, setOvers] = useState<string>("");
  const [score, setScore] = useState<string>("");
  const [matchOverTimestamp, setMatchOverTimestamp] = useState<string>("");
  const [event, setEvent] = useState<string>("");
  const [matchMoment, setMatchMoment] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
    momentId?: string;
  } | null>(null);

  // Fetch matches
  useEffect(() => {
    const fetchMatches = async () => {
      try {
        const res = await fetch("/api/matches?limit=100");
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const list: MatchOption[] = json.data.map((m: Record<string, unknown>) => ({
            match_id: String(m.match_id || m.id || ""),
            team1: String(m.team1 || ""),
            team2: String(m.team2 || ""),
            team1_short: m.team1_short ? String(m.team1_short) : undefined,
            team2_short: m.team2_short ? String(m.team2_short) : undefined,
            tournament: m.tournament ? String(m.tournament) : undefined,
            format: m.format ? String(m.format) : undefined,
            status: m.status ? String(m.status) : undefined,
          }));
          setMatches(list);
        }
      } catch (err) {
        console.warn("Failed to fetch matches", err);
      }
    };
    fetchMatches();
  }, []);

  // Fetch existing moments for selected match
  const fetchExistingMoments = useCallback(async () => {
    if (!selectedMatchId) return;
    try {
      const res = await fetch(`/api/match-moments?matchId=${encodeURIComponent(selectedMatchId)}&_t=${Date.now()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setExistingMoments(json.data);
      }
    } catch (err) {
      console.warn("Failed to fetch moments", err);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchExistingMoments();
  }, [fetchExistingMoments]);

  const activeMatch = useMemo(() => {
    return matches.find((m) => m.match_id === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  // If editId, load that moment
  useEffect(() => {
    if (!editId) return;
    const loadMomentToEdit = async () => {
      try {
        const res = await fetch(`/api/match-moments?_t=${Date.now()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const m = json.data.find((item: MatchMomentItem) => item.momentId === editId || item.id === editId);
          if (m) {
            setMomentId(m.momentId);
            if (m.matchId) setSelectedMatchId(m.matchId);
            setPhase(m.phase || (Number(m.innings) === 2 ? "2nd Innings" : "1st Innings"));
            setOvers(m.overs || "");
            setScore(m.score || "");
            setMatchOverTimestamp(m.matchOverTimestamp || "");
            setEvent(m.event || "");
            setMatchMoment(m.matchMoment || "");
            setDescription(m.description || "");
          }
        }
      } catch (err) {
        console.warn("Failed to load moment for edit", err);
      }
    };
    loadMomentToEdit();
  }, [editId]);

  const handleApplyPresetTemplate = (tpl: MatchMomentTemplate) => {
    setEvent(tpl.title || tpl.sportsMoment);
    setMatchMoment(tpl.sportsMoment);
    setDescription(tpl.promptTemplate || "");
  };

  const handleResetForm = () => {
    setPhase("");
    setOvers("");
    setScore("");
    setMatchOverTimestamp("");
    setEvent("");
    setMatchMoment("");
    setDescription("");
    setSubmitResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatchId) {
      setSubmitResult({ success: false, message: "Please select a match" });
      return;
    }
    if (!overs.trim() || !OVERS_PATTERN.test(overs.trim())) {
      setSubmitResult({
        success: false,
        message: "Please enter a valid cricket over like 10, 10.2, or 13.6 (balls 0-6)",
      });
      return;
    }
    if (!event.trim()) {
      setSubmitResult({ success: false, message: "Please enter event headline / play description" });
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    // Auto-generate unique moment ID behind the scenes without troubling the admin
    const t1 = activeMatch?.team1_short || activeMatch?.team1?.slice(0, 3) || "MOM";
    const t2 = activeMatch?.team2_short || activeMatch?.team2?.slice(0, 3) || "MOM";
    const teamCode = (innings === 1 ? t1 : t2).toUpperCase();
    const finalMomentId = momentId.trim() || getNextMomentId(teamCode, existingMoments);

    const payload = {
      momentId: finalMomentId,
      matchId: selectedMatchId,
      innings,
      phase: phase || (innings === 2 ? "2nd Innings" : "1st Innings"),
      overs: overs.trim(),
      score: score.trim(),
      matchOverTimestamp: matchOverTimestamp.trim() || getCurrentISTTime(),
      event: event.trim(),
      matchMoment: matchMoment.trim() || event.trim(),
      description: description.trim(),
      status: "active",
      isEdit: Boolean(editId),
    };

    try {
      const res = await fetch("/api/match-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          message: editId
            ? `Moment updated successfully!`
            : `Moment recorded successfully!`,
          momentId: payload.momentId,
        });
        await fetchExistingMoments();
      } else {
        setSubmitResult({
          success: false,
          message: data.error || "Failed to save match moment",
        });
      }
    } catch (err: unknown) {
      setSubmitResult({
        success: false,
        message: err instanceof Error ? err.message : "Network error saving match moment",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper currentStepKey="moment" compact />

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link href={`/admin/core-engine/match-moments/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-white/10">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>⚡</span>
              <span>{editId ? "Edit Moment" : "Add Moment"}</span>
            </h1>
            <p className="text-xs text-gray-400">
              Log match phase, overs, score triggers & game moments to anchor fan engagements
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/admin/core-engine/match-moments/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
            <button className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5">
              <List size={14} />
              <span>Moment List</span>
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
          {submitResult.success && submitResult.momentId && (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/core-engine/engagement-setup/add?matchId=${selectedMatchId}&momentId=${submitResult.momentId}`}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1 transition-all"
              >
                <span>Proceed to Add Engagement</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Optional Preset Template Suggestions */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-amber-500/20 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={14} /> Quick Moment Templates (Optional 1-Click Pick)
          </span>
          <span className="text-[11px] text-gray-400">Click to select category</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {MATCH_MOMENTS_LIBRARY.slice(0, 7).map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleApplyPresetTemplate(tpl)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-bold transition-all"
            >
              ⚡ {tpl.sportsMoment}
            </button>
          ))}
        </div>
      </div>

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-6">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <span>🏏</span> Match & Game State
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Select Match *
              </label>
              <select
                value={selectedMatchId}
                onChange={(e) => setSelectedMatchId(e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">-- Select Match --</option>
                {matches.map((m) => (
                  <option key={m.match_id} value={m.match_id}>
                    {m.team1} vs {m.team2} ({m.format || "T20"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Match Phase
              </label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
              >
                <option value="">-- Select Match Phase --</option>
                {PHASE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Over (Cricket Decimal) *
              </label>
              <input
                type="text"
                required
                value={overs}
                onChange={(e) => setOvers(e.target.value)}
                placeholder="e.g. 10.2 or 13.6"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              />
              <span className="text-[10px] text-gray-500 block mt-1">Balls must be 0-6 after dot</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Current Score
              </label>
              <input
                type="text"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="e.g. 142/3"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Match Clock / Timestamp
              </label>
              <input
                type="text"
                value={matchOverTimestamp}
                onChange={(e) => setMatchOverTimestamp(e.target.value)}
                placeholder="e.g. 19:42 IST"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Event & Moment Details */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-6">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-pink-400 flex items-center gap-2">
              <span>🎯</span> Ball Trigger & Event Description
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Event Headline / Play *
              </label>
              <input
                type="text"
                required
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                placeholder="e.g. Glenn Phillips c Bumrah b Shami 36(22)"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Match Moment Category / Anchor Trigger
              </label>
              <input
                type="text"
                value={matchMoment}
                onChange={(e) => setMatchMoment(e.target.value)}
                placeholder="e.g. Turning Point Dismissal"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Engagement Context / Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter context or note for the engagement prompt..."
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
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
            <span>Clear Fields</span>
          </button>

          <div className="flex items-center gap-2">
            <Link href={`/admin/core-engine/match-moments/list?matchId=${selectedMatchId}`}>
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
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-95 text-black font-extrabold text-xs transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={15} />
              <span>{isSubmitting ? "Recording Moment..." : editId ? "Update Moment" : "Save & Record Moment"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function AddMomentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Add Moment...</div>}>
      <AddMomentContent />
    </Suspense>
  );
}
