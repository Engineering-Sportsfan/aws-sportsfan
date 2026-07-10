"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

type Level = "easy" | "medium" | "difficult";

type Category =
  | "Cricket"
  | "Football"
  | "Basketball"
  | "Tennis"
  | "Hockey"
  | "Athletics"
  | "General";

interface Option {
  id: string;
  text: string;
}

interface Question {
  id: string;
  question: string;
  options: Option[];
  correctOptionId: string | null;
  points: number;
}

interface QuizPayload {
  level: Level;
  category: Category;
  questions: {
    questionNumber: number;
    question: string;
    options: string[];
    correctAnswer: string;
    points: number;
  }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => `id_${++_uid}`;

const makeOption = (): Option => ({ id: uid(), text: "" });

const makeQuestion = (): Question => ({
  id: uid(),
  question: "",
  options: [makeOption(), makeOption(), makeOption(), makeOption()],
  correctOptionId: null,
  points: 10,
});

const CATEGORIES: Category[] = [
  "Cricket",
  "Football",
  "Basketball",
  "Tennis",
  "Hockey",
  "Athletics",
  "General",
];

const LEVELS: { value: Level; label: string; active: string }[] = [
  { value: "easy",      label: "Easy",      active: "border-green-600 text-green-400 bg-green-600/10" },
  { value: "medium",    label: "Medium",    active: "border-yellow-600 text-yellow-400 bg-yellow-600/10" },
  { value: "difficult", label: "Difficult", active: "border-red-600 text-red-400 bg-red-600/10" },
];

// ─── Option row ───────────────────────────────────────────────────────────────

function OptionRow({
  opt,
  index,
  isCorrect,
  canRemove,
  onTextChange,
  onMarkCorrect,
  onRemove,
}: {
  opt: Option;
  index: number;
  isCorrect: boolean;
  canRemove: boolean;
  onTextChange: (text: string) => void;
  onMarkCorrect: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <button
        type="button"
        title="Mark as correct answer"
        onClick={onMarkCorrect}
        className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          isCorrect
            ? "border-green-500 bg-green-500"
            : "border-gray-600 bg-transparent hover:border-green-600"
        }`}
      >
        {isCorrect && <div className="w-2 h-2 rounded-full bg-white" />}
      </button>

      <span className="text-xs text-gray-600 w-4 flex-shrink-0">
        {String.fromCharCode(65 + index)}
      </span>

      <input
        type="text"
        value={opt.text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={`Option ${String.fromCharCode(65 + index)}`}
        className={`flex-1 bg-[#0d1117] border px-3 py-2 rounded text-sm text-white outline-none transition-colors ${
          isCorrect
            ? "border-green-700 focus:border-green-500"
            : "border-gray-700 focus:border-blue-500"
        }`}
      />

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="text-gray-600 hover:text-red-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-lg leading-none"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Question card ────────────────────────────────────────────────────────────

function QuestionCard({
  q,
  index,
  isOpen,
  onToggle,
  onChange,
  onDelete,
}: {
  q: Question;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (updated: Question) => void;
  onDelete: () => void;
}) {
  const correctOpt = q.options.find((o) => o.id === q.correctOptionId);
  const isComplete =
    !!q.question.trim() &&
    q.options.every((o) => o.text.trim()) &&
    !!q.correctOptionId;

  const updateOption = (optId: string, text: string) =>
    onChange({ ...q, options: q.options.map((o) => (o.id === optId ? { ...o, text } : o)) });

  const addOption = () => {
    if (q.options.length >= 6) return;
    onChange({ ...q, options: [...q.options, makeOption()] });
  };

  const removeOption = (optId: string) => {
    if (q.options.length <= 2) return;
    onChange({
      ...q,
      options: q.options.filter((o) => o.id !== optId),
      correctOptionId: q.correctOptionId === optId ? null : q.correctOptionId,
    });
  };

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors ${
        isOpen ? "border-blue-600" : "border-gray-700"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-[#161b22] cursor-pointer select-none"
        onClick={onToggle}
      >
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
            isComplete
              ? "bg-green-600 text-white"
              : "bg-[#0d1117] text-gray-400 border border-gray-600"
          }`}
        >
          {isComplete ? "✓" : index + 1}
        </div>

