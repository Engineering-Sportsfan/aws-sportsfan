"use client";

import { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

// ─── SHARED TYPES ──────────────────────────────────────────────────────────────

export type Tab = "profile" | "season" | "insights" | "media";

export type ProfileForm = {
  name: string;
  team: string;
  battingStyle: string;
  bowlingStyle: string;
  about: string;
  statsRuns: string;
  statsSr: string;
  statsAvg: string;
  overviewCaptain: string;
  overviewCoach: string;
  overviewOwner: string;
  overviewVenue: string;
};

export type SeasonForm = {
  year: string;
  wins: string;
  losses: string;
  points: string;
  position: string;
  matchesPlayed: string;
  netRunRate: string;
  highestTotal: string;
  lowestTotal: string;
  runs: string;
  strikeRate: string;
  average: string;
  fifties: string;
  hundreds: string;
  highestScore: string;
  fours: string;
  sixes: string;
  award: string;
  awardSub: string;
};

export type Insight = {
  title: string;
  description: string;
};

export type MediaItem = {
  title: string;
  views: string;
  time: string;
  file: File | null;
  existingThumbnail?: string;
};

// ─── REUSABLE UI PRIMITIVES ────────────────────────────────────────────────────

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string };
export function Input({ label, ...props }: InputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      <input
        {...props}
        className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string };
export function Textarea({ label, ...props }: TextareaProps) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      <textarea
        {...props}
        rows={4}
        className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
      />
    </div>
  );
}

export function FileInput({
  label,
  onChange,
}: {
  label: string;
  onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="w-full text-sm text-white border border-gray-700 rounded cursor-pointer bg-[#0d1117] px-3 py-2"
      />
    </div>
  );
}

export function SectionTitle({
  title,
  noMargin,
}: {
  title: string;
  noMargin?: boolean;
}) {
  return (
    <h2
      className={`text-sm font-semibold text-gray-200 ${noMargin ? "" : "mb-1"}`}
    >
      {title}
    </h2>
  );
}

export function Divider() {
  return <div className="border-t border-[#21262d]" />;
}

export function AddButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="text-blue-400 hover:text-blue-300 text-sm bg-[#0d1117] hover:bg-blue-900/20 border border-[#21262d] hover:border-blue-800 px-3 py-2 rounded transition-all"
    >
      + {label}
    </button>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-[#30363d] rounded-lg p-8 text-center">
      <p className="text-sm text-gray-600">{message}</p>
    </div>
  );
}

export type FormActionsProps = {
  onSave: () => void;
  onCancel: () => void;
  loading: boolean;
  isEdit: boolean;
  saveLabel?: string;
  cancelLabel?: string;
};

export function FormActions({
  onSave,
  onCancel,
  loading,
  isEdit,
  saveLabel,
  cancelLabel = "Cancel",
}: FormActionsProps) {
  const defaultSave = isEdit ? "Update" : "Save";
  return (
    <div className="flex gap-3 pt-2">
      <button
        onClick={onSave}
        disabled={loading}
        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed py-3 rounded font-semibold text-white text-sm transition-colors"
      >
        {loading ? "Saving..." : saveLabel || defaultSave}
      </button>
      <button
        onClick={onCancel}
        className="flex-1 bg-[#21262d] hover:bg-[#30363d] py-3 rounded font-semibold text-gray-300 text-sm transition-colors"
      >
        {cancelLabel}
      </button>
    </div>
  );
}

export function getPreview(file: File | null, existing?: string): string {
  if (file) return URL.createObjectURL(file);
  return existing || "";
}