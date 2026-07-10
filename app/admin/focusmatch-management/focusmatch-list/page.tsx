"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Match {
  id: string;
  sport: "football" | "cricket";
  competition: string;
  team_a: string;
  team_b: string;
  kickoff_time: number;
  stage: string;
  status: "upcoming" | "live" | "completed";
}

export default function FocusMatchListPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"football" | "cricket">("football");
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchMatches() {
      try {
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
    }
    fetchMatches();
  }, []);

  const filteredMatches = matches.filter((m) => m.sport === activeTab);

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
    <div style={{ color: "#fff", background: "#0d1117", padding: 20, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid #30363d", paddingBottom: 10 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Focus Group Matches</h2>
        <Link 
          href="/admin/focusmatch-management/add-focusmatch" 
          style={{ textDecoration: "none", background: "#2ea043", color: "#fff", padding: "6px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}
        >
          + Add Match
        </Link>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, borderBottom: "1px solid #21282f" }}>
        {(["football", "cricket"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #58a6ff" : "none",
              color: activeTab === tab ? "#fff" : "#8b949e",
              padding: "10px 16px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              textTransform: "capitalize"
            }}
          >
            {tab === "football" ? "Football ⚽" : "Cricket 🏏"}
          </button>
        ))}
      </div>

      {error && <div style={{ background: "#f85149", padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div style={{ color: "#8b949e", textAlign: "center", padding: 40 }}>Loading matches database...</div>
      ) : filteredMatches.length === 0 ? (
        <div style={{ color: "#8b949e", textAlign: "center", padding: 40, border: "1px dashed #30363d", borderRadius: 6 }}>
          No focus matches found for {activeTab}. Click "+ Add Match" to schedule one.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#161b22", borderBottom: "1px solid #30363d" }}>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e" }}>Match Details</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e" }}>Competition</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e" }}>Kickoff Time (IST)</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e" }}>Stage</th>
                <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e" }}>Status</th>
                <th style={{ textAlign: "right", padding: "10px 12px", color: "#8b949e" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #21282f" }}>
                  <td style={{ padding: "12px", fontWeight: "600" }}>{m.team_a} vs {m.team_b}</td>
                  <td style={{ padding: "12px", color: "#8b949e" }}>{m.competition}</td>
                  <td style={{ padding: "12px", color: "#8b949e" }}>
                    {new Date(m.kickoff_time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td style={{ padding: "12px", textTransform: "capitalize", color: "#8b949e" }}>{m.stage}</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ 
                      display: "inline-block", 
                      padding: "4px 8px", 
                      borderRadius: 12, 
                      fontSize: 11, 
                      fontWeight: 600, 
                      background: `${getStatusColor(m.status)}22`, 
                      color: getStatusColor(m.status),
                      border: `1px solid ${getStatusColor(m.status)}`
                    }}>
                      {m.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <Link
                      href={`/admin/focusmatch-management/edit-focusmatch/${m.id}`}
                      style={{
                        background: "#21262d",
                        border: "1px solid #30363d",
                        color: "#58a6ff",
                        padding: "5px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: "600",
                        textDecoration: "none",
                        transition: "0.2s"
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = "#30363d")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "#21262d")}
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
                        transition: "0.2s"
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.background = "#30363d")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "#21262d")}
                    >
                      Delete 🗑️
                    </button>
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
