"use client";

import React from "react";
import Link from "next/link";
import { Check, Trophy, Zap, MessageSquare, Award, BarChart3, ChevronRight } from "lucide-react";

export interface StepperStep {
  key: "match" | "moment" | "engagement" | "recognition" | "overview";
  stepNumber: number;
  label: string;
  shortDesc: string;
  addHref: string;
  listHref: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const CORE_ENGINE_STEPS: StepperStep[] = [
  {
    key: "match",
    stepNumber: 1,
    label: "Match Setup",
    shortDesc: "Add or select live match",
    addHref: "/admin/core-engine/matches/add",
    listHref: "/admin/core-engine/matches/list",
    icon: Trophy,
  },
  {
    key: "moment",
    stepNumber: 2,
    label: "Add Moment",
    shortDesc: "Overs, phase & game anchor",
    addHref: "/admin/core-engine/match-moments/add",
    listHref: "/admin/core-engine/match-moments/list",
    icon: Zap,
  },
  {
    key: "engagement",
    stepNumber: 3,
    label: "Engagement",
    shortDesc: "Polls, predictions & debate",
    addHref: "/admin/core-engine/engagement-setup/add",
    listHref: "/admin/core-engine/engagement-setup/list",
    icon: MessageSquare,
  },
  {
    key: "recognition",
    stepNumber: 4,
    label: "Recognise",
    shortDesc: "Spotlight fans & SXP rewards",
    addHref: "/admin/core-engine/visible-recognition/add",
    listHref: "/admin/core-engine/visible-recognition/list",
    icon: Award,
  },
  {
    key: "overview",
    stepNumber: 5,
    label: "Overview",
    shortDesc: "Real-time loop telemetry & KPIs",
    addHref: "/admin/core-engine/overview",
    listHref: "/admin/core-engine/overview",
    icon: BarChart3,
  },
];

interface CoreEngineStepperProps {
  currentStepKey: "match" | "moment" | "engagement" | "recognition" | "overview";
  completedSteps?: ("match" | "moment" | "engagement" | "recognition" | "overview")[];
  onSelectStep?: (key: "match" | "moment" | "engagement" | "recognition" | "overview") => void;
  matchId?: string;
  momentId?: string;
  compact?: boolean;
}

export default function CoreEngineStepper({
  currentStepKey,
  completedSteps = [],
  onSelectStep,
  matchId,
  momentId,
  compact = false,
}: CoreEngineStepperProps) {
  const currentIndex = CORE_ENGINE_STEPS.findIndex((s) => s.key === currentStepKey);

  const getStepStatus = (
    index: number,
    key: "match" | "moment" | "engagement" | "recognition" | "overview"
  ) => {
    if (completedSteps.includes(key)) return "completed";
    if (index < currentIndex) return "completed";
    if (index === currentIndex) return "active";
    return "upcoming";
  };

  const getStepHref = (step: StepperStep) => {
    const params = new URLSearchParams();
    if (matchId) params.set("matchId", matchId);
    if (momentId && step.key !== "match") params.set("momentId", momentId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return `${step.addHref}${qs}`;
  };

  return (
    <div className="w-full bg-[#0a0d17] border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
      {/* Background neon ambient accent */}
      <div className="absolute top-0 left-1/4 w-96 h-24 bg-gradient-to-r from-pink-600/10 via-rose-500/10 to-amber-500/10 blur-3xl pointer-events-none" />

      {/* Stepper horizontal line & nodes */}
      <div className="relative flex items-center justify-between max-w-4xl mx-auto px-4 sm:px-8 py-2">
        {/* Background connector line */}
        <div className="absolute top-6 sm:top-7 left-8 right-8 sm:left-14 sm:right-14 h-[3px] bg-slate-800 -z-0" />

        {/* Dynamic active/completed connecting line matching the reference image red/coral line */}
        <div
          className="absolute top-6 sm:top-7 left-8 sm:left-14 h-[3px] bg-gradient-to-r from-[#ef4444] via-[#f43f5e] to-[#fb7185] transition-all duration-500 ease-out shadow-[0_0_12px_rgba(239,68,68,0.7)] -z-0"
          style={{
            width: `${Math.min(100, Math.max(0, (currentIndex / (CORE_ENGINE_STEPS.length - 1)) * 100))}%`,
          }}
        />

        {/* Nodes */}
        {CORE_ENGINE_STEPS.map((step, idx) => {
          const status = getStepStatus(idx, step.key);
          const isCompleted = status === "completed";
          const isActive = status === "active";

          const StepContent = (
            <div className="flex flex-col items-center group relative cursor-pointer select-none">
              {/* Circle Badge matching user reference image */}
              <div
                className={`relative z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 font-black text-sm ${
                  isCompleted
                    ? "bg-[#ef4444] text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]"
                    : isActive
                    ? "bg-gradient-to-br from-[#ef4444] via-[#f43f5e] to-[#ff5940] text-white shadow-[0_0_20px_rgba(239,68,68,0.9)] scale-110 ring-4 ring-[#ef4444]/35"
                    : "bg-[#182030] border-2 border-slate-700/70 text-slate-400 group-hover:border-slate-500 group-hover:text-slate-200"
                }`}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5 sm:w-6 sm:h-6 stroke-[3]" />
                ) : (
                  <span>{step.stepNumber}</span>
                )}

                {/* Subtle active pulse ring */}
                {isActive && (
                  <span className="absolute -inset-1 rounded-full border border-red-500/60 animate-ping opacity-60 pointer-events-none" />
                )}
              </div>

              {/* Label below circle */}
              <div className="mt-2.5 text-center flex flex-col items-center">
                <span
                  className={`text-xs font-bold tracking-wide transition-colors ${
                    isActive
                      ? "text-white font-black drop-shadow-sm"
                      : isCompleted
                      ? "text-slate-200 group-hover:text-white"
                      : "text-slate-400 group-hover:text-slate-200"
                  }`}
                >
                  {step.label}
                </span>

                {!compact && (
                  <span
                    className={`hidden sm:block text-[10px] mt-0.5 max-w-[110px] leading-tight ${
                      isActive ? "text-pink-300 font-medium" : "text-slate-400"
                    }`}
                  >
                    {step.shortDesc}
                  </span>
                )}
              </div>
            </div>
          );

          return onSelectStep ? (
            <button
              key={step.key}
              type="button"
              onClick={() => onSelectStep(step.key)}
              className="focus:outline-none"
            >
              {StepContent}
            </button>
          ) : (
            <Link key={step.key} href={getStepHref(step)}>
              {StepContent}
            </Link>
          );
        })}
      </div>

      {/* Contextual match / moment badges if selected */}
      {(matchId || momentId) && (
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 px-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Active Context:
            </span>
            {matchId && (
              <span className="px-2.5 py-0.5 rounded-full bg-pink-500/15 border border-pink-500/30 text-pink-300 font-bold text-[11px]">
                🏏 Match Active
              </span>
            )}
            {momentId && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-[11px]">
                ⚡ Moment Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/core-engine/create-loop"
              className="text-[11px] font-bold text-pink-400 hover:text-pink-300 flex items-center gap-1 hover:underline"
            >
              <span>Interactive Loop Console</span>
              <ChevronRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
