"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Match {
  id: string;
  sport: "cricket" | "football" | "hockey" | "athletics" | string;
  competition: string;
  team_a: string;
  team_b: string;
  kickoff_time: number;
  stage: string;
  status: "upcoming" | "live" | "completed";
}

function getSportBadge(sport: string) {
  const s = (sport || "").toLowerCase();
  switch (s) {
    case "cricket":
      return "Cricket 🏏";
    case "football":
      return "Football ⚽";
    case "hockey":
      return "Hockey 🏑";
    case "athletics":
      return "Athletics (Asian Games) 🏃";
    default:
      return sport ? sport.toUpperCase() : "General 🏆";
  }
}

function FocusMatchListContent() {
  const searchParams = useSearchParams();
  const initialSport = searchParams.get("sport")?.toLowerCase();

  const validSports = ["all", "cricket", "football", "hockey", "athletics"];
  const defaultTab = initialSport && validSports.includes(initialSport) ? initialSport : "all";

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  const fetchMatches = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/roar/matches");
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Failed to load matches.");
      }
      setMatches(resData.matches || []);
    } catch (err: any) {
      console.error("Error fetching matches:", err);
      setError("Failed to load matches list from database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const counts = useMemo(() => {
    const cricket = matches.filter((m) => (m.sport || "").toLowerCase() === "cricket").length;
    const football = matches.filter((m) => (m.sport || "").toLowerCase() === "football").length;
    const hockey = matches.filter((m) => (m.sport || "").toLowerCase() === "hockey").length;
    const athletics = matches.filter((m) => (m.sport || "").toLowerCase() === "athletics").length;
    return { all: matches.length, cricket, football, hockey, athletics };
  }, [matches]);

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      const matchSport = (m.sport || "").toLowerCase();
      const matchesTab = activeTab === "all" ? true : matchSport === activeTab;
      if (!matchesTab) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const teamA = (m.team_a || "").toLowerCase();
      const teamB = (m.team_b || "").toLowerCase();
      const comp = (m.competition || "").toLowerCase();
      const stage = (m.stage || "").toLowerCase();
      return teamA.includes(q) || teamB.includes(q) || comp.includes(q) || stage.includes(q);
    });
  }, [matches, activeTab, searchQuery]);

  const handleDelete = async (matchId: string) => {
    if (!confirm("Are you sure you want to delete this focus match?")) return;
    try {
      const response = await fetch(`/api/roar/matches?id=${matchId}`, {
        method: "DELETE",
      });
      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Failed to delete match.");
      }
      setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } catch (err: any) {
      console.error("Error deleting match:", err);
      alert(err.message || "Failed to delete match.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "live": return "#2ea043";
      case "completed": return "#7d8590";
      default: return "#388bfd";
    }
  };

  return (
    <div style={{ color: "#fff", background: "#0d1117", padding: 24, borderRadius: 10, border: "1px solid #21262d" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid #30363d", paddingBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px 0", color: "#f0f6fc" }}>Focus Group Matches</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
            Manage upcoming and live cricket, football, hockey & athletics (Asian Games) matches for RoAR Focus Groups.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={fetchMatches}
            style={{
              background: "#21262d",
              border: "1px solid #30363d",
              color: "#c9d1d9",
              padding: "7px 14px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            🔄 Refresh
          </button>
          <Link 
            href="/admin/focusmatch-management/add-focusmatch" 
            style={{
              textDecoration: "none",
              background: "#238636",
              color: "#fff",
              padding: "7px 16px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>+</span> Add Focus Match
          </Link>
        </div>
      </div>

      {/* Tabs & Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 20, borderBottom: "1px solid #21282f", paddingBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              { id: "all", label: "All Matches", count: counts.all },
              { id: "cricket", label: "Cricket 🏏", count: counts.cricket },
              { id: "football", label: "Football ⚽", count: counts.football },
              { id: "hockey", label: "Hockey 🏑", count: counts.hockey },
              { id: "athletics", label: "Athletics 🏃", count: counts.athletics },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? "#1f6feb22" : "transparent",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #58a6ff" : "2px solid transparent",
                color: activeTab === tab.id ? "#58a6ff" : "#8b949e",
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                borderRadius: "4px 4px 0 0",
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  background: activeTab === tab.id ? "#1f6feb" : "#30363d",
                  color: "#fff",
                  padding: "1px 7px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div>
          <input
            type="text"
            placeholder="Search match, team or competition..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "7px 12px",
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#fff",
              fontSize: 13,
              width: 260,
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{ background: "#f8514922", border: "1px solid #f85149", color: "#f85149", padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: "#8b949e", textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
          Loading matches database...
        </div>
      ) : filteredMatches.length === 0 ? (
        <div style={{ color: "#8b949e", textAlign: "center", padding: "50px 20px", border: "1px dashed #30363d", borderRadius: 8, background: "#161b22" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏟️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#c9d1d9", marginBottom: 6 }}>
            No matches found for {activeTab === "all" ? "any category" : getSportBadge(activeTab)}
          </div>
          <p style={{ margin: "0 0 16px 0", fontSize: 13 }}>
            {searchQuery ? "No matches matching your search filter." : `Get started by scheduling a new ${activeTab === "all" ? "sports" : getSportBadge(activeTab)} match.`}
          </p>
          <Link
            href="/admin/focusmatch-management/add-focusmatch"
            style={{
              textDecoration: "none",
              background: "#238636",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              display: "inline-block",
            }}
          >
            + Create Focus Match
          </Link>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#161b22", borderBottom: "1px solid #30363d" }}>
                <th style={{ textAlign: "left", padding: "12px 14px", color: "#8b949e" }}>Match Details</th>
                <th style={{ textAlign: "left", padding: "12px 14px", color: "#8b949e" }}>Sport</th>
                <th style={{ textAlign: "left", padding: "12px 14px", color: "#8b949e" }}>Competition</th>
                <th style={{ textAlign: "left", padding: "12px 14px", color: "#8b949e" }}>Kickoff Time (IST)</th>
                <th style={{ textAlign: "left", padding: "12px 14px", color: "#8b949e" }}>Stage</th>
                <th style={{ textAlign: "left", padding: "12px 14px", color: "#8b949e" }}>Status</th>
                <th style={{ textAlign: "right", padding: "12px 14px", color: "#8b949e" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #21282f" }}>
                  <td style={{ padding: "12px 14px", fontWeight: "600", color: "#f0f6fc" }}>
                    {m.team_a} vs {m.team_b}
                  </td>
                  <td style={{ padding: "12px 14px", color: "#c9d1d9" }}>
                    {getSportBadge(m.sport)}
                  </td>
                  <td style={{ padding: "12px 14px", color: "#8b949e" }}>{m.competition}</td>
                  <td style={{ padding: "12px 14px", color: "#8b949e" }}>
                    {new Date(m.kickoff_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td style={{ padding: "12px 14px", textTransform: "capitalize", color: "#8b949e" }}>{m.stage}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        background: `${getStatusColor(m.status)}22`,
                        color: getStatusColor(m.status),
                        border: `1px solid ${getStatusColor(m.status)}`,
                        textTransform: "capitalize",
                      }}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <Link
                        href={`/admin/focusmatch-management/edit-focusmatch/${m.id}`}
                        style={{
                          background: "#21262d",
                          border: "1px solid #30363d",
                          color: "#58a6ff",
                          padding: "5px 10px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: "600",
                          textDecoration: "none",
                        }}
                      >
                        Edit ✏️
                      </Link>

                      <button
                        onClick={() => handleDelete(m.id)}
                        style={{
                          background: "#21262d",
                          border: "1px solid #30363d",
                          color: "#f85149",
                          padding: "5px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        Delete 🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FocusMatchListPage() {
  return (
    <Suspense fallback={<div style={{ color: "#8b949e", padding: 40, textAlign: "center" }}>Loading matches...</div>}>
      <FocusMatchListContent />
    </Suspense>
  );
}
