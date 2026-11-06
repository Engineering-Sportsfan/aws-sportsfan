"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import {
  Trophy,
  Zap,
  Activity,
  RefreshCw,
} from "lucide-react";
import CoreEngineStepper from "../components/CoreEngineStepper";

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
  totalVotes?: number;
}

interface RecognitionItem {
  id: string;
  headline: string;
  archetype: string;
  rewards?: { totalSxp?: number; [key: string]: unknown };
}

function OverviewContent() {
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);

  const fetchOverviewData = React.useCallback(async () => {
    try {
      const [mRes, momRes, engRes, recRes] = await Promise.allSettled([
        fetch("/api/matches?limit=100").then((r) => r.json()),
        fetch(`/api/match-moments?_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&limit=100&_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/visible-recognition?_t=${Date.now()}`).then((r) => r.json()),
      ]);

      if (mRes.status === "fulfilled" && mRes.value?.success && Array.isArray(mRes.value.data)) {
        setMatches(mRes.value.data);
      }
      if (momRes.status === "fulfilled" && momRes.value?.success && Array.isArray(momRes.value.data)) {
        setMoments(momRes.value.data);
      }
      if (engRes.status === "fulfilled" && engRes.value?.success && Array.isArray(engRes.value.engagements)) {
        setEngagements(engRes.value.engagements);
      }
      if (recRes.status === "fulfilled" && recRes.value?.success && Array.isArray(recRes.value.data)) {
        setRecognitions(recRes.value.data);
      }
    } catch (err) {
      console.warn("Failed to load overview data", err);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  const activeMatch = matches.find((m) => m.match_id === selectedMatchId);
  const matchMoments = moments.filter((m) => !selectedMatchId || m.matchId === selectedMatchId);
  const matchEngagements = engagements.filter((e: EngagementItem & { matchId?: string }) => !selectedMatchId || !e.matchId || e.matchId === selectedMatchId);
  const matchRecognitions = recognitions.filter((r: RecognitionItem & { matchId?: string }) => !selectedMatchId || !r.matchId || r.matchId === selectedMatchId);

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper currentStepKey="overview" matchId={selectedMatchId} compact />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 p-[1.5px]">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                📊
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                Core Loop Overview & Telemetry
              </h1>
              <p className="text-xs text-gray-400">
                End-to-end loop health, latency metrics, participation rates, and SXP payout telemetry
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchOverviewData}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10"
            title="Refresh Telemetry"
          >
            <RefreshCw size={15} />
          </button>
          <Link href="/admin/core-engine/create-loop">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md">
              <Zap size={14} />
              <span>Interactive Create Loop</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Match Selector */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-300">
          <Trophy size={15} className="text-pink-400" />
          <span>Active Match Fixture:</span>
          <select
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            className="bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500 font-bold"
          >
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.team1} vs {m.team2}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
          <Activity size={14} />
          <span>DynamoDB Real-Time Sync Active</span>
        </div>
      </div>

      {/* Overview Matrix Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#111625] border border-pink-500/20">
          <span className="text-xs font-bold uppercase tracking-wider text-pink-400 block mb-1">
            Match Status
          </span>
          <span className="text-2xl font-black text-white">
            {activeMatch ? activeMatch.status?.toUpperCase() || "LIVE" : "N/A"}
          </span>
          <span className="text-xs text-gray-400 block mt-1">
            {activeMatch ? `${activeMatch.team1} vs ${activeMatch.team2}` : "No match selected"}
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-[#111625] border border-amber-500/20">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block mb-1">
            Moments Logged
          </span>
          <span className="text-3xl font-black text-white">{matchMoments.length}</span>
          <span className="text-xs text-gray-400 block mt-1">Over Game Anchors</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#111625] border border-cyan-500/20">
          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block mb-1">
            Live Engagements
          </span>
          <span className="text-3xl font-black text-white">{matchEngagements.length}</span>
          <span className="text-xs text-gray-400 block mt-1">Polls & Predictions</span>
        </div>

        <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/20">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400 block mb-1">
            Recognitions Dispatched
          </span>
          <span className="text-3xl font-black text-white">{matchRecognitions.length}</span>
          <span className="text-xs text-gray-400 block mt-1">Fan Archetype Spotlights</span>
        </div>
      </div>

      {/* 10-Stage Loop Pipeline Visualization */}
      <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <span>⚡</span> 10-Stage Second Screen Loop Flow Pipeline
          </h3>
          <span className="text-[11px] text-gray-400">Spec: India Tour of NZ Second Screen</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          {[
            { stage: 1, name: "Fixture Sync", status: "Active", sub: "Match Setup" },
            { stage: 2, name: "Over Anchor", status: "Active", sub: "Moment Logged" },
            { stage: 3, name: "Engagement Dispatch", status: "Active", sub: "Poll / Predict" },
            { stage: 4, name: "Fan Vote & Stake", status: "Live", sub: "10 Coin Stake" },
            { stage: 5, name: "Countdown Lock", status: "Live", sub: "Pre-Delivery" },
            { stage: 6, name: "Outcome Ground Truth", status: "Pending", sub: "Ball Event" },
            { stage: 7, name: "Visible Reveal", status: "Pending", sub: "Big Screen / Mobile" },
            { stage: 8, name: "SXP Economy Payout", status: "Active", sub: "+15 SXP Avg" },
            { stage: 9, name: "Archetype Spotlight", status: "Active", sub: "Sharp Oracle" },
            { stage: 10, name: "Next Over Hook", status: "Active", sub: "Re-engagement" },
          ].map((s) => (
            <div
              key={s.stage}
              className="p-3 rounded-xl bg-[#0a0d17] border border-white/5 space-y-1 hover:border-emerald-500/30 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center">
                  {s.stage}
                </span>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                  {s.status}
                </span>
              </div>
              <h5 className="font-bold text-white text-xs truncate">{s.name}</h5>
              <p className="text-[10px] text-gray-400">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Overview...</div>}>
      <OverviewContent />
    </Suspense>
  );
}
