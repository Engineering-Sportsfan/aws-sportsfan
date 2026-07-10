"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = "easy" | "medium" | "difficult";

interface QuizQuestion {
  questionNumber: number;
  question: string;
  options: string[];
  points: number;
}

interface FanBattleQuiz {
  id: string;
  level: Level;
  category: string;
  questions: QuizQuestion[];
  totalQuestions: number;
  totalPoints: number;
  createdAt: string | number;
  updatedAt: string | number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_STYLES: Record<Level, string> = {
  easy:      "text-green-400 bg-green-500/10 border-green-600/40",
  medium:    "text-yellow-400 bg-yellow-500/10 border-yellow-600/40",
  difficult: "text-red-400 bg-red-500/10 border-red-600/40",
};

const ALL_LEVELS = ["all", "easy", "medium", "difficult"] as const;
const ALL_CATEGORIES = [
  "All",
  "Cricket",
  "Football",
  "Basketball",
  "Tennis",
  "Hockey",
  "Athletics",
  "General",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | number) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: Level }) {
  return (
    <span
      className={`px-2 py-0.5 rounded border text-xs font-medium ${LEVEL_STYLES[level]}`}
    >
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center px-3 py-1.5 bg-[#0d1117] rounded border border-gray-700">
      <span className="text-white text-sm font-semibold">{value}</span>
      <span className="text-gray-500 text-xs">{label}</span>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-[#0d1117] border border-gray-700 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h4" />
        </svg>
      </div>
      <p className="text-gray-400 text-sm mb-1">No quizzes found</p>
      <p className="text-gray-600 text-xs mb-5">Try a different filter or create a new quiz</p>
      <button
        onClick={onAdd}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium transition-colors"
      >
        Create Quiz
      </button>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="border border-gray-700 rounded-lg p-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-16 h-5 bg-gray-700 rounded" />
          <div className="w-20 h-5 bg-gray-700 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="w-16 h-7 bg-gray-700 rounded" />
          <div className="w-16 h-7 bg-gray-700 rounded" />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="w-24 h-10 bg-gray-700 rounded" />
        <div className="w-24 h-10 bg-gray-700 rounded" />
        <div className="w-24 h-10 bg-gray-700 rounded" />
      </div>
    </div>
  );
}

// ─── Delete modal ─────────────────────────────────────────────────────────────

function DeleteModal({
  quiz,
  onConfirm,
  onCancel,
  loading,
}: {
  quiz: FanBattleQuiz;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-red-500/10 border border-red-600/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </div>
          <div>
            <h2 className="text-white text-sm font-semibold">Delete quiz</h2>
            <p className="text-gray-500 text-xs mt-0.5">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-gray-400 text-sm mb-5">
          Are you sure you want to delete the{" "}
          <span className="text-white font-medium">{quiz.category}</span> quiz (
          <LevelBadge level={quiz.level} />
          ) with <span className="text-white font-medium">{quiz.totalQuestions}</span> question(s)?
        </p>

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {loading ? "Deleting..." : "Delete"}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quiz row card ────────────────────────────────────────────────────────────

function QuizCard({
  quiz,
  onEdit,
  onDelete,
  onExpand,
  expanded,
}: {
  quiz: FanBattleQuiz;
  onEdit: () => void;
  onDelete: () => void;
  onExpand: () => void;
  expanded: boolean;
}) {
  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${expanded ? "border-blue-600" : "border-gray-700"}`}>
      {/* Main row */}
      <div className="flex items-start justify-between px-4 py-3 bg-[#161b22]">
        <div
          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
          onClick={onExpand}
        >
          {/* Expand chevron */}
          <svg
            className={`w-4 h-4 text-gray-500 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <LevelBadge level={quiz.level} />
            <span className="text-white text-sm font-medium">{quiz.category}</span>
            <span className="text-gray-600 text-xs hidden sm:inline">·</span>
            <span className="text-gray-500 text-xs hidden sm:inline">{formatDate(quiz.createdAt)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-700 bg-[#0d1117] text-gray-300 hover:text-white hover:border-gray-500 text-xs font-medium transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Edit
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-700 bg-[#0d1117] text-gray-500 hover:text-red-400 hover:border-red-600/40 text-xs font-medium transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0d1117] border-t border-gray-700/50">
        <StatPill label="questions" value={quiz.totalQuestions} />
        <StatPill label="total pts" value={quiz.totalPoints} />
        <StatPill label="avg pts" value={Math.round(quiz.totalPoints / quiz.totalQuestions)} />
        <span className="text-gray-600 text-xs ml-auto">ID: {quiz.id}</span>
      </div>

      {/* Expanded questions */}
      {expanded && (
        <div className="px-4 pb-4 pt-3 bg-[#0d1117] border-t border-gray-700 space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Questions</p>
          {quiz.questions.map((q) => (
            <div key={q.questionNumber} className="border border-gray-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#161b22] border border-gray-600 flex items-center justify-center text-xs text-gray-400 flex-shrink-0 mt-0.5">
                    {q.questionNumber}
                  </span>
                  <p className="text-white text-sm">{q.question}</p>
                </div>
                <span className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-600/30 px-2 py-0.5 rounded flex-shrink-0">
                  {q.points} pts
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 ml-7">
                {q.options.map((opt, oi) => (
                  <div
                    key={oi}
                    className="flex items-center gap-2 text-xs text-gray-400 bg-[#161b22] rounded px-2 py-1.5 border border-gray-700"
                  >
                    <span className="text-gray-600">{String.fromCharCode(65 + oi)}.</span>
                    {opt}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main list component ──────────────────────────────────────────────────────

export default function FanBattleQuizList() {
  const router = useRouter();

  const [quizzes, setQuizzes] = useState<FanBattleQuiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  const [nextCursor, setNextCursor] = useState<{ lastDocId: string; lastDocCreatedAt: number } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FanBattleQuiz | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchQuizzes = async (append = false) => {
    if (!append) {
      setLoading(true);
      setNextCursor(null);
    }
    setError("");
    try {
      const params: Record<string, string> = { admin: "true", limit: "20" };
      if (levelFilter !== "all") params.level = levelFilter;
      if (categoryFilter !== "All") params.category = categoryFilter;
      if (append && nextCursor) {
        params.lastDocId = nextCursor.lastDocId;
        params.lastDocCreatedAt = String(nextCursor.lastDocCreatedAt);
      }

      const res = await axios.get("/api/fanbattle/quiz", { params });
      const incoming: FanBattleQuiz[] = res.data.quizzes || [];

      setQuizzes((prev) => (append ? [...prev, ...incoming] : incoming));
      setHasMore(res.data.pagination?.hasMore ?? false);
      setNextCursor(res.data.pagination?.nextCursor ?? null);
    } catch (e) {
      if (e instanceof Error) {
        setError("Failed to load quizzes. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelFilter, categoryFilter]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await axios.delete(`/api/fanbattle/quiz/${deleteTarget.id}`);
      setQuizzes((prev) => prev.filter((q) => q.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      alert("Failed to delete quiz. Please try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Client-side search filter ──────────────────────────────────────────────

  const filtered = quizzes.filter((q) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      q.category.toLowerCase().includes(s) ||
      q.level.includes(s) ||
      q.questions.some((ques) => ques.question.toLowerCase().includes(s))
    );
  });

  // ── Stats ──────────────────────────────────────────────────────────────────

  const totalQuestions = quizzes.reduce((s, q) => s + q.totalQuestions, 0);
  const totalPoints = quizzes.reduce((s, q) => s + q.totalPoints, 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      {/* Page heading */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">Fan Battle Quizzes</h1>
        <button
          onClick={() => router.push("/admin/fanbattle-management/add-fanbattle")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create Quiz
        </button>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-5">

        {/* ── Summary stats ──────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total quizzes", value: quizzes.length },
            { label: "Total questions", value: totalQuestions },
            { label: "Total points pool", value: totalPoints },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-3">
              <p className="text-white text-xl font-semibold">{value}</p>
              <p className="text-gray-500 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Filters ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
              fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by category, level, or question…"
              className="w-full bg-[#0d1117] border border-gray-700 pl-9 pr-3 py-2 rounded text-sm text-white outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
            />
          </div>

          {/* Level filter */}
          <div className="flex gap-2">
            {ALL_LEVELS.map((l) => (
              <button
                key={l}
                onClick={() => setLevelFilter(l)}
                className={`flex-1 py-2 rounded text-xs font-medium border transition-all ${
                  levelFilter === l
                    ? l === "all"
                      ? "border-gray-500 bg-gray-600/20 text-gray-200"
                      : LEVEL_STYLES[l as Level]
                    : "border-gray-700 text-gray-500 bg-[#0d1117] hover:border-gray-500 hover:text-gray-400"
                }`}
              >
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2">
          {ALL_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                categoryFilter === c
                  ? "border-blue-600 text-blue-400 bg-blue-600/10"
                  : "border-gray-700 text-gray-500 bg-[#0d1117] hover:border-gray-500 hover:text-gray-400"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* ── Result count ────────────────────────────────────────── */}
        {!loading && !error && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Showing{" "}
              <span className="text-white font-medium">{filtered.length}</span> of{" "}
              <span className="text-white font-medium">{quizzes.length}</span> quizzes
            </p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 bg-red-500/10 border border-red-600/30 rounded-lg">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => fetchQuizzes(false)}
              className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── List ─────────────────────────────────────────────────── */}
        <div className="space-y-2">
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : filtered.length === 0 ? (
            <EmptyState onAdd={() => router.push("/admin/fanbattle-management/add-fanbattle")} />
          ) : (
            filtered.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                expanded={expandedId === quiz.id}
                onExpand={() =>
                  setExpandedId((prev) => (prev === quiz.id ? null : quiz.id))
                }
                onEdit={() => router.push(`/admin/fanbattle-management/add-fanbattle?id=${quiz.id}`)}
                onDelete={() => setDeleteTarget(quiz)}
              />
            ))
          )}
        </div>

        {/* ── Load more ─────────────────────────────────────────── */}
        {hasMore && !loading && (
          <button
            onClick={() => fetchQuizzes(true)}
            className="w-full py-2.5 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white hover:border-gray-500 bg-[#0d1117] transition-all"
          >
            Load more
          </button>
        )}
      </div>

      {/* ── Delete modal ──────────────────────────────────────────── */}
      {deleteTarget && (
        <DeleteModal
          quiz={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  );
}