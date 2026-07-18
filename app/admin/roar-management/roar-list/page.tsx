// app/admin/roar-management/roar-list/page.tsx
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Trash2, MessageSquare, X } from "lucide-react";
import Link from "next/link";

export default function RoarListPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Messages modal/dialog state
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/roar/rooms");
      setRooms(res.data.rooms || []);
    } catch (error) {
      console.error("Failed to fetch rooms", error);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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

  const handleOpenMessages = async (room: any) => {
    setSelectedRoom(room);
    setMessages([]);
    setLoadingMessages(true);
    try {
      const res = await axios.get(`/api/roar/rooms/${room.roomId}/messages?limit=100`);
      setMessages(res.data.messages || []);
    } catch (error) {
      console.error("Failed to fetch room messages", error);
    } finally {
      setLoadingMessages(false);
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
          <table className="w-full min-w-[600px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {["#", "Room Name", "Emoji/Icon", "Active Fans", "Actions"].map((head) => (
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
                  <td colSpan={5} className="text-center py-8 text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500"></div>
                      Loading shows...
                    </div>
                  </td>
                </tr>
              ) : rooms.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-400">
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

                    {/* Emoji */}
                    <td className="px-4 py-3 text-lg">
                      {room.icon || "⚽"}
                    </td>

                    {/* Presence stats */}
                    <td className="px-4 py-3 text-sm text-gray-300">
                      👥 {room.fanCount || 0} fans active
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
                        {/* Unlink Match (Stop Dolly) button */}
                        <button
                          onClick={async () => {
                            if (!confirm(`Stop Dolly posting in '${room.name}'? (This unlinks the focus match without deleting anything)`)) return;
                            try {
                              await axios.patch(`/api/roar/rooms/${room.roomId}`, { matchId: null });
                              setRooms(prev => prev.map(r => r.roomId === room.roomId ? { ...r, matchId: null } : r));
                              alert("Dolly has been stopped for this room!");
                            } catch (err) {
                              console.error("Unlink failed", err);
                              alert("Failed to stop Dolly.");
                            }
                          }}
                          className="px-2 py-1 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition text-xs font-semibold"
                          title="Stop Dolly in this room"
                        >
                          Stop Dolly 🐬
                        </button>

                        {/* ⭐ ADD THE MANAGE CHANNELS BUTTON HERE ⭐ */}
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

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4">
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
