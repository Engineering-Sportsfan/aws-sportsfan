"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";

type Props = {
  feedbackId?: string;
};

type FormState = {
  title: string;
  description: string;
  questions: string[];
};

export default function CreateUserFeedback({ feedbackId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    questions: [""],
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(Boolean(feedbackId));

  useEffect(() => {
    if (!feedbackId) return;

    const fetchFeedback = async () => {
      try {
        setFetching(true);
        const res = await axios.get(`/api/userfeedback/${feedbackId}`);
        const feedback = res.data.feedback;

        setForm({
          title: feedback?.title || "",
          description: feedback?.description || "",
          questions: Array.isArray(feedback?.questions) && feedback.questions.length > 0
            ? feedback.questions
            : [""],
        });
      } catch (error) {
        console.error("Failed to load feedback", error);
        alert("Failed to load feedback");
      } finally {
        setFetching(false);
      }
    };

    fetchFeedback();
  }, [feedbackId]);

  const updateField = (key: keyof Pick<FormState, "title" | "description">, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateQuestion = (index: number, value: string) => {
    setForm((prev) => {
      const questions = [...prev.questions];
      questions[index] = value;
      return { ...prev, questions };
    });
  };

  const addQuestion = () => {
    setForm((prev) => ({ ...prev, questions: [...prev.questions, ""] }));
  };

  const removeQuestion = (index: number) => {
    setForm((prev) => {
      if (prev.questions.length === 1) return prev;
      return {
        ...prev,
        questions: prev.questions.filter((_, questionIndex) => questionIndex !== index),
      };
    });
  };

  const handleSubmit = async () => {
    const title = form.title.trim();
    const description = form.description.trim();
    const questions = form.questions.map((question) => question.trim()).filter(Boolean);

    if (!title || !description) {
      alert("Title and description are required");
      return;
    }

    if (questions.length === 0) {
      alert("Add at least one question");
      return;
    }

    try {
      setLoading(true);
      const payload = { title, description, questions };

      const res = feedbackId
        ? await axios.put(`/api/userfeedback/${feedbackId}`, payload)
        : await axios.post("/api/userfeedback", payload);

      if (res.data.success) {
        alert(feedbackId ? "Feedback updated successfully" : "Feedback created successfully");
        router.back();
      }
    } catch (error) {
      console.error("Save feedback failed", error);
      alert("Error saving feedback");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-white">
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-10 text-center text-sm text-gray-400">
          Loading feedback...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 text-white">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-5 transition text-sm"
      >
        <ArrowLeft size={18} /> Back
      </button>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {feedbackId ? "Edit User Feedback" : "Create User Feedback"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Add a title, description, and one or more questions.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Title</label>
            <input
              value={form.title}
              onChange={(e) => updateField("title", e.target.value)}
              placeholder="Feedback title"
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Short description"
              rows={4}
              className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-200">Questions</h2>
              <p className="text-xs text-gray-500">Use Add to insert more question fields.</p>
            </div>
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm bg-[#0d1117] hover:bg-blue-900/20 border border-[#21262d] hover:border-blue-800 px-3 py-2 rounded transition-all"
            >
              <Plus size={14} /> Add Question
            </button>
          </div>

          <div className="space-y-3">
            {form.questions.map((question, index) => {
              const isOnlyQuestion = form.questions.length === 1;
              return (
                <div key={index} className="flex gap-2 items-start">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">Question {index + 1}</label>
                    <input
                      value={question}
                      onChange={(e) => updateQuestion(index, e.target.value)}
                      placeholder={`Question ${index + 1}`}
                      className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={index === 0 ? addQuestion : () => removeQuestion(index)}
                    className={`mt-6 inline-flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border ${
                      index === 0
                        ? "bg-blue-600 hover:bg-blue-700 border-blue-600 text-white"
                        : "bg-[#0d1117] hover:bg-red-900/20 border-[#21262d] hover:border-red-800 text-red-400"
                    } ${isOnlyQuestion && index !== 0 ? "opacity-60" : ""}`}
                    disabled={isOnlyQuestion && index !== 0}
                    title={index === 0 ? "Add another question" : "Remove question"}
                  >
                    {index === 0 ? <Plus size={14} /> : <Trash2 size={14} />}
                    {index === 0 ? "Add" : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed py-3 rounded font-semibold text-white text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Save size={14} />
            {loading ? "Saving..." : feedbackId ? "Update Feedback" : "Save Feedback"}
          </button>
          <button
            onClick={() => router.back()}
            className="flex-1 bg-[#21262d] hover:bg-[#30363d] py-3 rounded font-semibold text-gray-300 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}