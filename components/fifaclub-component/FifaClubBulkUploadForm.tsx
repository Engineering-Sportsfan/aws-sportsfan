// components/fifa-component/FifaClubBulkUploadForm.tsx
"use client";

import { useState, useCallback, useRef } from "react";

type Phase = "baseline" | "daily";

interface UploadError {
  row: number;
  club_id?: string;
  errors: { field: string; message: string }[];
}

interface DQWarning {
  rule: string;
  passed: boolean;
  message: string;
  affectedRows?: number;
}

interface ClubDelta {
  club_id: string;
  country: string;
  changes: { field: string; from: unknown; to: unknown; diff?: number }[];
  had_match_today: boolean;
}

interface UploadResult {
  success: boolean;
  dry_run?: boolean;
  phase?: Phase;
  match_day?: number;
  summary?: {
    total: number;
    processed?: number;
    updated?: number;
    valid?: number;
    invalid?: number;
    skipped?: number;
    delta_docs_written?: number;
    duration?: number;
  };
  deltas?: ClubDelta[];
  errors?: UploadError[];
  dqWarnings?: DQWarning[];
  error?: string;
}

export default function FifaClubBulkUploadForm() {
  const [phase, setPhase] = useState<Phase>("baseline");
  const [matchDay, setMatchDay] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tournament, setTournament] = useState("FIFA World Cup");
  const [dryRun, setDryRun] = useState(true);
  const [upsert, setUpsert] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const reset = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!file) return;
    if (phase === "daily" && !matchDay) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tournament", tournament);
    formData.append("phase", phase);
    formData.append("dry_run", String(dryRun));
    formData.append("upsert", String(upsert));
    if (phase === "daily") formData.append("match_day", matchDay);

    try {
      const res = await fetch("/api/fifa-clubs/bulk", { method: "POST", body: formData });
      const data: UploadResult = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Network error — check console" });
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!file && !loading && (phase === "baseline" || !!matchDay);

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <div style={s.dot} />
        <h2 style={s.title}>Club Campaign Bulk Upload</h2>
        <span style={s.badge}>CLUBS</span>
      </div>

      {/* Phase toggle */}
      <div style={s.field}>
        <label style={s.label}>UPLOAD PHASE</label>
        <div style={s.phaseRow}>
          {(["baseline", "daily"] as Phase[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPhase(p); setResult(null); }}
              style={{ ...s.phaseBtn, ...(phase === p ? s.phaseBtnActive : {}) }}
            >
              <span style={s.phaseIcon}>{p === "baseline" ? "🗂" : "📅"}</span>
              <div>
                <div style={s.phaseLabel}>{p === "baseline" ? "Baseline" : "Daily Update"}</div>
                <div style={s.phaseDesc}>
                  {p === "baseline"
                    ? "Pre-tournament · first upload"
                    : "Post-match · incremental stats"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Match day — daily only */}
      {phase === "daily" && (
        <div style={s.field}>
          <label style={s.label}>MATCH DAY *</label>
          <input
            type="number"
            min={1}
            value={matchDay}
            onChange={(e) => setMatchDay(e.target.value)}
            placeholder="e.g. 3"
            style={{ ...s.input, ...(!matchDay ? s.inputWarn : {}) }}
          />
          {!matchDay && <span style={s.warnMsg}>Required for daily updates</span>}
        </div>
      )}

      {/* Tournament */}
      <div style={s.field}>
        <label style={s.label}>TOURNAMENT</label>
        <select value={tournament} onChange={(e) => setTournament(e.target.value)} style={s.select}>
          <option value="FIFA World Cup">Men's FIFA World Cup</option>
          <option value="FIFA Women's World Cup">Women's FIFA World Cup</option>
        </select>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{ ...s.dropzone, ...(dragging ? s.dropzoneActive : {}), ...(file ? s.dropzoneFilled : {}) }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
        {file ? (
          <div style={s.fileInfo}>
            <span style={{ fontSize: 24 }}>📄</span>
            <div>
              <p style={s.fileName}>{file.name}</p>
              <p style={s.fileSize}>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); reset(); }} style={s.removeBtn}>✕</button>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8, color: "#f59e0b" }}>⬆</div>
            <p style={s.dropText}>Drop .xlsx or .csv here or click to browse</p>
            <p style={s.dropHint}>
              {phase === "baseline"
                ? "Initial campaign data · all clubs · no prior Firestore data needed"
                : "Updated cumulative stats · diffs against current Firestore state"}
            </p>
          </div>
        )}
      </div>

      {/* Options */}
      <div style={s.optionsRow}>
        <label style={s.checkboxLabel}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} style={s.checkbox} />
          <span>
            Dry run
            {phase === "daily" && dryRun ? " — shows delta preview before writing" : " — validate only, no writes"}
          </span>
        </label>
        {phase === "baseline" && (
          <label style={{ ...s.checkboxLabel, marginTop: 8 }}>
            <input type="checkbox" checked={upsert} onChange={(e) => setUpsert(e.target.checked)} style={s.checkbox} />
            <span>Overwrite if club already exists (upsert)</span>
          </label>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{ ...s.submitBtn, ...(!canSubmit ? s.submitBtnDisabled : {}) }}
      >
        {loading ? "⟳ Processing…"
          : dryRun
            ? phase === "daily" ? "🔍 Preview Changes" : "🔍 Validate File"
            : phase === "daily" ? `📅 Apply Day ${matchDay || "?"} Updates` : "🚀 Upload Baseline"}
      </button>

      {result && <UploadResultPanel result={result} />}
    </div>
  );
}

