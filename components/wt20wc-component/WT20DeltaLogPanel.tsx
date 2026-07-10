"use client";
// components/wt20-component/WT20DeltaLogPanel.tsx

import { useState, useEffect } from "react";

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

const FIELD_LABELS: Record<string, string> = {
  icc_ranking: "ICC Ranking", rating_points: "Rating Points",
  matches: "Matches", won: "Won", lost: "Lost",
  tied_so: "Tied (SO)", no_result: "NR", win_pct: "Win %",
  recent_form: "Recent Form", current_captain: "Captain",
  head_coach: "Head Coach",
};

export default function WT20DeltaLogPanel() {
  const [matchDay, setMatchDay]   = useState("");
  const [clubId, setClubId]       = useState("");
  const [deltas, setDeltas]       = useState<DeltaDoc[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDeltas = async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (matchDay) params.set("match_day", matchDay);
    if (clubId)   params.set("club_id", clubId.toUpperCase());
    try {
      const res  = await fetch(`/api/wt20-clubs/deltas?${params}`);
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
        <span style={d.badge}>wt20DeltaLogs</span>
      </div>

      <div style={d.filterRow}>
        <div style={d.filterField}>
          <label style={d.label}>MATCH DAY</label>
          <input type="number" min={1} value={matchDay} onChange={(e) => setMatchDay(e.target.value)}
            placeholder="All days" style={d.input} />
        </div>
        <div style={d.filterField}>
          <label style={d.label}>CLUB ID</label>
          <input value={clubId} onChange={(e) => setClubId(e.target.value.toUpperCase())}
            placeholder="e.g. AUS-W" style={d.input} />
        </div>
        <button onClick={fetchDeltas} disabled={loading} style={d.filterBtn}>
          {loading ? "⟳" : "Filter"}
        </button>
      </div>

      {error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 16px" }}>{error}</p>}

      {deltas.length === 0 && !loading && (
        <p style={{ color: "#444", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
          No delta logs found. Run a match day update to generate entries.
        </p>
      )}

      {deltas.map((doc) => (
        <div key={doc.id} style={d.card}>
          <div style={d.cardHeader} onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}>
            <span style={d.clubCode}>{doc.club_id}</span>
            <span style={d.country}>{doc.country}</span>
            <span style={d.dayBadge}>Day {doc.match_day}</span>
            {doc.had_match_today && <span style={d.playedBadge}>🏏 played</span>}
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
                    <span style={d.fieldName}>{FIELD_LABELS[c.field] ?? c.field}</span>
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
  wrapper:     { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 700, margin: "0 auto", border: "1px solid #1e1e2e" },
  header:      { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  dot:         { width: 10, height: 10, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 8px #a78bfa" },
  title:       { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge:       { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  filterRow:   { display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20 },
  filterField: { flex: 1 },
  label:       { display: "block", fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 6, fontWeight: 700 },
  input:       { width: "100%", boxSizing: "border-box" as const, background: "#111118", border: "1px solid #222", borderRadius: 7, padding: "9px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" },
  filterBtn:   { padding: "9px 20px", background: "#a78bfa", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" as const },
  card:        { border: "1px solid #1e1e2e", borderRadius: 9, marginBottom: 10, overflow: "hidden" },
  cardHeader:  { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#0d0d15", cursor: "pointer", flexWrap: "wrap" as const },
  clubCode:    { fontSize: 13, fontWeight: 700, color: "#4ade80", minWidth: 56 },
  country:     { fontSize: 12, color: "#888" },
  dayBadge:    { fontSize: 10, padding: "2px 7px", background: "#1a1200", border: "1px solid #3a2800", borderRadius: 4, color: "#f59e0b" },
  playedBadge: { fontSize: 10, color: "#4ade80", background: "#0d1a0d", padding: "2px 7px", borderRadius: 4, border: "1px solid #1a3a1a" },
  changeCount: { marginLeft: "auto", fontSize: 11, color: "#555" },
  chevron:     { fontSize: 10, color: "#444", marginLeft: 6 },
  cardBody:    { padding: "14px 16px", background: "#080810", borderTop: "1px solid #1a1a2a" },
  metaRow:     { display: "flex", gap: 16, marginBottom: 12 },
  meta:        { fontSize: 10, color: "#444" },
  changesGrid: { display: "flex", flexDirection: "column" as const, gap: 6 },
  changeItem:  { display: "flex", alignItems: "center", gap: 8, fontSize: 12 },
  fieldName:   { color: "#666", minWidth: 120 },
  fromVal:     { color: "#ef4444" },
  arrow:       { color: "#333" },
  toVal:       { color: "#4ade80" },
  diff:        { fontWeight: 700 },
};