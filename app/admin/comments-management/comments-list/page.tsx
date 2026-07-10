"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Trash2, Search, Flag } from "lucide-react";

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

export default function CommentsListPage() {
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [contentTypeFilter, setContentTypeFilter] = useState("");
    const [contentTypes, setContentTypes] = useState<string[]>([]);

    useEffect(() => {
        fetchComments();
    }, [searchQuery, contentTypeFilter]);

    const fetchComments = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                limit: "100",
            });
            if (searchQuery) params.append("search", searchQuery);
            if (contentTypeFilter) params.append("contentType", contentTypeFilter);

            const [commentsResponse, contentTypesResponse] = await Promise.all([
                axios.get(`/api/admin/comments?${params.toString()}`),
                axios.get(`/api/admin/comments?includeContentTypes=true`),
            ]);

            const commentsList = commentsResponse.data.comments || [];
            setComments(commentsList);

            setContentTypes((contentTypesResponse.data.contentTypes || []) as string[]);
        } catch (error) {
            console.error("Failed to fetch comments", error);
            setComments([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this comment? This will also delete all replies."
        );
        if (!confirmed) return;

        try {
            await axios.delete(`/api/admin/comments?commentId=${id}`);
            setComments((prev) => prev.filter((item) => item.id !== id));
            alert("Comment deleted successfully");
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete comment");
        }
    };

    const handleFlag = async (id: string, currentIsFlagged: boolean) => {
        const confirmed = window.confirm(
            currentIsFlagged
                ? "Remove the moderation flag from this comment?"
                : "Flag this comment for review? Users should see a warning before interacting with it."
        );

        if (!confirmed) return;

        try {
            const response = await axios.patch("/api/admin/comments", {
                commentId: id,
                isFlagged: !currentIsFlagged,
            });

            if (response.data.success) {
                const newIsFlagged = !currentIsFlagged;
                setComments((prev) =>
                    prev.map((comment) =>
                        comment.id === id
                            ? {
                                  ...comment,
                                  isFlagged: newIsFlagged,
                                  flaggedAt: newIsFlagged ? Date.now() : null,
                              }
                            : comment
                    )
                );
                alert(
                    newIsFlagged
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

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6 text-white">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-xl font-semibold">Comments Management</h1>
                <p className="text-sm text-gray-400 mt-1">
                    View and manage all comments from the application
                </p>
            </div>

            {/* Filters */}
            <div className="mb-6 bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Search */}
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                            Search
                        </label>
                        <div className="relative">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
                            />
                            <input
                                type="text"
                                placeholder="Search by comment, user name, or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0d1117] border border-[#21262d] rounded px-3 py-2 pl-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    {/* Content Type Filter */}
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                            Content Type
                        </label>
                        <select
                            value={contentTypeFilter}
                            onChange={(e) => setContentTypeFilter(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#21262d] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="">All Content Types</option>
                            {contentTypes.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Comments Table */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1200px]">
                        <thead className="bg-[#1c2330] border-b border-[#21262d]">
                            <tr>
                                {[
                                    "#",
                                    "User",
                                    "Comment",
                                    "Content Type",
                                    "Content ID",
                                    "Likes",
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
                                    <td colSpan={8} className="text-center py-12 text-gray-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                                            <span className="text-sm">Loading comments...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : comments.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-gray-500 text-sm">
                                        No comments found
                                    </td>
                                </tr>
                            ) : (
                                comments.map((comment, index) => (
                                    <tr
                                        key={comment.id}
                                        className={`border-b border-[#21262d] hover:bg-[#0d1117] transition ${
                                            comment.isFlagged ? "bg-red-500/5" : ""
                                        }`}
                                    >
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {index + 1}
                                        </td>

                                        <td className="px-4 py-3 text-sm">
                                            <div className="text-white font-medium">
                                                {comment.userName}
                                            </div>
                                            <div className="text-xs text-gray-400">
                                                {comment.userEmail || "—"}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-sm text-gray-300 max-w-[300px] truncate">
                                            <div className="space-y-1">
                                                <div>{comment.commentText}</div>
                                                {comment.isFlagged && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400">
                                                        <Flag size={10} />
                                                        Flagged for review
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-sm">
                                            <span className="px-2 py-1 rounded text-xs bg-blue-500/10 text-blue-400">
                                                {comment.contentType}
                                            </span>
                                        </td>

                                        <td className="px-4 py-3 text-sm text-gray-400 max-w-[120px] truncate">
                                            {comment.contentId}
                                        </td>

                                        <td className="px-4 py-3 text-sm text-gray-300">
                                            {comment.likes || 0}
                                        </td>

                                        <td className="px-4 py-3 text-xs text-gray-400">
                                            {formatDate(comment.createdAt)}
                                        </td>

                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Link href={`/admin/comments-management/comments-list/${comment.id}`}>
                                                    <button
                                                        className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                                        title="View"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                </Link>

                                                <button
                                                    onClick={() => handleFlag(comment.id, Boolean(comment.isFlagged))}
                                                    className={`p-2 rounded-md transition ${
                                                        comment.isFlagged
                                                            ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                                                            : "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                                                    }`}
                                                    title={comment.isFlagged ? "Remove flag" : "Flag comment"}
                                                >
                                                    <Flag size={16} />
                                                </button>

                                                <button
                                                    onClick={() => handleDelete(comment.id)}
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
