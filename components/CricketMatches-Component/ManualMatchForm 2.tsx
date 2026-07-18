// components/forms/ManualMatchForm.tsx
"use client";

import { useState } from "react";

interface FormState {
  match_id: string;
  date: string;
  season: string;
  team1: string;
  team2: string;
  venue: string;
  city: string;
  winner: string;
  toss_winner: string;
  toss_decision: "bat" | "field";
  player_of_match: string;
  target: string;
  chase_success: string;
  match_result: "normal" | "no_result" | "tie" | "abandoned";
  tournament: string;
  gender: "male" | "female";
  format: "T20" | "ODI" | "Test";
}

const EMPTY: FormState = {
  match_id: "",
  date: new Date().toISOString().slice(0, 10),
  season: String(new Date().getFullYear()),
  team1: "",
  team2: "",
  venue: "",
  city: "",
  winner: "",
  toss_winner: "",
  toss_decision: "bat",
  player_of_match: "",
  target: "",
  chase_success: "",
  match_result: "normal",
  tournament: "womens_ipl",
  gender: "female",
  format: "T20",
};

export default function ManualMatchForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => { const n = { ...e }; delete n[field]; return n; });

    // Auto-fill gender based on tournament
    if (field === "tournament") {
      setForm((f) => ({
        ...f,
        tournament: value,
        gender: value === "mens_ipl" ? "male" : "female",
      }));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setFieldErrors({});

    const payload = {
      ...form,
      season: parseInt(form.season, 10),
      target: form.target ? parseFloat(form.target) : null,
      chase_success: form.chase_success === "true" ? true : form.chase_success === "false" ? false : null,
      city: form.city || null,
      winner: form.winner || null,
      player_of_match: form.player_of_match || null,
      player_of_match_id: null,
      source_file: "admin_manual",
    };

    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 422 && data.errors) {
        const errs: Record<string, string> = {};
        data.errors.forEach((e: { field: string; message: string }) => {
          errs[e.field] = e.message;
        });
        setFieldErrors(errs);
        setResult({ success: false, message: "Please fix the highlighted fields" });
      } else if (data.success) {
        setResult({ success: true, message: `Match ${data.match_id} created ✓` });
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

  const F = ({ label, field, type = "text", placeholder = "", required = false, options }: {
    label: string;
    field: keyof FormState;
    type?: string;
    placeholder?: string;
    required?: boolean;
    options?: { value: string; label: string }[];
  }) => (
    <div style={f.fieldWrap}>
      <label style={f.label}>
        {label}
        {required && <span style={f.required}> *</span>}
      </label>
      {options ? (
        <select
          value={form[field]}
          onChange={(e) => set(field, e.target.value)}
          style={{ ...f.input, ...(fieldErrors[field] ? f.inputError : {}) }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={form[field]}
          onChange={(e) => set(field, e.target.value)}
          placeholder={placeholder}
          style={{ ...f.input, ...(fieldErrors[field] ? f.inputError : {}) }}
        />
      )}
      {fieldErrors[field] && <span style={f.errorMsg}>{fieldErrors[field]}</span>}
    </div>
  );

  return (
    <div style={f.wrapper}>
      <div style={f.header}>
        <div style={f.dot} />
        <h2 style={f.title}>Manual Match Entry</h2>
        <span style={f.badge}>SINGLE RECORD</span>
      </div>

      {/* Classification */}
      <div style={f.section}>
        <p style={f.sectionLabel}>CLASSIFICATION</p>
        <div style={f.grid3}>
          <F label="Tournament" field="tournament" options={[
            { value: "mens_ipl", label: "Men's IPL" },
            { value: "womens_ipl", label: "Women's IPL (WPL)" },
            { value: "womens_wc", label: "Women's WC" },
            { value: "womens_t20i", label: "Women's T20I" },
            { value: "womens_odi", label: "Women's ODI" },
            { value: "womens_test", label: "Women's Test" },
          ]} />
          <F label="Gender" field="gender" options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
          ]} />
          <F label="Format" field="format" options={[
            { value: "T20", label: "T20" },
            { value: "ODI", label: "ODI" },
            { value: "Test", label: "Test" },
          ]} />
        </div>
      </div>

      {/* Match identity */}
      <div style={f.section}>
        <p style={f.sectionLabel}>MATCH IDENTITY</p>
        <div style={f.grid2}>
          <F label="Match ID" field="match_id" placeholder="e.g. 1234567" required />
          <F label="Date" field="date" type="date" required />
          <F label="Season" field="season" placeholder="e.g. 2025" required />
          <F label="Match Result" field="match_result" options={[
            { value: "normal", label: "Normal" },
            { value: "no_result", label: "No Result" },
            { value: "tie", label: "Tie" },
            { value: "abandoned", label: "Abandoned" },
          ]} />
        </div>
      </div>

      {/* Teams */}
      <div style={f.section}>
        <p style={f.sectionLabel}>TEAMS & VENUE</p>
        <div style={f.grid2}>
          <F label="Team 1" field="team1" placeholder="Mumbai Indians" required />
          <F label="Team 2" field="team2" placeholder="Delhi Capitals" required />
          <F label="Venue" field="venue" placeholder="Wankhede Stadium" required />
          <F label="City" field="city" placeholder="Mumbai (optional)" />
        </div>
      </div>

      {/* Toss & result */}
      <div style={f.section}>
        <p style={f.sectionLabel}>TOSS & RESULT</p>
        <div style={f.grid2}>
          <F label="Toss Winner" field="toss_winner" placeholder="Mumbai Indians" required />
          <F label="Toss Decision" field="toss_decision" options={[
            { value: "bat", label: "Bat" },
            { value: "field", label: "Field" },
          ]} />
          <F label="Winner" field="winner" placeholder="Leave blank for no result" />
          <F label="Target" field="target" type="number" placeholder="e.g. 187" />
          <F label="Chase Success" field="chase_success" options={[
            { value: "", label: "N/A" },
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]} />
          <F label="Player of Match" field="player_of_match" placeholder="Smriti Mandhana" />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ ...f.btn, ...(loading ? f.btnDisabled : {}) }}
      >
        {loading ? "⟳ Saving…" : "＋ Create Match"}
      </button>

      {result && (
        <div style={{ ...f.result, borderColor: result.success ? "#22c55e" : "#ef4444" }}>
          <span style={{ color: result.success ? "#22c55e" : "#ef4444" }}>
            {result.success ? "✓" : "✕"}
          </span>{" "}
          {result.message}
        </div>
      )}
    </div>
  );
}

