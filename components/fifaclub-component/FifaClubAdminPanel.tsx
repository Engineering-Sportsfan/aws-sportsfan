// components/fifa-component/FifaClubAdminPanel.tsx
"use client";

import { useState, useEffect } from "react";
import FifaClubBulkUploadForm from "./FifaClubBulkUploadForm";
import FifaManualClubForm from "./FifaManualClubForm";

type Tab = "bulk" | "manual" | "deltas";

const TABS: { id: Tab; label: string; dot: string; desc: string }[] = [
  { id: "bulk",   label: "Bulk Upload",  dot: "#f59e0b", desc: "Baseline or daily incremental upload" },
  { id: "manual", label: "Club Entry",   dot: "#38bdf8", desc: "Create club or patch single-club stats" },
  { id: "deltas", label: "Delta Log",    dot: "#a78bfa", desc: "Per-club changes by match day" },
];

export default function FifaClubAdminPanel() {
  const [tab, setTab] = useState<Tab>("bulk");

  return (
    <div style={styles.outer}>
      <div style={styles.panelHeader}>
        <div style={styles.panelTitle}>
          <span style={styles.crest}>🏆</span>
          <div>
            <h1 style={styles.h1}>FIFA Club Campaign Admin</h1>
            <p style={styles.subtitle}>Firebase ingestion panel · fifaClubs collection</p>
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
        {tab === "bulk"   && <FifaClubBulkUploadForm />}
        {tab === "manual" && <FifaManualClubForm />}
        {tab === "deltas" && <DeltaLogPanel />}
      </div>

      <div style={styles.footer}>
        <span>Collections: fifaClubs · fifaClubDeltaLogs · ingestLogs</span>
        <span>Phases: baseline (pre-tournament) · daily (post-match incremental)</span>
      </div>
    </div>
  );
}

// ─── Delta Log Panel ──────────────────────────────────────────────────────────
interface FieldChange { field: string; from: unknown; to: unknown; diff?: number; }
interface DeltaDoc {
  id: string;
  club_id: string;
  country: string;
  match_day: number;
  had_match_today: boolean;
  source_file: string;
  ingested_at: { seconds: number } | null;
  changes: FieldChange[];
}

