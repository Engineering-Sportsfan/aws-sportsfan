"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { 
  Calendar, 
  Plus, 
  Pencil, 
  Trash2, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Loader2, 
  Search,
  CheckCircle2,
  AlertCircle,
  Radio,
  Clock,
  MapPin
} from "lucide-react";

interface AgendaEventItem {
  id: string;
  type: string;
  order: number;
  time: string;
  sport: string;
  subEvent: string;
  detail: string;
  statusType: "completed" | "live" | "up_next" | "scheduled" | string;
  statusLabel: string;
  icon: string;
  nodeColor: "gray" | "emerald" | "amber" | "blue" | string;
  venue?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export default function TodaysAgendaListPage() {
  const [events, setEvents] = useState<AgendaEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/welcomemessage?type=todays_agenda&includeInactive=true");
      if (res.data.success && res.data.items) {
        setEvents(res.data.items);
      }
    } catch (err) {
      console.error("Failed to load Agenda events", err);
      setAlertMsg({ type: "error", text: "Failed to load events from DynamoDB" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleToggleActive = async (event: AgendaEventItem) => {
    const nextActive = event.active === false ? true : false;
    setTogglingId(event.id);
    try {
      await axios.put("/api/welcomemessage", {
        id: event.id,
        active: nextActive,
      });
      setEvents((prev) =>
        prev.map((item) => (item.id === event.id ? { ...item, active: nextActive } : item))
      );
      setAlertMsg({
        type: "success",
        text: `Event (${event.sport}) is now ${nextActive ? "Active" : "Hidden"}`,
      });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err) {
      console.error("Failed to toggle status", err);
      alert("Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (event: AgendaEventItem) => {
    const confirmed = window.confirm(`Delete Agenda event for ${event.sport} (${event.time})?`);
    if (!confirmed) return;

    setDeletingId(event.id);
    try {
      await axios.delete(`/api/welcomemessage?id=${event.id}`);
      setEvents((prev) => prev.filter((item) => item.id !== event.id));
      setAlertMsg({ type: "success", text: "Agenda event deleted from DynamoDB" });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err) {
      console.error("Failed to delete event", err);
      alert("Failed to delete event");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredEvents = events.filter((event) => {
    const matchesQuery =
      !searchQuery ||
      event.sport?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.subEvent?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.detail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.venue?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.time?.toLowerCase().includes(searchQuery.toLowerCase());

    const rawStatus = (event.statusType || "").toLowerCase();
    const normalizedStatus =
      rawStatus === "afternoon" || rawStatus === "evening" ? "scheduled" : rawStatus || "live";

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "completed" && normalizedStatus === "completed") ||
      (statusFilter === "live" && normalizedStatus === "live") ||
      (statusFilter === "up_next" && normalizedStatus === "up_next") ||
      (statusFilter === "scheduled" && normalizedStatus === "scheduled");

    return matchesQuery && matchesStatus;
  });

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/homecardmanagement"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📅</span>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Today&apos;s Agenda Events
              </h1>
            </div>
            <p className="text-xs text-gray-400">
              Manage the timeline matches and events displayed in &quot;Today&apos;s Agenda&quot; sheet
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/homecardmanagement/TodaysAgenda/add">
            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md">
              <Plus size={16} />
              <span>Add Agenda Event</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Alert Notification */}
      {alertMsg && (
        <div
          className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-all ${
            alertMsg.type === "success"
              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/30"
              : "bg-rose-950/80 text-rose-400 border border-rose-500/30"
          }`}
        >
          {alertMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sport, time, opponent, venue..."
              className="w-full bg-[#090C15] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            {["all", "completed", "live", "up_next", "scheduled"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                  statusFilter === st
                    ? "bg-purple-600 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 self-end sm:self-auto">
          <span>
            Total Events: <strong className="text-white">{events.length}</strong>
          </span>
          <span>•</span>
          <span className="text-emerald-400 font-semibold">
            Live: <strong>{events.filter((e) => e.statusType === "live").length}</strong>
          </span>
          <span>•</span>
          <span className="text-gray-400 font-semibold">
            Completed: <strong>{events.filter((e) => e.statusType === "completed").length}</strong>
          </span>
        </div>
      </div>

      {/* Events Table / Timeline List */}
      <div className="rounded-2xl bg-[#111625] border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin text-purple-500" />
            <p className="text-xs">Loading Agenda events from DynamoDB...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-3">
            <p className="text-sm">No Agenda events found matching your filter.</p>
            <Link href="/admin/homecardmanagement/TodaysAgenda/add">
              <button className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-black">
                Create New Agenda Event
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-gray-400 uppercase tracking-wider font-extrabold border-b border-white/10">
                <tr>
                  <th className="p-4 w-28">Time</th>
                  <th className="p-4 w-32">Sport</th>
                  <th className="p-4">Event Details & Matchup</th>
                  <th className="p-4 w-32 text-center">Badge</th>
                  <th className="p-4 w-28 text-center">Status</th>
                  <th className="p-4 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredEvents.map((evt, idx) => {
                  let badgeClass = "bg-[#0b1c33] text-[#60A5FA] border border-[#1E40AF]/60";
                  if (evt.statusType === "completed") {
                    badgeClass = "bg-[#1e293b] text-[#94a3b8] border border-[#475569]/50";
                  } else if (evt.statusType === "live") {
                    badgeClass = "bg-[#04281E] text-[#10B981] border border-[#10B981]/50";
                  } else if (evt.statusType === "up_next") {
                    badgeClass = "bg-[#2E1F06] text-[#FBBF24] border border-[#D97706]/60";
                  }

                  return (
                    <tr
                      key={evt.id || idx}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      {/* Time */}
                      <td className="p-4 font-bold text-gray-300">
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} className="text-gray-400" />
                          <span>{evt.time}</span>
                        </div>
                      </td>

                      {/* Sport & Icon */}
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xl shrink-0">{evt.icon || "🏆"}</span>
                          <span className="font-extrabold text-white truncate">
                            {evt.sport}
                          </span>
                        </div>
                      </td>

                      {/* Sub-Event & Match details */}
                      <td className="p-4 min-w-[240px]">
                        <div className="space-y-0.5">
                          <p className="font-bold text-gray-200 text-xs">
                            {evt.subEvent}
                          </p>
                          <p className="text-gray-400 text-[11px]">
                            {evt.detail}
                          </p>
                          {evt.venue && (
                            <p className="text-gray-500 text-[10px] flex items-center gap-1 pt-0.5">
                              <MapPin size={10} className="text-gray-400" />
                              <span className="truncate">{evt.venue}</span>
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${badgeClass}`}
                        >
                          {evt.statusType === "live" && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          )}
                          {evt.statusLabel ||
                            (evt.statusType === "completed"
                              ? "COMPLETED"
                              : evt.statusType === "live"
                              ? "LIVE"
                              : evt.statusType === "up_next"
                              ? "UP NEXT"
                              : "SCHEDULED")}
                        </span>
                      </td>

                      {/* Active Status */}
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(evt)}
                          disabled={togglingId === evt.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer ${
                            evt.active !== false
                              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-900/60"
                              : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"
                          }`}
                        >
                          {togglingId === evt.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : evt.active !== false ? (
                            <>
                              <Eye size={12} />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <EyeOff size={12} />
                              <span>Hidden</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/homecardmanagement/TodaysAgenda/add?editId=${evt.id}`}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition-colors"
                            title="Edit Event"
                          >
                            <Pencil size={14} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(evt)}
                            disabled={deletingId === evt.id}
                            className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                            title="Delete Event"
                          >
                            {deletingId === evt.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
