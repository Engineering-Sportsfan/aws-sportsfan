"use client";

import { useEffect, useState, useMemo, Suspense, useRef } from "react";
import axios from "axios";
import {
  Search,
  RefreshCw,
  Trash2,
  Play,
  Plus,
  Video,
  Eye,
  X,
  ExternalLink,
  Copy,
  Check,
  Filter,
  Film,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  SlidersHorizontal,
  LayoutGrid,
  List as ListIcon,
  Image as ImageIcon,
  HardDrive,
  FileVideo,
  Maximize2,
} from "lucide-react";

export interface FlipLongVideoItem {
  id: string; // public_id
  title: string;
  fileName: string;
  url: string;
  thumbnailUrl: string;
  resourceType: "image" | "video";
  width?: number;
  height?: number;
  duration?: string;
  durationSeconds?: number;
  size: number;
  sizeFormatted: string;
  format: string;
  createdAt: string;
  createdAtFormatted: string;
}

function FlipLongManagementContent() {
  const [videos, setVideos] = useState<FlipLongVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "video" | "image">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "duration" | "size" | "title">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modals & Action States
  const [deleteVideo, setDeleteVideo] = useState<FlipLongVideoItem | null>(null);
  const [previewVideo, setPreviewVideo] = useState<FlipLongVideoItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Upload States
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ── Fetch FlipLONG Videos ─────────────────────────────────────────────────
  const fetchVideos = async (searchTerm?: string) => {
    try {
      setRefreshing(true);
      const url = searchTerm && searchTerm.trim()
        ? `/api/cloudinary/cricket-media?search=${encodeURIComponent(searchTerm.trim())}`
        : `/api/cloudinary/cricket-media`;
      const res = await axios.get(url);
      if (res.data.success) {
        setVideos(res.data.mediaFiles || []);
      } else {
        throw new Error(res.data.error || "Failed to load FlipLONG videos");
      }
    } catch (err: any) {
      console.error("Failed to load FlipLONG videos:", err);
      showToast(err.response?.data?.error || err.message || "Failed to load FlipLONG videos", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVideos();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVideos(searchQuery);
    }, 450);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Delete FlipLONG Video ─────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deleteVideo) return;
    setActionLoading(true);

    try {
      const res = await axios.delete(
        `/api/cloudinary/cricket-media?publicId=${encodeURIComponent(deleteVideo.id)}&resourceType=${deleteVideo.resourceType}`
      );
      if (res.data.success) {
        showToast(`"${deleteVideo.title}" deleted successfully.`);
        setVideos((prev) => prev.filter((v) => v.id !== deleteVideo.id));
        setDeleteVideo(null);
      } else {
        showToast(res.data.error || "Failed to delete video", "error");
      }
    } catch (err: any) {
      console.error("Delete failed:", err);
      showToast(err.response?.data?.error || err.message || "Failed to delete video", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Upload FlipLONG Video ─────────────────────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileName", file.name);

        const res = await axios.post("/api/cloudinary/cricket-media", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (res.data.success && res.data.media) {
          successCount++;
          setVideos((prev) => [res.data.media, ...prev]);
        }
      } catch (err: any) {
        console.error("Upload failed:", err);
        showToast(err.response?.data?.error || `Upload failed for ${file.name}`, "error");
      }
    }

    setUploading(false);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (successCount > 0) {
      showToast(`${successCount} FlipLONG video${successCount > 1 ? "s" : ""} uploaded successfully!`, "success");
    }
    fetchVideos(searchQuery);
  };

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Metrics ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total = videos.length;
    let videoCount = 0;
    let imageCount = 0;
    let totalBytes = 0;

    videos.forEach((v) => {
      if (v.resourceType === "video") videoCount++;
      else if (v.resourceType === "image") imageCount++;
      totalBytes += v.size || 0;
    });

    const formatBytes = (bytes: number) => {
      if (!bytes) return "0 MB";
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    };

    return {
      total,
      videoCount,
      imageCount,
      totalBytesFormatted: formatBytes(totalBytes),
    };
  }, [videos]);

  // ── Filter & Sort ─────────────────────────────────────────────────────────
  const filteredVideos = useMemo(() => {
    let list = [...videos];

    if (filterType !== "all") {
      list = list.filter((v) => v.resourceType === filterType);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (v) =>
          (v.title || "").toLowerCase().includes(q) ||
          (v.fileName || "").toLowerCase().includes(q) ||
          (v.id || "").toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      if (sortBy === "title") {
        return (a.title || "").localeCompare(b.title || "");
      }
      if (sortBy === "duration") {
        return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      }
      if (sortBy === "size") {
        return (b.size || 0) - (a.size || 0);
      }
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return sortBy === "oldest" ? timeA - timeB : timeB - timeA;
    });

    return list;
  }, [videos, filterType, searchQuery, sortBy]);

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
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Upload, preview, stream, and manage all FlipLONG sports videos.
          </p>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Upload New Video */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
            id="fliplong-upload-input"
          />
          <label
            htmlFor="fliplong-upload-input"
            className={`flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-950/40 border border-rose-400/30 transition-all cursor-pointer ${
              uploading ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>{uploading ? "Uploading..." : "Upload FlipLONG Video"}</span>
          </label>

          {/* Refresh */}
          <button
            onClick={() => fetchVideos(searchQuery)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#161b22] hover:bg-[#1f242c] border border-[#30363d] rounded-lg text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-rose-400" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Upload Progress Banner ───────────────────────────────────────────── */}
      {uploadProgress && (
        <div className="mt-4 px-4 py-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5 animate-pulse">
          <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
          <span>{uploadProgress}</span>
        </div>
      )}

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
            <span>Total FlipLONG Videos</span>
            <Film className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.total}</div>
          <div className="text-[11px] text-gray-500 mt-1">Available for sports broadcasts</div>
        </div>

        <div
          onClick={() => setFilterType("video")}
          className="bg-[#161b22] border border-purple-500/30 hover:border-purple-400 rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-purple-400 font-semibold">
            <span>Long-Form Videos</span>
            <FileVideo className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.videoCount}</div>
          <div className="text-[11px] text-purple-300/70 mt-1">Ready for FlipLONG playback</div>
        </div>

        <div
          onClick={() => setFilterType("image")}
          className="bg-[#161b22] border border-cyan-500/30 hover:border-cyan-400 rounded-xl p-4 flex flex-col justify-between transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-cyan-400 font-semibold">
            <span>Thumbnails &amp; Covers</span>
            <ImageIcon className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.imageCount}</div>
          <div className="text-[11px] text-cyan-300/70 mt-1">Video posters &amp; banners</div>
        </div>

        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/50 transition-colors">
          <div className="flex items-center justify-between text-xs text-blue-400 font-semibold">
            <span>Total Storage</span>
            <HardDrive className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.totalBytesFormatted}</div>
          <div className="text-[11px] text-blue-300/70 mt-1">Total CDN video asset size</div>
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
              placeholder="Search FlipLONG videos by title or ID..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-8 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-rose-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  fetchVideos("");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Type */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-rose-500"
            >
              <option value="all">All Media ({videos.length})</option>
              <option value="video">Videos Only ({metrics.videoCount})</option>
              <option value="image">Covers Only ({metrics.imageCount})</option>
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
              <option value="duration">Longest Duration</option>
              <option value="size">Largest File Size</option>
              <option value="title">Title (A-Z)</option>
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
        {(searchQuery || filterType !== "all") && (
          <div className="flex items-center gap-2 pt-2 border-t border-[#21262d] text-xs text-gray-400 flex-wrap">
            <span>Filtering by:</span>
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[11px]">
                Search: "{searchQuery}"
                <button
                  onClick={() => {
                    setSearchQuery("");
                    fetchVideos("");
                  }}
                  className="hover:text-white"
                >
                  ×
                </button>
              </span>
            )}
            {filterType !== "all" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[11px]">
                Type: {filterType.toUpperCase()}
                <button onClick={() => setFilterType("all")} className="hover:text-white">×</button>
              </span>
            )}
            <button
              onClick={() => {
                setSearchQuery("");
                setFilterType("all");
                fetchVideos("");
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
          <p className="text-sm font-medium">Loading FlipLONG videos...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-16 text-center text-gray-400">
          <Film className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-base font-semibold text-white">No FlipLONG videos found</p>
          <p className="text-xs text-gray-500 mt-1">
            {searchQuery || filterType !== "all"
              ? "Try adjusting your search query or filters."
              : "Upload your first long-form video using the Upload button above."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredVideos.map((v) => {
            const isVideo = v.resourceType === "video";

            return (
              <div
                key={v.id}
                className="bg-[#161b22] border border-[#21262d] hover:border-gray-600 rounded-xl overflow-hidden flex flex-col group transition-all duration-200 hover:shadow-xl"
              >
                {/* Thumbnail Container */}
                <div className="relative aspect-video bg-black/70 overflow-hidden cursor-pointer">
                  <img
                    src={v.thumbnailUrl}
                    alt={v.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Play or Zoom Preview Button Overlay */}
                  <button
                    onClick={() => setPreviewVideo(v)}
                    className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95 cursor-pointer backdrop-blur-sm border border-white/20"
                    title={isVideo ? "Play Video" : "View Image"}
                  >
                    {isVideo ? (
                      <Play className="w-5 h-5 fill-current ml-0.5 text-white" />
                    ) : (
                      <Maximize2 className="w-5 h-5 text-white" />
                    )}
                  </button>

                  {/* Format and Size Badge */}
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono font-medium backdrop-blur-sm border border-white/10">
                    {v.format.toUpperCase()} • {v.sizeFormatted}
                  </span>

                  {/* Duration Badge for Videos */}
                  {isVideo && v.duration && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/80 text-white text-[11px] font-mono font-bold backdrop-blur-sm border border-white/10">
                      {v.duration}
                    </span>
                  )}

                  {/* Type Badge */}
                  <span
                    className={`absolute top-2 left-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider backdrop-blur-sm border ${
                      isVideo
                        ? "bg-rose-600/80 text-white border-rose-400/40"
                        : "bg-blue-600/80 text-white border-blue-400/40"
                    }`}
                  >
                    {isVideo ? "VIDEO" : "COVER"}
                  </span>

                  {/* Dimensions Badge */}
                  {v.width && v.height && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-black/70 text-gray-300 text-[10px] font-mono backdrop-blur-sm border border-white/10">
                      {v.width}×{v.height}
                    </span>
                  )}
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white text-sm line-clamp-1 group-hover:text-rose-400 transition-colors" title={v.title}>
                      {v.title}
                    </h3>
                    <p className="text-[11px] text-gray-400 font-mono truncate mt-0.5" title={v.id}>
                      {v.id}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#21262d] space-y-2 text-[11px] text-gray-400">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">{v.createdAtFormatted}</span>
                      <span className="text-[10px] font-mono text-gray-500">{v.sizeFormatted}</span>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-1">
                      {/* Copy URL */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopy(v.url, `media_url_${v.id}`)}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-[#0d1117] hover:bg-[#21262d] text-gray-300 text-[10.5px] border border-[#30363d] transition cursor-pointer"
                          title="Copy Direct URL"
                        >
                          {copiedId === `media_url_${v.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy URL</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Preview */}
                        <button
                          onClick={() => setPreviewVideo(v)}
                          className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                          title="Preview Video"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Open URL */}
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition"
                          title="Open Video URL"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        {/* Delete Option */}
                        <button
                          onClick={() => setDeleteVideo(v)}
                          className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                          title="Delete FlipLONG Video"
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
        /* ── TABLE VIEW ── */
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="bg-[#0d1117] border-b border-[#21262d] uppercase tracking-wider text-[11px] text-gray-400 font-semibold select-none">
                <tr>
                  <th className="w-12 px-4 py-3.5 text-center">#</th>
                  <th className="px-4 py-3.5">Video</th>
                  <th className="px-4 py-3.5 text-center">Type</th>
                  <th className="px-4 py-3.5">Format &amp; Res</th>
                  <th className="px-4 py-3.5">Duration</th>
                  <th className="px-4 py-3.5">File Size</th>
                  <th className="px-4 py-3.5">Created Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#21262d]">
                {filteredVideos.map((v, idx) => {
                  const isVideo = v.resourceType === "video";

                  return (
                    <tr key={v.id} className="hover:bg-[#1c2128] transition-colors">
                      <td className="px-4 py-3.5 text-center text-gray-500 font-mono">
                        {idx + 1}
                      </td>

                      {/* Video Thumbnail & Name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            onClick={() => setPreviewVideo(v)}
                            className="w-16 h-10 rounded bg-black/60 overflow-hidden relative shrink-0 cursor-pointer group/thumb border border-gray-800"
                          >
                            <img
                              src={v.thumbnailUrl}
                              alt={v.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                              {isVideo ? (
                                <Play className="w-4 h-4 text-white fill-current" />
                              ) : (
                                <Maximize2 className="w-4 h-4 text-white" />
                              )}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate max-w-xs sm:max-w-md" title={v.title}>
                              {v.title}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono truncate max-w-xs mt-0.5" title={v.id}>
                              {v.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isVideo
                              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                              : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                          }`}
                        >
                          {isVideo ? "VIDEO" : "COVER"}
                        </span>
                      </td>

                      {/* Format & Dimensions */}
                      <td className="px-4 py-3.5 font-mono text-gray-300">
                        <span>{v.format.toUpperCase()}</span>
                        {v.width && v.height && (
                          <span className="text-gray-500 ml-1.5">({v.width}×{v.height})</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="px-4 py-3.5 font-mono text-gray-300">
                        {v.duration || "–"}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-3.5 font-mono text-gray-300">
                        {v.sizeFormatted}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3.5 text-gray-400 text-[11px] whitespace-nowrap">
                        {v.createdAtFormatted}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Preview */}
                          <button
                            onClick={() => setPreviewVideo(v)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                            title="Preview Video"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Copy URL */}
                          <button
                            onClick={() => handleCopy(v.url, `tbl_media_${v.id}`)}
                            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition cursor-pointer"
                            title="Copy URL"
                          >
                            {copiedId === `tbl_media_${v.id}` ? (
                              <Check className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>

                          {/* Delete Option */}
                          <button
                            onClick={() => setDeleteVideo(v)}
                            className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition cursor-pointer"
                            title="Delete FlipLONG Video"
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div className="flex items-center gap-2.5">
                {previewVideo.resourceType === "video" ? (
                  <Film className="w-5 h-5 text-rose-500" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-blue-400" />
                )}
                <div>
                  <h3 className="font-bold text-white text-sm truncate max-w-xl">
                    {previewVideo.title}
                  </h3>
                  <p className="text-[10px] text-gray-400 font-mono truncate max-w-xl">
                    {previewVideo.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                className="text-gray-400 hover:text-white p-1 rounded transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black aspect-video max-h-[65vh] flex items-center justify-center overflow-hidden">
              {previewVideo.resourceType === "video" ? (
                <video
                  src={previewVideo.url}
                  poster={previewVideo.thumbnailUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                <img
                  src={previewVideo.url}
                  alt={previewVideo.title}
                  className="max-h-[65vh] max-w-full object-contain"
                />
              )}
            </div>

            <div className="p-4 bg-[#0d1117] flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400 border-t border-[#21262d]">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300 font-bold uppercase text-[10px]">
                  {previewVideo.resourceType}
                </span>
                <span>Size: <strong className="text-white">{previewVideo.sizeFormatted}</strong></span>
                <span>Format: <strong className="text-white">{previewVideo.format.toUpperCase()}</strong></span>
                {previewVideo.duration && (
                  <span>Duration: <strong className="text-white">{previewVideo.duration}</strong></span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(previewVideo.url, `prev_url_${previewVideo.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] text-gray-200 rounded-lg transition cursor-pointer"
                >
                  {copiedId === `prev_url_${previewVideo.id}` ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>

                <a
                  href={previewVideo.url}
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

      {/* ── MODAL: Delete FlipLONG Video Confirmation ─────────────────────────── */}
      {deleteVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#161b22] border border-rose-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 mb-4">
              <div className="p-2.5 rounded-full bg-rose-500/10 border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete FlipLONG Video</h3>
                <p className="text-xs text-gray-400">Permanently delete video asset</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-[#0d1117] p-3 rounded-lg border border-[#21262d] mb-4">
              <div className="w-14 h-14 rounded overflow-hidden bg-black/60 shrink-0 border border-gray-800">
                <img
                  src={deleteVideo.thumbnailUrl}
                  alt={deleteVideo.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">{deleteVideo.title}</div>
                <div className="text-[10px] text-gray-400 font-mono truncate">{deleteVideo.id}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {deleteVideo.resourceType.toUpperCase()} • {deleteVideo.sizeFormatted} • {deleteVideo.format.toUpperCase()}
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white">"{deleteVideo.title}"</strong>?
              This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteVideo(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs font-medium transition cursor-pointer"
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
