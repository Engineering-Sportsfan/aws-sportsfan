"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Sparkles,
  Send,
  Upload,
  Image as ImageIcon,
  Video,
  FileText,
  CheckCircle2,
  Trash2,
  RefreshCw,
  Eye,
  MessageCircle,
  Heart,
  Radio,
  ExternalLink,
  Flame,
  Award,
  Layers,
  Pencil,
  X,
} from "lucide-react";

interface BotProfile {
  id: string;
  name: string;
  displayName: string;
  handle: string;
  email: string;
  role: string;
  title: string;
  badge: string;
  isVerified: boolean;
  photoUrl: string;
  bio?: string;
}

interface FlipLinePost {
  sk: string;
  id: number | string;
  author: string;
  handle?: string;
  adminPhoto?: string;
  authorPhoto?: string;
  isVerified?: boolean;
  sport: string;
  channel?: string;
  content: string;
  time?: string;
  likes: number;
  comments?: any[];
  image?: string;
  videoUrl?: string;
  mediaType?: "image" | "video";
  scoreChip?: { score: string; status: string };
  fomoMsg?: string;
  fomoCount?: number;
}

const CHANNELS = [
  { id: "cricket", label: "Cricket", emoji: "🏏", desc: "Live match discussions & cricket stats" },
  { id: "football", label: "Football", emoji: "⚽", desc: "Football fixture takes & live drops" },
  { id: "athletics", label: "Athletics", emoji: "🏃", desc: "Track, field & championship updates" },
  { id: "general", label: "General", emoji: "💬", desc: "Community banter with no sports restriction" },
];

const SUGGESTED_HASHTAGS: Record<string, string[]> = {
  cricket: ["#Cricket", "#INDvSL", "#Bumrah", "#RohitSharma", "#GalleTest", "#MatchDay"],
  football: ["#Football", "#BlueTigers", "#INDvJPN", "#Chhetri", "#GoalOfTheDay"],
  athletics: ["#Athletics", "#NeerajChopra", "#AsianGames", "#GoldMedal"],
  general: ["#General", "#SportsFan", "#Community", "#WeekendBanter", "#HotTakes"],
};

