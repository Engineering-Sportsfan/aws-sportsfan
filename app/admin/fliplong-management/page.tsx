"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import axios from "axios";
import {
  Search,
  RefreshCw,
  Trash2,
  Pencil,
  Play,
  Plus,
  Video,
  Clock,
  Calendar,
  Eye,
  X,
  ExternalLink,
  Copy,
  Check,
  Filter,
  Sparkles,
  Film,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
  User,
  SlidersHorizontal,
  Layers,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";

export interface FlipLongVideo {
  id: string;
  videoId?: string;
  title: string;
  description?: string;
  url: string;
  videoUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: string;
  durationSeconds?: number;
  format?: string;
  sport?: string;
  author?: string;
  authorPhoto?: string;
  userId?: string;
  email?: string;
  isScheduled?: boolean;
  scheduledAt?: number;
  scheduledTimeMs?: number;
  day?: string;
  time?: string;
  timeMs?: number;
  createdAt?: string;
  createdAtMs?: number;
  sk?: string;
  roomId?: string;
  [key: string]: any;
}

const AVAILABLE_SPORTS = [
  "general",
  "cricket",
  "football",
  "basketball",
  "tennis",
  "f1",
  "badminton",
  "esports",
];

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
    if (diffMs < 0) {
      const futureMins = Math.floor(Math.abs(diffMs) / 60000);
      if (futureMins < 60) return `in ${futureMins}m`;
      const futureHours = Math.floor(futureMins / 60);
      if (futureHours < 24) return `in ${futureHours}h`;
      const futureDays = Math.floor(futureHours / 24);
      return `in ${futureDays}d`;
    }
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

function FlipLongManagementContent() {
  const [videos, setVideos] = useState<FlipLongVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSport, setSelectedSport] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState<"all" | "live" | "scheduled">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "title" | "duration">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modals & Action States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editVideo, setEditVideo] = useState<FlipLongVideo | null>(null);
  const [deleteVideo, setDeleteVideo] = useState<FlipLongVideo | null>(null);
  const [previewVideo, setPreviewVideo] = useState<FlipLongVideo | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form State (Create / Edit)
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSport, setFormSport] = useState("cricket");
  const [formAuthor, setFormAuthor] = useState("SportsFan Host");
  const [formAuthorPhoto, setFormAuthorPhoto] = useState("");
  const [formDuration, setFormDuration] = useState("");
  const [formVideoUrl, setFormVideoUrl] = useState("");
  const [formThumbnailUrl, setFormThumbnailUrl] = useState("");
  const [formVideoFile, setFormVideoFile] = useState<File | null>(null);
  const [formIsScheduled, setFormIsScheduled] = useState(false);
  const [formScheduledDate, setFormScheduledDate] = useState("");
  const [formScheduledTime, setFormScheduledTime] = useState("");

  // Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchVideos();
  }, []);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchVideos = async () => {
    try {
      setRefreshing(true);
      const res = await axios.get("/api/flipLong?includeScheduled=true&limit=200");
      if (res.data.success) {
        setVideos(res.data.videos || []);
      }
    } catch (err: any) {
      console.error("Failed to load FlipLONG videos:", err);
      showToast(err.response?.data?.error || "Failed to load FlipLONG videos", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormTitle("");
    setFormDescription("");
    setFormSport("cricket");
    setFormAuthor("SportsFan Host");
    setFormAuthorPhoto("");
    setFormDuration("");
    setFormVideoUrl("");
    setFormThumbnailUrl("");
    setFormVideoFile(null);
    setFormIsScheduled(false);
    setFormScheduledDate("");
    setFormScheduledTime("");
    setCreateModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (v: FlipLongVideo) => {
    setEditVideo(v);
    setFormTitle(v.title || "");
    setFormDescription(typeof v.description === "string" ? v.description : JSON.stringify(v.description || ""));
    setFormSport(v.sport || "general");
    setFormAuthor(v.author || "SportsFan Host");
    setFormAuthorPhoto(v.authorPhoto || "");
    setFormDuration(v.duration || "");
    setFormVideoUrl(v.url || v.videoUrl || v.mediaUrl || "");
    setFormThumbnailUrl(v.thumbnailUrl || "");
    setFormVideoFile(null);
    setFormIsScheduled(v.isScheduled === true);

    if (v.scheduledAt || v.scheduledTimeMs) {
      const schedMs = Number(v.scheduledAt || v.scheduledTimeMs);
      const d = new Date(schedMs);
      setFormScheduledDate(d.toISOString().split("T")[0]);
      setFormScheduledTime(d.toTimeString().slice(0, 5));
    } else {
      setFormScheduledDate("");
      setFormScheduledTime("");
    }
  };

  // Save / Upload Video (Create or Edit)
  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      alert("Video title is required.");
      return;
    }

    if (!editVideo && !formVideoFile && !formVideoUrl.trim()) {
      alert("Please upload a video file or provide a video URL.");
      return;
    }

    setActionLoading(true);

    try {
      let scheduledAtMs: number | undefined;
      if (formIsScheduled && formScheduledDate) {
        const timeStr = formScheduledTime ? `${formScheduledTime}:00` : "00:00:00";
        scheduledAtMs = new Date(`${formScheduledDate}T${timeStr}`).getTime();
      }

      if (formVideoFile) {
        // Multipart upload
        const formData = new FormData();
        if (editVideo) formData.append("id", editVideo.id);
        formData.append("title", formTitle.trim());
        formData.append("description", formDescription.trim());
        formData.append("sport", formSport.toLowerCase());
        formData.append("author", formAuthor.trim());
        if (formAuthorPhoto) formData.append("authorPhoto", formAuthorPhoto.trim());
        if (formDuration) formData.append("duration", formDuration.trim());
        if (formThumbnailUrl) formData.append("thumbnailUrl", formThumbnailUrl.trim());
        formData.append("isScheduled", String(formIsScheduled));
        if (scheduledAtMs) formData.append("scheduledAt", String(scheduledAtMs));
        formData.append("file", formVideoFile);

        if (editVideo) {
          const res = await axios.put("/api/flipLong", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          if (res.data.success) {
            showToast("Video updated successfully!");
            setEditVideo(null);
            await fetchVideos();
          }
        } else {
          const res = await axios.post("/api/flipLong", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          if (res.data.success) {
            showToast("Video uploaded & published successfully!");
            setCreateModalOpen(false);
            await fetchVideos();
          }
        }
      } else {
        // JSON payload
        const payload = {
          ...(editVideo ? { id: editVideo.id } : {}),
          title: formTitle.trim(),
          description: formDescription.trim(),
          sport: formSport.toLowerCase(),
          author: formAuthor.trim(),
          authorPhoto: formAuthorPhoto.trim(),
          duration: formDuration.trim(),
          videoUrl: formVideoUrl.trim(),
          url: formVideoUrl.trim(),
          thumbnailUrl: formThumbnailUrl.trim(),
          isScheduled: formIsScheduled,
          ...(scheduledAtMs ? { scheduledAt: scheduledAtMs, scheduledTimeMs: scheduledAtMs } : {}),
        };

        if (editVideo) {
          const res = await axios.put("/api/flipLong", payload);
          if (res.data.success) {
            showToast("Video updated successfully!");
            setEditVideo(null);
            await fetchVideos();
          }
        } else {
          const res = await axios.post("/api/flipLong", payload);
          if (res.data.success) {
            showToast("Video published successfully!");
            setCreateModalOpen(false);
            await fetchVideos();
          }
        }
      }
    } catch (err: any) {
      console.error("Save failed:", err);
      showToast(err.response?.data?.error || err.message || "Failed to save video", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Video
  const handleConfirmDelete = async () => {
    if (!deleteVideo) return;
    setActionLoading(true);

    try {
      const res = await axios.delete(`/api/flipLong?id=${encodeURIComponent(deleteVideo.id)}`);
      if (res.data.success) {
        showToast("Video permanently deleted from DynamoDB and Firestore.");
        setVideos((prev) => prev.filter((v) => v.id !== deleteVideo.id));
        setDeleteVideo(null);
      } else {
        showToast(res.data.error || "Failed to delete video", "error");
      }
    } catch (err: any) {
      console.error("Delete failed:", err);
      showToast(err.response?.data?.error || "Failed to delete video", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Client-side filtering & sorting
  const filteredVideos = useMemo(() => {
    let list = [...videos];
    const nowMs = Date.now();

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((v) => {
        const title = (v.title || "").toLowerCase();
        const desc = typeof v.description === "string" ? v.description.toLowerCase() : "";
        const author = (v.author || "").toLowerCase();
        const sport = (v.sport || "").toLowerCase();
        const id = (v.id || "").toLowerCase();
        return (
          title.includes(q) ||
          desc.includes(q) ||
          author.includes(q) ||
          sport.includes(q) ||
          id.includes(q)
        );
      });
    }

    // Sport filter
    if (selectedSport !== "all") {
      list = list.filter((v) => (v.sport || "").toLowerCase() === selectedSport.toLowerCase());
    }

    // Status filter
    if (selectedStatus === "live") {
      list = list.filter((v) => {
        const isSched = v.isScheduled === true;
        const schedTime = Number(v.scheduledAt || v.scheduledTimeMs || 0);
        return !isSched || !schedTime || schedTime <= nowMs;
      });
    } else if (selectedStatus === "scheduled") {
      list = list.filter((v) => {
        const isSched = v.isScheduled === true;
        const schedTime = Number(v.scheduledAt || v.scheduledTimeMs || 0);
        return isSched && schedTime > nowMs;
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "title") {
        return (a.title || "").localeCompare(b.title || "");
      }
      if (sortBy === "duration") {
        return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      }
      const timeA = Number(a.createdAtMs || (a.createdAt ? Date.parse(a.createdAt) : 0));
      const timeB = Number(b.createdAtMs || (b.createdAt ? Date.parse(b.createdAt) : 0));
      return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [videos, searchQuery, selectedSport, selectedStatus, sortBy]);

  // Metrics
  const metrics = useMemo(() => {
    const total = videos.length;
    const nowMs = Date.now();
    let liveCount = 0;
    let scheduledCount = 0;
    const sportSet = new Set<string>();

    videos.forEach((v) => {
      if (v.sport) sportSet.add(v.sport.toLowerCase());
      const isSched = v.isScheduled === true;
      const schedTime = Number(v.scheduledAt || v.scheduledTimeMs || 0);
      if (isSched && schedTime > nowMs) {
        scheduledCount++;
      } else {
        liveCount++;
      }
    });

    return {
      total,
      liveCount,
      scheduledCount,
      uniqueSportsCount: sportSet.size,
    };
  }, [videos]);

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 p-6 lg:p-8">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#21262d]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-2xl">🎬</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              FlipLONG Video Management
            </h1>
            <span className="text-xs bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-mono font-semibold">
              api/flipLong
            </span>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono font-semibold">
              DynamoDB + Cloudinary
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Publish, edit, preview, and manage long-form sports videos, live watch-along streams, and scheduled premieres.
          </p>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Upload New Video */}
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-950/40 border border-rose-400/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Upload New Video</span>
          </button>

          {/* Refresh */}
          <button
            onClick={fetchVideos}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#161b22] hover:bg-[#1f242c] border border-[#30363d] rounded-lg text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-rose-400" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toastMessage && (
        <div
          className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-gray-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Metrics Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-gray-600 transition-colors">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Total Videos</span>
            <Film className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.total}</div>
          <div className="text-[11px] text-gray-500 mt-1">RealTimeChat table + Firestore</div>
        </div>

        <div
          onClick={() => setSelectedStatus("live")}
          className="bg-[#161b22] border border-emerald-500/30 hover:border-emerald-400 rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold">
            <span>Published &amp; Live</span>
            <Play className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.liveCount}</div>
          <div className="text-[11px] text-emerald-400/70 mt-1">Active on SportsFan360 app</div>
        </div>

        <div
          onClick={() => setSelectedStatus("scheduled")}
          className="bg-[#161b22] border border-purple-500/30 hover:border-purple-400 rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-purple-400 font-semibold">
            <span>Scheduled Premieres</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.scheduledCount}</div>
          <div className="text-[11px] text-purple-300/70 mt-1">Future broadcast dates</div>
        </div>

        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/50 transition-colors">
          <div className="flex items-center justify-between text-xs text-blue-400 font-semibold">
            <span>Sports Covered</span>
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.uniqueSportsCount}</div>
          <div className="text-[11px] text-blue-300/70 mt-1">Distinct sport categories</div>
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
              placeholder="Search by video title, author, sport, description, or video ID..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-8 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-colors"
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

          {/* Sport Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-rose-500"
            >
              <option value="all">All Sports</option>
              {AVAILABLE_SPORTS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as any)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-rose-500"
            >
              <option value="all">All Statuses ({videos.length})</option>
              <option value="live">Live / Published ({metrics.liveCount})</option>
              <option value="scheduled">Scheduled ({metrics.scheduledCount})</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-rose-500"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="title">Title (A-Z)</option>
              <option value="duration">Longest Duration</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${
                viewMode === "grid" ? "bg-rose-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-2 transition-colors ${
                viewMode === "table" ? "bg-rose-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              title="Table View"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {(searchQuery || selectedSport !== "all" || selectedStatus !== "all") && (
          <div className="flex items-center gap-2 pt-2 border-t border-[#21262d] text-xs text-gray-400 flex-wrap">
            <span>Filtering by:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px]">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery("")} className="hover:text-white">×</button>
              </span>
            )}
            {selectedSport !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[11px]">
                Sport: {selectedSport.toUpperCase()}
                <button onClick={() => setSelectedSport("all")} className="hover:text-white">×</button>
              </span>
            )}
            {selectedStatus !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px]">
                Status: {selectedStatus.toUpperCase()}
                <button onClick={() => setSelectedStatus("all")} className="hover:text-white">×</button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedSport("all");
                setSelectedStatus("all");
              }}
              className="text-xs text-gray-500 hover:text-gray-300 ml-auto underline cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* ── Main Content: Grid or Table View ─────────────────────────────────── */}
      {loading ? (
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-16 text-center text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-rose-500" />
          <p className="text-sm font-medium">Loading FlipLONG videos from DynamoDB &amp; Firestore...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-16 text-center text-gray-400">
          <Film className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-base font-semibold text-white">No FlipLONG videos found</p>
          <p className="text-xs text-gray-500 mt-1">
            {searchQuery || selectedSport !== "all" || selectedStatus !== "all"
              ? "Try adjusting your search query or filters."
              : "Upload your first long-form sports video using the button above."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* ── GRID VIEW ───────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredVideos.map((v) => {
            const isSched = v.isScheduled === true;
            const schedTime = Number(v.scheduledAt || v.scheduledTimeMs || 0);
            const isFuture = isSched && schedTime > Date.now();
            const videoUrl = v.url || v.videoUrl || v.mediaUrl || "";
            const thumbnail = v.thumbnailUrl || "/images/video-placeholder.png";

            return (
              <div
                key={v.id}
                className="bg-[#161b22] border border-[#21262d] hover:border-gray-600 rounded-xl overflow-hidden flex flex-col group transition-all duration-200 hover:shadow-xl"
              >
                {/* Thumbnail Container */}
                <div className="relative aspect-video bg-black/60 overflow-hidden">
                  <img
                    src={thumbnail}
                    alt={v.title}
                    onError={(e) => {
                      // Fallback placeholder image
                      (e.target as HTMLElement).style.display = "none";
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Play Button Overlay */}
                  {videoUrl && (
                    <button
                      onClick={() => setPreviewVideo(v)}
                      className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-sm"
                      title="Play Video"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </button>
                  )}

                  {/* Duration Badge */}
                  {v.duration && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-white text-[11px] font-mono font-bold backdrop-blur-sm border border-white/10">
                      {v.duration}
                    </span>
                  )}

                  {/* Sport Badge */}
                  <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-black/70 text-white border border-white/20 backdrop-blur-sm">
                    {v.sport || "GENERAL"}
                  </span>

                  {/* Status Badge */}
                  {isFuture ? (
                    <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-600/90 text-white border border-purple-400/40 backdrop-blur-sm flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      SCHEDULED
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600/90 text-white border border-emerald-400/40 backdrop-blur-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white text-sm line-clamp-2 group-hover:text-rose-400 transition-colors">
                      {v.title}
                    </h3>
                    {v.description && (
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                        {typeof v.description === "string" ? v.description : JSON.stringify(v.description)}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#21262d] space-y-2 text-[11px] text-gray-400">
                    {/* Author Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {v.authorPhoto ? (
                          <img
                            src={v.authorPhoto}
                            alt={v.author}
                            className="w-5 h-5 rounded-full object-cover border border-gray-700"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-300 flex items-center justify-center font-bold text-[10px]">
                            {(v.author || "S").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-gray-300 font-medium truncate max-w-[120px]">
                          {v.author || "SportsFan"}
                        </span>
                      </div>
                      <span>{formatRelativeTime(v.createdAt || v.createdAtMs)}</span>
                    </div>

                    {/* Scheduled Notice */}
                    {isFuture && (
                      <div className="text-[10.5px] text-purple-300 bg-purple-950/30 border border-purple-500/20 rounded px-2 py-1 flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="truncate">Premiere: {formatDisplayDate(schedTime)}</span>
                      </div>
                    )}

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1 text-gray-500">
                        <span className="font-mono text-[10px]">ID: {v.id.slice(0, 8)}...</span>
                        <button
                          onClick={() => handleCopy(v.id, `id_${v.id}`)}
                          className="hover:text-gray-300"
                          title="Copy Video ID"
                        >
                          {copiedId === `id_${v.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Play Video */}
                        {videoUrl && (
                          <button
                            onClick={() => setPreviewVideo(v)}
                            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition cursor-pointer"
                            title="Play Video"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}

                        {/* Open Video in New Tab */}
                        {videoUrl && (
                          <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                            title="Open video URL in new tab"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}

                        {/* Edit Video */}
                        <button
                          onClick={() => handleOpenEdit(v)}
                          className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition cursor-pointer"
                          title="Edit Video"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>

                        {/* Delete Video */}
                        <button
                          onClick={() => setDeleteVideo(v)}
                          className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                          title="Delete Video"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── TABLE VIEW ──────────────────────────────────────────────────────── */
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0d1117] border-b border-[#21262d] uppercase tracking-wider text-[11px] text-gray-400 font-semibold select-none">
                <tr>
                  <th className="w-12 px-4 py-3.5 text-center">#</th>
                  <th className="px-4 py-3.5">Video</th>
                  <th className="px-4 py-3.5">Sport</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">Author</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {filteredVideos.map((v, idx) => {
                  const isSched = v.isScheduled === true;
                  const schedTime = Number(v.scheduledAt || v.scheduledTimeMs || 0);
                  const isFuture = isSched && schedTime > Date.now();
                  const videoUrl = v.url || v.videoUrl || v.mediaUrl || "";
                  const thumbnail = v.thumbnailUrl || "/images/video-placeholder.png";

                  return (
                    <tr key={v.id} className="hover:bg-[#1c2128] transition-colors">
                      <td className="px-4 py-3.5 text-center text-gray-500 font-mono">
                        {idx + 1}
                      </td>

                      {/* Video info */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() => videoUrl && setPreviewVideo(v)}
                            className="w-16 h-10 rounded bg-black/60 overflow-hidden relative shrink-0 cursor-pointer group/thumb border border-gray-800"
                          >
                            <img
                              src={thumbnail}
                              alt={v.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                              <Play className="w-4 h-4 text-white fill-current" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate max-w-xs sm:max-w-md">
                              {v.title}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono flex items-center gap-1.5 mt-0.5">
                              <span>ID: {v.id.slice(0, 10)}...</span>
                              <button
                                onClick={() => handleCopy(v.id, `tbl_${v.id}`)}
                                className="hover:text-gray-300"
                              >
                                {copiedId === `tbl_${v.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Sport */}
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-800 text-gray-300 border border-gray-700">
                          {v.sport || "GENERAL"}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3.5 font-mono text-gray-300">
                        {v.duration || "–"}
                      </td>

                      {/* Author */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-gray-300">
                          <User className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          <span className="truncate">{v.author || "SportsFan"}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {isFuture ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            <Clock className="w-3 h-3 text-purple-400" />
                            SCHEDULED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <Play className="w-3 h-3 text-emerald-400 fill-current" />
                            LIVE
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {videoUrl && (
                            <button
                              onClick={() => setPreviewVideo(v)}
                              className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition cursor-pointer"
                              title="Play Video"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEdit(v)}
                            className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition cursor-pointer"
                            title="Edit Video"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteVideo(v)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                            title="Delete Video"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: Video Preview Player ───────────────────────────────────────── */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-white text-base truncate max-w-xl">
                  {previewVideo.title}
                </h3>
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                className="text-gray-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player */}
            <div className="bg-black aspect-video flex items-center justify-center">
              <video
                src={previewVideo.url || previewVideo.videoUrl || previewVideo.mediaUrl}
                poster={previewVideo.thumbnailUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              >
                Your browser does not support HTML5 video playback.
              </video>
            </div>

            {/* Footer Details */}
            <div className="p-4 bg-[#0d1117] flex items-center justify-between text-xs text-gray-400 border-t border-[#21262d]">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-bold uppercase text-[10px]">
                  {previewVideo.sport || "GENERAL"}
                </span>
                <span>Author: <strong className="text-white">{previewVideo.author || "SportsFan"}</strong></span>
                {previewVideo.duration && <span>Duration: <strong className="text-white">{previewVideo.duration}</strong></span>}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewVideo.url || previewVideo.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-gray-200 rounded-lg transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Video URL</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Create / Edit Video ────────────────────────────────────────── */}
      {(createModalOpen || editVideo) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d] bg-[#0d1117]">
              <div className="flex items-center gap-2.5">
                <Film className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-white text-base">
                  {editVideo ? "Edit FlipLONG Video" : "Upload New FlipLONG Video"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setCreateModalOpen(false);
                  setEditVideo(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveVideo} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Video Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. IND vs SL 3rd ODI Highlights & Post Match Debrief"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Detailed breakdown, key player insights, match takeaways..."
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              {/* Sport & Duration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Sport Category
                  </label>
                  <select
                    value={formSport}
                    onChange={(e) => setFormSport(e.target.value)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-rose-500"
                  >
                    {AVAILABLE_SPORTS.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Duration (e.g. 10:45)
                  </label>
                  <input
                    type="text"
                    value={formDuration}
                    onChange={(e) => setFormDuration(e.target.value)}
                    placeholder="e.g. 15:30"
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Author Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Author / Creator Name
                  </label>
                  <input
                    type="text"
                    value={formAuthor}
                    onChange={(e) => setFormAuthor(e.target.value)}
                    placeholder="e.g. SportsFan Host"
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                    Author Avatar URL
                  </label>
                  <input
                    type="url"
                    value={formAuthorPhoto}
                    onChange={(e) => setFormAuthorPhoto(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Video Source */}
              <div className="pt-2 border-t border-[#21262d] space-y-3">
                <div className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                  <Video className="w-4 h-4 text-rose-500" />
                  <span>Video Media Source</span>
                </div>

                {/* Option 1: File upload */}
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">
                    Upload Video File (Cloudinary MP4/MOV)
                  </label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      setFormVideoFile(file);
                    }}
                    className="w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-rose-600 file:text-white hover:file:bg-rose-500 file:cursor-pointer bg-[#0d1117] border border-[#30363d] rounded-lg p-1.5"
                  />
                  {formVideoFile && (
                    <p className="text-[11px] text-emerald-400 mt-1">
                      Selected: {formVideoFile.name} ({(formVideoFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </p>
                  )}
                </div>

                {/* Option 2: Direct Video URL */}
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">
                    Or Direct Video URL (Existing Cloudinary or CDN URL)
                  </label>
                  <input
                    type="url"
                    value={formVideoUrl}
                    onChange={(e) => setFormVideoUrl(e.target.value)}
                    placeholder="https://res.cloudinary.com/.../video.mp4"
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500"
                  />
                </div>

                {/* Thumbnail URL */}
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">
                    Custom Poster Thumbnail URL
                  </label>
                  <input
                    type="url"
                    value={formThumbnailUrl}
                    onChange={(e) => setFormThumbnailUrl(e.target.value)}
                    placeholder="https://res.cloudinary.com/.../thumbnail.jpg"
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3.5 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Scheduling Section */}
              <div className="pt-3 border-t border-[#21262d] space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="scheduleToggle"
                    checked={formIsScheduled}
                    onChange={(e) => setFormIsScheduled(e.target.checked)}
                    className="rounded border-[#30363d] text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="scheduleToggle" className="text-xs font-semibold text-gray-300 cursor-pointer">
                    Schedule for Future Premiere / Release
                  </label>
                </div>

                {formIsScheduled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#0d1117] p-3 rounded-lg border border-[#21262d]">
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Premiere Date</label>
                      <input
                        type="date"
                        value={formScheduledDate}
                        onChange={(e) => setFormScheduledDate(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-400 mb-1">Premiere Time</label>
                      <input
                        type="time"
                        value={formScheduledTime}
                        onChange={(e) => setFormScheduledTime(e.target.value)}
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Buttons */}
              <div className="pt-4 border-t border-[#21262d] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setEditVideo(null);
                  }}
                  disabled={actionLoading}
                  className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50 shadow-md shadow-rose-950/40"
                >
                  {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editVideo ? "Save Changes" : "Publish FlipLONG Video"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: Delete Confirmation ────────────────────────────────────────── */}
      {deleteVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#161b22] border border-rose-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-4">
              <div className="p-2.5 rounded-full bg-rose-500/10 border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete FlipLONG Video</h3>
                <p className="text-xs text-gray-400">Irreversible DynamoDB &amp; Firestore deletion</p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white">"{deleteVideo.title}"</strong>?
              This will remove the video record from the RealTimeChat table and feed.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteVideo(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlipLongManagementPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-gray-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin text-rose-500" />
            <span>Loading FlipLONG Video Management...</span>
          </div>
        </div>
      }
    >
      <FlipLongManagementContent />
    </Suspense>
  );
}
