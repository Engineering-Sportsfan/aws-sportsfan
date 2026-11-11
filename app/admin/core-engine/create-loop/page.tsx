"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Trophy,
  Zap,
  BarChart3,
  Plus,
  List,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Layers,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import CoreEngineStepper from "../components/CoreEngineStepper";

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

interface EngagementItem {
  id: string;
  loopId?: string;
  momentId?: string;
  matchId?: string;
  type: string;
  title: string;
  options: Array<{ id?: string; text?: string; label?: string }>;
  status?: string;
  totalVotes?: number;
}

interface RecognitionItem {
  id: string;
  recognitionId?: string;
  matchId: string;
  momentId: string;
  headline?: string;
  archetype?: string;
  rewards?: { totalSxp?: number; [key: string]: unknown };
}

function CreateLoopContent() {
  const searchParams = useSearchParams();
  const initialMatchId = searchParams.get("matchId") || "";
  const initialMomentId = searchParams.get("momentId") || "";
  const initialStep = (searchParams.get("step") as "match" | "moment" | "engagement" | "recognition" | "overview") || "match";

  // Step state
  const [activeStep, setActiveStep] = useState<"match" | "moment" | "engagement" | "recognition" | "overview">(
    ["match", "moment", "engagement", "recognition", "overview"].includes(initialStep) ? initialStep : "match"
  );

  // Match & moment selection
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(initialMatchId);

  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [selectedMomentId, setSelectedMomentId] = useState<string>(initialMomentId);

  // Engagements & recognitions
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);

  // Load matches
  const fetchMatches = useCallback(async () => {
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
          venue: m.venue ? String(m.venue) : undefined,
          city: m.city ? String(m.city) : undefined,
          date: m.date ? String(m.date) : undefined,
          time: m.time ? String(m.time) : undefined,
          format: m.format ? String(m.format) : undefined,
          stage: m.stage ? String(m.stage) : undefined,
          status: m.status ? String(m.status) : undefined,
        }));
        setMatches(list);
      }
    } catch (err) {
      console.warn("Failed to load matches", err);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Load moments for active match
  const fetchMoments = useCallback(async () => {
    if (!selectedMatchId) {
      setMoments([]);
      return;
    }
    setLoadingMoments(true);
    try {
      const res = await fetch(`/api/match-moments?matchId=${encodeURIComponent(selectedMatchId)}&_t=${Date.now()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setMoments(json.data);
      } else {
        setMoments([]);
      }
    } catch (err) {
      console.warn("Failed to load moments", err);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchMoments();
  }, [fetchMoments]);

  // Load engagements
  const fetchEngagements = useCallback(async () => {
    if (!selectedMatchId) return;
    try {
      const res = await fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&limit=100&_t=${Date.now()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.engagements)) {
        const filtered = json.engagements.filter(
          (e: EngagementItem) => (!selectedMatchId || !e.matchId || e.matchId === selectedMatchId)
        );
        setEngagements(filtered);
      }
    } catch (err) {
      console.warn("Failed to load engagements", err);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchEngagements();
  }, [fetchEngagements]);

  // Load recognitions
  const fetchRecognitions = useCallback(async () => {
    if (!selectedMatchId) return;
    try {
      const res = await fetch(`/api/visible-recognition?matchId=${encodeURIComponent(selectedMatchId)}&_t=${Date.now()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setRecognitions(json.data);
      }
    } catch (err) {
      console.warn("Failed to load recognitions", err);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchRecognitions();
  }, [fetchRecognitions]);

  const activeMatch = useMemo(() => {
    return matches.find((m) => m.match_id === selectedMatchId) || null;
  }, [matches, selectedMatchId]);

  const activeMoment = useMemo(() => {
    return moments.find((m) => m.momentId === selectedMomentId) || null;
  }, [moments, selectedMomentId]);

  const activeEngagementsForMoment = useMemo(() => {
    if (!selectedMomentId) return engagements;
    return engagements.filter((e) => e.momentId === selectedMomentId);
  }, [engagements, selectedMomentId]);

  const activeRecognitionForMoment = useMemo(() => {
    if (!selectedMomentId) return null;
    return (
      recognitions.find(
        (r) =>
          (r.momentId || "").replace(/^MM-/, "") === selectedMomentId.replace(/^MM-/, "")
      ) || null
    );
  }, [recognitions, selectedMomentId]);

  // Determine completed steps
  const completedSteps = useMemo(() => {
    const list: ("match" | "moment" | "engagement" | "recognition" | "overview")[] = [];
    if (activeMatch) list.push("match");
    if (activeMoment) list.push("moment");
    if (activeEngagementsForMoment.length > 0) list.push("engagement");
    if (activeRecognitionForMoment) list.push("recognition");
    return list;
  }, [activeMatch, activeMoment, activeEngagementsForMoment, activeRecognitionForMoment]);

  // Step navigation helpers
  const stepKeys: ("match" | "moment" | "engagement" | "recognition" | "overview")[] = [
    "match",
    "moment",
    "engagement",
    "recognition",
    "overview",
  ];
  const currentStepIdx = stepKeys.indexOf(activeStep);

  const goToNextStep = () => {
    if (currentStepIdx < stepKeys.length - 1) {
      setActiveStep(stepKeys[currentStepIdx + 1]);
    }
  };

  const goToPrevStep = () => {
    if (currentStepIdx > 0) {
      setActiveStep(stepKeys[currentStepIdx - 1]);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 via-rose-600 to-amber-500 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                ⚡
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Core Engine Loop Studio
              </h1>
              <p className="text-sm text-gray-400">
                End-to-end admin workflow: Match Setup → Moment Setup → Engagement Setup → Visual Recognition → Overview
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/core-engine">
            <button className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition-all border border-white/10 flex items-center gap-1.5">
              <Layers size={14} />
              <span>Core Dashboard</span>
            </button>
          </Link>
          <button
            onClick={() => {
              fetchMatches();
              fetchMoments();
              fetchEngagements();
              fetchRecognitions();
            }}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10"
            title="Refresh All Loop Data"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ── STEPPER COMPONENT (Based on User Reference Image) ── */}
      <CoreEngineStepper
        currentStepKey={activeStep}
        completedSteps={completedSteps}
        onSelectStep={(key) => setActiveStep(key)}
        matchId={selectedMatchId}
        momentId={selectedMomentId}
      />

      {/* Contextual Selector Bar */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
        {/* Match Picker */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-extrabold uppercase tracking-wider text-pink-400 flex items-center gap-1.5">
              <Trophy size={13} />
              <span>1. Active Match Context</span>
            </label>
            <Link
              href="/admin/core-engine/matches/add"
              className="text-[11px] font-bold text-pink-400 hover:underline flex items-center gap-1"
            >
              <Plus size={12} /> Add Match
            </Link>
          </div>
          <select
            value={selectedMatchId}
            onChange={(e) => {
              setSelectedMatchId(e.target.value);
              setSelectedMomentId("");
            }}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-medium"
          >
            <option value="">-- Choose a Match --</option>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.team1} vs {m.team2} ({m.format || "T20"})
              </option>
            ))}
          </select>
        </div>

        {/* Moment Picker */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Zap size={13} />
              <span>2. Active Match Moment Context</span>
            </label>
            <Link
              href={`/admin/core-engine/match-moments/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}
              className="text-[11px] font-bold text-amber-400 hover:underline flex items-center gap-1"
            >
              <Plus size={12} /> Add Moment
            </Link>
          </div>
          <select
            value={selectedMomentId}
            onChange={(e) => setSelectedMomentId(e.target.value)}
            disabled={!selectedMatchId || moments.length === 0}
            className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-medium disabled:opacity-40"
          >
            <option value="">
              {moments.length === 0 ? "No moments recorded yet for this match" : "-- Choose a Moment --"}
            </option>
            {moments.map((m) => (
              <option key={m.momentId} value={m.momentId}>
                Over {m.overs}{m.score ? ` (${m.score})` : ""} - {m.event || m.matchMoment}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── STEP CONTENT PANELS ── */}

      {/* STEP 1: MATCH SETUP */}
      {activeStep === "match" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1C101A] via-[#120A13] to-[#0A070E] border border-pink-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏏</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  Step 1: Match Setup & Selection
                </h3>
              </div>
              <p className="text-xs text-gray-300 max-w-xl leading-relaxed">
                Configure teams, tournament, venue, format, and match status. Every second-screen loop anchors to a match.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/admin/core-engine/matches/list">
                <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5">
                  <List size={14} />
                  <span>Match List ({matches.length})</span>
                </button>
              </Link>
              <Link href="/admin/core-engine/matches/add">
                <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-90 text-white font-black text-xs transition-colors flex items-center gap-1.5 shadow-md">
                  <Plus size={14} />
                  <span>Add Match</span>
                </button>
              </Link>
            </div>
          </div>

          {activeMatch ? (
            <div className="p-6 rounded-2xl bg-[#111625] border border-pink-500/20 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className="text-xs font-black uppercase text-emerald-400">
                    Active Match Selected
                  </span>
                </div>
                <Link
                  href={`/admin/core-engine/matches/add?editId=${activeMatch.match_id}`}
                  className="text-xs text-pink-400 hover:underline font-bold"
                >
                  Edit Match Details →
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-gray-400 block text-[11px]">Tournament</span>
                  <span className="font-bold text-white text-sm">{activeMatch.stage || activeMatch.format || "Championship"}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">Fixture</span>
                  <span className="font-bold text-white text-sm">
                    {activeMatch.team1} vs {activeMatch.team2}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">Format & Venue</span>
                  <span className="font-medium text-gray-200">
                    {activeMatch.format || "T20"} · {activeMatch.venue || "Stadium"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[11px]">Status</span>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold uppercase text-[10px] mt-0.5">
                    {activeMatch.status || "live"}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={goToNextStep}
                  className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-black text-xs transition-all flex items-center gap-1.5"
                >
                  <span>Proceed to Step 2: Add Moment</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[#111625] border border-white/10 text-center space-y-3">
              <p className="text-sm text-gray-300">No match selected yet. Select a match above or create a new one.</p>
              <Link href="/admin/core-engine/matches/add">
                <button className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs">
                  + Create Your First Match
                </button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: ADD MOMENT */}
      {activeStep === "moment" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1E1606] via-[#120F06] to-[#0A0804] border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚡</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  Step 2: Add Moment (Game Anchors)
                </h3>
              </div>
              <p className="text-xs text-gray-300 max-w-xl leading-relaxed">
                Log overs, ball events, phase, and score triggers (e.g. Wicket, 50-Partnership, Death Over Climax) that anchor the interactive fan engagements.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href={`/admin/core-engine/match-moments/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
                <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5">
                  <List size={14} />
                  <span>Moment List ({moments.length})</span>
                </button>
              </Link>
              <Link href={`/admin/core-engine/match-moments/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
                <button className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-colors flex items-center gap-1.5 shadow-md">
                  <Plus size={14} />
                  <span>Add Moment</span>
                </button>
              </Link>
            </div>
          </div>

          {moments.length > 0 ? (
            <div className="p-5 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Moments Recorded for {activeMatch?.team1} vs {activeMatch?.team2} ({moments.length})
                </h4>
                <Link
                  href={`/admin/core-engine/match-moments/list?matchId=${selectedMatchId}`}
                  className="text-xs text-amber-400 hover:underline font-bold"
                >
                  Manage All Moments →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {moments.map((m) => {
                  const isSelected = m.momentId === selectedMomentId;
                  return (
                    <div
                      key={m.momentId}
                      onClick={() => setSelectedMomentId(m.momentId)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20"
                          : "bg-white/[0.03] border-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300">
                          Over {m.overs}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-300 font-bold">
                          {m.phase || `Innings ${m.innings}`}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-white mb-1">{m.event || m.matchMoment}</h5>
                      <p className="text-[11px] text-gray-400">Score: {m.score || "N/A"}</p>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <button
                  onClick={goToPrevStep}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs flex items-center gap-1.5"
                >
                  <ArrowLeft size={14} />
                  <span>Previous Step</span>
                </button>
                <button
                  onClick={goToNextStep}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all flex items-center gap-1.5 shadow-md"
                >
                  <span>Proceed to Step 3: Engagement</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 rounded-2xl bg-[#111625] border border-white/10 text-center space-y-3">
              <p className="text-sm text-gray-300">No moments recorded yet for this match.</p>
              <Link href={`/admin/core-engine/match-moments/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
                <button className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs">
                  + Add First Moment for this Match
                </button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: ENGAGEMENT */}
      {activeStep === "engagement" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0F1626] via-[#0A0F1A] to-[#060910] border border-cyan-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  Step 3: Engagement Setup & Outcome Settle
                </h3>
              </div>
              <p className="text-xs text-gray-300 max-w-xl leading-relaxed">
                Deploy live polls, predictions, express taps, and debates tied to the moment. Settle outcomes and reveal visible winners.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href={`/admin/core-engine/engagement-setup/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
                <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5">
                  <List size={14} />
                  <span>Engagement List ({engagements.length})</span>
                </button>
              </Link>
              <Link href={`/admin/core-engine/engagement-setup/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}>
                <button className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs transition-colors flex items-center gap-1.5 shadow-md">
                  <Plus size={14} />
                  <span>Add Engagement</span>
                </button>
              </Link>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-cyan-400">
                Engagements Attached to Selected Moment ({activeEngagementsForMoment.length})
              </h4>
              <Link
                href={`/admin/core-engine/engagement-setup/list?matchId=${selectedMatchId}`}
                className="text-xs text-cyan-400 hover:underline font-bold"
              >
                View Full Table & Outcomes →
              </Link>
            </div>

            {activeEngagementsForMoment.length > 0 ? (
              <div className="space-y-2">
                {activeEngagementsForMoment.map((eng) => (
                  <div
                    key={eng.id}
                    className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase">
                          {eng.type}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {eng.status === "settled" ? "✅ Settled" : "⚡ Live"}
                        </span>
                      </div>
                      <h5 className="text-xs font-bold text-white truncate">{eng.title}</h5>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Link href={`/admin/core-engine/engagement-setup/add?editId=${eng.id}&matchId=${selectedMatchId}`}>
                        <button className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold border border-white/10">
                          Edit
                        </button>
                      </Link>
                      <Link href={`/admin/core-engine/engagement-setup/list?matchId=${selectedMatchId}`}>
                        <button className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-bold border border-cyan-500/30">
                          Settle Outcome
                        </button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 text-center space-y-2">
                <p className="text-xs text-gray-400">No engagements created yet for this moment.</p>
                <Link href={`/admin/core-engine/engagement-setup/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}>
                  <button className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs">
                    + Add Engagement for this Moment
                  </button>
                </Link>
              </div>
            )}

            <div className="pt-3 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={goToPrevStep}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                <span>Previous Step</span>
              </button>
              <button
                onClick={goToNextStep}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs transition-all flex items-center gap-1.5 shadow-md"
              >
                <span>Proceed to Step 4: Recognise</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: RECOGNITION */}
      {activeStep === "recognition" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#1B0F2A] via-[#110A1A] to-[#07050E] border border-purple-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  Step 4: Visible Recognition Studio
                </h3>
              </div>
              <p className="text-xs text-gray-300 max-w-xl leading-relaxed">
                Reward participating fans and winners with archetype badges (Sharp Oracle, Fearless Maverick, Clutch Caller), stadium roars, and SXP rewards.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href={`/admin/core-engine/visible-recognition/list${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}`}>
                <button className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors flex items-center gap-1.5">
                  <List size={14} />
                  <span>Recognition List ({recognitions.length})</span>
                </button>
              </Link>
              <Link href={`/admin/core-engine/visible-recognition/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}>
                <button className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-colors flex items-center gap-1.5 shadow-md">
                  <Plus size={14} />
                  <span>Add Recognition</span>
                </button>
              </Link>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-purple-400">
                Recognition for Active Moment
              </h4>
              <Link
                href={`/admin/core-engine/visible-recognition/list?matchId=${selectedMatchId}`}
                className="text-xs text-purple-400 hover:underline font-bold"
              >
                View Dispatched Recognition List →
              </Link>
            </div>

            {activeRecognitionForMoment ? (
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-black uppercase">
                      {activeRecognitionForMoment.archetype || "RECOGNITION"}
                    </span>
                    <span className="text-xs text-gray-300 font-bold">
                      {activeRecognitionForMoment.headline}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    SXP Reward: {activeRecognitionForMoment.rewards?.totalSxp ?? 15} SXP
                  </p>
                </div>
                <Link href={`/admin/core-engine/visible-recognition/add?editId=${activeRecognitionForMoment.recognitionId || activeRecognitionForMoment.id}&matchId=${selectedMatchId}`}>
                  <button className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
                    Edit Recognition
                  </button>
                </Link>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 text-center space-y-2">
                <p className="text-xs text-gray-400">No recognition dispatched yet for this moment.</p>
                <Link href={`/admin/core-engine/visible-recognition/add${selectedMatchId ? `?matchId=${selectedMatchId}` : ""}${selectedMomentId ? `&momentId=${selectedMomentId}` : ""}`}>
                  <button className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs">
                    + Dispatch Recognition to Fans
                  </button>
                </Link>
              </div>
            )}

            <div className="pt-3 border-t border-white/5 flex items-center justify-between">
              <button
                onClick={goToPrevStep}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                <span>Previous Step</span>
              </button>
              <button
                onClick={goToNextStep}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs transition-all flex items-center gap-1.5 shadow-md"
              >
                <span>Proceed to Step 5: Overview</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: OVERVIEW */}
      {activeStep === "overview" && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-gradient-to-br from-[#0B1713] via-[#07110E] to-[#040807] border border-emerald-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📊</span>
                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                  Step 5: Core Loop Overview & Telemetry
                </h3>
              </div>
              <p className="text-xs text-gray-300 max-w-xl leading-relaxed">
                Review the 10-stage Second Screen Core Loop metrics, fan participation rates, accuracy, and reward economy.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/admin/core-engine/overview">
                <button className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-colors flex items-center gap-1.5 shadow-md">
                  <BarChart3 size={14} />
                  <span>Full KPI Matrix</span>
                </button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[#111625] border border-pink-500/20">
              <span className="text-xs font-bold uppercase tracking-wider text-pink-400 block mb-1">
                Active Match
              </span>
              <span className="text-lg font-black text-white truncate block">
                {activeMatch ? `${activeMatch.team1_short || activeMatch.team1} vs ${activeMatch.team2_short || activeMatch.team2}` : "None"}
              </span>
              <span className="text-xs text-emerald-400 font-bold mt-1 block">
                {activeMatch?.status?.toUpperCase() || "PENDING"}
              </span>
            </div>

            <div className="p-5 rounded-2xl bg-[#111625] border border-amber-500/20">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1">
                Moments Logged
              </span>
              <span className="text-3xl font-black text-white">{moments.length}</span>
              <span className="text-xs text-gray-400 block mt-1">In this match</span>
            </div>

            <div className="p-5 rounded-2xl bg-[#111625] border border-cyan-500/20">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1">
                Active Engagements
              </span>
              <span className="text-3xl font-black text-white">{engagements.length}</span>
              <span className="text-xs text-gray-400 block mt-1">Polls & Predictions</span>
            </div>

            <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/20">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400 block mb-1">
                Recognitions
              </span>
              <span className="text-3xl font-black text-white">{recognitions.length}</span>
              <span className="text-xs text-emerald-400 font-bold block mt-1">Dispatched to fans</span>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-between">
            <button
              onClick={goToPrevStep}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs flex items-center gap-1.5"
            >
              <ArrowLeft size={14} />
              <span>Previous Step</span>
            </button>
            <Link href="/admin/core-engine/overview">
              <button className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-all flex items-center gap-1.5 shadow-md">
                <span>Open Advanced KPI Console</span>
                <ChevronRight size={14} />
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateLoopPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Core Loop Studio...</div>}>
      <CreateLoopContent />
    </Suspense>
  );
}
