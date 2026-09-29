"use client";

import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Trophy,
  Save,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Globe,
  Flag,
  Activity,
  Zap,
} from "lucide-react";
import { MedalTallyData } from "@/lib/medalTallyService";

const COUNTRY_PRESETS = [
  { country: "India", code: "IN", flag: "🇮🇳", label: "INDIA TODAY", flagUrl: "https://flagcdn.com/w80/in.png" },
  { country: "United States", code: "US", flag: "🇺🇸", label: "USA TODAY", flagUrl: "https://flagcdn.com/w80/us.png" },
  { country: "China", code: "CN", flag: "🇨🇳", label: "CHINA TODAY", flagUrl: "https://flagcdn.com/w80/cn.png" },
  { country: "Great Britain", code: "GB", flag: "🇬🇧", label: "GB TODAY", flagUrl: "https://flagcdn.com/w80/gb.png" },
  { country: "Australia", code: "AU", flag: "🇦🇺", label: "AUSTRALIA TODAY", flagUrl: "https://flagcdn.com/w80/au.png" },
  { country: "Japan", code: "JP", flag: "🇯🇵", label: "JAPAN TODAY", flagUrl: "https://flagcdn.com/w80/jp.png" },
  { country: "France", code: "FR", flag: "🇫🇷", label: "FRANCE TODAY", flagUrl: "https://flagcdn.com/w80/fr.png" },
  { country: "Germany", code: "DE", flag: "🇩🇪", label: "GERMANY TODAY", flagUrl: "https://flagcdn.com/w80/de.png" },
];

