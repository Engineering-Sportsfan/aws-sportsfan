"use client";

import axios from "axios";
import { useEffect, useState, useCallback } from "react";
import { Eye, Trash2, Flag, CheckCircle, XCircle } from "lucide-react";

type VideoMessage = {
  id: string;
  videoId: string;
  videoTitle: string;
  userId: string;
  userName: string;
  message: string;
  rating: number | null;
  createdAt: number;
  isRead: boolean;
  isFlagged: boolean;
};

type Stats = {
  total: number;
  unread: number;
  flagged: number;
  totalVideos: number;
};

export default function VideoMessagesListPage() {
  const [messages, setMessages] = useState<VideoMessage[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    unread: 0,
    flagged: 0,
    totalVideos: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "flagged">("all");
  const [selectedMessage, setSelectedMessage] = useState<VideoMessage | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // useCallback so fetchMessages can safely be used in useEffect
  const fetchMessages = useCallback(async (currentFilter: "all" | "unread" | "flagged") => {
    try {
      setLoading(true);

      let url = "/api/video-messages";
      if (currentFilter === "unread") url = "/api/video-messages?status=unread";
      else if (currentFilter === "flagged") url = "/api/video-messages?status=flagged";

      const res = await axios.get(url);

      if (res.data.success) {
        setMessages(res.data.messages);
        setStats(res.data.stats);
      } else {
        console.error("API returned error:", res.data.message);
      }
    } catch (error) {
      console.error("Failed to fetch messages", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pass current filter directly to avoid stale closure
  useEffect(() => {
    fetchMessages(filter);
  }, [filter, fetchMessages]);

  const handleMarkAsRead = async (messageId: string, currentIsRead: boolean) => {
    setUpdating(messageId);
    try {
      const response = await axios.patch("/api/video-messages", {
        messageId,
        isRead: !currentIsRead,
      });

      if (response.data.success) {
        const newIsRead = !currentIsRead;

        setMessages((prev) => {
          // In "unread" tab: marking as read → remove from list
          if (filter === "unread" && newIsRead) {
            return prev.filter((msg) => msg.id !== messageId);
          }
          // Otherwise just update the flag
          return prev.map((msg) =>
            msg.id === messageId ? { ...msg, isRead: newIsRead } : msg
          );
        });

        // Keep stats in sync
        setStats((prev) => ({
          ...prev,
          unread: newIsRead ? prev.unread - 1 : prev.unread + 1,
        }));

        // Also keep the modal in sync if it's open for this message
        setSelectedMessage((prev) =>
          prev?.id === messageId ? { ...prev, isRead: newIsRead } : prev
        );
      } else {
        alert("Failed to update message status");
      }
    } catch (error) {
      console.error("Failed to update message", error);
      alert("Error updating message. Check console for details.");
    } finally {
      setUpdating(null);
    }
  };

  const handleFlagMessage = async (messageId: string, currentIsFlagged: boolean) => {
    setUpdating(messageId);
    try {
      const response = await axios.patch("/api/video-messages", {
        messageId,
        isFlagged: !currentIsFlagged,
      });

      if (response.data.success) {
        const newIsFlagged = !currentIsFlagged;

        setMessages((prev) => {
          // In "flagged" tab: removing flag → remove from list
          if (filter === "flagged" && !newIsFlagged) {
            return prev.filter((msg) => msg.id !== messageId);
          }
          // Otherwise just update the flag
          return prev.map((msg) =>
            msg.id === messageId ? { ...msg, isFlagged: newIsFlagged } : msg
          );
        });

        // Keep stats in sync
        setStats((prev) => ({
          ...prev,
          flagged: newIsFlagged ? prev.flagged + 1 : prev.flagged - 1,
        }));

        // Also keep the modal in sync if it's open for this message
        setSelectedMessage((prev) =>
          prev?.id === messageId ? { ...prev, isFlagged: newIsFlagged } : prev
        );
      } else {
        alert("Failed to update flag status");
      }
    } catch (error) {
      console.error("Failed to flag message", error);
      alert("Error flagging message. Check console for details.");
    } finally {
      setUpdating(null);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const confirmDelete = window.confirm("Delete this message?");
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/video-messages?messageId=${messageId}`);

      // Remove from list immediately
      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));

      // Close modal if the deleted message was open
      setSelectedMessage((prev) => (prev?.id === messageId ? null : prev));

      // Re-fetch to get accurate stats from server
      fetchMessages(filter);
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete message");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Video Messages</h1>
        <p className="text-sm text-gray-400">
          Manage user messages and feedback for video drops
        </p>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Messages</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Unread</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.unread}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Flagged</p>
          <p className="text-2xl font-bold text-red-400">{stats.flagged}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Unique Videos</p>
          <p className="text-2xl font-bold text-blue-400">{stats.totalVideos}</p>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-blue-600 text-white"
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          All Messages ({stats.total})
        </button>
        <button
          onClick={() => setFilter("unread")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "unread"
              ? "bg-blue-600 text-white"
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          Unread ({stats.unread})
        </button>
        <button
          onClick={() => setFilter("flagged")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "flagged"
              ? "bg-blue-600 text-white"
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          Flagged ({stats.flagged})
        </button>
      </div>

      {/* MESSAGES TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">User Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Video Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Message</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2">Loading messages...</p>
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No {filter !== "all" ? filter : ""} messages found
                  </td>
                </tr>
              ) : (
                messages.map((message, index) => (
                  <tr
                    key={message.id}
                    className={`border-b border-[#21262d] hover:bg-[#0d1117] transition ${
                      message.isFlagged
                        ? "bg-red-900/10"
                        : !message.isRead
                        ? "bg-blue-900/10"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3">{index + 1}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <span className="text-blue-400 text-xs font-bold">
                            {message.userName.charAt(0).toUpperCase()}
                          </span>
                        </div> */}
                        <span className="font-medium text-white">{message.userName}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="max-w-[200px]">
                        <p className="text-sm text-white truncate" title={message.videoTitle}>
                          {message.videoTitle}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="max-w-[300px]">
                        <p className="text-sm text-gray-300 line-clamp-2" title={message.message}>
                          {message.message}
                        </p>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-400">{formatDate(message.createdAt)}</p>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {!message.isRead && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                            Unread
                          </span>
                        )}
                        {message.isFlagged && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-400">
                            <Flag size={10} />
                            Flagged
                          </span>
                        )}
                        {message.isRead && !message.isFlagged && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">
                            <CheckCircle size={10} />
                            Read
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleMarkAsRead(message.id, message.isRead)}
                          disabled={updating === message.id}
                          className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition disabled:opacity-50"
                          title={message.isRead ? "Mark as unread" : "Mark as read"}
                        >
                          {updating === message.id ? (
                            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                          ) : message.isRead ? (
                            <XCircle size={16} />
                          ) : (
                            <CheckCircle size={16} />
                          )}
                        </button>

                        <button
                          onClick={() => handleFlagMessage(message.id, message.isFlagged)}
                          disabled={updating === message.id}
                          className={`p-2 rounded-md transition disabled:opacity-50 ${
                            message.isFlagged
                              ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                              : "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                          }`}
                          title={message.isFlagged ? "Remove flag" : "Flag message"}
                        >
                          <Flag size={16} />
                        </button>

                        <button
                          onClick={() => setSelectedMessage(message)}
                          className="p-2 rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => handleDeleteMessage(message.id)}
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                          title="Delete"
                        >
                          <Trash2 size={16} />
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

      {/* MESSAGE DETAILS MODAL */}
      {selectedMessage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMessage(null)}
        >
          <div
            className="bg-[#161b22] rounded-xl max-w-2xl w-full p-6 border border-[#21262d]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-semibold">Message Details</h3>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-gray-400 hover:text-white transition"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase">User</p>
                <p className="text-white font-medium">{selectedMessage.userName}</p>
                <p className="text-xs text-gray-500">ID: {selectedMessage.userId}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Video</p>
                <p className="text-white">{selectedMessage.videoTitle}</p>
                <p className="text-xs text-gray-500">ID: {selectedMessage.videoId}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Message</p>
                <p className="text-gray-300 bg-[#0d1117] p-3 rounded-lg">{selectedMessage.message}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Rating</p>
                <p className="text-yellow-400">
                  {selectedMessage.rating ? "⭐".repeat(selectedMessage.rating) : "No rating"}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Sent At</p>
                <p className="text-gray-300">{formatDate(selectedMessage.createdAt)}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Status</p>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => handleMarkAsRead(selectedMessage.id, selectedMessage.isRead)}
                    className="px-2 py-1 text-xs rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  >
                    {selectedMessage.isRead ? "Mark as Unread" : "Mark as Read"}
                  </button>
                  <button
                    onClick={() => handleFlagMessage(selectedMessage.id, selectedMessage.isFlagged)}
                    className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  >
                    {selectedMessage.isFlagged ? "Remove Flag" : "Flag"}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setSelectedMessage(null)}
                className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}