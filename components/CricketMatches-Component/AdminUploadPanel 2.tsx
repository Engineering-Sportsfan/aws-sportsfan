// components/forms/AdminUploadPanel.tsx
// Main admin panel — tabbed interface combining all upload/entry forms
"use client";

import { useState } from "react";
import BulkUploadForm from "./BulkUploadForm";
import ManualMatchForm from "./ManualMatchForm";
import ManualPlayerStatsForm from "./ManualPlayerStatsForm";

type Tab = "bulk" | "match" | "player";

const TABS: { id: Tab; label: string; dot: string; desc: string }[] = [
  { id: "bulk", label: "Bulk Upload", dot: "#4ade80", desc: "Upload Excel / CSV — matches + player stats" },
  { id: "match", label: "Add Match", dot: "#60a5fa", desc: "Manual single match entry" },
  { id: "player", label: "Add Player Stats", dot: "#f472b6", desc: "Manual single player entry" },
];

export default function AdminUploadPanel() {
  const [tab, setTab] = useState<Tab>("bulk");

  return (
    <div style={p.outer}>
      {/* Panel header */}
      <div style={p.panelHeader}>
        <div style={p.panelTitle}>
          <span style={p.crest}>🏏</span>
          <div>
            <h1 style={p.h1}>Cricket Data Admin</h1>
            <p style={p.subtitle}>Firebase ingestion panel</p>
          </div>
        </div>
        <div style={p.statusPill}>
          <span style={p.statusDot} />
          Firebase connected
        </div>
      </div>

      {/* Tabs */}
      <div style={p.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...p.tab, ...(tab === t.id ? { ...p.tabActive, borderColor: t.dot, color: t.dot } : {}) }}
          >
            <span style={{ ...p.tabDot, background: tab === t.id ? t.dot : "#333" }} />
            <div>
              <div style={p.tabLabel}>{t.label}</div>
              <div style={p.tabDesc}>{t.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={p.content}>
        {tab === "bulk" && <BulkUploadForm />}
        {tab === "match" && <ManualMatchForm />}
        {tab === "player" && <ManualPlayerStatsForm />}
      </div>

      {/* Footer */}
      <div style={p.footer}>
        <span>Collections: matches · playerStats · records · schedule</span>
        <span>Tournaments: mens_ipl · womens_ipl · womens_wc · womens_t20i · womens_odi · womens_test</span>
      </div>
    </div>
  );
}

const p: Record<string, React.CSSProperties> = {
  outer: {
    minHeight: "100vh",
    background: "#06060d",
    fontFamily: "'DM Mono','Courier New',monospace",
    padding: "32px 24px",
  },
  panelHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    maxWidth: 720,
    margin: "0 auto 32px",
  },
  panelTitle: { display: "flex", alignItems: "center", gap: 14 },
  crest: { fontSize: 36 },
  h1: { fontSize: 22, fontWeight: 800, color: "#e8e8f0", margin: 0, letterSpacing: -1 },
  subtitle: { fontSize: 12, color: "#444", margin: "3px 0 0", letterSpacing: 1 },
  statusPill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#0d1a0d",
    border: "1px solid #1a3a1a",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 11,
    color: "#4ade80",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 6px #4ade80",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
    maxWidth: 720,
    margin: "0 auto 28px",
  },
  tab: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "14px 16px",
    background: "#0d0d15",
    border: "1px solid #1a1a2a",
    borderRadius: 10,
    cursor: "pointer",
    color: "#666",
    textAlign: "left" as const,
    transition: "all 0.15s",
    fontFamily: "inherit",
  },
  tabActive: {
    background: "#0d0d1a",
  },
  tabDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    marginTop: 3,
    flexShrink: 0,
    transition: "background 0.15s",
  },
  tabLabel: { fontSize: 13, fontWeight: 700, marginBottom: 3 },
  tabDesc: { fontSize: 10, color: "#555", lineHeight: 1.4 },
  content: { maxWidth: 720, margin: "0 auto" },
  footer: {
    maxWidth: 720,
    margin: "32px auto 0",
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    fontSize: 10,
    color: "#333",
    letterSpacing: 0.5,
    borderTop: "1px solid #111",
    paddingTop: 16,
  },
};