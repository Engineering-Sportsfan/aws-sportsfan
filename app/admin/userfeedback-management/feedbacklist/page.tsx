"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, Trash2, ChevronDown } from "lucide-react";
// import { useRouter } from "next/navigation";
import Link from "next/link";

type FeedbackAnswer = {
    questionId: string;
    question: string;
    type: string;
    answer: string | string[] | number | null;
    fileUrls?: string[];
};

type Submission = {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    answers: FeedbackAnswer[];
    textFeedback: string;
    rating: number | null;
    attachments: string[];
    status: "pending" | "reviewed" | "resolved";
    createdAt: number;
};

const STATUS_COLORS: Record<Submission["status"], string> = {
    pending: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30",
    reviewed: "bg-blue-500/10 text-blue-400 border border-blue-500/30",
    resolved: "bg-green-500/10 text-green-400 border border-green-500/30",
};

const STAR_LABELS: Record<number, string> = {
    1: "Poor",
    2: "Fair",
    3: "Good",
    4: "Very Good",
    5: "Excellent",
};

function StarDisplay({ rating }: { rating: number | null }): React.ReactElement {
    if (!rating) return <span className="text-gray-600 text-xs">No rating</span>;
    return (
        <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                    <svg
                        key={n}
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill={n <= rating ? "#f59e0b" : "none"}
                        stroke={n <= rating ? "#f59e0b" : "#374151"}
                        strokeWidth="1.5"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                        />
                    </svg>
                ))}
            </div>
            <span className="text-xs text-amber-400">{STAR_LABELS[rating]}</span>
        </div>
    );
}

function AnswerDisplay({ answer }: { answer: FeedbackAnswer }): React.ReactElement {
    const renderValue = (): React.ReactElement => {
        if (answer.type === "file_upload") {
            return (
                <div className="flex flex-wrap gap-2 mt-1">
                    {answer.fileUrls && answer.fileUrls.length > 0 ? (
                        answer.fileUrls.map((url, i) => (
                            <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 underline"
                            >
                                File {i + 1}
                            </a>
                        ))
                    ) : (
                        <span className="text-gray-600 text-xs">No files</span>
                    )}
                </div>
            );
        }

        if (answer.type === "rating") {
            return <StarDisplay rating={answer.answer as number} />;
        }

        if (Array.isArray(answer.answer)) {
            return (
                <div className="flex flex-wrap gap-1 mt-1">
                    {answer.answer.map((v, i) => (
                        <span
                            key={i}
                            className="text-xs bg-[#1e1e1e] text-gray-300 px-2 py-0.5 rounded-full border border-white/5"
                        >
                            {v}
                        </span>
                    ))}
                </div>
            );
        }

        return (
            <p className="text-sm text-gray-300 mt-0.5">
                {answer.answer !== null && answer.answer !== undefined && answer.answer !== "" ? (
                    String(answer.answer)
                ) : (
                    <span className="text-gray-600 italic">No answer</span>
                )}
            </p>
        );
    };

    return (
        <div className="mb-3 last:mb-0">
            <p className="text-xs text-gray-500 font-medium">{answer.question}</p>
            {renderValue()}
        </div>
    );
}

