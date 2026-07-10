"use client";

import { useState } from "react";
import FifaBulkUploadForm from "@/components/fifa-component/FifaBulkUploadForm";
import FifaManualMatchForm from "@/components/fifa-component/FifaManualMatchForm";
import FifaManualPlayerStatsForm from "@/components/fifa-component/FifaManualPlayerStatsForm";

type Tab = "bulk" | "match" | "player";

const TABS: { id: Tab; label: string; dot: string; desc: string }[] = [
  { id: "bulk", label: "Bulk Upload", dot: "#22c55e", desc: "Upload FIFA matches or player stats" },
  { id: "match", label: "Add Match", dot: "#38bdf8", desc: "Manual single FIFA match entry" },
  { id: "player", label: "Add Player Stats", dot: "#f472b6", desc: "Manual single FIFA player stats entry" },
];

export default function FifaAdminUploadPanel() {
  const [tab, setTab] = useState<Tab>("bulk");

  return (
    <div style={styles.outer}>
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>
          <span style={styles.crest}>⚽</span>
          <div>
            <h1 style={styles.h1}>FIFA Data Admin</h1>
            <p style={styles.subtitle}>Firebase ingestion panel for FIFA data</p>
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
              ...(tab === item.id ? { ...styles.tabActive, borderColor: item.dot, color: item.dot } : {}),
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
        {tab === "bulk" && <FifaBulkUploadForm />}
        {tab === "match" && <FifaManualMatchForm />}
        {tab === "player" && <FifaManualPlayerStatsForm />}
      </div>

      <div style={styles.footer}>
        <span>Collections: fifaMatches · fifaPlayerStats</span>
        <span>Sources: FIFA World Cup match and player stats uploads</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    maxWidth: 900,
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
    maxWidth: 900,
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
  content: { maxWidth: 900, margin: "0 auto" },
  footer: {
    maxWidth: 900,
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
