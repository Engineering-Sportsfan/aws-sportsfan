"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";

// Form Component for editing matches
export default function EditFocusMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const router = useRouter();
  const { matchId } = use(params);
  
  const [sport, setSport] = useState<"football" | "cricket">("cricket");
  const [competition, setCompetition] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [stage, setStage] = useState("group");
  const [status, setStatus] = useState("upcoming");
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load existing match details on mount
  useEffect(() => {
    async function loadMatchDetails() {
      try {
        const response = await fetch("/api/roar/matches");
        const resData = await response.json();
        if (!response.ok) {
          throw new Error(resData.error || "Failed to load matches.");
        }
        
        const currentMatch = (resData.matches || []).find((m: any) => m.id === matchId);
        if (!currentMatch) {
          throw new Error("Match not found in database.");
        }

        setSport(currentMatch.sport);
        setCompetition(currentMatch.competition || "");
        setTeamA(currentMatch.team_a);
        setTeamB(currentMatch.team_b);
        setStage(currentMatch.stage || "group");
        setStatus(currentMatch.status || "upcoming");

        // Format timestamp to input datetime-local string format
        if (currentMatch.kickoff_time) {
          const dateObj = new Date(currentMatch.kickoff_time);
          const offsetMs = dateObj.getTimezoneOffset() * 60 * 1000;
          const localISO = new Date(dateObj.getTime() - offsetMs).toISOString().slice(0, 16);
          setKickoffTime(localISO);
        }
      } catch (err: any) {
        console.error("Error loading match detail:", err);
        setError(err.message || "Failed to load match details.");
      } finally {
        setLoading(false);
      }
    }
    loadMatchDetails();
  }, [matchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!competition || !teamA || !teamB || !kickoffTime) {
      setError("Please fill in all required fields.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/roar/matches?id=${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport,
          competition,
          team_a: teamA,
          team_b: teamB,
          kickoff_time: new Date(kickoffTime).getTime(),
          stage,
          status
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Failed to save match.");
      }

      setSuccess("Match updated successfully!");
      router.push("/admin/focusmatch-management/focusmatch-list");
    } catch (err: any) {
      console.error("Error updating match:", err);
      setError(err.message || "Failed to save match changes.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ color: "#8b949e", textAlign: "center", padding: 40 }}>
        Loading match details from database...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20, color: "#fff", background: "#0d1117", borderRadius: 8 }}>
      <h2 style={{ fontSize: 18, marginBottom: 20, borderBottom: "1px solid #30363d", paddingBottom: 10 }}>Edit Focus Group Match</h2>
      
      {error && <div style={{ background: "#f85149", padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {success && <div style={{ background: "#2ea043", padding: "10px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{success}</div>}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#8b949e" }}>Sport Category</label>
          <select 
            value={sport} 
            onChange={(e) => setSport(e.target.value as "football" | "cricket")}
            style={{ width: "100%", padding: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#fff" }}
          >
            <option value="cricket">Cricket 🏏</option>
            <option value="football">Football ⚽</option>
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#8b949e" }}>Competition / Tournament Name *</label>
          <input 
            type="text" 
            placeholder="e.g. FIFA World Cup 2026 or India tour of England"
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            style={{ width: "100%", padding: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#fff" }}
            required
          />
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#8b949e" }}>Team A *</label>
            <input 
              type="text" 
              placeholder="e.g. England"
              value={teamA}
              onChange={(e) => setTeamA(e.target.value)}
              style={{ width: "100%", padding: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#fff" }}
              required
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#8b949e" }}>Team B *</label>
            <input 
              type="text" 
              placeholder="e.g. DR Congo"
              value={teamB}
              onChange={(e) => setTeamB(e.target.value)}
              style={{ width: "100%", padding: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#fff" }}
              required
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#8b949e" }}>Kickoff Time (IST) *</label>
          <input 
            type="datetime-local" 
            value={kickoffTime}
            onChange={(e) => setKickoffTime(e.target.value)}
            style={{ width: "100%", padding: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#fff" }}
            required
          />
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#8b949e" }}>Stage / Round</label>
            <input 
              type="text" 
              placeholder="e.g. group, round_of_16"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              style={{ width: "100%", padding: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#fff" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, marginBottom: 5, color: "#8b949e" }}>Status</label>
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: "100%", padding: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 6, color: "#fff" }}
            >
              <option value="upcoming">Upcoming</option>
              <option value="live">Live</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button 
            type="submit" 
            disabled={saving}
            style={{ 
              flex: 1,
              marginTop: 10,
              padding: "10px 16px", 
              background: "#2ea043", 
              border: "none", 
              borderRadius: 6, 
              color: "#fff", 
              fontWeight: "600",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? "Saving Changes..." : "Save Match"}
          </button>
          
          <button 
            type="button"
            onClick={() => router.push("/admin/focusmatch-management/focusmatch-list")}
            style={{ 
              flex: 1,
              marginTop: 10,
              padding: "10px 16px", 
              background: "#21262d", 
              border: "1px solid #30363d", 
              borderRadius: 6, 
              color: "#fff", 
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
