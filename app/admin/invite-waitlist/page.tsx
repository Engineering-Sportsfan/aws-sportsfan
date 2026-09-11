"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import {
  Search,
  Download,
  RefreshCw,
  Trash2,
  Eye,
  Users,
  Calendar,
  MapPin,
  Mail,
  Phone,
  Clock,
  Sparkles,
  Filter,
  FileSpreadsheet,
  CheckCircle2,
  X,
  ExternalLink,
  Copy,
  ShieldCheck,
  Check,
  ArrowUpDown,
  Smartphone,
  UserCheck,
  UserX,
  XCircle,
  Send,
} from "lucide-react";

export interface WaitlistRecord {
  id: string;
  name: string;
  fullName?: string;
  email: string;
  phoneNumber?: string;
  phone?: string;
  location: string;
  institution?: string;
  university?: string;
  referBy?: string;
  referredBy?: string;
  timestamp: string;
  createdAt: number;
  eventName?: string;
  status?: string;
  userAgent?: string;
  [key: string]: any;
}

function formatDisplayDate(timestampOrMs?: number | string): string {
  if (!timestampOrMs) return "–";
  try {
    const d =
      typeof timestampOrMs === "number"
        ? new Date(timestampOrMs)
        : isNaN(Number(timestampOrMs))
        ? new Date(timestampOrMs)
        : new Date(Number(timestampOrMs));

    if (isNaN(d.getTime())) return String(timestampOrMs);

    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(d);
  } catch {
    return String(timestampOrMs);
  }
}

function formatRelativeTime(timestampOrMs?: number | string): string {
  if (!timestampOrMs) return "";
  try {
    const ts =
      typeof timestampOrMs === "number"
        ? timestampOrMs
        : isNaN(Number(timestampOrMs))
        ? Date.parse(timestampOrMs)
        : Number(timestampOrMs);

    if (isNaN(ts) || ts <= 0) return "";
    const diffMs = Date.now() - ts;
    if (diffMs < 0) return "Just now";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return "";
  } catch {
    return "";
  }
}

