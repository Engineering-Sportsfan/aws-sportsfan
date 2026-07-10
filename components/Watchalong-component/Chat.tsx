"use client";

import axios from "axios";
import { useState, useEffect, useRef, ChangeEvent, InputHTMLAttributes } from "react";

/* ─── Types ─── */
type ChatMessage = {
  id: string;
  user: string;
  text: string;
  color: string;
  createdAt: number;
};

type ChatForm = {
  user: string;
  text: string;
  color: string;
};

const COLOR_OPTIONS = [
  { label: "Pink",   value: "text-pink-400"   },
  { label: "Blue",   value: "text-blue-400"   },
  { label: "Green",  value: "text-green-400"  },
  { label: "Yellow", value: "text-yellow-400" },
  { label: "Purple", value: "text-purple-400" },
  { label: "Orange", value: "text-orange-400" },
];

/* ─────────────────────────────────────────────
   Chat Admin Panel
   Props: matchId → the watch-along match ID
   ───────────────────────────────────────────── */
export default function ChatAdminPanel({ matchId }: { matchId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [form, setForm] = useState<ChatForm>({ user: "", text: "", color: "text-pink-400" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [limit, setLimit] = useState(50);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    setFetching(true);
    try {
      const res = await axios.get(`/api/watch-along/matches/${matchId}/chat?limit=${limit}`);
      if (res.data.success) setMessages(res.data.chats);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (matchId) fetchMessages();
  }, [matchId, limit]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSend = async () => {
    if (!form.user.trim() || !form.text.trim()) {
      alert("User and message text are required");
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`/api/watch-along/matches/${matchId}/chats`, form);
      if (res.data.success) {
        setMessages((prev) => [...prev, res.data.chat]);
        setForm((prev) => ({ ...prev, text: "" }));
      }
    } catch (err) {
      console.error(err);
      alert("Error sending message");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (chatId: string) => {
    if (!confirm("Delete this message?")) return;
    setDeletingId(chatId);
    try {
      const res = await axios.delete(`/api/watch-along/matches/${matchId}/chat`, {
        data: { chatId },
      });
      if (res.data.success) {
        setMessages((prev) => prev.filter((m) => m.id !== chatId));
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting message");
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Chat Management</h1>
        <p className="text-xs text-gray-500 mt-1">
          Send system messages or moderate live chat for match <span className="text-blue-400 font-mono">{matchId}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Compose ── */}
        <div className="lg:col-span-2">
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
            <Section title="Send Message">
              <div className="space-y-4">
                <TextInput
                  label="Username *"
                  name="user"
                  value={form.user}
                  onChange={handleChange}
                  placeholder="e.g. Admin or Bot"
                />

                <div>
                  <label className="text-xs text-gray-400">Message Color</label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setForm((prev) => ({ ...prev, color: c.value }))}
                        className={`py-1.5 px-2 rounded text-xs font-semibold border transition-all ${
                          form.color === c.value
                            ? "border-white bg-[#1a1a1a]"
                            : "border-[#333] bg-[#0d1117] hover:border-gray-500"
                        }`}
                      >
                        <span className={c.value}>{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400">Message *</label>
                  <textarea
                    name="text"
                    value={form.text}
                    onChange={(e) => setForm((prev) => ({ ...prev, text: e.target.value }))}
                    placeholder="Type your message…"
                    rows={4}
                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSend();
                    }}
                  />
                  <p className="text-[10px] text-gray-600 mt-1">Ctrl+Enter to send</p>
                </div>

                <button
                  onClick={handleSend}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-2.5 rounded font-semibold text-sm text-white transition-all"
                >
                  {loading ? "Sending…" : "Send Message"}
                </button>
              </div>
            </Section>

            <Section title="Load Options">
              <div>
                <label className="text-xs text-gray-400">Messages to load</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1"
                >
                  <option value={25}>Last 25</option>
                  <option value={50}>Last 50</option>
                  <option value={100}>Last 100</option>
                </select>
              </div>
              <button
                onClick={fetchMessages}
                className="w-full mt-3 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-gray-500 py-2 rounded text-sm text-gray-300 transition-all"
              >
                ↻ Refresh
              </button>
            </Section>
          </div>
        </div>

        {/* ── Chat Log ── */}
        <div className="lg:col-span-3">
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4 flex flex-col h-full min-h-[500px]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Chat Log
              </h2>
              <span className="text-[10px] text-gray-600 bg-[#0d1117] border border-[#2a2a2a] px-2 py-1 rounded">
                {messages.length} messages
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[520px]">
              {fetching ? (
                <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
                  Loading…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
                  No messages yet
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="group flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[#1a1f29] transition-colors"
                  >
                    <span className="text-[10px] text-gray-600 mt-0.5 shrink-0 w-10">
                      {formatTime(msg.createdAt)}
                    </span>
                    <span className={`text-sm font-semibold shrink-0 ${msg.color}`}>
                      {msg.user}:
                    </span>
                    <span className="text-sm text-gray-300 flex-1 break-all">{msg.text}</span>
                    <button
                      onClick={() => handleDelete(msg.id)}
                      disabled={deletingId === msg.id}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-red-500 hover:text-red-400 shrink-0 transition-opacity disabled:opacity-40"
                    >
                      {deletingId === msg.id ? "…" : "✕"}
                    </button>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Reusable sub-components ─── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-[#21262d] pb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { label: string };
function TextInput({ label, ...props }: TextInputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        {...props}
        className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}