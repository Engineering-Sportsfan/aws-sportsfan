"use client";

import axios from "axios";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2, Copy, Flag, AlertTriangle } from "lucide-react";

type Comment = {
    id: string;
    contentId: string;
    contentType: string;
    userId: string;
    userName: string;
    userEmail?: string;
    userAvatar?: string;
    commentText: string;
    parentCommentId?: string;
    likes?: number;
    likedBy?: string[];
    timestamp?: number;
    createdAt: number;
    updatedAt: number;
    isFlagged?: boolean;
    flaggedAt?: number | null;
    metadata?: {
        contentTitle?: string;
        contentUrl?: string;
    };
};

export default function CommentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const commentId = params.id as string;

    const [comment, setComment] = useState<Comment | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        fetchComment();
    }, [commentId]);

    const fetchComment = async () => {
        try {
            setLoading(true);
            setError("");
            // Fetch all comments and find the one with matching ID
            const res = await axios.get(`/api/admin/comments?limit=1000`);
            const comments = res.data.comments || [];
            const foundComment = comments.find((c: Comment) => c.id === commentId);

            if (!foundComment) {
                setError("Comment not found");
                setComment(null);
            } else {
                setComment(foundComment);
            }
        } catch (err) {
            console.error("Failed to fetch comment", err);
            setError("Failed to fetch comment details");
            setComment(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!comment) return;
        const confirmed = window.confirm(
            "Are you sure you want to delete this comment? This will also delete all replies."
        );
        if (!confirmed) return;

        try {
            await axios.delete(`/api/admin/comments?commentId=${comment.id}`);
            alert("Comment deleted successfully");
            router.push("/admin/comments-management/comments-list");
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete comment");
        }
    };

    const handleFlag = async () => {
        if (!comment) return;

        const confirmed = window.confirm(
            comment.isFlagged
                ? "Remove the moderation flag from this comment?"
                : "Flag this comment for review? Users should see a warning before interacting with it."
        );

        if (!confirmed) return;

        try {
            const response = await axios.patch("/api/admin/comments", {
                commentId: comment.id,
                isFlagged: !comment.isFlagged,
            });

            if (response.data.success) {
                const updatedComment = response.data.comment as Comment;
                setComment(updatedComment);
                alert(
                    updatedComment.isFlagged
                        ? "Comment flagged successfully"
                        : "Comment unflagged successfully"
                );
            } else {
                alert("Failed to update comment flag");
            }
        } catch (error) {
            console.error("Flag update failed", error);
            alert("Failed to update comment flag");
        }
    };

    const copyToClipboard = (text: string, field: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    if (loading) {
        return (
            <div className="max-w-[1440px] mx-auto p-6 text-white">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/admin/comments-management/comments-list">
                        <button className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                            <ArrowLeft size={20} />
                            Back
                        </button>
                    </Link>
                </div>
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
                    <span className="text-gray-400">Loading comment details...</span>
                </div>
            </div>
        );
    }

    if (error || !comment) {
        return (
            <div className="max-w-[1440px] mx-auto p-6 text-white">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/admin/comments-management/comments-list">
                        <button className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                            <ArrowLeft size={20} />
                            Back
                        </button>
                    </Link>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
                    <p className="text-red-400">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1000px] mx-auto p-6 text-white">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between gap-4">
                <Link href="/admin/comments-management/comments-list">
                    <button className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                        <ArrowLeft size={20} />
                        Back to Comments
                    </button>
                </Link>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleFlag}
                        className={`flex items-center gap-2 px-4 py-2 rounded text-sm transition font-medium ${
                            comment.isFlagged
                                ? "bg-yellow-600 hover:bg-yellow-700 text-white"
                                : "bg-orange-600 hover:bg-orange-700 text-white"
                        }`}
                    >
                        <Flag size={16} />
                        {comment.isFlagged ? "Remove Flag" : "Flag Comment"}
                    </button>
                    <button
                        onClick={handleDelete}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white text-sm transition font-medium"
                    >
                        <Trash2 size={16} />
                        Delete Comment
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8 space-y-8">
                {comment.isFlagged && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={18} className="mt-0.5 text-red-400" />
                            <div>
                                <p className="text-sm font-semibold text-red-300">Flagged comment</p>
                                <p className="text-sm text-red-200/80 mt-1">
                                    This comment is marked for review. Users should see a warning dialog before interacting with it.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* User Information */}
                <div className="pb-8 border-b border-[#21262d]">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                        User Information
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                User Name
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all">
                                    {comment.userName}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(comment.userName, "userName")}
                                    className={`p-2 rounded transition ${
                                        copiedField === "userName"
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                    }`}
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                User Email
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all">
                                    {comment.userEmail || "—"}
                                </div>
                                {comment.userEmail && (
                                    <button
                                        onClick={() => copyToClipboard(comment.userEmail!, "userEmail")}
                                        className={`p-2 rounded transition ${
                                            copiedField === "userEmail"
                                                ? "bg-green-500/20 text-green-400"
                                                : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                        }`}
                                    >
                                        <Copy size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                User ID
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all font-mono text-sm">
                                    {comment.userId}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(comment.userId, "userId")}
                                    className={`p-2 rounded transition ${
                                        copiedField === "userId"
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                    }`}
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Comment Content */}
                <div className="pb-8 border-b border-[#21262d]">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                        Comment Text
                    </h2>
                    <div className="bg-[#0d1117] rounded px-4 py-4 text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                        {comment.commentText}
                    </div>
                </div>

                {/* Content Information */}
                <div className="pb-8 border-b border-[#21262d]">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                        Content Information
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                Content Type
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300">
                                    {comment.contentType}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(comment.contentType, "contentType")}
                                    className={`p-2 rounded transition ${
                                        copiedField === "contentType"
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                    }`}
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                Content ID
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all font-mono text-sm">
                                    {comment.contentId}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(comment.contentId, "contentId")}
                                    className={`p-2 rounded transition ${
                                        copiedField === "contentId"
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                    }`}
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Metadata */}
                {comment.metadata && (Object.keys(comment.metadata).length > 0) && (
                    <div className="pb-8 border-b border-[#21262d]">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                            Metadata
                        </h2>
                        <div className="space-y-4">
                            {comment.metadata.contentTitle && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                        Content Title
                                    </label>
                                    <div className="bg-[#0d1117] rounded px-4 py-3 text-gray-300 break-words">
                                        {comment.metadata.contentTitle}
                                    </div>
                                </div>
                            )}
                            {comment.metadata.contentUrl && (
                                <div>
                                    <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                        Content URL
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <a
                                            href={comment.metadata.contentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-blue-400 hover:text-blue-300 break-all"
                                        >
                                            {comment.metadata.contentUrl}
                                        </a>
                                        <button
                                            onClick={() => copyToClipboard(comment.metadata!.contentUrl!, "contentUrl")}
                                            className={`p-2 rounded transition ${
                                                copiedField === "contentUrl"
                                                    ? "bg-green-500/20 text-green-400"
                                                    : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                            }`}
                                        >
                                            <Copy size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Statistics */}
                <div className="pb-8 border-b border-[#21262d]">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                        Statistics
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-[#0d1117] rounded p-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                                Total Likes
                            </div>
                            <div className="text-3xl font-bold text-green-400">
                                {comment.likes || 0}
                            </div>
                        </div>

                        <div className="bg-[#0d1117] rounded p-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                                Created
                            </div>
                            <div className="text-sm text-gray-300">
                                {formatDate(comment.createdAt)}
                            </div>
                        </div>

                        <div className="bg-[#0d1117] rounded p-4">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                                Updated
                            </div>
                            <div className="text-sm text-gray-300">
                                {formatDate(comment.updatedAt)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Additional Details */}
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                        Additional Details
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                        {comment.parentCommentId && (
                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                    Parent Comment ID (Reply To)
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all font-mono text-sm">
                                        {comment.parentCommentId}
                                    </div>
                                    <button
                                        onClick={() => copyToClipboard(comment.parentCommentId!, "parentCommentId")}
                                        className={`p-2 rounded transition ${
                                            copiedField === "parentCommentId"
                                                ? "bg-green-500/20 text-green-400"
                                                : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                        }`}
                                    >
                                        <Copy size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {comment.timestamp !== undefined && comment.timestamp !== null && (
                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                    Media Timestamp
                                </label>
                                <div className="bg-[#0d1117] rounded px-4 py-3 text-gray-300">
                                    {comment.timestamp} seconds
                                </div>
                            </div>
                        )}

                        {comment.likedBy && comment.likedBy.length > 0 && (
                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                    Liked By ({comment.likedBy.length})
                                </label>
                                <div className="bg-[#0d1117] rounded p-4 max-h-48 overflow-y-auto">
                                    <div className="space-y-2">
                                        {comment.likedBy.map((userId, idx) => (
                                            <div key={idx} className="text-sm text-gray-300 font-mono break-all">
                                                {userId}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                Comment ID
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all font-mono text-sm">
                                    {comment.id}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(comment.id, "id")}
                                    className={`p-2 rounded transition ${
                                        copiedField === "id"
                                            ? "bg-green-500/20 text-green-400"
                                            : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                    }`}
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
