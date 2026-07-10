// components/fifa-component/FifaManualClubForm.tsx
"use client";

import { useState } from "react";

type Mode = "create" | "update";

interface FormState {
  club_id: string;
  country: string;
  fifa_rank: string;
  world_cup_apps: string;
  matches_played: string;
  wins: string;
  draws: string;
  losses: string;
  goals_for: string;
  goals_against: string;
  goal_difference: string;
  head_coach_2026: string;
  captain_2026: string;
  all_time_best_finish: string;
  tournament: string;
  gender: string;
}

// Stat fields patched on daily update — metadata excluded from patch form
const STAT_FIELDS: (keyof FormState)[] = [
  "matches_played", "wins", "draws", "losses",
  "goals_for", "goals_against", "goal_difference", "fifa_rank",
];

const EMPTY: FormState = {
  club_id: "", country: "", fifa_rank: "",
  world_cup_apps: "", matches_played: "", wins: "", draws: "", losses: "",
  goals_for: "", goals_against: "", goal_difference: "",
  head_coach_2026: "", captain_2026: "", all_time_best_finish: "",
  tournament: "FIFA World Cup", gender: "male",
};

export default function FifaManualClubForm() {
  const [mode, setMode] = useState<Mode>("create");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (field: keyof FormState, value: string) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (["goals_for", "goals_against"].includes(field)) {
        const gf = parseInt(field === "goals_for" ? value : f.goals_for, 10);
        const ga = parseInt(field === "goals_against" ? value : f.goals_against, 10);
        if (!isNaN(gf) && !isNaN(ga)) next.goal_difference = String(gf - ga);
      }
      return next;
    });
    if (fieldErrors[field]) setFieldErrors((e) => { const n = { ...e }; delete n[field]; return n; });
  };

  // In update mode: fetch current Firestore values to pre-fill the form
  const fetchClub = async () => {
    if (!form.club_id.trim()) return;
    setFetching(true);
    setResult(null);
    try {
      const res = await fetch(`/api/fifa-clubs/${form.club_id.trim().toUpperCase()}`);
      if (res.status === 404) {
        setResult({ success: false, message: `Club ${form.club_id.toUpperCase()} not found` });
        return;
      }
      const data = await res.json();
      if (data.success) {
        const d = data.data;
        setForm({
          club_id:            d.club_id ?? "",
          country:            d.country ?? "",
          fifa_rank:          String(d.fifa_rank ?? ""),
          world_cup_apps:     String(d.world_cup_apps ?? ""),
          matches_played:     String(d.matches_played ?? ""),
          wins:               String(d.wins ?? ""),
          draws:              String(d.draws ?? ""),
          losses:             String(d.losses ?? ""),
          goals_for:          String(d.goals_for ?? ""),
          goals_against:      String(d.goals_against ?? ""),
          goal_difference:    String(d.goal_difference ?? ""),
          head_coach_2026:    d.head_coach_2026 ?? "",
          captain_2026:       d.captain_2026 ?? "",
          all_time_best_finish: d.all_time_best_finish ?? "",
          tournament:         d.tournament ?? "FIFA World Cup",
          gender:             d.gender ?? "male",
        });
        setResult({ success: true, message: `Loaded ${d.club_id} — edit fields below and save` });
      }
    } catch {
      setResult({ success: false, message: "Network error fetching club" });
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    setFieldErrors({});

    const num = (v: string) => v === "" ? null : parseInt(v, 10);

    if (mode === "create") {
      const payload = {
        club_id: form.club_id.toUpperCase().trim(),
        country: form.country.trim(),
        fifa_rank: num(form.fifa_rank),
        world_cup_apps: num(form.world_cup_apps),
        matches_played: num(form.matches_played),
        wins: num(form.wins),
        draws: num(form.draws),
        losses: num(form.losses),
        goals_for: num(form.goals_for),
        goals_against: num(form.goals_against),
        goal_difference: num(form.goal_difference),
        head_coach_2026: form.head_coach_2026.trim() || null,
        captain_2026: form.captain_2026.trim() || null,
        all_time_best_finish: form.all_time_best_finish.trim() || null,
        tournament: form.tournament,
        gender: form.gender,
        format: "international",
        source_file: "admin_manual",
      };
      try {
        const res = await fetch("/api/fifa-clubs", {
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
          setResult({ success: true, message: `Club ${data.club_id} created ✓` });
          setForm(EMPTY);
        } else {
          setResult({ success: false, message: data.error ?? "Unknown error" });
        }
      } catch {
        setResult({ success: false, message: "Network error" });
      }
    } else {
      // PATCH — only send stat fields that are filled
      const patch: Record<string, unknown> = {};
      for (const f of STAT_FIELDS) {
        if (form[f] !== "") patch[f] = num(form[f] as string);
      }
      if (Object.keys(patch).length === 0) {
        setResult({ success: false, message: "No fields to update" });
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/fifa-clubs/${form.club_id.trim().toUpperCase()}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (res.status === 422 && data.errors) {
          const errs: Record<string, string> = {};
          data.errors.forEach((e: { field: string; message: string }) => { errs[e.field] = e.message; });
          setFieldErrors(errs);
          setResult({ success: false, message: "Fix highlighted fields" });
        } else if (data.success) {
          setResult({ success: true, message: `Club ${data.club_id} updated ✓` });
        } else {
          setResult({ success: false, message: data.error ?? "Unknown error" });
        }
      } catch {
        setResult({ success: false, message: "Network error" });
      }
    }
    setLoading(false);
  };

  const F = ({
    label, field, type = "text", placeholder = "", options, readOnly, updateOnly,
  }: {
    label: string; field: keyof FormState; type?: string; placeholder?: string;
    options?: { value: string; label: string }[]; readOnly?: boolean; updateOnly?: boolean;
  }) => {
    if (updateOnly && mode !== "update") return null;
    return (
      <div style={f.fieldWrap}>
        <label style={f.label}>{label}</label>
        {options ? (
          <select
            value={form[field]}
            onChange={(e) => set(field, e.target.value)}
            disabled={mode === "update"}
            style={{ ...f.input, ...(fieldErrors[field] ? f.inputError : {}), ...(mode === "update" ? f.inputLocked : {}) }}
          >
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type={type}
            value={form[field]}
            onChange={(e) => set(field, e.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            style={{
              ...f.input,
              ...(fieldErrors[field] ? f.inputError : {}),
              ...(readOnly ? f.inputReadOnly : {}),
            }}
          />
        )}
        {fieldErrors[field] && <span style={f.errorMsg}>{fieldErrors[field]}</span>}
      </div>
    );
  };

  const accentColor = mode === "create" ? "#f59e0b" : "#38bdf8";
  const dotShadow = mode === "create" ? "0 0 8px #f59e0b" : "0 0 8px #38bdf8";

  return (
    <div style={f.wrapper}>
      <div style={f.header}>
        <div style={{ ...f.dot, background: accentColor, boxShadow: dotShadow }} />
        <h2 style={f.title}>
          {mode === "create" ? "Manual Club Entry" : "Update Club Stats"}
        </h2>
        <span style={f.badge}>{mode === "create" ? "CREATE" : "PATCH"}</span>
      </div>

      {/* Mode toggle */}
      <div style={f.modeRow}>
        {(["create", "update"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setResult(null); setFieldErrors({}); if (m === "create") setForm(EMPTY); }}
            style={{
              ...f.modeBtn,
              ...(mode === m ? { borderColor: accentColor, color: accentColor, background: "#0d0d1a" } : {}),
            }}
          >
            {m === "create" ? "＋ Create New Club" : "✎ Update Existing Stats"}
          </button>
        ))}
      </div>

      {/* Update mode: club ID lookup */}
      {mode === "update" && (
        <div style={f.lookupRow}>
          <div style={{ flex: 1 }}>
            <label style={f.label}>CLUB ID TO UPDATE</label>
            <input
              value={form.club_id}
              onChange={(e) => set("club_id", e.target.value.toUpperCase())}
              placeholder="BRA"
              style={f.input}
            />
          </div>
          <button
            onClick={fetchClub}
            disabled={!form.club_id.trim() || fetching}
            style={{ ...f.fetchBtn, ...(!form.club_id.trim() ? f.fetchBtnDisabled : {}) }}
          >
            {fetching ? "⟳" : "Load →"}
          </button>
        </div>
      )}

      {/* Create mode: classification */}
      {mode === "create" && (
        <div style={f.section}>
          <p style={f.sectionLabel}>CLASSIFICATION</p>
          <div style={f.grid2}>
            <F label="Tournament" field="tournament" options={[
              { value: "FIFA World Cup", label: "Men's FIFA World Cup" },
              { value: "FIFA Women's World Cup", label: "Women's FIFA World Cup" },
            ]} />
            <F label="Gender" field="gender" options={[
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
            ]} />
          </div>
        </div>
      )}

      {/* Identity */}
      <div style={f.section}>
        <p style={f.sectionLabel}>CLUB IDENTITY</p>
        <div style={f.grid3}>
          {mode === "create" && (
            <F label="Club ID (2–3 chars)" field="club_id" placeholder="BRA" />
          )}
          {mode === "create" && <F label="Country" field="country" placeholder="Brazil" />}
          <F label="FIFA Rank" field="fifa_rank" type="number" placeholder="6" />
        </div>
      </div>

      {/* Campaign stats */}
      <div style={f.section}>
        <p style={f.sectionLabel}>
          {mode === "update" ? "STATS TO PATCH (leave blank to skip)" : "CAMPAIGN STATS"}
        </p>
        <div style={f.grid3}>
          <F label="World Cup Apps" field="world_cup_apps" type="number" placeholder="22" />
          <F label="Matches Played" field="matches_played" type="number" placeholder="114" />
          <div />
          <F label="Wins" field="wins" type="number" placeholder="76" />
          <F label="Draws" field="draws" type="number" placeholder="19" />
          <F label="Losses" field="losses" type="number" placeholder="19" />
        </div>
      </div>

      {/* Goals */}
      <div style={f.section}>
        <p style={f.sectionLabel}>GOALS</p>
        <div style={f.grid3}>
          <F label="Goals For (GF)" field="goals_for" type="number" placeholder="237" />
          <F label="Goals Against (GA)" field="goals_against" type="number" placeholder="108" />
          <F label="Goal Difference (auto)" field="goal_difference" type="number" placeholder="129" readOnly />
        </div>
      </div>

      {/* 2026 squad — create only */}
      {mode === "create" && (
        <div style={f.section}>
          <p style={f.sectionLabel}>2026 SQUAD</p>
          <div style={f.grid2}>
            <F label="2026 Head Coach" field="head_coach_2026" placeholder="Dorival Júnior" />
            <F label="2026 Captain" field="captain_2026" placeholder="Danilo" />
          </div>
        </div>
      )}

      {mode === "create" && (
        <div style={f.section}>
          <p style={f.sectionLabel}>HISTORICAL</p>
          <F label="All-Time Best Finish" field="all_time_best_finish" placeholder="5 Titles" />
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          ...f.btn,
          background: accentColor,
          ...(loading ? f.btnDisabled : {}),
        }}
      >
        {loading
          ? "⟳ Saving…"
          : mode === "create" ? "＋ Create Club Record" : "✎ Patch Stats"}
      </button>

      {result && (
        <div style={{ ...f.result, borderColor: result.success ? "#22c55e" : "#ef4444" }}>
          <span style={{ color: result.success ? "#22c55e" : "#ef4444" }}>
            {result.success ? "✓" : "✕"}
          </span>{" "}{result.message}
        </div>
      )}
    </div>
  );
}

const f: Record<string, React.CSSProperties> = {
  wrapper: { fontFamily: "'DM Mono','Courier New',monospace", background: "#0a0a0f", color: "#e8e8f0", borderRadius: 12, padding: "28px 32px", maxWidth: 680, margin: "0 auto", border: "1px solid #1e1e2e" },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  title: { fontSize: 18, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  badge: { marginLeft: "auto", fontSize: 10, letterSpacing: 2, padding: "3px 8px", border: "1px solid #333", borderRadius: 4, color: "#888" },
  modeRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 },
  modeBtn: { padding: "10px 14px", background: "#111118", border: "1px solid #1e1e2e", borderRadius: 8, cursor: "pointer", color: "#555", fontSize: 12, fontWeight: 700, fontFamily: "inherit" },
  lookupRow: { display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 20 },
  fetchBtn: { padding: "9px 16px", background: "#38bdf8", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" as const },
  fetchBtnDisabled: { opacity: 0.3, cursor: "not-allowed" },
  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 10, letterSpacing: 2, color: "#444", fontWeight: 700, margin: "0 0 12px", borderBottom: "1px solid #1a1a1a", paddingBottom: 6 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 16px" },
  fieldWrap: { display: "flex", flexDirection: "column" as const },
  label: { fontSize: 11, letterSpacing: 0.5, color: "#666", marginBottom: 5 },
  input: { background: "#111118", border: "1px solid #222", borderRadius: 7, padding: "9px 12px", color: "#e8e8f0", fontSize: 13, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" as const },
  inputError: { borderColor: "#ef4444" },
  inputReadOnly: { opacity: 0.5, cursor: "not-allowed", background: "#0d0d15" },
  inputLocked: { opacity: 0.4, cursor: "not-allowed" },
  errorMsg: { fontSize: 11, color: "#ef4444", marginTop: 4 },
  btn: { width: "100%", padding: "13px", border: "none", borderRadius: 8, color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5, marginTop: 8 },
  btnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  result: { marginTop: 16, padding: "12px 16px", border: "1px solid", borderRadius: 8, fontSize: 13, background: "#0d0d15" },
};