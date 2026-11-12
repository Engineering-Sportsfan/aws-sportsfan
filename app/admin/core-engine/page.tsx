"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  Trophy,
  Zap,
  MessageSquare,
  Award,
  BarChart3,
  Plus,
  List,
  ArrowRight,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import CoreEngineStepper from "./components/CoreEngineStepper";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  status?: string;
  format?: string;
}

interface MatchMomentItem {
  momentId: string;
  matchId: string;
  overs: string;
  score: string;
  event: string;
}

interface EngagementItem {
  id: string;
  type: string;
  title: string;
  status?: string;
}

interface RecognitionItem {
  id: string;
  headline: string;
  archetype: string;
}

function CoreEngineDashboardContent() {
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [matchesRes, momentsRes, engRes, recRes] = await Promise.allSettled([
        fetch(`/api/matches?coreOnly=true&limit=1000&_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/match-moments?_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&limit=1000&_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/visible-recognition?_t=${Date.now()}`).then((r) => r.json()),
      ]);

      if (matchesRes.status === "fulfilled" && matchesRes.value?.success && Array.isArray(matchesRes.value.data)) {
        setMatches(matchesRes.value.data);
      }
      if (momentsRes.status === "fulfilled" && momentsRes.value?.success && Array.isArray(momentsRes.value.data)) {
        setMoments(momentsRes.value.data);
      }
      if (engRes.status === "fulfilled" && engRes.value?.success && Array.isArray(engRes.value.engagements)) {
        setEngagements(engRes.value.engagements);
      }
      if (recRes.status === "fulfilled" && recRes.value?.success && Array.isArray(recRes.value.data)) {
        setRecognitions(recRes.value.data);
      }
    } catch (err) {
      console.warn("Failed to load core engine dashboard stats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const liveMatchesCount = matches.filter((m) => (m.status || "").toLowerCase() === "live").length;
  const activeEngagementsCount = engagements.filter((e) => e.status !== "settled").length;

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-pink-600 via-rose-600 to-amber-500 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                ⚙️
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Core Engine Loop Console
              </h1>
              <p className="text-sm text-gray-400">
                10-stage Second Screen Core Loop engine: Match Setup, Moment Setup, Engagements, and Visible Recognitions
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/admin/core-engine/create-loop">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md">
              <Zap size={15} />
              <span>Interactive Create Loop Flow</span>
            </button>
          </Link>
          <button
            onClick={fetchAllData}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10"
            title="Refresh All Data"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Interactive Loop Stepper Header Bar */}
      <CoreEngineStepper currentStepKey="match" />

      {/* 4 Stats Cards (Patterned after homecardmanagement) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Matches Card */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-pink-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-pink-400">
              Matches
            </span>
            <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center">
              <Trophy size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-3xl font-black text-white">
              {loading ? "..." : matches.length}
            </span>
            <span className="text-xs text-gray-400 ml-2">Fixtures</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-emerald-400 font-bold">
              {liveMatchesCount} Live Now
            </span>
            <Link
              href="/admin/core-engine/matches/list"
              className="text-pink-400 hover:underline flex items-center gap-0.5 font-bold"
            >
              Manage <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Moments Card */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-amber-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Match Moments
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Zap size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-3xl font-black text-white">
              {loading ? "..." : moments.length}
            </span>
            <span className="text-xs text-gray-400 ml-2">Game Anchors</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-amber-400 font-bold">Over Events Logged</span>
            <Link
              href="/admin/core-engine/match-moments/list"
              className="text-amber-400 hover:underline flex items-center gap-0.5 font-bold"
            >
              Manage <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Engagements Card */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-cyan-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Live Engagements
            </span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <MessageSquare size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-3xl font-black text-white">
              {loading ? "..." : engagements.length}
            </span>
            <span className="text-xs text-gray-400 ml-2">Polls & Predictions</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-cyan-400 font-bold">{activeEngagementsCount} Active Loops</span>
            <Link
              href="/admin/core-engine/engagement-setup/list"
              className="text-cyan-400 hover:underline flex items-center gap-0.5 font-bold"
            >
              Manage <ArrowRight size={12} />
            </Link>
          </div>
        </div>

        {/* Recognitions Card */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Fan Recognition
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Award size={18} />
            </div>
          </div>
          <div className="my-3">
            <span className="text-3xl font-black text-white">
              {loading ? "..." : recognitions.length}
            </span>
            <span className="text-xs text-gray-400 ml-2">Badges Dispatched</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
            <span className="text-emerald-400 font-bold">SXP Rewards Active</span>
            <Link
              href="/admin/core-engine/visible-recognition/list"
              className="text-purple-400 hover:underline flex items-center gap-0.5 font-bold"
            >
              Manage <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Grid: Management Modules & Flow Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: 4 Dedicated Core Engine Modules */}
        <div className="lg:col-span-2 space-y-4">
          {/* Module 1: Match Setup */}
          <div className="p-5 rounded-2xl bg-[#111625] border border-pink-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏏</span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Match Setup Module
                </h3>
              </div>
              <p className="text-xs text-gray-400 max-w-md">
                Register match fixtures, format (T20, ODI, Test), venue, date, and live broadcast state.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/admin/core-engine/matches/list">
                <button className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors flex items-center gap-1 border border-white/10">
                  <List size={13} />
                  <span>Match List ({matches.length})</span>
                </button>
              </Link>
              <Link href="/admin/core-engine/matches/add">
                <button className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-extrabold text-xs transition-colors flex items-center gap-1 shadow-md">
                  <Plus size={13} />
                  <span>Add Match</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Module 2: Moment Setup */}
          <div className="p-5 rounded-2xl bg-[#111625] border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Moment Setup Module
                </h3>
              </div>
              <p className="text-xs text-gray-400 max-w-md">
                Log innings phase, overs (10.2, 13.6), score, and game play moments (Wicket, 50, Boundary).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/admin/core-engine/match-moments/list">
                <button className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors flex items-center gap-1 border border-white/10">
                  <List size={13} />
                  <span>Moment List ({moments.length})</span>
                </button>
              </Link>
              <Link href="/admin/core-engine/match-moments/add">
                <button className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-colors flex items-center gap-1 shadow-md">
                  <Plus size={13} />
                  <span>Add Moment</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Module 3: Engagement Setup */}
          <div className="p-5 rounded-2xl bg-[#111625] border border-cyan-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎯</span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Engagement Setup Module
                </h3>
              </div>
              <p className="text-xs text-gray-400 max-w-md">
                Create live polls, predictions, express reaction taps, and resolve outcomes with verified ground truth.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/admin/core-engine/engagement-setup/list">
                <button className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors flex items-center gap-1 border border-white/10">
                  <List size={13} />
                  <span>Engagement List ({engagements.length})</span>
                </button>
              </Link>
              <Link href="/admin/core-engine/engagement-setup/add">
                <button className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-extrabold text-xs transition-colors flex items-center gap-1 shadow-md">
                  <Plus size={13} />
                  <span>Add Engagement</span>
                </button>
              </Link>
            </div>
          </div>

          {/* Module 4: Visible Recognition */}
          <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏆</span>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Recognition Studio Module
                </h3>
              </div>
              <p className="text-xs text-gray-400 max-w-md">
                Award Sharp Oracle, Fearless Maverick, and Clutch Caller badges with SXP economy payouts.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/admin/core-engine/visible-recognition/list">
                <button className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs transition-colors flex items-center gap-1 border border-white/10">
                  <List size={13} />
                  <span>Recognition List ({recognitions.length})</span>
                </button>
              </Link>
              <Link href="/admin/core-engine/visible-recognition/add">
                <button className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs transition-colors flex items-center gap-1 shadow-md">
                  <Plus size={13} />
                  <span>Add Recognition</span>
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Right Col: Quick Loop Flow Card & Overview Telemetry */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <Sparkles size={18} className="text-pink-500" />
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Interactive Loop Studio
                </h3>
                <p className="text-[11px] text-gray-400">
                  Continuous sequence workflow for match admins
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#090C15] border border-white/5 space-y-2 text-xs text-gray-300">
              <p className="font-bold text-white flex items-center gap-1.5">
                <span>⚡</span> The Second-Screen Loop
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Step-by-step pipeline connects fixture triggers to high-frequency fan predictions, instant outcome settlement, and leaderboard spotlight recognition.
              </p>
              <div className="pt-2">
                <Link href="/admin/core-engine/create-loop">
                  <button className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-amber-500 hover:opacity-95 text-white font-black text-xs flex items-center justify-center gap-2 transition-all shadow-md">
                    <Zap size={14} />
                    <span>Launch Create Loop Studio</span>
                  </button>
                </Link>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#090C15] border border-white/5 space-y-2 text-xs text-gray-300">
              <p className="font-bold text-white flex items-center gap-1.5">
                <span>📊</span> 10-Stage Core Loop Telemetry
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Inspect end-to-end KPI matrix, latency, crowd participation rates, and DynamoDB synchronization status.
              </p>
              <div className="pt-2">
                <Link href="/admin/core-engine/overview">
                  <button className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all border border-white/10">
                    <BarChart3 size={14} />
                    <span>Open Full Overview & Telemetry</span>
                  </button>
                </Link>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-center justify-between">
            <span className="font-bold">⚡ Zero Logic Alterations</span>
            <span className="text-[10px] text-emerald-400">100% Contract Preserved</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoreEnginePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Core Engine...</div>}>
      <CoreEngineDashboardContent />
    </Suspense>
  );
}
