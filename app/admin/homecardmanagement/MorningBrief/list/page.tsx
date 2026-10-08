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
  AlertCircle,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Check,
  Calendar,
  Clock
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
  date?: string;
  time?: string;
  active: boolean;
  predictId?: string;
  predictTitle?: string;
  predictUrl?: string;
  discussPostId?: string;
  discussTitle?: string;
  discussUrl?: string;
  debateRoomId?: string;
  debateTitle?: string;
  debateUrl?: string;
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

  // Drag and Drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [orderSavedNotification, setOrderSavedNotification] = useState(false);

  const fetchStories = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/welcomemessage?type=morning_brief&includeInactive=true");
      if (res.data.success && res.data.items) {
        // Ensure sorted by order/storyNumber
        const sorted = [...res.data.items].sort(
          (a, b) => Number(a.order ?? a.storyNumber ?? 0) - Number(b.order ?? b.storyNumber ?? 0)
        );
        setStories(sorted);
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

  // Save new order to DynamoDB in batch
  const saveReorderedStories = async (reordered: MorningBriefItem[], movedItemTitle?: string, newPos?: number) => {
    setIsSavingOrder(true);
    try {
      await axios.put("/api/welcomemessage", {
        action: "reorder",
        items: reordered.map((item) => ({
          id: item.id,
          order: item.order,
          storyNumber: item.storyNumber,
        })),
      });

      setOrderSavedNotification(true);
      setTimeout(() => setOrderSavedNotification(false), 3000);

      setAlertMsg({
        type: "success",
        text: movedItemTitle
          ? `Story "${movedItemTitle.substring(0, 30)}..." moved to position #${newPos} (Saved to DynamoDB)`
          : "Story display order updated in DynamoDB",
      });
      setTimeout(() => setAlertMsg(null), 3500);
    } catch (err) {
      console.error("Failed to save reordered stories to DynamoDB", err);
      setAlertMsg({
        type: "error",
        text: "Failed to persist new story order to DynamoDB",
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Set transparent image or drag data
    e.dataTransfer.setData("text/plain", `${index}`);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = (e: React.DragEvent, index: number) => {
    if (dragOverIndex === index) {
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...stories];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    // Re-assign display order and storyNumber (1-based index)
    const reorderedStories = updated.map((item, idx) => ({
      ...item,
      order: idx + 1,
      storyNumber: idx + 1,
    }));

    setStories(reorderedStories);
    setDraggedIndex(null);
    setDragOverIndex(null);

    saveReorderedStories(reorderedStories, movedItem.title, targetIndex + 1);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Quick Move Up / Down button handler
  const handleMoveStory = (currentIndex: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= stories.length) return;

    const updated = [...stories];
    const [movedItem] = updated.splice(currentIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    const reorderedStories = updated.map((item, idx) => ({
      ...item,
      order: idx + 1,
      storyNumber: idx + 1,
    }));

    setStories(reorderedStories);
    saveReorderedStories(reorderedStories, movedItem.title, targetIndex + 1);
  };

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
        text: `Story #${story.storyNumber} is now ${nextActive ? "Active" : "Hidden"}`,
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
      const remaining = stories
        .filter((item) => item.id !== story.id)
        .map((item, idx) => ({ ...item, order: idx + 1, storyNumber: idx + 1 }));
      setStories(remaining);
      setAlertMsg({ type: "success", text: "Story deleted successfully from DynamoDB" });
      setTimeout(() => setAlertMsg(null), 3000);

      // Persist adjusted sequence
      if (remaining.length > 0) {
        saveReorderedStories(remaining);
      }
    } catch (err) {
      console.error("Failed to delete story", err);
      alert("Failed to delete story");
    } finally {
      setDeletingId(null);
    }
  };

  const isFiltering = !!searchQuery.trim();
  const filteredStories = stories.filter((story) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      story.title?.toLowerCase().includes(q) ||
      story.description?.toLowerCase().includes(q) ||
      story.sport?.toLowerCase().includes(q) ||
      story.date?.toLowerCase().includes(q) ||
      story.time?.toLowerCase().includes(q)
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
              {isSavingOrder && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Saving Order...
                </span>
              )}
              {orderSavedNotification && !isSavingOrder && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 animate-fade-in">
                  <Check size={11} /> Order Synced
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              Drag and drop any story card to change its position, or use up/down buttons
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/homecardmanagement/MorningBrief/add">
            <button className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black transition-all shadow-md cursor-pointer">
              <Plus size={16} />
              <span>Add New Story</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Drag & Drop Instructions Banner */}
      <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/25 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-amber-200">
          <GripVertical size={16} className="text-amber-400 shrink-0" />
          <span>
            <strong>💡 Drag & Drop Reordering:</strong> Grab the <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/20 text-[10px]">⠿</kbd> handle on any story row to drag it up or down. Dragging a card to the top immediately makes it <strong>Story #1</strong> and updates DynamoDB.
          </span>
        </div>
        {isSavingOrder ? (
          <span className="text-[11px] font-mono text-amber-300 flex items-center gap-1 shrink-0">
            <Loader2 size={12} className="animate-spin" /> Syncing...
          </span>
        ) : (
          <span className="text-[11px] font-mono text-amber-400/80 shrink-0 hidden md:inline">
            ✨ Auto-Saves to homeDatabase
          </span>
        )}
      </div>

      {/* Alert Notification Toast */}
      {alertMsg && (
        <div
          className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-all shadow-lg ${
            alertMsg.type === "success"
              ? "bg-emerald-950/90 text-emerald-300 border border-emerald-500/40"
              : "bg-rose-950/90 text-rose-300 border border-rose-500/40"
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
          {isFiltering && (
            <span className="text-amber-400/90 font-medium text-[11px]">
              (Clear search to drag & drop all stories)
            </span>
          )}
          <span>
            Total Stories: <strong className="text-white">{stories.length}</strong>
          </span>
          <span>•</span>
          <span className="text-emerald-400 font-semibold">
            Active: <strong>{stories.filter((s) => s.active !== false).length}</strong>
          </span>
        </div>
      </div>

      {/* Stories Table / Card List with Drag & Drop */}
      <div className="rounded-2xl bg-[#111625] border border-white/10 overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 size={24} className="animate-spin text-amber-500" />
            <p className="text-xs">Loading Morning Brief stories from DynamoDB...</p>
          </div>
        ) : filteredStories.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-3">
            <p className="text-sm">No Morning Brief stories found in DynamoDB.</p>
            <Link href="/admin/homecardmanagement/MorningBrief/add">
              <button className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-black cursor-pointer">
                Create First Story
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.03] text-gray-400 uppercase tracking-wider font-extrabold border-b border-white/10">
                <tr>
                  <th className="p-4 w-12 text-center">Move</th>
                  <th className="p-4 w-20 text-center">Order #</th>
                  <th className="p-4 w-28">Sport</th>
                  <th className="p-4">Title & Description</th>
                  <th className="p-4 w-28 text-center">Status</th>
                  <th className="p-4 w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredStories.map((story, idx) => {
                  const isBeingDragged = draggedIndex === idx;
                  const isDragTarget = dragOverIndex === idx && draggedIndex !== idx;
                  const canMoveUp = idx > 0 && !isFiltering;
                  const canMoveDown = idx < filteredStories.length - 1 && !isFiltering;

                  return (
                    <tr
                      key={story.id || idx}
                      draggable={!isFiltering}
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragLeave={(e) => handleDragLeave(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={`transition-all group select-none ${
                        isBeingDragged
                          ? "opacity-35 bg-amber-500/10 scale-[0.99] border-dashed border-amber-500/50"
                          : isDragTarget
                          ? "bg-amber-500/20 border-t-2 border-t-amber-400"
                          : "hover:bg-white/[0.025]"
                      } ${!isFiltering ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      {/* Drag Handle & Quick Reorder Controls */}
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <div
                            title={isFiltering ? "Clear search filter to drag" : "Drag to reorder story"}
                            className={`p-1.5 rounded-lg text-gray-500 group-hover:text-amber-400 group-hover:bg-amber-500/10 transition-colors ${
                              isFiltering ? "opacity-30 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
                            }`}
                          >
                            <GripVertical size={16} />
                          </div>

                          {/* Quick 1-click step buttons */}
                          {!isFiltering && (
                            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                disabled={!canMoveUp}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveStory(idx, "up");
                                }}
                                title="Move up"
                                className="p-0.5 rounded bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <ArrowUp size={10} />
                              </button>
                              <button
                                type="button"
                                disabled={!canMoveDown}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveStory(idx, "down");
                                }}
                                title="Move down"
                                className="p-0.5 rounded bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer"
                              >
                                <ArrowDown size={10} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Dynamic Position / Story Number Badge */}
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center mx-auto shadow-md transition-all ${
                              idx === 0
                                ? "bg-gradient-to-tr from-amber-600 to-yellow-400 text-black shadow-amber-500/30 scale-105"
                                : "bg-[#261A0C] border border-[#854D0E]/60 text-[#F59E0B]"
                            }`}
                          >
                            {idx + 1}
                          </div>
                          {idx === 0 && (
                            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-tighter mt-1">
                              Top Story
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sport & Icon */}
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xl shrink-0">{story.icon || "🏆"}</span>
                          <span className="font-extrabold text-white truncate">
                            {story.sport || "General"}
                          </span>
                        </div>
                      </td>

                      {/* Title & Description & CTAs & Date/Time */}
                      <td className="p-4 min-w-[280px]">
                        <div className="space-y-1.5">
                          {/* Date & Time badges */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                              <Calendar size={10} className="text-amber-400" />
                              <span>{story.date || "Today (IST)"}</span>
                            </span>
                            {story.time && (
                              <span className="text-[10px] font-bold text-gray-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                                <Clock size={10} className="text-gray-400" />
                                <span>{story.time}</span>
                              </span>
                            )}
                          </div>

                          <h4 className="font-black text-white text-sm leading-snug">
                            {story.title}
                          </h4>
                          <p className="text-gray-400 text-xs leading-relaxed max-w-2xl line-clamp-2">
                            {story.description}
                          </p>

                          {/* Configured CTAs badges */}
                          {(Boolean(story.predictId) || Boolean(story.discussPostId) || Boolean(story.debateRoomId)) && (
                            <div className="flex items-center flex-wrap gap-1.5 pt-1">
                              {Boolean(story.predictId) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/30">
                                  🎯 Predict
                                </span>
                              )}
                              {Boolean(story.discussPostId) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                                  💬 Discuss
                                </span>
                              )}
                              {Boolean(story.debateRoomId) && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  🔴 Debate
                                </span>
                              )}
                            </div>
                          )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
