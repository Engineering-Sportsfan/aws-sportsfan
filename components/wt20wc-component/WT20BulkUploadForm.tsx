"use client";
// components/wt20-component/WT20BulkUploadForm.tsx

import { useState, useCallback, useRef } from "react";

type FormMode = "baseline" | "daily";

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
    had_match_today: boolean;
    changes: { field: string; from: unknown; to: unknown; diff?: number }[];
}

interface UploadResult {
    success: boolean;
    dry_run?: boolean;
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

const FIELD_LABELS: Record<string, string> = {
    club_id: "Club ID",
    country: "Country",
    icc_ranking: "ICC Ranking",
    rating_points: "Rating Points",
    apps: "Apps",
    matches: "Matches",
    won: "Won",
    lost: "Lost",
    tied_so: "Tied (SO)",
    no_result: "NR",
    win_pct: "Win %",
    recent_form: "Recent Form",
    current_captain: "Current Captain",
    head_coach: "Head Coach",
    featured_player: "Featured Player",
    best_tournament_finish: "Best Tournament Finish",
};

const FIX_HINTS: Record<string, string> = {
    club_id: "Column B · Must be format AUS-W, IND-W (country code + -W)",
    country: "Column A · Full country name, cannot be blank",
    icc_ranking: "Column C · Whole number ≥ 1",
    rating_points: "Column D · Whole number ≥ 0",
    apps: "Column E · Number of World Cup appearances",
    matches: "Column F · Must equal Won + Lost + Tied (SO) + NR",
    won: "Column G · Whole number ≥ 0",
    lost: "Column H · Whole number ≥ 0",
    tied_so: "Column I · Super Over/Tied results, whole number ≥ 0",
    no_result: "Column J · No-result matches, whole number ≥ 0",
    win_pct: "Column K · Win % as decimal (e.g. 0.8061) or percentage (80.61)",
    recent_form: "Column L · Last 5 results e.g. W-W-W-L-W",
    current_captain: "Column M · Captain name",
    head_coach: "Column N · Coach name",
    featured_player: "Column O · Featured player name and role",
    best_tournament_finish: "Column P · e.g. Champions (6 times)",
};

function downloadErrorCSV(errors: UploadError[]) {
    const header = ["Excel Row", "Club ID", "Field", "Column", "Error", "How to Fix"];
    const rows = errors.flatMap((e) =>
        e.errors.map((err) => {
            const hint = FIX_HINTS[err.field] ?? "Check the value in this column";
            const col = hint.split("·")[0].replace("Column", "").trim();
            return [e.row, e.club_id ?? "", FIELD_LABELS[err.field] ?? err.field, col, err.message, hint];
        })
    );
    const csv = [header, ...rows]
        .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wt20_club_errors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function WT20BulkUploadForm({ mode }: { mode: FormMode }) {
    const [matchDay, setMatchDay] = useState("");
    const [file, setFile] = useState<File | null>(null);
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
        if (mode === "daily" && !matchDay) return;
        setLoading(true);
        setResult(null);

        const fd = new FormData();
        fd.append("file", file);
        fd.append("dry_run", String(dryRun));
        if (mode === "baseline") fd.append("upsert", String(upsert));
        if (mode === "daily") fd.append("match_day", matchDay);

        const endpoint = mode === "daily"
            ? "/api/wt20-clubs/daily"
            : "/api/wt20-clubs/bulk";

        try {
            const res = await fetch(endpoint, { method: "POST", body: fd });
            const data = await res.json();
            setResult(data);
        } catch {
            setResult({ success: false, error: "Network error — check console" });
        } finally {
            setLoading(false);
        }
    };

    const isDaily = mode === "daily";
    const accentCol = isDaily ? "#4ade80" : "#f59e0b";
    const canSubmit = !!file && !loading && (!isDaily || !!matchDay);

    return (
        <div style={{ ...s.wrapper, borderColor: isDaily ? "#1a3a1a" : "#1e1e2e" }}>
            <div style={s.header}>
                <div style={{ ...s.dot, background: accentCol, boxShadow: `0 0 8px ${accentCol}` }} />
                <h2 style={s.title}>
                    {isDaily ? "Match Day Update" : "Baseline Club Upload"}
                </h2>
                <span style={s.badge}>{isDaily ? "DAILY · 2 CLUBS" : "BASELINE · ALL CLUBS"}</span>
            </div>

            {isDaily && (
                <div style={s.infoBox}>
                    <span style={{ color: accentCol, fontSize: 14 }}>ℹ</span>
                    <span style={s.infoText}>
                        Prepare a sheet with <strong>only the 2 teams that played today</strong>.
                        The system diffs against the current Firestore state and writes a delta log.
                    </span>
                </div>
            )}

            {/* Match day — daily only */}
            {isDaily && (
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
                    {!matchDay && <span style={s.warnMsg}>Required — enter today's match day number</span>}
                </div>
            )}

            {/* Drop zone */}
            <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onClick={() => fileInputRef.current?.click()}
                style={{
                    ...s.dropzone,
                    ...(dragging ? s.dropzoneActive : {}),
                    ...(file ? s.dropzoneFilled : {}),
                    borderColor: dragging ? accentCol : file ? "#333" : "#222",
                }}
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
                        <div style={{ fontSize: 28, marginBottom: 8, color: accentCol }}>⬆</div>
                        <p style={s.dropText}>Drop .xlsx or .csv here or click to browse</p>
                        <p style={s.dropHint}>
                            {isDaily
                                ? "2-row sheet · only today's 2 teams · cumulative stats"
                                : "Full 8-club baseline sheet · all columns required"}
                        </p>
                    </div>
                )}
            </div>

            {/* Options */}
            <div style={s.optionsRow}>
                <label style={s.checkboxLabel}>
                    <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} style={{ accentColor: accentCol }} />
                    <span>
                        {dryRun
                            ? isDaily ? "Dry run — preview delta without writing" : "Dry run — validate only, no writes"
                            : isDaily ? "Live run — will update Firestore + write delta log" : "Live run — will write to Firestore"}
                    </span>
                </label>
                {!isDaily && (
                    <label style={{ ...s.checkboxLabel, marginTop: 8 }}>
                        <input type="checkbox" checked={upsert} onChange={(e) => setUpsert(e.target.checked)} style={{ accentColor: accentCol }} />
                        <span>Overwrite if club already exists (upsert)</span>
                    </label>
                )}
            </div>

