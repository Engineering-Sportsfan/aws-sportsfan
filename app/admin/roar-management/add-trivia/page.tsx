"use client";
import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Clock, Brain, ChevronDown, ChevronUp, GripVertical, AlertCircle, CheckCircle2, RefreshCw, Check } from "lucide-react";
import axios from "axios";

interface Room {
  roomId: string;
  name: string;
  icon?: string;
}

interface TriviaOptionForm {
  id: string;
  label: string;
}

interface TriviaQuestionForm {
  id: string;
  question: string;
  options: TriviaOptionForm[];
  correctOptionId: string | null;
  collapsed: boolean;
}

interface TriviaForm {
  matchTitle: string;
  roomId: string;
  durationMinutes: number;
  questions: TriviaQuestionForm[];
}

interface ExistingTrivia {
  msgId: string;
  matchTitle: string;
  questions: { question: string; options: { label: string; isCorrect?: boolean }[] }[];
  closesAt: number;
  createdAt: number;
  authorUsername?: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);
const makeOption = (label = ""): TriviaOptionForm => ({ id: uid(), label });
const makeQuestion = (): TriviaQuestionForm => {
  const a = makeOption("");
  const b = makeOption("");
  return {
    id: uid(), question: "",
    options: [a, b],
    correctOptionId: a.id,
    collapsed: false,
  };
};

