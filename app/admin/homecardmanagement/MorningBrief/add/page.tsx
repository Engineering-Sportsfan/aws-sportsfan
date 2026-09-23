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
  Sparkles,
  Sun,
  Eye,
  Trash2
} from "lucide-react";

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
  const [storyNumber, setStoryNumber] = useState<number>(1);
  const [sport, setSport] = useState("Cricket");
  const [icon, setIcon] = useState("🏏");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState<number>(1);
  const [active, setActive] = useState(true);

  // Load existing story if editId is provided
  useEffect(() => {
    if (!editId) return;

    const loadStory = async () => {
      try {
        setFetching(true);
        const res = await axios.get(`/api/welcomemessage/${editId}`);
        if (res.data.success && res.data.item) {
          const item = res.data.item;
          setStoryNumber(item.storyNumber || 1);
          setSport(item.sport || "Cricket");
          setIcon(item.icon || "🏏");
          setTitle(item.title || "");
          setDescription(item.description || "");
          setOrder(item.order || 1);
          setActive(item.active !== false);
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
        title: title.trim(),
        description: description.trim(),
        active,
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
            <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-[#111625] border border-white/10 space-y-5">
              {/* Row 1: Story Number & Display Order */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Story Number (#) *
                  </label>
                  <select
                    value={storyNumber}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      setStoryNumber(num);
                      if (!editId) setOrder(num);
                    }}
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors font-bold"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num}>
                        Story #{num}
                      </option>
                    ))}
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
                    className="w-full bg-[#090C15] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1.5">
                    Status
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
                    {active ? "Active (Visible)" : "Hidden (Draft)"}
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
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. India face Sri Lanka in the gold medal match — biggest game of the Asian Games for Indian cricket."
                  required
                  className="w-full bg-[#090C15] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors leading-relaxed"
                />
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
            <div className="p-5 rounded-2xl bg-[#111625] border border-amber-500/30 space-y-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                <span className="text-xl">📱</span>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Frontend Live Preview
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    How fans see this story in the Morning Brief modal
                  </p>
                </div>
              </div>

              {/* Preview Card */}
              <div className="p-4 rounded-2xl bg-[#0e1320] border border-white/10 flex items-start gap-3.5 shadow-xl">
                {/* Number Badge with Icon */}
                <div className="flex flex-col items-center gap-2 shrink-0 pt-0.5">
                  <div className="w-7 h-7 rounded-lg bg-[#261A0C] border border-[#854D0E]/60 text-[#F59E0B] text-xs font-black flex items-center justify-center shadow-sm">
                    {storyNumber || 1}
                  </div>
                  <span className="text-lg leading-none">{icon || "🏆"}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-extrabold text-white leading-snug">
                    {title || "Story Headline Preview"}
                  </h4>
                  <p className="text-xs font-normal text-gray-400 leading-relaxed mt-1">
                    {description || "The story summary and description will appear here on the user interface."}
                  </p>
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
