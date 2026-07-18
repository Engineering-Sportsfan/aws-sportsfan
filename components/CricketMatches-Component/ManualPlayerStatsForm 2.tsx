// components/forms/ManualPlayerStatsForm.tsx
"use client";

import { useState } from "react";

interface FormState {
  player_name: string;
  tournament: string;
  gender: "male" | "female";
  format: "T20" | "ODI" | "Test";
  // batting
  runs: string;
  balls_faced: string;
  fours: string;
  sixes: string;
  strike_rate: string;
  batting_dismissals: string;
  batting_average: string;
  // bowling
  wickets: string;
  runs_conceded: string;
  balls_bowled: string;
  overs: string;
  economy: string;
  bowling_average: string;
}

const EMPTY: FormState = {
  player_name: "", tournament: "womens_ipl", gender: "female", format: "T20",
  runs: "", balls_faced: "", fours: "", sixes: "", strike_rate: "", batting_dismissals: "", batting_average: "",
  wickets: "", runs_conceded: "", balls_bowled: "", overs: "", economy: "", bowling_average: "",
};

// Auto-derive strike rate and economy when source fields change
function deriveStats(form: FormState): Partial<FormState> {
  const runs = parseFloat(form.runs) || 0;
  const bf = parseFloat(form.balls_faced) || 0;
  const bb = parseFloat(form.balls_bowled) || 0;
  const rc = parseFloat(form.runs_conceded) || 0;
  const dis = parseFloat(form.batting_dismissals) || 0;
  const wkts = parseFloat(form.wickets) || 0;

  const derived: Partial<FormState> = {};
  if (bf > 0 && !form.strike_rate) derived.strike_rate = ((runs / bf) * 100).toFixed(2);
  if (bb > 0 && !form.overs) derived.overs = (bb / 6).toFixed(1);
  const ov = parseFloat(derived.overs ?? form.overs) || 0;
  if (ov > 0 && !form.economy) derived.economy = (rc / ov).toFixed(2);
  if (dis > 0 && !form.batting_average) derived.batting_average = (runs / dis).toFixed(2);
  if (wkts > 0 && !form.bowling_average) derived.bowling_average = (rc / wkts).toFixed(2);
  return derived;
}

