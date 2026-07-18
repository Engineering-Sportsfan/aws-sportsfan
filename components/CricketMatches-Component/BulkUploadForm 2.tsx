// components/forms/BulkUploadForm.tsx
"use client";

import { useState, useCallback, useRef } from "react";

type UploadType = "matches" | "playerStats";

interface UploadError {
  row: number;
  player?: string;
  match_id?: string;
  errors: { field: string; message: string }[];
}

interface DQWarning {
  rule: string;
  passed: boolean;
  message: string;
  affectedRows?: number;
}

interface UploadResult {
  success: boolean;
  dry_run?: boolean;
  summary?: {
    total: number;
    processed?: number;
    valid?: number;
    invalid?: number;
    skipped?: number;
    innings_written?: number;
    duration?: number;
  };
  errors?: UploadError[];
  dqWarnings?: DQWarning[];
  error?: string;
}

export default function BulkUploadForm() {
  const [uploadType, setUploadType] = useState<UploadType>("matches");
  const [file, setFile] = useState<File | null>(null);
  const [tournament, setTournament] = useState("womens_ipl");
  const [dryRun, setDryRun] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endpoint =
    uploadType === "matches" ? "/api/matches/bulk" : "/api/player-stats/bulk";

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }, []);

  const handleSubmit = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tournament", tournament);
    formData.append("dry_run", String(dryRun));

    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data: UploadResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setResult({ success: false, error: "Network error — check console" });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const accepted = uploadType === "playerStats" ? ".xlsx,.csv" : ".xlsx";

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerDot} />
        <h2 style={styles.title}>Bulk Data Upload</h2>
        <span style={styles.badge}>
          {uploadType === "matches" ? "MATCHES" : "PLAYER STATS"}
        </span>
      </div>

      {/* Type toggle */}
      <div style={styles.toggleRow}>
        {(["matches", "playerStats"] as UploadType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setUploadType(t); reset(); }}
            style={{
              ...styles.toggleBtn,
              ...(uploadType === t ? styles.toggleBtnActive : {}),
            }}
          >
            {t === "matches" ? "⚡ Matches" : "📊 Player Stats"}
          </button>
        ))}
      </div>

      {/* Tournament selector */}
      <div style={styles.field}>
        <label style={styles.label}>Tournament</label>
        <select
          value={tournament}
          onChange={(e) => setTournament(e.target.value)}
          style={styles.select}
        >
          <option value="mens_ipl">Men&apos;s IPL</option>
          <option value="womens_ipl">Women&apos;s IPL (WPL)</option>
          <option value="womens_wc">Women&apos;s World Cup</option>
          <option value="womens_t20i">Women&apos;s T20I</option>
          <option value="womens_odi">Women&apos;s ODI</option>
          <option value="womens_test">Women&apos;s Test</option>
        </select>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        style={{
          ...styles.dropzone,
          ...(dragging ? styles.dropzoneActive : {}),
          ...(file ? styles.dropzoneFilled : {}),
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accepted}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ display: "none" }}
        />
        {file ? (
          <div style={styles.fileInfo}>
            <span style={styles.fileIcon}>📄</span>
            <div>
              <p style={styles.fileName}>{file.name}</p>
              <p style={styles.fileSize}>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              style={styles.removeBtn}
            >
              ✕
            </button>
          </div>
        ) : (
          <div style={styles.dropContent}>
            <div style={styles.dropIcon}>⬆</div>
            <p style={styles.dropText}>Drop {accepted} file here or click to browse</p>
            <p style={styles.dropHint}>
              {uploadType === "matches"
                ? "Include an innings sheet tab for auto-ingestion"
                : "WPL .csv or any T20I .xlsx"}
            </p>
          </div>
        )}
      </div>

      {/* Options */}
      <div style={styles.optionsRow}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            style={styles.checkbox}
          />
          <span>Dry run (validate only, no writes)</span>
        </label>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        style={{
          ...styles.submitBtn,
          ...((!file || loading) ? styles.submitBtnDisabled : {}),
        }}
      >
        {loading ? (
          <span style={styles.spinner}>⟳ Processing…</span>
        ) : dryRun ? (
          "🔍 Validate File"
        ) : (
          "🚀 Upload to Firebase"
        )}
      </button>

      {/* Result */}
      {result && <UploadResultPanel result={result} />}
    </div>
  );
}