            <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                style={{
                    ...s.submitBtn,
                    background: accentCol,
                    color: isDaily ? "#0a0a0f" : "#0a0a0f",
                    ...(!canSubmit ? s.submitBtnDisabled : {}),
                }}
            >
                {loading
                    ? "⟳ Processing…"
                    : dryRun
                        ? isDaily ? `🔍 Preview Day ${matchDay || "?"} Delta` : "🔍 Validate Baseline"
                        : isDaily ? `📅 Apply Day ${matchDay || "?"} Updates` : "🚀 Upload Baseline"}
            </button>

            {result && <ResultPanel result={result} mode={mode} />}
        </div>
    );
}

// ── Result panel ──────────────────────────────────────────────────────────────
function ResultPanel({ result, mode }: { result: UploadResult; mode: FormMode }) {
    const [showErrors, setShowErrors] = useState(true);
    const [showDeltas, setShowDeltas] = useState(true);
    const [expandedRow, setExpandedRow] = useState<number | null>(null);

    const isDaily = mode === "daily";
    const ok = result.success && !result.error;
    const hasErrors = (result.errors?.length ?? 0) > 0;
    const accentCol = isDaily ? "#4ade80" : "#f59e0b";

    return (
        <div style={{ ...s.resultPanel, borderColor: hasErrors ? "#ef4444" : ok ? "#22c55e" : "#ef4444" }}>
            <div style={s.resultHeader}>
                <span style={{ fontSize: 20, fontWeight: 700, color: hasErrors ? "#ef4444" : ok ? "#22c55e" : "#ef4444" }}>
                    {hasErrors ? "✕" : ok ? "✓" : "✕"}
                </span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#e8e8f0" }}>
                    {result.dry_run
                        ? isDaily ? "Delta Preview" : "Validation Result"
                        : ok
                            ? isDaily ? `Day ${result.match_day} Applied` : "Baseline Uploaded"
                            : "Failed"}
                </span>
                {isDaily && result.match_day && (
                    <span style={{ ...s.phasePill, borderColor: "#1a3a1a", color: accentCol, background: "#0d1a0d" }}>
                        📅 Day {result.match_day}
                    </span>
                )}
            </div>

            {result.error && <p style={{ color: "#ef4444", fontSize: 13, margin: "0 0 12px" }}>{result.error}</p>}

            {result.summary && (
                <div style={s.summaryGrid}>
                    {([
                        ["Total", result.summary.total, "#e8e8f0"],
                        result.dry_run
                            ? ["Valid", result.summary.valid, "#4ade80"]
                            : isDaily
                                ? ["Updated", result.summary.updated, accentCol]
                                : ["Created", result.summary.processed, accentCol],
                        isDaily && result.summary.delta_docs_written !== undefined
                            ? ["Deltas", result.summary.delta_docs_written, "#a78bfa"]
                            : ["Skipped", result.summary.skipped, "#888"],
                        result.dry_run
                            ? ["Invalid", result.summary.invalid ?? 0, (result.summary.invalid ?? 0) > 0 ? "#ef4444" : "#4ade80"]
                            : ["Skipped", result.summary.skipped, "#888"],
                        result.summary.duration !== undefined
                            ? ["Time", `${result.summary.duration}ms`, "#888"]
                            : null,
                    ] as [string, unknown, string][]).filter(Boolean).map(([label, value, color]) => (
                        <div key={label} style={s.summaryItem}>
                            {/* <span style={{ ...s.summaryValue, color }}>{value ?? "—"}</span> */}
                            <span style={{ ...s.summaryValue, color }}>
                                {value !== null && value !== undefined ? String(value) : "—"}
                            </span>
                            <span style={s.summaryLabel}>{label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Errors */}
            {hasErrors && (
                <div style={s.errorSection}>
                    <div style={s.errorSectionHeader}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "#ef4444" }}>
                            <span>✕</span>
                            <span>{result.errors!.length} row{result.errors!.length !== 1 ? "s" : ""} need correction</span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setShowErrors((v) => !v)} style={s.errorToggleBtn}>
                                {showErrors ? "▲ Hide" : "▼ Show"}
                            </button>
                            <button onClick={() => downloadErrorCSV(result.errors!)} style={s.downloadBtn}>
                                ⬇ Error Report (.csv)
                            </button>
                        </div>
                    </div>

                    {showErrors && (
                        <div style={s.fixInstructions}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", margin: "0 0 6px" }}>How to fix:</p>
                            {["1. Download the error report CSV above",
                                "2. Open your Excel sheet alongside it",
                                "3. Go to the Excel row shown, correct the flagged column",
                                "4. Re-upload the corrected sheet",
                            ].map((step) => (
                                <p key={step} style={{ fontSize: 11, color: "#888", margin: "0 0 3px" }}>{step}</p>
                            ))}
                        </div>
                    )}

                    {showErrors && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                            {result.errors!.map((e) => (
                                <div key={e.row} style={s.errorCard}>
                                    <div style={s.errorCardHeader} onClick={() => setExpandedRow(expandedRow === e.row ? null : e.row)}>
                                        <span style={s.excelRowBadge}>Excel row {e.row}</span>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>{e.club_id || "—"}</span>
                                        <span style={{ fontSize: 10, color: "#666" }}>{e.errors.length} field{e.errors.length !== 1 ? "s" : ""}</span>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                                            {e.errors.map((err, i) => (
                                                <span key={i} style={s.errorPill}>{FIELD_LABELS[err.field] ?? err.field}</span>
                                            ))}
                                        </div>
                                        <span style={{ fontSize: 10, color: "#444" }}>{expandedRow === e.row ? "▲" : "▼"}</span>
                                    </div>

                                    {expandedRow === e.row && (
                                        <div style={s.errorCardBody}>
                                            {e.errors.map((err, j) => (
                                                <div key={j} style={{ marginBottom: 10 }}>
                                                    <div style={{ display: "flex", gap: 10 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", minWidth: 140 }}>
                                                            {FIELD_LABELS[err.field] ?? err.field}
                                                        </span>
                                                        <span style={{ fontSize: 12, color: "#e8e8f0" }}>{err.message}</span>
                                                    </div>
                                                    <div style={{ display: "flex", gap: 6, marginTop: 4, background: "#0a0a06", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#888" }}>
                                                        <span>💡</span>
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

            {/* Delta preview */}
            {result.deltas && result.deltas.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                    <button onClick={() => setShowDeltas((v) => !v)} style={{ ...s.errorToggleBtn, borderColor: "#1a3a1a", color: accentCol }}>
                        {showDeltas ? "▲ Hide" : "▼ Show"} delta preview ({result.deltas.length} clubs changed)
                    </button>
                    {showDeltas && (
                        <div style={{ marginTop: 10 }}>
                            {result.deltas.map((d) => (
                                <div key={d.club_id} style={s.deltaRow}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: accentCol }}>{d.club_id}</span>
                                        <span style={{ fontSize: 12, color: "#888" }}>{d.country}</span>
                                        {d.had_match_today && (
                                            <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80", background: "#0d1a0d", padding: "2px 7px", borderRadius: 4, border: "1px solid #1a3a1a" }}>
                                                🏏 played today
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        {d.changes.map((c, i) => (
                                            <span key={i} style={s.deltaField}>
                                                <span style={{ color: "#666", marginRight: 2 }}>{FIELD_LABELS[c.field] ?? c.field}</span>
                                                <span style={{ color: "#ef4444" }}>{String(c.from ?? "—")}</span>
                                                <span style={{ color: "#333" }}> → </span>
                                                <span style={{ color: "#4ade80" }}>{String(c.to ?? "—")}</span>
                                                {c.diff !== undefined && (
                                                    <span style={{ fontWeight: 700, color: c.diff > 0 ? "#4ade80" : "#ef4444" }}>
                                                        {" "}({c.diff > 0 ? "+" : ""}{c.diff})
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

            {/* DQ warnings */}
            {result.dqWarnings && result.dqWarnings.length > 0 && (
                <div style={s.dqSection}>
                    <p style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600, margin: "0 0 8px" }}>
                        ⚠ DQ Warnings ({result.dqWarnings.length})
                    </p>
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
    wrapper: { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 640, margin: "0 auto", border: "1px solid" },
    header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 },
    dot: { width: 10, height: 10, borderRadius: "50%" },
    title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
    badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
    infoBox: { display: "flex", gap: 10, alignItems: "flex-start", background: "#0d1a0d", border: "1px solid #1a3a1a", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#888" },
    infoText: { lineHeight: 1.6 },
    field: { marginBottom: 16 },
    label: { display: "block", fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 8, fontWeight: 700 },
    input: { width: "100%", boxSizing: "border-box" as const, background: "#111118", border: "1px solid #222", borderRadius: 8, padding: "10px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" },
    inputWarn: { borderColor: "#f59e0b" },
    warnMsg: { fontSize: 11, color: "#f59e0b", marginTop: 4, display: "block" },
    dropzone: { border: "2px dashed", borderRadius: 10, padding: "28px 24px", textAlign: "center" as const, cursor: "pointer", marginBottom: 16, background: "#0d0d15" },
    dropzoneActive: { background: "#0d1a0d" },
    dropzoneFilled: { borderStyle: "solid" },
    dropText: { fontSize: 13, color: "#888", margin: "0 0 4px" },
    dropHint: { fontSize: 11, color: "#444", margin: 0 },
    fileInfo: { display: "flex", alignItems: "center", gap: 12, textAlign: "left" as const },
    fileName: { fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "#e8e8f0" },
    fileSize: { fontSize: 11, color: "#666", margin: 0 },
    removeBtn: { marginLeft: "auto", background: "none", border: "1px solid #333", borderRadius: 6, color: "#666", padding: "4px 8px", cursor: "pointer", fontSize: 12 },
    optionsRow: { marginBottom: 20, display: "flex", flexDirection: "column" as const },
    checkboxLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#888", cursor: "pointer" },
    submitBtn: { width: "100%", padding: "13px", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 },
    submitBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
    resultPanel: { marginTop: 24, border: "1px solid", borderRadius: 10, padding: 20, background: "#0d0d15" },
    resultHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
    phasePill: { marginLeft: "auto", fontSize: 10, padding: "3px 8px", border: "1px solid", borderRadius: 4 },
    summaryGrid: { display: "flex", gap: 12, flexWrap: "wrap" as const, marginBottom: 16 },
    summaryItem: { display: "flex", flexDirection: "column" as const, alignItems: "center", background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, padding: "10px 14px", minWidth: 64 },
    summaryValue: { fontSize: 20, fontWeight: 700 },
    summaryLabel: { fontSize: 10, color: "#666", letterSpacing: 1, marginTop: 2 },
    errorSection: { background: "#120808", border: "1px solid #3a1010", borderRadius: 10, padding: 16, marginBottom: 16 },
    errorSectionHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap" as const, gap: 8 },
    errorToggleBtn: { background: "none", border: "1px solid #3a1010", borderRadius: 6, padding: "5px 12px", color: "#ef4444", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
    downloadBtn: { background: "#ef4444", border: "none", borderRadius: 6, padding: "5px 12px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
    fixInstructions: { background: "#0d0505", border: "1px solid #2a1010", borderRadius: 8, padding: "12px 14px", marginBottom: 12 },
    errorCard: { border: "1px solid #2a1010", borderRadius: 8, overflow: "hidden" },
    errorCardHeader: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#160808", cursor: "pointer", flexWrap: "wrap" as const },
    excelRowBadge: { fontSize: 10, background: "#1e1010", padding: "2px 7px", borderRadius: 4, color: "#ef4444", border: "1px solid #3a1010", whiteSpace: "nowrap" as const },
    errorPill: { fontSize: 10, padding: "1px 6px", background: "#2a0808", border: "1px solid #3a1010", borderRadius: 3, color: "#ef4444" },
    errorCardBody: { background: "#0d0505", padding: "12px 14px", borderTop: "1px solid #2a1010" },
    deltaRow: { background: "#080f08", border: "1px solid #1a2a1a", borderRadius: 8, padding: "10px 12px", marginBottom: 8 },
    deltaField: { display: "flex", alignItems: "center", background: "#0a0a06", border: "1px solid #222", borderRadius: 4, padding: "3px 7px", fontSize: 11 },
    dqSection: { background: "#1a1400", borderRadius: 8, padding: "12px 14px", marginBottom: 12 },
};