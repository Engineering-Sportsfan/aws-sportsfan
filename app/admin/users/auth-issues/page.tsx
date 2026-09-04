"use client";
import { useEffect, useState } from "react";

type AuthIssue = {
  issueId: string;
  entityId?: string;
  sk?: string;
  email: string;
  type: "login" | "signup" | "otp";
  reason: string;
  endpoint: string;
  ip?: string;
  status: "pending" | "resolved";
  timestamp: number;
  metadata?: Record<string, any>;
};

type Stats = {
  total: number;
  login: number;
  signup: number;
  otp: number;
  pending: number;
};

export default function AuthIssuesPage() {
  const [issues, setIssues] = useState<AuthIssue[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, login: 0, signup: 0, otp: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchIssues();
  }, [typeFilter, statusFilter]);

  async function fetchIssues() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/admin/auth-issues?${params.toString()}`);
      const data = await res.json();
      setIssues(data.issues || []);
      if (data.stats) setStats(data.stats);
    } catch {
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleResolve(issue: AuthIssue) {
    const nextStatus = issue.status === "resolved" ? "pending" : "resolved";
    setActionLoading(issue.issueId);
    try {
      await fetch("/api/admin/auth-issues", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: issue.issueId,
          entityId: issue.entityId,
          sk: issue.sk,
          status: nextStatus,
        }),
      });
      setIssues(prev =>
        prev.map(i => i.issueId === issue.issueId ? { ...i, status: nextStatus } : i)
      );
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth-issues-updated"));
      }
    } catch {
      alert("Failed to update status.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(issue: AuthIssue) {
    if (!window.confirm(`Delete issue log for "${issue.email}"?`)) return;
    setActionLoading(issue.issueId);
    try {
      await fetch("/api/admin/auth-issues", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: issue.issueId,
          entityId: issue.entityId,
          sk: issue.sk,
        }),
      });
      setIssues(prev => prev.filter(i => i.issueId !== issue.issueId));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth-issues-updated"));
      }
    } catch {
      alert("Failed to delete log.");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleClearAll() {
    if (!window.confirm("Are you sure you want to clear ALL logged issues?")) return;
    setLoading(true);
    try {
      await fetch("/api/admin/auth-issues", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      setIssues([]);
      setStats({ total: 0, login: 0, signup: 0, otp: 0, pending: 0 });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth-issues-updated"));
      }
    } catch {
      alert("Failed to clear logs.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = issues.filter(i => {
    const q = search.toLowerCase();
    return (
      (i.email || "").toLowerCase().includes(q) ||
      (i.reason || "").toLowerCase().includes(q) ||
      (i.endpoint || "").toLowerCase().includes(q) ||
      (i.type || "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <style>{`
        .issues-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (max-width: 768px) {
          .issues-stats { grid-template-columns: repeat(2, 1fr); }
        }

        .toolbar-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #21282f;
          flex-wrap: wrap;
        }
        .search-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #0d1117;
          border: 1px solid #2d3748;
          border-radius: 6px;
          padding: 6px 12px;
          width: 260px;
        }
        @media (max-width: 480px) {
          .search-wrap { width: 100%; }
        }

        .table-scroll-x {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .table-scroll-x table {
          width: 100%;
          border-collapse: collapse;
          min-width: 880px;
        }

        .table-container {
          background: #161b22;
          border: 1px solid #21282f;
          border-radius: 8px;
          overflow: hidden;
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            ⚠️ Auth Issues Tracker
          </h1>
          <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
            Real-time audit log of users who faced Login, Signup, and OTP verification failures
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={fetchIssues}
            style={{
              background: "#21262d", border: "1px solid #30363d", borderRadius: 6,
              color: "#c9d1d9", padding: "6px 12px", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6
            }}
          >
            🔄 Refresh
          </button>
          {issues.length > 0 && (
            <button
              onClick={handleClearAll}
              style={{
                background: "rgba(218,54,51,0.15)", border: "1px solid rgba(218,54,51,0.4)", borderRadius: 6,
                color: "#ff7b72", padding: "6px 12px", fontSize: 12, cursor: "pointer",
              }}
            >
              🗑️ Clear All Logs
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="issues-stats">
        {[
          { label: "Total Logged Issues", value: stats.total, color: "#f85149" },
          { label: "Login Failures", value: stats.login, color: "#da3633" },
          { label: "Signup Failures", value: stats.signup, color: "#d29922" },
          { label: "OTP Failures", value: stats.otp, color: "#a371f7" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#161b22", border: "1px solid #21282f",
            borderTop: `2px solid ${s.color}`, borderRadius: 6, padding: 14,
          }}>
            <div style={{ fontSize: 11, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".06em" }}>
              {s.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 6 }}>
              {loading ? "—" : s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Main Table Card */}
      <div className="table-container">

        {/* Toolbar with Filters */}
        <div className="toolbar-wrap">
          <div className="search-wrap">
            <span style={{ color: "#7d8590" }}>🔍</span>
            <input
              placeholder="Search email, error, endpoint…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                border: "none", background: "none", outline: "none",
                color: "#e6edf3", fontSize: 12, width: "100%", fontFamily: "inherit",
              }}
            />
          </div>

          {/* Type Filter */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "all", label: "All Types" },
              { id: "login", label: "🔴 Login" },
              { id: "signup", label: "🟠 Signup" },
              { id: "otp", label: "🟣 OTP" },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setTypeFilter(m.id)}
                style={{
                  background: typeFilter === m.id ? "#388bfd" : "#21262d",
                  color: typeFilter === m.id ? "#ffffff" : "#8b949e",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "all .15s"
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "all", label: "All Status" },
              { id: "pending", label: "Pending" },
              { id: "resolved", label: "Resolved" },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setStatusFilter(m.id)}
                style={{
                  background: statusFilter === m.id ? "#238636" : "#21262d",
                  color: statusFilter === m.id ? "#ffffff" : "#8b949e",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: 500,
                  transition: "all .15s"
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", fontSize: 12, color: "#7d8590" }}>
            Showing {filtered.length} of {issues.length} issues
          </div>
        </div>

        {/* Table */}
        <div className="table-scroll-x">
          <table>
            <thead>
              <tr style={{ background: "#1c2330", borderBottom: "1px solid #21282f" }}>
                {["#", "User Email", "Issue Type", "Failure Reason", "Endpoint", "Timestamp", "Status", "Actions"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "10px 14px",
                    fontSize: 10, fontWeight: 600, letterSpacing: ".07em",
                    textTransform: "uppercase", color: "#7d8590",
                    whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 35, textAlign: "center", color: "#7d8590" }}>
                    Loading auth failure logs…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 35, textAlign: "center", color: "#7d8590" }}>
                    🎉 No auth issues recorded! Everything is running smoothly.
                  </td>
                </tr>
              ) : (
                filtered.map((item, i) => {
                  const isResolved = item.status === "resolved";
                  const isActioning = actionLoading === item.issueId;

                  let badgeColor = "#58a6ff";
                  let badgeBg = "rgba(56, 139, 253, 0.15)";
                  let badgeBorder = "rgba(56, 139, 253, 0.3)";

                  if (item.type === "login") {
                    badgeColor = "#ff7b72";
                    badgeBg = "rgba(248, 81, 73, 0.15)";
                    badgeBorder = "rgba(248, 81, 73, 0.3)";
                  } else if (item.type === "signup") {
                    badgeColor = "#d29922";
                    badgeBg = "rgba(210, 153, 34, 0.15)";
                    badgeBorder = "rgba(210, 153, 34, 0.3)";
                  } else if (item.type === "otp") {
                    badgeColor = "#d2a8ff";
                    badgeBg = "rgba(163, 113, 247, 0.15)";
                    badgeBorder = "rgba(163, 113, 247, 0.3)";
                  }

                  return (
                    <tr key={item.issueId} style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid #21282f" : "none",
                      opacity: isResolved ? 0.6 : 1,
                      transition: "all .2s",
                      background: isResolved ? "transparent" : "rgba(218,54,51,.02)",
                    }}>
                      {/* # */}
                      <td style={{ padding: "10px 14px", color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {i + 1}
                      </td>

                      {/* Email */}
                      <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#e6edf3", whiteSpace: "nowrap" }}>
                        {item.email}
                      </td>

                      {/* Issue Type Badge */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
                          textTransform: "uppercase", letterSpacing: ".05em",
                          background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`
                        }}>
                          {item.type}
                        </span>
                      </td>

                      {/* Failure Reason */}
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#c9d1d9", maxWidth: 320 }}>
                        <span style={{ color: "#f85149", marginRight: 4 }}>✕</span>
                        {item.reason}
                      </td>

                      {/* Endpoint */}
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "#8b949e", whiteSpace: "nowrap" }}>
                        {item.endpoint}
                      </td>

                      {/* Timestamp */}
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "#8b949e", whiteSpace: "nowrap" }}>
                        {new Date(item.timestamp).toLocaleString("en-IN", {
                          dateStyle: "short", timeStyle: "medium",
                        })}
                      </td>

                      {/* Status */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 10,
                          fontSize: 10, fontWeight: 600,
                          background: isResolved ? "rgba(46,160,67,.15)" : "rgba(210,153,34,.15)",
                          color: isResolved ? "#2ea043" : "#d29922",
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                          {isResolved ? "Resolved" : "Pending"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => handleToggleResolve(item)}
                            disabled={isActioning}
                            style={{
                              padding: "4px 8px", borderRadius: 5,
                              fontSize: 10, fontWeight: 600,
                              border: `1px solid ${isResolved ? "#8b949e" : "#2ea043"}`,
                              background: "transparent",
                              color: isResolved ? "#8b949e" : "#2ea043",
                              cursor: "pointer",
                            }}
                          >
                            {isActioning ? "…" : isResolved ? "Reopen" : "Mark Resolved"}
                          </button>

                          <button
                            onClick={() => handleDelete(item)}
                            disabled={isActioning}
                            style={{
                              padding: "4px 8px", borderRadius: 5,
                              fontSize: 10, fontWeight: 600,
                              border: "1px solid #da3633",
                              background: "transparent", color: "#da3633",
                              cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