export default function MedalTallyManagementPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [envInfo, setEnvInfo] = useState<{ env: string; tableName: string }>({
    env: "prod",
    tableName: "SportsData",
  });

  const [form, setForm] = useState<MedalTallyData>({
    id: "current",
    country: "India",
    countryCode: "IN",
    flag: "🇮🇳",
    flagUrl: "https://flagcdn.com/w80/in.png",
    label: "INDIA TODAY",
    events: 18,
    eventsLabel: "18 Events",
    gold: 7,
    silver: 5,
    bronze: 11,
    total: 23,
    worldRank: 3,
    rankLabel: "India Rank",
    competition: "Asian Games",
    active: true,
    updatedAt: Date.now(),
    updatedAtIST: "Just now",
  });

  useEffect(() => {
    fetchMedalTally();
  }, []);

  async function fetchMedalTally() {
    setLoading(true);
    try {
      const res = await axios.get("/api/medal-tally");
      if (res.data?.success && res.data?.data) {
        setForm(res.data.data);
        setEnvInfo({
          env: res.data.env || "prod",
          tableName: res.data.tableName || res.data.data.tableName || "SportsData",
        });
      }
    } catch (err: any) {
      console.warn("Failed to fetch medal tally data:", err?.message || err);
      showToast("⚠️ Notice: Loading default state");
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }

  const calculatedTotal = useMemo(() => {
    return (Number(form.gold) || 0) + (Number(form.silver) || 0) + (Number(form.bronze) || 0);
  }, [form.gold, form.silver, form.bronze]);

  function handlePresetSelect(preset: typeof COUNTRY_PRESETS[0]) {
    setForm((prev) => ({
      ...prev,
      country: preset.country,
      countryCode: preset.code,
      flag: preset.flag,
      flagUrl: preset.flagUrl,
      label: preset.label,
    }));
    showToast(`Applied preset for ${preset.country} ${preset.flag}`);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        total: calculatedTotal,
        adminEmail: "admin@sportsfan360.com",
      };

      const res = await axios.post("/api/medal-tally", payload);
      if (res.data?.success) {
        setForm(res.data.data);
        if (res.data.tableName) {
          setEnvInfo((prev) => ({
            ...prev,
            tableName: res.data.tableName,
            env: res.data.env || prev.env,
          }));
        }
        showToast(`✅ Saved successfully to ${res.data.tableName || envInfo.tableName}!`);
      } else {
        throw new Error(res.data?.error || "Save failed");
      }
    } catch (err: any) {
      console.error("Save error:", err);
      showToast(`❌ Error saving: ${err?.message || "Check network/backend"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px 60px", color: "#e6edf3" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#161b22",
            border: "1px solid #388bfd",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            padding: "12px 18px",
            borderRadius: 8,
            color: "#e6edf3",
            fontSize: 13,
            fontWeight: 600,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
          borderBottom: "1px solid #21282f",
          paddingBottom: 18,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "linear-gradient(135deg, #e36209, #d29922)",
                display: "grid",
                placeItems: "center",
                fontSize: 18,
              }}
            >
              🏅
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#ffffff" }}>
                Medal Tally Management
              </h1>
              <p style={{ fontSize: 12, color: "#8b949e", margin: "2px 0 0" }}>
                Update live flag, events, gold, silver, bronze & world rank for the home screen
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons & Environment Badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Target Environment Badge */}
          {/* <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "6px 12px",
              borderRadius: 6,
              background:
                envInfo.env === "dev"
                  ? "rgba(56,139,253,0.15)"
                  : envInfo.env === "release"
                    ? "rgba(163,113,247,0.15)"
                    : "rgba(46,160,67,0.15)",
              color:
                envInfo.env === "dev"
                  ? "#58a6ff"
                  : envInfo.env === "release"
                    ? "#d2a8ff"
                    : "#3fb950",
              border: `1px solid ${envInfo.env === "dev"
                  ? "rgba(56,139,253,0.3)"
                  : envInfo.env === "release"
                    ? "rgba(163,113,247,0.3)"
                    : "rgba(46,160,67,0.3)"
                }`,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>●</span>
            <span>ENV: {envInfo.env.toUpperCase()} ({envInfo.tableName})</span>
          </div> */}

          <button
            type="button"
            onClick={fetchMedalTally}
            disabled={loading}
            style={{
              background: "#21262d",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#c9d1d9",
              padding: "7px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <RotateCcw size={14} className={loading ? "animate-spin" : ""} /> Refresh
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: "#1f6feb",
              border: "1px solid #388bfd",
              borderRadius: 6,
              color: "#ffffff",
              padding: "7px 18px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 10px rgba(31, 111, 235, 0.4)",
            }}
          >
            <Save size={14} /> {saving ? "Saving…" : "Save Medal Tally"}
          </button>
        </div>
      </div>

      {/* ── LIVE PREVIEW BANNER (Matching client UI) ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: ".06em" }}>
            📺 Live Client Preview (Home Screen Pill)
          </span>
          <span
            style={{
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 12,
              background: "rgba(46,160,67,0.15)",
              color: "#3fb950",
              fontWeight: 700,
              border: "1px solid rgba(46,160,67,0.3)",
            }}
          >
            ● LIVE PREVIEW
          </span>
        </div>

        {/* The Exact Medal Tally Bar */}
        <div
          style={{
            background: "linear-gradient(90deg, #0e0725 0%, #150936 50%, #0d0620 100%)",
            border: "1px solid rgba(137, 87, 229, 0.35)",
            borderRadius: 16,
            padding: "12px 20px",
            boxShadow: "0 10px 30px rgba(10, 4, 30, 0.7), inset 0 1px 0 rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            position: "relative",
            overflow: "hidden",
          }}
        >
         

          {/* Left: Flag + INDIA TODAY + 18 Events */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Flag container */}
            <div
              style={{
                width: 44,
                height: 30,
                borderRadius: 4,
                overflow: "hidden",
                boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#000",
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              {form.flagUrl ? (
                <img
                  src={form.flagUrl}
                  alt={form.country}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <span>{form.flag || "🇮🇳"}</span>
              )}
            </div>

            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: ".08em",
                  color: "#6b7280",
                  textTransform: "uppercase",
                }}
              >
                {form.label || "INDIA TODAY"}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#ffffff", lineHeight: 1.1 }}>
                {form.events}{" "}
                <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
                  Events
                </span>
              </div>
            </div>
          </div>

          {/* Vertical Divider */}
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.12)" }} />

          {/* Medals Tally Trio */}
          <div style={{ display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
            {/* Gold */}
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontSize: 18 }}>🥇</span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#f59e0b",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {form.gold}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginTop: 1 }}>Gold</div>
            </div>

            {/* Silver */}
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontSize: 18 }}>🥈</span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#e2e8f0",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {form.silver}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginTop: 1 }}>Silver</div>
            </div>

            {/* Bronze */}
            <div style={{ textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontSize: 18 }}>🥉</span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    color: "#d97706",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {form.bronze}
                </span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginTop: 1 }}>Bronze</div>
            </div>
          </div>

          {/* Vertical Divider */}
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.12)" }} />

          {/* Right: Rank Banner */}
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                color: "#10b981",
                letterSpacing: "-.02em",
                lineHeight: 1,
                textShadow: "0 0 16px rgba(16, 185, 129, 0.4)",
              }}
            >
              #{String(form.worldRank).replace("#", "")}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                textTransform: "capitalize",
                marginTop: 2,
              }}
            >
              {form.rankLabel || "India Rank"}
            </div>
          </div>
        </div>
      </div>

      {/* ── EDITING FORM SECTION ── */}
      <div
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 12,
          padding: 24,
          marginBottom: 28,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#ffffff" }}>
              Medal Tally Configuration
            </h2>
            <p style={{ fontSize: 12, color: "#8b949e", margin: "2px 0 0" }}>
              Changes will save to <code style={{ color: "#58a6ff" }}>{envInfo.tableName}</code> in the current environment ({envInfo.env})
            </p>
          </div>
        </div>

        {/* Quick Country Presets */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#8b949e", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            ⚡ Quick Country Presets:
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {COUNTRY_PRESETS.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => handlePresetSelect(p)}
                style={{
                  background: form.countryCode === p.code ? "#388bfd" : "#21262d",
                  color: form.countryCode === p.code ? "#ffffff" : "#c9d1d9",
                  border: "1px solid #30363d",
                  borderRadius: 20,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all .15s",
                }}
              >
                <span>{p.flag}</span>
                <span>{p.country}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          {/* Flag Emoji */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              Flag Emoji / Icon
            </label>
            <input
              type="text"
              value={form.flag}
              onChange={(e) => setForm({ ...form, flag: e.target.value })}
              placeholder="e.g. 🇮🇳"
              style={{
                width: "100%",
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#e6edf3",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Flag Image URL */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              Flag Image URL (Optional)
            </label>
            <input
              type="text"
              value={form.flagUrl || ""}
              onChange={(e) => setForm({ ...form, flagUrl: e.target.value })}
              placeholder="https://flagcdn.com/w80/in.png"
              style={{
                width: "100%",
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#e6edf3",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Country Name */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              Country Name
            </label>
            <input
              type="text"
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="e.g. India"
              style={{
                width: "100%",
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#e6edf3",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Banner Subtitle Label */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              Banner Subtitle Label
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value.toUpperCase() })}
              placeholder="e.g. INDIA TODAY"
              style={{
                width: "100%",
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#e6edf3",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Events Count */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              Events Count
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, events: Math.max(0, p.events - 1) }))}
                style={{
                  width: 36,
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                -
              </button>
              <input
                type="number"
                value={form.events}
                onChange={(e) => setForm({ ...form, events: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                style={{
                  flex: 1,
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "8px 12px",
                  color: "#e6edf3",
                  fontSize: 14,
                  fontWeight: 700,
                  outline: "none",
                  textAlign: "center",
                }}
              />
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, events: p.events + 1 }))}
                style={{
                  width: 36,
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* World / Country Rank */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              World / Country Rank
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, worldRank: Math.max(1, (Number(p.worldRank) || 1) - 1) }))}
                style={{
                  width: 36,
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                -
              </button>
              <input
                type="text"
                value={form.worldRank}
                onChange={(e) => setForm({ ...form, worldRank: e.target.value })}
                placeholder="e.g. 3"
                style={{
                  flex: 1,
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "8px 12px",
                  color: "#10b981",
                  fontSize: 14,
                  fontWeight: 800,
                  outline: "none",
                  textAlign: "center",
                }}
              />
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, worldRank: (Number(p.worldRank) || 0) + 1 }))}
                style={{
                  width: 36,
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 16,
                  cursor: "pointer",
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Rank Subtitle Label */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              Rank Subtitle Label
            </label>
            <input
              type="text"
              value={form.rankLabel || ""}
              onChange={(e) => setForm({ ...form, rankLabel: e.target.value })}
              placeholder="e.g. India Rank or World Rank"
              style={{
                width: "100%",
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#e6edf3",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>

          {/* Competition / Tournament */}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c9d1d9", marginBottom: 6 }}>
              Competition / Tournament
            </label>
            <input
              type="text"
              value={form.competition || ""}
              onChange={(e) => setForm({ ...form, competition: e.target.value })}
              placeholder="e.g. Asian Games 2026"
              style={{
                width: "100%",
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "8px 12px",
                color: "#e6edf3",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* ── MEDALS STEPPER CONTROLS ── */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #21282f" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14 }}>
            🏅 Medals Count Configuration
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {/* Gold Card */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(0,0,0,0.5))",
                border: "1px solid rgba(245, 158, 11, 0.35)",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>🥇</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", textTransform: "uppercase" }}>
                Gold Medals
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#fbbf24", margin: "8px 0" }}>
                {form.gold}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, gold: Math.max(0, p.gold - 1) }))}
                  style={{ width: 34, height: 34, borderRadius: 6, background: "#21262d", color: "#fff", border: "1px solid #30363d", fontSize: 16, cursor: "pointer" }}
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, gold: p.gold + 1 }))}
                  style={{ width: 34, height: 34, borderRadius: 6, background: "#f59e0b", color: "#000", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, gold: p.gold + 5 }))}
                  style={{ padding: "0 10px", height: 34, borderRadius: 6, background: "#21262d", color: "#fbbf24", border: "1px solid #30363d", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  +5
                </button>
              </div>
            </div>

            {/* Silver Card */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(226, 232, 240, 0.12), rgba(0,0,0,0.5))",
                border: "1px solid rgba(226, 232, 240, 0.35)",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>🥈</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", textTransform: "uppercase" }}>
                Silver Medals
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#f8fafc", margin: "8px 0" }}>
                {form.silver}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, silver: Math.max(0, p.silver - 1) }))}
                  style={{ width: 34, height: 34, borderRadius: 6, background: "#21262d", color: "#fff", border: "1px solid #30363d", fontSize: 16, cursor: "pointer" }}
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, silver: p.silver + 1 }))}
                  style={{ width: 34, height: 34, borderRadius: 6, background: "#cbd5e1", color: "#000", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, silver: p.silver + 5 }))}
                  style={{ padding: "0 10px", height: 34, borderRadius: 6, background: "#21262d", color: "#cbd5e1", border: "1px solid #30363d", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  +5
                </button>
              </div>
            </div>

            {/* Bronze Card */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(217, 119, 6, 0.12), rgba(0,0,0,0.5))",
                border: "1px solid rgba(217, 119, 6, 0.35)",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>🥉</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#d97706", textTransform: "uppercase" }}>
                Bronze Medals
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#f59e0b", margin: "8px 0" }}>
                {form.bronze}
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, bronze: Math.max(0, p.bronze - 1) }))}
                  style={{ width: 34, height: 34, borderRadius: 6, background: "#21262d", color: "#fff", border: "1px solid #30363d", fontSize: 16, cursor: "pointer" }}
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, bronze: p.bronze + 1 }))}
                  style={{ width: 34, height: 34, borderRadius: 6, background: "#d97706", color: "#000", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, bronze: p.bronze + 5 }))}
                  style={{ padding: "0 10px", height: 34, borderRadius: 6, background: "#21262d", color: "#fbbf24", border: "1px solid #30363d", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                >
                  +5
                </button>
              </div>
            </div>

            {/* Total Medals (Auto-Computed) */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(56, 139, 253, 0.12), rgba(0,0,0,0.5))",
                border: "1px solid rgba(56, 139, 253, 0.35)",
                borderRadius: 10,
                padding: 16,
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 4 }}>🏆</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#58a6ff", textTransform: "uppercase" }}>
                Total Medals
              </div>
              <div style={{ fontSize: 38, fontWeight: 900, color: "#ffffff", margin: "6px 0" }}>
                {calculatedTotal}
              </div>
              <div style={{ fontSize: 11, color: "#8b949e" }}>
                {form.gold}G + {form.silver}S + {form.bronze}B
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions Inside Card */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, paddingTop: 18, borderTop: "1px solid #21282f", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              id="isActiveCheck"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              style={{ cursor: "pointer", width: 16, height: 16 }}
            />
            <label htmlFor="isActiveCheck" style={{ fontSize: 13, color: "#c9d1d9", cursor: "pointer", fontWeight: 600 }}>
              Display actively on Home Screen / Score Tally Bar
            </label>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={fetchMedalTally}
              style={{
                background: "#21262d",
                color: "#c9d1d9",
                border: "1px solid #30363d",
                borderRadius: 6,
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reset
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                background: "#1f6feb",
                color: "#ffffff",
                border: "1px solid #388bfd",
                borderRadius: 6,
                padding: "8px 24px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Save size={14} /> {saving ? "Saving…" : "Save Medal Tally"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
