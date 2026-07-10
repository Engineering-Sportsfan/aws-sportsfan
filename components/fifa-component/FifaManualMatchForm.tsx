// components/forms/FifaManualMatchForm.tsx
"use client";

import { useState } from "react";

interface FormState {
  match_id: string;
  date: string;
  season: string;
  stage: string;
  group: string;
  match_day: string;
  team1: string;
  team2: string;
  team1_code: string;
  team2_code: string;
  venue: string;
  city: string;
  winner: string;
  winner_code: string;
  goals_team1: string;
  goals_team2: string;
  goals_team1_pens: string;
  goals_team2_pens: string;
  match_result: string;
  player_of_match: string;
  referee: string;
  tournament: string;
  gender: string;
}

const EMPTY: FormState = {
  match_id: "", date: new Date().toISOString().slice(0, 10), season: "2022",
  stage: "Group Stage", group: "", match_day: "",
  team1: "", team2: "", team1_code: "", team2_code: "",
  venue: "", city: "", winner: "", winner_code: "",
  goals_team1: "", goals_team2: "", goals_team1_pens: "", goals_team2_pens: "",
  match_result: "normal", player_of_match: "", referee: "",
  tournament: "mens_fifa_wc_2022", gender: "male",
};

export default function FifaManualMatchForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setFieldErrors({});

    const n = (v: string) => v === "" ? null : parseInt(v, 10);

    const payload = {
      ...form,
      season: parseInt(form.season, 10),
      match_day: form.match_day ? parseInt(form.match_day, 10) : null,
      group: form.group || null,
      city: form.city || null,
      winner: form.winner || null,
      winner_code: form.winner_code || null,
      goals_team1: parseInt(form.goals_team1, 10) || 0,
      goals_team2: parseInt(form.goals_team2, 10) || 0,
      goals_team1_pens: n(form.goals_team1_pens),
      goals_team2_pens: n(form.goals_team2_pens),
      player_of_match: form.player_of_match || null,
      player_of_match_id: null,
      referee: form.referee || null,
      format: "international",
      source_file: "admin_manual",
    };

    try {
      const res = await fetch("/api/fifa-matches", {
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

  const F = ({ label, field, type = "text", placeholder = "", options }: {
    label: string; field: keyof FormState; type?: string; placeholder?: string;
    options?: { value: string; label: string }[];
  }) => (
    <div style={f.fieldWrap}>
      <label style={f.label}>{label}</label>
      {options ? (
        <select value={form[field]} onChange={(e) => set(field, e.target.value)} style={{ ...f.input, ...(fieldErrors[field] ? f.inputError : {}) }}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={form[field]} onChange={(e) => set(field, e.target.value)} placeholder={placeholder} style={{ ...f.input, ...(fieldErrors[field] ? f.inputError : {}) }} />
      )}
      {fieldErrors[field] && <span style={f.errorMsg}>{fieldErrors[field]}</span>}
    </div>
  );

  return (
    <div style={f.wrapper}>
      <div style={f.header}>
        <div style={f.dot} />
        <h2 style={f.title}>Manual FIFA Match Entry</h2>
        <span style={f.badge}>SINGLE RECORD</span>
      </div>

      <div style={f.section}>
        <p style={f.sectionLabel}>CLASSIFICATION</p>
        <div style={f.grid3}>
          <F label="Tournament" field="tournament" options={[
            { value: "mens_fifa_wc_2022", label: "Men's WC 2022" },
            { value: "womens_fifa_wc_2023", label: "Women's WC 2023" },
            { value: "mens_fifa_wc_2026", label: "Men's WC 2026" },
          ]} />
          <F label="Gender" field="gender" options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} />
          <F label="Season" field="season" placeholder="2022" />
        </div>
      </div>

      <div style={f.section}>
        <p style={f.sectionLabel}>MATCH IDENTITY</p>
        <div style={f.grid3}>
          <F label="Match ID" field="match_id" placeholder="wc2022_64" />
          <F label="Date" field="date" type="date" />
          <F label="Stage" field="stage" options={[
            { value: "Group Stage", label: "Group Stage" },
            { value: "Round of 16", label: "Round of 16" },
            { value: "Quarter-Final", label: "Quarter-Final" },
            { value: "Semi-Final", label: "Semi-Final" },
            { value: "Third Place", label: "Third Place" },
            { value: "Final", label: "Final" },
          ]} />
          <F label="Group" field="group" placeholder="Group A (leave blank for knockouts)" />
          <F label="Match Day" field="match_day" placeholder="1 / 2 / 3 (group only)" />
          <F label="Match Result" field="match_result" options={[
            { value: "normal", label: "Normal" },
            { value: "extra_time", label: "Extra Time" },
            { value: "penalties", label: "Penalties" },
            { value: "no_result", label: "No Result" },
            { value: "abandoned", label: "Abandoned" },
          ]} />
        </div>
      </div>

      <div style={f.section}>
        <p style={f.sectionLabel}>TEAMS</p>
        <div style={f.grid2}>
          <F label="Team 1" field="team1" placeholder="Argentina" />
          <F label="Team 2" field="team2" placeholder="France" />
          <F label="Team 1 Code" field="team1_code" placeholder="ARG" />
          <F label="Team 2 Code" field="team2_code" placeholder="FRA" />
        </div>
      </div>

      <div style={f.section}>
        <p style={f.sectionLabel}>VENUE</p>
        <div style={f.grid2}>
          <F label="Venue" field="venue" placeholder="Lusail Iconic Stadium" />
          <F label="City" field="city" placeholder="Lusail" />
        </div>
      </div>

      <div style={f.section}>
        <p style={f.sectionLabel}>RESULT</p>
        <div style={f.grid2}>
          <F label="Goals Team 1 (FT)" field="goals_team1" type="number" placeholder="3" />
          <F label="Goals Team 2 (FT)" field="goals_team2" type="number" placeholder="3" />
          <F label="Goals Team 1 (Pens)" field="goals_team1_pens" type="number" placeholder="Leave blank if no shootout" />
          <F label="Goals Team 2 (Pens)" field="goals_team2_pens" type="number" placeholder="Leave blank if no shootout" />
          <F label="Winner" field="winner" placeholder="Argentina (blank if no result)" />
          <F label="Winner Code" field="winner_code" placeholder="ARG" />
        </div>
      </div>

      <div style={f.section}>
        <p style={f.sectionLabel}>OFFICIALS & PLAYERS</p>
        <div style={f.grid2}>
          <F label="Player of Match" field="player_of_match" placeholder="Lionel Messi" />
          <F label="Referee" field="referee" placeholder="Szymon Marciniak" />
        </div>
      </div>

      <button onClick={handleSubmit} disabled={loading} style={{ ...f.btn, ...(loading ? f.btnDisabled : {}) }}>
        {loading ? "⟳ Saving…" : "＋ Create Match"}
      </button>

      {result && (
        <div style={{ ...f.result, borderColor: result.success ? "#22c55e" : "#ef4444" }}>
          <span style={{ color: result.success ? "#22c55e" : "#ef4444" }}>{result.success ? "✓" : "✕"}</span>{" "}{result.message}
        </div>
      )}
    </div>
  );
}

const f: Record<string, React.CSSProperties> = {
  wrapper: { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 680, margin: "0 auto", border: "1px solid #1e1e2e" },
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
  input: { background: "#111118", border: "1px solid #222", borderRadius: 7, padding: "9px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" },
  inputError: { borderColor: "#ef4444" },
  errorMsg: { fontSize: 11, color: "#ef4444", marginTop: 4 },
  btn: { width: "100%", padding: "13px", background: "#60a5fa", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5, marginTop: 8 },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  result: { marginTop: 16, padding: "12px 16px", border: "1px solid", borderRadius: 8, fontSize: 13, background: "#0d0d15" },
};