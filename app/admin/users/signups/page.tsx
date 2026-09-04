"use client";
import { useEffect, useState, useMemo } from "react";

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

type SessionActivity = {
  activityId: string;
  entityId: string;
  sk: string;
  userId: string;
  email: string;
  userName: string;
  action: "login" | "logout" | "signup";
  date: string;
  time: string;
  timestamp: number;
  ip: string;
  location: string;
  userAgent: string;
  device: string;
  metadata?: Record<string, any>;
};

type DateSummary = {
  date: string;
  total: number;
  logins: number;
  logouts: number;
  uniqueUsers: number;
};

type SessionStats = {
  totalLoginsToday: number;
  uniqueUsersToday: number;
  totalLogoutsToday: number;
  totalRecorded: number;
  currentFilteredCount: number;
};

export default function SignupsAndActivityPage() {
  // Active Tab: "activity" (Date-wise Logs) or "users" (User Directory)
  const [activeTab, setActiveTab] = useState<"activity" | "users">("activity");

  // User Directory State
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  // Activity Logs State
  const [sessions, setSessions] = useState<SessionActivity[]>([]);
  const [availableDates, setAvailableDates] = useState<DateSummary[]>([]);
  const [activityStats, setActivityStats] = useState<SessionStats>({
    totalLoginsToday: 0,
    uniqueUsersToday: 0,
    totalLogoutsToday: 0,
    totalRecorded: 0,
    currentFilteredCount: 0,
  });
  const [activityLoading, setActivityLoading] = useState(true);

  // Filters for Activity Logs
  const [selectedDate, setSelectedDate] = useState<string>("today"); // "today" | "yesterday" | "all" | "YYYY-MM-DD"
  const [customDate, setCustomDate] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("all"); // "all" | "login" | "logout" | "signup"
  const [activitySearch, setActivitySearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grouped">("table");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Expanded cards in Grouped View
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchSessions();
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [selectedDate, actionFilter]);

  async function fetchUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchSessions() {
    setActivityLoading(true);
    try {
      let dateQuery = "";
      if (selectedDate === "today") dateQuery = todayStr;
      else if (selectedDate === "yesterday") dateQuery = yesterdayStr;
      else if (selectedDate === "all") dateQuery = "all";
      else dateQuery = selectedDate;

      const params = new URLSearchParams();
      if (dateQuery) params.set("date", dateQuery);
      if (actionFilter !== "all") params.set("action", actionFilter);

      const res = await fetch(`/api/admin/user-sessions?${params.toString()}`);
      const data = await res.json();
      setSessions(data.sessions || []);
      if (data.availableDates) setAvailableDates(data.availableDates);
      if (data.stats) setActivityStats(data.stats);
    } catch {
      setSessions([]);
    } finally {
      setActivityLoading(false);
    }
  }

  // Handle delete single session record
  async function handleDeleteSession(session: SessionActivity) {
    if (!window.confirm(`Delete activity record for "${session.email}" at ${session.time}?`)) return;
    setActionLoadingId(session.activityId);
    try {
      await fetch("/api/admin/user-sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: session.activityId,
          entityId: session.entityId,
          sk: session.sk,
        }),
      });
      setSessions(prev => prev.filter(s => s.activityId !== session.activityId));
    } catch {
      alert("Failed to delete record.");
    } finally {
      setActionLoadingId(null);
    }
  }

  // Handle clear logs for current date
  async function handleClearCurrentDate() {
    const targetDate = selectedDate === "today" ? todayStr : selectedDate === "yesterday" ? yesterdayStr : selectedDate;
    if (targetDate === "all") {
      if (!window.confirm("⚠️ Are you sure you want to delete ALL activity logs across all dates?")) return;
      setActivityLoading(true);
      try {
        await fetch("/api/admin/user-sessions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleteAll: true }),
        });
        setSessions([]);
        setAvailableDates([]);
        setActivityStats({ totalLoginsToday: 0, uniqueUsersToday: 0, totalLogoutsToday: 0, totalRecorded: 0, currentFilteredCount: 0 });
      } catch {
        alert("Failed to clear logs.");
      } finally {
        setActivityLoading(false);
      }
      return;
    }

    if (!window.confirm(`Delete all session records for date "${targetDate}"?`)) return;
    setActivityLoading(true);
    try {
      await fetch("/api/admin/user-sessions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: targetDate }),
      });
      fetchSessions();
    } catch {
      alert("Failed to clear date records.");
    } finally {
      setActivityLoading(false);
    }
  }

  // Export filtered sessions to CSV
  function handleExportCSV() {
    if (filteredSessions.length === 0) {
      alert("No records to export.");
      return;
    }

    const headers = ["Date", "Time", "User ID", "Email", "Name", "Action", "IP Address", "Location", "Device", "Timestamp"];
    const rows = filteredSessions.map(s => [
      `"${s.date}"`,
      `"${s.time}"`,
      `"${s.userId}"`,
      `"${s.email}"`,
      `"${s.userName.replace(/"/g, '""')}"`,
      `"${s.action.toUpperCase()}"`,
      `"${s.ip}"`,
      `"${s.location.replace(/"/g, '""')}"`,
      `"${s.device.replace(/"/g, '""')}"`,
      s.timestamp,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `user_activity_logs_${selectedDate}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Filtered Activity Sessions
  const filteredSessions = sessions.filter(s => {
    const q = activitySearch.toLowerCase();
    return (
      (s.email || "").toLowerCase().includes(q) ||
      (s.userId || "").toLowerCase().includes(q) ||
      (s.userName || "").toLowerCase().includes(q) ||
      (s.ip || "").toLowerCase().includes(q) ||
      (s.location || "").toLowerCase().includes(q) ||
      (s.device || "").toLowerCase().includes(q) ||
      (s.date || "").includes(q) ||
      (s.action || "").toLowerCase().includes(q)
    );
  });

  // Grouped sessions by User for the Grouped View
  const groupedByUser = useMemo(() => {
    const map = new Map<string, { userId: string; email: string; userName: string; logins: SessionActivity[]; logouts: SessionActivity[]; all: SessionActivity[] }>();
    for (const s of filteredSessions) {
      const key = s.userId || s.email;
      let group = map.get(key);
      if (!group) {
        group = {
          userId: s.userId,
          email: s.email,
          userName: s.userName,
          logins: [],
          logouts: [],
          all: [],
        };
        map.set(key, group);
      }
      group.all.push(s);
      if (s.action === "login") group.logins.push(s);
      else if (s.action === "logout") group.logouts.push(s);
    }
    return Array.from(map.values()).sort((a, b) => b.all.length - a.all.length);
  }, [filteredSessions]);

  // User Directory Functions
  async function handleToggleStatus(user: User) {
    const newStatus = user.status === "active" ? "disabled" : "active";
    setUpdatingUser(user.email);
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, status: newStatus }),
      });
      setUsers(prev => prev.map(u => (u.email === user.email ? { ...u, status: newStatus } : u)));
    } catch {
      alert("Failed to update status.");
    } finally {
      setUpdatingUser(null);
    }
  }

  async function handleRoleChange(email: string, role: string) {
    setUpdatingUser(email);
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      setUsers(prev => prev.map(u => (u.email === email ? { ...u, role: role as User["role"] } : u)));
    } catch {
      alert("Failed to update role.");
    } finally {
      setUpdatingUser(null);
    }
  }

  async function handleDeleteUser(email: string) {
    if (!window.confirm(`Delete user "${email}"? This cannot be undone.`)) return;
    setDeletingUser(email);
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
      setDeletingUser(null);
    }
  }

  // Filtered Users Directory
  const filteredUsers = users.filter(u => {
    const query = userSearch.toLowerCase();
    const matchesSearch =
      (u.name || "").toLowerCase().includes(query) ||
      (u.firstName || "").toLowerCase().includes(query) ||
      (u.lastName || "").toLowerCase().includes(query) ||
      (u.email || "").toLowerCase().includes(query) ||
      (u.authMethod || "").toLowerCase().includes(query) ||
      (u.role || "").toLowerCase().includes(query);

    if (methodFilter === "all") return matchesSearch;
    if (methodFilter === "google") return matchesSearch && u.authMethod?.includes("Google");
    if (methodFilter === "email") return matchesSearch && (u.authMethod?.includes("Email") || u.authMethod?.includes("Password"));
    return matchesSearch;
  });

  const totalActiveUsers = users.filter(u => u.status === "active").length;
  const totalGoogleUsers = users.filter(u => u.authMethod?.includes("Google")).length;
  const totalEmailUsers = users.filter(u => u.authMethod?.includes("Password") || u.authMethod?.includes("Email")).length;

  return (
    <>
      {/* Dynamic Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #30363d;
          border-radius: 3px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        @media (max-width: 900px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr; }
        }

        .tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border-radius: 6px;
          border: 1px solid transparent;
          transition: all 0.2s ease;
        }
        .tab-btn.active {
          background: #21262d;
          border-color: #388bfd;
          color: #58a6ff;
          box-shadow: 0 0 10px rgba(56, 139, 253, 0.15);
        }
        .tab-btn.inactive {
          background: transparent;
          color: #8b949e;
          border-color: #21282f;
        }
        .tab-btn.inactive:hover {
          color: #c9d1d9;
          background: #161b22;
        }

        .date-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid #30363d;
          background: #161b22;
          color: #8b949e;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .date-pill:hover {
          border-color: #58a6ff;
          color: #e6edf3;
        }
        .date-pill.active {
          background: rgba(56, 139, 253, 0.15);
          border-color: #388bfd;
          color: #58a6ff;
          font-weight: 600;
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
          min-width: 260px;
          flex: 1;
          max-width: 400px;
        }

        .table-scroll-x {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .table-scroll-x table {
          width: 100%;
          border-collapse: collapse;
          min-width: 960px;
        }

        .table-container {
          background: #161b22;
          border: 1px solid #21282f;
          border-radius: 8px;
          overflow: hidden;
        }

        .user-group-card {
          background: #161b22;
          border: 1px solid #21282f;
          border-radius: 8px;
          padding: 14px;
          margin-bottom: 12px;
          transition: border-color 0.2s;
        }
        .user-group-card:hover {
          border-color: #30363d;
        }
      `}</style>

      {/* Top Header */}
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, color: "#e6edf3" }}>
            👤 User Management & Activity Tracking
          </h1>
          <p style={{ color: "#7d8590", fontSize: 13, marginTop: 4 }}>
            Date-wise records of user logins, logouts, IP addresses, locations, and registered accounts.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href="/admin/users/auth-issues"
            style={{
              background: "rgba(248, 81, 73, 0.15)",
              border: "1px solid rgba(248, 81, 73, 0.3)",
              borderRadius: 6,
              color: "#ff7b72",
              padding: "6px 12px",
              fontSize: 12,
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 500,
            }}
          >
            ⚠️ Auth Issues Tracker
          </a>

          {activeTab === "activity" && (
            <>
              <button
                onClick={handleExportCSV}
                style={{
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#c9d1d9",
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 500,
                }}
              >
                📥 Export CSV
              </button>

              <button
                onClick={fetchSessions}
                style={{
                  background: "#21262d",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#c9d1d9",
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                🔄 Refresh Logs
              </button>
            </>
          )}

          {activeTab === "users" && (
            <button
              onClick={fetchUsers}
              style={{
                background: "#21262d",
                border: "1px solid #30363d",
                borderRadius: 6,
                color: "#c9d1d9",
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              🔄 Refresh Users
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Switcher */}
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid #21282f", paddingBottom: 12, marginBottom: 18 }}>
        <button
          className={`tab-btn ${activeTab === "activity" ? "active" : "inactive"}`}
          onClick={() => setActiveTab("activity")}
        >
          <span>📅</span> Date-Wise Login & Logout Activity
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 10,
              background: activeTab === "activity" ? "#388bfd" : "#21282f",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            {activityStats.totalLoginsToday} Today
          </span>
        </button>

        <button
          className={`tab-btn ${activeTab === "users" ? "active" : "inactive"}`}
          onClick={() => setActiveTab("users")}
        >
          <span>👥</span> Registered Users Directory
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 10,
              background: activeTab === "users" ? "#388bfd" : "#21282f",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            {users.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DATE-WISE LOGIN & LOGOUT ACTIVITY RECORDS                         */}
      {/* ========================================================================= */}
      {activeTab === "activity" && (
        <>
          {/* Stat Cards for Date-Wise Activity */}
          <div className="stats-grid">
            {[
              {
                label: "Today's Logins",
                value: activityStats.totalLoginsToday,
                color: "#2ea043",
                desc: `Date: ${todayStr}`,
                icon: "🟢",
              },
              {
                label: "Active Users Today",
                value: activityStats.uniqueUsersToday,
                color: "#388bfd",
                desc: "Unique accounts active today",
                icon: "👥",
              },
              {
                label: "Today's Logouts",
                value: activityStats.totalLogoutsToday,
                color: "#da3633",
                desc: "Logged out sessions today",
                icon: "🔴",
              },
              {
                label: "Total Stored Records",
                value: activityStats.totalRecorded,
                color: "#a371f7",
                desc: "Historical sessions in DynamoDB",
                icon: "🗄️",
              },
            ].map(s => (
              <div
                key={s.label}
                style={{
                  background: "#161b22",
                  border: "1px solid #21282f",
                  borderTop: `3px solid ${s.color}`,
                  borderRadius: 6,
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
                    {s.label}
                  </div>
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 6, color: "#e6edf3" }}>
                  {activityLoading ? "—" : s.value}
                </div>
                <div style={{ fontSize: 11, color: "#7d8590", marginTop: 4 }}>{s.desc}</div>
              </div>
            ))}
          </div>

          {/* Date Selector Row */}
          <div
            style={{
              background: "#161b22",
              border: "1px solid #21282f",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "#7d8590", display: "flex", alignItems: "center", gap: 5 }}>
              <span>🗓️</span> Select Date:
            </div>

            <button
              className={`date-pill ${selectedDate === "today" ? "active" : ""}`}
              onClick={() => {
                setSelectedDate("today");
                setCustomDate("");
              }}
            >
              <span>Today</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>({todayStr})</span>
            </button>

            <button
              className={`date-pill ${selectedDate === "yesterday" ? "active" : ""}`}
              onClick={() => {
                setSelectedDate("yesterday");
                setCustomDate("");
              }}
            >
              <span>Yesterday</span>
              <span style={{ fontSize: 10, opacity: 0.8 }}>({yesterdayStr})</span>
            </button>

            {/* Render any additional recent dates with activity */}
            {availableDates
              .filter(d => d.date !== todayStr && d.date !== yesterdayStr)
              .slice(0, 4)
              .map(d => (
                <button
                  key={d.date}
                  className={`date-pill ${selectedDate === d.date ? "active" : ""}`}
                  onClick={() => {
                    setSelectedDate(d.date);
                    setCustomDate(d.date);
                  }}
                >
                  <span>{d.date}</span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 8,
                      background: selectedDate === d.date ? "#388bfd" : "#21262d",
                      color: "#ffffff",
                    }}
                  >
                    {d.logins} logins
                  </span>
                </button>
              ))}

            <button
              className={`date-pill ${selectedDate === "all" ? "active" : ""}`}
              onClick={() => {
                setSelectedDate("all");
                setCustomDate("");
              }}
            >
              <span>All Historical Dates</span>
            </button>

            {/* Custom Date Input */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#7d8590" }}>Pick Date:</span>
              <input
                type="date"
                value={customDate}
                onChange={e => {
                  const val = e.target.value;
                  setCustomDate(val);
                  if (val) setSelectedDate(val);
                }}
                style={{
                  background: "#0d1117",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  color: "#e6edf3",
                  fontSize: 12,
                  padding: "4px 8px",
                  fontFamily: "inherit",
                }}
              />
            </div>
          </div>

          {/* Activity Table Card */}
          <div className="table-container">
            {/* Toolbar */}
            <div className="toolbar-wrap">
              {/* Search Bar */}
              <div className="search-wrap">
                <span style={{ color: "#7d8590" }}>🔍</span>
                <input
                  placeholder="Search User ID, Email, IP, Location, Device…"
                  value={activitySearch}
                  onChange={e => setActivitySearch(e.target.value)}
                  style={{
                    border: "none",
                    background: "none",
                    outline: "none",
                    color: "#e6edf3",
                    fontSize: 12,
                    width: "100%",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Action Filter */}
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "all", label: "All Actions" },
                  { id: "login", label: "🟢 Logins" },
                  { id: "logout", label: "🔴 Logouts" },
                  { id: "signup", label: "🟣 Signups" },
                ].map(a => (
                  <button
                    key={a.id}
                    onClick={() => setActionFilter(a.id)}
                    style={{
                      background: actionFilter === a.id ? "#388bfd" : "#21262d",
                      color: actionFilter === a.id ? "#ffffff" : "#8b949e",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11,
                      cursor: "pointer",
                      fontWeight: 500,
                      transition: "all .15s",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* View Mode Switcher */}
              <div style={{ display: "flex", gap: 4, background: "#0d1117", padding: 2, borderRadius: 6, border: "1px solid #2d3748" }}>
                <button
                  onClick={() => setViewMode("table")}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: "none",
                    background: viewMode === "table" ? "#21262d" : "transparent",
                    color: viewMode === "table" ? "#58a6ff" : "#8b949e",
                    cursor: "pointer",
                  }}
                  title="List all individual records chronologically"
                >
                  📋 Chronological Log
                </button>
                <button
                  onClick={() => setViewMode("grouped")}
                  style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 4,
                    border: "none",
                    background: viewMode === "grouped" ? "#21262d" : "transparent",
                    color: viewMode === "grouped" ? "#58a6ff" : "#8b949e",
                    cursor: "pointer",
                  }}
                  title="Group multiple logins by user for the date"
                >
                  👥 Grouped by User ({groupedByUser.length})
                </button>
              </div>

              {/* Clear Date Records Button */}
              {filteredSessions.length > 0 && (
                <button
                  onClick={handleClearCurrentDate}
                  style={{
                    background: "rgba(218,54,51,0.12)",
                    border: "1px solid rgba(218,54,51,0.3)",
                    borderRadius: 6,
                    color: "#ff7b72",
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  🗑️ Clear Date Records
                </button>
              )}

              <div style={{ marginLeft: "auto", fontSize: 12, color: "#7d8590" }}>
                Showing <b>{filteredSessions.length}</b> events
              </div>
            </div>

            {/* VIEW MODE 1: CHRONOLOGICAL TABLE (ALL RECORDS DATE-WISE) */}
            {viewMode === "table" && (
              <div className="table-scroll-x custom-scrollbar">
                <table>
                  <thead>
                    <tr style={{ background: "#1c2330", borderBottom: "1px solid #21282f" }}>
                      {["#", "Date & Time", "Action", "User ID & Name", "Email", "IP Address", "Location", "Device / Client", "Actions"].map(h => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "10px 14px",
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: ".07em",
                            textTransform: "uppercase",
                            color: "#7d8590",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activityLoading ? (
                      <tr>
                        <td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#7d8590" }}>
                          Loading date-wise activity logs from DynamoDB…
                        </td>
                      </tr>
                    ) : filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#7d8590" }}>
                          No activity records found for this date & filter.
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((session, i) => {
                        const isLogin = session.action === "login";
                        const isLogout = session.action === "logout";
                        const isSignup = session.action === "signup";
                        const isActioning = actionLoadingId === session.activityId;

                        return (
                          <tr
                            key={session.activityId}
                            style={{
                              borderBottom: i < filteredSessions.length - 1 ? "1px solid #21282f" : "none",
                              background: isLogin
                                ? "rgba(46,160,67,0.02)"
                                : isLogout
                                ? "rgba(218,54,51,0.02)"
                                : "rgba(163,113,247,0.02)",
                              opacity: isActioning ? 0.4 : 1,
                              transition: "all .15s",
                            }}
                          >
                            {/* # */}
                            <td style={{ padding: "10px 14px", color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                              {i + 1}
                            </td>

                            {/* Date & Time */}
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>{session.time}</div>
                              <div style={{ fontSize: 10, color: "#8b949e", fontFamily: "var(--font-mono)" }}>{session.date}</div>
                            </td>

                            {/* Action Badge */}
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              {isLogin && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "3px 8px",
                                    borderRadius: 12,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    background: "rgba(46,160,67,0.15)",
                                    color: "#2ea043",
                                    border: "1px solid rgba(46,160,67,0.3)",
                                  }}
                                >
                                  🟢 Login
                                </span>
                              )}
                              {isLogout && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "3px 8px",
                                    borderRadius: 12,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    background: "rgba(218,54,51,0.15)",
                                    color: "#ff7b72",
                                    border: "1px solid rgba(218,54,51,0.3)",
                                  }}
                                >
                                  🔴 Logout
                                </span>
                              )}
                              {isSignup && (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "3px 8px",
                                    borderRadius: 12,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    background: "rgba(163,113,247,0.15)",
                                    color: "#d2a8ff",
                                    border: "1px solid rgba(163,113,247,0.3)",
                                  }}
                                >
                                  🟣 Signup
                                </span>
                              )}
                            </td>

                            {/* User ID & Name */}
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#e6edf3" }}>{session.userName || "User"}</div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#58a6ff",
                                  fontFamily: "var(--font-mono)",
                                  background: "rgba(56,139,253,0.1)",
                                  padding: "1px 5px",
                                  borderRadius: 4,
                                  display: "inline-block",
                                  marginTop: 2,
                                }}
                              >
                                {session.userId}
                              </div>
                            </td>

                            {/* Email */}
                            <td style={{ padding: "10px 14px", fontSize: 12, color: "#8b949e", whiteSpace: "nowrap" }}>
                              {session.email}
                            </td>

                            {/* IP Address */}
                            <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 12, color: "#58a6ff", whiteSpace: "nowrap" }}>
                              <span
                                style={{
                                  background: "#0d1117",
                                  border: "1px solid #30363d",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                🌐 {session.ip}
                              </span>
                            </td>

                            {/* Location */}
                            <td style={{ padding: "10px 14px", fontSize: 12, color: "#e6edf3", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span>📍</span>
                                <span>{session.location}</span>
                              </div>
                            </td>

                            {/* Device */}
                            <td style={{ padding: "10px 14px", fontSize: 11, color: "#8b949e", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span>💻</span>
                                <span>{session.device}</span>
                              </div>
                            </td>

                            {/* Actions */}
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                              <button
                                onClick={() => handleDeleteSession(session)}
                                disabled={isActioning}
                                style={{
                                  padding: "3px 8px",
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 500,
                                  border: "1px solid #da3633",
                                  background: "transparent",
                                  color: "#da3633",
                                  cursor: isActioning ? "not-allowed" : "pointer",
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW MODE 2: GROUPED BY USER (SHOWS 10+ LOGINS PER USER PER DAY) */}
            {viewMode === "grouped" && (
              <div style={{ padding: 14 }}>
                {activityLoading ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#7d8590" }}>Loading user activity groups…</div>
                ) : groupedByUser.length === 0 ? (
                  <div style={{ padding: 30, textAlign: "center", color: "#7d8590" }}>No users active on this date.</div>
                ) : (
                  groupedByUser.map(group => {
                    const isExpanded = !!expandedUsers[group.userId];
                    return (
                      <div key={group.userId} className="user-group-card">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            cursor: "pointer",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                          onClick={() => setExpandedUsers(prev => ({ ...prev, [group.userId]: !isExpanded }))}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                background: "rgba(56, 139, 253, 0.2)",
                                color: "#58a6ff",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              {(group.userName || group.email).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3" }}>
                                {group.userName || "User"}
                              </div>
                              <div style={{ fontSize: 11, color: "#8b949e", fontFamily: "var(--font-mono)" }}>
                                {group.userId} • {group.email}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span
                              style={{
                                background: "rgba(46,160,67,0.15)",
                                color: "#2ea043",
                                border: "1px solid rgba(46,160,67,0.3)",
                                padding: "3px 10px",
                                borderRadius: 12,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              ⚡ {group.logins.length} Logins on this day
                            </span>

                            {group.logouts.length > 0 && (
                              <span
                                style={{
                                  background: "rgba(218,54,51,0.15)",
                                  color: "#ff7b72",
                                  border: "1px solid rgba(218,54,51,0.3)",
                                  padding: "3px 10px",
                                  borderRadius: 12,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                {group.logouts.length} Logouts
                              </span>
                            )}

                            <span style={{ fontSize: 12, color: "#58a6ff", fontWeight: 600 }}>
                              {isExpanded ? "▲ Hide Timestamps" : `▼ View ${group.all.length} Timestamps`}
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Timeline of Individual Logins / Logouts */}
                        {isExpanded && (
                          <div
                            style={{
                              marginTop: 14,
                              paddingTop: 12,
                              borderTop: "1px solid #21282f",
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            <div style={{ fontSize: 11, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
                              Session Timestamps for {selectedDate}:
                            </div>

                            {group.all.map((item, idx) => (
                              <div
                                key={item.activityId}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  background: "#0d1117",
                                  border: "1px solid #21282f",
                                  borderRadius: 6,
                                  padding: "8px 12px",
                                  fontSize: 12,
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{ color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 11 }}>#{idx + 1}</span>
                                  <span
                                    style={{
                                      padding: "1px 6px",
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: item.action === "login" ? "rgba(46,160,67,0.2)" : "rgba(218,54,51,0.2)",
                                      color: item.action === "login" ? "#2ea043" : "#ff7b72",
                                    }}
                                  >
                                    {item.action.toUpperCase()}
                                  </span>
                                  <span style={{ fontWeight: 600, color: "#e6edf3" }}>{item.time}</span>
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#8b949e" }}>
                                  <span style={{ fontFamily: "var(--font-mono)", color: "#58a6ff" }}>🌐 {item.ip}</span>
                                  <span>📍 {item.location}</span>
                                  <span>💻 {item.device}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: REGISTERED USERS DIRECTORY                                        */}
      {/* ========================================================================= */}
      {activeTab === "users" && (
        <>
          {/* Stat Cards for Registered Users */}
          <div className="stats-grid">
            {[
              { label: "Total Registered Users", value: users.length, color: "#388bfd" },
              { label: "Active Status", value: totalActiveUsers, color: "#2ea043" },
              { label: "Google Logins", value: totalGoogleUsers, color: "#e36209" },
              { label: "Email / Password", value: totalEmailUsers, color: "#a371f7" },
            ].map(s => (
              <div
                key={s.label}
                style={{
                  background: "#161b22",
                  border: "1px solid #21282f",
                  borderTop: `3px solid ${s.color}`,
                  borderRadius: 6,
                  padding: 14,
                }}
              >
                <div style={{ fontSize: 11, color: "#7d8590", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: 6, color: "#e6edf3" }}>
                  {usersLoading ? "—" : s.value}
                </div>
              </div>
            ))}
          </div>

          {/* User Directory Table Card */}
          <div className="table-container">
            {/* Toolbar */}
            <div className="toolbar-wrap">
              <div className="search-wrap">
                <span style={{ color: "#7d8590" }}>🔍</span>
                <input
                  placeholder="Search name, email, auth method…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  style={{
                    border: "none",
                    background: "none",
                    outline: "none",
                    color: "#e6edf3",
                    fontSize: 12,
                    width: "100%",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Filter by Auth Method */}
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "all", label: "All Methods" },
                  { id: "google", label: "Google" },
                  { id: "email", label: "Email & Password" },
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
                      transition: "all .15s",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div style={{ marginLeft: "auto", fontSize: 12, color: "#7d8590" }}>
                {filteredUsers.length} of {users.length} users
              </div>
            </div>

            {/* Scrollable Users Table */}
            <div className="table-scroll-x custom-scrollbar">
              <table>
                <thead>
                  <tr style={{ background: "#1c2330", borderBottom: "1px solid #21282f" }}>
                    {["#", "User", "Email", "Login / Signup Method", "Role", "Signed Up", "Last Login", "Status", "Actions"].map(h => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "10px 14px",
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: ".07em",
                          textTransform: "uppercase",
                          color: "#7d8590",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 30, textAlign: "center", color: "#7d8590" }}>
                        Loading users from DynamoDB…
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 30, textAlign: "center", color: "#7d8590" }}>
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u, i) => {
                      const displayName = u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email.split("@")[0];
                      const initials = displayName.slice(0, 2).toUpperCase() || "U";
                      const isDeleting = deletingUser === u.email;
                      const isUpdating = updatingUser === u.email;
                      const isActive = u.status !== "disabled";

                      const isGoogle = u.authMethod?.includes("Google");
                      const isPassword = u.authMethod?.includes("Password") || u.authMethod?.includes("Email");

                      return (
                        <tr
                          key={u.email}
                          style={{
                            borderBottom: i < filteredUsers.length - 1 ? "1px solid #21282f" : "none",
                            opacity: isDeleting ? 0.4 : 1,
                            transition: "opacity .2s",
                            background: !isActive ? "rgba(218,54,51,.04)" : "transparent",
                          }}
                        >
                          {/* # */}
                          <td style={{ padding: "10px 14px", color: "#7d8590", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                            {i + 1}
                          </td>

                          {/* User Info */}
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              {u.avatar ? (
                                <img
                                  src={u.avatar}
                                  alt={displayName}
                                  style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: "50%",
                                    flexShrink: 0,
                                    background: isGoogle ? "rgba(227, 98, 9, 0.2)" : "rgba(56, 139, 253, 0.2)",
                                    color: isGoogle ? "#f0883e" : "#58a6ff",
                                    display: "grid",
                                    placeItems: "center",
                                    fontSize: 11,
                                    fontWeight: 700,
                                  }}
                                >
                                  {initials}
                                </div>
                              )}
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>{displayName}</div>
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
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "3px 8px",
                                  borderRadius: 12,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "rgba(163, 113, 247, 0.15)",
                                  color: "#d2a8ff",
                                  border: "1px solid rgba(163, 113, 247, 0.3)",
                                }}
                              >
                                ⚡ Google + Password
                              </span>
                            ) : isGoogle ? (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "3px 8px",
                                  borderRadius: 12,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "rgba(227, 98, 9, 0.15)",
                                  color: "#f0883e",
                                  border: "1px solid rgba(227, 98, 9, 0.3)",
                                }}
                              >
                                <span style={{ fontWeight: 800 }}>G</span> Google
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 5,
                                  padding: "3px 8px",
                                  borderRadius: 12,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: "rgba(56, 139, 253, 0.15)",
                                  color: "#58a6ff",
                                  border: "1px solid rgba(56, 139, 253, 0.3)",
                                }}
                              >
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
                                background: "#0d1117",
                                border: "1px solid #2d3748",
                                borderRadius: 5,
                                padding: "3px 8px",
                                color: "#e6edf3",
                                fontSize: 11,
                                cursor: "pointer",
                                fontFamily: "inherit",
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
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </td>

                          {/* Last Login */}
                          <td style={{ padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 11, color: "#8b949e", whiteSpace: "nowrap" }}>
                            {u.lastLoginAt
                              ? new Date(u.lastLoginAt).toLocaleString("en-IN", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })
                              : "—"}
                          </td>

                          {/* Status Badge */}
                          <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "2px 8px",
                                borderRadius: 10,
                                fontSize: 10,
                                fontWeight: 600,
                                background: isActive ? "rgba(46,160,67,.15)" : "rgba(194, 74, 72, 0.15)",
                                color: isActive ? "#2ea043" : "#da3633",
                              }}
                            >
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
                              {isActive ? "Active" : "Disabled"}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", gap: 6 }}>
                              {/* View user sessions quick link */}
                              <button
                                onClick={() => {
                                  setActiveTab("activity");
                                  setSelectedDate("all");
                                  setActivitySearch(u.email);
                                }}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 5,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  border: "1px solid #388bfd",
                                  background: "rgba(56,139,253,0.1)",
                                  color: "#58a6ff",
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                                title="View all date-wise logins for this user"
                              >
                                📅 Activity Logs
                              </button>

                              <button
                                onClick={() => handleToggleStatus(u)}
                                disabled={isUpdating || isDeleting}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 5,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  border: `1px solid ${isActive ? "#d29922" : "#2ea043"}`,
                                  background: "transparent",
                                  color: isActive ? "#d29922" : "#2ea043",
                                  cursor: isUpdating ? "not-allowed" : "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isUpdating ? "…" : isActive ? "Disable" : "Enable"}
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u.email)}
                                disabled={!!deletingUser || isUpdating}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: 5,
                                  fontSize: 11,
                                  fontWeight: 500,
                                  border: "1px solid #da3633",
                                  background: "transparent",
                                  color: "#da3633",
                                  cursor: isDeleting ? "not-allowed" : "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {isDeleting ? "…" : "Delete"}
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
      )}
    </>
  );
}