// ── Fix hints: field → what to check in the sheet ────────────────────────────
const FIX_HINTS: Record<string, string> = {
  club_id:          "Column B · Must be 2–3 uppercase letters (e.g. BRA, USA)",
  country:          "Column A · Full country name, cannot be blank",
  fifa_rank:        "Column C · Whole number ≥ 1, no decimals",
  world_cup_apps:   "Column D · Count of World Cup appearances, whole number ≥ 0",
  matches_played:   "Column E · Must equal Wins + Draws + Losses",
  wins:             "Column F · Whole number ≥ 0",
  draws:            "Column G · Whole number ≥ 0",
  losses:           "Column H · Whole number ≥ 0",
  goals_for:        "Column I (GF) · Whole number ≥ 0",
  goals_against:    "Column J (GA) · Whole number ≥ 0",
  goal_difference:  "Column K (GD) · Must equal Goals For − Goals Against",
  head_coach_2026:  "Column L · Coach name (can be blank)",
  captain_2026:     "Column M · Captain name (can be blank)",
  all_time_best_finish: "Column N · Free text describing best result (can be blank)",
};

// ── Friendly field labels for display ─────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  club_id: "Club ID", country: "Country", fifa_rank: "FIFA Rank",
  world_cup_apps: "World Cup Apps", matches_played: "Matches Played",
  wins: "Wins", draws: "Draws", losses: "Losses",
  goals_for: "Goals For (GF)", goals_against: "Goals Against (GA)",
  goal_difference: "Goal Difference", head_coach_2026: "2026 Head Coach",
  captain_2026: "2026 Captain", all_time_best_finish: "All-Time Best Finish",
};

