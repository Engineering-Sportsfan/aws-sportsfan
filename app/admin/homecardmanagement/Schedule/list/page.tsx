"use client";

import { useEffect, useState, useMemo } from "react";
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
  MapPin,
  Sparkles,
  Zap,
  Check,
  RotateCcw
} from "lucide-react";

interface AgendaEventItem {
  id: string;
  type: string;
  order: number;
  time: string;
  sport: string;
  subEvent: string;
  detail: string;
  statusType: "auto" | "completed" | "live" | "up_next" | "scheduled" | string;
  statusMode?: "auto" | "manual";
  isManual?: boolean;
  statusLabel: string;
  icon: string;
  nodeColor: "gray" | "emerald" | "amber" | "blue" | string;
  venue?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  // Optional Dynamic Action CTAs
  predictId?: string;
  predictTitle?: string;
  predictUrl?: string;
  discussPostId?: string;
  discussTitle?: string;
  discussUrl?: string;
  debateRoomId?: string;
  debateTitle?: string;
  debateUrl?: string;
}

function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return -1;
  const clean = timeStr.trim().toUpperCase();

  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!ampmMatch) {
    const looseMatch = clean.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/);
    if (looseMatch) {
      let hours = parseInt(looseMatch[1], 10);
      const minutes = looseMatch[2] ? parseInt(looseMatch[2], 10) : 0;
      const period = looseMatch[3];
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    return -1;
  }

  let hours = parseInt(ampmMatch[1], 10);
  const minutes = parseInt(ampmMatch[2], 10);
  const period = ampmMatch[3];

  if (period === "PM" && hours < 12) {
    hours += 12;
  } else if (period === "AM" && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
}

