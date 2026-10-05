"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  CheckCircle2, 
  Calendar,
  Clock,
  MapPin,
  Sparkles
} from "lucide-react";

const EMOJI_SUGGESTIONS = [
  "🏸", "🎯", "🏓", "🏏", "🏊", "🤸", "🏹", "🥊", "🏃", "🏑", "⚽", "🏀", "🎾", "🏐", "🔥"
];

const SPORT_OPTIONS = [
  "Badminton",
  "Shooting",
  "Table Tennis",
  "Men's Cricket T20",
  "Women's Cricket T20 Final",
  "Swimming",
  "Gymnastics",
  "Archery",
  "Boxing",
  "Athletics",
  "Hockey",
  "Football",
  "Wrestling",
  "Other"
];

function ScheduleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form fields
  const [time, setTime] = useState("08:00 AM");
  const [sport, setSport] = useState("Badminton");
  const [icon, setIcon] = useState("🏸");
  const [subEvent, setSubEvent] = useState("");
  const [detail, setDetail] = useState("");
  const [statusType, setStatusType] = useState<"auto" | "completed" | "live" | "up_next" | "scheduled">("auto");
  const [statusMode, setStatusMode] = useState<"auto" | "manual">("auto");
  const [statusLabel, setStatusLabel] = useState("AUTO");
  const [nodeColor, setNodeColor] = useState<"gray" | "emerald" | "amber" | "blue" | "purple">("purple");
  const [venue, setVenue] = useState("");
  const [order, setOrder] = useState<number>(1);
  const [active, setActive] = useState(true);

  // Auto-sync status label and node color when statusType changes
  const handleStatusTypeChange = (type: "auto" | "completed" | "live" | "up_next" | "scheduled") => {
    setStatusType(type);
    if (type === "auto") {
      setStatusMode("auto");
      setStatusLabel("AUTO");
      setNodeColor("purple");
    } else if (type === "completed") {
      setStatusMode("manual");
      setStatusLabel("COMPLETED");
      setNodeColor("gray");
    } else if (type === "live") {
      setStatusMode("manual");
      setStatusLabel("LIVE");
      setNodeColor("emerald");
    } else if (type === "up_next") {
      setStatusMode("manual");
      setStatusLabel("UP NEXT");
      setNodeColor("amber");
    } else {
      setStatusMode("manual");
      setStatusLabel("SCHEDULED");
      setNodeColor("blue");
    }
  };

  // Load existing event if editId is present
  useEffect(() => {
    if (!editId) return;

    const loadEvent = async () => {
      try {
        setFetching(true);
        const res = await axios.get(`/api/welcomemessage/${editId}`);
        if (res.data.success && res.data.item) {
          const item = res.data.item;
          setTime(item.time || "08:00 AM");
          setSport(item.sport || "Badminton");
          setIcon(item.icon || "🏸");
          setSubEvent(item.subEvent || "");
          setDetail(item.detail || "");
          setStatusType(item.statusType || (item.isManual ? "live" : "auto"));
          setStatusMode(item.statusMode || (item.isManual ? "manual" : "auto"));
          setStatusLabel(item.statusLabel || (item.isManual ? item.statusType?.toUpperCase() || "LIVE" : "AUTO"));
          setNodeColor(item.nodeColor || "purple");
          setVenue(item.venue || "");
          setOrder(item.order !== undefined ? item.order : 1);
          setActive(item.active !== false);
        }
      } catch (err) {
        console.error("Failed to load schedule event for editing", err);
        alert("Failed to load event from DynamoDB");
      } finally {
        setFetching(false);
      }
    };

    loadEvent();
  }, [editId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sport.trim() || !time.trim()) {
      alert("Please enter sport name and time");
      return;
    }

    try {
      setLoading(true);
      setSavedSuccess(false);

      const isAuto = statusType === "auto";
      const resolvedLabel = isAuto
        ? "AUTO"
        : statusLabel.trim() ||
          (statusType === "completed"
            ? "COMPLETED"
            : statusType === "live"
            ? "LIVE"
            : statusType === "up_next"
            ? "UP NEXT"
            : "SCHEDULED");

      const payload = {
        id: editId || `agenda_${Date.now()}`,
        type: "todays_agenda",
        time: time.trim(),
        sport: sport.trim(),
        icon,
        subEvent: subEvent.trim(),
        detail: detail.trim(),
        statusType,
        statusMode: isAuto ? "auto" : "manual",
        isManual: !isAuto,
        statusLabel: resolvedLabel,
        nodeColor: isAuto ? "purple" : nodeColor,
        venue: venue.trim(),
        order: Number(order || 1),
        active,
      };

      if (editId) {
        await axios.put("/api/welcomemessage", payload);
      } else {
        await axios.post("/api/welcomemessage", payload);
      }

      setSavedSuccess(true);
      setTimeout(() => {
        router.push("/admin/homecardmanagement/Schedule/list");
      }, 800);
    } catch (err: any) {
      console.error("Failed to save event", err);
      alert(err.response?.data?.error || "Failed to save event to DynamoDB");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/homecardmanagement/Schedule/list"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {editId ? "Edit Schedule Event" : "Add Schedule Event"}
            </h1>
            <p className="text-xs text-gray-400">
              Configure event timeline details in DynamoDB (<code className="text-purple-400">homeDatabase</code>)
            </p>
          </div>
        </div>

        <Link href="/admin/homecardmanagement/Schedule/list">
          <button className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300 border border-white/10 transition-colors">
            Back to List
          </button>
        </Link>
      </div>

      {fetching ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3 text-gray-400">
          <Loader2 size={24} className="animate-spin text-purple-500" />
          <p className="text-xs">Fetching event from DynamoDB...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-5">
              {/* Row 1: Time, Status Type, Display Order */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Event Time *
                  </label>
                  <input
                    type="text"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    placeholder="e.g. 08:00 AM or 02:30 PM"
                    required
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Status Mode & Badge *
                  </label>
                  <select
                    value={statusType}
                    onChange={(e) => handleStatusTypeChange(e.target.value as any)}
                    className={`w-full bg-[#090C15] border rounded-xl px-3 py-2.5 text-xs focus:outline-none transition-colors font-bold ${
                      statusType === "auto"
                        ? "text-purple-300 border-purple-500/50"
                        : statusType === "live"
                        ? "text-emerald-400 border-emerald-500/50"
                        : statusType === "completed"
                        ? "text-gray-400 border-gray-600"
                        : statusType === "up_next"
                        ? "text-amber-400 border-amber-500/50"
                        : "text-blue-400 border-blue-500/50"
                    }`}
                  >
                    <option value="auto" className="bg-[#090C15] text-purple-400">
                      ⚡ AUTO (Synchronize with Clock)
                    </option>
                    <option value="live" className="bg-[#090C15] text-emerald-400">
                      🟢 LIVE (Manual Lock)
                    </option>
                    <option value="completed" className="bg-[#090C15] text-gray-400">
                      ✓ COMPLETED (Manual Lock)
                    </option>
                    <option value="up_next" className="bg-[#090C15] text-amber-400">
                      ⏳ UP NEXT (Manual Lock)
                    </option>
                    <option value="scheduled" className="bg-[#090C15] text-blue-400">
                      📅 SCHEDULED (Manual Lock)
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Display Priority Order
                  </label>
                  <input
                    type="number"
                    value={order}
                    onChange={(e) => setOrder(parseInt(e.target.value, 10) || 1)}
                    min={1}
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>

              {/* Row 2: Sport Category & Icon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Sport Name *
                  </label>
                  <input
                    type="text"
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    placeholder="e.g. Badminton or Men's Cricket T20"
                    required
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-purple-500 transition-colors"
                  />
                  {/* Preset chips */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {SPORT_OPTIONS.slice(0, 6).map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setSport(sp)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                          sport === sp
                            ? "bg-purple-600/30 border-purple-500 text-purple-300 font-bold"
                            : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                        }`}
                      >
                        {sp}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Sport Icon / Emoji
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                      placeholder="e.g. 🏸"
                      className="w-16 text-center text-lg bg-[#090C15] border border-white/10 rounded-xl py-1.5 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <div className="flex flex-wrap gap-1">
                      {EMOJI_SUGGESTIONS.slice(0, 8).map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setIcon(em)}
                          className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border transition-colors ${
                            icon === em
                              ? "bg-purple-600/30 border-purple-500"
                              : "bg-white/5 border-white/10 hover:bg-white/10"
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 3: Sub-Event Title */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  Sub-Event / Fixture Headline
                </label>
                <input
                  type="text"
                  value={subEvent}
                  onChange={(e) => setSubEvent(e.target.value)}
                  placeholder="e.g. Group Stage · India vs Japan or Women's Singles Quarterfinal"
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Row 4: Match Detail / Context */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  Additional Detail / Broadcast Note
                </label>
                <input
                  type="text"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="e.g. Sindhu on Court 1 or Live on SportsFan 1"
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Row 5: Venue & Visibility */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Venue / Stadium
                  </label>
                  <div className="relative">
                    <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={venue}
                      onChange={(e) => setVenue(e.target.value)}
                      placeholder="e.g. Binjiang Gymnasium"
                      className="w-full bg-[#090C15] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#090C15] border border-white/10 self-end">
                  <div>
                    <span className="block text-xs font-bold text-white">Active Visibility</span>
                    <span className="text-[11px] text-gray-400">Show this event on user schedule feeds</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-900"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                <Link href="/admin/homecardmanagement/Schedule/list">
                  <button
                    type="button"
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </Link>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white font-extrabold text-xs transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Saving to DynamoDB...</span>
                    </>
                  ) : savedSuccess ? (
                    <>
                      <CheckCircle2 size={14} className="text-white" />
                      <span>Saved Successfully!</span>
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      <span>{editId ? "Update Event" : "Create Schedule Event"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Col: Live Preview Card */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/30 space-y-4 sticky top-6">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-1.5 text-purple-400 text-xs font-bold">
                  <Sparkles size={14} />
                  <span>Live Feed Preview</span>
                </div>
                <span className="text-[10px] font-mono text-gray-400 uppercase">
                  FlipBOARD Schedule
                </span>
              </div>

              {/* Preview Item Card */}
              <div className="p-4 rounded-xl bg-[#090C15] border border-white/10 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{icon || "🏆"}</span>
                    <div>
                      <h4 className="text-sm font-extrabold text-white">
                        {sport || "Sport Name"}
                      </h4>
                      <p className="text-xs text-gray-300">
                        {subEvent || "Matchup / Event Description"}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      statusType === "auto"
                        ? "bg-purple-950 text-purple-300 border border-purple-500/50"
                        : statusType === "live"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-500/50"
                        : statusType === "completed"
                        ? "bg-gray-800 text-gray-300 border border-gray-600"
                        : statusType === "up_next"
                        ? "bg-amber-950 text-amber-400 border border-amber-500/50"
                        : "bg-blue-950 text-blue-400 border border-blue-500/50"
                    }`}
                  >
                    {statusType === "auto" ? "⚡ AUTO TIME SYNC" : statusType.toUpperCase()}
                  </span>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-400 font-medium">
                  <span className="flex items-center gap-1 text-gray-300">
                    <Clock size={11} className="text-purple-400" />
                    <strong>{time || "08:00 AM"}</strong>
                  </span>
                  {venue && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} className="text-gray-400" />
                      <span>{venue}</span>
                    </span>
                  )}
                </div>

                {detail && (
                  <p className="text-[11px] text-gray-400/90 pt-1">
                    {detail}
                  </p>
                )}
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-[11px] text-gray-400 space-y-1">
                <p>
                  <strong>⚡ Auto Mode Note:</strong> When set to AUTO, this fixture will automatically transition from SCHEDULED ➔ UP NEXT ➔ LIVE ➔ COMPLETED based on the current local clock time.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScheduleAddPage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-white flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-purple-500" size={24} />
          <p className="text-xs text-gray-400">Loading Schedule form...</p>
        </div>
      }
    >
      <ScheduleForm />
    </Suspense>
  );
}
