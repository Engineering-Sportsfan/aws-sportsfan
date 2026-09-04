"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Trash2, GripVertical, Image as ImageIcon, ArrowLeft, Check, Film, X } from "lucide-react";

type BadgeType = "FEATURE" | "ANALYSIS" | "OPINION" | "NEWS";

type FormState = {
  badge: BadgeType;
  title: string;
  author: string;
  description: string[];
  readTime: string;
  views: string;
  tags: string[];
};

export default function CricketArticleForm({
  articleIdToEdit,
}: {
  articleIdToEdit?: string;
}) {
  const [form, setForm] = useState<FormState>({
    badge: "NEWS",
    title: "",
    author: "",
    description: [""],
    readTime: "5 min read",
    views: "0 views",
    tags: [],
  });

  const [tagInput, setTagInput] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [existingImage, setExistingImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingArticle, setFetchingArticle] = useState(false);
  const router = useRouter();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (newTag && !form.tags.includes(newTag)) {
        setForm((prev) => ({
          ...prev,
          tags: [...prev.tags, newTag],
        }));
        setTagInput("");
      }
    }
  };

  const removeTag = (indexToRemove: number) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((_, index) => index !== indexToRemove),
    }));
  };

  /* ─── FETCH SINGLE ARTICLE FOR EDIT ─── */
  useEffect(() => {
    if (!articleIdToEdit) return;

    const fetchArticle = async () => {
      setFetchingArticle(true);
      try {
        const res = await axios.get(`/api/cricket-articles/${articleIdToEdit}`);
        const article = res.data.article;

        if (article) {
          setForm({
            badge: article.badge || "NEWS",
            title: article.title || "",
            author: article.author || "",
            description: Array.isArray(article.description) && article.description.length > 0
              ? article.description
              : typeof article.description === "string" && article.description
              ? [article.description]
              : [""],
            readTime: article.readTime || "5 min read",
            views: article.views || "0 views",
            tags: Array.isArray(article.tags) ? article.tags : [],
          });

          setExistingImage(article.image || "");
        }
      } catch (error) {
        console.error("Failed to fetch article for edit", error);
      } finally {
        setFetchingArticle(false);
      }
    };

    fetchArticle();
  }, [articleIdToEdit]);

  const handleCancel = () => {
    if (articleIdToEdit) {
      router.push("/admin/cricketarticles-management/cricketarticles-list");
      return;
    }
    setForm({
      badge: "NEWS",
      title: "",
      author: "",
      description: [""],
      readTime: "5 min read",
      views: "0 views",
      tags: [],
    });
    setImage(null);
    setExistingImage("");
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  /* ─── DESCRIPTION PARAGRAPH HANDLERS ─── */
  const handleDescriptionChange = (index: number, value: string) => {
    const updated = [...form.description];
    updated[index] = value;
    setForm((prev) => ({ ...prev, description: updated }));
  };

  const addDescriptionParagraph = () => {
    setForm((prev) => ({ ...prev, description: [...prev.description, ""] }));
  };

  const removeDescriptionParagraph = (index: number) => {
    if (form.description.length === 1) {
      alert("At least one paragraph is required");
      return;
    }
    setForm((prev) => ({
      ...prev,
      description: prev.description.filter((_, i) => i !== index),
    }));
  };

  const moveParagraphUp = (index: number) => {
    if (index === 0) return;
    const updated = [...form.description];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setForm((prev) => ({ ...prev, description: updated }));
  };

  const moveParagraphDown = (index: number) => {
    if (index === form.description.length - 1) return;
    const updated = [...form.description];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setForm((prev) => ({ ...prev, description: updated }));
  };

  /* ─── SUBMIT ─── */
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!form.title.trim()) {
      alert("Title is required");
      return;
    }

    const nonEmptyDescriptions = form.description.filter(
      (p) => p.trim() !== ""
    );

    if (nonEmptyDescriptions.length === 0) {
      alert("At least one description paragraph is required");
      return;
    }

    setLoading(true);

    try {
      let res;

      if (image) {
        // A new file was picked — send it as FormData; the backend uploads it to Cloudinary
        const formData = new FormData();
        formData.append("badge", form.badge);
        formData.append("title", form.title.trim());
        formData.append("author", form.author.trim() || "SportsFan Staff");
        formData.append("readTime", form.readTime.trim() || "5 min read");
        formData.append("views", form.views.trim() || "0 views");
        formData.append("description", JSON.stringify(nonEmptyDescriptions));
        formData.append("tags", JSON.stringify(form.tags));
        formData.append("file", image);

        if (articleIdToEdit) {
          res = await axios.put(`/api/cricket-articles/${articleIdToEdit}`, formData);
        } else {
          res = await axios.post("/api/cricket-articles", formData);
        }
      } else {
        // No new file — send JSON (image will be existingImage or empty string "")
        const payload = {
          badge: form.badge,
          title: form.title.trim(),
          author: form.author.trim() || "SportsFan Staff",
          readTime: form.readTime.trim() || "5 min read",
          views: form.views.trim() || "0 views",
          description: nonEmptyDescriptions,
          tags: form.tags,
          image: existingImage || "", // Media is completely optional
        };

        if (articleIdToEdit) {
          res = await axios.put(`/api/cricket-articles/${articleIdToEdit}`, payload);
        } else {
          res = await axios.post("/api/cricket-articles", payload);
        }
      }

      if (res.data.success) {
        alert(
          articleIdToEdit
            ? "✅ Article updated successfully"
            : "✅ Article created successfully"
        );
        router.push("/admin/cricketarticles-management/cricketarticles-list");

        if (!articleIdToEdit) {
          setForm({
            badge: "NEWS",
            title: "",
            author: "",
            description: [""],
            readTime: "5 min read",
            views: "0 views",
            tags: [],
          });
          setImage(null);
          setExistingImage("");
        }
      }
    } catch (error: any) {
      console.error("Save failed", error);
      const msg = error.response?.data?.error || error.message || "Error saving article";
      alert(`❌ Error saving article: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const preview = image ? URL.createObjectURL(image) : existingImage;
  const isVideoPreview = image
    ? image.type.startsWith("video/")
    : existingImage &&
      (existingImage.toLowerCase().endsWith(".mp4") ||
        existingImage.toLowerCase().endsWith(".webm") ||
        existingImage.toLowerCase().includes("/video/"));

  // Count non-empty paragraphs
  const nonEmptyCount = form.description.filter((p) => p.trim() !== "").length;

  if (fetchingArticle) {
    return (
      <div className="max-w-[1440px] mx-auto p-6 text-white flex flex-col items-center justify-center min-h-[300px]">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-sm text-gray-400">Loading article details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto p-4 md:p-6 text-white space-y-6">
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/cricketarticles-management/cricketarticles-list")}
            className="p-2 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] transition cursor-pointer"
            title="Back to articles list"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <span>🏏</span>
              {articleIdToEdit ? "Edit Cricket Article" : "Create Cricket Article"}
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {articleIdToEdit
                ? `Modifying article ID: ${articleIdToEdit}`
                : "Publish a new cricket article, news piece, feature, analysis or opinion"}
            </p>
          </div>
        </div>

        {articleIdToEdit && (
          <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-3 py-1.5 rounded-lg font-medium">
            Editing Mode
          </span>
        )}
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-6 space-y-6 shadow-xl">
        {/* ROW 1: BASIC INFORMATION */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
            <span>📝</span> Article Metadata
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-300 font-medium block mb-1.5">
                Badge / Category <span className="text-blue-400">*</span>
              </label>
              <select
                name="badge"
                value={form.badge}
                onChange={handleChange}
                className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="NEWS">📰 NEWS</option>
                <option value="FEATURE">✨ FEATURE</option>
                <option value="ANALYSIS">📊 ANALYSIS</option>
                <option value="OPINION">💬 OPINION</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <Input
                label="Article Title"
                name="title"
                required
                value={form.title}
                onChange={handleChange}
                placeholder="Enter a compelling article headline..."
              />
            </div>

            <div>
              <Input
                label="Author / Posted By"
                name="author"
                value={form.author}
                onChange={handleChange}
                placeholder="e.g. Anand Vasu, Harsha Bhogle (defaults to SportsFan Staff)"
              />
            </div>

            <div>
              <Input
                label="Estimated Read Time"
                name="readTime"
                value={form.readTime}
                onChange={handleChange}
                placeholder="e.g. 4 min read"
              />
            </div>

            <div>
              <Input
                label="Initial / Current Views"
                name="views"
                value={form.views}
                onChange={handleChange}
                placeholder="e.g. 1.2k views"
              />
            </div>
          </div>
        </div>

        {/* ROW 2: TAGS */}
        <div className="border-t border-[#21262d] pt-5">
          <label className="text-xs text-gray-300 font-medium block mb-1.5">
            Article Tags <span className="text-gray-500 font-normal">(Optional)</span>
          </label>
          <div className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3.5 py-2.5 focus-within:border-blue-500 transition">
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {form.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="flex items-center gap-1.5 bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full text-xs font-medium"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(index)}
                      className="hover:text-red-400 transition ml-0.5 text-sm"
                      title="Remove tag"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a tag (e.g. BCCI, IPL, Wankhede) and press Enter..."
              className="w-full bg-transparent border-none text-white text-sm focus:outline-none placeholder:text-gray-500"
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Press <kbd className="px-1.5 py-0.5 bg-[#21262d] rounded text-gray-400 border border-gray-700">Enter</kbd> to add multiple tags
          </p>
        </div>

        {/* ROW 3: DESCRIPTION SECTION */}
        <div className="border-t border-[#21262d] pt-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div>
              <label className="text-xs text-gray-300 font-medium block">
                Article Body / Content Paragraphs <span className="text-blue-400">*</span>
              </label>
              <span className="text-[11px] text-gray-500">
                Split your article into clean readable paragraphs. Use the arrows to reorder.
              </span>
            </div>
            <button
              type="button"
              onClick={addDescriptionParagraph}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition font-semibold cursor-pointer shadow"
            >
              <Plus size={14} />
              Add Paragraph
            </button>
          </div>

          <div className="space-y-4">
            {form.description.map((paragraph, index) => (
              <div
                key={index}
                className="border border-gray-700/80 rounded-xl p-4 bg-[#0d1117] transition hover:border-gray-600"
              >
                {/* Paragraph header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GripVertical size={16} className="text-gray-500" />
                    <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded">
                      Paragraph {index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => moveParagraphUp(index)}
                        className="px-2 py-1 rounded bg-[#21262d] text-gray-400 hover:text-white hover:bg-[#30363d] text-xs transition"
                        title="Move Up"
                      >
                        ↑ Up
                      </button>
                    )}
                    {index < form.description.length - 1 && (
                      <button
                        type="button"
                        onClick={() => moveParagraphDown(index)}
                        className="px-2 py-1 rounded bg-[#21262d] text-gray-400 hover:text-white hover:bg-[#30363d] text-xs transition"
                        title="Move Down"
                      >
                        ↓ Down
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeDescriptionParagraph(index)}
                      className="p-1.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition ml-1"
                      title="Remove Paragraph"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <textarea
                  value={paragraph}
                  onChange={(e) => handleDescriptionChange(index, e.target.value)}
                  placeholder={`Write or paste content for paragraph ${index + 1}...`}
                  rows={4}
                  className="w-full bg-[#161b22] border border-gray-700 rounded-lg p-3 text-white placeholder:text-gray-500 text-sm focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
            <span>{nonEmptyCount} non-empty paragraph(s)</span>
            {nonEmptyCount === 0 && (
              <span className="text-amber-400 text-xs font-medium">
                ⚠️ At least one paragraph is required before saving.
              </span>
            )}
          </div>
        </div>

        {/* ROW 4: MEDIA (IMAGE / VIDEO) — OPTIONAL */}
        <div className="border-t border-[#21262d] pt-5">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <label className="text-xs text-gray-300 font-medium flex items-center gap-2">
              <ImageIcon size={16} className="text-blue-400" />
              <span>Article Media (Image / Video)</span>
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-normal">
                Optional
              </span>
            </label>
            <span className="text-[11px] text-gray-400">
              Media is not mandatory. You can publish articles with or without an image/video.
            </span>
          </div>

          <div className="bg-[#0d1117] border border-dashed border-gray-700 rounded-xl p-4 transition hover:border-gray-500">
            <input
              type="file"
              id="article-media-input"
              accept="image/*,video/*"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
              className="w-full bg-transparent text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer cursor-pointer"
            />
            <p className="text-[11px] text-gray-500 mt-2">
              Supported formats: JPG, PNG, WEBP, GIF, MP4, WEBM. Files uploaded here are hosted on Cloudinary.
            </p>
          </div>

          {/* Media Preview if provided */}
          {preview && (
            <div className="mt-4 p-3 bg-[#0d1117] border border-gray-700 rounded-xl relative inline-block group">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-xs text-gray-400 flex items-center gap-1.5">
                  {isVideoPreview ? <Film size={14} className="text-yellow-400" /> : <ImageIcon size={14} className="text-blue-400" />}
                  {isVideoPreview ? "Video Preview" : "Image Preview"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setExistingImage("");
                    const fileInput = document.getElementById("article-media-input") as HTMLInputElement;
                    if (fileInput) fileInput.value = "";
                  }}
                  className="flex items-center gap-1 text-[11px] bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 px-2 py-0.5 rounded font-medium transition cursor-pointer"
                  title="Remove selected media"
                >
                  <X size={12} /> Remove Media
                </button>
              </div>

              {isVideoPreview ? (
                <video
                  src={preview}
                  controls
                  className="w-64 max-h-44 object-cover rounded-lg border border-gray-800"
                />
              ) : (
                <img
                  src={preview}
                  alt="Article Media Preview"
                  className="w-56 max-h-44 object-cover rounded-lg border border-gray-800"
                />
              )}
            </div>
          )}
        </div>

        {/* ACTION BUTTONS */}
        <div className="border-t border-[#21262d] pt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-3 px-6 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>{articleIdToEdit ? "Updating Article..." : "Creating Article..."}</span>
              </>
            ) : (
              <>
                <Check size={18} />
                <span>{articleIdToEdit ? "Update Cricket Article" : "Publish Cricket Article"}</span>
              </>
            )}
          </button>

          <button
            onClick={handleCancel}
            type="button"
            className="sm:w-36 bg-[#21262d] hover:bg-[#30363d] text-gray-300 py-3 px-6 rounded-xl font-medium border border-[#30363d] transition text-center cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean }) {
  return (
    <div>
      <label className="text-xs text-gray-300 font-medium block mb-1.5">
        {label} {required && <span className="text-blue-400">*</span>}
      </label>
      <input
        {...props}
        className="w-full bg-[#0d1117] border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-blue-500 transition"
      />
    </div>
  );
}