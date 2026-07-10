"use client";
// components/wt20-component/WT20AdminPanel.tsx

import { useState } from "react";
import WT20BulkUploadForm from "./WT20BulkUploadForm";
import WT20ManualClubForm from "./WT20ManualClubForm";
import WT20DeltaLogPanel from "./WT20DeltaLogPanel";

type Tab = "bulk" | "daily" | "manual" | "deltas";

const TABS: { id: Tab; label: string; dot: string; desc: string }[] = [
  { id: "bulk",   label: "Baseline Upload", dot: "#f59e0b", desc: "Pre-tournament · all 8 clubs" },
  { id: "daily",  label: "Match Day Update", dot: "#4ade80", desc: "Post-match · 2 clubs only" },
  { id: "manual", label: "Club Entry",       dot: "#38bdf8", desc: "Create or patch a single club" },
  { id: "deltas", label: "Delta Log",        dot: "#a78bfa", desc: "Per-club changes by match day" },
];

export default function WT20AdminPanel() {
  const [tab, setTab] = useState<Tab>("bulk");

  return (
    <div style={styles.outer}>
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>
          <span style={styles.crest}>🏏</span>
          <div>
            <h1 style={styles.h1}>WT20 WC Club Admin</h1>
            <p style={styles.subtitle}>ICC Women's T20 World Cup · Firebase ingestion panel · wt20Clubs</p>
          </div>
        </div>
        <div style={styles.statusPill}>
          <span style={styles.statusDot} />
          Firebase connected
        </div>
      </div>

      <div style={styles.tabs}>
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              ...styles.tab,
              ...(tab === item.id
                ? { ...styles.tabActive, borderColor: item.dot, color: item.dot }
                : {}),
            }}
          >
            <span style={{ ...styles.tabDot, background: tab === item.id ? item.dot : "#333" }} />
            <div>
              <div style={styles.tabLabel}>{item.label}</div>
              <div style={styles.tabDesc}>{item.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {tab === "bulk"   && <WT20BulkUploadForm mode="baseline" />}
        {tab === "daily"  && <WT20BulkUploadForm mode="daily" />}
        {tab === "manual" && <WT20ManualClubForm />}
        {tab === "deltas" && <WT20DeltaLogPanel />}
      </div>

      <div style={styles.footer}>
        <span>Collections: wt20Clubs · wt20DeltaLogs · wt20IngestLogs</span>
        <span>Phases: baseline (pre-tournament) · daily (post-match, 2 clubs per day)</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outer:       { minHeight: "100vh", background: "#06060d", fontFamily: "'DM Mono','Courier New',monospace", padding: "32px 24px" },
  panelHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", maxWidth: 960, margin: "0 auto 32px" },
  panelTitle:  { display: "flex", alignItems: "center", gap: 14 },
  crest:       { fontSize: 36 },
  h1:          { fontSize: 22, fontWeight: 800, color: "#e8e8f0", margin: 0, letterSpacing: -1 },
  subtitle:    { fontSize: 12, color: "#444", margin: "3px 0 0", letterSpacing: 0.5 },
  statusPill:  { display: "flex", alignItems: "center", gap: 6, background: "#0d1a0d", border: "1px solid #1a3a1a", borderRadius: 20, padding: "6px 14px", fontSize: 11, color: "#4ade80" },
  statusDot:   { width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" },
  tabs:        { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, maxWidth: 960, margin: "0 auto 28px" },
  tab:         { display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", background: "#0d0d15", border: "1px solid #1a1a2a", borderRadius: 10, cursor: "pointer", color: "#666", textAlign: "left" as const, fontFamily: "inherit" },
  tabActive:   { background: "#0d0d1a" },
  tabDot:      { width: 8, height: 8, borderRadius: "50%", marginTop: 3, flexShrink: 0 },
  tabLabel:    { fontSize: 13, fontWeight: 700, marginBottom: 3 },
  tabDesc:     { fontSize: 10, color: "#555", lineHeight: 1.4 },
  content:     { maxWidth: 960, margin: "0 auto" },
  footer:      { maxWidth: 960, margin: "32px auto 0", display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 10, color: "#333", letterSpacing: 0.5, borderTop: "1px solid #111", paddingTop: 16 },
};