"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import axios from "axios";
import {
  Search,
  RefreshCw,
  Trash2,
  Play,
  Plus,
  Video,
  X,
  Film,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  List as ListIcon,
  FileVideo,
  Pencil,
  Info,
  HelpCircle,
} from "lucide-react";

export interface FlipLongVideoItem {
  id: string;
  videoId?: string;
  title: string;
  description?: string;
  fileName?: string;
  url?: string;
  videoUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  resourceType?: "image" | "video";
  duration?: string;
  durationSeconds?: number;
  sport?: string;
  size?: number;
  sizeFormatted?: string;
  format?: string;
  likes?: number;
  createdAt?: number | string;
  updatedAt?: number | string;
}

const SPORTS_TABS: Array<{ id: string; label: string; emoji: string }> = [
  { id: "cricket", label: "Cricket", emoji: "🏏" },
  { id: "football", label: "Football", emoji: "⚽" },
  { id: "athletics", label: "Athletics", emoji: "🏃" },
  { id: "others", label: "Others", emoji: "🌐" },
];

export default function FlipLongManagementPage() {
  const [videos, setVideos] = useState<FlipLongVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSportFilter, setSelectedSportFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Create Video Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState("cricket");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{ title: string; detail: string; hint?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Video Modal State
  const [editingVideo, setEditingVideo] = useState<FlipLongVideoItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSport, setEditSport] = useState("cricket");
  const [editSaving, setEditSaving] = useState(false);

  // Preview & Delete Modals
  const [deleteVideo, setDeleteVideo] = useState<FlipLongVideoItem | null>(null);
  const [previewVideo, setPreviewVideo] = useState<FlipLongVideoItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast / Feedback
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ─── Helper to extract a normalized canonical key from URL/filename/ID ───
  const getVideoCanonicalKey = (v: FlipLongVideoItem): string => {
    const url = (v.url || v.videoUrl || v.mediaUrl || "").trim().toLowerCase();
    if (url) {
      const cleanUrl = url.split("?")[0].split("#")[0];
      const withoutVersion = cleanUrl.replace(/\/v\d+\//, "/");
      const parts = withoutVersion.split("/");
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        return lastPart.replace(/\.[^/.]+$/, "").trim();
      }
    }
    if (v.fileName) {
      return v.fileName.toLowerCase().replace(/\.[^/.]+$/, "").trim();
    }
    return (v.id || v.videoId || "").trim().toLowerCase();
  };

  // ─── Fetch All Videos (Both Database FlipLONG and Legacy Media) ───────────
  const fetchVideos = async () => {
    try {
      setRefreshing(true);
      const combinedMap = new Map<string, FlipLongVideoItem>();
      const seenCanonicalKeys = new Set<string>();

      // 1. Fetch Primary FlipLONG DB Endpoint
      try {
        const res = await axios.get("/api/flipLong?limit=100");
        const list: FlipLongVideoItem[] = res.data?.videos || res.data?.mediaFiles || (Array.isArray(res.data) ? res.data : []);
        list.forEach((v) => {
          const idKey = (v.id || v.videoId || "").trim().toLowerCase();
          const canonKey = getVideoCanonicalKey(v);

          if (idKey) combinedMap.set(idKey, v);
          else if (canonKey) combinedMap.set(canonKey, v);

          if (canonKey) seenCanonicalKeys.add(canonKey);
          if (idKey) seenCanonicalKeys.add(idKey);
        });
      } catch (err) {
        console.warn("Primary flipLong fetch notice:", err);
      }

      // 2. Fetch Legacy Cloudinary / Cricket Media to ensure no previous videos are missed
      try {
        const fallbackRes = await axios.get("/api/cloudinary/cricket-media");
        const fallbackList: FlipLongVideoItem[] = fallbackRes.data?.mediaFiles || [];
        fallbackList.forEach((v) => {
          const canonKey = getVideoCanonicalKey(v);
          const rawId = (v.id || v.videoId || "").trim().toLowerCase();

          // If this video already exists in the primary database, skip it to prevent duplicates
          if (canonKey && seenCanonicalKeys.has(canonKey)) return;
          if (rawId && seenCanonicalKeys.has(rawId)) return;

          const key = rawId || canonKey;
          if (key && !combinedMap.has(key)) {
            if (canonKey) seenCanonicalKeys.add(canonKey);
            if (rawId) seenCanonicalKeys.add(rawId);

            // Default previous untagged videos to cricket or general
            combinedMap.set(key, {
              ...v,
              sport: v.sport || "cricket",
            });
          }
        });
      } catch (err) {
        console.warn("Fallback media fetch notice:", err);
      }

      const allMerged = Array.from(combinedMap.values()).sort((a, b) => {
        const timeA = typeof a.createdAt === "number" ? a.createdAt : new Date(a.createdAt || 0).getTime();
        const timeB = typeof b.createdAt === "number" ? b.createdAt : new Date(b.createdAt || 0).getTime();
        return (timeB || 0) - (timeA || 0);
      });

      setVideos(allMerged);
    } catch (err: any) {
      console.error("Failed to load FlipLONG videos:", err);
      showToast(err?.response?.data?.error || err.message || "Failed to load videos", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // ─── File Selection ───────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (500MB)
    if (file.size > 500 * 1024 * 1024) {
      setUploadError({
        title: "File Too Large",
        detail: `Selected file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum allowed size is 500MB.`,
        hint: "Please compress the video or select a smaller clip.",
      });
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setFilePreview(objectUrl);

    // Auto-populate title if empty
    if (!title.trim()) {
      const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
    }
  };

  // ─── Create & Upload FlipLONG Video with Detailed Error Diagnostics ───────
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);

    if (!title.trim()) {
      setUploadError({
        title: "Title Required",
        detail: "Please enter a title for the FlipLONG video.",
      });
      return;
    }

    if (!selectedFile) {
      setUploadError({
        title: "No Video File Selected",
        detail: "Please choose a video file (.mp4, .mov, .webm) to upload.",
      });
      return;
    }

    if (description.length > 80) {
      setUploadError({
        title: "Description Too Long",
        detail: `Description is ${description.length} characters long. Maximum allowed is 80 characters.`,
      });
      return;
    }

    setUploading(true);
    setUploadProgress("Uploading video and processing media...");

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("sport", sport.toLowerCase());
      formData.append("file", selectedFile);
      formData.append("fileName", selectedFile.name);

      const res = await axios.post("/api/flipLong", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000, // 2-minute upload timeout
      });

      if (res.data?.success) {
        showToast("FlipLONG video uploaded and published successfully!", "success");
        setShowCreateModal(false);
        // Reset form
        setTitle("");
        setDescription("");
        setSport("cricket");
        setSelectedFile(null);
        if (filePreview) URL.revokeObjectURL(filePreview);
        setFilePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchVideos();
      } else {
        throw new Error(res.data?.error || "Failed to create video");
      }
    } catch (err: any) {
      console.error("Upload failed:", err);

      let errorTitle = "Upload Failed";
      let errorDetail = "An unexpected error occurred while uploading the video.";
      let errorHint = "Please check your network connection and try again.";

      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        errorTitle = "Upload Timed Out";
        errorDetail = "The file upload took too long to complete.";
        errorHint = "Try uploading a shorter video or check your internet connection speed.";
      } else if (err.response?.status === 413 || err.message?.includes("Payload Too Large")) {
        errorTitle = "File Exceeds Server Payload Limit";
        errorDetail = "The uploaded video file is larger than the server request body limit.";
        errorHint = "Please upload a video smaller than 100MB or compress it before uploading.";
      } else if (err.response?.data?.error) {
        errorDetail = err.response.data.error;
        if (errorDetail.includes("Cloudinary") || errorDetail.includes("credentials")) {
          errorTitle = "Cloud Storage Config Error";
          errorHint = "Please ensure CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET environment variables are set.";
        }
      } else if (err.message) {
        errorDetail = err.message;
      }

      setUploadError({
        title: errorTitle,
        detail: errorDetail,
        hint: errorHint,
      });
      showToast(errorDetail, "error");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // ─── Open Edit Modal ──────────────────────────────────────────────────────
  const handleOpenEdit = (video: FlipLongVideoItem) => {
    setEditingVideo(video);
    setEditTitle(video.title || "");
    setEditDescription(video.description || "");
    const existingSport = (video.sport || "cricket").toLowerCase();
    const isKnown = SPORTS_TABS.some((s) => s.id === existingSport);
    setEditSport(isKnown ? existingSport : "others");
  };

  // ─── Save Edit ────────────────────────────────────────────────────────────
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideo) return;

    if (!editTitle.trim()) {
      showToast("Title is required", "error");
      return;
    }

    if (editDescription.length > 80) {
      showToast("Description cannot exceed 80 characters", "error");
      return;
    }

    setEditSaving(true);
    try {
      const targetId = editingVideo.id || editingVideo.videoId || "";
      const payload = {
        id: targetId,
        title: editTitle.trim(),
        description: editDescription.trim(),
        sport: editSport.toLowerCase(),
      };

      const res = await axios.put("/api/flipLong", payload);
      if (res.data?.success) {
        showToast("Video details updated successfully!", "success");
        setEditingVideo(null);
        fetchVideos();
      } else {
        throw new Error(res.data?.error || "Failed to update video");
      }
    } catch (err: any) {
      console.error("Update failed:", err);
      showToast(err?.response?.data?.error || err.message || "Failed to update video", "error");
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Delete Video ─────────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deleteVideo) return;
    setActionLoading(true);

    try {
      const targetId = deleteVideo.id || deleteVideo.videoId || "";
      const targetUrl = deleteVideo.url || deleteVideo.videoUrl || deleteVideo.mediaUrl || "";
      const canonicalKey = getVideoCanonicalKey(deleteVideo);

      const res = await axios.delete("/api/flipLong", {
        params: {
          id: targetId,
          url: targetUrl,
          publicId: targetId.startsWith("IndvsSl/") ? targetId : undefined,
        },
      });

      if (res.data?.success) {
        showToast(`"${deleteVideo.title}" deleted successfully.`);
        // Remove from local state immediately
        setVideos((prev) =>
          prev.filter((v) => {
            const vId = (v.id || v.videoId || "").trim().toLowerCase();
            const vUrl = (v.url || v.videoUrl || v.mediaUrl || "").trim().toLowerCase();
            const vCanon = getVideoCanonicalKey(v);

            if (targetId && vId === targetId.toLowerCase()) return false;
            if (targetUrl && vUrl === targetUrl.toLowerCase()) return false;
            if (canonicalKey && vCanon === canonicalKey) return false;
            return true;
          })
        );
        setDeleteVideo(null);
        // Refresh to guarantee sync
        setTimeout(() => {
          fetchVideos();
        }, 500);
      } else {
        showToast(res.data?.error || "Failed to delete video", "error");
      }
    } catch (err: any) {
      console.error("Delete failed:", err);
      showToast(err?.response?.data?.error || err.message || "Failed to delete video", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ─── Filtered Videos Logic (Shows all previous + new videos) ──────────────
  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      // 1. Filter by Sport Tab
      if (selectedSportFilter !== "all") {
        const vSport = (v.sport || "").toLowerCase().trim();
        if (selectedSportFilter === "cricket") {
          // If sport is cricket or previous default
          const isCricket = vSport === "cricket" || !vSport || vSport === "general";
          if (!isCricket) return false;
        } else if (selectedSportFilter === "football") {
          if (vSport !== "football") return false;
        } else if (selectedSportFilter === "athletics") {
          if (vSport !== "athletics") return false;
        } else if (selectedSportFilter === "others") {
          const isStandard = ["cricket", "football", "athletics"].includes(vSport);
          if (isStandard && vSport !== "") return false;
        }
      }

      // 2. Filter by Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (v.title || "").toLowerCase().includes(q);
        const descMatch = (v.description || "").toLowerCase().includes(q);
        const idMatch = (v.id || v.videoId || "").toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !idMatch) return false;
      }

      return true;
    });
  }, [videos, selectedSportFilter, searchQuery]);

  // Format date helper
  const formatDate = (raw?: number | string) => {
    if (!raw) return "Recent";
    const ts = typeof raw === "number" ? raw : new Date(raw).getTime();
    if (isNaN(ts) || ts <= 0) return "Recent";
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 p-6 lg:p-8 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-6 right-6 z-[99999] px-5 py-3 rounded-xl text-xs font-bold text-white shadow-2xl flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === "success"
              ? "bg-emerald-600/95 border border-emerald-400/40"
              : "bg-red-600/95 border border-red-400/40"
          }`}
        >
          {toastMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#21262d]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-2 rounded-xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 border border-rose-500/30 text-rose-400">
              <Film size={20} />
            </span>
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">
              FlipLONG Video Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/15 text-rose-300 border border-rose-500/30 uppercase tracking-wider">
              {videos.length} TOTAL VIDEOS
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Manage all video stories (including previously uploaded videos and new sports-categorized clips).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchVideos}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] text-xs font-semibold text-gray-300 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-rose-400" : ""} />
            <span>Refresh All</span>
          </button>

          <button
            onClick={() => {
              setUploadError(null);
              setShowCreateModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/25 transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={15} />
            <span>Upload New Video</span>
          </button>
        </div>
      </div>

      {/* Sports Filter Tabs & Search Bar */}
      <div className="mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Sports Tabs (All, Cricket, Football, Athletics, Others) */}
        <div className="flex items-center gap-1.5 p-1 bg-[#161b22] border border-[#21262d] rounded-xl overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSelectedSportFilter("all")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedSportFilter === "all"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <span>All Sports</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30">
              {videos.length}
            </span>
          </button>

          {SPORTS_TABS.map((tab) => {
            const count = videos.filter((v) => {
              const vSport = (v.sport || "").toLowerCase().trim();
              if (tab.id === "cricket") return vSport === "cricket" || !vSport || vSport === "general";
              if (tab.id === "football") return vSport === "football";
              if (tab.id === "athletics") return vSport === "athletics";
              if (tab.id === "others") return !["cricket", "football", "athletics"].includes(vSport) && vSport !== "";
              return false;
            }).length;

            return (
              <button
                key={tab.id}
                onClick={() => setSelectedSportFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  selectedSportFilter === tab.id
                    ? "bg-rose-600 text-white shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search & View Toggle */}
        <div className="flex items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Search title, desc, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#161b22] border border-[#30363d] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-all"
            />
          </div>

          <div className="flex items-center p-0.5 bg-[#161b22] border border-[#30363d] rounded-lg">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === "grid" ? "bg-rose-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              title="Grid View"
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === "table" ? "bg-rose-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              title="Table View"
            >
              <ListIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Videos List / Grid */}
      <div className="mt-6">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-500">
            <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold">Loading all FlipLONG videos...</span>
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="py-20 rounded-2xl bg-[#161b22]/50 border border-[#21262d] flex flex-col items-center justify-center text-center p-8">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
              <Film size={22} />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">No Videos in this Category</h3>
            <p className="text-xs text-gray-400 max-w-sm mb-4">
              {searchQuery
                ? `No videos matched "${searchQuery}".`
                : "No videos found for this tab. Click 'All Sports' to view all previous videos or upload a new one."}
            </p>
            <button
              onClick={() => {
                setUploadError(null);
                setShowCreateModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Plus size={14} />
              <span>Upload Video</span>
            </button>
          </div>
        ) : viewMode === "grid" ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredVideos.map((video) => {
              const videoId = video.id || video.videoId || "";
              const videoUrl = video.url || video.videoUrl || video.mediaUrl || "";
              const thumbUrl = video.thumbnailUrl || (videoUrl ? videoUrl.replace(/\.[^/.]+$/, ".jpg") : "");
              const vSport = (video.sport || "cricket").toLowerCase();
              const sportObj = SPORTS_TABS.find((s) => s.id === vSport) || { emoji: "🏏", label: vSport || "Cricket" };

              return (
                <div
                  key={videoId}
                  className="group rounded-2xl bg-[#161b22] border border-[#21262d] hover:border-rose-500/40 overflow-hidden flex flex-col shadow-md transition-all duration-200 hover:-translate-y-0.5"
                >
                  {/* Thumbnail / Video Player Preview */}
                  <div className="relative aspect-video bg-black/60 overflow-hidden">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e: any) => {
                          e.target.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <FileVideo size={36} />
                      </div>
                    )}

                    {/* Play Button Overlay */}
                    <button
                      onClick={() => setPreviewVideo(video)}
                      className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-black/60 hover:bg-rose-600 border border-white/20 text-white flex items-center justify-center transition-all cursor-pointer backdrop-blur-sm group-hover:scale-110"
                      title="Play Preview"
                    >
                      <Play size={16} className="ml-0.5" fill="currentColor" />
                    </button>

                    {/* Sport Badge Overlay */}
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white flex items-center gap-1">
                      <span>{sportObj.emoji}</span>
                      <span className="capitalize">{sportObj.label}</span>
                    </div>

                    {/* Duration Badge Overlay */}
                    {video.duration && (
                      <div className="absolute bottom-2.5 right-2.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono font-bold text-gray-200">
                        {video.duration}
                      </div>
                    )}
                  </div>

                  {/* Body Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-black text-white line-clamp-1 group-hover:text-rose-400 transition-colors">
                        {video.title}
                      </h4>
                      {video.description ? (
                        <p className="text-[11px] text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                          {video.description}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-600 italic mt-1">No description</p>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-gray-400">
                      <span>{formatDate(video.createdAt)}</span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(video)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
                          title="Edit Title & Description"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteVideo(video)}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                          title="Delete Video"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="rounded-2xl bg-[#161b22] border border-[#21262d] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-[#0d1117] text-gray-400 uppercase text-[10px] font-bold border-b border-[#21262d]">
                  <tr>
                    <th className="py-3 px-4">Video</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Sport</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {filteredVideos.map((video) => {
                    const videoId = video.id || video.videoId || "";
                    const vSport = (video.sport || "cricket").toLowerCase();
                    const sportObj = SPORTS_TABS.find((s) => s.id === vSport) || { emoji: "🏏", label: vSport || "Cricket" };

                    return (
                      <tr key={videoId} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4">
                          <button
                            onClick={() => setPreviewVideo(video)}
                            className="w-12 h-8 rounded-lg bg-black/60 border border-white/10 overflow-hidden flex items-center justify-center group relative cursor-pointer"
                          >
                            {video.thumbnailUrl ? (
                              <img src={video.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Play size={12} className="text-gray-400 group-hover:text-rose-400" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-bold text-white max-w-[200px] truncate">
                          {video.title}
                        </td>
                        <td className="py-3 px-4 text-gray-400 max-w-[240px] truncate">
                          {video.description || "—"}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-gray-200 inline-flex items-center gap-1">
                            <span>{sportObj.emoji}</span>
                            <span className="capitalize">{sportObj.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-300">
                          {video.duration || "—"}
                        </td>
                        <td className="py-3 px-4 text-gray-400 whitespace-nowrap">
                          {formatDate(video.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(video)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white cursor-pointer"
                              title="Edit"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => setDeleteVideo(video)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={12} />
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
      </div>

      {/* ─── MODAL: CREATE FLIPLONG VIDEO ─────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-8">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Film size={16} />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">Upload FlipLONG Video</h3>
                  <p className="text-[10px] text-gray-400">Add a new video story to FlipLONG</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Error Diagnostics Alert Box */}
            {uploadError && (
              <div className="m-5 mb-0 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-left space-y-1.5 animate-in fade-in">
                <div className="flex items-center gap-2 text-xs font-black text-red-400">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{uploadError.title}</span>
                </div>
                <p className="text-[11px] text-red-200/90 leading-relaxed pl-5">
                  {uploadError.detail}
                </p>
                {uploadError.hint && (
                  <div className="flex items-center gap-1.5 text-[10px] text-amber-300 font-medium pl-5 pt-0.5">
                    <Info size={12} className="shrink-0" />
                    <span><strong>Tip:</strong> {uploadError.hint}</span>
                  </div>
                )}
              </div>
            )}

            {/* Modal Form */}
            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              {/* 1. Title (Required) */}
              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1.5">
                  Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Virat Kohli 82* vs Pakistan Highlights"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (uploadError) setUploadError(null);
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-all font-semibold"
                  required
                />
              </div>

              {/* 2. Description (Optional, Max 80 Chars) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-200">
                    Description <span className="text-gray-500 font-normal">(Optional)</span>
                  </label>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      description.length > 70 ? "text-amber-400" : "text-gray-500"
                    }`}
                  >
                    {description.length}/80 chars
                  </span>
                </div>
                <textarea
                  placeholder="Short tagline or summary (max 80 characters)..."
                  maxLength={80}
                  rows={2}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (uploadError) setUploadError(null);
                  }}
                  className="w-full px-3.5 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-all resize-none"
                />
              </div>

              {/* 3. Sports Tabs (Cricket, Football, Athletics, Others) */}
              <div>
                <label className="text-xs font-bold text-gray-200 block mb-2">
                  Select Sport <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {SPORTS_TABS.map((tab) => {
                    const isSelected = sport === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSport(tab.id)}
                        className={`py-2 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/25"
                            : "bg-[#0d1117] border-[#30363d] text-gray-300 hover:bg-white/5"
                        }`}
                      >
                        <span className="text-base">{tab.emoji}</span>
                        <span className="text-[11px]">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Video File Upload */}
              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1.5">
                  Video File <span className="text-rose-400">*</span>
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                    selectedFile
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : "border-[#30363d] hover:border-rose-500/60 bg-[#0d1117]"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {selectedFile ? (
                    <div className="flex items-center justify-between gap-3 text-left">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <Video size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{selectedFile.name}</p>
                          <p className="text-[10px] text-gray-400">
                            {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full shrink-0">
                        Selected ✓
                      </span>
                    </div>
                  ) : (
                    <div className="py-2 flex flex-col items-center justify-center gap-1.5">
                      <UploadCloud size={24} className="text-rose-400" />
                      <p className="text-xs font-bold text-gray-200">
                        Click or drag video to upload
                      </p>
                      <p className="text-[10px] text-gray-500">
                        Supports MP4, MOV, WebM, MKV (Up to 500MB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Progress Bar */}
              {uploading && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-rose-300">
                    <span className="flex items-center gap-1.5">
                      <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                      <span>{uploadProgress || "Uploading..."}</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={uploading}
                  className="px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !title.trim() || !selectedFile}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-xs font-black shadow-lg shadow-rose-600/30 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {uploading ? "Uploading Video..." : "Publish Video"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: EDIT FLIPLONG VIDEO ───────────────────────────────────────── */}
      {editingVideo && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Pencil size={14} className="text-rose-400" />
                <span>Edit Video Details</span>
              </h3>
              <button
                onClick={() => setEditingVideo(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {/* Title */}
              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1.5">
                  Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-200">
                    Description <span className="text-gray-500 font-normal">(Max 80 chars)</span>
                  </label>
                  <span className="text-[10px] font-mono text-gray-500">
                    {editDescription.length}/80
                  </span>
                </div>
                <textarea
                  maxLength={80}
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
                />
              </div>

              {/* Sport Selector */}
              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1.5">Sport</label>
                <div className="grid grid-cols-4 gap-2">
                  {SPORTS_TABS.map((tab) => {
                    const isSelected = editSport === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setEditSport(tab.id)}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-bold flex flex-col items-center gap-0.5 cursor-pointer ${
                          isSelected
                            ? "bg-rose-600 border-rose-500 text-white"
                            : "bg-[#0d1117] border-[#30363d] text-gray-300"
                        }`}
                      >
                        <span>{tab.emoji}</span>
                        <span className="text-[10px]">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingVideo(null)}
                  className="px-4 py-2 rounded-xl bg-[#21262d] text-xs font-semibold text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving || !editTitle.trim()}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black disabled:opacity-50"
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: PREVIEW VIDEO ─────────────────────────────────────────────── */}
      {previewVideo && (
        <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-[#21262d] flex items-center justify-between">
              <div className="min-w-0 pr-4">
                <h3 className="text-sm font-black text-white truncate">{previewVideo.title}</h3>
                {previewVideo.description && (
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {previewVideo.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="aspect-video bg-black flex items-center justify-center">
              <video
                src={previewVideo.url || previewVideo.videoUrl || previewVideo.mediaUrl}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: CONFIRM DELETE ────────────────────────────────────────────── */}
      {deleteVideo && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-red-500/30 rounded-2xl w-full max-w-sm p-5 text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto">
              <Trash2 size={22} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Delete FlipLONG Video?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Are you sure you want to delete <strong className="text-white">"{deleteVideo.title}"</strong>? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setDeleteVideo(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-xs font-semibold text-gray-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