export default function ManualPlayerStatsForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof FormState, value: string) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "tournament") {
        next.gender = value === "mens_ipl" ? "male" : "female";
      }
      return next;
    });
    if (fieldErrors[field]) setFieldErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  };

  const handleDeriveClick = () => {
    const derived = deriveStats(form);
    setForm((f) => ({ ...f, ...derived }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setFieldErrors({});

    const n = (v: string) => (v === "" ? 0 : parseFloat(v));
    const payload = {
      player_name: form.player_name,
      player_id: null,
      tournament: form.tournament,
      gender: form.gender,
      format: form.format,
      runs: n(form.runs), balls_faced: n(form.balls_faced), fours: n(form.fours), sixes: n(form.sixes),
      strike_rate: n(form.strike_rate), batting_dismissals: n(form.batting_dismissals), batting_average: n(form.batting_average),
      wickets: n(form.wickets), runs_conceded: n(form.runs_conceded), balls_bowled: n(form.balls_bowled),
      overs: n(form.overs), economy: n(form.economy), bowling_average: n(form.bowling_average),
      source_file: "admin_manual",
    };

    try {
      const res = await fetch("/api/player-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 422 && data.errors) {
        const errs: Record<string, string> = {};
        data.errors.forEach((e: { field: string; message: string }) => { errs[e.field] = e.message; });
        setFieldErrors(errs);
        setResult({ success: false, message: "Fix highlighted fields" });
      } else if (data.success) {
        setResult({ success: true, message: `${form.player_name} added ✓ (id: ${data.id})` });
        setForm(EMPTY);
      } else {
        setResult({ success: false, message: data.error ?? "Unknown error" });
      }
    } catch {
      setResult({ success: false, message: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  const F = ({ label, field, required = false }: { label: string; field: keyof FormState; required?: boolean }) => (
    <div style={s.fieldWrap}>
      <label style={s.label}>{label}{required && <span style={s.req}> *</span>}</label>
      <input
        type="text"
        inputMode="decimal"
        value={form[field]}
        onChange={(e) => set(field, e.target.value)}
        style={{ ...s.input, ...(fieldErrors[field] ? s.inputErr : {}) }}
      />
      {fieldErrors[field] && <span style={s.errMsg}>{fieldErrors[field]}</span>}
    </div>
  );

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <div style={s.dot} />
        <h2 style={s.title}>Manual Player Stats Entry</h2>
        <span style={s.badge}>SINGLE RECORD</span>
      </div>

      {/* Classification */}
      <div style={s.sec}>
        <p style={s.secLabel}>CLASSIFICATION</p>
        <div style={s.grid3}>
          <div style={s.fieldWrap}>
            <label style={s.label}>Tournament</label>
            <select value={form.tournament} onChange={(e) => set("tournament", e.target.value)} style={s.input}>
              <option value="mens_ipl">Men&apos;s IPL</option>
              <option value="womens_ipl">Women&apos;s IPL (WPL)</option>
              <option value="womens_wc">Women&apos;s WC</option>
              <option value="womens_t20i">Women&apos;s T20I</option>
              <option value="womens_odi">Women&apos;s ODI</option>
              <option value="womens_test">Women&apos;s Test</option>
            </select>
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Gender</label>
            <select value={form.gender} onChange={(e) => set("gender", e.target.value)} style={s.input}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Format</label>
            <select value={form.format} onChange={(e) => set("format", e.target.value)} style={s.input}>
              <option value="T20">T20</option>
              <option value="ODI">ODI</option>
              <option value="Test">Test</option>
            </select>
          </div>
        </div>
      </div>

      {/* Player */}
      <div style={s.sec}>
        <p style={s.secLabel}>PLAYER</p>
        <div style={s.fieldWrap}>
          <label style={s.label}>Player Name <span style={s.req}>*</span></label>
          <input
            type="text"
            value={form.player_name}
            onChange={(e) => set("player_name", e.target.value)}
            placeholder="Smriti Mandhana"
            style={{ ...s.input, ...(fieldErrors.player_name ? s.inputErr : {}) }}
          />
          {fieldErrors.player_name && <span style={s.errMsg}>{fieldErrors.player_name}</span>}
        </div>
      </div>

      {/* Batting */}
      <div style={s.sec}>
        <p style={s.secLabel}>BATTING</p>
        <div style={s.grid3}>
          <F label="Runs" field="runs" required />
          <F label="Balls Faced" field="balls_faced" required />
          <F label="Fours" field="fours" />
          <F label="Sixes" field="sixes" />
          <F label="Strike Rate" field="strike_rate" />
          <F label="Dismissals" field="batting_dismissals" />
          <F label="Batting Avg" field="batting_average" />
        </div>
      </div>

      {/* Bowling */}
      <div style={s.sec}>
        <p style={s.secLabel}>BOWLING</p>
        <div style={s.grid3}>
          <F label="Wickets" field="wickets" />
          <F label="Runs Conceded" field="runs_conceded" />
          <F label="Balls Bowled" field="balls_bowled" />
          <F label="Overs" field="overs" />
          <F label="Economy" field="economy" />
          <F label="Bowling Avg" field="bowling_average" />
        </div>
        <button onClick={handleDeriveClick} style={s.deriveBtn}>
          ⟳ Auto-derive SR / Economy / Averages
        </button>
      </div>

      <button onClick={handleSubmit} disabled={loading} style={{ ...s.btn, ...(loading ? s.btnDis : {}) }}>
        {loading ? "⟳ Saving…" : "＋ Add Player Stats"}
      </button>

      {result && (
        <div style={{ ...s.result, borderColor: result.success ? "#22c55e" : "#ef4444" }}>
          <span style={{ color: result.success ? "#22c55e" : "#ef4444" }}>{result.success ? "✓" : "✕"}</span>{" "}
          {result.message}
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrapper: { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 680, margin: "0 auto", border: "1px solid #1e1e2e" },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 28 },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#f472b6", boxShadow: "0 0 8px #f472b6" },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  sec: { marginBottom: 24 },
  secLabel: { fontSize: 10, letterSpacing: 2, color: "#444", fontWeight: 700, margin: "0 0 12px", borderBottom: "1px solid #1a1a1a", paddingBottom: 6 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 16px" },
  fieldWrap: { display: "flex", flexDirection: "column" as const },
  label: { fontSize: 11, letterSpacing: 0.5, color: "#666", marginBottom: 5 },
  req: { color: "#f472b6" },
  input: { background: "#111118", border: "1px solid #222", borderRadius: 7, padding: "9px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" },
  inputErr: { borderColor: "#ef4444" },
  errMsg: { fontSize: 11, color: "#ef4444", marginTop: 4 },
  deriveBtn: { marginTop: 10, background: "none", border: "1px solid #333", borderRadius: 6, padding: "7px 14px", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  btn: { width: "100%", padding: "13px", background: "#f472b6", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5, marginTop: 8 },
  btnDis: { opacity: 0.4, cursor: "not-allowed" },
  result: { marginTop: 16, padding: "12px 16px", border: "1px solid", borderRadius: 8, fontSize: 13, background: "#0d0d15" },
};