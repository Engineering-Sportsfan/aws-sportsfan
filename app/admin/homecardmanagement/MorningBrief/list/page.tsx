"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { 
  Sun, 
  Plus, 
  Pencil, 
  Trash2, 
  Eye, 
  EyeOff, 
  ArrowLeft, 
  Loader2, 
  Search,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface MorningBriefItem {
  id: string;
  type: string;
  storyNumber: number;
  order: number;
  title: string;
  description: string;
  sport: string;
  icon: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export default function MorningBriefListPage() {
  const [stories, setStories] = useState<MorningBriefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchStories = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/welcomemessage?type=morning_brief&includeInactive=true");
      if (res.data.success && res.data.items) {
        setStories(res.data.items);
      }
    } catch (err) {
      console.error("Failed to load Morning Brief stories", err);
      setAlertMsg({ type: "error", text: "Failed to load stories from DynamoDB" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  const handleToggleActive = async (story: MorningBriefItem) => {
    const nextActive = story.active === false ? true : false;
    setTogglingId(story.id);
    try {
      await axios.put("/api/welcomemessage", {
        id: story.id,
        active: nextActive,
      });
      setStories((prev) =>
        prev.map((item) => (item.id === story.id ? { ...item, active: nextActive } : item))
      );
      setAlertMsg({
        type: "success",
        text: `Story #${story.storyNumber} is now ${nextActive ? "Active" : "Inactive"}`,
      });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err) {
      console.error("Failed to toggle active status", err);
      alert("Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (story: MorningBriefItem) => {
    const confirmed = window.confirm(`Delete Morning Brief story #${story.storyNumber} (${story.title})?`);
    if (!confirmed) return;

    setDeletingId(story.id);
    try {
      await axios.delete(`/api/welcomemessage?id=${story.id}`);
      setStories((prev) => prev.filter((item) => item.id !== story.id));
      setAlertMsg({ type: "success", text: "Story deleted successfully from DynamoDB" });
      setTimeout(() => setAlertMsg(null), 3000);
    } catch (err) {
      console.error("Failed to delete story", err);
      alert("Failed to delete story");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredStories = stories.filter((story) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      story.title?.toLowerCase().includes(q) ||
      story.description?.toLowerCase().includes(q) ||
      story.sport?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/homecardmanagement"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌞</span>
              <h1 className="text-2xl font-black text-white tracking-tight">
                Morning Brief Stories
              </h1>
            </div>
            <p className="text-xs text-gray-400">
              Manage the 5 stories shown in the Morning Brief modal on the home page
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/homecardmanagement/MorningBrief/add">
            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all shadow-md">
              <Plus size={16} />
              <span>Add New Story</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Alert Notification if any */}
      {alertMsg && (
        <div
          className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-all ${
            alertMsg.type === "success"
              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/30"
              : "bg-rose-950/80 text-rose-400 border border-rose-500/30"
          }`}
        >
          {alertMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="p-4 rounded-2xl bg-[#111625] border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, sport or keyword..."
            className="w-full bg-[#090C15] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 self-end sm:self-auto">
          <span>
            Total Stories: <strong className="text-white">{stories.length}</strong>
          </span>
          <span>•</span>
          <span className="text-emerald-400 font-semibold">
            Active: <strong>{stories.filter((s) => s.active !== false).length}</strong>
          </span>
        </div>
      </div>

      {/* Stories Table / Card List */}
      <div className="rounded-2xl bg-[#111625] border border-white/10 overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <p className="text-xs">Loading Morning Brief stories from DynamoDB...</p>
          </div>
        ) : filteredStories.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-3">
            <p className="text-sm">No Morning Brief stories found in DynamoDB.</p>
            <Link href="/admin/homecardmanagement/MorningBrief/add">
              <button className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-black">
                Create First Story
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-gray-400 uppercase tracking-wider font-extrabold border-b border-white/10">
                <tr>
                  <th className="p-4 w-16 text-center">#</th>
                  <th className="p-4 w-28">Sport</th>
                  <th className="p-4">Title & Description</th>
                  <th className="p-4 w-28 text-center">Status</th>
                  <th className="p-4 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredStories.map((story, idx) => (
                  <tr
                    key={story.id || idx}
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    {/* Story Number */}
                    <td className="p-4 text-center">
                      <div className="w-7 h-7 rounded-lg bg-[#261A0C] border border-[#854D0E]/60 text-[#F59E0B] font-black text-xs flex items-center justify-center mx-auto shadow-sm">
                        {story.storyNumber || idx + 1}
                      </div>
                    </td>

                    {/* Sport & Icon */}
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl shrink-0">{story.icon || "🏆"}</span>
                        <span className="font-bold text-gray-200 truncate">
                          {story.sport || "General"}
                        </span>
                      </div>
                    </td>

                    {/* Title & Description */}
                    <td className="p-4 min-w-[280px]">
                      <div className="space-y-1">
                        <h4 className="font-black text-white text-sm leading-snug">
                          {story.title}
                        </h4>
                        <p className="text-gray-400 text-xs leading-relaxed max-w-2xl">
                          {story.description}
                        </p>
                      </div>
                    </td>

                    {/* Active Toggle Button */}
                    <td className="p-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(story)}
                        disabled={togglingId === story.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[11px] transition-all cursor-pointer ${
                          story.active !== false
                            ? "bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-900/60"
                            : "bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700"
                        }`}
                      >
                        {togglingId === story.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : story.active !== false ? (
                          <>
                            <Eye size={12} />
                            <span>Active</span>
                          </>
                        ) : (
                          <>
                            <EyeOff size={12} />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Edit & Delete Actions */}
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/homecardmanagement/MorningBrief/add?editId=${story.id}`}
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition-colors"
                          title="Edit Story"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(story)}
                          disabled={deletingId === story.id}
                          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                          title="Delete Story"
                        >
                          {deletingId === story.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
