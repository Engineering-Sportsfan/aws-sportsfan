"use client";

import React, { useState, useEffect } from "react";
import { IBM_Plex_Mono } from "next/font/google";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface Bot {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

export default function BotManagementDashboard() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. DYNAMICALLY FETCH BOTS FROM DATABASE
  useEffect(() => {
    const fetchBots = async () => {
      try {
        const res = await fetch("/api/roar/bots");
        const data = await res.json();
        if (data.success) {
          setBots(data.bots);
        }
      } catch (error) {
        console.error("Failed to load bots:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBots();
  }, []);

  // 2. ACTUAL KILL SWITCH LOGIC (UPDATES DATABASE)
  const toggleBot = async (id: string, currentActive: boolean) => {
    const newActiveState = !currentActive;
    
    // Optimistic UI update
    setBots(bots.map(b => b.id === id ? { ...b, active: newActiveState } : b));

    try {
      // Send the kill signal to the backend
      await fetch("/api/roar/bots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: id, active: newActiveState }),
      });
    } catch (error) {
      console.error("Failed to toggle kill switch:", error);
      // Revert if failed
      setBots(bots.map(b => b.id === id ? { ...b, active: currentActive } : b));
    }
  };

  return (
    <div style={{ padding: 20, color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 600 }}>AI Bot Management</h1>
          <p style={{ margin: 0, color: "#7d8590", fontSize: 14 }}>
            Monitor and manage your autonomous AI agents. Use the toggles to instantly shut down a bot globally.
          </p>
        </div>
        {/* ADD NEW BOT BUTTON REMOVED AS REQUESTED */}
      </div>

      <div style={{
        background: "#161b22", border: "1px solid #30363d", borderRadius: 6,
        overflow: "hidden"
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#21262d", borderBottom: "1px solid #30363d", color: "#8b949e" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Bot Profile</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Designated Role</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Global Status (Kill Switch)</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "#7d8590" }}>
                  Loading active bots from database...
                </td>
              </tr>
            ) : bots.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "#7d8590" }}>
                  No AI bots found in the database.
                </td>
              </tr>
            ) : bots.map((bot) => (
              <tr key={bot.id} style={{ borderBottom: "1px solid #30363d" }}>
                <td style={{ padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: "linear-gradient(135deg, #1f6feb, #388bfd)",
                      display: "grid", placeItems: "center", fontWeight: "bold",
                      color: "#fff"
                    }}>
                      {bot.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{bot.name}</div>
                      <div style={{ fontSize: 12, color: "#7d8590", fontFamily: plexMono.style.fontFamily }}>
                        {bot.id}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "16px", color: "#c9d1d9" }}>{bot.role}</td>
                <td style={{ padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: bot.active ? "#2ea043" : "#f85149"
                    }} />
                    <span style={{
                      color: bot.active ? "#2ea043" : "#f85149",
                      fontWeight: 600, fontSize: 13
                    }}>
                      {bot.active ? "ACTIVE" : "DISABLED"}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "16px" }}>
                  <label style={{
                    position: "relative", display: "inline-block", width: 44, height: 24
                  }}>
                    <input 
                      type="checkbox" 
                      checked={bot.active}
                      onChange={() => toggleBot(bot.id, bot.active)}
                      style={{ opacity: 0, width: 0, height: 0 }} 
                    />
                    <span style={{
                      position: "absolute", cursor: "pointer", top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: bot.active ? "#2ea043" : "#484f58",
                      transition: ".4s", borderRadius: 34
                    }}>
                      <span style={{
                        position: "absolute", height: 18, width: 18, left: 3, bottom: 3,
                        backgroundColor: "white", transition: ".4s", borderRadius: "50%",
                        transform: bot.active ? "translateX(20px)" : "translateX(0)"
                      }} />
                    </span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
