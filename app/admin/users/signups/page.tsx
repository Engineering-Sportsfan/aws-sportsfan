"use client";
import { useEffect, useState } from "react";

type User = {
  email: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  avatar?: string;
  authMethod?: string;
  createdAt: number;
  lastLoginAt?: number;
  status: "active" | "disabled";
  role: "user" | "moderator" | "admin" | "host";
};

export default function SignupsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  useEffect(() => { fetchUsers(); }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(user: User) {
    const newStatus = user.status === "active" ? "disabled" : "active";
    setUpdating(user.email);
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, status: newStatus }),
      });
      setUsers(prev =>
        prev.map(u => u.email === user.email ? { ...u, status: newStatus } : u)
      );
    } catch {
      alert("Failed to update status.");
    } finally {
      setUpdating(null);
    }
  }

  async function handleRoleChange(email: string, role: string) {
    setUpdating(email);
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      setUsers(prev =>
        prev.map(u => u.email === email ? { ...u, role: role as User["role"] } : u)
      );
    } catch {
      alert("Failed to update role.");
    } finally {
      setUpdating(null);
    }
  }

  async function handleDelete(email: string) {
    if (!window.confirm(`Delete "${email}"? This cannot be undone.`)) return;
    setDeleting(email);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setUsers(prev => prev.filter(u => u.email !== email));
    } catch {
      alert("Failed to delete user.");
    } finally {
      setDeleting(null);
    }
  }

  const filtered = users.filter(u => {
    const query = search.toLowerCase();
    const matchesSearch = (
      (u.name || "").toLowerCase().includes(query) ||
      (u.firstName || "").toLowerCase().includes(query) ||
      (u.lastName || "").toLowerCase().includes(query) ||
      (u.email || "").toLowerCase().includes(query) ||
      (u.authMethod || "").toLowerCase().includes(query) ||
      (u.role || "").toLowerCase().includes(query)
    );

    if (methodFilter === "all") return matchesSearch;
    if (methodFilter === "google") return matchesSearch && (u.authMethod?.includes("Google"));
    if (methodFilter === "email") return matchesSearch && (u.authMethod?.includes("Email") || u.authMethod?.includes("Password"));
    return matchesSearch;
  });

  const totalActive = users.filter(u => u.status === "active").length;
  const totalGoogle = users.filter(u => u.authMethod?.includes("Google")).length;
  const totalEmail = users.filter(u => u.authMethod?.includes("Password") || u.authMethod?.includes("Email")).length;

  return (
    <>
      {/* Responsive styles */}
      <style>{`
        .users-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (max-width: 768px) {
          .users-stats { grid-template-columns: repeat(2, 1fr); }
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
          .user-count  { width: 100%; text-align: right; }
        }

        .table-scroll-x {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .table-scroll-x table {
          width: 100%;
          border-collapse: collapse;
          min-width: 860px;
        }

        .action-cell {
          display: flex;
          gap: 6px;
          flex-wrap: nowrap;
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
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>User Management & Signups</h1>
          <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
            Complete list of all users registered via Google and Email & Password
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/admin/users/auth-issues"
            style={{
              background: "rgba(248, 81, 73, 0.15)", border: "1px solid rgba(248, 81, 73, 0.3)", borderRadius: 6,
              color: "#ff7b72", padding: "6px 12px", fontSize: 12, textDecoration: "none",
              display: "flex", alignItems: "center", gap: 6, fontWeight: 500,
            }}
          >
            ⚠️ View Auth Issues Logs
          </a>
          <button
            onClick={fetchUsers}
            style={{
              background: "#21262d", border: "1px solid #30363d", borderRadius: 6,
              color: "#c9d1d9", padding: "6px 12px", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6
            }}
          >
            🔄 Refresh List
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="users-stats">
        {[
          { label: "Total Users", value: users.length, color: "#388bfd" },
          { label: "Active", value: totalActive, color: "#2ea043" },
          { label: "Google Logins", value: totalGoogle, color: "#e36209" },
          { label: "Email / Password", value: totalEmail, color: "#a371f7" },
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

      {/* Table Card */}
      <div className="table-container">

        {/* Toolbar */}
        <div className="toolbar-wrap">
          <div className="search-wrap">
            <span style={{ color: "#7d8590" }}>🔍</span>
            <input
              placeholder="Search name, email, auth method…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                border: "none", background: "none", outline: "none",
                color: "#e6edf3", fontSize: 12, width: "100%", fontFamily: "inherit",
              }}
            />
          </div>

          {/* Filter by Auth Method */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { id: "all", label: "All Methods" },
              { id: "google", label: "Google" },
              { id: "email", label: "Email & Password" }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMethodFilter(m.id)}
                style={{
                  background: methodFilter === m.id ? "#388bfd" : "#21262d",
                  color: methodFilter === m.id ? "#ffffff" : "#8b949e",
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

          <div className="user-count" style={{ marginLeft: "auto", fontSize: 12, color: "#7d8590" }}>
            {filtered.length} of {users.length} users
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="table-scroll-x">
          <table>
            <thead>
              <tr style={{ background: "#1c2330", borderBottom: "1px solid #21282f" }}>
                {["#", "User", "Email", "Login / Signup Method", "Role", "Signed Up", "Last Login", "Status", "Actions"].map(h => (
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
                  <td colSpan={9} style={{ padding: 30, textAlign: "center", color: "#7d8590" }}>
                    Loading users from DynamoDB…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: 30, textAlign: "center", color: "#7d8590" }}>
                    No users found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((u, i) => {
                  const displayName = u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email.split("@")[0];
                  const initials = displayName.slice(0, 2).toUpperCase() || "U";
                  const isDeleting = deleting === u.email;
                  const isUpdating = updating === u.email;
                  const isActive = u.status !== "disabled";

                  const isGoogle = u.authMethod?.includes("Google");
                  const isPassword = u.authMethod?.includes("Password") || u.authMethod?.includes("Email");

                  return (
                    <tr key={u.email} style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid #21282f" : "none",
                      opacity: isDeleting ? 0.4 : 1,
                      transition: "opacity .2s",
                      background: !isActive ? "rgba(218,54,51,.04)" : "transparent",
                    }}>

                      {/* # */}
                      <td style={{ padding: "10px 14px", color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {i + 1}
                      </td>

                      {/* User Info (Avatar + Name) */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {u.avatar ? (
                            <img
                              src={u.avatar}
                              alt={displayName}
                              style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }}
                            />
                          ) : (
                            <div style={{
                              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                              background: isGoogle ? "rgba(227, 98, 9, 0.2)" : "rgba(56, 139, 253, 0.2)",
                              color: isGoogle ? "#f0883e" : "#58a6ff",
                              display: "grid", placeItems: "center",
                              fontSize: 11, fontWeight: 700,
                            }}>{initials}</div>
                          )}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>
                              {displayName}
                            </div>
                            {u.userId && (
                              <div style={{ fontSize: 10, color: "#8b949e", fontFamily: "var(--font-mono)" }}>
                                {u.userId}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#8b949e", whiteSpace: "nowrap" }}>
                        {u.email}
                      </td>

                      {/* Login / Auth Method Badge */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        {isGoogle && isPassword ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                            background: "rgba(163, 113, 247, 0.15)", color: "#d2a8ff", border: "1px solid rgba(163, 113, 247, 0.3)"
                          }}>
                            ⚡ Google + Password
                          </span>
                        ) : isGoogle ? (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                            background: "rgba(227, 98, 9, 0.15)", color: "#f0883e", border: "1px solid rgba(227, 98, 9, 0.3)"
                          }}>
                            <span style={{ fontWeight: 800 }}>G</span> Google
                          </span>
                        ) : (
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                            background: "rgba(56, 139, 253, 0.15)", color: "#58a6ff", border: "1px solid rgba(56, 139, 253, 0.3)"
                          }}>
                            ✉️ Email & Password
                          </span>
                        )}
                      </td>

                      {/* Role */}
                      <td style={{ padding: "10px 14px" }}>
                        <select
                          value={u.role ?? "user"}
                          disabled={isUpdating}
                          onChange={e => handleRoleChange(u.email, e.target.value)}
                          style={{
                            background: "#0d1117", border: "1px solid #2d3748",
                            borderRadius: 5, padding: "3px 8px",
                            color: "#e6edf3", fontSize: 11,
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          <option value="user">User</option>
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                          <option value="host">Host</option>
                        </select>
                      </td>

                      {/* Signed Up */}
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "#8b949e", whiteSpace: "nowrap" }}>
                        {u.createdAt
                          ? new Date(u.createdAt).toLocaleString("en-IN", {
                            dateStyle: "medium", timeStyle: "short",
                          })
                          : "—"}
                      </td>

                      {/* Last Login */}
                      <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "#8b949e", whiteSpace: "nowrap" }}>
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString("en-IN", {
                            dateStyle: "medium", timeStyle: "short",
                          })
                          : "—"}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 10,
                          fontSize: 10, fontWeight: 600,
                          background: isActive ? "rgba(46,160,67,.15)" : "rgba(194, 74, 72, 0.15)",
                          color: isActive ? "#2ea043" : "#da3633",
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                          {isActive ? "Active" : "Disabled"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "10px 14px" }}>
                        <div className="action-cell">
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={isUpdating || isDeleting}
                            style={{
                              padding: "4px 10px", borderRadius: 5,
                              fontSize: 11, fontWeight: 500,
                              border: `1px solid ${isActive ? "#d29922" : "#2ea043"}`,
                              background: "transparent",
                              color: isActive ? "#d29922" : "#2ea043",
                              cursor: isUpdating ? "not-allowed" : "pointer",
                              fontFamily: "inherit", transition: "all .15s",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isUpdating ? "…" : isActive ? "Disable" : "Enable"}
                          </button>

                          <button
                            onClick={() => handleDelete(u.email)}
                            disabled={!!deleting || isUpdating}
                            style={{
                              padding: "4px 10px", borderRadius: 5,
                              fontSize: 11, fontWeight: 500,
                              border: "1px solid #da3633",
                              background: "transparent", color: "#da3633",
                              cursor: isDeleting ? "not-allowed" : "pointer",
                              fontFamily: "inherit", transition: "all .15s",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isDeleting ? "Deleting…" : "Delete"}
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