"use client";

import { useState } from "react";

interface FormState {
  player_name: string;
  team: string;
  position: "GK" | "DF" | "MF" | "FW";
  player_id: string;
  matches_played: string;
  minutes_played: string;
  goals: string;
  assists: string;
  shots: string;
  shots_on_target: string;
  shot_conversion_pct: string;
  xg: string;
  xa: string;
  dribbles_completed: string;
  key_passes: string;
  chances_created: string;
  big_chances_created: string;
  tournament: string;
  gender: string;
  format: string;
  season: string;
}

const EMPTY: FormState = {
  player_name: "",
  team: "",
  position: "FW",
  player_id: "",
  matches_played: "",
  minutes_played: "",
  goals: "",
  assists: "",
  shots: "",
  shots_on_target: "",
  shot_conversion_pct: "",
  xg: "",
  xa: "",
  dribbles_completed: "",
  key_passes: "",
  chances_created: "",
  big_chances_created: "",
  tournament: "mens_fifa_wc_2022",
  gender: "male",
  format: "international",
  season: "2022",
};

export default function FifaManualPlayerStatsForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setField = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // const parseNumber = (value: string) => (value === "" ? 0 : parseFloat(value) || 0);

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setFieldErrors({});

    const payload = {
      player_name: form.player_name,
      team: form.team,
      position: form.position,
      player_id: form.player_id,
      matches_played: parseInt(form.matches_played, 10) || 0,
      minutes_played: parseInt(form.minutes_played, 10) || 0,
      goals: parseInt(form.goals, 10) || 0,
      assists: parseInt(form.assists, 10) || 0,
      shots: parseInt(form.shots, 10) || 0,
      shots_on_target: parseInt(form.shots_on_target, 10) || 0,
      shot_conversion_pct: parseFloat(form.shot_conversion_pct) || 0,
      xg: parseFloat(form.xg) || 0,
      xa: parseFloat(form.xa) || 0,
      dribbles_completed: parseInt(form.dribbles_completed, 10) || 0,
      key_passes: parseInt(form.key_passes, 10) || 0,
      chances_created: parseInt(form.chances_created, 10) || 0,
      big_chances_created: parseInt(form.big_chances_created, 10) || 0,
      tournament: form.tournament,
      gender: form.gender,
      format: form.format,
      season: parseInt(form.season, 10) || 2022,
      source_file: "admin_manual",
    };

    try {
      const res = await fetch("/api/fifa-player-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok && data.errors) {
        const errors: Record<string, string> = {};
        data.errors.forEach((err: { field: string; message: string }) => {
          errors[err.field] = err.message;
        });
        setFieldErrors(errors);
        setResult({ success: false, message: "Fix highlighted fields." });
      } else if (data.success) {
        setResult({ success: true, message: `Saved ${form.player_name} successfully.` });
        setForm(EMPTY);
      } else {
        setResult({ success: false, message: data.error || "Unknown error" });
      }
    } catch (error) {
      setResult({ success: false, message: "Network error" });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const Field = ({ label, field, type = "text", options }: {
    label: string;
    field: keyof FormState;
    type?: string;
    options?: { value: string; label: string }[];
  }) => (
    <div style={styles.fieldWrap}>
      <label style={styles.label}>{label}</label>
      {options ? (
        <select
          value={form[field]}
          onChange={(e) => setField(field, e.target.value)}
          style={{ ...styles.input, ...(fieldErrors[field] ? styles.inputError : {}) }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={form[field]}
          onChange={(e) => setField(field, e.target.value)}
          style={{ ...styles.input, ...(fieldErrors[field] ? styles.inputError : {}) }}
        />
      )}
      {fieldErrors[field] && <span style={styles.errorMsg}>{fieldErrors[field]}</span>}
    </div>
  );

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.dot} />
        <h2 style={styles.title}>Manual FIFA Player Stats</h2>
        <span style={styles.badge}>SINGLE RECORD</span>
      </div>

      <div style={styles.section}>
        <p style={styles.sectionLabel}>PLAYER</p>
        <div style={styles.grid2}>
          <Field label="Player Name" field="player_name" />
          <Field label="Team" field="team" />
          <Field label="Position" field="position" options={[
            { value: "GK", label: "GK" },
            { value: "DF", label: "DF" },
            { value: "MF", label: "MF" },
            { value: "FW", label: "FW" },
          ]} />
          <Field label="Player ID" field="player_id" />
        </div>
      </div>

      <div style={styles.section}>
        <p style={styles.sectionLabel}>MATCH STATS</p>
        <div style={styles.grid3}>
          <Field label="Matches Played" field="matches_played" type="number" />
          <Field label="Minutes Played" field="minutes_played" type="number" />
          <Field label="Goals" field="goals" type="number" />
          <Field label="Assists" field="assists" type="number" />
          <Field label="Shots" field="shots" type="number" />
          <Field label="Shots on Target" field="shots_on_target" type="number" />
          <Field label="Shot Conv. %" field="shot_conversion_pct" type="number" />
        </div>
      </div>

      <div style={styles.section}>
        <p style={styles.sectionLabel}>ADVANCED</p>
        <div style={styles.grid3}>
          <Field label="xG" field="xg" type="number" />
          <Field label="xA" field="xa" type="number" />
          <Field label="Dribbles Completed" field="dribbles_completed" type="number" />
          <Field label="Key Passes" field="key_passes" type="number" />
          <Field label="Chances Created" field="chances_created" type="number" />
          <Field label="Big Chances Created" field="big_chances_created" type="number" />
        </div>
      </div>

      <div style={styles.section}>
        <p style={styles.sectionLabel}>CLASSIFICATION</p>
        <div style={styles.grid3}>
          <Field label="Tournament" field="tournament" options={[
            { value: "mens_fifa_wc_2022", label: "Men's WC 2022" },
            { value: "womens_fifa_wc_2023", label: "Women's WC 2023" },
            { value: "mens_fifa_wc_2026", label: "Men's WC 2026" },
          ]} />
          <Field label="Gender" field="gender" options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
          ]} />
          <Field label="Format" field="format" options={[{ value: "international", label: "International" }]} />
          <Field label="Season" field="season" type="number" />
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ ...styles.button, ...(loading ? styles.buttonDisabled : {}) }}
      >
        {loading ? "⟳ Saving…" : "＋ Save Player Stats"}
      </button>

      {result && (
        <div style={{ ...styles.result, borderColor: result.success ? "#22c55e" : "#ef4444" }}>
          <span style={{ color: result.success ? "#22c55e" : "#ef4444", marginRight: 6 }}>
            {result.success ? "✓" : "✕"}
          </span>
          {result.message}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    fontFamily: "'DM Mono','Courier New',monospace",
    background: "#0a0a0f",
    color: "#e8e8f0",
    borderRadius: 12,
    padding: "28px 32px",
    maxWidth: 900,
    margin: "0 auto",
    border: "1px solid #1e1e2e",
  },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 },
  dot: { width: 10, height: 10, borderRadius: "50%", background: "#f472b6", boxShadow: "0 0 8px #f472b6" },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, color: "#444", fontWeight: 700, margin: "0 0 12px", borderBottom: "1px solid #1a1a1a", paddingBottom: 6 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px 16px" },
  fieldWrap: { display: "flex", flexDirection: "column" as const },
  label: { fontSize: 11, letterSpacing: 0.5, color: "#666", marginBottom: 5 },
  input: { background: "#111118", border: "1px solid #222", borderRadius: 7, padding: "9px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit" },
  inputError: { borderColor: "#ef4444" },
  errorMsg: { fontSize: 11, color: "#ef4444", marginTop: 4 },
  button: { width: "100%", padding: "14px 16px", background: "#ef4444", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: 0.5, marginTop: 8 },
  buttonDisabled: { opacity: 0.5, cursor: "not-allowed" },
  result: { marginTop: 16, padding: "14px 16px", border: "1px solid", borderRadius: 8, background: "#0d0d15", fontSize: 13 },
};
