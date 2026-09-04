"use client";

import axios from "axios";
import { ArrowLeft, Pencil, Trash2, User as UserIcon, Film } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState, useMemo } from "react";

type Article = {
  id: string;
  badge?: "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS" | string;
  title: string;
  author?: string;
  description?: string[];
  readTime?: string;
  views?: string;
  image?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
};

export default function CricketArticleViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [article, setArticle] = useState<Article | null>(null);
  const [imgError, setImgError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;

    const fetchArticle = async () => {
      try {
        const res = await axios.get(`/api/cricket-articles/${id}`);
        setArticle(res.data.article);
      } catch (err) {
        console.error("Failed to fetch article", err);
      }
    };

    fetchArticle();
  }, [id]);

  const handleEdit = () => {
    router.push(`/admin/cricketarticles-management/add-cricketarticles?id=${id}`);
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this article?");
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/cricket-articles/${encodeURIComponent(id)}`);
      alert("Article deleted successfully");
      router.push("/admin/cricketarticles-management/cricketarticles-list");
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete article");
    }
  };

  const isVideo = useMemo(() => {
    if (!article?.image) return false;
    const lower = article.image.toLowerCase();
    return (
      lower.endsWith(".mp4") ||
      lower.endsWith(".webm") ||
      lower.endsWith(".mov") ||
      lower.includes("/video/upload/") ||
      (lower.includes("res.cloudinary.com") && lower.includes("/video/"))
    );
  }, [article?.image]);

  const renderBadge = (badge?: string) => {
    const normalized = (badge || "NEWS").toUpperCase().trim();
    switch (normalized) {
      case "FEATURE":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-sm">
            <span>✨</span> FEATURE
          </span>
        );
      case "ANALYSIS":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-sm">
            <span>📊</span> ANALYSIS
          </span>
        );
      case "OPINION":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm">
            <span>💬</span> OPINION
          </span>
        );
      case "NEWS":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm">
            <span>📰</span> NEWS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-sm">
            <span>📌</span> {normalized}
          </span>
        );
    }
  };

  if (!article) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const authorName = article.author?.trim() || "SportsFan Staff";
  const authorInitials = authorName.slice(0, 2).toUpperCase();

  return (
    <div className="max-w-[1300px] mx-auto p-6 text-white space-y-6">
      {/* HEADER & ACTIONS */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/admin/cricketarticles-management/cricketarticles-list")}
            className="p-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] transition cursor-pointer"
            title="Back to articles list"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#e6edf3]">Article Overview</h1>
            <p className="text-xs text-[#7d8590]">ID: {article.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30 transition text-xs font-semibold cursor-pointer"
          >
            <Pencil size={15} />
            Edit Article
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition text-xs font-semibold cursor-pointer"
          >
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </div>

      {/* TWO COLUMN CONTENT LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: ARTICLE CONTENT (8 COLS) */}
        <div className="lg:col-span-7 bg-[#161b22] border border-[#21262d] rounded-xl p-6 space-y-5 shadow-lg">
          {/* Badge & Metadata */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>{renderBadge(article.badge)}</div>
            <div className="flex items-center gap-3 text-xs text-[#8b949e]">
              <span className="bg-[#0d1117] px-2.5 py-1 rounded border border-[#21262d]">
                📖 {article.readTime || "5 min read"}
              </span>
              <span className="bg-[#0d1117] px-2.5 py-1 rounded border border-[#21262d]">
                👁️ {article.views || "0 views"}
              </span>
            </div>
          </div>

          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold text-[#e6edf3] leading-snug">{article.title}</h2>
          </div>

          {/* Author Card */}
          <div className="flex items-center gap-3 bg-[#0d1117] border border-[#21262d] p-3 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm shrink-0">
              {authorInitials}
            </div>
            <div>
              <div className="text-sm font-semibold text-[#e6edf3] flex items-center gap-1.5">
                <span>{authorName}</span>
                <span className="text-[10px] bg-blue-500/15 text-blue-400 border border-blue-500/30 px-1.5 py-0.2 rounded">
                  Author / Publisher
                </span>
              </div>
              <div className="text-xs text-[#7d8590] flex items-center gap-1 mt-0.5">
                <UserIcon size={12} />
                <span>Posted to SportsFan360 Cricket Articles</span>
              </div>
            </div>
          </div>

          {/* Tags */}
          {Array.isArray(article.tags) && article.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7d8590] mb-2">Tags</h3>
              <div className="flex items-center gap-1.5 flex-wrap">
                {article.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-xs px-2.5 py-1 rounded-full bg-[#21262d] text-[#8b949e] border border-[#30363d]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description Paragraphs */}
          <div className="pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7d8590] mb-3">Article Content</h3>
            <div className="space-y-3.5">
              {article.description && Array.isArray(article.description) && article.description.length > 0 ? (
                article.description.map((para, idx) => (
                  <p key={idx} className="text-sm text-[#c9d1d9] leading-relaxed bg-[#0d1117]/50 p-3 rounded-lg border border-[#21262d]/50">
                    {para}
                  </p>
                ))
              ) : typeof article.description === "string" && article.description ? (
                <p className="text-sm text-[#c9d1d9] leading-relaxed bg-[#0d1117]/50 p-3 rounded-lg border border-[#21262d]/50">
                  {article.description}
                </p>
              ) : (
                <p className="text-sm text-[#7d8590] italic">No description content provided.</p>
              )}
            </div>
          </div>

          {/* Timestamp Footer */}
          <div className="pt-4 text-xs text-[#7d8590] border-t border-[#21262d] flex justify-between flex-wrap gap-2 font-mono">
            <span>Published: {article.createdAt ? new Date(article.createdAt).toLocaleString("en-IN") : "—"}</span>
            <span>Last Updated: {article.updatedAt ? new Date(article.updatedAt).toLocaleString("en-IN") : "—"}</span>
          </div>
        </div>

        {/* RIGHT COLUMN: MEDIA PREVIEW (5 COLS) */}
        <div className="lg:col-span-5 bg-[#161b22] border border-[#21262d] rounded-xl p-6 space-y-4 shadow-lg h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#7d8590]">Article Media</h2>
            {isVideo && (
              <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded flex items-center gap-1 font-semibold">
                <Film size={12} /> Video Media
              </span>
            )}
          </div>

          {/* Media Player / Image / Fallback */}
          <div className="rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117] min-h-[260px] flex items-center justify-center">
            {isVideo && article.image && !imgError ? (
              <video
                src={article.image}
                controls
                className="w-full max-h-[380px] object-contain rounded-lg"
                onError={() => setImgError(true)}
              />
            ) : article.image && !imgError ? (
              <img
                src={article.image}
                alt={article.title}
                className="w-full max-h-[380px] object-cover rounded-lg"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                <span className="text-4xl">🏏</span>
                <p className="text-sm font-semibold text-[#e6edf3]">No Preview Available</p>
                <p className="text-xs text-[#7d8590]">Image failed to load or no media URL was provided.</p>
              </div>
            )}
          </div>

          {article.image && (
            <div className="text-[11px] text-[#7d8590] break-all bg-[#0d1117] p-2.5 rounded border border-[#21262d] font-mono">
              <span className="text-[#8b949e] font-semibold">URL:</span> {article.image}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}