// Admin Panel: app/admin/drop-requests/page.tsx
"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, Trash2, CheckCircle, XCircle, Clock, Music, User, MessageSquare } from "lucide-react";

type DropRequest = {
  id: string;
  userName: string;
  message: string;
  audioTitle: string | null;
  userId: string | null;
  status: "pending" | "approved" | "rejected" | "completed";
  adminNote?: string;
  createdAt: number;
  updatedAt: number;
  isRead: boolean;
  isFlagged: boolean;
};

type Stats = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  completed: number;
};

export default function DropRequestsPage() {
  const [requests, setRequests] = useState<DropRequest[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    completed: 0
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected" | "completed">("pending");
  const [selectedRequest, setSelectedRequest] = useState<DropRequest | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [filter]);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      let url = "/api/request-drop";
      if (filter !== "all") {
        url += `?status=${filter}`;
      }
      
      const res = await axios.get(url);
      
      if (res.data.success) {
        setRequests(res.data.requests);
        setStats(res.data.stats);
      }
    } catch (error) {
      console.error("Failed to fetch requests", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (requestId: string, newStatus: string) => {
    setUpdating(requestId);
    try {
      const response = await axios.patch("/api/request-drop", {
        requestId,
        status: newStatus,
        adminNote: adminNote || undefined
      });
      
      if (response.data.success) {
        fetchRequests();
        setSelectedRequest(null);
        setAdminNote("");
      }
    } catch (error) {
      console.error("Failed to update status", error);
      alert("Failed to update request status");
    } finally {
      setUpdating(null);
    }
  };

  const deleteRequest = async (requestId: string) => {
    if (!confirm("Delete this request?")) return;
    
    try {
      await axios.delete(`/api/request-drop?requestId=${requestId}`);
      fetchRequests();
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete request");
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-yellow-500/20 text-yellow-400"><Clock size={12} /> Pending</span>;
      case "approved":
        return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400"><CheckCircle size={12} /> Approved</span>;
      case "rejected":
        return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-500/20 text-red-400"><XCircle size={12} /> Rejected</span>;
      case "completed":
        return <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-400"><Music size={12} /> Completed</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-500/20 text-gray-400">{status}</span>;
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Drop Requests</h1>
        <p className="text-sm text-gray-400">
          Manage user requests for audio drops
        </p>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Requests</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Pending</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Approved</p>
          <p className="text-2xl font-bold text-blue-400">{stats.approved}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Rejected</p>
          <p className="text-2xl font-bold text-red-400">{stats.rejected}</p>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
          <p className="text-sm text-gray-400">Completed</p>
          <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "all" 
              ? "bg-pink-600 text-white" 
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          All ({stats.total})
        </button>
        <button
          onClick={() => setFilter("pending")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "pending" 
              ? "bg-pink-600 text-white" 
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          Pending ({stats.pending})
        </button>
        <button
          onClick={() => setFilter("approved")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "approved" 
              ? "bg-pink-600 text-white" 
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          Approved ({stats.approved})
        </button>
        <button
          onClick={() => setFilter("rejected")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "rejected" 
              ? "bg-pink-600 text-white" 
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          Rejected ({stats.rejected})
        </button>
        <button
          onClick={() => setFilter("completed")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            filter === "completed" 
              ? "bg-pink-600 text-white" 
              : "bg-[#161b22] text-gray-400 hover:bg-[#1c2330]"
          }`}
        >
          Completed ({stats.completed})
        </button>
      </div>

      {/* REQUESTS TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">User Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Message</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Audio Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto"></div>
                    <p className="mt-2">Loading requests...</p>
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No {filter !== "all" ? filter : ""} requests found
                  </td>
                </tr>
              ) : (
                requests.map((request, index) => (
                  <tr key={request.id} className="border-b border-[#21262d] hover:bg-[#0d1117] transition">
                    <td className="px-4 py-3">{index + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-pink-500/20 flex items-center justify-center">
                          <span className="text-pink-400 text-xs font-bold">
                            {request.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-white">{request.userName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[300px]">
                        <p className="text-sm text-gray-300 line-clamp-2" title={request.message}>
                          {request.message}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-400">{request.audioTitle || "Not specified"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-gray-400">{formatDate(request.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(request.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="p-2 rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => deleteRequest(request.id)}
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

      {/* REQUEST DETAILS MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedRequest(null)}>
          <div className="bg-[#161b22] rounded-xl max-w-2xl w-full p-6 border border-[#21262d]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-semibold">Request Details</h3>
              <button onClick={() => setSelectedRequest(null)} className="text-gray-400 hover:text-white transition">
                <XCircle size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 uppercase flex items-center gap-1"><User size={12} /> User</p>
                <p className="text-white font-medium">{selectedRequest.userName}</p>
                {selectedRequest.userId && <p className="text-xs text-gray-500">ID: {selectedRequest.userId}</p>}
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase flex items-center gap-1"><MessageSquare size={12} /> Message</p>
                <p className="text-gray-300 bg-[#0d1117] p-3 rounded-lg">{selectedRequest.message}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Audio Title (Optional)</p>
                <p className="text-gray-300">{selectedRequest.audioTitle || "Not specified"}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Submitted At</p>
                <p className="text-gray-300">{formatDate(selectedRequest.createdAt)}</p>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Current Status</p>
                <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
              </div>

              <div>
                <p className="text-xs text-gray-400 uppercase">Admin Note (Optional)</p>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add a note about this request..."
                  className="w-full bg-[#0d1117] text-white text-sm rounded-lg px-3 py-2 border border-[#21262d] focus:outline-none focus:border-pink-500 resize-none"
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                {selectedRequest.status === "pending" && (
                  <>
                    <button
                      onClick={() => updateStatus(selectedRequest.id, "approved")}
                      disabled={updating === selectedRequest.id}
                      className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => updateStatus(selectedRequest.id, "rejected")}
                      disabled={updating === selectedRequest.id}
                      className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {selectedRequest.status === "approved" && (
                  <button
                    onClick={() => updateStatus(selectedRequest.id, "completed")}
                    disabled={updating === selectedRequest.id}
                    className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-50"
                  >
                    Mark as Completed
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}