"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { 
  ArrowLeft, 
  Save, 
  Loader2, 
  CheckCircle2, 
  Sparkles,
  Sun,
  Eye,
  Trash2,
  Search,
  X,
  Target,
  MessageSquare,
  Radio,
  Plus,
  ExternalLink,
  ChevronRight,
  Info,
  Check,
  Calendar,
  Clock
} from "lucide-react";

// India Standard Time (IST, UTC+5:30) helper
function getIndiaDateString(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const EMOJI_SUGGESTIONS = [
  "🏏", "🎯", "🏸", "🏑", "🥊", "🏃", "🏊", "🏓", "🤸", "🏹", "⚽", "🏀", "🎾", "🏐", "🥇", "🏆", "🔥"
];

const SPORT_OPTIONS = [
  "Cricket",
  "Shooting",
  "Badminton",
  "Hockey",
  "Boxing",
  "Athletics",
  "Swimming",
  "Table Tennis",
  "Gymnastics",
  "Archery",
  "Football",
  "Basketball",
  "Tennis",
  "Wrestling",
  "Other"
];

function MorningBriefForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Form fields
  const [date, setDate] = useState<string>(() => getIndiaDateString());
  const [time, setTime] = useState<string>("");
  const [storyNumber, setStoryNumber] = useState<number>(1);
  const [sport, setSport] = useState("Cricket");
  const [icon, setIcon] = useState("🏏");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState<number>(1);
  const [active, setActive] = useState(true);

  // CTA Selection States
  // 1. Predict CTA (FlipArena)
  const [predictId, setPredictId] = useState<string>("");
  const [predictTitle, setPredictTitle] = useState<string>("");
  const [predictUrl, setPredictUrl] = useState<string>("");

  // 2. Discuss CTA (FlipLine)
  const [discussPostId, setDiscussPostId] = useState<string>("");
  const [discussTitle, setDiscussTitle] = useState<string>("");
  const [discussUrl, setDiscussUrl] = useState<string>("");

  // 3. Debate CTA (FlipLive / WatchAlong)
  const [debateRoomId, setDebateRoomId] = useState<string>("");
  const [debateTitle, setDebateTitle] = useState<string>("");
  const [debateUrl, setDebateUrl] = useState<string>("");

  // Picker Modal Data & State
  const [activePickerModal, setActivePickerModal] = useState<null | "predict" | "discuss" | "debate">(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [loadingPickers, setLoadingPickers] = useState(false);

  const [predictionsList, setPredictionsList] = useState<any[]>([]);
  const [fliplinePostsList, setFliplinePostsList] = useState<any[]>([]);
  const [debateRoomsList, setDebateRoomsList] = useState<any[]>([]);

  // Fetch available CTAs from backend
  useEffect(() => {
    const fetchPickerData = async () => {
      try {
        setLoadingPickers(true);
        const [predRes, fliplineRes, roomsRes] = await Promise.allSettled([
          axios.get("/api/engagements?type=prediction&limit=100"),
          axios.get("/api/flipline?limit=100"),
          axios.get("/api/watch-along?includeInactive=true&limit=100"),
        ]);

        if (predRes.status === "fulfilled") {
          const items = predRes.value.data?.engagements || predRes.value.data?.data || [];
          setPredictionsList(Array.isArray(items) ? items : []);
        }
        if (fliplineRes.status === "fulfilled") {
          const items = fliplineRes.value.data?.data || fliplineRes.value.data?.items || fliplineRes.value.data || [];
          setFliplinePostsList(Array.isArray(items) ? items : []);
        }
        if (roomsRes.status === "fulfilled") {
          const items = roomsRes.value.data?.rooms || roomsRes.value.data?.data || roomsRes.value.data || [];
          setDebateRoomsList(Array.isArray(items) ? items : []);
        }
      } catch (err) {
        console.warn("Error fetching CTA picker data:", err);
      } finally {
        setLoadingPickers(false);
      }
    };

    fetchPickerData();
  }, []);

  // Load existing story if editId is provided
  useEffect(() => {
    if (!editId) return;

    const loadStory = async () => {
      try {
        setFetching(true);
        const res = await axios.get(`/api/welcomemessage/${editId}`);
        if (res.data.success && res.data.item) {
          const item = res.data.item;
          setDate(item.date || getIndiaDateString());
          setTime(item.time || "");
          setStoryNumber(item.storyNumber || 1);
          setSport(item.sport || "Cricket");
          setIcon(item.icon || "🏏");
          setTitle(item.title || "");
          setDescription(item.description || "");
          setOrder(item.order || 1);
          setActive(item.active !== false);

          // Restore CTAs
          setPredictId(item.predictId || "");
          setPredictTitle(item.predictTitle || "");
          setPredictUrl(item.predictUrl || "");

          setDiscussPostId(item.discussPostId || "");
          setDiscussTitle(item.discussTitle || "");
          setDiscussUrl(item.discussUrl || "");

          setDebateRoomId(item.debateRoomId || "");
          setDebateTitle(item.debateTitle || "");
          setDebateUrl(item.debateUrl || "");
        }
      } catch (err) {
        console.error("Failed to load story for editing", err);
        alert("Failed to load story for editing");
      } finally {
        setFetching(false);
      }
    };

    loadStory();
  }, [editId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("Please enter a story title");
      return;
    }

    try {
      setLoading(true);
      setSavedSuccess(false);

      const payload = {
        id: editId || `brief_${storyNumber}_${Date.now()}`,
        type: "morning_brief",
        storyNumber: Number(storyNumber),
        order: Number(order || storyNumber),
        sport,
        icon,
        date: date ? date.trim() : getIndiaDateString(),
        time: time ? time.trim() : undefined,
        title: title.trim(),
        description: description.trim(),
        active,
        // CTA configuration (saved to DynamoDB)
        predictId: predictId || undefined,
        predictTitle: predictTitle || undefined,
        predictUrl: predictUrl || (predictId ? `/MainModules/FlipArena?engagementId=${predictId}&type=prediction` : undefined),
        discussPostId: discussPostId || undefined,
        discussTitle: discussTitle || undefined,
        discussUrl: discussUrl || (discussPostId ? `/MainModules/FlipLine?postId=${discussPostId}` : undefined),
        debateRoomId: debateRoomId || undefined,
        debateTitle: debateTitle || undefined,
        debateUrl: debateUrl || (debateRoomId ? `/MainModules/WatchAlong?roomId=${debateRoomId}` : undefined),
      };

      if (editId) {
        await axios.put("/api/welcomemessage", payload);
      } else {
        await axios.post("/api/welcomemessage", payload);
      }

      setSavedSuccess(true);
      setTimeout(() => {
        router.push("/admin/homecardmanagement/MorningBrief/list");
      }, 800);
    } catch (err: any) {
      console.error("Failed to save story", err);
      alert(err.response?.data?.error || "Failed to save story to DynamoDB");
    } finally {
      setLoading(false);
    }
  };

  // Filtered lists for picker modals
  const filteredPredictions = useMemo(() => {
    if (!pickerSearch.trim()) return predictionsList;
    const q = pickerSearch.toLowerCase();
    return predictionsList.filter(
      (p) =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.sport && p.sport.toLowerCase().includes(q)) ||
        (p.id && String(p.id).toLowerCase().includes(q))
    );
  }, [predictionsList, pickerSearch]);

  const filteredFliplinePosts = useMemo(() => {
    if (!pickerSearch.trim()) return fliplinePostsList;
    const q = pickerSearch.toLowerCase();
    return fliplinePostsList.filter(
      (p) =>
        (p.content && p.content.toLowerCase().includes(q)) ||
        (p.author && p.author.toLowerCase().includes(q)) ||
        (p.sport && p.sport.toLowerCase().includes(q)) ||
        (p.id && String(p.id).toLowerCase().includes(q))
    );
  }, [fliplinePostsList, pickerSearch]);

  const filteredDebateRooms = useMemo(() => {
    if (!pickerSearch.trim()) return debateRoomsList;
    const q = pickerSearch.toLowerCase();
    return debateRoomsList.filter(
      (r) =>
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.matchTitle && r.matchTitle.toLowerCase().includes(q)) ||
        (r.sport && r.sport.toLowerCase().includes(q)) ||
        (r.id && String(r.id).toLowerCase().includes(q)) ||
        (r.roomId && String(r.roomId).toLowerCase().includes(q))
    );
  }, [debateRoomsList, pickerSearch]);

  // Render modal picker list
  const renderModalPickerItems = () => {
    if (loadingPickers) {
      return (
        <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-400">
          <Loader2 size={24} className="animate-spin text-amber-500" />
          <p className="text-xs">Loading items from database...</p>
        </div>
      );
    }

    if (activePickerModal === "predict") {
      if (filteredPredictions.length === 0) {
        return (
          <div className="p-8 text-center text-gray-400 text-xs">
            No FlipArena predictions found.
          </div>
        );
      }
      return filteredPredictions.map((item) => {
        const isSelected = predictId === item.id;
        return (
          <div
            key={item.id}
            onClick={() => {
              setPredictId(item.id);
              setPredictTitle(item.title);
              setPredictUrl(`/MainModules/FlipArena?engagementId=${item.id}&type=prediction`);
              setActivePickerModal(null);
            }}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${isSelected
                ? "bg-pink-500/20 border-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.3)]"
                : "bg-[#090C15] border-white/10 hover:border-pink-500/50 hover:bg-[#151a2d]"
              }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-pink-500/20 text-pink-300">
                  {item.sport || "Prediction"}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  ID: {item.id}
                </span>
              </div>
              <h4 className="text-xs font-bold text-white leading-snug">
                {item.title}
              </h4>
            </div>
            <div className="shrink-0">
              {isSelected ? (
                <span className="w-7 h-7 rounded-full bg-pink-500 text-black flex items-center justify-center">
                  <Check size={14} className="font-bold" />
                </span>
              ) : (
                <span className="px-3 py-1 rounded-lg bg-white/5 text-gray-300 text-xs font-bold hover:bg-pink-500 hover:text-black transition-colors">
                  Select
                </span>
              )}
            </div>
          </div>
        );
      });
    }

    if (activePickerModal === "discuss") {
      if (filteredFliplinePosts.length === 0) {
        return (
          <div className="p-8 text-center text-gray-400 text-xs">
            No FlipLine posts found.
          </div>
        );
      }
      return filteredFliplinePosts.map((item) => {
        const itemId = String(item.id);
        const isSelected = discussPostId === itemId;
        const displayTitle = item.title || item.content?.slice(0, 80) || `Post #${itemId}`;
        return (
          <div
            key={item.id}
            onClick={() => {
              setDiscussPostId(itemId);
              setDiscussTitle(displayTitle);
              setDiscussUrl(`/MainModules/FlipLine?postId=${itemId}`);
              setActivePickerModal(null);
            }}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${isSelected
                ? "bg-blue-500/20 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                : "bg-[#090C15] border-white/10 hover:border-blue-500/50 hover:bg-[#151a2d]"
              }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                  {item.author || item.sport || "FlipLine"}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  ID: {itemId}
                </span>
              </div>
              <p className="text-xs text-white leading-relaxed line-clamp-2">
                {item.content || item.title || "FlipLine Post Content"}
              </p>
            </div>
            <div className="shrink-0">
              {isSelected ? (
                <span className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center">
                  <Check size={14} className="font-bold" />
                </span>
              ) : (
                <span className="px-3 py-1 rounded-lg bg-white/5 text-gray-300 text-xs font-bold hover:bg-blue-500 hover:text-white transition-colors">
                  Select
                </span>
              )}
            </div>
          </div>
        );
      });
    }

    if (activePickerModal === "debate") {
      if (filteredDebateRooms.length === 0) {
        return (
          <div className="p-8 text-center text-gray-400 text-xs">
            No FlipLive / WatchAlong rooms found.
          </div>
        );
      }
      return filteredDebateRooms.map((item) => {
        const roomId = String(item.id || item.roomId);
        const isSelected = debateRoomId === roomId;
        const roomTitle = item.name || item.matchTitle || item.title || `Room #${roomId}`;
        return (
          <div
            key={roomId}
            onClick={() => {
              setDebateRoomId(roomId);
              setDebateTitle(roomTitle);
              setDebateUrl(`/MainModules/WatchAlong?roomId=${roomId}`);
              setActivePickerModal(null);
            }}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${isSelected
                ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
                : "bg-[#090C15] border-white/10 hover:border-emerald-500/50 hover:bg-[#151a2d]"
              }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                  {item.isLive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                  {item.sport || "Debate"}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  ID: {roomId}
                </span>
              </div>
              <h4 className="text-xs font-bold text-white leading-snug">
                {roomTitle}
              </h4>
            </div>
            <div className="shrink-0">
              {isSelected ? (
                <span className="w-7 h-7 rounded-full bg-emerald-500 text-black flex items-center justify-center">
                  <Check size={14} className="font-bold" />
                </span>
              ) : (
                <span className="px-3 py-1 rounded-lg bg-white/5 text-gray-300 text-xs font-bold hover:bg-emerald-500 hover:text-black transition-colors">
                  Select
                </span>
              )}
            </div>
          </div>
        );
      });
    }

    return null;
  };

  return (
    <div className="max-w-[1200px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/homecardmanagement/MorningBrief/list"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {editId ? "Edit Morning Brief Story" : "Add Morning Brief Story"}
            </h1>
            <p className="text-xs text-gray-400">
              Save story directly to DynamoDB table (<code className="text-amber-400">homeDatabase</code>)
            </p>
          </div>
        </div>

        <Link href="/admin/homecardmanagement/MorningBrief/list">
          <button className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300 border border-white/10 transition-colors">
            Back to List
          </button>
        </Link>
      </div>

      {fetching ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3 text-gray-400">
          <Loader2 size={24} className="animate-spin text-amber-500" />
          <p className="text-xs">Fetching story details from DynamoDB...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Form */}
          <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-6">
                {/* Row 0: Date (India Std Time) & Time */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-300 mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-amber-400" />
                        <span>Story Date *</span>
                      </span>
                      <span className="text-[10px] font-semibold text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        IST (India Std Time)
                      </span>
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                      className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} className="text-amber-400" />
                        <span>Time (Optional)</span>
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">e.g. 08:00 AM</span>
                    </label>
                    <input
                      type="text"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      placeholder="e.g. 08:00 AM (optional)"
                      className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors font-mono"
                    />
                  </div>
                </div>

                {/* Row 1: Display Order & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                      Display Order / Story #
                  </label>
                  <input
                    type="number"
                    value={order}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setOrder(val);
                        setStoryNumber(val);
                      }}
                    min={1}
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                      Visibility Status
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
                      {active ? "Active (Visible on FlipBOARD)" : "Hidden (Draft)"}
                  </button>
                </div>
              </div>

              {/* Row 2: Sport Category & Custom Icon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Sport Category *
                  </label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  >
                    {SPORT_OPTIONS.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
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
                      placeholder="e.g. 🏏"
                      className="w-16 text-center text-lg bg-[#090C15] border border-white/10 rounded-xl py-1.5 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                    <div className="flex flex-wrap gap-1">
                      {EMOJI_SUGGESTIONS.slice(0, 8).map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setIcon(em)}
                          className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border transition-colors ${
                            icon === em
                              ? "bg-amber-500/20 border-amber-500/60"
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

              {/* Row 3: Story Title */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  Story Headline Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Women's Cricket Final"
                  required
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Row 4: Story Description */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1.5">
                  Story Description / Summary *
                </label>
                <textarea
                    rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. India face Sri Lanka in the gold medal match — biggest game of the Asian Games for Indian cricket."
                  required
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors leading-relaxed"
                />
              </div>

                {/* ─────────────────────────────────────────────────────────────
                  Row 5: Interactive CTAs Configuration (Predict, Discuss, Debate)
              ───────────────────────────────────────────────────────────── */}
                <div className="p-4 rounded-2xl bg-[#090C15] border border-white/10 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-400" />
                        <span>Link Story Actions & CTAs</span>
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Select specific items to attach as dynamic CTA buttons. If not selected, that button will not appear on the frontend.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                      Optional
                    </span>
                  </div>

                  <div className="space-y-3 pt-1">
                    {/* CTA 1: Predict CTA (FlipArena) */}
                    <div className="p-3.5 rounded-xl bg-[#111625] border border-pink-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-pink-400 flex items-center gap-1.5">
                          <Target size={14} />
                          <span>Predict CTA (FlipArena)</span>
                        </span>
                        {predictId ? (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40">
                            Configured ✓
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Not selected</span>
                        )}
                      </div>

                      {predictId ? (
                        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#090C15] border border-white/10">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">
                              {predictTitle || predictId}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono truncate">
                              ID: {predictId}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setPickerSearch("");
                                setActivePickerModal("predict");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPredictId("");
                                setPredictTitle("");
                                setPredictUrl("");
                              }}
                              className="p-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                              title="Remove Predict CTA"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPickerSearch("");
                            setActivePickerModal("predict");
                          }}
                          className="w-full py-2 px-3 rounded-lg border border-dashed border-pink-500/40 hover:border-pink-500/80 bg-pink-500/5 hover:bg-pink-500/10 text-pink-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Select FlipArena Prediction</span>
                        </button>
                      )}
                    </div>

                    {/* CTA 2: Discuss CTA (FlipLine) */}
                    <div className="p-3.5 rounded-xl bg-[#111625] border border-blue-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                          <MessageSquare size={14} />
                          <span>Discuss CTA (FlipLine Post)</span>
                        </span>
                        {discussPostId ? (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                            Configured ✓
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Not selected</span>
                        )}
                      </div>

                      {discussPostId ? (
                        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#090C15] border border-white/10">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">
                              {discussTitle || `Post #${discussPostId}`}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono truncate">
                              Post ID: {discussPostId}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setPickerSearch("");
                                setActivePickerModal("discuss");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDiscussPostId("");
                                setDiscussTitle("");
                                setDiscussUrl("");
                              }}
                              className="p-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                              title="Remove Discuss CTA"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPickerSearch("");
                            setActivePickerModal("discuss");
                          }}
                          className="w-full py-2 px-3 rounded-lg border border-dashed border-blue-500/40 hover:border-blue-500/80 bg-blue-500/5 hover:bg-blue-500/10 text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Select FlipLine Post</span>
                        </button>
                      )}
                    </div>

                    {/* CTA 3: Debate CTA (FlipLive / WatchAlong) */}
                    <div className="p-3.5 rounded-xl bg-[#111625] border border-emerald-500/20 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <Radio size={14} />
                          <span>Debate CTA (FlipLive / WatchAlong Room)</span>
                        </span>
                        {debateRoomId ? (
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Configured ✓
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Not selected</span>
                        )}
                      </div>

                      {debateRoomId ? (
                        <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#090C15] border border-white/10">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">
                              {debateTitle || `Room #${debateRoomId}`}
                            </p>
                            <p className="text-[10px] text-gray-400 font-mono truncate">
                              Room ID: {debateRoomId}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setPickerSearch("");
                                setActivePickerModal("debate");
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDebateRoomId("");
                                setDebateTitle("");
                                setDebateUrl("");
                              }}
                              className="p-1 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                              title="Remove Debate CTA"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPickerSearch("");
                            setActivePickerModal("debate");
                          }}
                          className="w-full py-2 px-3 rounded-lg border border-dashed border-emerald-500/40 hover:border-emerald-500/80 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Plus size={13} />
                          <span>Select FlipLive Debate Room</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Note regarding Create button */}

                </div>

              {/* Submit Action */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <Link href="/admin/homecardmanagement/MorningBrief/list">
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
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs flex items-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
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
                      <span>{editId ? "Update Story in DynamoDB" : "Publish Story to DynamoDB"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Right Col: Live Preview on Frontend */}
          <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-[#111625] border border-amber-500/30 space-y-4 sticky top-6">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <span className="text-xl">📱</span>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Frontend Live Preview
                  </h3>
                  <p className="text-[11px] text-gray-400">
                      How fans see this story and actions in the Morning Brief
                  </p>
                </div>
              </div>

              {/* Preview Card */}
                <div className="p-4 rounded-2xl bg-[#0e1320] border border-white/10 space-y-3 shadow-xl">
                  <div className="flex items-start gap-3.5">
                    {/* Number Badge with Icon */}
                    <div className="flex flex-col items-center gap-2 shrink-0 pt-0.5">
                      <div className="w-7 h-7 rounded-lg bg-[#261A0C] border border-[#854D0E]/60 text-[#F59E0B] text-xs font-black flex items-center justify-center shadow-sm">
                        {storyNumber || order || 1}
                      </div>
                      <span className="text-lg leading-none">{icon || "🏆"}</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <Calendar size={10} />
                          <span>{date || getIndiaDateString()}</span>
                        </span>
                        {time && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10 flex items-center gap-1">
                            <Clock size={10} />
                            <span>{time}</span>
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-extrabold text-white leading-snug">
                        {title || "Story Headline Preview"}
                      </h4>
                      <p className="text-xs font-normal text-gray-400 leading-relaxed mt-1">
                        {description || "The story summary and description will appear here on the user interface."}
                      </p>
                    </div>
                  </div>

                  {/* Story Actions Row Live Preview */}
                  <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-white/5 pl-9">
                    {/* 1. Predict CTA */}
                    {Boolean(predictId) && (
                      <span className="px-2.5 py-1 rounded-full border border-pink-500/70 bg-pink-500/10 text-pink-400 font-bold text-[10.5px] flex items-center gap-1 shadow-sm">
                        <span>🎯 Predict &gt;</span>
                      </span>
                    )}

                    {/* 2. Discuss CTA */}
                    {Boolean(discussPostId) && (
                      <span className="px-2.5 py-1 rounded-full border border-blue-500/60 bg-blue-500/10 text-blue-400 font-bold text-[10.5px] flex items-center gap-1 shadow-sm">
                        <span>💬 Discuss</span>
                      </span>
                    )}

                    {/* 3. Debate CTA */}
                    {Boolean(debateRoomId) && (
                      <span className="px-2.5 py-1 rounded-full border border-emerald-500/60 bg-emerald-500/10 text-emerald-400 font-bold text-[10.5px] flex items-center gap-1 shadow-sm">
                        <span>🔴 Debate</span>
                      </span>
                    )}

                    {/* 4. + Create CTA (Always visible) */}
                    <span className="px-2.5 py-1 rounded-full border border-amber-500/70 bg-amber-500/10 text-amber-400 font-bold text-[10.5px] flex items-center gap-1 shadow-sm">
                      <span>+ Create</span>
                    </span>
                </div>
              </div>

              {/* Status Badge in preview */}
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

      {/* ─────────────────────────────────────────────────────────────
          PICKER MODAL: Predict | Discuss | Debate
      ───────────────────────────────────────────────────────────── */}
      {activePickerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#111625] border border-white/15 flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activePickerModal === "predict" && <Target className="text-pink-400" size={20} />}
                {activePickerModal === "discuss" && <MessageSquare className="text-blue-400" size={20} />}
                {activePickerModal === "debate" && <Radio className="text-emerald-400" size={20} />}
                <h3 className="text-base font-extrabold text-white">
                  {activePickerModal === "predict" && "Select FlipArena Prediction"}
                  {activePickerModal === "discuss" && "Select FlipLine Discussion Post"}
                  {activePickerModal === "debate" && "Select FlipLive / WatchAlong Room"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePickerModal(null)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-white/10 bg-[#090C15]">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder={`Search ${activePickerModal === "predict" ? "predictions" : activePickerModal === "discuss" ? "posts" : "rooms"}...`}
                  className="w-full bg-[#111625] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            {/* Modal Content / List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {renderModalPickerItems()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-[#090C15] flex justify-end">
              <button
                type="button"
                onClick={() => setActivePickerModal(null)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white transition-colors cursor-pointer"
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

export default function AddMorningBriefPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-white text-xs">Loading form...</div>}>
      <MorningBriefForm />
    </Suspense>
  );
}
