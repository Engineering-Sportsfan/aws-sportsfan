"use client";
import { useState, useEffect } from "react";
import axios from "axios";

interface QuestionOption {
    id: string;
    label: string;
    value: string;
}

interface FeedbackQuestion {
    id?: string;
    question: string;
    type: "multiple_choice" | "text" | "rating" | "file_upload";
    options?: QuestionOption[];
    required: boolean;
    order: number;
    isActive: boolean;
}

const EMPTY_QUESTION: Omit<FeedbackQuestion, "id"> = {
    question: "",
    type: "multiple_choice",
    options: [{ id: "1", label: "", value: "" }],
    required: true,
    order: 0,
    isActive: true,
};

export default function FeedbackAdminPage() {
    const [questions, setQuestions] = useState<FeedbackQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<FeedbackQuestion | null>(null);
    const [form, setForm] = useState<Omit<FeedbackQuestion, "id">>(EMPTY_QUESTION);
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => { fetchQuestions(); }, []);

    const fetchQuestions = async () => {
        try {
            const res = await axios.get("/api/feedback/questions");
            setQuestions(res.data.questions);
        } catch {
            setErrorMsg("Failed to load questions");
        } finally {
            setLoading(false);
        }
    };

    const showSuccess = (msg: string) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(""), 3000);
    };

    const showError = (msg: string) => {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(""), 3000);
    };

    const openCreate = () => {
        setEditingQuestion(null);
        setForm({ ...EMPTY_QUESTION, order: questions.length });
        setShowForm(true);
    };

    const openEdit = (q: FeedbackQuestion) => {
        setEditingQuestion(q);
        setForm({
            question: q.question,
            type: q.type,
            options: q.options || [],
            required: q.required,
            order: q.order,
            isActive: q.isActive,
        });
        setShowForm(true);
    };

    const cancelForm = () => {
        setShowForm(false);
        setEditingQuestion(null);
        setForm(EMPTY_QUESTION);
    };

    const addOption = () => {
        setForm((prev) => ({
            ...prev,
            options: [...(prev.options || []), { id: Date.now().toString(), label: "", value: "" }],
        }));
    };

    const updateOption = (index: number, val: string) => {
        setForm((prev) => {
            const opts = [...(prev.options || [])];
            opts[index] = { ...opts[index], label: val, value: val.toLowerCase().replace(/\s+/g, "_") };
            return { ...prev, options: opts };
        });
    };

    const removeOption = (index: number) => {
        setForm((prev) => ({
            ...prev,
            options: (prev.options || []).filter((_, i) => i !== index),
        }));
    };

    const handleSave = async () => {
        if (!form.question.trim()) { showError("Question text is required"); return; }
        if (form.type === "multiple_choice" && (!form.options || form.options.length === 0)) {
            showError("Add at least one option"); return;
        }
        setSaving(true);
        try {
            if (editingQuestion?.id) {
                await axios.put("/api/feedback/questions", { id: editingQuestion.id, ...form });
                showSuccess("Question updated!");
            } else {
                await axios.post("/api/feedback/questions", form);
                showSuccess("Question created!");
            }
            cancelForm();
            fetchQuestions();
        } catch {
            showError("Failed to save question");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this question?")) return;
        try {
            await axios.delete(`/api/feedback/questions?id=${id}`);
            showSuccess("Deleted!");
            fetchQuestions();
        } catch {
            showError("Failed to delete");
        }
    };

    const toggleActive = async (q: FeedbackQuestion) => {
        try {
            await axios.put("/api/feedback/questions", { id: q.id, isActive: !q.isActive });
            fetchQuestions();
        } catch {
            showError("Failed to update");
        }
    };

    const typeLabels: Record<FeedbackQuestion["type"], string> = {
        multiple_choice: "Multiple Choice",
        text: "Text Area",
        rating: "Rating (1–10)",
        file_upload: "File Upload",
    };

    const QuestionForm = (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold">
                    {editingQuestion ? "Edit Question" : "New Question"}
                </h2>
                <button onClick={cancelForm} className="text-gray-500 hover:text-white text-sm transition">
                    ✕ Cancel
                </button>
            </div>

            {/* Question */}
            <div className="mb-4">
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                    Question <span className="text-pink-500">*</span>
                </label>
                <input
                    value={form.question}
                    onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
                    placeholder="Enter your question..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-pink-500 transition"
                />
            </div>

            {/* Type */}
            <div className="mb-4">
                <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                    Type <span className="text-pink-500">*</span>
                </label>
                <select
                    value={form.type}
                    onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as FeedbackQuestion["type"] }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-pink-500 transition"
                >
                    <option value="multiple_choice">Multiple Choice</option>
                    <option value="text">Text Area</option>
                    <option value="rating">Rating (1–10)</option>
                    <option value="file_upload">File Upload</option>
                </select>
            </div>

            {/* Options */}
            {form.type === "multiple_choice" && (
                <div className="mb-4">
                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                        Options <span className="text-pink-500">*</span>
                    </label>
                    <div className="space-y-2">
                        {form.options?.map((opt, i) => (
                            <div key={opt.id} className="flex gap-2 items-center">
                                <span className="text-gray-600 text-xs w-4 flex-shrink-0">{i + 1}.</span>
                                <input
                                    value={opt.label}
                                    onChange={(e) => updateOption(i, e.target.value)}
                                    placeholder={`Option ${i + 1}`}
                                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-500 transition"
                                />
                                <button
                                    onClick={() => removeOption(i)}
                                    className="text-gray-600 hover:text-red-400 text-lg leading-none flex-shrink-0 transition"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={addOption}
                        className="mt-2 text-xs text-pink-400 hover:text-pink-300 transition"
                    >
                        + Add Option
                    </button>
                </div>
            )}

            {/* Order + Required */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                        Display Order
                    </label>
                    <input
                        type="number"
                        value={form.order}
                        onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value) || 0 }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-pink-500 transition"
                    />
                </div>
                <div>
                    <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider block mb-1.5">
                        Required
                    </label>
                    <button
                        onClick={() => setForm((p) => ({ ...p, required: !p.required }))}
                        className={`mt-1 flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm transition w-full ${
                            form.required
                                ? "border-pink-500/50 bg-pink-500/10 text-pink-400"
                                : "border-gray-700 bg-gray-800 text-gray-400"
                        }`}
                    >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition ${form.required ? "bg-pink-500 border-pink-500" : "border-gray-600"}`}>
                            {form.required && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>
                        {form.required ? "Required" : "Optional"}
                    </button>
                </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-3 pt-4 border-t border-gray-800">
                <button
                    onClick={cancelForm}
                    className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 text-sm hover:bg-gray-800 transition"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {saving && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                    {saving ? "Saving..." : editingQuestion ? "Update" : "Save Question"}
                </button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6">
            <div className="max-w-4xl mx-auto">

                {/* Page Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold">Feedback Questions</h1>
                        <p className="text-gray-400 text-sm mt-0.5">
                            Manage questions shown to users in the feedback form
                        </p>
                    </div>
                    {!showForm && (
                        <button
                            onClick={openCreate}
                            className="bg-pink-600 hover:bg-pink-700 px-4 py-2 rounded-xl text-sm font-semibold transition"
                        >
                            + Add Question
                        </button>
                    )}
                </div>

                {/* Alerts */}
                {successMsg && (
                    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
                        ✓ {successMsg}
                    </div>
                )}
                {errorMsg && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                        {errorMsg}
                    </div>
                )}

                {/* Layout: form on top when creating, side-by-side when editing */}
                <div className={showForm && !editingQuestion ? "space-y-6" : showForm && editingQuestion ? "grid grid-cols-1 lg:grid-cols-2 gap-6 items-start" : ""}>

                    {/* Form — shown inline when active */}
                    {showForm && QuestionForm}

                    {/* Questions list */}
                    <div>
                        {loading ? (
                            <div className="flex justify-center py-20">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
                            </div>
                        ) : questions.length === 0 ? (
                            <div className="text-center py-20 text-gray-500">
                                <p className="mb-4">No questions yet.</p>
                                {!showForm && (
                                    <button
                                        onClick={openCreate}
                                        className="bg-pink-600 hover:bg-pink-700 px-4 py-2 rounded-xl text-white text-sm font-semibold transition"
                                    >
                                        + Add Your First Question
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {questions.map((q) => (
                                    <div
                                        key={q.id}
                                        className={`bg-gray-900 border rounded-xl p-4 transition ${
                                            editingQuestion?.id === q.id
                                                ? "border-pink-500/50"
                                                : q.isActive
                                                ? "border-gray-800"
                                                : "border-gray-800 opacity-40"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="text-xs bg-pink-600/20 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded-full font-semibold">
                                                        {typeLabels[q.type]}
                                                    </span>
                                                    <span className="text-xs text-gray-700">#{q.order}</span>
                                                    {q.required && (
                                                        <span className="text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full">
                                                            Required
                                                        </span>
                                                    )}
                                                    {!q.isActive && (
                                                        <span className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
                                                            Inactive
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-white text-sm font-medium">{q.question}</p>
                                                {q.options && q.options.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {q.options.map((opt) => (
                                                            <span key={opt.id} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                                                                {opt.label}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                <button
                                                    onClick={() => toggleActive(q)}
                                                    className={`text-xs px-2.5 py-1 rounded-lg border transition ${
                                                        q.isActive
                                                            ? "border-gray-700 text-gray-500 hover:text-white"
                                                            : "border-green-700 text-green-400 hover:bg-green-700/10"
                                                    }`}
                                                >
                                                    {q.isActive ? "Disable" : "Enable"}
                                                </button>
                                                <button
                                                    onClick={() => openEdit(q)}
                                                    className="text-xs px-2.5 py-1 rounded-lg border border-blue-700 text-blue-400 hover:bg-blue-700/10 transition"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => q.id && handleDelete(q.id)}
                                                    className="text-xs px-2.5 py-1 rounded-lg border border-red-700 text-red-400 hover:bg-red-700/10 transition"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {!showForm && (
                                    <button
                                        onClick={openCreate}
                                        className="w-full py-3 border-2 border-dashed border-gray-800 rounded-xl text-gray-600 hover:border-pink-500/30 hover:text-gray-400 text-sm transition"
                                    >
                                        + Add Another Question
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}