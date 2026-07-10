// components/forms/FifaBulkUploadForm.tsx
"use client";

import { useState, useCallback, useRef } from "react";

type UploadType = "matches" | "player_stats";

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
    updated?: number;
    valid?: number;
    invalid?: number;
    skipped?: number;
    duration?: number;
  };
  errors?: UploadError[];
  dqWarnings?: DQWarning[];
  error?: string;
}

export default function FifaBulkUploadForm() {
  const [uploadType, setUploadType] = useState<UploadType>("matches");
  const [file, setFile] = useState<File | null>(null);
  const [tournament, setTournament] = useState("FIFA World Cup");
  const [dryRun, setDryRun] = useState(true);
  const [upsert, setUpsert] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endpoint = uploadType === "matches"
    ? "/api/fifa-matches/bulk"
    : "/api/fifa-player-stats/bulk";

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
    if (uploadType === "matches") formData.append("upsert", String(upsert));

    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data: UploadResult = await res.json();
      setResult(data);
    } catch {
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

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <div style={s.dot} />
        <h2 style={s.title}>FIFA Bulk Upload</h2>
        <span style={s.badge}>{uploadType === "matches" ? "MATCHES" : "PLAYER STATS"}</span>
      </div>

      {/* Type toggle */}
      <div style={s.toggleRow}>
        {(["matches", "player_stats"] as UploadType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setUploadType(t); reset(); }}
            style={{ ...s.toggleBtn, ...(uploadType === t ? s.toggleBtnActive : {}) }}
          >
            {t === "matches" ? "⚽ Matches" : "📊 Player Stats"}
          </button>
        ))}
      </div>

      {/* Tournament */}
      <div style={s.field}>
        <label style={s.label}>Tournament</label>
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
            <div style={{ fontSize: 28, marginBottom: 8, color: "#444" }}>⬆</div>
            <p style={s.dropText}>Drop .xlsx or .csv here or click to browse</p>
          </div>
        )}
      </div>

      {/* Options */}
      <div style={s.optionsRow}>
        <label style={s.checkboxLabel}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} style={s.checkbox} />
          <span>Dry run (validate only, no writes)</span>
        </label>
        {uploadType === "matches" && (
          <label style={{ ...s.checkboxLabel, marginTop: 8 }}>
            <input type="checkbox" checked={upsert} onChange={(e) => setUpsert(e.target.checked)} style={s.checkbox} />
            <span>Update if match already exists (upsert)</span>
          </label>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!file || loading}
        style={{ ...s.submitBtn, ...(!file || loading ? s.submitBtnDisabled : {}) }}
      >
        {loading ? "⟳ Processing…" : dryRun ? "🔍 Validate File" : "🚀 Upload to Firebase"}
      </button>

      {result && <UploadResultPanel result={result} />}
    </div>
  );
}

