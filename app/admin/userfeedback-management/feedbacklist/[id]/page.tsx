"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Mail, User, Calendar, Clock } from "lucide-react";

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
    reviewedAt?: number;
    reviewedBy?: string;
    notes?: string;
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
    if (!rating) return <span className="text-gray-500 text-sm">No rating given</span>;
    return (
        <div className="flex items-center gap-2">
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                    <svg
                        key={n}
                        width="20"
                        height="20"
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
            <span className="text-amber-400 font-semibold">{rating}/5</span>
            <span className="text-gray-400 text-sm">— {STAR_LABELS[rating]}</span>
        </div>
    );
}

function AnswerCard({ answer, index }: { answer: FeedbackAnswer; index: number }): React.ReactElement {
    const renderAnswer = (): React.ReactElement => {
        if (answer.type === "file_upload") {
            return (
                <div className="flex flex-wrap gap-2">
                    {answer.fileUrls && answer.fileUrls.length > 0 ? (
                        answer.fileUrls.map((url, i) => (
                            <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-400 underline hover:text-blue-300 transition"
                            >
                                File {i + 1}
                            </a>
                        ))
                    ) : (
                        <span className="text-gray-500 text-sm italic">No files uploaded</span>
                    )}
                </div>
            );
        }

        if (answer.type === "rating") {
            return <StarDisplay rating={answer.answer as number} />;
        }

        if (Array.isArray(answer.answer)) {
            return (
                <div className="flex flex-wrap gap-2">
                    {answer.answer.length > 0 ? (
                        answer.answer.map((v, i) => (
                            <span
                                key={i}
                                className="px-3 py-1 bg-blue-500/10 text-blue-300 border border-blue-500/20 rounded-full text-sm"
                            >
                                {v}
                            </span>
                        ))
                    ) : (
                        <span className="text-gray-500 text-sm italic">No selection</span>
                    )}
                </div>
            );
        }

        return (
            <p className="text-gray-200 text-sm leading-relaxed">
                {answer.answer !== null && answer.answer !== undefined
                    ? String(answer.answer)
                    : <span className="text-gray-500 italic">No answer provided</span>}
            </p>
        );
    };

    const typeLabel: Record<string, string> = {
        multiple_choice: "Multiple Choice",
        text: "Text",
        rating: "Rating",
        file_upload: "File Upload",
    };

    return (
        <div className="bg-[#0d1117] border border-[#21262d] rounded-xl p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#21262d] flex items-center justify-center text-xs text-gray-400 font-bold flex-shrink-0">
                        {index + 1}
                    </span>
                    <p className="text-white font-medium text-sm">{answer.question}</p>
                </div>
                <span className="text-xs bg-[#21262d] text-gray-400 px-2 py-0.5 rounded-full flex-shrink-0">
                    {typeLabel[answer.type] || answer.type}
                </span>
            </div>
            <div className="ml-8">
                {renderAnswer()}
            </div>
        </div>
    );
}