// ── Option Row ────────────────────────────────────────────────────────────────
function OptionRow({ opt, index, total, isCorrect, onChange, onRemove, onSetCorrect }: {
  opt: TriviaOptionForm; index: number; total: number; isCorrect: boolean;
  onChange: (val: string) => void; onRemove: () => void; onSetCorrect: () => void;
}) {
  const optLabel = String.fromCharCode(65 + index);
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onSetCorrect} title="Mark as correct answer"
        className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-extrabold flex-shrink-0 border cursor-pointer transition-colors ${isCorrect ? "bg-[#22c55e] border-[#22c55e] text-black" : "bg-white/[0.06] border-white/10 text-white/40"}`}>
        {isCorrect ? <Check size={12} strokeWidth={3} /> : optLabel}
      </button>
      <input type="text" placeholder={`Option ${optLabel} label`} value={opt.label}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-white/[0.04] border rounded-[10px] outline-none px-3 py-[9px] text-white text-[13px] box-border transition-colors focus:border-[rgba(34,197,94,0.5)] ${isCorrect ? "border-[rgba(34,197,94,0.35)]" : "border-white/10"}`} />
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
  q: TriviaQuestionForm; index: number; total: number;
  onChange: (updated: TriviaQuestionForm) => void; onRemove: () => void; onToggle: () => void;
}) {
  const updateOption = (optId: string, val: string) =>
    onChange({ ...q, options: q.options.map(o => o.id === optId ? { ...o, label: val } : o) });
  const removeOption = (optId: string) => {
    const remaining = q.options.filter(o => o.id !== optId);
    onChange({
      ...q,
      options: remaining,
      correctOptionId: q.correctOptionId === optId ? (remaining[0]?.id ?? null) : q.correctOptionId,
    });
  };
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
        <span className="text-[10px] font-extrabold tracking-[0.06em] bg-gradient-to-r from-[#22c55e] to-[#06b6d4] bg-clip-text text-transparent flex-shrink-0">Q{index + 1}</span>
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
                <input type="text" placeholder='e.g. "Who has the most ODI centuries?"' value={q.question}
                  onChange={e => onChange({ ...q, question: e.target.value })}
                  className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-sm font-semibold box-border focus:border-[rgba(34,197,94,0.5)] transition-colors" />
              </div>
              <div>
                <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">
                  Options <span className="text-white/25 font-normal">({q.options.length}/6) · tap circle to mark correct answer</span>
                </label>
                <div className="flex flex-col gap-2">
                  {q.options.map((opt, oi) => (
                    <OptionRow key={opt.id} opt={opt} index={oi} total={q.options.length}
                      isCorrect={q.correctOptionId === opt.id}
                      onChange={val => updateOption(opt.id, val)}
                      onRemove={() => removeOption(opt.id)}
                      onSetCorrect={() => onChange({ ...q, correctOptionId: opt.id })} />
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
function TriviaPreview({ form }: { form: TriviaForm }) {
  const validQs = form.questions.filter(q => q.question && q.options.every(o => o.label) && q.correctOptionId);
  if (!validQs.length) return null;
  const hh = String(Math.floor(form.durationMinutes / 60)).padStart(2, "0");
  const mm = String(form.durationMinutes % 60).padStart(2, "0");
  return (
    <div className="bg-[#0e0e16] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[rgba(34,197,94,0.08)] border-b border-[rgba(34,197,94,0.15)]">
        <div className="flex items-center gap-2">
          <span className="w-[7px] h-[7px] rounded-full bg-[#22c55e] inline-block animate-pulse" />
          <span className="text-[10px] font-extrabold text-[#22c55e] tracking-[0.08em]">TRIVIA</span>
          <span className="text-[9px] text-white/35">🧠 {form.matchTitle || "MATCH"} · {validQs.length} question{validQs.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-1 bg-white/[0.07] rounded-lg px-2 py-[3px]">
          <Clock size={11} className="text-white/50" />
          <span className="text-[11px] font-bold text-white/70 font-mono">{hh}:{mm}</span>
        </div>
      </div>
      <div className="flex flex-col">
        {validQs.map((q, qi) => (
          <div key={q.id} className={`px-3.5 py-[11px] ${qi < validQs.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
            <span className="text-[13px] font-semibold text-[#F5F5FA] block mb-2">{q.question}</span>
            <div className="flex flex-wrap gap-1.5">
              {q.options.map(opt => (
                <div key={opt.id} className={`flex items-center gap-1.5 rounded-lg px-[9px] py-1 border ${opt.id === q.correctOptionId ? "bg-[rgba(34,197,94,0.14)] border-[rgba(34,197,94,0.35)]" : "bg-white/[0.05] border-white/10"}`}>
                  {opt.id === q.correctOptionId && <Check size={11} className="text-[#22c55e]" strokeWidth={3} />}
                  <span className="text-[11px] font-bold text-white whitespace-nowrap">{opt.label}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Existing Trivia Card ──────────────────────────────────────────────────────
function ExistingTriviaCard({ item, roomId, onDeleted }: {
  item: ExistingTrivia; roomId: string; onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isExpired = item.closesAt < Date.now();
  const remMins = Math.ceil((item.closesAt - Date.now()) / 60000);

  const handleDelete = async () => {
    if (!window.confirm("Delete this trivia from the room?")) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/roar/rooms/${roomId}/messages/${item.msgId}`);
      onDeleted(item.msgId);
    } catch {
      alert("Failed to delete trivia");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#21262d]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-extrabold text-[#22c55e] tracking-widest">TRIVIA</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${isExpired ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"}`}>
              {isExpired ? "Expired" : `${remMins}m left`}
            </span>
          </div>
          <p className="text-[13px] font-bold text-white mt-0.5 truncate">{item.matchTitle}</p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {item.questions.length} question{item.questions.length !== 1 ? "s" : ""} · Created {new Date(item.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })} at {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {item.authorUsername && <> · by <span className="text-white/50">@{item.authorUsername}</span></>}
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
            title="Delete trivia">
            {deleting
              ? <span className="w-[15px] h-[15px] rounded-full border-2 border-red-400 border-t-transparent animate-spin inline-block" />
              : <Trash2 size={15} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            <div className="flex flex-col">
              {item.questions.map((q, qi) => (
                <div key={qi} className={`px-4 py-3 ${qi < item.questions.length - 1 ? "border-b border-[#21262d]" : ""}`}>
                  <span className="text-[13px] font-semibold text-white/85 block mb-1.5">{q.question}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className={`flex items-center gap-1 rounded-lg px-2 py-0.5 border text-[11px] font-bold text-white ${opt.isCorrect ? "bg-[rgba(34,197,94,0.12)] border-[rgba(34,197,94,0.3)]" : "bg-white/[0.04] border-white/10"}`}>
                        {opt.isCorrect && <Check size={10} className="text-[#22c55e]" strokeWidth={3} />}
                        {opt.label}
                      </div>
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
export default function TriviaAdmin() {
  const [form, setForm] = useState<TriviaForm>({
    matchTitle: "", roomId: "", durationMinutes: 30, questions: [makeQuestion()],
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "preview">("form");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);

  const [existingItems, setExistingItems] = useState<ExistingTrivia[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsRoomId, setItemsRoomId] = useState<string>("");

  useEffect(() => {
    axios.get("/api/roar/rooms")
      .then(res => setRooms(res.data.rooms || []))
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, []);

  const fetchExistingItems = useCallback(async (roomId: string) => {
    if (!roomId) { setExistingItems([]); return; }
    setItemsLoading(true);
    try {
      const res = await axios.get(`/api/roar/rooms/${roomId}/messages?limit=100`);
      const msgs: any[] = res.data.messages || [];
      const items: ExistingTrivia[] = msgs
        .filter(m => m.type === "trivia")
        .map(m => ({
          msgId: m.msgId,
          matchTitle: m.matchTitle || m.text || "Untitled",
          questions: m.triviaQuestions || [],
          closesAt: m.closesAt || 0,
          createdAt: m.createdAt || 0,
          authorUsername: m.authorUsername,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
      setExistingItems(items);
    } catch {
      setExistingItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const handleRoomChange = (roomId: string, roomName?: string) => {
    setForm(f => ({ ...f, roomId, matchTitle: f.matchTitle || roomName || "" }));
    setItemsRoomId(roomId);
    fetchExistingItems(roomId);
  };

  const updateQuestion = useCallback((id: string, updated: TriviaQuestionForm) =>
    setForm(f => ({ ...f, questions: f.questions.map(q => q.id === id ? updated : q) })), []);

  const removeQuestion = useCallback((id: string) =>
    setForm(f => ({ ...f, questions: f.questions.filter(q => q.id !== id) })), []);

  const toggleQuestion = (id: string) =>
    setForm(f => ({ ...f, questions: f.questions.map(q => q.id === id ? { ...q, collapsed: !q.collapsed } : q) }));

  const validate = (): string | null => {
    if (!form.matchTitle.trim()) return "Match title is required.";
    if (!form.roomId.trim()) return "Room is required.";
    if (form.durationMinutes < 1) return "Timer must be at least 1 minute.";
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.question.trim()) return `Question ${i + 1} is missing text.`;
      if (q.options.length < 2) return `Question ${i + 1} needs at least 2 options.`;
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].label.trim()) return `Question ${i + 1}, option ${String.fromCharCode(65 + j)} is missing a label.`;
      }
      if (!q.correctOptionId || !q.options.some(o => o.id === q.correctOptionId)) {
        return `Question ${i + 1} needs a correct answer selected.`;
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
      const res = await fetch(`/api/roar/rooms/${form.roomId.trim()}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: form.matchTitle.trim(),
          type: "trivia",
          matchTitle: form.matchTitle.trim(),
          triviaQuestions: form.questions.map(q => ({
            question: q.question.trim(),
            options: q.options.map(o => ({
              label: o.label.trim(),
              isCorrect: o.id === q.correctOptionId,
            })),
          })),
          closesAt: Date.now() + form.durationMinutes * 60_000,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setSubmitted(true);
      fetchExistingItems(form.roomId);
    } catch (err: any) {
      setError(err.message || "Failed to create trivia. Try again.");
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
          <h2 className="text-[22px] font-extrabold text-white m-0">Trivia Live!</h2>
          <p className="text-[13px] text-white/50 m-0">
            {form.questions.length} question{form.questions.length !== 1 ? "s" : ""} posted to{" "}
            <strong className="text-white">{form.matchTitle}</strong>. The timer has started.
          </p>
          <button type="button" onClick={resetForm}
            className="mt-2 px-6 py-3.5 bg-gradient-to-br from-[#22c55e] to-[#06b6d4] border-none rounded-xl text-white text-sm font-extrabold cursor-pointer tracking-wide">
            Create Another
          </button>
        </motion.div>

        {itemsRoomId && (
          <ExistingTriviaPanel
            roomId={itemsRoomId} items={existingItems} loading={itemsLoading}
            onDeleted={id => setExistingItems(p => p.filter(x => x.msgId !== id))}
            onRefresh={() => fetchExistingItems(itemsRoomId)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a10] text-white font-sans">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <Brain size={18} color="#22c55e" />
            <h1 className="text-xl font-black text-white m-0 tracking-tight">Trivia</h1>
          </div>
          <p className="text-xs text-white/40 m-0">Create and manage trivia questions for match rooms</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className="w-full lg:w-[520px] flex-shrink-0">
            <div className="flex gap-1 mb-4">
              {(["form", "preview"] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                  className={`px-[18px] py-[7px] rounded-full text-xs font-bold cursor-pointer border transition-all ${activeTab === tab ? "border-[rgba(34,197,94,0.5)] bg-[rgba(34,197,94,0.12)] text-[#22c55e]" : "border-white/10 bg-transparent text-white/40"}`}>
                  {tab === "form" ? "✏️  Form" : "👁  Preview"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <AnimatePresence mode="wait">
                {activeTab === "form" ? (
                  <motion.div key="form" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }} className="flex flex-col gap-4">

                    <div className="bg-[rgba(18,18,28,0.7)] border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-3">
                      <p className="text-[12px] font-extrabold tracking-[0.06em] text-white/55 uppercase m-0">Trivia Info</p>
                      <div>
                        <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">
                          Match / Title <span className="text-[#f87171]">*</span>
                        </label>
                        <input type="text" placeholder='e.g. "IND VS PAK Trivia"' value={form.matchTitle}
                          onChange={e => setForm(f => ({ ...f, matchTitle: e.target.value }))}
                          className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-[15px] font-bold box-border focus:border-[rgba(34,197,94,0.5)] transition-colors"
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
                            className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] pr-9 text-white text-[13px] box-border focus:border-[rgba(34,197,94,0.5)] transition-colors cursor-pointer disabled:opacity-50">
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

                    <div className="bg-[rgba(18,18,28,0.7)] border border-white/[0.07] rounded-2xl p-4">
                      <p className="text-[12px] font-extrabold tracking-[0.06em] text-white/55 uppercase mb-3.5 flex items-center gap-1.5">
                        <Clock size={13} /> Timer
                      </p>
                      <div className="flex gap-2.5 items-end">
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">Hours</label>
                          <input type="number" min={0} max={24} value={Math.floor(form.durationMinutes / 60)}
                            onChange={e => setForm(f => ({ ...f, durationMinutes: Number(e.target.value) * 60 + (f.durationMinutes % 60) }))}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-lg font-bold text-center font-mono box-border focus:border-[rgba(34,197,94,0.5)] transition-colors" />
                        </div>
                        <span className="text-2xl text-white/30 pb-[9px]">:</span>
                        <div className="flex-1">
                          <label className="block text-[11px] font-bold tracking-[0.06em] text-white/45 uppercase mb-2">Minutes</label>
                          <input type="number" min={0} max={59} value={form.durationMinutes % 60}
                            onChange={e => setForm(f => ({ ...f, durationMinutes: Math.floor(f.durationMinutes / 60) * 60 + Number(e.target.value) }))}
                            className="w-full bg-white/[0.04] border border-white/10 rounded-[10px] outline-none px-3 py-[9px] text-white text-lg font-bold text-center font-mono box-border focus:border-[rgba(34,197,94,0.5)] transition-colors" />
                        </div>
                      </div>
                      <p className="text-[11px] text-white/30 mt-2">One timer applies to the whole trivia set — all questions close together</p>
                    </div>

                    <div className="flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[12px] font-extrabold tracking-[0.06em] text-white/55 uppercase m-0">
                          Questions <span className="text-[10px] text-white/25 font-normal ml-2">({form.questions.length}/10)</span>
                        </p>
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, questions: [...f.questions.map(q => ({ ...q, collapsed: true })), makeQuestion()] }))}
                          disabled={form.questions.length >= 10}
                          className="flex items-center gap-1 bg-[rgba(34,197,94,0.12)] border border-[rgba(34,197,94,0.3)] rounded-[10px] px-3 py-1.5 text-[#22c55e] text-xs font-bold cursor-pointer disabled:opacity-40">
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
                    <TriviaPreview form={form} />
                    {form.questions.some(q => !q.question || q.options.some(o => !o.label) || !q.correctOptionId) && (
                      <div className="flex items-center gap-2 bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] rounded-[10px] px-3 py-2.5">
                        <AlertCircle size={14} color="#f59e0b" />
                        <span className="text-xs text-[#f59e0b]">Fill in all questions, options and correct answers to see the full preview</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 bg-[rgba(239,68,68,0.09)] border border-[rgba(239,68,68,0.25)] rounded-[10px] px-3 py-2.5">
                    <AlertCircle size={14} color="#f87171" className="mt-px flex-shrink-0" />
                    <span className="text-xs text-[#f87171]">{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <motion.button type="submit" whileTap={{ scale: 0.98 }} disabled={submitting}
                  className="w-full py-3.5 px-6 bg-gradient-to-br from-[#22c55e] to-[#06b6d4] border-none rounded-xl text-white text-sm font-extrabold cursor-pointer tracking-wide disabled:opacity-70">
                  {submitting ? (
                    <span className="flex items-center gap-2 justify-center">
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin inline-block" />
                      Publishing…
                    </span>
                  ) : (
                    `🧠  Publish ${form.questions.length} Question${form.questions.length !== 1 ? "s" : ""}`
                  )}
                </motion.button>
                <p className="text-[11px] text-white/25 text-center mt-2.5">Trivia closes automatically after the timer expires</p>
              </div>
            </form>
          </div>

          <div className="flex-1 min-w-0">
            {itemsRoomId ? (
              <ExistingTriviaPanel
                roomId={itemsRoomId} items={existingItems} loading={itemsLoading}
                onDeleted={id => setExistingItems(p => p.filter(x => x.msgId !== id))}
                onRefresh={() => fetchExistingItems(itemsRoomId)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-white/[0.08] rounded-2xl">
                <Brain size={32} color="rgba(255,255,255,0.1)" className="mb-3" />
                <p className="text-[13px] text-white/25">Select a room to see existing trivia</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExistingTriviaPanel({ roomId, items, loading, onDeleted, onRefresh }: {
  roomId: string; items: ExistingTrivia[]; loading: boolean;
  onDeleted: (id: string) => void; onRefresh: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-extrabold text-white m-0">Existing Trivia</h2>
          <p className="text-[11px] text-white/35 mt-0.5">
            {loading ? "Loading…" : `${items.length} trivia set${items.length !== 1 ? "s" : ""} in this room`}
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
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-white/[0.08] rounded-2xl">
          <p className="text-[13px] text-white/30 m-0">No trivia in this room yet</p>
          <p className="text-[11px] text-white/20 mt-1">Create one using the form on the left</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {items.map(item => (
              <ExistingTriviaCard key={item.msgId} item={item} roomId={roomId} onDeleted={onDeleted} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}