function UploadResultPanel({ result }: { result: UploadResult }) {
  const [showErrors, setShowErrors] = useState(false);
  const ok = result.success && !result.error;

  return (
    <div style={{ ...s.resultPanel, borderColor: ok ? "#22c55e" : "#ef4444" }}>
      <div style={s.resultHeader}>
        <span style={{ fontSize: 20, fontWeight: 700, color: ok ? "#22c55e" : "#ef4444" }}>{ok ? "✓" : "✕"}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {result.dry_run ? "Validation Result" : ok ? "Upload Complete" : "Upload Failed"}
        </span>
      </div>

      {result.error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{result.error}</p>}

      {result.summary && (() => {
        const summaryItems = [
          ["Total", result.summary.total],
          result.dry_run ? ["Valid", result.summary.valid] : ["Created", result.summary.processed],
          result.summary.updated !== undefined ? ["Updated", result.summary.updated] : null,
          result.dry_run ? ["Invalid", result.summary.invalid] : ["Skipped", result.summary.skipped],
          result.summary.duration !== undefined ? ["Time", `${result.summary.duration}ms`] : null,
        ].filter((item): item is [string, string | number | undefined] => item !== null);

        return (
          <div style={s.summaryGrid}>
            {summaryItems.map(([label, value]) => (
              <div key={label} style={s.summaryItem}>
                <span style={s.summaryValue}>{value ?? "—"}</span>
                <span style={s.summaryLabel}>{label}</span>
              </div>
            ))}
          </div>
        );
      })()}

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

      {result.errors && result.errors.length > 0 && (
        <div>
          <button onClick={() => setShowErrors((v) => !v)} style={s.errorsToggle}>
            {showErrors ? "▲ Hide" : "▼ Show"} {result.errors.length} row errors
          </button>
          {showErrors && (
            <div style={{ maxHeight: 300, overflowY: "auto" as const }}>
              {result.errors.slice(0, 100).map((e, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
                  <span style={{ fontSize: 11, background: "#1e1e2e", padding: "2px 6px", borderRadius: 4, color: "#888", marginRight: 6 }}>
                    Row {e.row}
                  </span>
                  {(e.player || e.match_id) && (
                    <span style={{ fontSize: 11, color: "#a3a3a3", fontWeight: 600 }}>{e.player ?? e.match_id}</span>
                  )}
                  <div style={{ marginTop: 4 }}>
                    {e.errors.map((err, j) => (
                      <span key={j} style={{ fontSize: 11, color: "#ef4444", display: "block" }}>
                        {err.field}: {err.message}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {result.errors.length > 100 && (
                <p style={{ fontSize: 11, color: "#666", marginTop: 8 }}>…and {result.errors.length - 100} more</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 600, margin: "0 auto", border: "1px solid #1e1e2e" },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  toggleRow: { display: "flex", gap: 8, marginBottom: 20 },
  toggleBtn: { flex: 1, padding: "9px 0", background: "#111118", border: "1px solid #222", borderRadius: 8, color: "#666", fontSize: 13, cursor: "pointer" },
  toggleBtnActive: { background: "#1a1a2e", borderColor: "#4ade80", color: "#4ade80" },
  field: { marginBottom: 16 },
  label: { display: "block", fontSize: 11, letterSpacing: 1, color: "#666", marginBottom: 6 },
  select: { width: "100%", background: "#111118", border: "1px solid #222", borderRadius: 8, padding: "10px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", cursor: "pointer" },
  dropzone: { border: "2px dashed #222", borderRadius: 10, padding: "32px 24px", textAlign: "center" as const, cursor: "pointer", marginBottom: 16, background: "#0d0d15" },
  dropzoneActive: { borderColor: "#4ade80", background: "#0d1a0d" },
  dropzoneFilled: { borderStyle: "solid", borderColor: "#333" },
  dropText: { fontSize: 13, color: "#888", margin: 0 },
  fileInfo: { display: "flex", alignItems: "center", gap: 12, textAlign: "left" as const },
  fileName: { fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "#e8e8f0" },
  fileSize: { fontSize: 11, color: "#666", margin: 0 },
  removeBtn: { marginLeft: "auto", background: "none", border: "1px solid #333", borderRadius: 6, color: "#666", padding: "4px 8px", cursor: "pointer", fontSize: 12 },
  optionsRow: { marginBottom: 20, display: "flex", flexDirection: "column" as const },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#888", cursor: "pointer" },
  checkbox: { accentColor: "#4ade80", width: 14, height: 14, cursor: "pointer" },
  submitBtn: { width: "100%", padding: "13px", background: "#4ade80", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 },
  submitBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  resultPanel: { marginTop: 24, border: "1px solid", borderRadius: 10, padding: 20, background: "#0d0d15" },
  resultHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  summaryGrid: { display: "flex", gap: 16, flexWrap: "wrap" as const, marginBottom: 16 },
  summaryItem: { display: "flex", flexDirection: "column" as const, alignItems: "center", background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, padding: "10px 16px", minWidth: 72 },
  summaryValue: { fontSize: 22, fontWeight: 700, color: "#4ade80" },
  summaryLabel: { fontSize: 10, color: "#666", letterSpacing: 1, marginTop: 2 },
  dqSection: { background: "#1a1400", borderRadius: 8, padding: "12px 14px", marginBottom: 12 },
  dqTitle: { fontSize: 12, color: "#fbbf24", fontWeight: 600, margin: "0 0 8px" },
  errorsToggle: { background: "none", border: "1px solid #333", borderRadius: 6, padding: "6px 12px", color: "#ef4444", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 },
};