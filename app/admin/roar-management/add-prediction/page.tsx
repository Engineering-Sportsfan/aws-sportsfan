"use client";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Clock, Trophy, ChevronDown, ChevronUp, GripVertical, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import axios from "axios";

interface Room {
  roomId: string;
  name: string;
  icon?: string;
}

interface PollOption {
  id: string;
  label: string;
  emoji: string;
}

interface PollQuestion {
  id: string;
  question: string;
  options: PollOption[];
  collapsed: boolean;
}

interface PredictionsLiveForm {
  matchTitle: string;
  roomId: string;
  durationMinutes: number;
  questions: PollQuestion[];
  matchStartTime: string;
  matchEndTime: string;
}

interface ExistingPrediction {
  msgId: string;
  matchTitle: string;
  questions: { question: string; options: { label: string; emoji: string }[] }[];
  closesAt: number;
  createdAt: number;
  authorUsername?: string;
}

// IST helpers
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istLocalToTimestamp(localStr: string): number | null {
  if (!localStr) return null;
  const [datePart, timePart] = localStr.split("T");
  if (!datePart || !timePart) return null;
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MS;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const DEFAULT_EMOJIS = ["🏏", "🔥", "⚡", "🏆", "🎯", "📈", "📉", "💥", "✅", "❌", "🟢", "🔴"];
const makeOption = (label = "", emoji = "🏏"): PollOption => ({ id: uid(), label, emoji });
const makeQuestion = (): PollQuestion => ({
  id: uid(), question: "",
  options: [makeOption("", "🏏"), makeOption("", "🎯")],
  collapsed: false,
});

// ── Emoji Picker ──────────────────────────────────────────────────────────────
function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(p => !p)}
        className="w-[38px] h-[38px] rounded-[10px] bg-white/[0.07] border border-white/[0.12] text-lg cursor-pointer flex items-center justify-center flex-shrink-0">
        {value}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, scale: 0.92, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute top-[calc(100%+6px)] left-0 z-50 bg-[#1e1e2c] border border-white/[0.12] rounded-xl p-2 grid grid-cols-6 gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            {DEFAULT_EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => { onChange(e); setOpen(false); }}
                className={`w-8 h-8 rounded-lg border-none text-base cursor-pointer flex items-center justify-center ${e === value ? "bg-[rgba(233,30,140,0.2)]" : "bg-transparent"}`}>
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Option Row ────────────────────────────────────────────────────────────────
function OptionRow({ opt, index, total, onChange, onRemove }: {
  opt: PollOption; index: number; total: number;
  onChange: (field: keyof PollOption, val: string) => void; onRemove: () => void;
}) {
  const optLabel = String.fromCharCode(65 + index);
  return (
    <div className="flex items-center gap-2">
      <span className="w-[22px] h-[22px] rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[10px] font-extrabold text-white/40 flex-shrink-0">{optLabel}</span>
      <EmojiPicker value={opt.emoji} onChange={v => onChange("emoji", v)} />
      <input type="text" placeholder={`Option ${optLabel} label`} value={opt.label}
        onChange={e => onChange("label", e.target.value)}
        className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-[13px] box-border transition-colors focus:border-[rgba(233,30,140,0.5)]" />
      {total > 2 && (
        <button type="button" onClick={onRemove} className="bg-transparent border-none cursor-pointer text-[rgba(248,113,113,0.7)] flex-shrink-0 p-1 flex items-center">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ── Question Card ─────────────────────────────────────────────────────────────
function QuestionCard({ q, index, total, onChange, onRemove, onToggle }: {
  q: PollQuestion; index: number; total: number;
  onChange: (updated: PollQuestion) => void; onRemove: () => void; onToggle: () => void;
}) {
  const updateOption = (optId: string, field: keyof PollOption, val: string) =>
    onChange({ ...q, options: q.options.map(o => o.id === optId ? { ...o, [field]: val } : o) });
  const removeOption = (optId: string) =>
    onChange({ ...q, options: q.options.filter(o => o.id !== optId) });
  const addOption = () => {
    if (q.options.length >= 6) return;
    onChange({ ...q, options: [...q.options, makeOption()] });
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.2 }}
      className="bg-[rgba(18,18,28,0.8)] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div onClick={onToggle}
        className={`flex items-center gap-2.5 px-3.5 py-3 bg-white/[0.03] cursor-pointer ${q.collapsed ? "" : "border-b border-white/[0.06]"}`}>
        <GripVertical size={14} className="text-white/20 flex-shrink-0" />
        <span className="text-[10px] font-extrabold tracking-[0.06em] bg-gradient-to-r from-[#E91E8C] to-[#FF6B35] bg-clip-text text-transparent flex-shrink-0">Q{index + 1}</span>
        <span className={`flex-1 text-[13px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap ${q.question ? "text-white" : "text-white/30"}`}>
          {q.question || "Untitled question"}
        </span>
        <div className="flex items-center gap-1.5">
          {total > 1 && (
            <button type="button" onClick={e => { e.stopPropagation(); onRemove(); }}
              className="bg-transparent border-none cursor-pointer text-[rgba(248,113,113,0.6)] p-1 flex items-center">
              <Trash2 size={14} />
            </button>
          )}
          {q.collapsed ? <ChevronDown size={16} className="text-white/30" /> : <ChevronUp size={16} className="text-white/30" />}
        </div>
      </div>
      <AnimatePresence>
        {!q.collapsed && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="p-3.5 pb-4 flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">Question</label>
                <input type="text" placeholder='e.g. "Who will win today?"' value={q.question}
                  onChange={e => onChange({ ...q, question: e.target.value })}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-sm font-semibold box-border focus:border-[rgba(233,30,140,0.5)] transition-colors" />
              </div>
              <div>
                <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">
                  Options <span className="text-white/25 font-normal">({q.options.length}/6)</span>
                </label>
                <div className="flex flex-col gap-2">
                  {q.options.map((opt, oi) => (
                    <OptionRow key={opt.id} opt={opt} index={oi} total={q.options.length}
                      onChange={(field, val) => updateOption(opt.id, field, val)}
                      onRemove={() => removeOption(opt.id)} />
                  ))}
                </div>
                {q.options.length < 6 && (
                  <button type="button" onClick={addOption}
                    className="mt-2 inline-flex items-center gap-1.5 bg-transparent border border-dashed border-white/[0.14] rounded-lg px-3 py-1.5 text-white/40 text-xs font-semibold cursor-pointer">
                    <Plus size={12} /> Add option
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Form Preview ──────────────────────────────────────────────────────────────
function PredictionsPreview({ form }: { form: PredictionsLiveForm }) {
  const validQs = form.questions.filter(q => q.question && q.options.every(o => o.label));
  if (!validQs.length) return null;
  const hh = String(Math.floor(form.durationMinutes / 60)).padStart(2, "0");
  const mm = String(form.durationMinutes % 60).padStart(2, "0");
  return (
    <div className="bg-[#0e0e16] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[rgba(233,30,140,0.08)] border-b border-[rgba(233,30,140,0.15)]">
        <div className="flex items-center gap-2">
          <span className="w-[7px] h-[7px] rounded-full bg-[#22c55e] inline-block animate-pulse" />
          <span className="text-[10px] font-extrabold text-[#22c55e] tracking-[0.08em]">PREDICTIONS LIVE</span>
          <span className="text-[9px] text-white/35">✏️ {form.matchTitle || "MATCH"} · {validQs.length} poll{validQs.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.07] rounded-lg px-2 py-[3px]">
          <Clock size={11} className="text-white/50" />
          <span className="text-[11px] font-bold text-white/70 font-mono">{hh}:{mm}</span>
        </div>
      </div>
      <div className="flex flex-col">
        {validQs.map((q, qi) => (
          <div key={q.id} className={`flex items-center justify-between px-3.5 py-[11px] gap-3 ${qi < validQs.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
            <span className="text-[13px] font-semibold text-[#F5F5FA] flex-1">{q.question}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              {q.options.slice(0, 2).map((opt, oi) => (
                <>
                  {oi === 1 && <span key="vs" className="text-[10px] font-extrabold text-white/30">VS</span>}
                  <div key={opt.id} className={`flex items-center gap-1.5 rounded-lg px-[9px] py-1 border ${oi === 0 ? "bg-[rgba(233,30,140,0.12)] border-[rgba(233,30,140,0.3)]" : "bg-[rgba(59,130,246,0.12)] border-[rgba(59,130,246,0.3)]"}`}>
                    <span className="text-xs">{opt.emoji}</span>
                    <span className="text-[11px] font-bold text-white whitespace-nowrap">{opt.label}</span>
                  </div>
                </>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Existing Prediction Card ──────────────────────────────────────────────────
function ExistingPredictionCard({ pred, roomId, onDeleted }: {
  pred: ExistingPrediction; roomId: string; onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isExpired = pred.closesAt < Date.now();
  const remaining = pred.closesAt - Date.now();
  const remMins = Math.ceil(remaining / 60000);

  const handleDelete = async () => {
    if (!window.confirm("Delete this predictions poll from the room?")) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/roar/rooms/${roomId}/messages/${pred.msgId}`);
      onDeleted(pred.msgId);
    } catch {
      alert("Failed to delete prediction");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#21262d]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold text-[#22c55e] tracking-widest">PREDICTIONS LIVE</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isExpired ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}`}>
              {isExpired ? "Expired" : `${remMins}m left`}
            </span>
          </div>
          <p className="text-[13px] font-bold text-white mt-0.5 truncate">{pred.matchTitle}</p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {pred.questions.length} poll{pred.questions.length !== 1 ? "s" : ""} · Created {new Date(pred.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} at {new Date(pred.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {pred.authorUsername && <> · by <span className="text-white/50">@{pred.authorUsername}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button type="button" onClick={() => setExpanded(p => !p)}
            className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white hover:bg-white/[0.08] transition cursor-pointer border-none"
            title={expanded ? "Collapse" : "Expand questions"}>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button type="button" onClick={handleDelete} disabled={deleting}
            className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition cursor-pointer disabled:opacity-50"
            title="Delete prediction poll">
            {deleting
              ? <span className="w-[15px] h-[15px] rounded-full border-2 border-red-400 border-t-transparent animate-spin inline-block" />
              : <Trash2 size={15} />}
          </button>
        </div>
      </div>

      {/* Expanded questions */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="flex flex-col">
              {pred.questions.map((q, qi) => (
                <div key={qi} className={`px-4 py-3 flex items-center justify-between gap-3 ${qi < pred.questions.length - 1 ? "border-b border-[#21262d]" : ""}`}>
                  <span className="text-[13px] font-semibold text-white/85 flex-1">{q.question}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {q.options.slice(0, 2).map((opt, oi) => (
                      <>
                        {oi === 1 && <span key="vs" className="text-[9px] font-extrabold text-white/25">VS</span>}
                        <div key={oi} className={`flex items-center gap-1 rounded-lg px-2 py-0.5 border text-[11px] font-bold text-white ${oi === 0 ? "bg-[rgba(233,30,140,0.1)] border-[rgba(233,30,140,0.25)]" : "bg-[rgba(59,130,246,0.1)] border-[rgba(59,130,246,0.25)]"}`}>
                          {opt.emoji} {opt.label}
                        </div>
                      </>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PredictionsLiveAdmin() {
  const [form, setForm] = useState<PredictionsLiveForm>({
    matchTitle: "", roomId: "", durationMinutes: 108,
    matchStartTime: "", matchEndTime: "",
    questions: [makeQuestion()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "preview">("form");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  // Existing predictions state
  const [existingPreds, setExistingPreds] = useState<ExistingPrediction[]>([]);
  const [predsLoading, setPredsLoading] = useState(false);
  const [predsRoomId, setPredsRoomId] = useState<string>("");

  useEffect(() => {
    axios.get("/api/roar/rooms")
      .then(res => setRooms(res.data.rooms || []))
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, []);

  // Fetch existing predictions whenever room selection changes
  const fetchExistingPreds = useCallback(async (roomId: string) => {
    if (!roomId) { setExistingPreds([]); return; }
    setPredsLoading(true);
    try {
      const res = await axios.get(`/api/roar/rooms/${roomId}/messages?limit=100`);
      const msgs: any[] = res.data.messages || [];
      const preds: ExistingPrediction[] = msgs
        .filter(m => m.type === "predictions_live")
        .map(m => ({
          msgId: m.msgId,
          matchTitle: m.matchTitle || m.text || "Untitled",
          questions: m.questions || [],
          closesAt: m.closesAt || 0,
          createdAt: m.createdAt || 0,
          authorUsername: m.authorUsername,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
      setExistingPreds(preds);
    } catch {
      setExistingPreds([]);
    } finally {
      setPredsLoading(false);
    }
  }, []);

  // When room changes in form, also load existing preds for that room
  const handleRoomChange = (roomId: string, roomName?: string) => {
    setForm(f => ({ ...f, roomId, matchTitle: f.matchTitle || roomName || "" }));
    setPredsRoomId(roomId);
    fetchExistingPreds(roomId);
  };

  const updateQuestion = useCallback((id: string, updated: PollQuestion) =>
    setForm(f => ({ ...f, questions: f.questions.map(q => q.id === id ? updated : q) })), []);

  const removeQuestion = useCallback((id: string) =>
    setForm(f => ({ ...f, questions: f.questions.filter(q => q.id !== id) })), []);

  const toggleQuestion = (id: string) =>
    setForm(f => ({ ...f, questions: f.questions.map(q => q.id === id ? { ...q, collapsed: !q.collapsed } : q) }));

  const validate = (): string | null => {
    if (!form.matchTitle.trim()) return "Match title is required.";
    if (!form.roomId.trim()) return "Room is required.";
    if (!form.matchStartTime) return "Match start time (IST) is required.";
    if (!form.matchEndTime) return "Match end time (IST) is required.";
    const start = istLocalToTimestamp(form.matchStartTime)!;
    const end = istLocalToTimestamp(form.matchEndTime)!;
    if (end <= start) return "Match end time must be after start time.";
    if (form.durationMinutes < 1) return "Timer must be at least 1 minute.";
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.question.trim()) return `Question ${i + 1} is missing text.`;
      if (q.options.length < 2) return `Question ${i + 1} needs at least 2 options.`;
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].label.trim()) return `Question ${i + 1}, option ${String.fromCharCode(65 + j)} is missing a label.`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSubmitting(true);
    try {
      const start = istLocalToTimestamp(form.matchStartTime);
      const end = istLocalToTimestamp(form.matchEndTime);
      const res = await fetch(`/api/roar/rooms/${form.roomId.trim()}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: form.matchTitle.trim(),
          type: "predictions_live",
          matchTitle: form.matchTitle.trim(),
          matchStartAt: start,
          matchEndAt: end,
          questions: form.questions.map(q => ({
            question: q.question.trim(),
            options: q.options.map(o => ({ label: o.label.trim(), emoji: o.emoji })),
          })),
          closesAt: Date.now() + form.durationMinutes * 60_000,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSubmitted(true);
      // Refresh existing preds list
      fetchExistingPreds(form.roomId);
    } catch (err: any) {
      setError(err.message || "Failed to create predictions. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm(f => ({ ...f, matchTitle: "", questions: [makeQuestion()] }));
    setSubmitted(false);
    setError(null);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a10] text-white font-sans max-w-6xl mx-auto p-6">
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[rgba(34,197,94,0.15)] border-2 border-[rgba(34,197,94,0.4)] flex items-center justify-center">
            <CheckCircle2 size={28} color="#22c55e" />
          </div>
          <h2 className="text-[22px] font-extrabold text-white m-0">Predictions Live!</h2>
          <p className="text-[13px] text-white/50 m-0">
            {form.questions.length} poll{form.questions.length !== 1 ? "s" : ""} posted to{" "}
            <strong className="text-white">{form.matchTitle}</strong>. The timer has started.
          </p>
          <button type="button" onClick={resetForm}
            className="mt-2 px-6 py-3.5 bg-gradient-to-br from-[#E91E8C] to-[#FF6B35] border-none rounded-xl text-white text-sm font-extrabold cursor-pointer tracking-wide">
            Create Another
          </button>
        </motion.div>

        {/* Show existing after publish too */}
        {predsRoomId && (
          <ExistingPredictionsPanel
            roomId={predsRoomId} preds={existingPreds} loading={predsLoading}
            onDeleted={id => setExistingPreds(p => p.filter(x => x.msgId !== id))}
            onRefresh={() => fetchExistingPreds(predsRoomId)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a10] text-white font-sans">
      <div className="max-w-6xl mx-auto p-6">

        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <Trophy size={18} color="#E91E8C" />
            <h1 className="text-xl font-black text-white m-0 tracking-tight">Predictions Live</h1>
          </div>
          <p className="text-xs text-white/40 m-0">Create and manage live prediction polls for match rooms</p>
        </div>

        {/* Two-column layout on large screens */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* ── LEFT: Form ── */}
          <div className="w-full lg:w-[520px] flex-shrink-0">

            {/* Tabs */}
            <div className="flex gap-1 mb-4">
              {(["form", "preview"] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`px-[18px] py-[7px] rounded-full text-xs font-bold cursor-pointer border transition-all ${activeTab === tab ? "border-[rgba(233,30,140,0.5)] bg-[rgba(233,30,140,0.12)] text-[#E91E8C]" : "border-white/10 bg-transparent text-white/40"}`}>
                  {tab === "form" ? "✏️  Form" : "👁  Preview"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <AnimatePresence mode="wait">
                {activeTab === "form" ? (
                  <motion.div key="form" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="flex flex-col gap-4">

                    {/* Match info */}
                    <div className="bg-[rgba(18,18,28,0.7)] border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-3">
                      <p className="text-[12px] font-extrabold tracking-[0.06em] text-white/55 uppercase m-0">Match Info</p>
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">
                          Match Title <span className="text-[#f87171]">*</span>
                        </label>
                        <input type="text" placeholder='e.g. "IND VS PAK"' value={form.matchTitle}
                          onChange={e => setForm(f => ({ ...f, matchTitle: e.target.value }))}
                          className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-[15px] font-bold box-border focus:border-[rgba(233,30,140,0.5)] transition-colors"
                          required />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">
                          Room <span className="text-[#f87171]">*</span>
                        </label>
                        <div className="relative">
                          <select value={form.roomId}
                            onChange={e => {
                              const chosen = rooms.find(r => r.roomId === e.target.value);
                              handleRoomChange(e.target.value, chosen?.name);
                            }}
                            required disabled={roomsLoading}
                            className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] pr-9 text-white text-[13px] box-border focus:border-[rgba(233,30,140,0.5)] transition-colors cursor-pointer disabled:opacity-50">
                            <option value="" disabled style={{ background: "#1e1e2c", color: "rgba(255,255,255,0.4)" }}>
                              {roomsLoading ? "Loading rooms…" : "Select a room"}
                            </option>
                            {rooms.map(r => (
                              <option key={r.roomId} value={r.roomId} style={{ background: "#1e1e2c", color: "#fff" }}>
                                {r.icon ? `${r.icon}  ` : ""}{r.name}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40">
                            <ChevronDown size={15} />
                          </div>
                        </div>
                        {form.roomId && (
                          <p className="text-[11px] text-white/30 mt-1.5 font-mono">ID: {form.roomId}</p>
                        )}
                        {!roomsLoading && rooms.length === 0 && (
                          <p className="text-[11px] text-[#f59e0b] mt-1.5">
                            No rooms found. <a href="/admin/roar-management/add-roar" className="underline">Create one first.</a>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Timer */}
                    <div className="bg-[rgba(18,18,28,0.7)] border border-white/[0.07] rounded-2xl p-4">
                      <p className="text-[12px] font-extrabold tracking-[0.06em] text-white/55 uppercase mb-3.5 flex items-center gap-1.5">
                        <Clock size={13} /> Timer
                      </p>
                      <div className="flex gap-2.5 items-end">
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">Hours</label>
                          <input type="number" min={0} max={24} value={Math.floor(form.durationMinutes / 60)}
                            onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) * 60 + (f.durationMinutes % 60) }))}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-lg font-bold text-center font-mono box-border focus:border-[rgba(233,30,140,0.5)] transition-colors" />
                        </div>
                        <span className="text-2xl text-white/30 pb-[9px]">:</span>
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">Minutes</label>
                          <input type="number" min={0} max={59} value={form.durationMinutes % 60}
                            onChange={e => setForm(f => ({ ...f, durationMinutes: Math.floor(f.durationMinutes / 60) * 60 + Number(e.target.value) }))}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-lg font-bold text-center font-mono box-border focus:border-[rgba(233,30,140,0.5)] transition-colors" />
                        </div>
                      </div>
                      <p className="text-[11px] text-white/30 mt-2">Polls close and results show automatically after the timer expires</p>
                    </div>

                    <div className="bg-[rgba(18,18,28,0.7)] border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-3">
                      <p className="text-[12px] font-extrabold tracking-[0.06em] text-white/55 uppercase m-0 flex items-center gap-1.5">
                        <Clock size={13} /> Match Time (IST)
                      </p>
                      <div className="flex gap-2.5">
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">
                            Start <span className="text-[#f87171]">*</span>
                          </label>
                          <input type="datetime-local" value={form.matchStartTime}
                            onChange={e => setForm(f => ({ ...f, matchStartTime: e.target.value }))}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-[13px] box-border focus:border-[rgba(233,30,140,0.5)] transition-colors" required />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">
                            End <span className="text-[#f87171]">*</span>
                          </label>
                          <input type="datetime-local" value={form.matchEndTime}
                            onChange={e => setForm(f => ({ ...f, matchEndTime: e.target.value }))}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-[13px] box-border focus:border-[rgba(233,30,140,0.5)] transition-colors" required />
                        </div>
                      </div>
                      <p className="text-[11px] text-white/30">Both times are IST. Predictions section opens by default before Start, and closes by default after Start (fans can still toggle manually).</p>
                    </div>

                    {/* Questions */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[12px] font-extrabold tracking-[0.06em] text-white/55 uppercase m-0">
                          Questions <span className="text-[10px] text-white/25 font-normal ml-2">({form.questions.length}/10)</span>
                        </p>
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, questions: [...f.questions.map(q => ({ ...q, collapsed: true })), makeQuestion()] }))}
                          disabled={form.questions.length >= 10}
                          className="flex items-center gap-1 bg-[rgba(233,30,140,0.12)] border border-[rgba(233,30,140,0.3)] rounded-[10px] px-3 py-1.5 text-[#E91E8C] text-xs font-bold cursor-pointer disabled:opacity-40">
                          <Plus size={13} /> Add Question
                        </button>
                      </div>
                      <AnimatePresence>
                        <div className="flex flex-col gap-2.5">
                          {form.questions.map((q, qi) => (
                            <QuestionCard key={q.id} q={q} index={qi} total={form.questions.length}
                              onChange={updated => updateQuestion(q.id, updated)}
                              onRemove={() => removeQuestion(q.id)}
                              onToggle={() => toggleQuestion(q.id)} />
                          ))}
                        </div>
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="preview" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }} className="flex flex-col gap-3">
                    <p className="text-xs text-white/35 m-0 mb-1">How it will appear in the discussion room:</p>
                    <PredictionsPreview form={form} />
                    {form.questions.some(q => !q.question || q.options.some(o => !o.label)) && (
                      <div className="flex items-center gap-2 bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] rounded-[10px] px-3 py-2.5">
                        <AlertCircle size={14} color="#f59e0b" />
                        <span className="text-xs text-[#f59e0b]">Fill in all questions and options to see the full preview</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 bg-[rgba(239,68,68,0.09)] border border-[rgba(239,68,68,0.25)] rounded-[10px] px-3 py-2.5">
                    <AlertCircle size={14} color="#f87171" className="mt-px flex-shrink-0" />
                    <span className="text-xs text-[#f87171]">{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit */}
              <div>
                <motion.button type="submit" whileTap={{ scale: 0.98 }} disabled={submitting}
                  className="w-full py-3.5 px-6 bg-gradient-to-br from-[#E91E8C] to-[#FF6B35] border-none rounded-xl text-white text-sm font-extrabold cursor-pointer tracking-wide disabled:opacity-70">
                  {submitting ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" />
                      Publishing…
                    </span>
                  ) : (
                    `🚀  Publish ${form.questions.length} Poll${form.questions.length !== 1 ? "s" : ""} Live`
                  )}
                </motion.button>
                <p className="text-[11px] text-white/25 text-center mt-2.5">Polls close automatically after the timer expires</p>
              </div>
            </form>
          </div>

          {/* ── RIGHT: Existing predictions ── */}
          <div className="flex-1 min-w-0">
            {predsRoomId ? (
              <ExistingPredictionsPanel
                roomId={predsRoomId} preds={existingPreds} loading={predsLoading}
                onDeleted={id => setExistingPreds(p => p.filter(x => x.msgId !== id))}
                onRefresh={() => fetchExistingPreds(predsRoomId)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/[0.08] rounded-2xl">
                <Trophy size={32} color="rgba(255,255,255,0.1)" className="mb-3" />
                <p className="text-[13px] text-white/25">Select a room to see existing prediction polls</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Existing Predictions Panel ────────────────────────────────────────────────
function ExistingPredictionsPanel({ roomId, preds, loading, onDeleted, onRefresh }: {
  roomId: string; preds: ExistingPrediction[]; loading: boolean;
  onDeleted: (id: string) => void; onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-extrabold text-white m-0">Existing Polls</h2>
          <p className="text-[11px] text-white/35 mt-0.5">
            {loading ? "Loading…" : `${preds.length} prediction poll${preds.length !== 1 ? "s" : ""} in this room`}
          </p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white/50 hover:text-white text-xs font-semibold cursor-pointer disabled:opacity-40 transition-colors">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-[80px] bg-[#161b22] border border-[#21262d] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : preds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-white/[0.08] rounded-2xl">
          <p className="text-[13px] text-white/30 m-0">No prediction polls in this room yet</p>
          <p className="text-[11px] text-white/20 mt-1">Create one using the form on the left</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {preds.map(pred => (
              <ExistingPredictionCard key={pred.msgId} pred={pred} roomId={roomId} onDeleted={onDeleted} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}