function InviteWaitlistContent() {
  const [records, setRecords] = useState<WaitlistRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");

  // Selection for batch or single actions
  const [selectedRecord, setSelectedRecord] = useState<WaitlistRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<WaitlistRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Status Filter ("all" | "waitlisted" | "accepted" | "rejected")
  const [selectedStatus, setSelectedStatus] = useState<"all" | "waitlisted" | "accepted" | "rejected">("all");

  // Action processing state
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState<"accept" | "reject" | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Accept / Reject handler with automatic email dispatch
  const handleStatusAction = async (record: WaitlistRecord, action: "accept" | "reject") => {
    try {
      setProcessingId(record.id);
      setProcessingAction(action);
      const res = await axios.patch("/api/invite-waitlist", {
        id: record.id,
        action,
      });

      if (res.data.success) {
        // Update local state immediately
        setRecords((prev) =>
          prev.map((r) =>
            r.id === record.id
              ? { ...r, status: res.data.status, emailSent: res.data.emailSent ?? r.emailSent }
              : r
          )
        );

        if (selectedRecord && selectedRecord.id === record.id) {
          setSelectedRecord((prev) =>
            prev ? { ...prev, status: res.data.status, emailSent: res.data.emailSent ?? prev.emailSent } : null
          );
        }

        setStatusFeedback({
          type: "success",
          message:
            res.data.message ||
            (action === "accept"
              ? `Accepted ${record.fullName || record.name} and sent Flip LIVE invite email!`
              : `Waitlist request for ${record.fullName || record.name} rejected.`),
        });
        setTimeout(() => setStatusFeedback(null), 5000);
      } else {
        setStatusFeedback({
          type: "error",
          message: res.data.error || "Action failed",
        });
        setTimeout(() => setStatusFeedback(null), 5000);
      }
    } catch (err: any) {
      console.error("Status action failed:", err);
      setStatusFeedback({
        type: "error",
        message: err.response?.data?.error || err.message || "Failed to update waitlist status",
      });
      setTimeout(() => setStatusFeedback(null), 5000);
    } finally {
      setProcessingId(null);
      setProcessingAction(null);
    }
  };

  useEffect(() => {
    fetchWaitlist();
  }, []);

  const fetchWaitlist = async () => {
    try {
      setRefreshing(true);
      const res = await axios.get("/api/invite-waitlist?limit=1000");
      if (res.data.success) {
        setRecords(res.data.users || []);
      }
    } catch (err) {
      console.error("Failed to load invite waitlist:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Distinct locations for filter dropdown
  const uniqueLocations = useMemo(() => {
    const locSet = new Set<string>();
    records.forEach((r) => {
      const loc = (r.location || "").trim();
      if (loc) locSet.add(loc);
    });
    return Array.from(locSet).sort();
  }, [records]);

  // Client-side filtering & sorting
  const filteredRecords = useMemo(() => {
    let list = [...records];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const name = (r.fullName || r.name || "").toLowerCase();
        const email = (r.email || "").toLowerCase();
        const phone = (r.phoneNumber || r.phone || "").toLowerCase();
        const loc = (r.location || "").toLowerCase();
        const inst = (r.institution || r.university || "").toLowerCase();
        const ref = (r.referBy || r.referredBy || "").toLowerCase();
        const event = (r.eventName || "").toLowerCase();
        const id = (r.id || "").toLowerCase();
        return (
          name.includes(q) ||
          email.includes(q) ||
          phone.includes(q) ||
          loc.includes(q) ||
          inst.includes(q) ||
          ref.includes(q) ||
          event.includes(q) ||
          id.includes(q)
        );
      });
    }

    // Location filter
    if (selectedLocation !== "all") {
      list = list.filter(
        (r) => (r.location || "").trim().toLowerCase() === selectedLocation.toLowerCase()
      );
    }

    // Status filter
    if (selectedStatus !== "all") {
      list = list.filter((r) => {
        const st = (r.status || "waitlisted").toLowerCase();
        return st === selectedStatus;
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "name") {
        const nameA = (a.fullName || a.name || "").toLowerCase();
        const nameB = (b.fullName || b.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      }
      const timeA = Number(a.createdAt) || (a.timestamp ? Date.parse(a.timestamp) : 0);
      const timeB = Number(b.createdAt) || (b.timestamp ? Date.parse(b.timestamp) : 0);
      return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [records, searchQuery, selectedLocation, sortBy]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = records.length;
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    let todaySignups = 0;
    let acceptedCount = 0;
    let waitlistedCount = 0;
    let rejectedCount = 0;

    records.forEach((r) => {
      const time = Number(r.createdAt) || (r.timestamp ? Date.parse(r.timestamp) : 0);
      if (now - time <= oneDayMs) {
        todaySignups++;
      }
      const st = (r.status || "waitlisted").toLowerCase();
      if (st === "accepted") acceptedCount++;
      else if (st === "rejected") rejectedCount++;
      else waitlistedCount++;
    });

    return {
      total,
      todaySignups,
      acceptedCount,
      waitlistedCount,
      rejectedCount,
      uniqueLocationsCount: uniqueLocations.length,
    };
  }, [records, uniqueLocations]);

  // ── Excel Export Handler ──────────────────────────────────────────────────
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      alert("No waitlist records available to export.");
      return;
    }

    try {
      // Map data into structured rows for Excel
      const excelRows = filteredRecords.map((r, index) => {
        const phone = r.phone || r.phoneNumber || "–";
        const email = r.email || "–";
        const name = r.fullName || r.name || "–";
        const location = r.location || "–";
        const institution = r.institution || r.university || "–";
        const referBy = r.referBy || r.referredBy || "–";
        const event = r.eventName || "SportsFan360 Event";
        const status = (r.status || "waitlisted").toUpperCase();
        const displayDate = formatDisplayDate(r.createdAt || r.timestamp);
        const isoTimestamp =
          r.timestamp || (r.createdAt ? new Date(r.createdAt).toISOString() : "–");
        const userAgent = r.userAgent || "–";
        const id = r.id || "–";

        return {
          "S.No": index + 1,
          "Full Name": name,
          "Email Address": email,
          "Phone Number": phone,
          "Location / City": location,
          "Institution / University": institution,
          "Refer By": referBy,
          "Event": event,
          "Status": status,
          "Registration Date (IST)": displayDate,
          "Timestamp": isoTimestamp,
          "User Agent / Device": userAgent,
          "Waitlist Record ID": id,
        };
      });

      // 1. Create worksheet from JSON
      const worksheet = XLSX.utils.json_to_sheet(excelRows);

      // 2. Set auto-column widths for nice spreadsheet formatting
      worksheet["!cols"] = [
        { wch: 6 }, // S.No
        { wch: 25 }, // Full Name
        { wch: 32 }, // Email Address
        { wch: 18 }, // Phone Number
        { wch: 20 }, // Location
        { wch: 26 }, // Institution / University
        { wch: 20 }, // Refer By
        { wch: 22 }, // Event
        { wch: 14 }, // Status
        { wch: 25 }, // Registration Date (IST)
        { wch: 28 }, // Timestamp
        { wch: 36 }, // User Agent
        { wch: 38 }, // Record ID
      ];

      // 3. Create workbook and append sheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Waitlist RSVP");

      // 4. Generate dynamic file name with current date
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `SportsFan360_Invite_Waitlist_${dateStr}.xlsx`;

      // 5. Download file
      XLSX.writeFile(workbook, fileName);

      // 6. Flash success message
      setExportNotice(`Exported ${filteredRecords.length} records to ${fileName}!`);
      setTimeout(() => setExportNotice(null), 4000);
    } catch (err) {
      console.error("Failed to export Excel sheet:", err);
      alert("An error occurred while generating the Excel spreadsheet.");
    }
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Delete handler
  const handleConfirmDelete = async () => {
    if (!deleteRecord) return;
    try {
      setActionLoading(true);
      const res = await axios.delete(`/api/invite-waitlist?id=${encodeURIComponent(deleteRecord.id)}`);
      if (res.data.success) {
        setDeleteRecord(null);
        await fetchWaitlist();
      } else {
        alert(res.data.error || "Failed to delete record");
      }
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert(err.response?.data?.error || "Failed to delete record");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 p-6 lg:p-8">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#21262d]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl">📨</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Invite Waitlist & RSVP Hub
            </h1>
            <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-mono">
              api/invite-waitlist
            </span>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono">
              DynamoDB + Firestore
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Real-time attendee submissions collected from the RSVP waitlist registration form on SportsFan360.
          </p>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Excel Export Button */}
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950/40 border border-emerald-400/30 transition-all cursor-pointer"
            title="Download formatted Excel spreadsheet of all visible waitlist submissions"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Generate Excel Sheet (.xlsx)</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={fetchWaitlist}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#161b22] hover:bg-[#1f242c] border border-[#30363d] rounded-lg text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-blue-400" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Export Success Notification ────────────────────────────────────── */}
      {exportNotice && (
        <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs text-emerald-300 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{exportNotice}</span>
          </div>
          <button onClick={() => setExportNotice(null)} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Status Feedback Alert ─────────────────────────────────────────── */}
      {statusFeedback && (
        <div
          className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
            statusFeedback.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusFeedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-semibold">{statusFeedback.message}</span>
          </div>
          <button
            onClick={() => setStatusFeedback(null)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Metrics Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        {/* Total Submissions */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-gray-600 transition-colors">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Total RSVPs</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.total}</div>
          <div className="text-[11px] text-gray-500 mt-1">Live submissions stored in AWS DynamoDB</div>
        </div>

        {/* Accepted Count */}
        <div
          onClick={() => setSelectedStatus("accepted")}
          className="bg-[#161b22] border border-emerald-500/30 hover:border-emerald-400 rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
            <span>Accepted & Invited</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.acceptedCount}</div>
          <div className="text-[11px] text-emerald-400/70 mt-1">Flip LIVE invitation emails sent</div>
        </div>

        {/* Pending / Waitlisted */}
        <div
          onClick={() => setSelectedStatus("waitlisted")}
          className="bg-[#161b22] border border-purple-500/30 hover:border-purple-400 rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-purple-400 font-semibold">
            <span>Awaiting Review</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.waitlistedCount}</div>
          <div className="text-[11px] text-purple-300/70 mt-1">Pending approval on waitlist</div>
        </div>

        {/* Excel Export Quick Card */}
        <div
          onClick={handleExportExcel}
          className="bg-gradient-to-br from-[#161b22] to-emerald-950/20 border border-emerald-500/30 hover:border-emerald-400 rounded-xl p-4 flex flex-col justify-between cursor-pointer transition-all hover:shadow-lg hover:shadow-emerald-950/30"
        >
          <div className="flex items-center justify-between text-xs text-emerald-300 font-semibold">
            <span>Excel Export Ready</span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-base font-bold text-white mt-2 flex items-center gap-1.5">
            <span>Download All Data</span>
            <Download className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            Click here to export {filteredRecords.length} filtered rows
          </div>
        </div>
      </div>

      {/* ── Filters & Search Control Bar ─────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by full name, email, phone number, location, or record ID..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-8 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Statuses ({records.length})</option>
              <option value="waitlisted">Waitlisted ({metrics.waitlistedCount})</option>
              <option value="accepted">Accepted ({metrics.acceptedCount})</option>
              <option value="rejected">Rejected ({metrics.rejectedCount})</option>
            </select>
          </div>

          {/* Location Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Locations ({uniqueLocations.length})</option>
              {uniqueLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Order Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(searchQuery || selectedLocation !== "all" || selectedStatus !== "all") && (
          <div className="flex items-center gap-2 pt-2 border-t border-[#21262d] text-xs text-gray-400">
            <span>Filtering by:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[11px]">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery("")} className="hover:text-white">
                  ×
                </button>
              </span>
            )}
            {selectedStatus !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px]">
                Status: {selectedStatus.toUpperCase()}
                <button onClick={() => setSelectedStatus("all")} className="hover:text-white">
                  ×
                </button>
              </span>
            )}
            {selectedLocation !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px]">
                Location: {selectedLocation}
                <button onClick={() => setSelectedLocation("all")} className="hover:text-white">
                  ×
                </button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedLocation("all");
                setSelectedStatus("all");
              }}
              className="text-xs text-gray-500 hover:text-gray-300 ml-auto underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* ── Main Data Table ─────────────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0d1117] border-b border-[#21262d] uppercase tracking-wider text-[11px] text-gray-400 font-semibold select-none">
              <tr>
                <th className="w-12 px-4 py-3.5 text-center">#</th>
                <th className="px-4 py-3.5">User</th>
                <th className="px-4 py-3.5">Contact Details</th>
                <th className="px-4 py-3.5">Location</th>
                <th className="px-4 py-3.5">Registered Time (IST)</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#21262d]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Loading invite waitlist submissions from DynamoDB & Firestore...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    No waitlist submissions found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item, index) => {
                  const name = item.fullName || item.name || "Anonymous";
                  const email = item.email || "–";
                  const phone = item.phone || item.phoneNumber || "–";
                  const initial = name.charAt(0).toUpperCase();
                  const relative = formatRelativeTime(item.createdAt || item.timestamp);
                  const displayDate = formatDisplayDate(item.createdAt || item.timestamp);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[#1c2128] transition-colors"
                    >
                      {/* S.No */}
                      <td className="px-4 py-3.5 text-center text-gray-500 font-mono">
                        {index + 1}
                      </td>

                      {/* User Info */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-700 to-indigo-800 border border-purple-500/30 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white text-sm truncate flex items-center gap-1.5">
                              <span>{name}</span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1.5 mt-0.5">
                              <span title={`ID: ${item.id}`}>ID: {item.id.slice(0, 8)}...</span>
                              <button
                                onClick={() => handleCopy(item.id, `id_${item.id}`)}
                                className="text-gray-500 hover:text-gray-300"
                                title="Copy full ID"
                              >
                                {copiedId === `id_${item.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Info (Email & Phone) */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-gray-200">
                            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <a
                              href={`mailto:${email}`}
                              className="text-blue-400 hover:text-blue-300 hover:underline truncate"
                              title={email}
                            >
                              {email}
                            </a>
                            <button
                              onClick={() => handleCopy(email, `email_${item.id}`)}
                              className="text-gray-500 hover:text-gray-300"
                              title="Copy Email"
                            >
                              {copiedId === `email_${item.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                            <Phone className="w-3 h-3 text-gray-500 shrink-0" />
                            <a
                              href={`tel:${phone}`}
                              className="hover:text-gray-200 font-mono"
                              title={phone}
                            >
                              {phone}
                            </a>
                          </div>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-gray-300 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>{item.location || "–"}</span>
                        </div>
                        {item.eventName && (
                          <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                            {item.eventName}
                          </div>
                        )}
                      </td>

                      {/* Registered Time */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-gray-300">
                          <Calendar className="w-3 h-3 text-gray-400" />
                          <span>{displayDate}</span>
                        </div>
                        {relative && (
                          <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                            {relative}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {item.status?.toLowerCase() === "accepted" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ACCEPTED
                          </span>
                        ) : item.status?.toLowerCase() === "rejected" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <XCircle className="w-3 h-3 text-rose-400" />
                            REJECTED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            <Clock className="w-3 h-3 text-purple-400" />
                            WAITLISTED
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Accept Button */}
                          {item.status?.toLowerCase() === "accepted" ? (
                            <button
                              onClick={() => handleStatusAction(item, "accept")}
                              disabled={processingId === item.id}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                              title="User is already accepted. Click to re-send Flip LIVE invitation email."
                            >
                              {processingId === item.id && processingAction === "accept" ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                              ) : (
                                <Check className="w-3 h-3 text-emerald-400" />
                              )}
                              <span>Accepted</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusAction(item, "accept")}
                              disabled={processingId === item.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-semibold rounded-lg text-xs shadow-sm shadow-emerald-950/40 border border-emerald-400/30 transition cursor-pointer disabled:opacity-50"
                              title="Accept user and send Flip LIVE invitation email"
                            >
                              {processingId === item.id && processingAction === "accept" ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                              <span>Accept</span>
                            </button>
                          )}

                          {/* Reject Button */}
                          {item.status?.toLowerCase() === "rejected" ? (
                            <span className="text-[11px] text-rose-400/70 font-semibold px-2 py-1">
                              Rejected
                            </span>
                          ) : (
                            <button
                              onClick={() => handleStatusAction(item, "reject")}
                              disabled={processingId === item.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                              title="Reject user"
                            >
                              {processingId === item.id && processingAction === "reject" ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <UserX className="w-3.5 h-3.5" />
                              )}
                              <span>Reject</span>
                            </button>
                          )}

                          {/* View details */}
                          <button
                            onClick={() => setSelectedRecord(item)}
                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors cursor-pointer"
                            title="View Full Submission Data"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeleteRecord(item)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="bg-[#0d1117] border-t border-[#21262d] px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
          <span>
            Showing <strong className="text-white">{filteredRecords.length}</strong> of{" "}
            <strong className="text-white">{records.length}</strong> total submissions
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL: View Full Record Details ────────────────────────────────── */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm">
                  {(selectedRecord.fullName || selectedRecord.name || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedRecord.fullName || selectedRecord.name}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">ID: {selectedRecord.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-400 block mb-1">Email Address:</span>
                  <a
                    href={`mailto:${selectedRecord.email}`}
                    className="text-blue-400 hover:underline font-mono"
                  >
                    {selectedRecord.email}
                  </a>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-400 block mb-1">Phone Number:</span>
                  <span className="text-white font-mono">
                    {selectedRecord.phone || selectedRecord.phoneNumber || "–"}
                  </span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-400 block mb-1">City / Location:</span>
                  <span className="text-white font-semibold flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" />
                    {selectedRecord.location}
                  </span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-400 block mb-1">Status:</span>
                  <span className="text-emerald-400 font-bold uppercase">
                    {selectedRecord.status || "Waitlisted"}
                  </span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-400 block mb-1">Institution / University:</span>
                  <span className="text-white">
                    {selectedRecord.institution || selectedRecord.university || "–"}
                  </span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-400 block mb-1">Refer By:</span>
                  <span className="text-white">
                    {selectedRecord.referBy || selectedRecord.referredBy || "–"}
                  </span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d] col-span-2">
                  <span className="text-gray-400 block mb-1">Registration Date & Time (IST):</span>
                  <span className="text-white font-mono">
                    {formatDisplayDate(selectedRecord.createdAt || selectedRecord.timestamp)}
                  </span>
                </div>
                {selectedRecord.userAgent && (
                  <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d] col-span-2">
                    <span className="text-gray-400 block mb-1 flex items-center gap-1">
                      <Smartphone className="w-3 h-3" />
                      Client Device / User Agent:
                    </span>
                    <span className="text-gray-300 font-mono text-[11px] break-all">
                      {selectedRecord.userAgent}
                    </span>
                  </div>
                )}
              </div>

              {/* Raw JSON Dump */}
              <div>
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Raw Storage JSON Payload
                </h5>
                <pre className="p-3 rounded-lg bg-[#0d1117] border border-[#21262d] text-[11px] font-mono text-gray-300 overflow-x-auto max-h-48">
                  {JSON.stringify(selectedRecord, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-[#21262d] bg-[#0d1117]">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* Accept Button inside modal */}
                {selectedRecord.status?.toLowerCase() !== "accepted" ? (
                  <button
                    onClick={() => handleStatusAction(selectedRecord, "accept")}
                    disabled={processingId === selectedRecord.id}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {processingId === selectedRecord.id && processingAction === "accept" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Accept &amp; Send Invite</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusAction(selectedRecord, "accept")}
                    disabled={processingId === selectedRecord.id}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {processingId === selectedRecord.id && processingAction === "accept" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Resend Flip LIVE Invite</span>
                  </button>
                )}

                {/* Reject Button inside modal */}
                {selectedRecord.status?.toLowerCase() !== "rejected" && (
                  <button
                    onClick={() => handleStatusAction(selectedRecord, "reject")}
                    disabled={processingId === selectedRecord.id}
                    className="flex items-center gap-1 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {processingId === selectedRecord.id && processingAction === "reject" ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserX className="w-3.5 h-3.5" />
                    )}
                    <span>Reject</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => {
                    const jsonStr = JSON.stringify(selectedRecord, null, 2);
                    navigator.clipboard.writeText(jsonStr);
                    alert("Copied record JSON to clipboard!");
                  }}
                  className="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs transition-colors flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </button>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Confirm Delete ─────────────────────────────────────────── */}
      {deleteRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="p-2 rounded-full bg-red-500/10 border border-red-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Waitlist Record</h3>
                <p className="text-xs text-gray-400">Irreversible dual-store deletion</p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              Are you sure you want to permanently delete the waitlist registration for{" "}
              <strong className="text-white">
                {deleteRecord.fullName || deleteRecord.name}
              </strong>{" "}
              ({deleteRecord.email})?
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteRecord(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InviteWaitlistPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-gray-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            <span>Loading Invite Waitlist Hub...</span>
          </div>
        </div>
      }
    >
      <InviteWaitlistContent />
    </Suspense>
  );
}
