"use client";

import React, { useState, useEffect } from "react";
import { IBM_Plex_Mono } from "next/font/google";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"] });

interface Bot {
  id: string;
  name: string;
  role: string;
  active: boolean;
  avatarUrl?: string;
  bio?: string;
}

export default function BotManagementDashboard() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [editingBot, setEditingBot] = useState<Bot | null>(null);
  const [bioInput, setBioInput] = useState("");
  const [avatarInput, setAvatarInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  useEffect(() => {
    fetchBots();
  }, []);

  const toggleBot = async (id: string, currentActive: boolean) => {
    const newActiveState = !currentActive;
    
    // Optimistic UI update
    setBots(bots.map(b => b.id === id ? { ...b, active: newActiveState } : b));

    try {
      await fetch("/api/roar/bots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId: id, active: newActiveState }),
      });
    } catch (error) {
      console.error("Failed to toggle kill switch:", error);
      setBots(bots.map(b => b.id === id ? { ...b, active: currentActive } : b));
    }
  };

  const handleEditClick = (bot: Bot) => {
    setEditingBot(bot);
    setBioInput(bot.bio || "");
    setAvatarInput(bot.avatarUrl || "");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setAvatarInput(data.url);
      } else {
        alert("Upload failed.");
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editingBot) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/roar/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          botId: editingBot.id,
          avatarUrl: avatarInput,
          bio: bioInput
        })
      });
      if (res.ok) {
        // Refresh bots to get updated data
        await fetchBots();
        setEditingBot(null);
      } else {
        alert("Failed to save profile.");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: 20, color: "#e6edf3" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: 24, fontWeight: 600 }}>AI Bot Management</h1>
          <p style={{ margin: 0, color: "#7d8590", fontSize: 14 }}>
            Monitor and manage your autonomous AI agents. Update their profiles and use toggles to shut them down globally.
          </p>
        </div>
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
                    {bot.avatarUrl ? (
                      <img 
                        src={bot.avatarUrl} 
                        alt={bot.name} 
                        style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: "linear-gradient(135deg, #1f6feb, #388bfd)",
                        display: "grid", placeItems: "center", fontWeight: "bold",
                        color: "#fff"
                      }}>
                        {bot.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600 }}>{bot.name}</div>
                      <div style={{ fontSize: 12, color: "#7d8590", fontFamily: plexMono.style.fontFamily }}>
                        {bot.id}
                      </div>
                      {bot.bio && (
                        <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2, maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {bot.bio}
                        </div>
                      )}
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
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
                    
                    <button 
                      onClick={() => handleEditClick(bot)}
                      style={{
                        background: "transparent",
                        border: "1px solid #30363d",
                        color: "#c9d1d9",
                        padding: "4px 12px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500
                      }}
                    >
                      Edit Profile
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EDIT MODAL */}
      {editingBot && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "#161b22", border: "1px solid #30363d", borderRadius: 12,
            width: 400, padding: 24, boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
          }}>
            <h2 style={{ margin: "0 0 16px 0", fontSize: 18, fontWeight: 600 }}>Edit {editingBot.name}</h2>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#8b949e", fontWeight: 500 }}>
                Display Picture (Avatar)
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {avatarInput ? (
                  <img src={avatarInput} alt="preview" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: "50%", backgroundColor: "#21262d" }} />
                )}
                <div>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageUpload} 
                    disabled={isUploading}
                    style={{ fontSize: 12, color: "#c9d1d9" }}
                  />
                  {isUploading && <div style={{ fontSize: 12, color: "#388bfd", marginTop: 4 }}>Uploading...</div>}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "block", marginBottom: 8, fontSize: 13, color: "#8b949e", fontWeight: 500 }}>
                Bio
              </label>
              <textarea 
                value={bioInput}
                onChange={(e) => setBioInput(e.target.value)}
                placeholder="e.g., Gen Z Character, Passionate Fan..."
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 6,
                  background: "#0d1117", border: "1px solid #30363d",
                  color: "#e6edf3", fontFamily: "inherit", fontSize: 14,
                  minHeight: 80, resize: "vertical", boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button 
                onClick={() => setEditingBot(null)}
                style={{
                  background: "transparent", border: "1px solid #30363d",
                  color: "#c9d1d9", padding: "6px 16px", borderRadius: 6,
                  cursor: "pointer", fontSize: 14, fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveProfile}
                disabled={isSaving || isUploading}
                style={{
                  background: "#238636", border: "1px solid rgba(240, 246, 252, 0.1)",
                  color: "#fff", padding: "6px 16px", borderRadius: 6,
                  cursor: (isSaving || isUploading) ? "not-allowed" : "pointer", 
                  fontSize: 14, fontWeight: 500, opacity: (isSaving || isUploading) ? 0.7 : 1
                }}
              >
                {isSaving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
