// app/admin/roar-management/roar-list/page.tsx
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2, MessageSquare, X, Eye, EyeOff, Pencil } from "lucide-react";
import Link from "next/link";
import EngagementCard from "@/components/Engagements/EngagementCard";
import type { EngagementItem } from "@/types/engagements";

export default function RoarListPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Core Engine Matches for Room Assignment
  const [matches, setMatches] = useState<any[]>([]);
  const [updatingMatchRoomId, setUpdatingMatchRoomId] = useState<string | null>(null);

  // Messages modal/dialog state
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [roomEngagements, setRoomEngagements] = useState<EngagementItem[]>([]);
  const [loadingEngagements, setLoadingEngagements] = useState(false);
  const [roomModalTab, setRoomModalTab] = useState<"engagements" | "chat">("engagements");

  const fetchRooms = async () => {
    try {
      setLoading(true);
      // includeInactive=true so admins can see + reactivate deactivated rooms
      const res = await axios.get("/api/roar/rooms?includeInactive=true&limit=50");
      setRooms(res.data.rooms || []);
    } catch (error) {
      console.error("Failed to fetch rooms", error);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMatches = async () => {
    try {
      const res = await fetch("/api/matches?limit=100");
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMatches(data.data);
      }
    } catch (error) {
      console.warn("Failed to fetch matches for room selector:", error);
    }
  };

  const handleAssignMatch = async (roomId: string, matchId: string) => {
    setUpdatingMatchRoomId(roomId);
    try {
      await axios.patch(`/api/roar/rooms/${roomId}`, { matchId });
      setRooms((prev) =>
        prev.map((r) => (r.roomId === roomId ? { ...r, matchId } : r))
      );
    } catch (error) {
      console.error("Failed to link match to room", error);
      alert("Failed to update room match");
    } finally {
      setUpdatingMatchRoomId(null);
    }
  };

  useEffect(() => {
    fetchMatches();
    fetchRooms();
  }, []);

  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm("Delete this RoAR room and all its messages?");
    if (!confirmDelete) return;

    setDeletingId(id);
    try {
      await axios.delete(`/api/roar/rooms/${id}`);
      setRooms((prev) => prev.filter((room) => room.roomId !== id));
      if (selectedRoom && selectedRoom.roomId === id) {
        setSelectedRoom(null);
      }
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete room");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (room: any) => {
    const nextActive = !room.isActive;
    setTogglingId(room.roomId);
    try {
      await axios.patch(`/api/roar/rooms/${room.roomId}`, { isActive: nextActive });
      setRooms((prev) =>
        prev.map((r) => (r.roomId === room.roomId ? { ...r, isActive: nextActive } : r))
      );
      if (selectedRoom && selectedRoom.roomId === room.roomId) {
        setSelectedRoom((prev: any) => (prev ? { ...prev, isActive: nextActive } : prev));
      }
    } catch (error) {
      console.error("Failed to toggle room status", error);
      alert("Failed to update room status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleOpenMessages = async (room: any) => {
    setSelectedRoom(room);
    setMessages([]);
    setRoomEngagements([]);
    setLoadingMessages(true);
    setLoadingEngagements(true);
    setRoomModalTab(room.matchId ? "engagements" : "chat");

    try {
      const res = await axios.get(`/api/roar/rooms/${room.roomId}/messages?limit=100`);
      setMessages(res.data.messages || []);
    } catch (error) {
      console.error("Failed to fetch room messages", error);
    } finally {
      setLoadingMessages(false);
    }

    if (room.matchId) {
      try {
        const engRes = await axios.get(`/api/engagements?matchId=${room.matchId}`);
        setRoomEngagements(engRes.data.engagements || engRes.data.items || engRes.data.data || []);
      } catch (engErr) {
        console.warn("Failed to fetch room engagements:", engErr);
      } finally {
        setLoadingEngagements(false);
      }
    } else {
      setLoadingEngagements(false);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!selectedRoom) return;
    const confirmDelete = window.confirm("Delete this message?");
    if (!confirmDelete) return;

    setDeletingMsgId(msgId);
    try {
      await axios.delete(`/api/roar/rooms/${selectedRoom.roomId}/messages/${msgId}`);
      setMessages((prev) => prev.filter((m) => m.msgId !== msgId));
    } catch (error) {
      console.error("Failed to delete message", error);
      alert("Failed to delete message");
    } finally {
      setDeletingMsgId(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">
            RoAR Active Shows
          </h1>
          <p className="text-sm text-gray-400">
            Manage all active live chat discussion rooms
          </p>
        </div>
        <Link href="/admin/roar-management/add-roar">
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-pink-700 px-4 py-2 rounded-lg text-sm font-semibold text-white transition">
            Create Show Room
          </button>
        </Link>
      </div>

      {/* Table Card */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {["#", "Room Name", "Linked Match (Core Engine)", "Emoji", "Active Fans", "Status", "Actions"].map((head) => (
                  <th
                    key={head}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500"></div>
                      Loading shows...
                    </div>
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No active shows found. Create your first show room!
                  </td>
                </tr>
              ) : (
                rooms.map((room, index) => (
                  <tr
                    key={room.roomId}
                    className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                  >
                    {/* Index */}
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {index + 1}
                    </td>

                    {/* Room Name */}
                    <td className="px-4 py-3 text-sm font-medium text-white">
                      {room.name || "Unnamed Room"}
                    </td>

                    {/* Linked Match (Core Engine) */}
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-col gap-1.5 min-w-[240px]">
                        <div className="relative">
                          <select
                            value={room.matchId || ""}
                            disabled={updatingMatchRoomId === room.roomId}
                            onChange={(e) => handleAssignMatch(room.roomId, e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                          >
                            <option value="">-- No Match Linked --</option>
                            {matches.map((m) => {
                              const matchIdVal = m.match_id || m.id;
                              const team1 = m.team1 || m.team_a || "Team 1";
                              const team2 = m.team2 || m.team_b || "Team 2";
                              return (
                                <option key={matchIdVal} value={matchIdVal}>
                                  🏏 {team1} vs {team2} ({matchIdVal})
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* {room.matchId && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-[#58a6ff] bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                              {room.matchId}
                            </span>
                            <Link
                              href={`/admin/core-engine/match-moments?matchId=${room.matchId}`}
                              className="text-[10px] text-gray-400 hover:text-blue-400 underline transition"
                              title="Go to Match Moments & Engagements for this match"
                            >
                              Manage Loops ↗
                            </Link>
                          </div>
                        )} */}
                      </div>
                    </td>

                    {/* Emoji */}
                    <td className="px-4 py-3 text-lg">
                      {room.icon || "⚽"}
                    </td>

                    {/* Presence stats */}
                    <td className="px-4 py-3 text-sm text-gray-300">
                      👥 {room.fanCount || 0} fans active
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${room.isActive
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                          }`}
                      >
                        {room.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* View Room Messages button */}
                        <button
                          onClick={() => handleOpenMessages(room)}
                          className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                          title="View Live Chat Messages"
                        >
                          <MessageSquare size={16} />
                        </button>

                        {/* Edit Room button */}
                        <Link href={`/admin/roar-management/add-roar?roomId=${room.roomId}`}>
                          <button
                            className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                            title="Edit Room"
                          >
                            <Pencil size={16} />
                          </button>
                        </Link>

                        {/* ⭐ MANAGE CHANNELS BUTTON ⭐ */}
                        <Link href={`/admin/roar-management/rooms/${room.roomId}/channels`}>
                          <button
                            className="p-2 rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition"
                            title="Manage Channels"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                              <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                          </button>
                        </Link>

                        {/* Toggle Active/Inactive button */}
                        <button
                          onClick={() => handleToggleActive(room)}
                          disabled={togglingId === room.roomId}
                          className={`p-2 rounded-md transition disabled:opacity-50 ${room.isActive
                              ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                              : "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                            }`}
                          title={room.isActive ? "Deactivate Room" : "Activate Room"}
                        >
                          {togglingId === room.roomId ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : room.isActive ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>

                        {/* Delete Room button */}
                        <button
                          onClick={() => handleDelete(room.roomId)}
                          disabled={deletingId === room.roomId}
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                          title="Delete Room"
                        >
                          {deletingId === room.roomId ? (
                            <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Room Messages Moderation Modal */}
      {selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg w-full max-w-[800px] overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="p-4 border-b border-[#21262d] flex justify-between items-center bg-[#1c2330]">
              <div>
                <h2 className="text-lg font-bold text-white">Live Room BANTER Moderation</h2>
                <p className="text-xs text-gray-400">Room: {selectedRoom.name}</p>
              </div>
              <button
                onClick={() => setSelectedRoom(null)}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Room Detail Preview */}
            <div className="p-4 bg-[#0d1117] border-b border-[#21262d] text-sm text-gray-200">
              <p className="font-semibold mb-2">Live Room Details:</p>
              <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-3 flex items-center justify-between">
                <span>Show Room ID: <code className="bg-gray-800 text-pink-400 px-1 py-0.5 rounded text-xs">{selectedRoom.roomId}</code></span>
                <span>Active Fans count: <strong className="text-blue-400">{selectedRoom.fanCount || 0}</strong></span>
              </div>
            </div>

            {/* Tabs Switcher: Engagements vs Live Messages */}
            <div className="flex border-b border-[#21262d] bg-[#161b22] px-4">
              <button
                onClick={() => setRoomModalTab("engagements")}
                className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
                  roomModalTab === "engagements"
                    ? "border-pink-500 text-pink-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>🎯</span>
                <span>Served Engagements ({roomEngagements.length})</span>
                {selectedRoom.matchId && (
                  <span className="text-[10px] bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded font-mono">
                    MATCH #{selectedRoom.matchId.replace(/^MATCH#/, "")}
                  </span>
                )}
              </button>
              <button
                onClick={() => setRoomModalTab("chat")}
                className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
                  roomModalTab === "chat"
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>💬</span>
                <span>Room Banter Chat ({messages.length})</span>
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {roomModalTab === "engagements" ? (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Live Engagements Served In This RoAR Room
                    </h3>
                    {selectedRoom.matchId ? (
                      <Link
                        href="/admin/core-engine/match-moments"
                        className="text-xs text-pink-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        + Create More Loops in Core Engine ↗
                      </Link>
                    ) : (
                      <span className="text-xs text-amber-400">
                        ⚠️ No match linked to this room yet. Select a match in the table to serve loops!
                      </span>
                    )}
                  </div>

                  {loadingEngagements ? (
                    <div className="text-center py-10 text-gray-400">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto mb-2"></div>
                      Loading match engagements...
                    </div>
                  ) : !selectedRoom.matchId ? (
                    <div className="text-center py-12 bg-[#0d1117] border border-[#21262d] rounded-xl p-6">
                      <p className="text-base font-bold text-gray-200 mb-2">No Match Linked To This Room</p>
                      <p className="text-xs text-gray-400 max-w-md mx-auto mb-4">
                        Link a Core Engine match to this room using the &quot;Linked Match&quot; dropdown in the RoAR Room list. All moments and loops created for that match will automatically be served here.
                      </p>
                    </div>
                  ) : roomEngagements.length === 0 ? (
                    <div className="text-center py-12 bg-[#0d1117] border border-[#21262d] rounded-xl p-6">
                      <p className="text-base font-bold text-gray-200 mb-2">No Engagements Created Yet</p>
                      <p className="text-xs text-gray-400 max-w-md mx-auto mb-4">
                        Engagements created under Match Moments for Match <strong>#{selectedRoom.matchId}</strong> will show up live right here with fan voting percentages, likes, shares, and threaded banter discussion.
                      </p>
                      <Link
                        href="/admin/core-engine/match-moments"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold transition"
                      >
                        Create Engagement Loop Now ↗
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {roomEngagements.map((item) => (
                        <div key={item.id} className="relative">
                          <EngagementCard item={item} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Chat Messages Tab */
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Live Chat Messages ({messages.length})
                  </h3>

                  {loadingMessages ? (
                    <div className="text-center py-6 text-gray-400">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500 mx-auto mb-2"></div>
                      Loading messages...
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-center py-6 text-gray-500 text-sm">
                      No active messages inside this show room.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((message) => (
                        <div
                          key={message.msgId}
                          className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3 flex justify-between items-start gap-4"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-white">
                                @{message.authorUsername}
                              </span>
                              <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                                {message.authorBadge}
                              </span>
                              {message.type && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${message.type === "hot_take" || message.type === "hottake"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                                  : message.type === "prediction"
                                    ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  }`}>
                                  {message.type}
                                </span>
                              )}
                              <span className="text-xs text-gray-500 ml-auto">
                                {new Date(message.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-300">{message.text}</p>
                            <div className="mt-2 text-xs text-gray-400 flex items-center gap-3">
                              <span>🔥 {message.fireCount || 0}</span>
                              <span>🙅‍♂️ {message.noChanceCount || 0}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDeleteMessage(message.msgId)}
                            disabled={deletingMsgId === message.msgId}
                            className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                            title="Delete Message"
                          >
                            {deletingMsgId === message.msgId ? (
                              <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#21262d] bg-[#1c2330] flex justify-end">
              <button
                onClick={() => setSelectedRoom(null)}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-sm text-white font-semibold transition"
              >
                Close Dialog
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}