function resolveDynamicAgendaEvents(events: AgendaEventItem[], now = new Date()): AgendaEventItem[] {
  if (!events || events.length === 0) return [];

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const parsedEvents = events.map((evt, idx) => {
    const rawStatus = (evt.statusType || "").toLowerCase().trim();
    const rawLabel = (evt.statusLabel || "").toUpperCase().trim();
    const isAutoMode = rawStatus === "auto" || evt.statusMode === "auto" || rawLabel === "AUTO";
    const isExplicitCompleted = rawStatus === "completed" || rawLabel === "COMPLETED";
    const isExplicitLive = rawStatus === "live" || rawLabel === "LIVE";
    const isExplicitUpNext = rawStatus === "up_next" || rawLabel === "UP NEXT";
    const isExplicitScheduled = rawStatus === "scheduled" || rawLabel === "SCHEDULED";
    const isManual = evt.isManual === true || evt.statusMode === "manual" || (!isAutoMode && (isExplicitCompleted || isExplicitLive || isExplicitUpNext));

    return {
      evt,
      idx,
      minutes: parseTimeToMinutes(evt.time),
      order: evt.order ?? idx,
      isAutoMode,
      isExplicitCompleted,
      isExplicitLive,
      isExplicitUpNext,
      isExplicitScheduled,
      isManual,
    };
  });

  parsedEvents.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return a.order - b.order;
    }
    if (a.minutes >= 0 && b.minutes >= 0 && a.minutes !== b.minutes) {
      return a.minutes - b.minutes;
    }
    return a.idx - b.idx;
  });

  // Step 1: Check if there's an explicit manual LIVE event set by admin
  let manualLiveIndex = -1;
  for (let i = 0; i < parsedEvents.length; i++) {
    if (parsedEvents[i].isExplicitLive && parsedEvents[i].isManual) {
      manualLiveIndex = i;
      break;
    }
  }

  // Step 2: Find the latest chronological event whose scheduled start time has arrived
  let lastPastIndex = -1;
  for (let i = 0; i < parsedEvents.length; i++) {
    const item = parsedEvents[i];
    if (item.minutes >= 0 && item.minutes <= currentMinutes) {
      lastPastIndex = i;
    }
  }

  // Step 3: Determine the active live index and upcoming index
  let activeLiveIndex = -1;
  let activeUpcomingIndex = -1;

  if (manualLiveIndex !== -1) {
    activeLiveIndex = manualLiveIndex;
    activeUpcomingIndex = manualLiveIndex + 1 < parsedEvents.length ? manualLiveIndex + 1 : -1;
  } else if (lastPastIndex !== -1) {
    const latestPastItem = parsedEvents[lastPastIndex];
    if (latestPastItem.isExplicitCompleted && latestPastItem.isManual) {
      activeLiveIndex = -1;
      activeUpcomingIndex = lastPastIndex + 1 < parsedEvents.length ? lastPastIndex + 1 : -1;
    } else {
      activeLiveIndex = lastPastIndex;
      activeUpcomingIndex = lastPastIndex + 1 < parsedEvents.length ? lastPastIndex + 1 : -1;
    }
  } else {
    activeLiveIndex = -1;
    activeUpcomingIndex = parsedEvents.length > 0 ? 0 : -1;
  }

  // Step 4: Map final dynamic status
  return parsedEvents.map((item, sortedIdx) => {
    const orig = item.evt;

    if (item.isManual) {
      if (item.isExplicitCompleted) {
        return { ...orig, statusType: "completed", statusLabel: "COMPLETED", nodeColor: "gray", isManual: true };
      }
      if (item.isExplicitLive) {
        return { ...orig, statusType: "live", statusLabel: "LIVE", nodeColor: "emerald", isManual: true };
      }
      if (item.isExplicitUpNext) {
        return { ...orig, statusType: "up_next", statusLabel: "UP NEXT", nodeColor: "amber", isManual: true };
      }
      if (item.isExplicitScheduled) {
        return { ...orig, statusType: "scheduled", statusLabel: orig.time || "SCHEDULED", nodeColor: "blue", isManual: true };
      }
    }

    let computedStatusType: AgendaEventItem["statusType"] = "scheduled";
    let computedLabel = orig.time || "SCHEDULED";
    let computedNodeColor: AgendaEventItem["nodeColor"] = "blue";

    if (activeLiveIndex !== -1) {
      if (sortedIdx < activeLiveIndex) {
        computedStatusType = "completed";
        computedLabel = "COMPLETED";
        computedNodeColor = "gray";
      } else if (sortedIdx === activeLiveIndex) {
        computedStatusType = "live";
        computedLabel = "LIVE";
        computedNodeColor = "emerald";
      } else if (sortedIdx === activeUpcomingIndex) {
        computedStatusType = "up_next";
        computedLabel = "UP NEXT";
        computedNodeColor = "amber";
      } else {
        computedStatusType = "scheduled";
        computedLabel = orig.time || "SCHEDULED";
        computedNodeColor = "blue";
      }
    } else {
      if (sortedIdx === activeUpcomingIndex) {
        computedStatusType = "up_next";
        computedLabel = "UP NEXT";
        computedNodeColor = "amber";
      } else {
        computedStatusType = "scheduled";
        computedLabel = orig.time || "SCHEDULED";
        computedNodeColor = "blue";
      }
    }

    return {
      ...orig,
      statusType: computedStatusType,
      statusLabel: computedLabel,
      nodeColor: computedNodeColor,
      isManual: false,
      statusMode: item.isAutoMode ? "auto" : undefined,
    };
  });
}

