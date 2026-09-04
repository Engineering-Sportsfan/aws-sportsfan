"use client";

import axios from "axios";
import { useEffect, useState, useMemo } from "react";
import {
  Eye,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  User as UserIcon,
  Film,
  CheckSquare,
  Square,
  MinusSquare,
  AlertTriangle,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Article = {
  id: string;
  badge?: "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS" | string;
  title: string;
  author?: string;
  description?: string[] | string;
  readTime?: string;
  views?: string;
  image?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
};

/**
 * Robust Media Thumbnail Component with Fallback
 * Handles standard images, Cloudinary video URLs, and broken images seamlessly.
 */
function ArticleMediaThumbnail({
  src,
  title,
  badge,
}: {
  src?: string;
  title: string;
  badge?: string;
}) {
  const [hasError, setHasError] = useState(false);

  // Check if media is a video (MP4, WebM, Cloudinary video URL)
  const isVideo = useMemo(() => {
    if (!src) return false;
    const lower = src.toLowerCase();
    return (
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".mov") ||
      lower.includes("/video/upload/") ||
      (lower.includes("res.cloudinary.com") && lower.includes("/video/"))
    );
  }, [src]);

  // If no source or failed to load image, show stylish placeholder fallback
  if (!src || hasError) {
    const initials = (title || "CA")
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "CA";

    return (
      <div
        className="w-14 h-14 rounded-lg border border-[#30363d] flex flex-col items-center justify-center shrink-0 bg-gradient-to-br from-[#1c2330] via-[#161b22] to-[#0d1117] relative overflow-hidden shadow-inner"
        title={title}
      >
        <span className="text-base opacity-80 mb-0.5">🏏</span>
        <span className="text-[9px] font-bold text-[#8b949e] font-mono tracking-wider">
          {initials}
        </span>
        <div className="absolute inset-0 bg-blue-500/5 pointer-events-none" />
      </div>
    );
  }

  // If media is a video
  if (isVideo) {
    return (
      <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#30363d] bg-black shrink-0 group">
        <video
          src={src}
          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition"
          preload="metadata"
          muted
          onError={() => setHasError(true)}
        />
        <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[8px] font-bold text-yellow-400 flex items-center gap-0.5">
          <Film size={9} /> Video
        </div>
      </div>
    );
  }

  // Standard Image with Error Fallback
  return (
    <div className="w-14 h-14 rounded-lg overflow-hidden border border-[#30363d] bg-[#0d1117] shrink-0 relative group">
      <img
        src={src}
        alt={title || "Article Image"}
        className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
        loading="lazy"
        onError={() => setHasError(true)}
      />
    </div>
  );
}

/**
 * Formats Badge with distinct icons, color schemes, and robust fallback
 */
function renderArticleBadge(badge?: string) {
  const normalized = (badge || "NEWS").toUpperCase().trim();

  switch (normalized) {
    case "FEATURE":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 whitespace-nowrap shadow-sm">
          <span>✨</span> FEATURE
        </span>
      );
    case "ANALYSIS":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 whitespace-nowrap shadow-sm">
          <span>📊</span> ANALYSIS
        </span>
      );
    case "OPINION":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 whitespace-nowrap shadow-sm">
          <span>💬</span> OPINION
        </span>
      );
    case "NEWS":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap shadow-sm">
          <span>📰</span> NEWS
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 whitespace-nowrap shadow-sm">
          <span>📌</span> {normalized}
        </span>
      );
  }
}