const f: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: "'DM Mono', 'Courier New', monospace",
    background: "#0a0a0f",
    color: "#e8e8f0",
    borderRadius: 12,
    padding: "28px 32px",
    maxWidth: 680,
    margin: "0 auto",
    border: "1px solid #1e1e2e",
  },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 28 },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 8px #60a5fa" },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, color: "#444", fontWeight: 700, margin: "0 0 12px", borderBottom: "1px solid #1a1a1a", paddingBottom: 6 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 16px" },
  fieldWrap: { display: "flex", flexDirection: "column" as const },
  label: { fontSize: 11, letterSpacing: 0.5, color: "#666", marginBottom: 5 },
  required: { color: "#ef4444" },
  input: {
    background: "#111118",
    border: "1px solid #222",
    borderRadius: 7,
    padding: "9px 12px",
    color: "#e8e8f0",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
    transition: "border-color 0.15s",
  },
  inputError: { borderColor: "#ef4444" },
  errorMsg: { fontSize: 11, color: "#ef4444", marginTop: 4 },
  btn: {
    width: "100%",
    padding: "13px",
    background: "#60a5fa",
    border: "none",
    borderRadius: 8,
    color: "#0a0a0f",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    letterSpacing: 0.5,
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  result: {
    marginTop: 16,
    padding: "12px 16px",
    border: "1px solid",
    borderRadius: 8,
    fontSize: 13,
    background: "#0d0d15",
  },
};