export default function ScheduleListPage() {
  const [events, setEvents] = useState<AgendaEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Direct Inline Time Editing State
  const [inlineTimes, setInlineTimes] = useState<Record<string, string>>({});
  const [savingTimeId, setSavingTimeId] = useState<string | null>(null);
  const [justSavedTimeId, setJustSavedTimeId] = useState<string | null>(null);

  // Live 15s ticker for automatic clock-sync in Admin
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/welcomemessage?type=todays_agenda&includeInactive=true");
      if (res.data.success && res.data.items) {
        setEvents(res.data.items);
        // Initialize inline times map
        const initialTimes: Record<string, string> = {};
        res.data.items.forEach((item: AgendaEventItem) => {
          initialTimes[item.id] = item.time || "";
        });
        setInlineTimes(initialTimes);
      }
    } catch (err) {
      console.error("Failed to load Schedule events", err);
      setAlertMsg({ type: "error", text: "Failed to load events from DynamoDB" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // Dynamically resolve statuses matching the exact frontend engine
  const resolvedEvents = useMemo(() => {
    return resolveDynamicAgendaEvents(events, currentTime);
  }, [events, currentTime]);

  // Save Inline Time directly to DynamoDB without opening edit modal
  const handleSaveInlineTime = async (event: AgendaEventItem, customTime?: string) => {
    const newTime = (customTime !== undefined ? customTime : inlineTimes[event.id] || event.time || "").trim();
    if (!newTime || newTime === event.time) return;

    setSavingTimeId(event.id);
    try {
      await axios.put("/api/welcomemessage", {
        id: event.id,
        time: newTime,
      });

      // Optimistically update events list
      setEvents((prev) =>
        prev.map((item) => (item.id === event.id ? { ...item, time: newTime } : item))
      );
      setInlineTimes((prev) => ({ ...prev, [event.id]: newTime }));

      setJustSavedTimeId(event.id);
      setTimeout(() => setJustSavedTimeId((curr) => (curr === event.id ? null : curr)), 2500);

      setAlertMsg({
        type: "success",
        text: `Time updated to "${newTime}" for ${event.sport} (Saved to DynamoDB)`,
      });
      setTimeout(() => setAlertMsg(null), 3500);
    } catch (err) {
      console.error("Failed to update time directly", err);
      alert("Failed to update event time in DynamoDB");
    } finally {
      setSavingTimeId(null);
    }
  };

  const handleStatusChange = async (
    event: AgendaEventItem,
    nextOption: "auto" | "completed" | "live" | "up_next" | "scheduled"
  ) => {
    let payload: any = { id: event.id };

    if (nextOption === "auto") {
      payload = {
        id: event.id,
        statusType: "auto",
        statusMode: "auto",
        isManual: false,
        statusLabel: "AUTO",
      };
    } else {
      let nextLabel = "SCHEDULED";
      let nextNodeColor: AgendaEventItem["nodeColor"] = "blue";

      if (nextOption === "completed") {
        nextLabel = "COMPLETED";
        nextNodeColor = "gray";
      } else if (nextOption === "live") {
        nextLabel = "LIVE";
        nextNodeColor = "emerald";
      } else if (nextOption === "up_next") {
        nextLabel = "UP NEXT";
        nextNodeColor = "amber";
      } else {
        nextLabel = "SCHEDULED";
        nextNodeColor = "blue";
      }

      payload = {
        id: event.id,
        statusType: nextOption,
        statusMode: "manual",
        isManual: true,
        statusLabel: nextLabel,
        nodeColor: nextNodeColor,
      };
    }

    setUpdatingStatusId(event.id);
    try {
      await axios.put("/api/welcomemessage", payload);

      setEvents((prev) =>
        prev.map((item) =>
          item.id === event.id
            ? {
                ...item,
                ...payload,
              }
            : item
        )
      );

      setAlertMsg({
        type: "success",
        text: `Status for ${event.sport} updated to ${nextOption.toUpperCase()}${
          nextOption === "auto" ? " (Auto Clock Sync)" : " (Manual Lock)"
        }`,
      });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err) {
      console.error("Failed to update status", err);
      alert("Failed to update event status in DynamoDB");
    } finally {
      setUpdatingStatusId(null);
    }
  };

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
    const confirmed = window.confirm(`Delete Schedule event for ${event.sport} (${event.time})?`);
    if (!confirmed) return;

    setDeletingId(event.id);
    try {
      await axios.delete(`/api/welcomemessage?id=${event.id}`);
      setEvents((prev) => prev.filter((item) => item.id !== event.id));
      setAlertMsg({ type: "success", text: "Schedule event deleted from DynamoDB" });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err) {
      console.error("Failed to delete event", err);
      alert("Failed to delete event");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredEvents = resolvedEvents.filter((event) => {
    const currentEventTime = inlineTimes[event.id] || event.time || "";
    const matchesQuery =
      !searchQuery ||
      event.sport?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.subEvent?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.detail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.venue?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      currentEventTime.toLowerCase().includes(searchQuery.toLowerCase());

    const normalizedStatus = (event.statusType || "").toLowerCase();

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "completed" && normalizedStatus === "completed") ||
      (statusFilter === "live" && normalizedStatus === "live") ||
      (statusFilter === "up_next" && normalizedStatus === "up_next") ||
      (statusFilter === "scheduled" && (normalizedStatus === "scheduled" || normalizedStatus === "auto"));

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
            title="Back to Overview"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 p-[1.5px] shadow-lg">
              <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
                📅
              </div>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Schedule</span>
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                  Live Admin
                </span>
              </h1>
              <p className="text-xs text-gray-400">
                Manage live fixtures, edit match times directly on this list, and sync badges with DynamoDB (<code className="text-purple-400">homeDatabase</code>)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/homecardmanagement/Schedule/add">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md cursor-pointer">
              <Plus size={15} />
              <span>Add Schedule Event</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Alert Notification Toast */}
      {alertMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-bold transition-all shadow-lg ${
            alertMsg.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-300 shadow-emerald-950/30"
              : "bg-rose-950/80 border-rose-500/40 text-rose-300 shadow-rose-950/30"
          }`}
        >
          {alertMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* Quick Direct-Edit Info Banner */}
      <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/25 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-purple-200">
          <Clock size={15} className="text-purple-400 shrink-0" />
          <span>
            <strong>💡 Quick Time Editing:</strong> You can edit any match time directly in the Time column below and press <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/20 text-[10px]">Enter</kbd> or click <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/20 text-[10px]">✓</kbd> to save immediately!
          </span>
        </div>
        <span className="text-[11px] font-mono text-purple-300/80 shrink-0 hidden md:inline">
          Server Clock: {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#111625] p-3.5 rounded-2xl border border-white/10">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors cursor-pointer ${
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
            Total: <strong className="text-white">{events.length}</strong>
          </span>
          <span>•</span>
          <span className="text-emerald-400 font-semibold">
            Live: <strong>{resolvedEvents.filter((e) => e.statusType === "live").length}</strong>
          </span>
          <span>•</span>
          <span className="text-amber-400 font-semibold">
            Up Next: <strong>{resolvedEvents.filter((e) => e.statusType === "up_next").length}</strong>
          </span>
          <span>•</span>
          <span className="text-gray-400 font-semibold">
            Completed: <strong>{resolvedEvents.filter((e) => e.statusType === "completed").length}</strong>
          </span>
        </div>
      </div>

      {/* Events Table / Timeline List */}
      <div className="rounded-2xl bg-[#111625] border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin text-purple-500" />
            <p className="text-xs">Loading Schedule events from DynamoDB...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-3">
            <p className="text-sm">No Schedule events found matching your filter.</p>
            <Link href="/admin/homecardmanagement/Schedule/add">
              <button className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-black cursor-pointer">
                Create New Schedule Event
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-gray-400 uppercase tracking-wider font-extrabold border-b border-white/10">
                <tr>
                  <th className="p-4 w-48">Time (Direct Edit)</th>
                  <th className="p-4 w-36">Sport</th>
                  <th className="p-4">Event Details & Matchup</th>
                  <th className="p-4 w-44 text-center">Live Status & Mode</th>
                  <th className="p-4 w-28 text-center">Visibility</th>
                  <th className="p-4 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredEvents.map((evt, idx) => {
                  const rawItem = events.find((e) => e.id === evt.id) || evt;
                  const isAuto = rawItem.statusType === "auto" || rawItem.statusMode === "auto" || (!rawItem.isManual && rawItem.statusType !== "completed" && rawItem.statusType !== "live" && rawItem.statusType !== "up_next");

                  let badgeClass = "bg-[#0b1c33] text-[#60A5FA] border border-[#1E40AF]/60";
                  if (evt.statusType === "completed") {
                    badgeClass = "bg-[#1e293b] text-[#94a3b8] border border-[#475569]/50";
                  } else if (evt.statusType === "live") {
                    badgeClass = "bg-[#04281E] text-[#10B981] border border-[#10B981]/50";
                  } else if (evt.statusType === "up_next") {
                    badgeClass = "bg-[#2E1F06] text-[#FBBF24] border border-[#D97706]/60";
                  }

                  const selectedSelectValue = isAuto ? "auto" : rawItem.statusType || "live";
                  const currentInputValue = inlineTimes[evt.id] !== undefined ? inlineTimes[evt.id] : evt.time || "";
                  const isTimeDirty = currentInputValue.trim() !== (evt.time || "").trim();
                  const isSavingThisTime = savingTimeId === evt.id;
                  const isJustSavedThis = justSavedTimeId === evt.id;

                  return (
                    <tr
                      key={evt.id || idx}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      {/* Direct Inline Time Edit Column */}
                      <td className="p-4 font-bold text-gray-300">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                value={currentInputValue}
                                onChange={(e) =>
                                  setInlineTimes((prev) => ({
                                    ...prev,
                                    [evt.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveInlineTime(evt);
                                  } else if (e.key === "Escape") {
                                    setInlineTimes((prev) => ({
                                      ...prev,
                                      [evt.id]: evt.time || "",
                                    }));
                                  }
                                }}
                                onBlur={() => {
                                  if (isTimeDirty) {
                                    handleSaveInlineTime(evt);
                                  }
                                }}
                                placeholder="e.g. 10:30 AM"
                                title="Click to edit time directly, press Enter or blur to save"
                                className={`w-28 px-2.5 py-1 text-xs font-bold rounded-lg border focus:outline-none transition-all ${
                                  isTimeDirty
                                    ? "bg-[#1f162e] border-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.3)]"
                                    : "bg-[#090C15] border-white/10 hover:border-white/25 text-gray-200 focus:border-purple-500"
                                }`}
                              />
                            </div>

                            {/* Direct Save Button / Feedback */}
                            {isSavingThisTime ? (
                              <Loader2 size={14} className="animate-spin text-purple-400 shrink-0" />
                            ) : isJustSavedThis ? (
                              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5 shrink-0">
                                <Check size={12} />
                                <span>Saved</span>
                              </span>
                            ) : isTimeDirty ? (
                              <button
                                type="button"
                                onClick={() => handleSaveInlineTime(evt)}
                                title="Save new time"
                                className="px-2 py-1 rounded-md bg-purple-600 hover:bg-purple-500 text-white font-black text-[10px] flex items-center gap-0.5 shrink-0 cursor-pointer shadow-sm transition-transform active:scale-95"
                              >
                                <Check size={11} />
                                <span>Save</span>
                              </button>
                            ) : (
                              <Clock size={12} className="text-gray-500 shrink-0 group-hover:text-purple-400 transition-colors" />
                            )}
                          </div>
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
                        <div className="space-y-1">
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

                          {/* Configured CTAs badges */}
                          {(Boolean(evt.predictId) || Boolean(evt.discussPostId) || Boolean(evt.debateRoomId)) && (
                            <div className="flex items-center flex-wrap gap-1.5 pt-1">
                              {Boolean(evt.predictId) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30">
                                  🎯 Predict
                                </span>
                              )}
                              {Boolean(evt.discussPostId) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                  💬 Discuss
                                </span>
                              )}
                              {Boolean(evt.debateRoomId) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  🔴 Debate
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status Badge with Live Display & Instant Quick-Selector */}
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          {/* Live Status Badge (Synchronized with Frontend) */}
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${badgeClass}`}
                          >
                            {evt.statusType === "live" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                            {evt.statusType === "completed" && (
                              <span className="text-[9px]">✓</span>
                            )}
                            <span>{evt.statusLabel || evt.statusType?.toUpperCase()}</span>
                          </span>

                          {/* Quick Mode Changer Dropdown */}
                          <div className="relative inline-flex items-center">
                            {updatingStatusId === evt.id ? (
                              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] text-gray-400">
                                <Loader2 size={10} className="animate-spin text-purple-400" />
                                <span>Saving...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <select
                                  value={selectedSelectValue}
                                  onChange={(e) =>
                                    handleStatusChange(
                                      evt,
                                      e.target.value as "auto" | "completed" | "live" | "up_next" | "scheduled"
                                    )
                                  }
                                  className={`appearance-none text-[9.5px] font-bold pl-2 pr-5 py-0.5 rounded-md border cursor-pointer focus:outline-none transition-all ${
                                    isAuto
                                      ? "bg-purple-950/60 text-purple-300 border-purple-500/40 hover:bg-purple-900/60"
                                      : "bg-slate-900 text-gray-300 border-white/15 hover:border-white/30"
                                  }`}
                                  title="Change status or set to Auto Clock Sync"
                                >
                                  <option value="auto" className="bg-[#0D111C] text-purple-400 font-bold">
                                    ⚡ AUTO (Time Sync)
                                  </option>
                                  <option value="live" className="bg-[#0D111C] text-emerald-400 font-bold">
                                    🟢 LIVE (Manual)
                                  </option>
                                  <option value="completed" className="bg-[#0D111C] text-gray-400 font-bold">
                                    ✓ COMPLETED (Manual)
                                  </option>
                                  <option value="up_next" className="bg-[#0D111C] text-amber-400 font-bold">
                                    ⏳ UP NEXT (Manual)
                                  </option>
                                  <option value="scheduled" className="bg-[#0D111C] text-blue-400 font-bold">
                                    📅 SCHEDULED (Manual)
                                  </option>
                                </select>
                                <span className="pointer-events-none -ml-4 text-[7px] text-gray-400">
                                  ▼
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
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
                            href={`/admin/homecardmanagement/Schedule/add?editId=${evt.id}`}
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