export default function FlipLineManagementPage() {
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>("bot_kabir_sharma");
  const [selectedChannel, setSelectedChannel] = useState<string>("cricket");
  const [mediaMode, setMediaMode] = useState<"text" | "text_image" | "image_only" | "video">("text");

  // Post form state
  const [content, setContent] = useState<string>("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [fomoCount, setFomoCount] = useState<number>(312);

  // Status & loading
  const [loadingBots, setLoadingBots] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Published posts feed
  const [recentPosts, setRecentPosts] = useState<FlipLinePost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [feedFilterChannel, setFeedFilterChannel] = useState<string>("all");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit Modal state
  const [editingPost, setEditingPost] = useState<FlipLinePost | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const [editChannel, setEditChannel] = useState<string>("cricket");
  const [editFomoCount, setEditFomoCount] = useState<number>(300);
  const [editFomoMsg, setEditFomoMsg] = useState<string>("");
  const [editMediaFile, setEditMediaFile] = useState<File | null>(null);
  const [editMediaPreview, setEditMediaPreview] = useState<string>("");
  const [editExistingMediaUrl, setEditExistingMediaUrl] = useState<string>("");
  const [editExistingMediaType, setEditExistingMediaType] = useState<"image" | "video" | undefined>(undefined);
  const [editRemoveMedia, setEditRemoveMedia] = useState<boolean>(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);
  const [editStatusMsg, setEditStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // 1. Fetch bots
  useEffect(() => {
    async function fetchBots() {
      try {
        setLoadingBots(true);
        const res = await fetch("/api/admin/flipline-bots");
        const data = await res.json();
        if (data.success && Array.isArray(data.bots)) {
          setBots(data.bots);
          if (data.bots.length > 0) {
            setSelectedBotId(data.bots[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load bots:", err);
      } finally {
        setLoadingBots(false);
      }
    }
    fetchBots();
  }, []);

  // 2. Fetch recent posts
  const fetchPosts = async () => {
    try {
      setLoadingPosts(true);
      const url =
        feedFilterChannel === "all"
          ? "/api/admin/flipline-posts"
          : `/api/admin/flipline-posts?channel=${feedFilterChannel}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && Array.isArray(data.posts)) {
        setRecentPosts(data.posts);
      }
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [feedFilterChannel]);

  const activeBot = bots.find((b) => b.id === selectedBotId) || bots[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreview(url);
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleAddHashtag = (tag: string) => {
    if (!content.includes(tag)) {
      setContent((prev) => (prev ? `${prev} ${tag}` : tag));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot) return;

    if (mediaMode === "text" && !content.trim()) {
      setStatusMsg({ type: "error", text: "Please enter text content for the post." });
      return;
    }
    if ((mediaMode === "image_only" || mediaMode === "text_image") && !mediaFile && !mediaPreview) {
      if (mediaMode === "image_only") {
        setStatusMsg({ type: "error", text: "Please upload an image." });
        return;
      }
    }
    if (mediaMode === "video" && !mediaFile && !mediaPreview) {
      setStatusMsg({ type: "error", text: "Please upload a video." });
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMsg(null);

      const formData = new FormData();
      formData.append("botId", activeBot.id);
      formData.append("channel", selectedChannel);
      formData.append("content", content.trim());
      formData.append("fomoCount", String(fomoCount));

      if (mediaFile) {
        formData.append("media", mediaFile);
      }

      const res = await fetch("/api/admin/flipline-posts", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setStatusMsg({
          type: "success",
          text: `🎉 Successfully published verified post as ${activeBot.name}!`,
        });
        setContent("");
        clearMedia();
        fetchPosts();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Failed to publish post" });
      }
    } catch (err) {
      console.error("Post creation error:", err);
      setStatusMsg({ type: "error", text: "Network error publishing post." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async (sk: string) => {
    if (!confirm("Are you sure you want to delete this FlipLine post?")) return;

    try {
      const res = await fetch(`/api/admin/flipline-posts?sk=${encodeURIComponent(sk)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setRecentPosts((prev) => prev.filter((p) => p.sk !== sk));
      } else {
        alert(data.error || "Failed to delete post");
      }
    } catch {
      alert("Error deleting post");
    }
  };

  // ── Edit Post Handlers ───────────────────────────────────────────────────────
  const handleOpenEditModal = (post: FlipLinePost) => {
    setEditingPost(post);
    setEditContent(post.content || "");
    setEditChannel(post.channel || post.sport || "general");
    setEditFomoCount(post.fomoCount || 300);
    setEditFomoMsg(post.fomoMsg || "");
    setEditMediaFile(null);
    setEditMediaPreview("");
    setEditRemoveMedia(false);
    setEditStatusMsg(null);

    if (post.videoUrl) {
      setEditExistingMediaUrl(post.videoUrl);
      setEditExistingMediaType("video");
    } else if (post.image) {
      setEditExistingMediaUrl(post.image);
      setEditExistingMediaType("image");
    } else {
      setEditExistingMediaUrl("");
      setEditExistingMediaType(undefined);
    }
  };

  const handleCloseEditModal = () => {
    setEditingPost(null);
    setEditMediaFile(null);
    setEditMediaPreview("");
    setEditStatusMsg(null);
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEditMediaFile(file);
    const url = URL.createObjectURL(file);
    setEditMediaPreview(url);
    setEditRemoveMedia(false);
  };

  const handleEditClearNewMedia = () => {
    setEditMediaFile(null);
    setEditMediaPreview("");
    if (editFileInputRef.current) {
      editFileInputRef.current.value = "";
    }
  };

  const handleEditRemoveExistingMedia = () => {
    setEditRemoveMedia(true);
    setEditExistingMediaUrl("");
    setEditExistingMediaType(undefined);
    handleEditClearNewMedia();
  };

  const handleEditAddHashtag = (tag: string) => {
    if (!editContent.includes(tag)) {
      setEditContent((prev) => (prev ? `${prev} ${tag}` : tag));
    }
  };

  const handleUpdatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost) return;

    if (!editContent.trim() && !editMediaFile && (!editExistingMediaUrl || editRemoveMedia)) {
      setEditStatusMsg({ type: "error", text: "Post must contain either text content or attached media." });
      return;
    }

    try {
      setIsSubmittingEdit(true);
      setEditStatusMsg(null);

      const formData = new FormData();
      formData.append("sk", editingPost.sk);
      formData.append("content", editContent.trim());
      formData.append("channel", editChannel);
      formData.append("fomoCount", String(editFomoCount));
      if (editFomoMsg) {
        formData.append("fomoMsg", editFomoMsg.trim());
      }
      if (editRemoveMedia) {
        formData.append("removeMedia", "true");
      }
      if (editMediaFile) {
        formData.append("media", editMediaFile);
      }

      const res = await fetch("/api/admin/flipline-posts", {
        method: "PUT",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.post) {
        setEditStatusMsg({
          type: "success",
          text: "🎉 Post updated successfully!",
        });

        // Update local list
        setRecentPosts((prev) =>
          prev.map((p) => (p.sk === editingPost.sk ? { ...p, ...data.post } : p))
        );

        setTimeout(() => {
          handleCloseEditModal();
        }, 1200);
      } else {
        setEditStatusMsg({ type: "error", text: data.error || "Failed to update post" });
      }
    } catch (err) {
      console.error("Post update error:", err);
      setEditStatusMsg({ type: "error", text: "Network error updating post." });
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#30363d] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-xl text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                FlipLine Bot Post Management
                <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
                  Verified Creator
                </span>
              </h1>
              <p className="text-sm text-[#8b949e]">
                Publish rich verified posts on behalf of official AI bot personalities across channels.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPosts}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded-lg text-xs font-medium text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPosts ? "animate-spin" : ""}`} />
            Refresh Feed
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Form Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Bot Profile Selector */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-xl">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-3">
              1. Select Bot Personality (Author)
            </label>

            {loadingBots ? (
              <div className="py-4 text-center text-sm text-[#8b949e]">Loading bot profiles...</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {bots.map((bot) => {
                  const isSelected = selectedBotId === bot.id;
                  return (
                    <button
                      key={bot.id}
                      type="button"
                      onClick={() => setSelectedBotId(bot.id)}
                      className={`relative flex flex-col items-center p-3.5 rounded-xl border text-center transition-all ${
                        isSelected
                          ? "bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-500/10"
                          : "bg-[#0d1117] border-[#30363d] hover:border-[#8b949e]/50 hover:bg-[#1f242c]"
                      }`}
                    >
                      <div className="relative mb-2">
                        <img
                          src={bot.photoUrl}
                          alt={bot.name}
                          className="w-13 h-13 rounded-full object-cover border-2 border-indigo-400/50 shadow-md"
                        />
                        <span className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-0.5 shadow">
                          <CheckCircle2 className="w-3.5 h-3.5 fill-blue-500 text-white" />
                        </span>
                      </div>
                      <div className="font-semibold text-xs text-white leading-tight flex items-center justify-center gap-1">
                        {bot.name}
                      </div>
                      <div className="text-[11px] text-[#8b949e]">{bot.handle}</div>
                      <div className="mt-1 text-[10px] text-indigo-400 font-medium px-1.5 py-0.5 bg-indigo-500/10 rounded-md">
                        {bot.badge || "Verified"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Channel Selector */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-xl">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-3">
              2. Select Channel (Topic Isolation)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {CHANNELS.map((ch) => {
                const isSelected = selectedChannel === ch.id;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedChannel(ch.id)}
                    className={`p-3 rounded-xl border flex flex-col text-left transition-all ${
                      isSelected
                        ? "bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/30 text-white"
                        : "bg-[#0d1117] border-[#30363d] hover:border-[#8b949e]/50 text-[#8b949e] hover:text-white"
                    }`}
                  >
                    <span className="text-xl mb-1">{ch.emoji}</span>
                    <span className="font-semibold text-sm text-white">{ch.label}</span>
                    <span className="text-[11px] text-[#8b949e] line-clamp-1 mt-0.5">{ch.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Media Format Tabs & Content Form */}
          <form onSubmit={handleSubmit} className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-xl space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2.5">
                3. Post Format / Media Mode
              </label>
              <div className="flex flex-wrap gap-2 bg-[#0d1117] p-1.5 rounded-xl border border-[#30363d]">
                <button
                  type="button"
                  onClick={() => setMediaMode("text")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    mediaMode === "text"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Text Only
                </button>
                <button
                  type="button"
                  onClick={() => setMediaMode("text_image")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    mediaMode === "text_image"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Text + Image
                </button>
                <button
                  type="button"
                  onClick={() => setMediaMode("image_only")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    mediaMode === "image_only"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Image Only
                </button>
                <button
                  type="button"
                  onClick={() => setMediaMode("video")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    mediaMode === "video"
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-[#8b949e] hover:text-white hover:bg-[#21262d]"
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  Video Post
                </button>
              </div>
            </div>

            {/* Content Textarea (Shown for text, text_image, video) */}
            {mediaMode !== "image_only" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">
                  Post Content / Analysis
                </label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`Write post on behalf of ${activeBot?.name || "Bot"} in #${selectedChannel}...`}
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-3.5 text-sm text-white placeholder-[#8b949e]/60 transition-all outline-none"
                />

                {/* Hashtag suggestions */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  <span className="text-[11px] text-[#8b949e]">Suggested tags:</span>
                  {(SUGGESTED_HASHTAGS[selectedChannel] || []).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddHashtag(tag)}
                      className="text-[11px] bg-[#21262d] hover:bg-indigo-950 hover:text-indigo-300 hover:border-indigo-500/50 border border-[#30363d] text-[#c9d1d9] px-2 py-0.5 rounded-md transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Media Upload Box (Shown for image / video modes) */}
            {mediaMode !== "text" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">
                  Attach {mediaMode === "video" ? "Video File" : "Image File"}
                </label>

                {mediaPreview ? (
                  <div className="relative bg-[#0d1117] border border-indigo-500/40 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {mediaMode === "video" ? (
                        <div className="w-16 h-12 bg-purple-950/50 border border-purple-500/30 rounded-lg flex items-center justify-center text-purple-400">
                          <Video className="w-6 h-6" />
                        </div>
                      ) : (
                        <img
                          src={mediaPreview}
                          alt="Upload preview"
                          className="w-16 h-12 rounded-lg object-cover border border-[#30363d]"
                        />
                      )}
                      <div>
                        <div className="text-xs font-semibold text-white">
                          {mediaFile?.name || "Selected Media"}
                        </div>
                        <div className="text-[11px] text-[#8b949e]">
                          {mediaFile ? `${(mediaFile.size / 1024 / 1024).toFixed(2)} MB` : "Ready to upload"}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearMedia}
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#30363d] hover:border-indigo-500/50 bg-[#0d1117] hover:bg-[#161c26] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all text-center"
                  >
                    <Upload className="w-8 h-8 text-[#8b949e] mb-2" />
                    <span className="text-xs font-semibold text-white">
                      Click to upload {mediaMode === "video" ? "MP4/WebM video" : "PNG/JPG image"}
                    </span>
                    <span className="text-[11px] text-[#8b949e] mt-0.5">
                      Max file size: {mediaMode === "video" ? "100 MB" : "10 MB"}
                    </span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={mediaMode === "video" ? "video/*" : "image/*"}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            )}

            {/* Submit Notification Status */}
            {statusMsg && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-medium ${
                  statusMsg.type === "success"
                    ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                    : "bg-rose-950/40 border-rose-500/50 text-rose-300"
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            {/* Publish Action Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Publishing as {activeBot?.name || "Bot"}...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Publish Verified Post as {activeBot?.name || "Bot"}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Column: Live FlipLine Card Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="sticky top-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#8b949e] flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                Live Frontend Feed Preview
              </span>
              <span className="text-[11px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md">
                Verified Expert Card
              </span>
            </div>

            {/* Mock FlipLine Feed Card */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 shadow-2xl space-y-4">
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={activeBot?.photoUrl || "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png"}
                      alt={activeBot?.name || "Bot"}
                      className="w-11 h-11 rounded-full object-cover border-2 border-indigo-500/50 shadow"
                    />
                    <span className="absolute -bottom-1 -right-1 bg-blue-500 text-white rounded-full p-0.5 shadow">
                      <CheckCircle2 className="w-3 h-3 fill-blue-500 text-white" />
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-white">{activeBot?.displayName || "Kabir Sharma (SF360)"}</span>
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.2 rounded font-semibold">
                        VERIFIED
                      </span>
                    </div>
                    <div className="text-xs text-[#8b949e]">{activeBot?.handle || "@kabir_sf360"} · {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
                  </div>
                </div>

                <div className="text-xs font-semibold px-2 py-1 bg-[#21262d] border border-[#30363d] rounded-lg text-[#c9d1d9] flex items-center gap-1">
                  <span>{CHANNELS.find((c) => c.id === selectedChannel)?.emoji}</span>
                  <span className="capitalize">{selectedChannel}</span>
                </div>
              </div>

              {/* Card Content Text */}
              {mediaMode !== "image_only" && (
                <p className="text-sm text-[#e6edf3] leading-relaxed whitespace-pre-line">
                  {content || "Your post analysis and commentary will appear here in the live FlipLine feed..."}
                </p>
              )}

              {/* Attached Media Display */}
              {mediaMode !== "text" && (
                <div className="rounded-xl overflow-hidden border border-[#30363d] bg-black/40">
                  {mediaPreview ? (
                    mediaMode === "video" ? (
                      <video src={mediaPreview} controls className="w-full max-h-64 object-cover" />
                    ) : (
                      <img src={mediaPreview} alt="Attached preview" className="w-full max-h-64 object-cover" />
                    )
                  ) : (
                    <div className="py-12 text-center text-[#8b949e] text-xs">
                      {mediaMode === "video" ? "🎥 Video media will play here" : "🖼️ Image media will render here"}
                    </div>
                  )}
                </div>
              )}

              {/* Card Actions (Likes & Comments preview) */}
              <div className="pt-3 border-t border-[#30363d] flex items-center justify-between text-xs text-[#8b949e]">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1 text-rose-400">
                    <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
                    <span>0 likes</span>
                  </span>
                  <span className="flex items-center gap-1 text-[#8b949e]">
                    <MessageCircle className="w-4 h-4" />
                    <span>0 comments</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Published FlipLine Posts Feed Manager */}
      <div className="max-w-7xl mx-auto mt-12 bg-[#161b22] border border-[#30363d] rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              Published FlipLine Posts Feed
            </h2>
            <p className="text-xs text-[#8b949e]">
              Manage live published posts in the FlipLine stream.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#8b949e]">Filter by Channel:</span>
            <select
              value={feedFilterChannel}
              onChange={(e) => setFeedFilterChannel(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
            >
              <option value="all">All Channels</option>
              <option value="cricket">🏏 Cricket</option>
              <option value="football">⚽ Football</option>
              <option value="athletics">🏃 Athletics</option>
              <option value="general">💬 General</option>
            </select>
          </div>
        </div>

        {loadingPosts ? (
          <div className="py-12 text-center text-sm text-[#8b949e]">Loading feed posts...</div>
        ) : recentPosts.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8b949e] border border-dashed border-[#30363d] rounded-xl">
            No posts found in this channel. Create the first post above!
          </div>
        ) : (
          <div className="divide-y divide-[#30363d]">
            {recentPosts.map((post) => (
              <div key={post.sk} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <img
                    src={post.adminPhoto || post.authorPhoto || "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png"}
                    alt={post.author}
                    className="w-10 h-10 rounded-full object-cover border border-[#30363d]"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">{post.author}</span>
                      {post.isVerified && (
                        <CheckCircle2 className="w-3.5 h-3.5 fill-blue-500 text-white" />
                      )}
                      <span className="text-[10px] bg-[#21262d] text-[#8b949e] px-1.5 py-0.5 rounded capitalize">
                        {post.channel || post.sport || "general"}
                      </span>
                      <span className="text-[11px] text-[#8b949e]">{post.time || (post.timeMs ? new Date(post.timeMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : "")}</span>
                    </div>
                    <p className="text-xs text-[#c9d1d9] mt-1 line-clamp-2 max-w-2xl">{post.content}</p>
                    {post.image && (
                      <div className="mt-1.5 text-[11px] text-indigo-400 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Image attached
                      </div>
                    )}
                    {post.videoUrl && (
                      <div className="mt-1.5 text-[11px] text-purple-400 flex items-center gap-1">
                        <Video className="w-3 h-3" /> Video attached
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right text-xs text-[#8b949e] mr-2">
                    <div>{post.likes || 0} likes</div>
                    <div>{(post.comments || []).length} comments</div>
                  </div>
                  <button
                    onClick={() => handleOpenEditModal(post)}
                    className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors border border-transparent hover:border-indigo-500/30 cursor-pointer"
                    title="Edit Post"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePost(post.sk)}
                    className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/30 cursor-pointer"
                    title="Delete Post"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit FlipLine Post Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-indigo-400">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Edit FlipLine Post
                  </h3>
                  <p className="text-xs text-[#8b949e]">
                    Author: {editingPost.author} · {editingPost.time || "Recent"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseEditModal}
                className="p-1.5 text-[#8b949e] hover:text-white hover:bg-[#21262d] rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleUpdatePost} className="p-6 space-y-5">
              {/* Channel Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">
                  Select Channel / Sport
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {CHANNELS.map((ch) => {
                    const isSelected = editChannel === ch.id;
                    return (
                      <button
                        type="button"
                        key={ch.id}
                        onClick={() => setEditChannel(ch.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-950/40 border-indigo-500 text-white shadow-lg shadow-indigo-500/10"
                            : "bg-[#0d1117] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs">
                          <span>{ch.emoji}</span>
                          <span className={isSelected ? "text-white" : "text-[#c9d1d9]"}>{ch.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Content Textarea */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#8b949e]">
                    Post Commentary / Content
                  </label>
                  <span className="text-[11px] text-[#8b949e]">{editContent.length} chars</span>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                  placeholder="Update post content..."
                  className="w-full bg-[#0d1117] border border-[#30363d] focus:border-indigo-500 rounded-xl p-3.5 text-xs text-white placeholder-[#8b949e] outline-none transition-colors"
                />

                {/* Hashtag Suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(SUGGESTED_HASHTAGS[editChannel] || SUGGESTED_HASHTAGS.general).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleEditAddHashtag(tag)}
                      className="text-[10.5px] px-2 py-0.5 rounded-md bg-[#21262d] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 border border-[#30363d] transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Attached Media Section */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#8b949e] mb-2">
                  Attached Media
                </label>

                {/* New upload preview */}
                {editMediaPreview ? (
                  <div className="relative bg-[#0d1117] border border-indigo-500/40 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {editMediaFile?.type.startsWith("video/") ? (
                        <div className="w-16 h-12 bg-purple-950/50 border border-purple-500/30 rounded-lg flex items-center justify-center text-purple-400">
                          <Video className="w-6 h-6" />
                        </div>
                      ) : (
                        <img
                          src={editMediaPreview}
                          alt="New upload"
                          className="w-16 h-12 rounded-lg object-cover border border-[#30363d]"
                        />
                      )}
                      <div>
                        <div className="text-xs font-semibold text-white">
                          New: {editMediaFile?.name || "Selected file"}
                        </div>
                        <div className="text-[11px] text-[#8b949e]">
                          {editMediaFile ? `${(editMediaFile.size / 1024 / 1024).toFixed(2)} MB` : "Ready to upload"}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleEditClearNewMedia}
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Clear new upload"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : editExistingMediaUrl && !editRemoveMedia ? (
                  /* Existing media preview */
                  <div className="relative bg-[#0d1117] border border-[#30363d] rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {editExistingMediaType === "video" ? (
                        <div className="w-16 h-12 bg-purple-950/50 border border-purple-500/30 rounded-lg flex items-center justify-center text-purple-400">
                          <Video className="w-6 h-6" />
                        </div>
                      ) : (
                        <img
                          src={editExistingMediaUrl}
                          alt="Current media"
                          className="w-16 h-12 rounded-lg object-cover border border-[#30363d]"
                        />
                      )}
                      <div>
                        <div className="text-xs font-semibold text-white">
                          Current Attached {editExistingMediaType === "video" ? "Video" : "Image"}
                        </div>
                        <div className="text-[11px] text-[#8b949e]">Active on post</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="px-2.5 py-1 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg border border-indigo-500/30 transition-colors cursor-pointer"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleEditRemoveExistingMedia}
                        className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Remove media"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* No media attached / removed */
                  <div
                    onClick={() => editFileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#30363d] hover:border-indigo-500/50 bg-[#0d1117] hover:bg-[#161c26] rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-all text-center"
                  >
                    <Upload className="w-6 h-6 text-[#8b949e] mb-1.5" />
                    <span className="text-xs font-semibold text-white">Click to attach image or video</span>
                    <span className="text-[10px] text-[#8b949e] mt-0.5">PNG, JPG, MP4 or WebM</span>
                  </div>
                )}
                <input
                  ref={editFileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleEditFileChange}
                  className="hidden"
                />
              </div>

              {/* Status Message */}
              {editStatusMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium ${
                    editStatusMsg.type === "success"
                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-300"
                      : "bg-rose-950/40 border-rose-500/50 text-rose-300"
                  }`}
                >
                  {editStatusMsg.text}
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-3 border-t border-[#30363d] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2 text-xs font-semibold text-[#8b949e] hover:text-white hover:bg-[#21262d] rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmittingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving changes...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
