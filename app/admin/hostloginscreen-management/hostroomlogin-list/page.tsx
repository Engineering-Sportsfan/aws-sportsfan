"use client";
import { useEffect, useState } from "react";

type Host = {
  email: string;
  firstName: string;
  lastName: string;
  createdAt: number;
  status: "active" | "disabled";
  role: "host";
  createdBy?: string;
  source?: string;
  isFirstLogin?: boolean;
  passwordChangedAt?: number;
  updatedAt?: number;
};

export default function HostsManagementPage() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchHosts(); }, []);

  async function fetchHosts() {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      // Filter only users with role === "host"
      const allUsers = data.users ?? [];
      const hostUsers = allUsers.filter((user: Host) => user.role === "host");
      setHosts(hostUsers);
    } catch {
      setHosts([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(host: Host) {
    const newStatus = host.status === "active" ? "disabled" : "active";
    setUpdating(host.email);
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: host.email, status: newStatus }),
      });
      setHosts(prev =>
        prev.map(h => h.email === host.email ? { ...h, status: newStatus } : h)
      );
    } catch {
      alert("Failed to update status.");
    } finally {
      setUpdating(null);
    }
  }

  async function handleDelete(email: string) {
    if (!window.confirm(`Delete host "${email}"? This cannot be undone.`)) return;
    setDeleting(email);
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setHosts(prev => prev.filter(h => h.email !== email));
    } catch {
      alert("Failed to delete host.");
    } finally {
      setDeleting(null);
    }
  }

  const filtered = hosts.filter(h =>
    `${h.firstName} ${h.lastName} ${h.email}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const totalActive = hosts.filter(h => h.status === "active").length;
  const totalDisabled = hosts.filter(h => h.status === "disabled").length;
  const totalHosts = hosts.length;

  return (
    <>
      {/* Inject responsive styles */}
      <style>{`
        .hosts-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (max-width: 480px) {
          .hosts-stats { grid-template-columns: 1fr 1fr; }
          .hosts-stats > :last-child { grid-column: 1 / -1; }
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
          padding: 5px 10px;
          width: 220px;
        }
        @media (max-width: 480px) {
          .search-wrap { width: 100%; }
          .host-count  { width: 100%; text-align: right; }
        }

        /* Horizontal scroll for table */
        .table-scroll-x {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .table-scroll-x table {
          width: 100%;
          border-collapse: collapse;
          min-width: 700px;
        }

        /* Compact action buttons on small screens */
        .action-cell {
          display: flex;
          gap: 6px;
          flex-wrap: nowrap;
        }
        @media (max-width: 900px) {
          .action-cell { flex-direction: column; gap: 4px; }
        }

        /* Table container */
        .table-container {
          background: #161b22;
          border: 1px solid #21282f;
          border-radius: 6px;
          overflow: hidden;
        }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600 }}>Host Management</h1>
        <p style={{ color: "#7d8590", fontSize: 12, marginTop: 2 }}>
          Manage host accounts, control access and account status
        </p>
      </div>

      {/* Stat Cards */}
      <div className="hosts-stats">
        {[
          { label: "Total Hosts", value: totalHosts, color: "#388bfd" },
          { label: "Active Hosts", value: totalActive, color: "#2ea043" },
          { label: "Disabled Hosts", value: totalDisabled, color: "#da3633" },
        ].map(s => (
          <div key={s.label} style={{
            background: "#161b22", border: "1px solid #21282f",
            borderTop: `2px solid ${s.color}`, borderRadius: 6, padding: 16,
          }}>
            <div style={{ fontSize: 11, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".06em" }}>
              {s.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, fontFamily: "var(--font-mono)", marginTop: 6 }}>
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
            <span style={{ color: "#7d8590" }}>⌕</span>
            <input
              placeholder="Search host name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                border: "none", background: "none", outline: "none",
                color: "#e6edf3", fontSize: 12, width: "100%", fontFamily: "inherit",
              }}
            />
          </div>
          <div className="host-count" style={{ marginLeft: "auto", fontSize: 12, color: "#7d8590" }}>
            {filtered.length} of {hosts.length} hosts
          </div>
        </div>

        {/* Scrollable Table */}
        <div className="table-scroll-x">
          <table>
            <thead>
              <tr style={{ background: "#1c2330", borderBottom: "1px solid #21282f" }}>
                {["#", "Name", "Email", "Signed Up", "Created By", "Status", "Actions"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "8px 14px",
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
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#7d8590" }}>
                    Loading hosts...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#7d8590" }}>
                    No hosts found
                  </td>
                </tr>
              ) : (
                filtered.map((h, i) => {
                  const initials = `${h.firstName?.[0] ?? ""}${h.lastName?.[0] ?? ""}`.toUpperCase() || "H";
                  const isDeleting = deleting === h.email;
                  const isUpdating = updating === h.email;
                  const isActive = h.status !== "disabled";

                  return (
                    <tr key={h.email} style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid #21282f" : "none",
                      opacity: isDeleting ? 0.4 : 1,
                      transition: "opacity .2s",
                      background: !isActive ? "rgba(218,54,51,.04)" : "transparent",
                    }}>

                      {/* # */}
                      <td style={{ padding: "9px 14px", color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {i + 1}
                      </td>

                      {/* Name */}
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                            background: isActive ? "rgba(31,111,235,.2)" : "rgba(218,54,51,.15)",
                            color: isActive ? "#388bfd" : "#da3633",
                            display: "grid", placeItems: "center",
                            fontSize: 10, fontWeight: 700,
                          }}>{initials}</div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>
                            {h.firstName ?? "—"} 
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: "9px 14px", fontSize: 12, color: "#7d8590", whiteSpace: "nowrap" }}>
                        {h.email}
                      </td>

                      {/* Signed Up */}
                      <td style={{ padding: "9px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: "#7d8590", whiteSpace: "nowrap" }}>
                        {h.createdAt
                          ? new Date(h.createdAt).toLocaleString("en-IN", {
                            dateStyle: "medium", timeStyle: "short",
                          })
                          : "—"}
                      </td>

                      {/* Created By */}
                      <td style={{ padding: "9px 14px", fontSize: 12, color: "#7d8590", whiteSpace: "nowrap" }}>
                        {h.createdBy || "Admin"}
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap" }}>
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
                      <td style={{ padding: "9px 14px" }}>
                        <div className="action-cell">
                          <button
                            onClick={() => handleToggleStatus(h)}
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
                            onClick={() => handleDelete(h.email)}
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