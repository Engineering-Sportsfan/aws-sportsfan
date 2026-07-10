"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";

type Team360Post = {
    id: string;
    teamName: string;
    title: string;
    likes: number;
    comments: number;
    shares: number;
    createdAt?: string;
};

export default function Team360ListPage() {
    const [posts, setPosts] = useState<Team360Post[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const res = await axios.get("/api/team360");
            setPosts(res.data.posts || []);
        } catch (error) {
            console.error("Failed to fetch posts", error);
            setPosts([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmDelete = window.confirm("Delete this post?");
        if (!confirmDelete) return;

        try {
            await axios.delete(`/api/team360/${id}`);
            setPosts((prev) => prev.filter((post) => post.id !== id));
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete");
        }
    };

    const handleEdit = (id: string) => {
        console.log("Edit", id);
        // router.push(`/team360/edit/${id}`)
    };

    const handleView = (id: string) => {
        console.log("View", id);
        // router.push(`/team360/view/${id}`)
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-xl font-semibold text-white">
                    Team360 Posts
                </h1>
                <p className="text-sm text-gray-400">
                    Manage all created Team360 posts
                </p>
            </div>

            {/* Table Card */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-[#1c2330] border-b border-[#21262d]">
                            <tr>
                                {[
                                    "#",
                                    "Team Name",
                                    "Title",
                                    "Likes",
                                    "Comments",
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
                                    <td
                                        colSpan={6}
                                        className="text-center py-8 text-gray-400"
                                    >
                                        Loading posts...
                                    </td>
                                </tr>
                            ) : posts.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="text-center py-8 text-gray-400"
                                    >
                                        No posts found
                                    </td>
                                </tr>
                            ) : (
                                posts.map((post, index) => (
                                    <tr
                                        key={post.id}
                                        className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                                    >
                                        {/* Index */}
                                        <td className="px-4 py-3 text-sm text-gray-400">
                                            {index + 1}
                                        </td>

                                        {/* Team Name */}
                                        <td className="px-4 py-3 text-sm text-white">
                                            {post.teamName}
                                        </td>

                                        {/* Title */}
                                        <td className="px-4 py-3 text-sm text-gray-300">
                                            {post.title}
                                        </td>

                                        {/* Likes */}
                                        <td className="px-4 py-3 text-sm text-gray-300">
                                            {post.likes}
                                        </td>

                                        {/* Comments */}
                                        <td className="px-4 py-3 text-sm text-gray-300">
                                            {post.comments}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <Link href={`/admin/team360-management/team360-list/${post.id}`} >
                                                    <button
                                                        onClick={() => handleView(post.id)}
                                                        className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                </Link>
                                                <Link href={`/admin/team360-management/add-team360?id=${post.id}`} >
                                                    <button
                                                        onClick={() => handleEdit(post.id)}
                                                        className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                </Link>

                                                <button
                                                    onClick={() => handleDelete(post.id)}
                                                    className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
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