export default function CricketArticlesListPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedBadge, setSelectedBadge] = useState<string>("ALL");

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetchArticles();
  }, []);

  const fetchArticles = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/api/cricket-articles?limit=100&_t=${Date.now()}`);
      setArticles(res.data.articles || []);
      // Clear selections that no longer exist
      setSelectedIds([]);
    } catch (error) {
      console.error("Failed to fetch articles", error);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (id: string) => {
    router.push(`/admin/cricketarticles-management/cricketarticles-list/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/admin/cricketarticles-management/add-cricketarticles?id=${id}`);
  };

  // Single Article Delete
  const handleDeleteSingle = async (id: string, title?: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete "${title || 'this article'}"?`);
    if (!confirmDelete) return;

    setDeletingId(id);
    try {
      await axios.delete(`/api/cricket-articles/${encodeURIComponent(id)}`);
      setArticles((prev) => prev.filter((article) => article.id !== id));
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete article. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter articles based on search & badge
  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (article.title || "").toLowerCase().includes(q) ||
        (article.author || "").toLowerCase().includes(q) ||
        (article.badge || "").toLowerCase().includes(q) ||
        (Array.isArray(article.tags) && article.tags.some((t) => t.toLowerCase().includes(q)));

      const matchesBadge =
        selectedBadge === "ALL" ||
        (article.badge || "NEWS").toUpperCase() === selectedBadge;

      return matchesSearch && matchesBadge;
    });
  }, [articles, search, selectedBadge]);

  // Checkbox selection helpers
  const allFilteredIds = useMemo(() => filteredArticles.map((a) => a.id), [filteredArticles]);
  const isAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.includes(id));
  const isPartiallySelected = selectedIds.length > 0 && !isAllSelected;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      // Deselect all filtered items
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      // Select all filtered items
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  // Batch Delete Selected Articles
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const count = selectedIds.length;
    const confirmDelete = window.confirm(
      `⚠️ Are you sure you want to permanently delete ${count} selected cricket article(s)?\n\nThis will remove them from DynamoDB and Firebase.`
    );
    if (!confirmDelete) return;

    setIsBatchDeleting(true);
    try {
      const res = await axios.delete("/api/cricket-articles", {
        data: { ids: selectedIds },
      });

      const deletedIdsSet = new Set(selectedIds);
      setArticles((prev) => prev.filter((article) => !deletedIdsSet.has(article.id)));
      setSelectedIds([]);
      alert(`✅ Successfully deleted ${count} article(s).`);
    } catch (error) {
      console.error("Batch delete failed", error);
      // Fallback: Try individual deletes in parallel if batch endpoint failed
      try {
        await Promise.all(
          selectedIds.map((id) =>
            axios.delete(`/api/cricket-articles/${encodeURIComponent(id)}`).catch(() => { })
          )
        );
        const deletedIdsSet = new Set(selectedIds);
        setArticles((prev) => prev.filter((article) => !deletedIdsSet.has(article.id)));
        setSelectedIds([]);
        alert(`✅ Deleted selected article(s).`);
      } catch (fallbackErr) {
        alert("Failed to delete some articles. Please refresh and check.");
      }
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const total = articles.length;
    const news = articles.filter((a) => (a.badge || "NEWS").toUpperCase() === "NEWS").length;
    const features = articles.filter((a) => (a.badge || "").toUpperCase() === "FEATURE").length;
    const analysis = articles.filter((a) => (a.badge || "").toUpperCase() === "ANALYSIS").length;
    const opinions = articles.filter((a) => (a.badge || "").toUpperCase() === "OPINION").length;
    return { total, news, features, analysis, opinions };
  }, [articles]);

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 text-[#e6edf3]">
            🏏 Cricket Articles Management
          </h1>
          <p className="text-sm text-[#7d8590] mt-1">
            Manage published cricket articles, select & batch delete records, authors, and editorial badges.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={fetchArticles}
            disabled={loading || isBatchDeleting}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-lg border border-[#30363d] text-xs font-medium transition cursor-pointer disabled:opacity-50"
            title="Refresh articles list"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>

          <button
            onClick={() => router.push("/admin/cricketarticles-management/add-cricketarticles")}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-lg shadow-blue-600/20"
          >
            <Plus size={16} />
            Add New Article
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { label: "Total Articles", count: stats.total, color: "border-blue-500", icon: "📚", text: "text-blue-400" },
          { label: "News", count: stats.news, color: "border-emerald-500", icon: "📰", text: "text-emerald-400" },
          { label: "Features", count: stats.features, color: "border-purple-500", icon: "✨", text: "text-purple-400" },
          { label: "Analysis", count: stats.analysis, color: "border-sky-500", icon: "📊", text: "text-sky-400" },
          { label: "Opinions", count: stats.opinions, color: "border-amber-500", icon: "💬", text: "text-amber-400" },
        ].map((s) => (
          <div
            key={s.label}
            className={`bg-[#161b22] border border-[#21262d] border-t-2 ${s.color} rounded-lg p-3.5 flex flex-col justify-between`}
          >
            <div className="flex items-center justify-between text-xs text-[#7d8590] uppercase font-semibold tracking-wider">
              <span>{s.label}</span>
              <span>{s.icon}</span>
            </div>
            <div className={`text-2xl font-bold font-mono mt-2 ${s.text}`}>
              {loading ? "—" : s.count}
            </div>
          </div>
        ))}
      </div>

      {/* BATCH ACTION BANNER (FLOATING / PROMINENT WHEN ITEMS SELECTED) */}
      {selectedIds.length > 0 && (
        <div className="bg-gradient-to-r from-red-950/70 via-[#1c2330] to-red-950/70 border border-red-500/40 rounded-xl p-3.5 px-5 flex items-center justify-between gap-4 flex-wrap shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center font-bold text-sm">
              {selectedIds.length}
            </span>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>{selectedIds.length} Article(s) Selected</span>
              </div>
              <p className="text-xs text-[#8b949e]">
                Perform batch actions or remove multiple articles simultaneously.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleToggleSelectAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#21262d] text-[#c9d1d9] hover:bg-[#30363d] border border-[#30363d] transition cursor-pointer"
            >
              {isAllSelected ? "Deselect All Visible" : `Select All (${filteredArticles.length})`}
            </button>

            <button
              onClick={handleClearSelection}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-transparent text-[#8b949e] hover:text-white transition cursor-pointer"
            >
              Clear Selection
            </button>

            <button
              onClick={handleBatchDelete}
              disabled={isBatchDeleting}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition cursor-pointer shadow-lg shadow-red-600/30 disabled:opacity-50"
            >
              <Trash2 size={15} />
              {isBatchDeleting ? `Deleting (${selectedIds.length})…` : `Delete Selected (${selectedIds.length})`}
            </button>
          </div>
        </div>
      )}

      {/* TABLE CONTAINER WITH TOOLBAR */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden shadow-xl">
        {/* TOOLBAR */}
        <div className="p-4 border-b border-[#21262d] flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
          {/* Search Input */}
          <div className="flex items-center gap-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 flex-1 max-w-md">
            <Search size={16} className="text-[#7d8590]" />
            <input
              type="text"
              placeholder="Search by title, author name, badge, tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-[#e6edf3] w-full placeholder-[#7d8590]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-[#7d8590] hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Badge Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: "ALL", label: "All" },
              { id: "NEWS", label: "📰 News" },
              { id: "FEATURE", label: "✨ Feature" },
              { id: "ANALYSIS", label: "📊 Analysis" },
              { id: "OPINION", label: "💬 Opinion" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedBadge(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer border ${selectedBadge === tab.id
                    ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                    : "bg-[#0d1117] text-[#8b949e] border-[#30363d] hover:bg-[#21262d] hover:text-white"
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Selection quick indicator */}
          <div className="flex items-center gap-3 ml-auto text-xs text-[#7d8590]">
            {filteredArticles.length > 0 && (
              <button
                onClick={handleToggleSelectAll}
                className="text-xs text-[#58a6ff] hover:underline font-medium cursor-pointer"
              >
                {isAllSelected ? "Deselect All" : "Select All Visible"}
              </button>
            )}
            <span>
              Showing <b className="text-white">{filteredArticles.length}</b> of {articles.length} articles
            </span>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left border-collapse">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {/* SELECT ALL CHECKBOX COLUMN */}
                <th className="px-4 py-3 w-10">
                  <div
                    onClick={handleToggleSelectAll}
                    className="cursor-pointer text-[#7d8590] hover:text-white flex items-center justify-center"
                    title={isAllSelected ? "Deselect all" : "Select all visible"}
                  >
                    {isAllSelected ? (
                      <CheckSquare size={18} className="text-blue-500" />
                    ) : isPartiallySelected ? (
                      <MinusSquare size={18} className="text-blue-400" />
                    ) : (
                      <Square size={18} />
                    )}
                  </div>
                </th>

                {[
                  "#",
                  "Media",
                  "Badge",
                  "Title",
                  "Author / Posted By",
                  "Read Time",
                  "Views",
                  "Published Date",
                  "Actions",
                ].map((head) => (
                  <th
                    key={head}
                    className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#7d8590] whitespace-nowrap"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-[#21262d]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-[#7d8590]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs mt-2 font-medium">Loading cricket articles…</p>
                    </div>
                  </td>
                </tr>
              ) : filteredArticles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-[#7d8590]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-3xl">🔍</span>
                      <p className="text-sm text-white font-medium">No cricket articles found</p>
                      <p className="text-xs text-[#7d8590]">
                        Try adjusting your search query or filter options.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredArticles.map((article, index) => {
                  const authorName = article.author?.trim() || "SportsFan Staff";
                  const authorInitials = authorName.slice(0, 2).toUpperCase();
                  const isDeleting = deletingId === article.id;
                  const isSelected = selectedIds.includes(article.id);

                  return (
                    <tr
                      key={article.id}
                      className={`hover:bg-[#0d1117] transition group ${isSelected ? "bg-blue-500/5 hover:bg-blue-500/10" : ""
                        } ${isDeleting ? "opacity-30 pointer-events-none" : ""}`}
                    >
                      {/* INDIVIDUAL ROW CHECKBOX */}
                      <td className="px-4 py-3 text-center">
                        <div
                          onClick={() => handleToggleSelect(article.id)}
                          className="cursor-pointer flex items-center justify-center"
                          title={isSelected ? "Deselect article" : "Select article"}
                        >
                          {isSelected ? (
                            <CheckSquare size={17} className="text-blue-500" />
                          ) : (
                            <Square size={17} className="text-[#484f58] hover:text-[#8b949e]" />
                          )}
                        </div>
                      </td>

                      {/* # Index */}
                      <td className="px-4 py-3 text-xs font-mono text-[#7d8590]">
                        {index + 1}
                      </td>

                      {/* Media Image / Video with Fallback */}
                      <td className="px-4 py-3">
                        <ArticleMediaThumbnail
                          src={article.image}
                          title={article.title}
                          badge={article.badge}
                        />
                      </td>

                      {/* Badge */}
                      <td className="px-4 py-3">
                        {renderArticleBadge(article.badge)}
                      </td>

                      {/* Title & Preview */}
                      <td className="px-4 py-3 max-w-xs">
                        <div
                          onClick={() => handleView(article.id)}
                          className="font-semibold text-sm text-[#e6edf3] hover:text-blue-400 transition cursor-pointer line-clamp-2"
                          title={article.title}
                        >
                          {article.title}
                        </div>
                        {Array.isArray(article.tags) && article.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {article.tags.slice(0, 3).map((tag, tIdx) => (
                              <span
                                key={tIdx}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-[#21262d] text-[#8b949e] border border-[#30363d]"
                              >
                                #{tag}
                              </span>
                            ))}
                            {article.tags.length > 3 && (
                              <span className="text-[10px] text-[#7d8590]">
                                +{article.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Author / Posted By Label */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {authorInitials}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-[#e6edf3] flex items-center gap-1">
                              <span>{authorName}</span>
                            </div>
                            <div className="text-[10px] text-[#7d8590] flex items-center gap-1">
                              <UserIcon size={10} />
                              <span>Author</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Read Time */}
                      <td className="px-4 py-3 text-xs text-[#8b949e] whitespace-nowrap">
                        <span className="bg-[#21262d] px-2 py-1 rounded text-[11px] border border-[#30363d]">
                          📖 {article.readTime || "5 min read"}
                        </span>
                      </td>

                      {/* Views */}
                      <td className="px-4 py-3 text-xs text-[#8b949e] whitespace-nowrap">
                        <span className="bg-[#21262d] px-2 py-1 rounded text-[11px] border border-[#30363d]">
                          👁️ {article.views || "0 views"}
                        </span>
                      </td>

                      {/* Published Date */}
                      <td className="px-4 py-3 text-xs text-[#7d8590] font-mono whitespace-nowrap">
                        {article.createdAt
                          ? new Date(article.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                          : "—"}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleView(article.id)}
                            className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30 transition cursor-pointer"
                            title="View article details"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            onClick={() => handleEdit(article.id)}
                            className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30 transition cursor-pointer"
                            title="Edit article"
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            onClick={() => handleDeleteSingle(article.id, article.title)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition cursor-pointer disabled:opacity-50"
                            title="Delete this article"
                          >
                            <Trash2 size={15} />
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
      </div>
    </div>
  );
}