        <p
          className={`flex-1 text-sm truncate ${
            q.question.trim() ? "text-white" : "text-gray-500"
          }`}
        >
          {q.question.trim() || "New question — click to expand"}
        </p>

        <span className="text-xs text-gray-600 mr-1">
          {q.options.filter((o) => o.text.trim()).length}/{q.options.length} options
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-gray-600 hover:text-red-400 transition-colors text-lg leading-none mr-1"
        >
          ✕
        </button>

        <svg
          className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Body */}
      {isOpen && (
        <div className="px-4 pb-4 pt-3 bg-[#0d1117] border-t border-gray-700 space-y-4">
          {/* Question text */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Question text</label>
            <textarea
              rows={2}
              value={q.question}
              onChange={(e) => onChange({ ...q, question: e.target.value })}
              placeholder="e.g. Who was India's first Test captain?"
              className="w-full bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white outline-none resize-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs text-gray-400">
                Answer options{" "}
                <span className="text-gray-600">· click circle to mark correct</span>
              </label>
              {q.options.length < 6 && (
                <button
                  type="button"
                  onClick={addOption}
                  className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
                >
                  + Add option
                </button>
              )}
            </div>

            {q.options.map((opt, oi) => (
              <OptionRow
                key={opt.id}
                opt={opt}
                index={oi}
                isCorrect={q.correctOptionId === opt.id}
                canRemove={q.options.length > 2}
                onTextChange={(text) => updateOption(opt.id, text)}
                onMarkCorrect={() => onChange({ ...q, correctOptionId: opt.id })}
                onRemove={() => removeOption(opt.id)}
              />
            ))}

            {q.correctOptionId ? (
              <p className="text-xs text-green-500 mt-1">
                ✓ Correct answer: {correctOpt?.text || "—"}
              </p>
            ) : (
              <p className="text-xs text-red-500 mt-1">
                Select the correct answer above
              </p>
            )}
          </div>

          {/* Points */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400 flex-shrink-0">Points</label>
            <input
              type="number"
              min={1}
              max={100}
              value={q.points}
              onChange={(e) =>
                onChange({ ...q, points: parseInt(e.target.value) || 10 })
              }
              className="w-20 bg-[#161b22] border border-gray-700 px-3 py-2 rounded text-sm text-white outline-none focus:border-blue-500 transition-colors"
            />
            <span className="text-xs text-gray-600">pts for correct answer</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FanBattleQuizBuilderProps {
  quizIdToEdit?: string;
  onSubmit?: (payload: QuizPayload) => Promise<void>;
}

export default function FanBattleQuizBuilder({
  quizIdToEdit,
  onSubmit,
}: FanBattleQuizBuilderProps) {
  const router = useRouter();
  const [level, setLevel] = useState<Level>("easy");
  const [category, setCategory] = useState<Category>("Cricket");
  const [questions, setQuestions] = useState<Question[]>([makeQuestion()]);
  const [openId, setOpenId] = useState<string | null>(questions[0].id);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);

  // ── Populate form when editing ─────────────────────────────────────────────
  useEffect(() => {
    if (!quizIdToEdit) return;

    const fetchQuiz = async () => {
      setFetchLoading(true);
      try {
        const res = await fetch(`/api/fanbattle/quiz/${quizIdToEdit}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const quiz = data.data;

        setLevel(quiz.level);
        setCategory(quiz.category);

        // Re-map API questions → local Question shape (with ids for React keys)
        const mapped: Question[] = quiz.questions.map(
          (q: {
            questionNumber: number;
            question: string;
            options: string[];
            correctAnswer: string;
            points: number;
          }) => {
            const options: Option[] = q.options.map((text) => ({
              id: uid(),
              text,
            }));
            const correctOption = options.find((o) => o.text === q.correctAnswer);
            return {
              id: uid(),
              question: q.question,
              options,
              correctOptionId: correctOption?.id ?? null,
              points: q.points,
            };
          }
        );

        setQuestions(mapped);
        setOpenId(mapped[0]?.id ?? null);
      } catch (e: unknown) {
        alert(e instanceof Error ? e.message : "Failed to load quiz");
      } finally {
        setFetchLoading(false);
      }
    };

    fetchQuiz();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizIdToEdit]);

  const addQuestion = () => {
    const q = makeQuestion();
    setQuestions((prev) => [...prev, q]);
    setOpenId(q.id);
  };

  const deleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (openId === id) setOpenId(null);
  };

  const updateQuestion = (id: string, updated: Question) =>
    setQuestions((prev) => prev.map((q) => (q.id === id ? updated : q)));

  const validate = (): string | null => {
    if (!questions.length) return "Add at least one question.";
    const incomplete = questions.filter(
      (q) =>
        !q.question.trim() ||
        q.options.some((o) => !o.text.trim()) ||
        !q.correctOptionId
    );
    if (incomplete.length)
      return `${incomplete.length} question(s) incomplete — fill all fields and mark correct answers.`;
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { alert(err); return; }

    const payload: QuizPayload = {
      level,
      category,
      questions: questions.map((q, i) => ({
        questionNumber: i + 1,
        question: q.question,
        options: q.options.map((o) => o.text),
        correctAnswer: q.options.find((o) => o.id === q.correctOptionId)!.text,
        points: q.points,
      })),
    };

    setLoading(true);
    try {
      if (onSubmit) {
        await onSubmit(payload);
      } else {
        const url = quizIdToEdit
          ? `/api/fanbattle/quiz/${quizIdToEdit}`
          : "/api/fanbattle/quiz";
        const res = await fetch(url, {
          method: quizIdToEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Request failed");
        }
      }
      alert(quizIdToEdit ? "Quiz updated successfully" : "Quiz created successfully");
      router.push("/admin/fanbattle-management/fanbattle-list");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push("/admin/fanbattle-management/fanbattle-list");
  };

  const completeCount = questions.filter(
    (q) =>
      q.question.trim() &&
      q.options.every((o) => o.text.trim()) &&
      q.correctOptionId
  ).length;

  const activeLevel = LEVELS.find((l) => l.value === level)!;

  if (fetchLoading) {
    return (
      <div className="max-w-[1440px] mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-white">Edit Fan Battle Quiz</h1>
        </div>
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-4 animate-pulse">
          <div className="grid grid-cols-2 gap-6">
            <div className="h-10 bg-gray-700 rounded" />
            <div className="h-10 bg-gray-700 rounded" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-gray-700 rounded-lg" />
          ))}
          <div className="h-12 bg-gray-700 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">
          {quizIdToEdit ? "Edit Fan Battle Quiz" : "Create Fan Battle Quiz"}
        </h1>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">

        {/* ── Difficulty + Category ──────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          <div>
            <label className="text-xs text-gray-400 block mb-2">Difficulty level</label>
            <div className="flex gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => setLevel(l.value)}
                  className={`flex-1 py-2 rounded text-sm font-medium border transition-all ${
                    level === l.value
                      ? l.active
                      : "border-gray-700 text-gray-500 bg-[#0d1117] hover:border-gray-500 hover:text-gray-400"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition-all ${
                    category === c
                      ? "border-blue-600 text-blue-400 bg-blue-600/10"
                      : "border-gray-700 text-gray-500 bg-[#0d1117] hover:border-gray-500 hover:text-gray-400"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Questions ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm text-gray-300">
              Questions
              <span className="ml-2 text-xs text-gray-600">
                {completeCount}/{questions.length} complete
              </span>
            </h2>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded border text-xs font-medium ${activeLevel.active}`}>
                {activeLevel.label}
              </span>
              <span className="text-gray-600 text-xs">·</span>
              <span className="text-xs text-gray-500">{category}</span>
            </div>
          </div>

          <div className="space-y-2">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                q={q}
                index={i}
                isOpen={openId === q.id}
                onToggle={() => setOpenId((prev) => (prev === q.id ? null : q.id))}
                onChange={(updated) => updateQuestion(q.id, updated)}
                onDelete={() => deleteQuestion(q.id)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addQuestion}
            className="mt-3 w-full py-2.5 border border-dashed border-gray-700 rounded-lg text-sm text-blue-400 bg-[#0d1117] hover:border-blue-700 hover:bg-blue-600/5 transition-all"
          >
            + Add Question
          </button>
        </div>

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-3 rounded font-semibold text-white text-sm transition-colors"
          >
            {loading
              ? quizIdToEdit ? "Updating..." : "Creating..."
              : quizIdToEdit ? "Update Quiz" : "Create Quiz"}
          </button>

          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}