// ─── Result panel ─────────────────────────────────────────────────────────────
function UploadResultPanel({ result }: { result: UploadResult }) {
  const [showErrors, setShowErrors] = useState(false);
  const ok = result.success && !result.error;

  return (
    <div style={{ ...styles.resultPanel, borderColor: ok ? "#22c55e" : "#ef4444" }}>
      <div style={styles.resultHeader}>
        <span style={{ ...styles.resultStatus, color: ok ? "#22c55e" : "#ef4444" }}>
          {ok ? "✓" : "✕"}
        </span>
        <span style={styles.resultTitle}>
          {result.dry_run ? "Validation Result" : ok ? "Upload Complete" : "Upload Failed"}
        </span>
      </div>

      {result.error && <p style={styles.errorText}>{result.error}</p>}

      {result.summary && (
        <div style={styles.summaryGrid}>
          {[
            ["Total", result.summary.total],
            result.dry_run
              ? ["Valid", result.summary.valid]
              : ["Written", result.summary.processed],
            result.dry_run
              ? ["Invalid", result.summary.invalid]
              : ["Skipped", result.summary.skipped],
            result.summary.innings_written !== undefined
              ? ["Innings", result.summary.innings_written]
              : null,
            result.summary.duration !== undefined
              ? ["Time", `${result.summary.duration}ms`]
              : null,
          ]
            .filter((item): item is [string, string | number | undefined] => item !== null)
            .map(([label, value]) => (
              <div key={label} style={styles.summaryItem}>
                <span style={styles.summaryValue}>{value ?? "—"}</span>
                <span style={styles.summaryLabel}>{label}</span>
              </div>
            ))}
        </div>
      )}

      {result.dqWarnings && result.dqWarnings.length > 0 && (
        <div style={styles.dqSection}>
          <p style={styles.dqTitle}>⚠ DQ Warnings ({result.dqWarnings.length})</p>
          {result.dqWarnings.map((w, i) => (
            <div key={i} style={styles.dqItem}>
              <span style={styles.dqRule}>{w.rule}</span>
              <span style={styles.dqMsg}>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {result.errors && result.errors.length > 0 && (
        <div style={styles.errorsSection}>
          <button
            onClick={() => setShowErrors((v) => !v)}
            style={styles.errorsToggle}
          >
            {showErrors ? "▲ Hide" : "▼ Show"} {result.errors.length} row errors
          </button>
          {showErrors && (
            <div style={styles.errorsList}>
              {result.errors.slice(0, 100).map((e, i) => (
                <div key={i} style={styles.errorItem}>
                  <span style={styles.errorRow}>Row {e.row}</span>
                  {e.player && <span style={styles.errorPlayer}>{e.player}</span>}
                  {e.match_id && <span style={styles.errorPlayer}>{e.match_id}</span>}
                  <div style={styles.errorDetails}>
                    {e.errors.map((err, j) => (
                      <span key={j} style={styles.errorDetail}>
                        {err.field}: {err.message}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {result.errors.length > 100 && (
                <p style={styles.moreErrors}>…and {result.errors.length - 100} more</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: "'DM Mono', 'Courier New', monospace",
    background: "#0a0a0f",
    color: "#e8e8f0",
    borderRadius: 12,
    padding: "28px 32px",
    maxWidth: 600,
    margin: "0 auto",
    border: "1px solid #1e1e2e",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#4ade80",
    boxShadow: "0 0 8px #4ade80",
  },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: {
    marginLeft: "auto",
    fontSize: 10,
    letterSpacing: 2,
    padding: "3px 8px",
    border: "1px solid #333",
    borderRadius: 4,
    color: "#888",
  },
  toggleRow: { display: "flex", gap: 8, marginBottom: 20 },
  toggleBtn: {
    flex: 1,
    padding: "9px 0",
    background: "#111118",
    border: "1px solid #222",
    borderRadius: 8,
    color: "#666",
    fontSize: 13,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  toggleBtnActive: {
    background: "#1a1a2e",
    borderColor: "#4ade80",
    color: "#4ade80",
  },
  field: { marginBottom: 16 },
  label: { display: "block", fontSize: 11, letterSpacing: 1, color: "#666", marginBottom: 6 },
  select: {
    width: "100%",
    background: "#111118",
    border: "1px solid #222",
    borderRadius: 8,
    padding: "10px 12px",
    color: "#e8e8f0",
    fontSize: 13,
    outline: "none",
    cursor: "pointer",
  },
  dropzone: {
    border: "2px dashed #222",
    borderRadius: 10,
    padding: "32px 24px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    marginBottom: 16,
    background: "#0d0d15",
  },
  dropzoneActive: { borderColor: "#4ade80", background: "#0d1a0d" },
  dropzoneFilled: { borderStyle: "solid", borderColor: "#333" },
  dropContent: {},
  dropIcon: { fontSize: 28, marginBottom: 8, color: "#444" },
  dropText: { fontSize: 13, color: "#888", margin: "0 0 4px" },
  dropHint: { fontSize: 11, color: "#444", margin: 0 },
  fileInfo: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    textAlign: "left",
  },
  fileIcon: { fontSize: 24 },
  fileName: { fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "#e8e8f0" },
  fileSize: { fontSize: 11, color: "#666", margin: 0 },
  removeBtn: {
    marginLeft: "auto",
    background: "none",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#666",
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 12,
  },
  optionsRow: { marginBottom: 20 },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "#888",
    cursor: "pointer",
  },
  checkbox: { accentColor: "#4ade80", width: 14, height: 14, cursor: "pointer" },
  submitBtn: {
    width: "100%",
    padding: "13px",
    background: "#4ade80",
    border: "none",
    borderRadius: 8,
    color: "#0a0a0f",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: 0.5,
    transition: "opacity 0.15s",
  },
  submitBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  spinner: { display: "inline-block" },
  resultPanel: {
    marginTop: 24,
    border: "1px solid",
    borderRadius: 10,
    padding: 20,
    background: "#0d0d15",
  },
  resultHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  resultStatus: { fontSize: 20, fontWeight: 700 },
  resultTitle: { fontSize: 14, fontWeight: 600, color: "#e8e8f0" },
  errorText: { color: "#ef4444", fontSize: 13, margin: "0 0 12px" },
  summaryGrid: { display: "flex", gap: 16, flexWrap: "wrap" as const, marginBottom: 16 },
  summaryItem: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    background: "#111118",
    border: "1px solid #1e1e2e",
    borderRadius: 8,
    padding: "10px 16px",
    minWidth: 72,
  },
  summaryValue: { fontSize: 22, fontWeight: 700, color: "#4ade80" },
  summaryLabel: { fontSize: 10, color: "#666", letterSpacing: 1, marginTop: 2 },
  dqSection: { background: "#1a1400", borderRadius: 8, padding: "12px 14px", marginBottom: 12 },
  dqTitle: { fontSize: 12, color: "#fbbf24", fontWeight: 600, margin: "0 0 8px" },
  dqItem: { display: "flex", flexDirection: "column" as const, marginBottom: 6 },
  dqRule: { fontSize: 11, color: "#f59e0b", fontWeight: 600 },
  dqMsg: { fontSize: 12, color: "#a3a3a3", marginTop: 2 },
  errorsSection: {},
  errorsToggle: {
    background: "none",
    border: "1px solid #333",
    borderRadius: 6,
    padding: "6px 12px",
    color: "#ef4444",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    marginBottom: 10,
  },
  errorsList: { maxHeight: 300, overflowY: "auto" as const },
  errorItem: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "flex-start",
    gap: 6,
    padding: "8px 0",
    borderBottom: "1px solid #1a1a1a",
  },
  errorRow: { fontSize: 11, background: "#1e1e2e", padding: "2px 6px", borderRadius: 4, color: "#888" },
  errorPlayer: { fontSize: 11, color: "#a3a3a3", fontWeight: 600 },
  errorDetails: { width: "100%", display: "flex", flexDirection: "column" as const, gap: 2 },
  errorDetail: { fontSize: 11, color: "#ef4444" },
  moreErrors: { fontSize: 11, color: "#666", marginTop: 8 },
};