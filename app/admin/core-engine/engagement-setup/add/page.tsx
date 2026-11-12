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
} from "lucide-react";
import CoreEngineStepper from "../../components/CoreEngineStepper";
import { sortMatchMoments, formatMomentOptionLabel, formatMomentTimingBadge } from "@/lib/matchMomentTimeline";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  format?: string;
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

type EngType = "poll" | "prediction" | "express" | "debate" | "question";

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
    desc: "Fast-reaction 4-choice pulse question",
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
];

const blankOptionsFor = (type: EngType | ""): OptionItem[] => {
  const count = type === "express" || type === "question" ? 4 : 2;
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
            format: m.format ? String(m.format) : undefined,
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
        const res = await fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&limit=1000&_t=${Date.now()}`);
        const json = await res.json();
        if (json.success && Array.isArray(json.engagements)) {
          const eng = json.engagements.find((e: Record<string, unknown>) => e.id === editId || e.loopId === editId);
          if (eng) {
            if (eng.matchId) setSelectedMatchId(String(eng.matchId));
            if (eng.momentId) setSelectedMomentId(String(eng.momentId));
            if (eng.type) setEngType(String(eng.type) as EngType);
            if (eng.loopId) setLoopId(String(eng.loopId));
            setEngQuestion(String(eng.title || ""));
            setEngTimer(Number(eng.timerMinutes) || 4);
            setPostLock(String(eng.postLock || ""));
            if (Array.isArray(eng.options) && eng.options.length > 0) {
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

  const handleResetForm = () => {
    setEngType("poll");
    setEngQuestion("");
    setEngTimer("");
    setPostLock("");
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
    if (!engQuestion.trim()) {
      setSubmitResult({ success: false, message: "Question / Prompt is required" });
      return;
    }
    if (engOptions.some((o) => !o.text.trim())) {
      setSubmitResult({ success: false, message: "All option fields must have text" });
      return;
    }
    if (engType === "question" && !correctOptionId) {
      setSubmitResult({ success: false, message: "Please select the correct answer for the trivia question" });
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    const payload: Record<string, unknown> = {
      id: editId || undefined,
      title: engQuestion.trim(),
      subtitle: `${activeMatch?.team1 || ""} vs ${activeMatch?.team2 || ""} · ${
        activeMoment ? formatMomentTimingBadge(activeMoment) : "Live"
      }`,
      type: engType,
      sport: "cricket",
      status: resolveStatus || "active",
      timerMinutes: Number(engTimer) || 4,
      options: engOptions.map((o) => ({ id: o.id, text: o.text.trim() })),
      correctOptionId: engType === "question" ? correctOptionId : undefined,
      postLock: postLock.trim(),
      coinStake: 10,
      loopId: loopId.trim() || `LOOP-${activeMoment?.overs || activeMoment?.timingLabel || Date.now()}`,
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
        </div>

        {/* Step 2: Choose Engagement Type */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-pink-400 flex items-center gap-2">
              <span>⚡</span> Engagement Type
            </h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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

        {/* Step 3: Question & Choices */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-5">
          <div className="border-b border-white/5 pb-3 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-2">
              <span>✍️</span> Prompt & Fan Options
            </h3>
            {engType === "question" && (
              <span className="text-[11px] text-emerald-400 font-bold">
                ✓ Click radio on correct answer
              </span>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Question / Prompt *
            </label>
            <textarea
              rows={2}
              required
              value={engQuestion}
              onChange={(e) => setEngQuestion(e.target.value)}
              placeholder="e.g. Will India score 180+ runs in 20 overs?"
              className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-medium"
            />
          </div>

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