function DeltaLogPanel() {
  const [matchDay, setMatchDay] = useState("");
  const [clubId, setClubId] = useState("");
  const [deltas, setDeltas] = useState<DeltaDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDeltas = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (matchDay) params.set("match_day", matchDay);
    if (clubId)   params.set("club_id", clubId.toUpperCase());
    try {
      const res = await fetch(`/api/fifa-clubs/deltas?${params}`);
      const data = await res.json();
      if (data.success) setDeltas(data.data);
      else setError(data.error ?? "Failed to load deltas");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDeltas(); }, []);

  return (
    <div style={d.wrapper}>
      <div style={d.header}>
        <div style={d.dot} />
        <h2 style={d.title}>Delta Log</h2>
        <span style={d.badge}>fifaClubDeltaLogs</span>
      </div>

      {/* Filters */}
      <div style={d.filterRow}>
        <div style={d.filterField}>
          <label style={d.label}>MATCH DAY</label>
          <input
            type="number"
            min={1}
            value={matchDay}
            onChange={(e) => setMatchDay(e.target.value)}
            placeholder="All days"
            style={d.input}
          />
        </div>
        <div style={d.filterField}>
          <label style={d.label}>CLUB ID</label>
          <input
            value={clubId}
            onChange={(e) => setClubId(e.target.value.toUpperCase())}
            placeholder="All clubs"
            style={d.input}
          />
        </div>
        <button onClick={fetchDeltas} disabled={loading} style={d.filterBtn}>
          {loading ? "⟳" : "Filter"}
        </button>
      </div>

      {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 16px" }}>{error}</p>}

      {deltas.length === 0 && !loading && (
        <p style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
          No delta logs found. Upload a daily update to generate entries.
        </p>
      )}

      {deltas.map((doc) => (
        <div key={doc.id} style={d.card}>
          <div
            style={d.cardHeader}
            onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
          >
            <span style={d.clubCode}>{doc.club_id}</span>
            <span style={d.country}>{doc.country}</span>
            <span style={d.dayBadge}>Day {doc.match_day}</span>
            {doc.had_match_today && <span style={d.playedBadge}>⚽ played</span>}
            <span style={d.changeCount}>{doc.changes.length} fields changed</span>
            <span style={d.chevron}>{expandedId === doc.id ? "▲" : "▼"}</span>
          </div>

          {expandedId === doc.id && (
            <div style={d.cardBody}>
              <div style={d.metaRow}>
                <span style={d.meta}>source: {doc.source_file}</span>
                {doc.ingested_at && (
                  <span style={d.meta}>
                    ingested: {new Date(doc.ingested_at.seconds * 1000).toLocaleString()}
                  </span>
                )}
              </div>
              <div style={d.changesGrid}>
                {doc.changes.map((c, i) => (
                  <div key={i} style={d.changeItem}>
                    <span style={d.fieldName}>{c.field}</span>
                    <span style={d.fromVal}>{String(c.from ?? "—")}</span>
                    <span style={d.arrow}>→</span>
                    <span style={d.toVal}>{String(c.to ?? "—")}</span>
                    {c.diff !== undefined && (
                      <span style={{ ...d.diff, color: c.diff > 0 ? "#4ade80" : "#ef4444" }}>
                        ({c.diff > 0 ? "+" : ""}{c.diff})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const d: Record<string, React.CSSProperties> = {
  wrapper: { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 700, margin: "0 auto", border: "1px solid #1e1e2e" },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 8px #a78bfa" },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  filterRow: { display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20 },
  filterField: { flex: 1 },
  label: { display: "block", fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 6, fontWeight: 700 },
  input: { width: "100%", boxSizing: "border-box" as const, background: "#111118", border: "1px solid #222", borderRadius: 7, padding: "9px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" },
  filterBtn: { padding: "9px 20px", background: "#a78bfa", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" as const },
  card: { border: "1px solid #1e1e2e", borderRadius: 9, marginBottom: 10, overflow: "hidden" },
  cardHeader: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#0d0d15", cursor: "pointer" },
  clubCode: { fontSize: 13, fontWeight: 700, color: "#a78bfa", minWidth: 36 },
  country: { fontSize: 12, color: "#888" },
  dayBadge: { fontSize: 10, padding: "2px 7px", background: "#1a1200", border: "1px solid #3a2800", borderRadius: 4, color: "#f59e0b" },
  playedBadge: { fontSize: 10, color: "#4ade80", background: "#0d1a0d", padding: "2px 7px", borderRadius: 4, border: "1px solid #1a3a1a" },
  changeCount: { marginLeft: "auto", fontSize: 11, color: "#555" },
  chevron: { fontSize: 10, color: "#444", marginLeft: 6 },
  cardBody: { padding: "14px 16px", background: "#080810", borderTop: "1px solid #1a1a2a" },
  metaRow: { display: "flex", gap: 16, marginBottom: 12 },
  meta: { fontSize: 10, color: "#444" },
  changesGrid: { display: "flex", flexDirection: "column" as const, gap: 6 },
  changeItem: { display: "flex", alignItems: "center", gap: 8, fontSize: 12 },
  fieldName: { color: "#666", minWidth: 120 },
  fromVal: { color: "#ef4444" },
  arrow: { color: "#333" },
  toVal: { color: "#4ade80" },
  diff: { fontWeight: 700 },
};

const styles: Record<string, React.CSSProperties> = {
  outer: { minHeight: "100vh", background: "#06060d", fontFamily: "'DM Mono','Courier New',monospace", padding: "32px 24px" },
  panelHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", maxWidth: 900, margin: "0 auto 32px" },
  panelTitle: { display: "flex", alignItems: "center", gap: 14 },
  crest: { fontSize: 36 },
  h1: { fontSize: 22, fontWeight: 800, color: "#e8e8f0", margin: 0, letterSpacing: -1 },
  subtitle: { fontSize: 12, color: "#444", margin: "3px 0 0", letterSpacing: 1 },
  statusPill: { display: "flex", alignItems: "center", gap: 6, background: "#0d1a0d", border: "1px solid #1a3a1a", borderRadius: 20, padding: "6px 14px", fontSize: 11, color: "#4ade80" },
  statusDot: { width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" },
  tabs: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, maxWidth: 900, margin: "0 auto 28px" },
  tab: { display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px", background: "#0d0d15", border: "1px solid #1a1a2a", borderRadius: 10, cursor: "pointer", color: "#666", textAlign: "left" as const, fontFamily: "inherit" },
  tabActive: { background: "#0d0d1a" },
  tabDot: { width: 8, height: 8, borderRadius: "50%", marginTop: 3, flexShrink: 0 },
  tabLabel: { fontSize: 13, fontWeight: 700, marginBottom: 3 },
  tabDesc: { fontSize: 10, color: "#555", lineHeight: 1.4 },
  content: { maxWidth: 900, margin: "0 auto" },
  footer: { maxWidth: 900, margin: "32px auto 0", display: "flex", flexDirection: "column" as const, gap: 4, fontSize: 10, color: "#333", letterSpacing: 0.5, borderTop: "1px solid #111", paddingTop: 16 },
};