function downloadErrorCSV(errors: UploadError[]) {
  const header = ["Excel Row", "Club ID", "Field", "Column", "Error", "How to Fix"];
  const rows = errors.flatMap((e) =>
    e.errors.map((err) => {
      const hint = FIX_HINTS[err.field] ?? "Check the value in this column";
      const col  = hint.split("·")[0].replace("Column", "").trim();
      return [
        e.row,
        e.club_id ?? "",
        FIELD_LABELS[err.field] ?? err.field,
        col,
        err.message,
        hint,
      ];
    })
  );
  const csv = [header, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `fifa_club_errors_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function UploadResultPanel({ result }: { result: UploadResult }) {
  const [showErrors, setShowErrors] = useState(true);
  const [showDeltas, setShowDeltas] = useState(true);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const ok = result.success && !result.error;
  const hasErrors = (result.errors?.length ?? 0) > 0;

  return (
    <div style={{ ...s.resultPanel, borderColor: hasErrors ? "#ef4444" : ok ? "#22c55e" : "#ef4444" }}>
      {/* ── Header ── */}
      <div style={s.resultHeader}>
        <span style={{ fontSize: 20, fontWeight: 700, color: hasErrors ? "#ef4444" : ok ? "#22c55e" : "#ef4444" }}>
          {hasErrors ? "✕" : ok ? "✓" : "✕"}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0" }}>
          {result.dry_run
            ? result.phase === "daily" ? "Delta Preview" : "Validation Result"
            : ok
              ? result.phase === "daily" ? `Day ${result.match_day} Applied` : "Baseline Uploaded"
              : "Failed"}
        </span>
        {result.phase && (
          <span style={s.phasePill}>
            {result.phase === "daily" ? `📅 Day ${result.match_day}` : "🗂 Baseline"}
          </span>
        )}
      </div>

      {result.error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{result.error}</p>}

      {/* ── Summary counters ── */}
      {result.summary && (() => {
        const invalid = result.summary.invalid ?? 0;
        const items: [string, string | number | undefined, string][] = [
          ["Total", result.summary.total, "#e8e8f0"],
          result.dry_run
            ? ["Valid", result.summary.valid, "#4ade80"]
            : result.phase === "daily"
              ? ["Updated", result.summary.updated, "#4ade80"]
              : ["Created", result.summary.processed, "#4ade80"],
          result.phase === "daily" && result.summary.delta_docs_written !== undefined
            ? ["Deltas", result.summary.delta_docs_written, "#a78bfa"]
            : ["", undefined, ""],
          result.dry_run
            ? ["Invalid", invalid, invalid > 0 ? "#ef4444" : "#4ade80"]
            : ["Skipped", result.summary.skipped, "#888"],
          result.summary.duration !== undefined
            ? ["Time", `${result.summary.duration}ms`, "#888"]
            : ["", undefined, ""],
        ].filter(([l]) => l !== "") as [string, string | number | undefined, string][];

        return (
          <div style={s.summaryGrid}>
            {items.map(([label, value, color]) => (
              <div key={label} style={s.summaryItem}>
                <span style={{ ...s.summaryValue, color }}>{value ?? "—"}</span>
                <span style={s.summaryLabel}>{label}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Error section — shown prominently when invalid > 0 ── */}
      {hasErrors && (
        <div style={s.errorSection}>
          {/* Error section header with download */}
          <div style={s.errorSectionHeader}>
            <div style={s.errorSectionTitle}>
              <span style={s.errorIcon}>✕</span>
              <span>{result.errors!.length} row{result.errors!.length !== 1 ? "s" : ""} need correction</span>
            </div>
            <div style={s.errorActions}>
              <button onClick={() => setShowErrors((v) => !v)} style={s.errorToggleBtn}>
                {showErrors ? "▲ Hide" : "▼ Show"}
              </button>
              <button onClick={() => downloadErrorCSV(result.errors!)} style={s.downloadBtn}>
                ⬇ Download Error Report (.csv)
              </button>
            </div>
          </div>

          {/* Instructions */}
          {showErrors && (
            <div style={s.fixInstructions}>
              <p style={s.fixTitle}>How to fix:</p>
              <p style={s.fixStep}>1. Download the error report CSV above</p>
              <p style={s.fixStep}>2. Open your Excel sheet alongside it</p>
              <p style={s.fixStep}>3. Go to the Excel row shown, correct the flagged column</p>
              <p style={s.fixStep}>4. Re-upload the corrected sheet</p>
            </div>
          )}

          {/* Per-row error cards */}
          {showErrors && (
            <div style={s.errorList}>
              {result.errors!.map((e) => (
                <div key={e.row} style={s.errorCard}>
                  {/* Card header — always visible */}
                  <div
                    style={s.errorCardHeader}
                    onClick={() => setExpandedRow(expandedRow === e.row ? null : e.row)}
                  >
                    <span style={s.excelRowBadge}>Excel row {e.row}</span>
                    {e.club_id
                      ? <span style={s.errorClubId}>{e.club_id}</span>
                      : <span style={s.errorClubIdMissing}>no club_id</span>}
                    <span style={s.errorFieldCount}>
                      {e.errors.length} field{e.errors.length !== 1 ? "s" : ""}
                    </span>
                    {/* Quick pill per broken field */}
                    <div style={s.errorPills}>
                      {e.errors.map((err, i) => (
                        <span key={i} style={s.errorPill}>
                          {FIELD_LABELS[err.field] ?? err.field}
                        </span>
                      ))}
                    </div>
                    <span style={s.expandChevron}>{expandedRow === e.row ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {expandedRow === e.row && (
                    <div style={s.errorCardBody}>
                      {e.errors.map((err, j) => (
                        <div key={j} style={s.errorDetailRow}>
                          <div style={s.errorDetailLeft}>
                            <span style={s.errorFieldLabel}>
                              {FIELD_LABELS[err.field] ?? err.field}
                            </span>
                            <span style={s.errorMessage}>{err.message}</span>
                          </div>
                          <div style={s.errorHint}>
                            <span style={s.errorHintIcon}>💡</span>
                            <span>{FIX_HINTS[err.field] ?? "Check this column's value"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Delta preview ── */}
      {result.deltas && result.deltas.length > 0 && (
        <div style={s.deltaSection}>
          <button onClick={() => setShowDeltas((v) => !v)} style={s.deltaToggle}>
            {showDeltas ? "▲ Hide" : "▼ Show"} delta preview ({result.deltas.length} clubs with changes)
          </button>
          {showDeltas && (
            <div style={{ marginTop: 10 }}>
              {result.deltas.map((d) => (
                <div key={d.club_id} style={s.deltaRow}>
                  <div style={s.deltaHeader}>
                    <span style={s.deltaClub}>{d.club_id}</span>
                    <span style={s.deltaCountry}>{d.country}</span>
                    {d.had_match_today && <span style={s.matchBadge}>⚽ played today</span>}
                  </div>
                  <div style={s.deltaFields}>
                    {d.changes.map((c, i) => (
                      <span key={i} style={s.deltaField}>
                        <span style={s.deltaFieldName}>{c.field}</span>
                        <span style={s.deltaFrom}>{String(c.from ?? "—")}</span>
                        <span style={s.deltaArrow}>→</span>
                        <span style={s.deltaTo}>{String(c.to ?? "—")}</span>
                        {c.diff !== undefined && (
                          <span style={{ ...s.deltaDiff, color: c.diff > 0 ? "#4ade80" : "#ef4444" }}>
                            ({c.diff > 0 ? "+" : ""}{c.diff})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DQ warnings ── */}
      {result.dqWarnings && result.dqWarnings.length > 0 && (
        <div style={s.dqSection}>
          <p style={s.dqTitle}>⚠ DQ Warnings ({result.dqWarnings.length})</p>
          {result.dqWarnings.map((w, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600, display: "block" }}>{w.rule}</span>
              <span style={{ fontSize: 12, color: "#a3a3a3" }}>{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  // ── Upload form ──────────────────────────────────────────────────────────────
  wrapper: { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 600, margin: "0 auto", border: "1px solid #1e1e2e" },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", boxShadow: "0 0 8px #f59e0b" },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  field: { marginBottom: 16 },
  label: { display: "block", fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 8, fontWeight: 700 },
  phaseRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  phaseBtn: { display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, cursor: "pointer", color: "#555", textAlign: "left" as const, fontFamily: "inherit" },
  phaseBtnActive: { borderColor: "#f59e0b", color: "#f59e0b", background: "#1a1200" },
  phaseIcon: { fontSize: 18, lineHeight: "1", marginTop: 1 },
  phaseLabel: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  phaseDesc: { fontSize: 10, color: "#555", lineHeight: 1.4 },
  input: { width: "100%", boxSizing: "border-box" as const, background: "#111118", border: "1px solid #222", borderRadius: 8, padding: "10px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" },
  inputWarn: { borderColor: "#f59e0b" },
  warnMsg: { fontSize: 11, color: "#f59e0b", marginTop: 4, display: "block" },
  select: { width: "100%", background: "#111118", border: "1px solid #222", borderRadius: 8, padding: "10px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", cursor: "pointer" },
  dropzone: { border: "2px dashed #222", borderRadius: 10, padding: "28px 24px", textAlign: "center" as const, cursor: "pointer", marginBottom: 16, background: "#0d0d15" },
  dropzoneActive: { borderColor: "#f59e0b", background: "#1a1200" },
  dropzoneFilled: { borderStyle: "solid", borderColor: "#333" },
  dropText: { fontSize: 13, color: "#888", margin: "0 0 4px" },
  dropHint: { fontSize: 11, color: "#444", margin: 0 },
  fileInfo: { display: "flex", alignItems: "center", gap: 12, textAlign: "left" as const },
  fileName: { fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "#e8e8f0" },
  fileSize: { fontSize: 11, color: "#666", margin: 0 },
  removeBtn: { marginLeft: "auto", background: "none", border: "1px solid #333", borderRadius: 6, color: "#666", padding: "4px 8px", cursor: "pointer", fontSize: 12 },
  optionsRow: { marginBottom: 20, display: "flex", flexDirection: "column" as const },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#888", cursor: "pointer" },
  checkbox: { accentColor: "#f59e0b", width: 14, height: 14, cursor: "pointer" },
  submitBtn: { width: "100%", padding: "13px", background: "#f59e0b", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 },
  submitBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  // ── Result panel ─────────────────────────────────────────────────────────────
  resultPanel: { marginTop: 24, border: "1px solid", borderRadius: 10, padding: 20, background: "#0d0d15" },
  resultHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  phasePill: { marginLeft: "auto", fontSize: 10, padding: "3px 8px", background: "#1a1200", border: "1px solid #3a2800", borderRadius: 4, color: "#f59e0b" },
  summaryGrid: { display: "flex", gap: 12, flexWrap: "wrap" as const, marginBottom: 16 },
  summaryItem: { display: "flex", flexDirection: "column" as const, alignItems: "center", background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, padding: "10px 14px", minWidth: 64 },
  summaryValue: { fontSize: 20, fontWeight: 700 },
  summaryLabel: { fontSize: 10, color: "#666", letterSpacing: 1, marginTop: 2 },
  // ── Error section ─────────────────────────────────────────────────────────────
  errorSection: { background: "#120808", border: "1px solid #3a1010", borderRadius: 10, padding: 16, marginBottom: 16 },
  errorSectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap" as const, gap: 8 },
  errorSectionTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#ef4444" },
  errorIcon: { fontSize: 16 },
  errorActions: { display: "flex", gap: 8 },
  errorToggleBtn: { background: "none", border: "1px solid #3a1010", borderRadius: 6, padding: "5px 12px", color: "#ef4444", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  downloadBtn: { background: "#ef4444", border: "none", borderRadius: 6, padding: "5px 12px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  fixInstructions: { background: "#0d0505", border: "1px solid #2a1010", borderRadius: 8, padding: "12px 14px", marginBottom: 12 },
  fixTitle: { fontSize: 11, fontWeight: 700, color: "#ef4444", margin: "0 0 6px", letterSpacing: 1 },
  fixStep: { fontSize: 11, color: "#888", margin: "0 0 3px" },
  errorList: { display: "flex", flexDirection: "column" as const, gap: 8 },
  errorCard: { border: "1px solid #2a1010", borderRadius: 8, overflow: "hidden" },
  errorCardHeader: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#160808", cursor: "pointer", flexWrap: "wrap" as const },
  excelRowBadge: { fontSize: 10, background: "#1e1010", padding: "2px 7px", borderRadius: 4, color: "#ef4444", border: "1px solid #3a1010", whiteSpace: "nowrap" as const },
  errorClubId: { fontSize: 12, fontWeight: 700, color: "#f59e0b" },
  errorClubIdMissing: { fontSize: 11, color: "#555", fontStyle: "italic" },
  errorFieldCount: { fontSize: 10, color: "#666" },
  errorPills: { display: "flex", flexWrap: "wrap" as const, gap: 4, flex: 1 },
  errorPill: { fontSize: 10, padding: "1px 6px", background: "#2a0808", border: "1px solid #3a1010", borderRadius: 3, color: "#ef4444" },
  expandChevron: { fontSize: 10, color: "#444", marginLeft: "auto" },
  errorCardBody: { background: "#0d0505", padding: "12px 14px", display: "flex", flexDirection: "column" as const, gap: 10, borderTop: "1px solid #2a1010" },
  errorDetailRow: { display: "flex", flexDirection: "column" as const, gap: 4 },
  errorDetailLeft: { display: "flex", gap: 10, alignItems: "baseline" },
  errorFieldLabel: { fontSize: 11, fontWeight: 700, color: "#ef4444", minWidth: 120 },
  errorMessage: { fontSize: 12, color: "#e8e8f0" },
  errorHint: { display: "flex", alignItems: "flex-start", gap: 6, background: "#0a0a06", border: "1px solid #2a2a10", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#888" },
  errorHintIcon: { flexShrink: 0 },
  // ── Delta preview ─────────────────────────────────────────────────────────────
  deltaSection: { marginBottom: 14 },
  deltaToggle: { background: "none", border: "1px solid #2a2a1a", borderRadius: 6, padding: "6px 12px", color: "#f59e0b", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  deltaRow: { background: "#111108", border: "1px solid #2a2a0a", borderRadius: 8, padding: "10px 12px", marginBottom: 8 },
  deltaHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  deltaClub: { fontSize: 13, fontWeight: 700, color: "#f59e0b" },
  deltaCountry: { fontSize: 12, color: "#888" },
  matchBadge: { marginLeft: "auto", fontSize: 10, color: "#4ade80", background: "#0d1a0d", padding: "2px 7px", borderRadius: 4, border: "1px solid #1a3a1a" },
  deltaFields: { display: "flex", flexWrap: "wrap" as const, gap: 6 },
  deltaField: { display: "flex", alignItems: "center", gap: 4, background: "#0a0a06", border: "1px solid #222", borderRadius: 4, padding: "3px 7px", fontSize: 11 },
  deltaFieldName: { color: "#666", marginRight: 2 },
  deltaFrom: { color: "#ef4444" },
  deltaArrow: { color: "#444" },
  deltaTo: { color: "#4ade80" },
  deltaDiff: { fontWeight: 700, marginLeft: 2 },
  // ── DQ warnings ──────────────────────────────────────────────────────────────
  dqSection: { background: "#1a1400", borderRadius: 8, padding: "12px 14px", marginBottom: 12 },
  dqTitle: { fontSize: 12, color: "#fbbf24", fontWeight: 600, margin: "0 0 8px" },
};