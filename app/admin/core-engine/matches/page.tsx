"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Trophy,
  Calendar,
  MapPin,
  PlusCircle,
  List,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  Edit3,
  Trash2,
  X,
} from "lucide-react";

interface MatchFormState {
  match_id: string;
  team1: string;
  team1_short: string;
  team2: string;
  team2_short: string;
  tournament: string;
  format: "T20" | "T20I" | "ODI" | "Test";
  gender: "male" | "female";
  venue: string;
  city: string;
  date: string;
  time: string;
  season: string;
  stage: string;
  total_overs: number;
  status: "upcoming" | "live" | "completed";
  target: string;
}

// Helper to generate purely random match ID without team names
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
  format: "T20",
  gender: "male",
  venue: "",
  city: "",
  date: new Date().toISOString().split("T")[0],
  time: "",
  season: String(new Date().getFullYear()),
  stage: "",
  total_overs: 20,
  status: "live",
  target: "",
});

const EMPTY_FORM: MatchFormState = createEmptyForm();

// Preset available via 1-click button
const PRESET_FORM: MatchFormState = {
  match_id: "NZ-IND-2026-T20-4TH-T20I",
  team1: "New Zealand",
  team1_short: "NZ",
  team2: "India",
  team2_short: "IND",
  tournament: "India tour of New Zealand 2026",
  format: "T20",
  gender: "male",
  venue: "Eden Park",
  city: "Auckland",
  date: "2026-10-30",
  time: "19:00 NZDT",
  season: "2026",
  stage: "4th T20I",
  total_overs: 20,
  status: "live",
  target: "",
};

