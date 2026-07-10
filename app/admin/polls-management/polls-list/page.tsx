"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, Pencil, Trash2, Plus, Power } from "lucide-react";
import { useRouter } from "next/navigation";

type PollType = "poll" | "quiz";

interface PollOption {
  id: string;
  label: string;
  votes: number;
  isCorrect?: boolean;
}

interface Poll {
  id: string;
  title: string;
  type: PollType;
  options: PollOption[];
  endsAt: string;
  active: boolean;
  createdAt: string;
}

export default function PollsListPage() {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchPolls();
  }, []);

  const fetchPolls = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/polls");
      setPolls(res.data.data || []);
    } catch (error) {
      console.error("Failed to fetch polls", error);
      setPolls([]);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (id: string) => {
    router.push(`/admin/polls-management/polls-list/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/admin/polls-management/add-polls?id=${id}`);
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm("Delete this poll? This action cannot be undone.");
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/polls/${id}`);
      setPolls((prev) => prev.filter((poll) => poll.id !== id));
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete poll");
    }
  };

  const handleToggleActive = async (poll: Poll) => {
    try {
      await axios.put(`/api/polls/${poll.id}`, { active: !poll.active });
      setPolls((prev) =>
        prev.map((p) =>
          p.id === poll.id ? { ...p, active: !p.active } : p
        )
      );
    } catch (error) {
      console.error("Failed to toggle poll status", error);
      alert("Failed to update poll status");
    }
  };

  const totalVotes = (options: PollOption[]) => {
    return options.reduce((sum, opt) => sum + opt.votes, 0);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (endsAt: string) => {
    return new Date(endsAt) < new Date();
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Polls & Quizzes</h1>
          <p className="text-sm text-gray-400">Manage all polls and quizzes</p>
        </div>
        <button
          onClick={() => router.push("/admin/polls-management/add-polls")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition text-white text-sm font-medium"
        >
          <Plus size={16} />
          Create New
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {[
                  "#",
                  "Type",
                  "Title",
                  "Options",
                  "Total Votes",
                  "Status",
                  "Ends On",
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
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    Loading polls...
                  </td>
                </tr>
              ) : polls.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    No polls or quizzes found
                  </td>
                </tr>
              ) : (
                polls.map((poll, index) => (
                  <tr
                    key={poll.id}
                    className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                  >
                    <td className="px-4 py-3 text-sm">{index + 1}</td>

                    <td className="px-4 py-3">
                      <span
                        className={[
                          "px-2 py-1 text-xs rounded font-medium",
                          poll.type === "quiz"
                            ? "bg-blue-500/10 text-blue-400"
                            : "bg-purple-500/10 text-purple-400",
                        ].join(" ")}
                      >
                        {poll.type === "quiz" ? "Quiz" : "Poll"}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm font-medium max-w-[250px] truncate">
                      {poll.title}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-300">
                      {poll.options.length} options
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-300">
                      {totalVotes(poll.options)}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleActive(poll)}
                        className={[
                          "flex items-center gap-1.5 px-2 py-1 text-xs rounded font-medium transition-colors",
                          poll.active && !isExpired(poll.endsAt)
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20",
                        ].join(" ")}
                      >
                        <Power size={10} />
                        {poll.active && !isExpired(poll.endsAt) ? "Active" : "Inactive"}
                      </button>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDate(poll.endsAt)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleView(poll.id)}
                          className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                          title="View Results"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => handleEdit(poll.id)}
                          className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                          title="Edit Poll"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleDelete(poll.id)}
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                          title="Delete Poll"
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