function SubmissionDetailModal({
    submission,
    onClose,
    onStatusChange,
}: {
    submission: Submission;
    onClose: () => void;
    onStatusChange: (id: string, status: Submission["status"]) => void;
}): React.ReactElement {
    const [updating, setUpdating] = useState(false);

    const handleStatusChange = async (status: Submission["status"]) => {
        setUpdating(true);
        try {
            await axios.put("/api/feedback/submissions", {
                id: submission.id,
                status,
            });
            onStatusChange(submission.id, status);
        } catch {
            alert("Failed to update status");
        } finally {
            setUpdating(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-[#161b22] border border-[#21262d] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 border-b border-[#21262d] sticky top-0 bg-[#161b22]">
                    <div>
                        <h2 className="text-white font-semibold">Submission Details</h2>
                        <p className="text-gray-500 text-xs mt-0.5">
                            {new Date(submission.createdAt).toLocaleString("en-IN")}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition text-xl leading-none"
                    >
                        ×
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* User Info */}
                    <div className="bg-[#0d1117] rounded-xl p-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {submission.userName?.charAt(0) || "A"}
                        </div>
                        <div className="flex-1">
                            <p className="text-white font-medium text-sm">{submission.userName}</p>
                            <p className="text-gray-500 text-xs">{submission.userEmail || "No email"}</p>
                            <p className="text-gray-600 text-xs mt-0.5">ID: {submission.userId}</p>
                        </div>
                        <div>
                            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[submission.status]}`}>
                                {submission.status.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    {/* Overall Rating */}
                    {submission.rating && (
                        <div className="bg-[#0d1117] rounded-xl p-4">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">
                                Overall Rating
                            </p>
                            <StarDisplay rating={submission.rating} />
                        </div>
                    )}

                    {/* Answers */}
                    <div className="bg-[#0d1117] rounded-xl p-4">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                            Answers ({submission.answers.length})
                        </p>
                        {submission.answers.length > 0 ? (
                            submission.answers.map((answer) => (
                                <AnswerDisplay key={answer.questionId} answer={answer} />
                            ))
                        ) : (
                            <p className="text-gray-600 text-sm">No answers</p>
                        )}
                    </div>

                    {/* Text Feedback */}
                    {submission.textFeedback && (
                        <div className="bg-[#0d1117] rounded-xl p-4">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">
                                Additional Comments
                            </p>
                            <p className="text-gray-300 text-sm leading-relaxed">{submission.textFeedback}</p>
                        </div>
                    )}

                    {/* Attachments */}
                    {submission.attachments && submission.attachments.length > 0 && (
                        <div className="bg-[#0d1117] rounded-xl p-4">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                                Attachments ({submission.attachments.length})
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                                {submission.attachments.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={url}
                                            alt={`Attachment ${i + 1}`}
                                            className="w-full h-24 object-cover rounded-lg hover:opacity-80 transition"
                                        />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Status Update */}
                    <div className="bg-[#0d1117] rounded-xl p-4">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                            Update Status
                        </p>
                        <div className="flex gap-2">
                            {(["pending", "reviewed", "resolved"] as Submission["status"][]).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => handleStatusChange(s)}
                                    disabled={updating || submission.status === s}
                                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition disabled:opacity-40 ${
                                        submission.status === s
                                            ? STATUS_COLORS[s]
                                            : "bg-[#1e1e1e] text-gray-400 hover:bg-[#2a2a2a]"
                                    }`}
                                >
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function FeedbackSubmissionsPage(): React.ReactElement {
    // const router = useRouter();
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [deleting, setDeleting] = useState<string | null>(null);

    useEffect(() => {
        fetchSubmissions();
    }, [statusFilter]);

    const fetchSubmissions = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ limit: "50" });
            if (statusFilter !== "all") params.append("status", statusFilter);
            const res = await axios.get(`/api/feedback/submissions?${params}`);
            setSubmissions(res.data.submissions || []);
        } catch (error) {
            console.error("Failed to fetch submissions", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this submission?")) return;
        setDeleting(id);
        try {
            await axios.delete(`/api/feedback/submissions?id=${id}`);
            setSubmissions((prev) => prev.filter((s) => s.id !== id));
            if (selectedSubmission?.id === id) {
                setSelectedSubmission(null);
            }
        } catch (error) {
            console.error("Failed to delete submission", error);
            alert("Failed to delete submission");
        } finally {
            setDeleting(null);
        }
    };

    const handleStatusChange = (id: string, status: Submission["status"]) => {
        setSubmissions((prev) =>
            prev.map((s) => (s.id === id ? { ...s, status } : s))
        );
        if (selectedSubmission?.id === id) {
            setSelectedSubmission((prev) => (prev ? { ...prev, status } : null));
        }
    };

    const stats = {
        total: submissions.length,
        pending: submissions.filter((s) => s.status === "pending").length,
        reviewed: submissions.filter((s) => s.status === "reviewed").length,
        resolved: submissions.filter((s) => s.status === "resolved").length,
    };

    return (
        <div className="max-w-[1440px] mx-auto p-4 md:p-6 text-white">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold">Feedback Submissions</h1>
                    <p className="text-sm text-gray-400">Review and manage user feedback</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                    { label: "Total", value: stats.total, color: "text-white" },
                    { label: "Pending", value: stats.pending, color: "text-yellow-400" },
                    { label: "Reviewed", value: stats.reviewed, color: "text-blue-400" },
                    { label: "Resolved", value: stats.resolved, color: "text-green-400" },
                ].map((stat) => (
                    <div key={stat.label} className="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                        <p className="text-gray-500 text-xs font-medium">{stat.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2 mb-4">
                <p className="text-gray-500 text-sm">Filter:</p>
                <div className="relative">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-[#161b22] border border-[#21262d] text-white text-sm rounded-xl px-3 py-2 pr-8 focus:outline-none focus:border-pink-500/50 appearance-none cursor-pointer"
                    >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="resolved">Resolved</option>
                    </select>
                    <ChevronDown
                        size={14}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-[#1c2330] border-b border-[#21262d]">
                            <tr>
                                {["#", "User", "Rating", "Feedback", "Answers", "Status", "Date", "Actions"].map((h) => (
                                    <th
                                        key={h}
                                        className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-gray-400">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto mb-2" />
                                        Loading submissions...
                                    </td>
                                </tr>
                            ) : submissions.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-gray-500">
                                        No submissions found
                                    </td>
                                </tr>
                            ) : (
                                submissions.map((submission, index) => (
                                    <tr
                                        key={submission.id}
                                        className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                                    >
                                        <td className="px-4 py-3 text-gray-500 text-sm">{index + 1}</td>

                                        {/* User */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                    {submission.userName?.charAt(0) || "A"}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-white text-sm font-medium truncate max-w-[120px]">
                                                        {submission.userName}
                                                    </p>
                                                    <p className="text-gray-500 text-xs truncate max-w-[120px]">
                                                        {submission.userEmail || "No email"}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Rating */}
                                        <td className="px-4 py-3">
                                            <StarDisplay rating={submission.rating} />
                                        </td>

                                        {/* Feedback Preview */}
                                        <td className="px-4 py-3">
                                            <p className="text-gray-400 text-sm max-w-[200px] truncate">
                                                {submission.textFeedback || (
                                                    <span className="text-gray-600 italic">No comments</span>
                                                )}
                                            </p>
                                        </td>

                                        {/* Answers count */}
                                        <td className="px-4 py-3">
                                            <span className="text-xs bg-[#1e1e1e] text-gray-400 px-2 py-1 rounded-full border border-white/5">
                                                {submission.answers.length} answers
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            <span
                                                className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_COLORS[submission.status]}`}
                                            >
                                                {submission.status.toUpperCase()}
                                            </span>
                                        </td>

                                        {/* Date */}
                                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                            {new Date(submission.createdAt).toLocaleDateString("en-IN", {
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Link
                                                    href={`/admin/userfeedback-management/feedbacklist/${submission.id}`}
                                                >
                                                    <button
                                                        className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                                        title="View details"
                                                    >
                                                        <Eye size={15} />
                                                    </button>
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(submission.id)}
                                                    disabled={deleting === submission.id}
                                                    className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={15} />
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

            {/* Detail Modal - Now only for status updates if needed, or you can remove it */}
            {selectedSubmission && (
                <SubmissionDetailModal
                    submission={selectedSubmission}
                    onClose={() => setSelectedSubmission(null)}
                    onStatusChange={handleStatusChange}
                />
            )}
        </div>
    );
}