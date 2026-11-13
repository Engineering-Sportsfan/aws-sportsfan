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
  Clock,
} from "lucide-react";
import { MATCH_MOMENTS_LIBRARY, MatchMomentTemplate } from "@/lib/data/matchMomentsData";
import {
  PRE_MATCH_TIMING_PRESETS,
  INNINGS_BREAK_PRESETS,
  POST_MATCH_TIMING_PRESETS,
  IN_PLAY_CHECKPOINT_PRESETS,
  inferMomentInnings,
  MomentPresetOption,
} from "@/lib/matchMomentTimeline";
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
  timingLabel?: string;
  preMatchOffset?: string;
  timelineOrder?: number;
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
  "General",
];

const OVERS_PATTERN = /^\d{1,3}(\.[0-6])?(\s*overs?)?$/i;

const isValidInPlayOverOrCheckpoint = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (OVERS_PATTERN.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes("powerplay") ||
    lower.includes("end of 1st innings") ||
    lower.includes("end of 2nd innings") ||
    lower.includes("match result") ||
    lower.includes("final result") ||
    lower.includes("player of the match") ||
    lower.includes("innings break") ||
    lower.includes("timeout")
  );
};

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
  const [timeoutInnings, setTimeoutInnings] = useState<1 | 2>(1);
  const innings = phase === "Strategic Timeout" ? timeoutInnings : inferMomentInnings(phase);
  const isPreMatch = phase === "Pre Match";
  const isInningsBreak = phase === "Innings Break";
  const isPostMatch = phase === "Post Match";
  const isNoneMatch = selectedMatchId === "none";
  const isGeneral = phase === "General" || isNoneMatch;
  const requiresOverOrCheckpoint = !isPreMatch && !isInningsBreak && !isPostMatch && !isGeneral;
  const [overs, setOvers] = useState<string>("");
  const [score, setScore] = useState<string>("");
  const [timingLabel, setTimingLabel] = useState<string>("");
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
        const res = await fetch(`/api/matches?limit=1000&_t=${Date.now()}`);
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
            const resolvedPhase =
              m.phase ||
              (Number(m.innings) === 0
                ? "Pre Match"
                : Number(m.innings) === 3
                ? "Post Match"
                : Number(m.innings) === 2
                ? "2nd Innings"
                : "1st Innings");
            setPhase(resolvedPhase);
            if (resolvedPhase === "Strategic Timeout" && Number(m.innings) === 2) {
              setTimeoutInnings(2);
            }
            setOvers(m.overs || "");
            setScore(m.score || "");
            setTimingLabel(m.timingLabel || m.preMatchOffset || "");
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

  const handleApplyTimelinePreset = (preset: MomentPresetOption) => {
    setPhase(preset.phase);
    if (preset.phase === "Pre Match") {
      setTimingLabel(preset.timingLabel);
      setOvers("");
    } else if (preset.phase === "Innings Break" || preset.phase === "Post Match") {
      setTimingLabel(preset.timingLabel);
      setOvers(preset.defaultOvers || "");
    } else {
      setOvers(preset.defaultOvers || preset.timingLabel);
      setTimingLabel("");
    }
    setEvent(preset.label);
    setMatchMoment(preset.defaultAnchor);
  };

  const handleResetForm = () => {
    setPhase("");
    setTimeoutInnings(1);
    setOvers("");
    setScore("");
    setTimingLabel("");
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
    if (isPreMatch && !timingLabel.trim() && !matchOverTimestamp.trim()) {
      setSubmitResult({
        success: false,
        message: "Please select or enter a Pre-Match timing offset (e.g. T–48h, T–60m, Toss time)",
      });
      return;
    }
    if (requiresOverOrCheckpoint && !isValidInPlayOverOrCheckpoint(overs)) {
      setSubmitResult({
        success: false,
        message:
          "Please enter a valid cricket over (e.g. 10.2, 14.0 over, 20 overs) or checkpoint (e.g. Powerplay end, End of 1st innings, Match Result)",
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
    const isNone = selectedMatchId === "none";
    const t1 = activeMatch?.team1_short || activeMatch?.team1?.slice(0, 3) || "MOM";
    const t2 = activeMatch?.team2_short || activeMatch?.team2?.slice(0, 3) || "MOM";
    const teamCode = isNone
      ? "GEN"
      : (
          innings === 0 ? "PRE" : innings === 3 ? "POST" : innings === 1 ? t1 : t2
        ).toUpperCase();
    const finalMomentId = momentId.trim() || getNextMomentId(teamCode, existingMoments);
    const cleanTiming = timingLabel.trim() || matchOverTimestamp.trim();

    const payload = {
      momentId: finalMomentId,
      matchId: isNone ? "none" : selectedMatchId,
      innings: isNone ? 0 : innings,
      phase: phase || (isNone ? "General" : innings === 2 ? "2nd Innings" : "1st Innings"),
      overs: overs.trim(),
      score: score.trim(),
      ...(cleanTiming ? { timingLabel: cleanTiming } : {}),
      ...(isPreMatch && cleanTiming ? { preMatchOffset: cleanTiming } : {}),
      matchOverTimestamp: matchOverTimestamp.trim() || (isPreMatch ? cleanTiming : ""),
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
              key={tpl.templateId}
              type="button"
              onClick={() => handleApplyPresetTemplate(tpl)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-bold transition-all"
            >
              ⚡ {tpl.sportsMoment}
            </button>
          ))}
        </div>
      </div>

      {/* Match Lifecycle & Pre-Match Timeline Presets (Creatable Anytime) */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-cyan-500/20 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={14} /> Pre-Match, Checkpoint &amp; Post-Match Stage Presets
          </span>
          <span className="text-[11px] text-gray-400">
            Creatable anytime — sorted automatically top-to-bottom in selectors
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/80 mr-1">
              Pre Match:
            </span>
            {PRE_MATCH_TIMING_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyTimelinePreset(preset)}
                className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-200 text-[11px] font-bold transition-all"
              >
                {preset.label} · {preset.timingLabel}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/80 mr-1">
              In-Play / Break / Post:
            </span>
            {[
              ...IN_PLAY_CHECKPOINT_PRESETS,
              ...INNINGS_BREAK_PRESETS,
              ...POST_MATCH_TIMING_PRESETS,
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyTimelinePreset(preset)}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold transition-all"
              >
                {preset.label} ({preset.phase})
              </button>
            ))}
          </div>
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
                <option value="none">None (No Match / General Moment)</option>
                {matches.map((m) => (
                  <option key={m.match_id} value={m.match_id}>
                    {m.team1} vs {m.team2} ({m.format || "T20"})
                  </option>
                ))}
              </select>
              {selectedMatchId === "none" && (
                <p className="mt-1 text-[11px] text-amber-300 flex items-center gap-1 font-medium">
                  <span>⭐</span> General Moment (standalone, not linked to a specific match fixture)
                </p>
              )}
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

            {phase === "Strategic Timeout" && (
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Timeout Innings
                </label>
                <div className="flex gap-2">
                  {([1, 2] as const).map((inn) => (
                    <button
                      key={inn}
                      type="button"
                      onClick={() => setTimeoutInnings(inn)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${
                        timeoutInnings === inn
                          ? "bg-amber-500/20 border-amber-500 text-amber-300"
                          : "bg-[#0a0d17] border-white/10 text-gray-400 hover:text-white"
                      }`}
                    >
                      {inn === 1 ? "1st Innings" : "2nd Innings"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isPreMatch ? (
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Pre-Match Timing Offset *
                </label>
                <input
                  type="text"
                  required
                  value={timingLabel}
                  onChange={(e) => setTimingLabel(e.target.value)}
                  placeholder="e.g. T–48h, T–60m, T–30m, T–5m"
                  className="w-full bg-[#0a0d17] border border-cyan-500/30 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
                <span className="text-[10px] text-gray-500 block mt-1">
                  Use any T–offset (e.g. T–48h, T–24h to Start-of-match, T–60m, T–5m) — no over required
                </span>
              </div>
            ) : isInningsBreak || isPostMatch ? (
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Stage / Timing Label (Optional)
                </label>
                <input
                  type="text"
                  value={timingLabel}
                  onChange={(e) => setTimingLabel(e.target.value)}
                  placeholder={isInningsBreak ? "e.g. End of 1st innings" : "e.g. Final result or Player of the Match"}
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-gray-500 block mt-1">
                  Sorted {isInningsBreak ? "between 1st and 2nd innings" : "at the end after 2nd innings"}
                </span>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  Over or Checkpoint *
                </label>
                <input
                  type="text"
                  required
                  value={overs}
                  onChange={(e) => setOvers(e.target.value)}
                  placeholder="e.g. 10.2, Powerplay end, 20 overs"
                  className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                />
                <span className="text-[10px] text-gray-500 block mt-1">
                  Balls 0–6 after dot (e.g. 14.0 over), or Powerplay end / End of 1st innings / Match Result
                </span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Current Score
              </label>
              <input
                type="text"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder={isPreMatch || isPostMatch ? "Optional (e.g. Pre-Match or 184/6)" : "e.g. 142/3"}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Timing Note / Display Label (Optional)
              </label>
              <input
                type="text"
                value={matchOverTimestamp}
                onChange={(e) => setMatchOverTimestamp(e.target.value)}
                placeholder={isPreMatch ? "e.g. 24 Oct 2026 (optional)" : "Optional label (no forced clock time)"}
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
