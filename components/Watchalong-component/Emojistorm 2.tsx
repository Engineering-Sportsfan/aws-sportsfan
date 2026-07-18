"use client";

import axios from "axios";
import { useState, useEffect } from "react";

/* ─── Types ─── */
type Reactions = Record<string, number>;

const EMOJI_LIST = ["🔥","💪","😱","🏏","👏","🎉","❤️","🚀","😮","🤩"] as const;

const EMOJI_LABELS: Record<string, string> = {
  "🔥": "Fire",
  "💪": "Strong",
  "😱": "Shocked",
  "🏏": "Cricket",
  "👏": "Clap",
  "🎉": "Party",
  "❤️": "Love",
  "🚀": "Rocket",
  "😮": "Wow",
  "🤩": "Star-struck",
};

/* ─────────────────────────────────────────────
   EmojiStorm Admin Panel
   Props: matchId → the watch-along match ID
   ───────────────────────────────────────────── */
export default function EmojiStormAdminPanel({ matchId }: { matchId: string }) {
  const [reactions, setReactions] = useState<Reactions>({});
  const [fetching, setFetching] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [testEmojis, setTestEmojis] = useState<string[]>([]);
  const [sendingBurst, setSendingBurst] = useState(false);

  /* ── Fetch ── */
  const fetchReactions = async () => {
    setFetching(true);
    try {
      const res = await axios.get(`/api/watch-along/matches/${matchId}/emoji-storm`);
      if (res.data.success) setReactions(res.data.reactions);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (matchId) fetchReactions();
    const interval = setInterval(fetchReactions, 10000);
    return () => clearInterval(interval);
  }, [matchId]);

  /* ── Send single emoji ── */
  const handleSendOne = async (emoji: string) => {
    setSending(emoji);
    try {
      const res = await axios.post(`/api/watch-along/matches/${matchId}/emoji-storm`, { emoji });
      if (res.data.success) setReactions(res.data.reactions);
    } catch (err) {
      console.error(err);
      alert("Error sending emoji");
    } finally {
      setSending(null);
    }
  };

  /* ── Send burst ── */
  const handleSendBurst = async () => {
    if (testEmojis.length === 0) {
      alert("Select at least one emoji for the burst");
      return;
    }
    setSendingBurst(true);
    try {
      const res = await axios.post(`/api/watch-along/matches/${matchId}/emoji-storm`, {
        emojis: testEmojis,
      });
      if (res.data.success) {
        setReactions(res.data.reactions);
        setTestEmojis([]);
      }
    } catch (err) {
      console.error(err);
      alert("Error sending burst");
    } finally {
      setSendingBurst(false);
    }
  };

  const toggleBurstEmoji = (emoji: string) => {
    setTestEmojis((prev) => {
      if (prev.includes(emoji)) return prev.filter((e) => e !== emoji);
      if (prev.length >= 10) return prev;
      return [...prev, emoji];
    });
  };

  /* ── Reset all ── */
  const handleReset = async () => {
    if (!confirm("Reset ALL emoji counts to 0? This cannot be undone.")) return;
    setResetting(true);
    try {
      const res = await axios.delete(`/api/watch-along/matches/${matchId}/emoji-storm`);
      if (res.data.success) {
        const empty: Reactions = {};
        EMOJI_LIST.forEach((e) => { empty[e] = 0; });
        setReactions(empty);
      }
    } catch (err) {
      console.error(err);
      alert("Error resetting counts");
    } finally {
      setResetting(false);
    }
  };

  const totalReactions = Object.values(reactions).reduce((a, b) => a + b, 0);

  const maxCount = Math.max(...Object.values(reactions), 1);

  const sorted = [...EMOJI_LIST].sort(
    (a, b) => (reactions[b] || 0) - (reactions[a] || 0)
  );

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Emoji Storm</h1>
          <p className="text-xs text-gray-500 mt-1">
            Monitor and test live emoji reactions for match{" "}
            <span className="text-blue-400 font-mono">{matchId}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReactions}
            className="text-[10px] text-gray-500 hover:text-gray-300 bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-1.5 rounded transition-all"
          >
            ↻ Refresh
          </button>
          <button
            onClick={handleReset}
            disabled={resetting}
            className="text-[10px] text-red-400 hover:text-red-300 bg-[#1a1a1a] border border-red-900 hover:border-red-700 px-3 py-1.5 rounded transition-all disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "Reset All Counts"}
          </button>
        </div>
      </div>

      {/* ── Total ── */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg px-6 py-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-widest">Total Reactions</p>
          <p className="text-3xl font-bold text-white mt-1">{totalReactions.toLocaleString()}</p>
        </div>
        <div className="text-4xl opacity-30 select-none">🔥</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Reaction Bars ── */}
        <div className="lg:col-span-3">
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4 border-b border-[#21262d] pb-2">
              Reaction Counts
            </h2>

            {fetching ? (
              <div className="text-center text-gray-600 text-sm py-8">Loading…</div>
            ) : (
              <div className="space-y-3">
                {sorted.map((emoji) => {
                  const count = reactions[emoji] || 0;
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={emoji} className="flex items-center gap-3">
                      <button
                        onClick={() => handleSendOne(emoji)}
                        disabled={sending === emoji}
                        title={`Send one ${EMOJI_LABELS[emoji]}`}
                        className="text-2xl hover:scale-125 transition-transform active:scale-95 disabled:opacity-50 shrink-0 w-10 text-center"
                      >
                        {sending === emoji ? "⏳" : emoji}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-400">{EMOJI_LABELS[emoji]}</span>
                          <span className="text-gray-500 font-mono">{count.toLocaleString()}</span>
                        </div>
                        <div className="h-2 bg-[#0d1117] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-600 w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Test Panel ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Quick send */}
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-[#21262d] pb-2">
              Quick Send (Single)
            </h2>
            <p className="text-xs text-gray-600 mb-3">Click an emoji to send one reaction immediately.</p>
            <div className="grid grid-cols-5 gap-2">
              {EMOJI_LIST.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleSendOne(emoji)}
                  disabled={sending === emoji}
                  title={EMOJI_LABELS[emoji]}
                  className="text-2xl p-2 rounded bg-[#0d1117] border border-[#2a2a2a] hover:border-gray-500 hover:bg-[#1a1f29] transition-all active:scale-90 disabled:opacity-50"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Burst sender */}
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-[#21262d] pb-2">
              Burst Send (Up to 10)
            </h2>
            <p className="text-xs text-gray-600 mb-3">
              Select emojis to send in one batch. Duplicates allowed.
            </p>

            {/* Selector */}
            <div className="grid grid-cols-5 gap-2 mb-3">
              {EMOJI_LIST.map((emoji) => {
                const count = testEmojis.filter((e) => e === emoji).length;
                return (
                  <button
                    key={emoji}
                    onClick={() => toggleBurstEmoji(emoji)}
                    title={EMOJI_LABELS[emoji]}
                    className={`relative text-2xl p-2 rounded border transition-all active:scale-90 ${
                      count > 0
                        ? "border-blue-500 bg-blue-900/20"
                        : "border-[#2a2a2a] bg-[#0d1117] hover:border-gray-500"
                    }`}
                  >
                    {emoji}
                    {count > 0 && (
                      <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected preview */}
            <div className="bg-[#0d1117] border border-[#2a2a2a] rounded px-3 py-2 mb-3 min-h-[36px] flex items-center gap-1 flex-wrap">
              {testEmojis.length === 0 ? (
                <span className="text-xs text-gray-600">No emojis selected</span>
              ) : (
                testEmojis.map((e, i) => (
                  <span key={i} className="text-lg">{e}</span>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSendBurst}
                disabled={sendingBurst || testEmojis.length === 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded text-sm font-semibold text-white transition-all"
              >
                {sendingBurst ? "Sending…" : `Send Burst (${testEmojis.length})`}
              </button>
              <button
                onClick={() => setTestEmojis([])}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition-all"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Auto-refresh notice */}
          <p className="text-[10px] text-gray-600 text-center">
            Counts auto-refresh every 10 seconds
          </p>
        </div>
      </div>
    </div>
  );
}