export default function FeedbackViewPage(): React.ReactElement {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [notes, setNotes] = useState("");
    const [notesSaved, setNotesSaved] = useState(false);

    useEffect(() => {
        if (id) fetchSubmission();
    }, [id]);

   const fetchSubmission = async () => {
    try {
        setLoading(true);
        // Change this line - use query parameter instead of path parameter
        const res = await axios.get(`/api/feedback/submissions?id=${id}`);
        const data = res.data.submission as Submission;
        setSubmission(data);
        setNotes(data.notes || "");
    } catch (error) {
        console.error("Failed to fetch submission", error);
    } finally {
        setLoading(false);
    }
};

    const handleStatusChange = async (status: Submission["status"]) => {
        if (!submission) return;
        setUpdating(true);
        try {
            await axios.put("/api/feedback/submissions", {
                id: submission.id,
                status,
                notes,
            });
            setSubmission((prev) => prev ? { ...prev, status } : null);
        } catch (error) {
            console.error("Failed to update status", error);
            alert("Failed to update status");
        } finally {
            setUpdating(false);
        }
    };

    const handleSaveNotes = async () => {
        if (!submission) return;
        setUpdating(true);
        try {
            await axios.put("/api/feedback/submissions", {
                id: submission.id,
                status: submission.status,
                notes,
            });
            setNotesSaved(true);
            setTimeout(() => setNotesSaved(false), 2000);
        } catch (error) {
            console.error("Failed to save notes", error);
            alert("Failed to save notes");
        } finally {
            setUpdating(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#0d1117]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
            </div>
        );
    }

    if (!submission) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-[#0d1117] gap-4">
                <p className="text-gray-400">Submission not found</p>
                <button
                    onClick={() => router.back()}
                    className="text-sm text-pink-400 hover:text-pink-300 transition"
                >
                    ← Go back
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 text-white">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-xl bg-[#161b22] border border-[#21262d] text-gray-400 hover:text-white transition"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-semibold">Feedback Detail</h1>
                    <p className="text-gray-500 text-sm mt-0.5">ID: {submission.id}</p>
                </div>
                <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${STATUS_COLORS[submission.status]}`}>
                    {submission.status.toUpperCase()}
                </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left — Main content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Overall Rating */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                            Overall Rating
                        </p>
                        <StarDisplay rating={submission.rating} />
                    </div>

                    {/* Answers */}
                    <div>
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                            Answers ({submission.answers.length})
                        </p>
                        <div className="space-y-3">
                            {submission.answers.length > 0 ? (
                                submission.answers.map((answer, i) => (
                                    <AnswerCard key={answer.questionId} answer={answer} index={i} />
                                ))
                            ) : (
                                <p className="text-gray-500 text-sm">No answers submitted</p>
                            )}
                        </div>
                    </div>

                    {/* Text Feedback */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                            Additional Comments
                        </p>
                        {submission.textFeedback ? (
                            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                                {submission.textFeedback}
                            </p>
                        ) : (
                            <p className="text-gray-500 text-sm italic">No additional comments</p>
                        )}
                    </div>

                    {/* Screenshots */}
                    {submission.attachments && submission.attachments.length > 0 && (
                        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                                Screenshots ({submission.attachments.length})
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {submission.attachments.map((url, i) => (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={url}
                                            alt={`Screenshot ${i + 1}`}
                                            className="w-full h-32 object-cover rounded-lg hover:opacity-80 transition border border-[#21262d]"
                                        />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right — Sidebar */}
                <div className="space-y-4">
                    {/* User Info */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-4">
                            User
                        </p>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                                {submission.userName?.charAt(0) || "A"}
                            </div>
                            <div>
                                <p className="text-white font-medium text-sm">{submission.userName}</p>
                                <p className="text-gray-500 text-xs">{submission.userEmail || "No email"}</p>
                            </div>
                        </div>
                        <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2 text-gray-400">
                                <User size={12} />
                                <span className="text-gray-600">User ID:</span>
                                <span className="truncate text-gray-400">{submission.userId}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                                <Mail size={12} />
                                <span className="text-gray-600">Email:</span>
                                <span>{submission.userEmail || "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                                <Calendar size={12} />
                                <span className="text-gray-600">Submitted:</span>
                                <span>
                                    {new Date(submission.createdAt).toLocaleDateString("en-IN", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                    })}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-400">
                                <Clock size={12} />
                                <span className="text-gray-600">Time:</span>
                                <span>
                                    {new Date(submission.createdAt).toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                            Update Status
                        </p>
                        <div className="flex flex-col gap-2">
                            {(["pending", "reviewed", "resolved"] as Submission["status"][]).map((s) => (
                                <button
                                    key={s}
                                    onClick={() => handleStatusChange(s)}
                                    disabled={updating || submission.status === s}
                                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition disabled:opacity-40 ${
                                        submission.status === s
                                            ? STATUS_COLORS[s]
                                            : "bg-[#0d1117] text-gray-400 border border-[#21262d] hover:bg-[#21262d]"
                                    }`}
                                >
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                    {submission.status === s && " ✓"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Admin Notes */}
                    <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                            Admin Notes
                        </p>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Add internal notes about this submission..."
                            rows={4}
                            className="w-full bg-[#0d1117] border border-[#21262d] text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-pink-500/50 resize-none transition placeholder:text-gray-600"
                        />
                        <button
                            onClick={handleSaveNotes}
                            disabled={updating}
                            className="w-full mt-2 py-2 rounded-xl bg-[#21262d] text-gray-300 text-xs font-semibold hover:bg-[#30363d] transition disabled:opacity-40"
                        >
                            {notesSaved ? "✓ Saved!" : "Save Notes"}
                        </button>
                    </div>

                    {/* Review Info */}
                    {submission.reviewedAt && (
                        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-5">
                            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">
                                Review Info
                            </p>
                            <div className="space-y-1.5 text-xs text-gray-400">
                                <p>
                                    <span className="text-gray-600">Reviewed:</span>{" "}
                                    {new Date(submission.reviewedAt).toLocaleDateString("en-IN")}
                                </p>
                                {submission.reviewedBy && (
                                    <p>
                                        <span className="text-gray-600">By:</span>{" "}
                                        {submission.reviewedBy}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}