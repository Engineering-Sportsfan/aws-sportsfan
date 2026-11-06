"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Save,
  RotateCcw,
  List,
} from "lucide-react";
import CoreEngineStepper from "../../components/CoreEngineStepper";

interface MatchFormState {
  match_id: string;
  team1: string;
  team1_short: string;
  team2: string;
  team2_short: string;
  tournament: string;
  format: "" | "T20" | "T20I" | "ODI" | "Test";
  gender: "" | "male" | "female";
  venue: string;
  city: string;
  date: string;
  time: string;
  season: string;
  stage: string;
  total_overs: number | "";
  status: "" | "upcoming" | "live" | "completed";
  target: string;
}

const generateRandomMatchId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 6; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MATCH-${Date.now().toString(36).toUpperCase()}-${random}`;
};

const createEmptyForm = (): MatchFormState => ({
  match_id: generateRandomMatchId(),
  team1: "",
  team1_short: "",
  team2: "",
  team2_short: "",
  tournament: "",
  format: "",
  gender: "",
  venue: "",
  city: "",
  date: "",
  time: "",
  season: "",
  stage: "",
  total_overs: "",
  status: "",
  target: "",
});

function AddMatchContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");

  const [form, setForm] = useState<MatchFormState>(() => createEmptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
    matchId?: string;
  } | null>(null);

  // If editId exists, load that match
  useEffect(() => {
    if (!editId) return;
    const fetchMatchToEdit = async () => {
      try {
        const res = await fetch(`/api/matches?limit=100`);
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const match = json.data.find(
            (m: Record<string, unknown>) => (m.match_id || m.id) === editId
          );
          if (match) {
            setForm({
              match_id: String(match.match_id || match.id),
              team1: String(match.team1 || match.home_team || ""),
              team1_short: String(match.team1_short || ""),
              team2: String(match.team2 || match.away_team || ""),
              team2_short: String(match.team2_short || ""),
              tournament: String(match.tournament || ""),
              format: (match.format as MatchFormState["format"]) || "",
              gender: (match.gender as MatchFormState["gender"]) || "",
              venue: String(match.venue || ""),
              city: String(match.city || ""),
              date: String(match.date || match.start_date || ""),
              time: String(match.time || ""),
              season: String(match.season || ""),
              stage: String(match.stage || ""),
              total_overs: match.total_overs ? Number(match.total_overs) : "",
              status: (match.status as MatchFormState["status"]) || "",
              target: match.target ? String(match.target) : "",
            });
          }
        }
      } catch (err) {
        console.warn("Failed to load match for editing", err);
      }
    };
    fetchMatchToEdit();
  }, [editId]);

  const handleFieldChange = (field: keyof MatchFormState, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleResetForm = () => {
    setForm(createEmptyForm());
    setSubmitResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitResult(null);

    const payload = {
      match_id: (form.match_id || generateRandomMatchId()).trim(),
      team1: form.team1.trim(),
      team1_short: form.team1_short.trim() || form.team1.slice(0, 3).toUpperCase(),
      team2: form.team2.trim(),
      team2_short: form.team2_short.trim() || form.team2.slice(0, 3).toUpperCase(),
      tournament: form.tournament.trim(),
      format: form.format || "T20",
      gender: form.gender || "male",
      venue: form.venue.trim(),
      city: form.city.trim() || null,
      date: form.date,
      time: form.time.trim() || null,
      season: parseInt(form.season, 10) || new Date().getFullYear(),
      stage: form.stage.trim() || null,
      total_overs: form.total_overs || 20,
      status: form.status || "upcoming",
      toss_winner: null,
      toss_decision: "bat",
      target: form.target ? parseFloat(form.target) : null,
      winner: null,
      match_result: "normal",
      source_file: "core_engine_admin",
      isEdit: Boolean(editId),
    };

    try {
      const res = await fetch("/api/matches", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          message: editId ? "Match updated successfully!" : "Match registered successfully in DynamoDB!",
          matchId: payload.match_id,
        });
      } else {
        setSubmitResult({
          success: false,
          message: data.error || data.message || "Failed to save match.",
        });
      }
    } catch (err: unknown) {
      setSubmitResult({
        success: false,
        message: err instanceof Error ? err.message : "Network error submitting match.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1240px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper currentStepKey="match" compact />

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link href="/admin/core-engine/matches/list">
            <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-white/10">
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>🏏</span>
              <span>{editId ? "Edit Match" : "Add Match"}</span>
            </h1>
            <p className="text-xs text-gray-400">
              Register fixtures, venues, formats, and broadcast status for live fan loops
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/core-engine/matches/list">
            <button className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5">
              <List size={14} />
              <span>Match List</span>
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
          {submitResult.success && submitResult.matchId && (
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/core-engine/match-moments/add?matchId=${submitResult.matchId}`}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center gap-1 transition-all"
              >
                <span>Add Moment for this Match</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-6">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-pink-400 flex items-center gap-2">
              <span>📋</span> Match Identity & Teams
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Team 1 (Home) *
              </label>
              <input
                type="text"
                required
                value={form.team1}
                onChange={(e) => handleFieldChange("team1", e.target.value)}
                placeholder="Enter Team 1 name..."
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Team 1 Short Code (3-4 chars)
              </label>
              <input
                type="text"
                value={form.team1_short}
                onChange={(e) => handleFieldChange("team1_short", e.target.value.toUpperCase())}
                placeholder="e.g. IND, AUS, ENG"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-bold uppercase"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Team 2 (Away) *
              </label>
              <input
                type="text"
                required
                value={form.team2}
                onChange={(e) => handleFieldChange("team2", e.target.value)}
                placeholder="Enter Team 2 name..."
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Team 2 Short Code (3-4 chars)
              </label>
              <input
                type="text"
                value={form.team2_short}
                onChange={(e) => handleFieldChange("team2_short", e.target.value.toUpperCase())}
                placeholder="e.g. NZ, SA, PAK"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-bold uppercase"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Tournament / Series *
              </label>
              <input
                type="text"
                required
                value={form.tournament}
                onChange={(e) => handleFieldChange("tournament", e.target.value)}
                placeholder="e.g. ICC T20 World Cup, IPL, Bilateral Series"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>
        </div>

        {/* Fixture Schedule & Venue */}
        <div className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-6">
          <div className="border-b border-white/5 pb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-2">
              <span>📍</span> Venue, Format & Date
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Format
              </label>
              <select
                value={form.format}
                onChange={(e) => handleFieldChange("format", e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">-- Select Format --</option>
                <option value="T20">T20</option>
                <option value="T20I">T20I</option>
                <option value="ODI">ODI</option>
                <option value="Test">Test</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Gender
              </label>
              <select
                value={form.gender}
                onChange={(e) => handleFieldChange("gender", e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">-- Select Gender --</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Venue Stadium
              </label>
              <input
                type="text"
                value={form.venue}
                onChange={(e) => handleFieldChange("venue", e.target.value)}
                placeholder="Enter Stadium..."
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                City
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleFieldChange("city", e.target.value)}
                placeholder="Enter City..."
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Match Date
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => handleFieldChange("date", e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Broadcast Time
              </label>
              <input
                type="text"
                value={form.time}
                onChange={(e) => handleFieldChange("time", e.target.value)}
                placeholder="e.g. 19:30 IST"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Match Stage / Round
              </label>
              <input
                type="text"
                value={form.stage}
                onChange={(e) => handleFieldChange("stage", e.target.value)}
                placeholder="e.g. League Match, Semi Final, Final"
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Broadcast Status
              </label>
              <select
                value={form.status}
                onChange={(e) => handleFieldChange("status", e.target.value)}
                className="w-full bg-[#0a0d17] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-bold"
              >
                <option value="">-- Select Status --</option>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live Now</option>
                <option value="completed">Completed</option>
              </select>
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
            <Link href="/admin/core-engine/matches/list">
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
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-95 text-white font-extrabold text-xs transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={15} />
              <span>{isSubmitting ? "Saving Match..." : editId ? "Update Match" : "Save & Register Match"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function AddMatchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Add Match...</div>}>
      <AddMatchContent />
    </Suspense>
  );
}
