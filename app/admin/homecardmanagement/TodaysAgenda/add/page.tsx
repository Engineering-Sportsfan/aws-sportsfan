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

function TodaysAgendaForm() {
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
  const [statusType, setStatusType] = useState<"live" | "up_next" | "afternoon">("live");
  const [statusLabel, setStatusLabel] = useState("LIVE");
  const [nodeColor, setNodeColor] = useState<"emerald" | "amber" | "blue">("emerald");
  const [venue, setVenue] = useState("");
  const [order, setOrder] = useState<number>(1);
  const [active, setActive] = useState(true);

  // Auto-sync status label and node color when statusType changes
  const handleStatusTypeChange = (type: "live" | "up_next" | "afternoon") => {
    setStatusType(type);
    if (type === "live") {
      setStatusLabel("LIVE");
      setNodeColor("emerald");
    } else if (type === "up_next") {
      setStatusLabel("UP NEXT");
      setNodeColor("amber");
    } else {
      setStatusLabel("AFTERNOON");
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
          setStatusType(item.statusType || "live");
          setStatusLabel(item.statusLabel || "LIVE");
          setNodeColor(item.nodeColor || "emerald");
          setVenue(item.venue || "");
          setOrder(item.order || 1);
          setActive(item.active !== false);
        }
      } catch (err) {
        console.error("Failed to load agenda event for editing", err);
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

      const payload = {
        id: editId || `agenda_${Date.now()}`,
        type: "todays_agenda",
        time: time.trim(),
        sport: sport.trim(),
        icon,
        subEvent: subEvent.trim(),
        detail: detail.trim(),
        statusType,
        statusLabel: statusLabel.trim() || (statusType === "live" ? "LIVE" : statusType === "up_next" ? "UP NEXT" : "AFTERNOON"),
        nodeColor,
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
        router.push("/admin/homecardmanagement/TodaysAgenda/list");
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
            href="/admin/homecardmanagement/TodaysAgenda/list"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {editId ? "Edit Agenda Event" : "Add Today's Agenda Event"}
            </h1>
            <p className="text-xs text-gray-400">
              Configure event timeline details in DynamoDB (<code className="text-purple-400">homeDatabase</code>)
            </p>
          </div>
        </div>

        <Link href="/admin/homecardmanagement/TodaysAgenda/list">
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
                    Status Badge *
                  </label>
                  <select
                    value={statusType}
                    onChange={(e) => handleStatusTypeChange(e.target.value as any)}
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors font-bold"
                  >
                    <option value="live">LIVE (Green)</option>
                    <option value="up_next">UP NEXT (Amber)</option>
                    <option value="afternoon">AFTERNOON (Blue)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                    min={1}
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors"
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
                              ? "bg-purple-500/20 border-purple-500/60"
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

              {/* Row 3: Sub-Event & Matchup details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Sub-Event / Category *
                  </label>
                  <input
                    type="text"
                    value={subEvent}
                    onChange={(e) => setSubEvent(e.target.value)}
                    placeholder="e.g. Women's Team Q/F or Gold Medal Match"
                    required
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Competitors / Details *
                  </label>
                  <input
                    type="text"
                    value={detail}
                    onChange={(e) => setDetail(e.target.value)}
                    placeholder="e.g. India vs. Japan or Qualification"
                    required
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>
              </div>

              {/* Row 4: Venue & Visibility */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Venue / Stadium
                  </label>
                  <input
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g. Binjiang Gymnasium · Court 1"
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Visibility
                  </label>
                  <button
                    type="button"
                    onClick={() => setActive(!active)}
                    className={`w-full py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                      active
                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-500/40"
                        : "bg-gray-800 text-gray-400 border-gray-700"
                    }`}
                  >
                    {active ? "Active (Visible in Agenda)" : "Hidden (Draft)"}
                  </button>
                </div>
              </div>

              {/* Submit Action */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <Link href="/admin/homecardmanagement/TodaysAgenda/list">
                  <button
                    type="button"
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                </Link>

                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-95 text-white font-black text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : savedSuccess ? (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Saved!</span>
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>{editId ? "Update Event in DynamoDB" : "Publish Event to DynamoDB"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Col: Timeline Live Preview */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/30 space-y-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <span className="text-xl">📱</span>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Timeline Item Preview
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    How this event appears on the Today&apos;s Agenda sheet
                  </p>
                </div>
              </div>

              {/* Timeline Item Live Preview */}
              <div className="p-4 rounded-2xl bg-[#090C15] border border-white/10 flex items-start gap-3 shadow-xl">
                {/* Bullet */}
                <div className="pt-1">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      statusType === "live"
                        ? "bg-emerald-400 shadow-[0_0_10px_#34D399]"
                        : statusType === "up_next"
                        ? "bg-amber-400 shadow-[0_0_10px_#FBBF24]"
                        : "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]"
                    }`}
                  />
                </div>

                <div className="flex-1 flex items-start justify-between min-w-0">
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="text-[11px] font-bold text-gray-400 tracking-wider">
                      {time || "08:00 AM"}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-lg leading-none">{icon || "🏆"}</span>
                      <h4 className="text-sm font-extrabold text-white truncate">
                        {sport || "Sport Title"}
                      </h4>
                    </div>
                    <p className="text-xs font-medium text-gray-300 leading-tight mt-1 truncate">
                      {subEvent || "Sub-Event Name"}
                    </p>
                    <p className="text-[11px] text-gray-400 leading-tight mt-0.5 truncate">
                      {detail || "Matchup & Details"}
                    </p>
                    {venue && (
                      <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1 truncate">
                        <MapPin size={10} />
                        <span>{venue}</span>
                      </p>
                    )}
                  </div>

                  <div className="shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 text-[9.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        statusType === "live"
                          ? "bg-[#04281E] text-[#10B981] border border-[#10B981]/50"
                          : statusType === "up_next"
                          ? "bg-[#2E1F06] text-[#FBBF24] border border-[#D97706]/60"
                          : "bg-[#0b1c33] text-[#60A5FA] border border-[#1E40AF]/60"
                      }`}
                    >
                      {statusType === "live" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                      {statusLabel || (statusType === "live" ? "LIVE" : statusType === "up_next" ? "UP NEXT" : "AFTERNOON")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Note */}
              <div className="p-3 rounded-xl bg-[#090C15] border border-white/5 flex items-center justify-between text-xs">
                <span className="text-gray-400">Visibility:</span>
                <span className={active ? "text-emerald-400 font-bold" : "text-gray-500"}>
                  {active ? "● Live on Mobile & Web" : "Hidden"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AddTodaysAgendaPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-white text-xs">Loading form...</div>}>
      <TodaysAgendaForm />
    </Suspense>
  );
}
