// frontend/components/admin/ui.tsx
// Shared primitive components for the admin panel

import React from "react";

/* ── TOKENS ──────────────────────────────────────── */
export const C = {
  bg:        "#0d1117",
  surface:   "#161b22",
  surface2:  "#1c2330",
  border:    "#21282f",
  border2:   "#2d3748",
  text:      "#e6edf3",
  muted:     "#7d8590",
  accent:    "#1f6feb",
  accent2:   "#388bfd",
  green:     "#2ea043",
  greenDim:  "#1a3a24",
  red:       "#da3633",
  redDim:    "#3a1a1a",
  yellow:    "#d29922",
  yellowDim: "#3a2e0d",
} as const;

/* ── BADGE ───────────────────────────────────────── */
type BadgeVariant = "green" | "red" | "yellow" | "blue";
const BADGE_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  green:  { background: C.greenDim,             color: C.green },
  red:    { background: C.redDim,               color: C.red   },
  yellow: { background: C.yellowDim,            color: C.yellow },
  blue:   { background: "rgba(31,111,235,.15)", color: C.accent2 },
};

export function Badge({ variant, children, dot }: {
  variant: BadgeVariant; children: React.ReactNode; dot?: boolean;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 10,
      fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
      letterSpacing: ".03em", ...BADGE_STYLES[variant],
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />}
      {children}
    </span>
  );
}

/* ── STAT CARD ───────────────────────────────────── */
const CARD_ACCENT: Record<string, string> = {
  blue: C.accent2, green: C.green, yellow: C.yellow, red: C.red,
};

export function StatCard({ label, value, delta, deltaDir, color }: {
  label: string; value: string; delta?: string;
  deltaDir?: "up" | "down"; color: "blue" | "green" | "yellow" | "red";
}) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: 16, display: "flex", flexDirection: "column", gap: 8,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: CARD_ACCENT[color] }} />
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 500, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--font-mono)" }}>{value}</div>
      {delta && (
        <div style={{ fontSize: 11, color: deltaDir === "up" ? C.green : C.red }}>
          {deltaDir === "up" ? "▲" : "▼"} {delta}
        </div>
      )}
    </div>
  );
}

/* ── TABLE WRAPPER ───────────────────────────────── */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 6, overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

export function TableToolbar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
    }}>
      {children}
    </div>
  );
}

/* ── BUTTON ──────────────────────────────────────── */
type BtnVariant = "primary" | "ghost" | "danger";
export function Btn({
  children, variant = "ghost", sm, onClick,
}: {
  children: React.ReactNode; variant?: BtnVariant; sm?: boolean; onClick?: () => void;
}) {
  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: sm ? "4px 9px" : "6px 12px",
    borderRadius: 6, fontFamily: "inherit",
    fontSize: sm ? 11 : 12, fontWeight: 500,
    cursor: "pointer", border: "none", transition: "all .15s",
  };
  const styles: Record<BtnVariant, React.CSSProperties> = {
    primary: { ...base, background: C.accent,  color: "#fff" },
    ghost:   { ...base, background: "transparent", color: C.muted, border: `1px solid ${C.border2}` },
    danger:  { ...base, background: C.redDim,   color: C.red,   border: `1px solid ${C.red}` },
  };
  return <button style={styles[variant]} onClick={onClick}>{children}</button>;
}

/* ── AVATAR ──────────────────────────────────────── */
const AV_COLORS = ["av-blue","av-green","av-yellow","av-red"];
const AV_BG: Record<string, [string, string]> = {
  "av-blue":   ["rgba(31,111,235,.25)", C.accent2],
  "av-green":  ["rgba(46,160,67,.25)",  C.green],
  "av-yellow": ["rgba(210,153,34,.25)", C.yellow],
  "av-red":    ["rgba(218,54,51,.25)",  C.red],
};

export function Avatar({ initials, index = 0, size = 26 }: { initials: string; index?: number; size?: number }) {
  const key = AV_COLORS[index % AV_COLORS.length];
  const [bg, color] = AV_BG[key];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: bg, color, display: "grid", placeItems: "center",
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>{initials}</div>
  );
}

/* ── USER CELL ───────────────────────────────────── */
export function UserCell({ name, email, index }: { name: string; email: string; index?: number }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <Avatar initials={initials} index={index} />
      <div>
        <div style={{ fontWeight: 500, fontSize: 12 }}>{name}</div>
        <div style={{ fontSize: 11, color: C.muted }}>{email}</div>
      </div>
    </div>
  );
}

/* ── SEARCH INPUT ────────────────────────────────── */
export function SearchInput({ placeholder }: { placeholder?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: C.bg, border: `1px solid ${C.border2}`,
      borderRadius: 6, padding: "5px 10px", width: 200,
    }}>
      <span style={{ color: C.muted, fontSize: 13 }}>⌕</span>
      <input
        placeholder={placeholder ?? "Search…"}
        style={{
          border: "none", background: "none", outline: "none",
          color: C.text, fontFamily: "inherit", fontSize: 12, width: "100%",
        }}
      />
    </div>
  );
}

/* ── PAGINATION ──────────────────────────────────── */
export function Pagination({ total, perPage = 20, page = 1, label }: {
  total: number; perPage?: number; page?: number; label?: string;
}) {
  const pages = Math.ceil(total / perPage);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "12px 14px", borderTop: `1px solid ${C.border}`,
    }}>
      {Array.from({ length: Math.min(pages, 5) }, (_, i) => (
        <button key={i} style={{
          width: 28, height: 28, borderRadius: 6,
          display: "grid", placeItems: "center", cursor: "pointer",
          fontSize: 12, fontFamily: "var(--font-mono)",
          border: `1px solid ${i === page - 1 ? C.accent : C.border2}`,
          background: i === page - 1 ? C.accent : "none",
          color: i === page - 1 ? "#fff" : C.muted,
        }}>{i + 1}</button>
      ))}
      <div style={{ marginLeft: "auto", fontSize: 11, color: C.muted, fontFamily: "var(--font-mono)" }}>
        {label ?? `${total} items · Page ${page} of ${pages}`}
      </div>
    </div>
  );
}

/* ── FIELD ───────────────────────────────────────── */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: C.muted,
        textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

export function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} style={{
      width: "100%", background: C.bg, border: `1px solid ${C.border2}`,
      borderRadius: 6, padding: "8px 10px", color: C.text,
      fontFamily: "inherit", fontSize: 13, outline: "none",
      ...props.style,
    }} />
  );
}

/* ── TOGGLE ──────────────────────────────────────── */
export function Toggle({ defaultOn }: { defaultOn?: boolean }) {
  const [on, setOn] = React.useState(defaultOn ?? false);
  return (
    <div
      onClick={() => setOn(v => !v)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: on ? C.accent : C.border2,
        cursor: "pointer", position: "relative", transition: "background .2s",
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: on ? 19 : 3,
        width: 14, height: 14, borderRadius: "50%",
        background: "#fff", transition: "left .2s",
      }} />
    </div>
  );
}