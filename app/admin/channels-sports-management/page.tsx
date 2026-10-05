"use client";

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Trophy,
  Layers,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Check,
  X,
  Sparkles,
  AlertCircle,
  Hash,
} from "lucide-react";

interface TaxonomyItem {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
}

export default function ChannelsSportsManagementPage() {
  const [activeTab, setActiveTab] = useState<"sports" | "channels">("sports");

  // Sports State
  const [sports, setSports] = useState<TaxonomyItem[]>([]);
  const [loadingSports, setLoadingSports] = useState(true);
  const [newSportName, setNewSportName] = useState("");
  const [editingSportId, setEditingSportId] = useState<string | null>(null);
  const [editSportName, setEditSportName] = useState("");
  const [searchSport, setSearchSport] = useState("");

  // Channels State
  const [channels, setChannels] = useState<TaxonomyItem[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [newChannelName, setNewChannelName] = useState("");
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState("");
  const [searchChannel, setSearchChannel] = useState("");

  // Global UI feedback
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // ─── Fetch Sports ─────────────────────────────────────────────────────────
  const fetchSports = useCallback(async () => {
    setLoadingSports(true);
    try {
      const res = await axios.get("/api/admin/sports");
      if (res.data?.success && Array.isArray(res.data.sports)) {
        setSports(res.data.sports);
      } else {
        setSports([]);
      }
    } catch (err) {
      console.error("Failed to fetch sports:", err);
      showToast("Failed to load sports list", "error");
    } finally {
      setLoadingSports(false);
    }
  }, []);

  // ─── Fetch Channels ───────────────────────────────────────────────────────
  const fetchChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const res = await axios.get("/api/admin/channels");
      if (res.data?.success && Array.isArray(res.data.channels)) {
        setChannels(res.data.channels);
      } else {
        setChannels([]);
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
      showToast("Failed to load channels list", "error");
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  useEffect(() => {
    fetchSports();
    fetchChannels();
  }, [fetchSports, fetchChannels]);

  // ─── Sport Actions ────────────────────────────────────────────────────────
  const handleCreateSport = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSportName.trim();
    if (!name) return;

    setActionLoading(true);
    try {
      const res = await axios.post("/api/admin/sports", { name });
      if (res.data?.success) {
        setNewSportName("");
        showToast(`Sport "${name}" created successfully!`);
        fetchSports();
      } else {
        showToast(res.data?.error || "Failed to create sport", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to create sport", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSport = async (id: string) => {
    const name = editSportName.trim();
    if (!name) return;

    setActionLoading(true);
    try {
      const res = await axios.put(`/api/admin/sports/${id}`, { name });
      if (res.data?.success) {
        setEditingSportId(null);
        showToast(`Sport updated to "${name}"!`);
        fetchSports();
      } else {
        showToast(res.data?.error || "Failed to update sport", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to update sport", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSport = async (item: TaxonomyItem) => {
    if (!confirm(`Are you sure you want to delete sport "${item.name}"?`)) return;

    setActionLoading(true);
    try {
      const res = await axios.delete(`/api/admin/sports/${item.id}`);
      if (res.data?.success) {
        showToast(`Sport "${item.name}" deleted successfully!`);
        fetchSports();
      } else {
        showToast(res.data?.error || "Failed to delete sport", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to delete sport", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Channel Actions ──────────────────────────────────────────────────────
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newChannelName.trim();
    if (!name) return;

    setActionLoading(true);
    try {
      const res = await axios.post("/api/admin/channels", { name });
      if (res.data?.success) {
        setNewChannelName("");
        showToast(`Channel "${name}" created successfully!`);
        fetchChannels();
      } else {
        showToast(res.data?.error || "Failed to create channel", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to create channel", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateChannel = async (id: string) => {
    const name = editChannelName.trim();
    if (!name) return;

    setActionLoading(true);
    try {
      const res = await axios.put(`/api/admin/channels/${id}`, { name });
      if (res.data?.success) {
        setEditingChannelId(null);
        showToast(`Channel updated to "${name}"!`);
        fetchChannels();
      } else {
        showToast(res.data?.error || "Failed to update channel", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to update channel", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteChannel = async (item: TaxonomyItem) => {
    if (!confirm(`Are you sure you want to delete channel "${item.name}"?`)) return;

    setActionLoading(true);
    try {
      const res = await axios.delete(`/api/admin/channels/${item.id}`);
      if (res.data?.success) {
        showToast(`Channel "${item.name}" deleted successfully!`);
        fetchChannels();
      } else {
        showToast(res.data?.error || "Failed to delete channel", "error");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Failed to delete channel", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered lists
  const filteredSports = sports.filter((s) =>
    s.name.toLowerCase().includes(searchSport.toLowerCase()) ||
    s.id.toLowerCase().includes(searchSport.toLowerCase())
  );

  const filteredChannels = channels.filter((c) =>
    c.name.toLowerCase().includes(searchChannel.toLowerCase()) ||
    c.id.toLowerCase().includes(searchChannel.toLowerCase())
  );

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100, margin: "0 auto", color: "#f0f6fc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            top: 24,
            right: 24,
            zIndex: 9999,
            background: toastType === "success" ? "#238636" : "#da3633",
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          {toastType === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#fff", letterSpacing: "-0.02em" }}>
              Channels & Sports Management
            </h1>
            <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(56, 139, 253, 0.15)", color: "#58a6ff", border: "1px solid rgba(56, 139, 253, 0.3)", padding: "2px 8px", borderRadius: 12 }}>
              UNIVERSAL
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#8b949e" }}>
            Single universal control center to create, rename, and manage all sports categories and channel formats.
          </p>
        </div>

        <button
          onClick={() => {
            fetchSports();
            fetchChannels();
            showToast("Refreshed data!");
          }}
          disabled={loadingSports || loadingChannels}
          style={{
            background: "#21262d",
            color: "#c9d1d9",
            border: "1px solid #30363d",
            padding: "7px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshCw size={13} className={loadingSports || loadingChannels ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main 2-Tab Bar */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #21262d", marginBottom: 24, paddingBottom: 0 }}>
        <button
          onClick={() => setActiveTab("sports")}
          style={{
            background: activeTab === "sports" ? "#161b22" : "transparent",
            color: activeTab === "sports" ? "#58a6ff" : "#8b949e",
            borderTop: `1px solid ${activeTab === "sports" ? "#30363d" : "transparent"}`,
            borderLeft: `1px solid ${activeTab === "sports" ? "#30363d" : "transparent"}`,
            borderRight: `1px solid ${activeTab === "sports" ? "#30363d" : "transparent"}`,
            borderBottom: activeTab === "sports" ? "2px solid #58a6ff" : "none",
            borderRadius: "6px 6px 0 0",
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all .15s ease",
          }}
        >
          <Trophy size={16} className={activeTab === "sports" ? "text-[#58a6ff]" : "text-[#8b949e]"} />
          <span>1. Sports</span>
          <span style={{ fontSize: 11, background: activeTab === "sports" ? "rgba(56, 139, 253, 0.2)" : "#21262d", color: activeTab === "sports" ? "#58a6ff" : "#8b949e", padding: "1px 6px", borderRadius: 10 }}>
            {sports.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("channels")}
          style={{
            background: activeTab === "channels" ? "#161b22" : "transparent",
            color: activeTab === "channels" ? "#d2a8ff" : "#8b949e",
            borderTop: `1px solid ${activeTab === "channels" ? "#30363d" : "transparent"}`,
            borderLeft: `1px solid ${activeTab === "channels" ? "#30363d" : "transparent"}`,
            borderRight: `1px solid ${activeTab === "channels" ? "#30363d" : "transparent"}`,
            borderBottom: activeTab === "channels" ? "2px solid #d2a8ff" : "none",
            borderRadius: "6px 6px 0 0",
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "all .15s ease",
          }}
        >
          <Layers size={16} className={activeTab === "channels" ? "text-[#d2a8ff]" : "text-[#8b949e]"} />
          <span>2. Channels</span>
          <span style={{ fontSize: 11, background: activeTab === "channels" ? "rgba(163, 113, 247, 0.2)" : "#21262d", color: activeTab === "channels" ? "#d2a8ff" : "#8b949e", padding: "1px 6px", borderRadius: 10 }}>
            {channels.length}
          </span>
        </button>
      </div>

      {/* ─── TAB 1: SPORTS MANAGEMENT ──────────────────────────────────────── */}
      {activeTab === "sports" && (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, alignItems: "start" }}>
          {/* Create Sport Form (Single Field) */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px 0", color: "#f0f6fc", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={16} className="text-[#58a6ff]" />
              <span>Add New Sport</span>
            </h2>
            <p style={{ fontSize: 11, color: "#8b949e", margin: "0 0 16px 0" }}>
              Creates a universal sport entry stored in <code style={{ color: "#58a6ff" }}>MS_Sports</code> table.
            </p>

            <form onSubmit={handleCreateSport}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#c9d1d9", display: "block", marginBottom: 6 }}>
                  Sport Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cricket, Football, Basketball"
                  value={newSportName}
                  onChange={(e) => setNewSportName(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "9px 12px",
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading || !newSportName.trim()}
                style={{
                  width: "100%",
                  background: !newSportName.trim() ? "#21262d" : "#238636",
                  color: !newSportName.trim() ? "#8b949e" : "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !newSportName.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "background .15s ease",
                }}
              >
                <Plus size={15} />
                <span>Save Sport</span>
              </button>
            </form>
          </div>

          {/* Sports List */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc" }}>
                Configured Sports ({sports.length})
              </div>

              {/* Search */}
              <div style={{ position: "relative", width: 200 }}>
                <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#8b949e" }} />
                <input
                  type="text"
                  placeholder="Search sport..."
                  value={searchSport}
                  onChange={(e) => setSearchSport(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "6px 10px 6px 28px",
                    color: "#fff",
                    fontSize: 12,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {loadingSports ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e", fontSize: 13 }}>
                Loading sports from database...
              </div>
            ) : filteredSports.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e", fontSize: 13, border: "1px dashed #30363d", borderRadius: 8 }}>
                No sports found. Add your first sport using the form on the left.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredSports.map((sport) => {
                  const isEditing = editingSportId === sport.id;

                  return (
                    <div
                      key={sport.id}
                      style={{
                        background: "#0d1117",
                        border: isEditing ? "1.5px solid #58a6ff" : "1px solid #21262d",
                        borderRadius: 8,
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all .15s ease",
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, marginRight: 10 }}>
                          <input
                            type="text"
                            value={editSportName}
                            onChange={(e) => setEditSportName(e.target.value)}
                            style={{
                              flex: 1,
                              background: "#161b22",
                              border: "1px solid #388bfd",
                              borderRadius: 4,
                              padding: "5px 8px",
                              color: "#fff",
                              fontSize: 13,
                              outline: "none",
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateSport(sport.id)}
                            style={{ background: "#238636", color: "#fff", border: "none", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Check size={13} /> Save
                          </button>
                          <button
                            onClick={() => setEditingSportId(null)}
                            style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d", borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
                          >
                            <X size={13} /> Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc" }}>
                            {sport.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>
                            Key ID: <code style={{ color: "#a5d6ff" }}>{sport.id}</code>
                          </div>
                        </div>
                      )}

                      {!isEditing && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            onClick={() => {
                              setEditingSportId(sport.id);
                              setEditSportName(sport.name);
                            }}
                            style={{
                              background: "#21262d",
                              border: "1px solid #30363d",
                              color: "#c9d1d9",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Edit Sport Name"
                          >
                            <Pencil size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteSport(sport)}
                            style={{
                              background: "rgba(218, 54, 51, 0.1)",
                              border: "1px solid rgba(218, 54, 51, 0.3)",
                              color: "#ff7b72",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Delete Sport"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: CHANNELS MANAGEMENT ────────────────────────────────────── */}
      {activeTab === "channels" && (
        <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 24, alignItems: "start" }}>
          {/* Create Channel Form (Single Field) */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 20 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px 0", color: "#f0f6fc", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={16} className="text-[#d2a8ff]" />
              <span>Add New Channel</span>
            </h2>
            <p style={{ fontSize: 11, color: "#8b949e", margin: "0 0 16px 0" }}>
              Creates a universal channel/feed perspective (e.g. Experts, Analysts, Creators) stored in <code style={{ color: "#d2a8ff" }}>SocialAndContent</code>.
            </p>

            <form onSubmit={handleCreateChannel}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#c9d1d9", display: "block", marginBottom: 6 }}>
                  Channel Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Experts, Analysts, Insiders, Creators, Fans"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "9px 12px",
                    color: "#fff",
                    fontSize: 13,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading || !newChannelName.trim()}
                style={{
                  width: "100%",
                  background: !newChannelName.trim() ? "#21262d" : "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
                  color: !newChannelName.trim() ? "#8b949e" : "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !newChannelName.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  transition: "opacity .15s ease",
                }}
              >
                <Plus size={15} />
                <span>Save Channel</span>
              </button>
            </form>
          </div>

          {/* Channels List */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc" }}>
                Configured Channels ({channels.length})
              </div>

              {/* Search */}
              <div style={{ position: "relative", width: 200 }}>
                <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#8b949e" }} />
                <input
                  type="text"
                  placeholder="Search channel..."
                  value={searchChannel}
                  onChange={(e) => setSearchChannel(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "6px 10px 6px 28px",
                    color: "#fff",
                    fontSize: 12,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            </div>

            {loadingChannels ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e", fontSize: 13 }}>
                Loading channels from database...
              </div>
            ) : filteredChannels.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e", fontSize: 13, border: "1px dashed #30363d", borderRadius: 8 }}>
                No channels found. Add your first channel using the form on the left.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredChannels.map((channel) => {
                  const isEditing = editingChannelId === channel.id;

                  return (
                    <div
                      key={channel.id}
                      style={{
                        background: "#0d1117",
                        border: isEditing ? "1.5px solid #d2a8ff" : "1px solid #21262d",
                        borderRadius: 8,
                        padding: "10px 14px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        transition: "all .15s ease",
                      }}
                    >
                      {isEditing ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, marginRight: 10 }}>
                          <input
                            type="text"
                            value={editChannelName}
                            onChange={(e) => setEditChannelName(e.target.value)}
                            style={{
                              flex: 1,
                              background: "#161b22",
                              border: "1px solid #a855f7",
                              borderRadius: 4,
                              padding: "5px 8px",
                              color: "#fff",
                              fontSize: 13,
                              outline: "none",
                            }}
                            autoFocus
                          />
                          <button
                            onClick={() => handleUpdateChannel(channel.id)}
                            style={{ background: "#238636", color: "#fff", border: "none", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                          >
                            <Check size={13} /> Save
                          </button>
                          <button
                            onClick={() => setEditingChannelId(null)}
                            style={{ background: "#21262d", color: "#8b949e", border: "1px solid #30363d", borderRadius: 4, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
                          >
                            <X size={13} /> Cancel
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 6 }}>
                            <Hash size={13} className="text-[#d2a8ff]" />
                            <span>{channel.name}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>
                            Key ID: <code style={{ color: "#d2a8ff" }}>{channel.id}</code>
                          </div>
                        </div>
                      )}

                      {!isEditing && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            onClick={() => {
                              setEditingChannelId(channel.id);
                              setEditChannelName(channel.name);
                            }}
                            style={{
                              background: "#21262d",
                              border: "1px solid #30363d",
                              color: "#c9d1d9",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Edit Channel Name"
                          >
                            <Pencil size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteChannel(channel)}
                            style={{
                              background: "rgba(218, 54, 51, 0.1)",
                              border: "1px solid rgba(218, 54, 51, 0.3)",
                              color: "#ff7b72",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                            title="Delete Channel"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
