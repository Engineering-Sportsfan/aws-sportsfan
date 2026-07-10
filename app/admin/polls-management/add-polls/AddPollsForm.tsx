"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { ArrowLeft } from "lucide-react";

type PollType = "poll" | "quiz";

interface OptionInput {
  label: string;
  isCorrect: boolean;
}

interface DateTimeState {
  days: number;
  hours: number;
  minutes: number;
}

export default function AddPollsForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pollId = searchParams.get("id");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Form state
  const [type, setType] = useState<PollType>("poll");
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState<OptionInput[]>([
    { label: "", isCorrect: false },
    { label: "", isCorrect: false },
  ]);
  
  // DateTime state
  const [endDateTime, setEndDateTime] = useState<DateTimeState>({
    days: 1,
    hours: 0,
    minutes: 0,
  });
  const [customDate, setCustomDate] = useState<string>("");

  // Load poll data for editing - wrap in useCallback
  const fetchPollForEdit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/polls/${pollId}`);
      const poll = res.data.data;
      setTitle(poll.title);
      setType(poll.type);
      setOptions(poll.options.map((opt: { label: string; isCorrect?: boolean }) => ({
        label: opt.label,
        isCorrect: opt.isCorrect || false,
      })));
      
      // Parse endsAt date
      const endsAtDate = new Date(poll.endsAt);
      const now = new Date();
      const diffMs = endsAtDate.getTime() - now.getTime();
      
      if (diffMs > 0) {
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        setEndDateTime({
          days: diffDays,
          hours: diffHours,
          minutes: diffMinutes,
        });
      }
      
      // Set custom date for display
      setCustomDate(endsAtDate.toISOString().slice(0, 16));
    } catch (error) {
      console.error("Failed to fetch poll", error);
      setFormError("Failed to load poll data");
    } finally {
      setLoading(false);
    }
  }, [pollId]); // Add pollId as dependency

  useEffect(() => {
    if (pollId) {
      fetchPollForEdit();
    }
  }, [pollId, fetchPollForEdit]); // Add both dependencies

  // Form helpers
  function addOption() {
    if (options.length >= 6) return;
    setOptions((p) => [...p, { label: "", isCorrect: false }]);
  }

  function removeOption(i: number) {
    if (options.length <= 2) return;
    setOptions((p) => p.filter((_, idx) => idx !== i));
  }

  function updateLabel(i: number, val: string) {
    setOptions((p) => p.map((o, idx) => (idx === i ? { ...o, label: val } : o)));
  }

  function toggleCorrect(i: number) {
    setOptions((p) => p.map((o, idx) => (idx === i ? { ...o, isCorrect: !o.isCorrect } : o)));
  }

  function resetForm() {
    setTitle("");
    setType("poll");
    setOptions([{ label: "", isCorrect: false }, { label: "", isCorrect: false }]);
    setEndDateTime({ days: 1, hours: 0, minutes: 0 });
    setCustomDate("");
    setFormError("");
  }

  function updateEndDateTime(field: keyof DateTimeState, value: number) {
    setEndDateTime(prev => ({
      ...prev,
      [field]: Math.max(0, value)
    }));
  }

  function getEndsAtISO(): string {
    if (customDate) {
      return new Date(customDate).toISOString();
    }
    
    const now = new Date();
    const totalMinutes = 
      (endDateTime.days * 24 * 60) + 
      (endDateTime.hours * 60) + 
      endDateTime.minutes;
    
    return new Date(now.getTime() + totalMinutes * 60 * 1000).toISOString();
  }

  async function handleSubmit() {
    setFormError("");
    if (!title.trim()) return setFormError("Title is required.");
    if (options.some((o) => !o.label.trim())) return setFormError("All options need a label.");
    if (type === "quiz" && !options.some((o) => o.isCorrect))
      return setFormError("Mark at least one correct answer.");

    const endsAt = getEndsAtISO();
    if (new Date(endsAt) <= new Date()) {
      return setFormError("End time must be in the future.");
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        type,
        options: options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })),
        endsAt,
      };

      if (pollId) {
        await axios.put(`/api/polls/${pollId}`, payload);
      } else {
        await axios.post("/api/polls", payload);
      }

      resetForm();
      router.push("/admin/polls-management/polls-list");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "An unknown error occurred";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white font-sans">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Back</span>
        </button>

        {/* Page header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-purple-400 text-2xl">✦</span>
          <h1 className="text-2xl font-bold tracking-tight">
            {pollId ? "Edit" : "Create New"} {type === "quiz" ? "Quiz" : "Poll"}
          </h1>
        </div>

        {/* Form */}
        <div className="bg-[#16162a] border border-white/10 rounded-2xl p-6 space-y-5">
          {/* Type toggle */}
          <div className="flex rounded-lg overflow-hidden border border-white/10 w-fit">
            {(["poll", "quiz"] as PollType[]).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={[
                  "px-6 py-2 text-sm font-semibold capitalize transition-colors",
                  type === t ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Title */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">Question / Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Who are you supporting today?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Options */}
          <div className="space-y-1">
            <label className="text-xs text-gray-400 font-medium">
              Options {type === "quiz" && <span className="text-emerald-400">(tick correct answer)</span>}
            </label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={opt.label}
                    onChange={(e) => updateLabel(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                  {type === "quiz" && (
                    <button
                      onClick={() => toggleCorrect(i)}
                      title="Correct answer"
                      className={[
                        "w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors",
                        opt.isCorrect
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-gray-600 text-gray-600 hover:border-emerald-500",
                      ].join(" ")}
                    >
                      ✓
                    </button>
                  )}
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(i)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xl leading-none w-7 flex-shrink-0 text-center"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <button
                  onClick={addOption}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors mt-1"
                >
                  + Add option
                </button>
              )}
            </div>
          </div>

          {/* End Date & Time */}
          <div className="space-y-3">
            <label className="text-xs text-gray-400 font-medium">Poll End Date & Time</label>
            
            {/* Toggle between relative and absolute date */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setCustomDate("")}
                className={[
                  "px-3 py-1 text-xs rounded transition-colors",
                  !customDate ? "bg-purple-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
                ].join(" ")}
              >
                Relative (Days/Hours)
              </button>
              <button
                type="button"
                onClick={() => setCustomDate(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16))}
                className={[
                  "px-3 py-1 text-xs rounded transition-colors",
                  customDate ? "bg-purple-600 text-white" : "bg-white/5 text-gray-400 hover:text-white"
                ].join(" ")}
              >
                Specific Date
              </button>
            </div>

            {!customDate ? (
              <div className="flex flex-wrap items-center gap-3">
                {/* Days */}
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={endDateTime.days}
                    onChange={(e) => updateEndDateTime("days", parseInt(e.target.value) || 0)}
                    className="w-16 bg-transparent text-white text-sm focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">days</span>
                </div>

                {/* Hours */}
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={endDateTime.hours}
                    onChange={(e) => updateEndDateTime("hours", parseInt(e.target.value) || 0)}
                    className="w-16 bg-transparent text-white text-sm focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">hours</span>
                </div>

                {/* Minutes */}
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={endDateTime.minutes}
                    onChange={(e) => updateEndDateTime("minutes", parseInt(e.target.value) || 0)}
                    className="w-16 bg-transparent text-white text-sm focus:outline-none"
                  />
                  <span className="text-xs text-gray-400">minutes</span>
                </div>
              </div>
            ) : (
              <input
                type="datetime-local"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            )}
            
            <p className="text-xs text-gray-500">
              {!customDate ? "Ends after the specified duration" : "Select exact end date and time"}
            </p>
          </div>

          {formError && <p className="text-red-400 text-xs">{formError}</p>}

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submitting ? "Saving…" : pollId ? "Update" : `Create ${type === "quiz" ? "Quiz" : "Poll"}`}
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
