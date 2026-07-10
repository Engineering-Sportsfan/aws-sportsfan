"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Pencil, Trash2, Plus } from "lucide-react";

type UserFeedback = {
  id: string;
  title: string;
  description: string;
  questions: string[];
  createdAt?: number;
  updatedAt?: number;
};

export default function UserFeedbackListPage() {
  const [feedbackList, setFeedbackList] = useState<UserFeedback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/userfeedback?limit=100");
      setFeedbackList(res.data.feedback || []);
    } catch (error) {
      console.error("Failed to fetch user feedback", error);
      setFeedbackList([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (id: string) => {
    window.location.href = `/admin/userfeedback-management/add-userfeedback?id=${id}`;
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm("Delete this feedback entry?");
    if (!confirmed) return;

    try {
      await axios.delete(`/api/userfeedback/${id}`);
      setFeedbackList((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete feedback");
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">User Feedback</h1>
          <p className="text-sm text-gray-400 mt-1">
            View and manage all feedback forms
          </p>
        </div>

        <Link href="/admin/userfeedback-management/add-userfeedback">
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white text-sm transition">
            <Plus size={14} /> Add User Feedback
          </button>
        </Link>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {[
                  "#",
                  "Title",
                  "Description",
                  "Questions",
                  "Created",
                  "Actions",
                ].map((head) => (
                  <th
                    key={head}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                      <span className="text-sm">Loading user feedback...</span>
                    </div>
                  </td>
                </tr>
              ) : feedbackList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-500 text-sm">
                    No feedback entries found
                  </td>
                </tr>
              ) : (
                feedbackList.map((feedback, index) => (
                  <tr
                    key={feedback.id}
                    className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                  >
                    <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>

                    <td className="px-4 py-3 text-sm text-white font-medium">
                      {feedback.title}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-300 max-w-[340px] truncate">
                      {feedback.description}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-300">
                      {feedback.questions?.length || 0}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-400">
                      {feedback.createdAt
                        ? new Date(feedback.createdAt).toLocaleDateString()
                        : "—"}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(feedback.id)}
                          className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </button>

                        <Link href={`/admin/userfeedback-management/add-userfeedback?id=${feedback.id}`}>
                          <button
                            className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                            title="View / Edit"
                          >
                            <Eye size={16} />
                          </button>
                        </Link>

                        <button
                          onClick={() => handleDelete(feedback.id)}
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}