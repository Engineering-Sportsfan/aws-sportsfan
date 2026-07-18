"use client";

import axios from "axios";
import { useState, useEffect, InputHTMLAttributes } from "react";

/* ─── Types ─── */
type Prediction = {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  totalVotes: number;
  closesAt: number | null;
  isOpen: boolean;
  createdAt: number;
  updatedAt: number;
};

type PredictionForm = {
  question: string;
  options: string[];
  closesAt: string; // datetime-local string
};

/* 
   Predictions Admin Panel
   Props: matchId → the watch-along match ID
    */
export default function PredictionsAdminPanel({ matchId }: { matchId: string }) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [form, setForm] = useState<PredictionForm>({
    question: "",
    options: ["", ""],
    closesAt: "",
  });

  /* ── Fetch ── */
  const fetchPredictions = async () => {
    setFetching(true);
    try {
      const res = await axios.get(`/api/watch-along/matches/${matchId}/predictions`);
      if (res.data.success) setPredictions(res.data.predictions);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (matchId) fetchPredictions();
  }, [matchId]);

  /* ── Option helpers ── */
  const handleOptionChange = (index: number, value: string) => {
    setForm((prev) => {
      const options = [...prev.options];
      options[index] = value;
      return { ...prev, options };
    });
  };

  const addOption = () => {
    if (form.options.length >= 6) return;
    setForm((prev) => ({ ...prev, options: [...prev.options, ""] }));
  };

  const removeOption = (index: number) => {
    if (form.options.length <= 2) return;
    setForm((prev) => {
      const options = prev.options.filter((_, i) => i !== index);
      return { ...prev, options };
    });
  };

  /* ── Submit ── */
  const handleCreate = async () => {
    const filledOptions = form.options.filter((o) => o.trim());
    if (!form.question.trim() || filledOptions.length < 2) {
      alert("Question and at least 2 options are required");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        action: "create",
        question: form.question,
        options: filledOptions,
        closesAt: form.closesAt ? new Date(form.closesAt).getTime() : undefined,
      };
      const res = await axios.post(`/api/watch-along/matches/${matchId}/predictions`, payload);
      if (res.data.success) {
        setPredictions((prev) => [res.data.prediction, ...prev]);
        setForm({ question: "", options: ["", ""], closesAt: "" });
      }
    } catch (err) {
      console.error(err);
      alert("Error creating prediction");
    } finally {
      setLoading(false);
    }
  };

  /* ── Toggle open/close ── */
  const handleToggle = async (predictionId: string, isOpen: boolean) => {
    setTogglingId(predictionId);
    try {
      const res = await axios.patch(`/api/watch-along/matches/${matchId}/predictions`, {
        predictionId,
        isOpen,
      });
      if (res.data.success) {
        setPredictions((prev) =>
          prev.map((p) => (p.id === predictionId ? { ...p, isOpen } : p))
        );
      }
    } catch (err) {
      console.error(err);
      alert("Error toggling prediction");
    } finally {
      setTogglingId(null);
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleString([], { dateStyle: "short", timeStyle: "short" });

  const getVotePercent = (option: string, votes: Record<string, number>, total: number) => {
    if (!total) return 0;
    return Math.round(((votes[option] || 0) / total) * 100);
  };

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Predictions</h1>
        <p className="text-xs text-gray-500 mt-1">
          Create fan prediction polls for match{" "}
          <span className="text-blue-400 font-mono">{matchId}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Create Form ── */}
        <div className="lg:col-span-2">
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
            <Section title="New Prediction">
              <div className="space-y-4">
                <TextInput
                  label="Question *"
                  name="question"
                  value={form.question}
                  onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))}
                  placeholder="e.g. Will RCB win today?"
                />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400">Options * (min 2, max 6)</label>
                    {form.options.length < 6 && (
                      <button
                        onClick={addOption}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold uppercase tracking-wide"
                      >
                         Add Option
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {form.options.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={opt}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        {form.options.length > 2 && (
                          <button
                            onClick={() => removeOption(i)}
                            className="text-red-500 hover:text-red-400 px-2 text-sm"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400">Closes At (optional)</label>
                  <input
                    type="datetime-local"
                    value={form.closesAt}
                    onChange={(e) => setForm((prev) => ({ ...prev, closesAt: e.target.value }))}
                    className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-2.5 rounded font-semibold text-sm text-white transition-all"
                >
                  {loading ? "Creating…" : "Create Prediction"}
                </button>
              </div>
            </Section>
          </div>
        </div>

        {/* ── Predictions List ── */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              All Predictions ({predictions.length})
            </h2>
            <button
              onClick={fetchPredictions}
              className="text-[10px] text-gray-500 hover:text-gray-300 bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-1.5 rounded transition-all"
            >
              ↻ Refresh
            </button>
          </div>

          {fetching ? (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8 text-center text-gray-600 text-sm">
              Loading…
            </div>
          ) : predictions.length === 0 ? (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8 text-center text-gray-600 text-sm">
              No predictions yet. Create one →
            </div>
          ) : (
            predictions.map((pred) => (
              <div
                key={pred.id}
                className="bg-[#161b22] border border-[#21262d] rounded-lg p-5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{pred.question}</p>
                    <p className="text-[10px] text-gray-600 mt-1">
                      {pred.totalVotes.toLocaleString()} votes
                      {pred.closesAt && ` · Closes ${formatTime(pred.closesAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        pred.isOpen
                          ? "bg-green-600 text-white"
                          : "bg-gray-700 text-gray-400"
                      }`}
                    >
                      {pred.isOpen ? "OPEN" : "CLOSED"}
                    </span>
                    <button
                      onClick={() => handleToggle(pred.id, !pred.isOpen)}
                      disabled={togglingId === pred.id}
                      className={`text-xs px-3 py-1 rounded border font-semibold transition-all disabled:opacity-50 ${
                        pred.isOpen
                          ? "border-red-700 text-red-400 hover:bg-red-900/20"
                          : "border-green-700 text-green-400 hover:bg-green-900/20"
                      }`}
                    >
                      {togglingId === pred.id ? "…" : pred.isOpen ? "Close" : "Open"}
                    </button>
                  </div>
                </div>

                {/* Vote bars */}
                <div className="space-y-2">
                  {pred.options.map((option) => {
                    const pct = getVotePercent(option, pred.votes, pred.totalVotes);
                    return (
                      <div key={option}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-300">{option}</span>
                          <span className="text-gray-500">
                            {(pred.votes[option] || 0).toLocaleString()} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-[#0d1117] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/*  Reusable sub-components  */
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