export default function CoreEngineMatchesPage() {
  const [activeTab, setActiveTab] = useState<"create" | "directory">("create");
  const [form, setForm] = useState<MatchFormState>(() => createEmptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    success: boolean;
    message: string;
    matchId?: string;
  } | null>(null);

  // Directory list
  const [matches, setMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const handleEditMatch = (m: any) => {
    const matchId = m.match_id || m.id;
    setEditingMatchId(matchId);
    setForm({
      match_id: matchId,
      team1: m.team1 || m.home_team || "",
      team1_short: m.team1_short || "",
      team2: m.team2 || m.away_team || "",
      team2_short: m.team2_short || "",
      tournament: m.tournament || "",
      format: (m.format as any) || "T20",
      gender: (m.gender as any) || "male",
      venue: m.venue || "",
      city: m.city || "",
      date: m.date || m.start_date || "",
      time: m.time || "",
      season: String(m.season || new Date().getFullYear()),
      stage: m.stage || "",
      total_overs: Number(m.total_overs) || 20,
      status: (m.status as any) || "live",
      target: m.target ? String(m.target) : "",
    });
    setActiveTab("create");
    setSubmitResult(null);
  };

  const handleCancelEdit = () => {
    setEditingMatchId(null);
    setForm(createEmptyForm());
    setSubmitResult(null);
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!confirm(`Are you sure you want to delete match ${matchId}? This cannot be undone.`)) return;
    try {
      let res = await fetch(`/api/matches/${matchId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        res = await fetch(`/api/matches?match_id=${matchId}`, {
          method: "DELETE",
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          message: `Match ${matchId} deleted successfully.`,
        });
        fetchMatches();
      } else {
        setSubmitResult({
          success: false,
          message: data.error || "Failed to delete match",
        });
      }
    } catch (err: any) {
      setSubmitResult({
        success: false,
        message: err.message || "Failed to delete match",
      });
    }
  };

  // Auto-generate match ID: Team A name - Team B name - year - format - match stage
  const generateMatchId = (
    t1: string,
    t1Short: string,
    t2: string,
    t2Short: string,
    dateOrYear: string,
    fmt: string,
    stg: string
  ) => {
    const code1 = (t1Short || t1 || "").replace(/\s+/g, "").toUpperCase();
    const code2 = (t2Short || t2 || "").replace(/\s+/g, "").toUpperCase();
    const yr = (dateOrYear || "").slice(0, 4);
    const f = (fmt || "T20").replace(/\s+/g, "").toUpperCase();
    const s = (stg || "").replace(/\s+/g, "-").toUpperCase();
    const parts = [code1, code2, yr, f, s].filter(Boolean);
    return parts.join("-");
  };

  const handleFieldChange = (field: keyof MatchFormState, value: any) => {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };

      // Auto update total_overs based on format
      if (field === "format") {
        if (value === "T20" || value === "T20I") updated.total_overs = 20;
        else if (value === "ODI") updated.total_overs = 50;
        else if (value === "Test") updated.total_overs = 90;
      }

      // Keep purely random auto-generated match_id intact (no team name dependency)

      return updated;
    });
  };

  // Quick 1-Click Preset
  const handleLoadPreset = () => {
    setForm({ ...PRESET_FORM });
    setSubmitResult(null);
  };

  // Fetch matches from API
  const fetchMatches = async () => {
    setLoadingMatches(true);
    try {
      const res = await fetch("/api/matches?limit=100");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMatches(data.data);
      }
    } catch (err) {
      console.warn("Failed to fetch matches:", err);
    } finally {
      setLoadingMatches(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitResult(null);

    const finalMatchId = (
      form.match_id ||
      generateMatchId(
        form.team1,
        form.team1_short,
        form.team2,
        form.team2_short,
        form.date || form.season,
        form.format,
        form.stage
      ) ||
      `MATCH-${Date.now()}`
    ).trim();

    const payload = {
      match_id: finalMatchId,
      team1: form.team1.trim(),
      team1_short: form.team1_short.trim() || form.team1.slice(0, 3).toUpperCase(),
      team2: form.team2.trim(),
      team2_short: form.team2_short.trim() || form.team2.slice(0, 3).toUpperCase(),
      tournament: form.tournament.trim(),
      format: form.format,
      gender: form.gender,
      venue: form.venue.trim(),
      city: form.city.trim() || null,
      date: form.date,
      time: form.time.trim() || null,
      season: parseInt(form.season, 10) || new Date().getFullYear(),
      stage: form.stage.trim() || null,
      total_overs: form.total_overs || 20,
      status: form.status,
      toss_winner: null,
      toss_decision: "bat",
      target: form.target ? parseFloat(form.target) : null,
      winner: null,
      match_result: "normal",
      source_file: "core_engine_admin",
    };

    try {
      const url = editingMatchId ? `/api/matches/${editingMatchId}` : "/api/matches";
      const method = editingMatchId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitResult({
          success: true,
          message: editingMatchId
            ? `Match ${editingMatchId} updated successfully!`
            : `Match successfully registered in Core Engine!`,
          matchId: data.match_id || form.match_id,
        });
        if (editingMatchId) {
          setEditingMatchId(null);
        }
        setForm(createEmptyForm());
        fetchMatches();
      } else {
        setSubmitResult({
          success: false,
          message: data.error || (data.errors ? JSON.stringify(data.errors) : "Failed to save match"),
        });
      }
    } catch (err: any) {
      setSubmitResult({
        success: false,
        message: err.message || "Network error occurred while saving match",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "24px 28px",
      }}
    >
      {/* Top Breadcrumb & Header */}
      <div style={{ maxWidth: 1200, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b949e", marginBottom: 6 }}>
          <span>Core Engine</span>
          <span>/</span>
          <span style={{ color: "#58a6ff", fontWeight: 600 }}>Match Setup & Directory</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 10 }}>
              <Trophy size={24} color="#f59e0b" />
              Core Engine: Match Setup
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8b949e" }}>
              Define live & upcoming matches. Generated Match IDs power real-time ball-by-ball Match Moments & Loop Engagements.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link
              href="/admin/core-engine/match-moments"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#238636",
                color: "#fff",
                padding: "8px 16px",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(35,134,54,0.3)",
              }}
            >
              <PlayCircle size={16} />
              Open Live Match Moments Console
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 1200, margin: "0 auto 24px", display: "flex", gap: 8, borderBottom: "1px solid #30363d", paddingBottom: 12 }}>
        <button
          onClick={() => setActiveTab("create")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: activeTab === "create" ? "#21262d" : "transparent",
            color: activeTab === "create" ? "#58a6ff" : "#8b949e",
            border: activeTab === "create" ? "1px solid #388bfd" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          <PlusCircle size={15} />
          Create Match Form
        </button>
        <button
          onClick={() => {
            setActiveTab("directory");
            fetchMatches();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: activeTab === "directory" ? "#21262d" : "transparent",
            color: activeTab === "directory" ? "#58a6ff" : "#8b949e",
            border: activeTab === "directory" ? "1px solid #388bfd" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          <List size={15} />
          Matches Directory ({matches.length})
        </button>
      </div>

      {activeTab === "create" ? (
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>
          {/* Main Form */}
          <div
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 10,
              padding: 24,
            }}
          >
            {/* Edit Mode Notice */}
            {editingMatchId && (
              <div
                style={{
                  background: "rgba(210,153,34,0.15)",
                  border: "1px solid #d29922",
                  borderRadius: 8,
                  padding: "10px 16px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#d29922", fontWeight: 600, fontSize: 13 }}>
                  <Edit3 size={16} />
                  Editing Match: {editingMatchId}
                </div>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{
                    background: "#21262d",
                    color: "#c9d1d9",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <X size={12} /> Cancel Edit
                </button>
              </div>
            )}
            {/* Quick preset banner */}
            <div
              style={{
                background: "rgba(56,139,253,0.1)",
                border: "1px solid rgba(56,139,253,0.3)",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Sparkles size={18} color="#58a6ff" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>Sample Match Preset Available</div>
                  <div style={{ fontSize: 11, color: "#8b949e" }}>4th T20I: New Zealand vs India at Eden Park, Auckland (Oct 30, 2026)</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleLoadPreset}
                style={{
                  background: "#1f6feb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ⚡ 1-Click Load Preset
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* SECTION 1: Classification */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#58a6ff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                  1. Match Classification & Series
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Tournament / Series Name *</label>
                    <input
                      type="text"
                      required
                      value={form.tournament}
                      onChange={(e) => handleFieldChange("tournament", e.target.value)}
                      style={inputStyle}
                      placeholder="e.g. India tour of New Zealand 2026"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Format *</label>
                    <select
                      value={form.format}
                      onChange={(e) => handleFieldChange("format", e.target.value as any)}
                      style={inputStyle}
                    >
                      <option value="T20">T20 </option>
                      <option value="T20I">T20I</option>  
                      <option value="ODI">ODI (50 Overs)</option>
                      <option value="Test">Test Match</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Gender</label>
                    <select
                      value={form.gender}
                      onChange={(e) => handleFieldChange("gender", e.target.value as any)}
                      style={inputStyle}
                    >
                      <option value="male">Men's</option>
                      <option value="female">Women's</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Identity & Status */}
              <div style={{ marginBottom: 24, borderTop: "1px solid #21262d", paddingTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#58a6ff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                  2. Match Identity & Status
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <label style={{ fontSize: 12, color: "#8b949e" }}>
                        Match ID <span style={{ fontSize: 10, color: "#7ee787" }}>🔒 (Random Auto-generated)</span> *
                      </label>
                      {/* {!editingMatchId && (
                        <button
                          type="button"
                          onClick={() => setForm((prev) => ({ ...prev, match_id: generateRandomMatchId() }))}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#58a6ff",
                            fontSize: 11,
                            cursor: "pointer",
                            padding: 0,
                            textDecoration: "underline",
                            fontWeight: 600,
                          }}
                          title="Generate a different random match ID"
                        >
                          🎲 Regenerate ID
                        </button>
                      )} */}
                    </div>
                    <input
                      type="text"
                      readOnly
                      required
                      value={form.match_id}
                      style={{
                        ...inputStyle,
                        fontFamily: "monospace",
                        fontWeight: 700,
                        color: "#58a6ff",
                        background: "#161b22",
                        cursor: "not-allowed",
                        borderColor: "#30363d",
                      }}
                      placeholder="Auto-generated random Match ID"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Match Stage / Subtitle</label>
                    <input
                      type="text"
                      value={form.stage}
                      onChange={(e) => handleFieldChange("stage", e.target.value)}
                      style={inputStyle}
                      placeholder="e.g. 4th T20I"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Match Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => handleFieldChange("status", e.target.value as any)}
                      style={{
                        ...inputStyle,
                        color: form.status === "live" ? "#3fb950" : form.status === "upcoming" ? "#58a6ff" : "#8b949e",
                        fontWeight: 600,
                      }}
                    >
                      <option value="live">🟢 Live Now</option>
                      <option value="upcoming">🔵 Upcoming</option>
                      <option value="completed">⚪ Completed</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Match Date (YYYY-MM-DD) *</label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => handleFieldChange("date", e.target.value)}
                      style={inputStyle}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Start Time & Zone</label>
                    <input
                      type="text"
                      value={form.time}
                      onChange={(e) => handleFieldChange("time", e.target.value)}
                      style={inputStyle}
                      placeholder="e.g. 19:00 NZDT"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Season Year</label>
                    <input
                      type="number"
                      value={form.season}
                      onChange={(e) => handleFieldChange("season", e.target.value)}
                      style={inputStyle}
                      placeholder="e.g. 2026"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Max Overs / Innings</label>
                    <input
                      type="number"
                      value={form.total_overs}
                      onChange={(e) => handleFieldChange("total_overs", parseInt(e.target.value, 10))}
                      style={inputStyle}
                      placeholder="20"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: Teams & Venue */}
              <div style={{ marginBottom: 24, borderTop: "1px solid #21262d", paddingTop: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#58a6ff", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                  3. Teams & Venue
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 14 }}>
                  {/* Team 1 */}
                  <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#3fb950", marginBottom: 8 }}>TEAM 1 (HOME / BATTING 1ST)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Team Name *</label>
                        <input
                          type="text"
                          required
                          value={form.team1}
                          onChange={(e) => handleFieldChange("team1", e.target.value)}
                          style={inputStyle}
                          placeholder="e.g. New Zealand"
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Short Code</label>
                        <input
                          type="text"
                          value={form.team1_short}
                          onChange={(e) => handleFieldChange("team1_short", e.target.value.toUpperCase())}
                          style={inputStyle}
                          placeholder="e.g. NZ"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Team 2 */}
                  <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#58a6ff", marginBottom: 8 }}>TEAM 2 (AWAY / BOWLING 1ST)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Team Name *</label>
                        <input
                          type="text"
                          required
                          value={form.team2}
                          onChange={(e) => handleFieldChange("team2", e.target.value)}
                          style={inputStyle}
                          placeholder="e.g. India"
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Short Code</label>
                        <input
                          type="text"
                          value={form.team2_short}
                          onChange={(e) => handleFieldChange("team2_short", e.target.value.toUpperCase())}
                          style={inputStyle}
                          placeholder="e.g. IND"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>Stadium / Venue *</label>
                    <input
                      type="text"
                      required
                      value={form.venue}
                      onChange={(e) => handleFieldChange("venue", e.target.value)}
                      style={inputStyle}
                      placeholder="e.g. Eden Park"
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>City & Country</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => handleFieldChange("city", e.target.value)}
                      style={inputStyle}
                      placeholder="e.g. Auckland, New Zealand"
                    />
                  </div>
                </div>
              </div>

              {/* Feedback Alert */}
              {submitResult && (
                <div
                  style={{
                    padding: "14px 18px",
                    borderRadius: 8,
                    marginBottom: 20,
                    background: submitResult.success ? "rgba(46,160,67,0.15)" : "rgba(248,81,73,0.15)",
                    border: `1px solid ${submitResult.success ? "#2ea043" : "#f85149"}`,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  {submitResult.success ? (
                    <CheckCircle2 size={20} color="#3fb950" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <AlertCircle size={20} color="#f85149" style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: submitResult.success ? "#3fb950" : "#f85149" }}>
                      {submitResult.message}
                    </div>
                    {submitResult.matchId && (
                      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <Link
                          href={`/admin/core-engine/match-moments?matchId=${submitResult.matchId}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            background: "#238636",
                            color: "#fff",
                            padding: "6px 12px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            textDecoration: "none",
                          }}
                        >
                          ⚡ Launch Moments & Loops <ArrowRight size={13} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            const found = matches.find((m) => (m.match_id || m.id) === submitResult.matchId);
                            if (found) {
                              handleEditMatch(found);
                            } else {
                              handleEditMatch({ ...form, match_id: submitResult.matchId });
                            }
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "#21262d",
                            color: "#58a6ff",
                            border: "1px solid #30363d",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Edit3 size={13} /> Edit Match
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (submitResult.matchId) {
                              handleDeleteMatch(submitResult.matchId);
                            }
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "rgba(248,81,73,0.15)",
                            color: "#f85149",
                            border: "1px solid rgba(248,81,73,0.3)",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={13} /> Delete Match
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("directory")}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            background: "#21262d",
                            color: "#8b949e",
                            border: "1px solid #30363d",
                            borderRadius: 6,
                            padding: "6px 10px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <List size={13} /> View Directory
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    background: "#238636",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "12px 20px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    boxShadow: "0 2px 8px rgba(35,134,54,0.3)",
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Saving Match to Core Engine...
                    </>
                  ) : editingMatchId ? (
                    <>
                      <Edit3 size={16} /> Update Match Details
                    </>
                  ) : (
                    <>
                      <PlusCircle size={16} /> Save & Register Match in Core Engine
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live Match Preview Card */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Live Match Card Preview
            </div>

            <div
              style={{
                background: "linear-gradient(145deg, #161b22, #0d1117)",
                border: "1px solid #30363d",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  padding: "12px 16px",
                  background: "#21262d",
                  borderBottom: "1px solid #30363d",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase" }}>
                  {form.tournament || "TOURNAMENT"}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: form.status === "live" ? "rgba(46,160,67,0.2)" : "rgba(56,139,253,0.2)",
                    color: form.status === "live" ? "#3fb950" : "#58a6ff",
                    border: `1px solid ${form.status === "live" ? "#2ea043" : "#388bfd"}`,
                    textTransform: "uppercase",
                  }}
                >
                  ● {form.status}
                </span>
              </div>

              {/* Match Faceoff */}
              <div style={{ padding: "20px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#58a6ff", fontWeight: 600, marginBottom: 8 }}>
                  {form.stage || "Match"} • {form.format}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#f0f6fc" }}>
                      {form.team1_short || form.team1.slice(0, 3).toUpperCase() || "T1"}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b949e", maxWidth: 90, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {form.team1 || "Team 1"}
                    </div>
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 700, color: "#8b949e" }}>VS</div>

                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#f0f6fc" }}>
                      {form.team2_short || form.team2.slice(0, 3).toUpperCase() || "T2"}
                    </div>
                    <div style={{ fontSize: 11, color: "#8b949e", maxWidth: 90, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {form.team2 || "Team 2"}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div style={{ background: "#0d1117", borderRadius: 8, padding: 12, textAlign: "left", fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#8b949e" }}>
                    <MapPin size={13} color="#f0883e" />
                    <span>{form.venue || "Stadium Venue"}, {form.city || "City"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#8b949e" }}>
                    <Calendar size={13} color="#58a6ff" />
                    <span>{form.date || "YYYY-MM-DD"} {form.time ? `• ${form.time}` : ""}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#8b949e" }}>
                    <Shield size={13} color="#3fb950" />
                    <span>Format: {form.format} • {form.total_overs} Overs</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#8b949e" }}>
                    <Layers size={13} color="#a371f7" />
                    <span style={{ fontFamily: "monospace", color: "#a371f7" }}>
                      ID: {form.match_id || "TeamA-TeamB-Year-Format-Stage"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Instruction Callout */}
            <div style={{ marginTop: 20, background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f0f6fc", marginBottom: 6 }}>
                ⚙️ Core Engine Lifecycle
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: "#8b949e", lineHeight: 1.6 }}>
                <li>Admin creates the match in this form (generates Match ID).</li>
                <li>Match appears in the Matches Directory and becomes selectable in Live Operations.</li>
                <li>In Live Console, admin pushes ball-by-ball moments (Over 10.2, NZ 84/2).</li>
                <li>Admins resolve predictions post-match to credit +10 SXP.</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        /* Matches Directory Tab */
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#8b949e" }}>
              Total Matches in Database: <strong style={{ color: "#f0f6fc" }}>{matches.length}</strong>
            </div>
            <button
              onClick={fetchMatches}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "#21262d",
                color: "#c9d1d9",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={13} className={loadingMatches ? "animate-spin" : ""} /> Refresh List
            </button>
          </div>

          {loadingMatches ? (
            <div style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
              Loading matches directory...
            </div>
          ) : matches.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", background: "#161b22", borderRadius: 8, border: "1px solid #30363d" }}>
              <Trophy size={32} color="#8b949e" style={{ margin: "0 auto 12px" }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#f0f6fc" }}>No matches found yet</div>
              <p style={{ fontSize: 13, color: "#8b949e", margin: "6px 0 16px" }}>
                Switch to the "Create Match Form" tab to register your first live cricket match.
              </p>
              <button
                onClick={() => setActiveTab("create")}
                style={{
                  background: "#1f6feb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ＋ Create Match Now
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 16 }}>
              {matches.map((m) => (
                <div
                  key={m.id || m.match_id}
                  style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: 10,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div>
                    {/* Top bar */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#58a6ff", fontFamily: "monospace" }}>
                        {m.match_id || m.id}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: m.status === "live" ? "rgba(46,160,67,0.2)" : "rgba(56,139,253,0.15)",
                          color: m.status === "live" ? "#3fb950" : "#58a6ff",
                          border: `1px solid ${m.status === "live" ? "#2ea043" : "#388bfd"}`,
                          textTransform: "uppercase",
                        }}
                      >
                        {m.status || "upcoming"}
                      </span>
                    </div>

                    {/* Teams */}
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f6fc", marginBottom: 4 }}>
                      {m.team1 || m.home_team || "Team A"} vs {m.team2 || m.away_team || "Team B"}
                    </div>

                    <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 8 }}>
                      {m.tournament || "Cricket Series"} • {m.format || "T20"} {m.stage ? `• ${m.stage}` : ""}
                    </div>

                    <div style={{ fontSize: 11, color: "#6e7681", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div>📍 {m.venue || "Venue TBD"}{m.city ? `, ${m.city}` : ""}</div>
                      <div>📅 {m.date || m.start_date || "Date TBD"} {m.time ? `• ${m.time}` : ""}</div>
                    </div>
                  </div>

                  {/* Action Link to Live Moments, Edit, Delete */}
                  <div style={{ borderTop: "1px solid #21262d", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Link
                        href={`/admin/core-engine/match-moments?matchId=${m.match_id || m.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "#238636",
                          color: "#fff",
                          padding: "6px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          textDecoration: "none",
                          boxShadow: "0 2px 6px rgba(35,134,54,0.3)",
                        }}
                      >
                        <PlayCircle size={14} /> Launch Moments
                      </Link>

                      <button
                        onClick={() => handleEditMatch(m)}
                        title="Edit Match"
                        style={{
                          background: "#21262d",
                          color: "#58a6ff",
                          border: "1px solid #30363d",
                          borderRadius: 6,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Edit3 size={13} /> Edit
                      </button>

                      <button
                        onClick={() => handleDeleteMatch(m.match_id || m.id)}
                        title="Delete Match"
                        style={{
                          background: "rgba(248,81,73,0.15)",
                          color: "#f85149",
                          border: "1px solid rgba(248,81,73,0.3)",
                          borderRadius: 6,
                          padding: "6px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>

                    <span style={{ fontSize: 11, color: "#6e7681" }}>Season {m.season || "2026"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  padding: "8px 12px",
  color: "#e6edf3",
  fontSize: 13,
  outline: "none",
};
