"use client";

import axios from "axios";
import { useState, useEffect, InputHTMLAttributes } from "react";

/* ─── Types ─── */
type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  timerSeconds: number;
  points: number;
  isActive: boolean;
  opensAt: number | null;
  closesAt: number | null;
  competing: number;
  createdAt: number;
};

type LeaderboardEntry = {
  userId: string;
  displayName: string;
  totalPoints: number;
};

type QuizForm = {
  question: string;
  options: string[];
  correctAnswer: string;
  timerSeconds: string;
  points: string;
};

const DEFAULT_FORM: QuizForm = {
  question: "",
  options: ["", "", "", ""],
  correctAnswer: "",
  timerSeconds: "15",
  points: "10",
};

/* ─────────────────────────────────────────────
   Quiz Admin Panel
   Props: matchId → the watch-along match ID
   ───────────────────────────────────────────── */
export default function QuizAdminPanel({ matchId }: { matchId: string }) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"questions" | "leaderboard">("questions");
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [form, setForm] = useState<QuizForm>(DEFAULT_FORM);

  /* ── Fetch questions ── */
  const fetchQuestions = async () => {
    setFetching(true);
    try {
      const res = await axios.get(`/api/watch-along/matches/${matchId}/quiz`);
      if (res.data.success) setQuestions(res.data.questions);
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  };

  /* ── Fetch leaderboard ── */
  const fetchLeaderboard = async () => {
    try {
      const res = await axios.get(
        `/api/watch-along/matches/${matchId}/quiz?leaderboard=true`
      );
      if (res.data.success) setLeaderboard(res.data.leaderboard);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (matchId) fetchQuestions();
  }, [matchId]);

  useEffect(() => {
    if (activeTab === "leaderboard") fetchLeaderboard();
  }, [activeTab]);

  /* ── Option helpers ── */
  const handleOptionChange = (index: number, value: string) => {
    setForm((prev) => {
      const options = [...prev.options];
      options[index] = value;
      // If the correct answer was this option's old value, clear it
      const correctAnswer = prev.correctAnswer === prev.options[index] ? "" : prev.correctAnswer;
      return { ...prev, options, correctAnswer };
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
      const correctAnswer = prev.correctAnswer === prev.options[index] ? "" : prev.correctAnswer;
      return { ...prev, options, correctAnswer };
    });
  };

  /* ── Create question ── */
  const handleCreate = async () => {
    const filledOptions = form.options.filter((o) => o.trim());
    if (!form.question.trim() || filledOptions.length < 2 || !form.correctAnswer) {
      alert("Question, at least 2 options, and a correct answer are required");
      return;
    }
    if (!filledOptions.includes(form.correctAnswer)) {
      alert("Correct answer must match one of the options");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        action: "create",
        question: form.question,
        options: filledOptions,
        correctAnswer: form.correctAnswer,
        timerSeconds: parseInt(form.timerSeconds) || 15,
        points: parseInt(form.points) || 10,
      };
      const res = await axios.post(`/api/watch-along/matches/${matchId}/quiz`, payload);
      if (res.data.success) {
        setQuestions((prev) => [res.data.question, ...prev]);
        setForm(DEFAULT_FORM);
      }
    } catch (err) {
      console.error(err);
      alert("Error creating question");
    } finally {
      setLoading(false);
    }
  };

  /* ── Toggle active ── */
  const handleToggle = async (questionId: string, isActive: boolean) => {
    setTogglingId(questionId);
    try {
      const res = await axios.patch(`/api/watch-along/matches/${matchId}/quiz`, {
        questionId,
        isActive,
      });
      if (res.data.success) {
        setQuestions((prev) =>
          prev.map((q) =>
            q.id === questionId
              ? {
                  ...q,
                  isActive,
                  opensAt: isActive ? Date.now() : q.opensAt,
                  closesAt: isActive ? Date.now() + (q.timerSeconds || 15) * 1000 : q.closesAt,
                }
              : q
          )
        );
      }
    } catch (err) {
      console.error(err);
      alert("Error toggling question");
    } finally {
      setTogglingId(null);
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const isExpired = (q: QuizQuestion) =>
    q.closesAt !== null && Date.now() > q.closesAt && !q.isActive;

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">Quiz Management</h1>
        <p className="text-xs text-gray-500 mt-1">
          Create timed quiz questions for match{" "}
          <span className="text-blue-400 font-mono">{matchId}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Create Form ── */}
        <div className="lg:col-span-2">
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
            <Section title="New Question">
              <div className="space-y-4">
                <TextInput
                  label="Question *"
                  name="question"
                  value={form.question}
                  onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))}
                  placeholder="e.g. Who will take the first wicket?"
                />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400">Options * (min 2, max 6)</label>
                    {form.options.length < 6 && (
                      <button
                        onClick={addOption}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold uppercase tracking-wide"
                      >
                         Add
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {form.options.map((opt, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <button
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              correctAnswer: opt.trim() ? opt : prev.correctAnswer,
                            }))
                          }
                          title="Mark as correct"
                          className={`w-5 h-5 rounded-full border-2 shrink-0 transition-all ${
                            form.correctAnswer === opt && opt.trim()
                              ? "border-green-500 bg-green-500"
                              : "border-gray-600 hover:border-green-600"
                          }`}
                        />
                        <input
                          value={opt}
                          onChange={(e) => handleOptionChange(i, e.target.value)}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                        />
                        {form.options.length > 2 && (
                          <button
                            onClick={() => removeOption(i)}
                            className="text-red-500 hover:text-red-400 text-sm shrink-0"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {form.correctAnswer && (
                    <p className="text-[10px] text-green-500 mt-2">
                      ✓ Correct: {form.correctAnswer}
                    </p>
                  )}
                  {!form.correctAnswer && (
                    <p className="text-[10px] text-gray-600 mt-2">
                      Click a circle to mark the correct answer
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <TextInput
                    label="Timer (seconds)"
                    name="timerSeconds"
                    type="number"
                    min="5"
                    max="120"
                    value={form.timerSeconds}
                    onChange={(e) => setForm((prev) => ({ ...prev, timerSeconds: e.target.value }))}
                    placeholder="15"
                  />
                  <TextInput
                    label="Points"
                    name="points"
                    type="number"
                    min="1"
                    value={form.points}
                    onChange={(e) => setForm((prev) => ({ ...prev, points: e.target.value }))}
                    placeholder="10"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-2.5 rounded font-semibold text-sm text-white transition-all"
                >
                  {loading ? "Creating…" : "Create Question"}
                </button>
              </div>
            </Section>
          </div>
        </div>

        {/* ── Questions + Leaderboard ── */}
        <div className="lg:col-span-3">
          {/* Sub-tabs */}
          <div className="flex gap-2 mb-4">
            {(["questions", "leaderboard"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`px-4 py-2 rounded text-sm font-semibold capitalize transition-all ${
                  activeTab === t
                    ? "bg-blue-600 text-white"
                    : "bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#2a2a2a]"
                }`}
              >
                {t === "questions" ? `Questions (${questions.length})` : "Leaderboard"}
              </button>
            ))}
            <button
              onClick={activeTab === "questions" ? fetchQuestions : fetchLeaderboard}
              className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 bg-[#1a1a1a] border border-[#2a2a2a] px-3 py-1.5 rounded transition-all"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Questions */}
          {activeTab === "questions" && (
            <div className="space-y-3">
              {fetching ? (
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8 text-center text-gray-600 text-sm">
                  Loading…
                </div>
              ) : questions.length === 0 ? (
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8 text-center text-gray-600 text-sm">
                  No questions yet. Create one →
                </div>
              ) : (
                questions.map((q) => (
                  <div
                    key={q.id}
                    className={`bg-[#161b22] border rounded-lg p-5 transition-all ${
                      q.isActive ? "border-blue-500" : "border-[#21262d]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{q.question}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-[10px] text-gray-600">
                            ⏱ {q.timerSeconds}s · {q.points} pts · {q.competing} answered
                          </span>
                          {q.isActive && q.closesAt && (
                            <span className="text-[10px] text-blue-400">
                              Closes {formatTime(q.closesAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            q.isActive
                              ? "bg-blue-600 text-white"
                              : isExpired(q)
                              ? "bg-gray-800 text-gray-500"
                              : "bg-gray-700 text-gray-400"
                          }`}
                        >
                          {q.isActive ? "LIVE" : isExpired(q) ? "ENDED" : "IDLE"}
                        </span>
                        <button
                          onClick={() => handleToggle(q.id, !q.isActive)}
                          disabled={togglingId === q.id}
                          className={`text-xs px-3 py-1 rounded border font-semibold transition-all disabled:opacity-50 ${
                            q.isActive
                              ? "border-red-700 text-red-400 hover:bg-red-900/20"
                              : "border-green-700 text-green-400 hover:bg-green-900/20"
                          }`}
                        >
                          {togglingId === q.id ? "…" : q.isActive ? "Stop" : "Launch"}
                        </button>
                      </div>
                    </div>

                    {/* Options pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((opt) => (
                        <span
                          key={opt}
                          className="text-[11px] bg-[#0d1117] border border-[#2a2a2a] text-gray-400 px-2 py-1 rounded"
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Leaderboard */}
          {activeTab === "leaderboard" && (
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
              {leaderboard.length === 0 ? (
                <div className="p-8 text-center text-gray-600 text-sm">No scores yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#21262d] text-[10px] text-gray-500 uppercase tracking-widest">
                      <th className="text-left px-4 py-3">Rank</th>
                      <th className="text-left px-4 py-3">Player</th>
                      <th className="text-right px-4 py-3">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((entry, i) => (
                      <tr
                        key={entry.userId}
                        className="border-b border-[#21262d] last:border-0 hover:bg-[#1a1f29] transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-500">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{entry.displayName}</td>
                        <td className="px-4 py-3 text-right text-blue-400 font-semibold">
                          {entry.totalPoints.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
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