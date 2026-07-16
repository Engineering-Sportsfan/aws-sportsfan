"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Form Component for adding matches
export default function AddFocusMatchPage() {
  const router = useRouter();
  const [sport, setSport] = useState<"football" | "cricket">("cricket");
  const [competition, setCompetition] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [stage, setStage] = useState("group");
  const [status, setStatus] = useState("upcoming");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!competition || !teamA || !teamB || !kickoffTime) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Create match document by calling Next.js Server Action / API or routing directly
      // Since client components cannot use firebaseAdmin directly, we call Vercel api endpoint
      const response = await fetch("/api/roar/matches", {
        method: "POST",
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

      // Auto-trigger pre-match research pipeline in the background on Dolly's AWS Lambda / Render server
      try {
        const sentimentUrl = process.env.NEXT_PUBLIC_SENTIMENT_URL || "https://sportsfan360-sentiment.onrender.com";
        await fetch(`${sentimentUrl}/run-research?match_id=${resData.id}&team_a=${encodeURIComponent(teamA)}&team_b=${encodeURIComponent(teamB)}&sport=${sport}&competition=${encodeURIComponent(competition)}`, {
          method: "POST"
        });
      } catch (triggerErr) {
        console.warn("Could not auto-trigger match research background pipeline:", triggerErr);
      }

      setSuccess("Match added successfully!");
      
      // Reset form
      setCompetition("");
      setTeamA("");
      setTeamB("");
      setKickoffTime("");
      
      router.push("/admin/focusmatch-management/focusmatch-list");
    } catch (err: any) {
      console.error("Error adding match:", err);
      setError(err.message || "Failed to save match to Firestore.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20, color: "#fff", background: "#0d1117", borderRadius: 8 }}>
      <h2 style={{ fontSize: 18, marginBottom: 20, borderBottom: "1px solid #30363d", paddingBottom: 10 }}>Create Focus Group Match</h2>
      
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

        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            marginTop: 10,
            padding: "10px 16px", 
            background: "#2ea043", 
            border: "none", 
            borderRadius: 6, 
            color: "#fff", 
            fontWeight: "600",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? "Adding Match..." : "Add Focus Match"}
        </button>
      </form>
    </div>
  );
}
