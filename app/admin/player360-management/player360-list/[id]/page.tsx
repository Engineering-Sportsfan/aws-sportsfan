"use client";

import axios from "axios";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

type Post = {
    id: string;
    playerName: string;
    title: string;
    likes: number;
    comments: number;
    live: number;
    shares: number;
    image: string;
    logo: string;
    category: { title: string; image: string }[];
    catlogo: { label: string; logo: string }[];
    hasVideo: boolean;
};

export default function Player360ViewPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const [post, setPost] = useState<Post | null>(null);

    useEffect(() => {
    if (!id) return;

    const fetchPost = async () => {
      const res = await axios.get(`/api/players360/${id}`);
      setPost(res.data.post);
    };

    fetchPost();
  }, [id]);

    const router = useRouter();

    const handleEdit = () => {
        router.push(
            `/admin/player360-management/add-players360?id=${id}`
        );
    };

    const handleDelete = async () => {
        const confirmDelete = window.confirm("Delete this post?");
        if (!confirmDelete) return;

        try {
            await axios.delete(`/api/players360/${id}`);
            alert("Post deleted successfully");

            router.push("/player360-management/players360-list");
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete post");
        }
    };

    if (!post) {
        return <p className="text-white p-6">Loading...</p>;
    }

    return (
        <div className="max-w-[1200px] mx-auto p-6 text-white">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold">Post Details</h1>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleEdit}
                        className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                    >
                        <Pencil size={18} />
                    </button>

                    <button
                        onClick={handleDelete}
                        className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* TEXT DATA */}
            <div className="bg-[#161b22] rounded-lg p-6 space-y-3">
                <p><b>Player Name:</b> {post.playerName}</p>
                <p><b>Title:</b> {post.title}</p>
                <p><b>Likes:</b> {post.likes}</p>
                <p><b>Comments:</b> {post.comments}</p>
                <p><b>Live:</b> {post.live}</p>
                <p><b>Shares:</b> {post.shares}</p>
                <p><b>Has Video:</b> {post.hasVideo ? "Yes" : "No"}</p>
            </div>

            {/* MAIN IMAGE + LOGO */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                    <h2 className="mb-2 font-semibold">Main Image</h2>
                    <img
                        src={post.image}
                        alt="main"
                        className="w-40 h-40 object-cover rounded border"
                    />
                </div>

                <div>
                    <h2 className="mb-2 font-semibold">Logo</h2>
                    <img
                        src={post.logo}
                        alt="logo"
                        className="w-40 h-40 object-cover rounded border"
                    />
                </div>
            </div>

            {/* CATEGORY */}
            <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">Categories</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {post.category.map((cat, i) => (
                        <div key={i} className="bg-[#161b22] p-4 rounded-lg">
                            <p className="mb-2">{cat.title}</p>
                            <img
                                src={cat.image}
                                alt={cat.title}
                                className="w-full h-32 object-cover rounded"
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* STATS ICONS */}
            <div className="mt-8">
                <h2 className="text-lg font-semibold mb-4">Stats Icons</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {post.catlogo.map((item, i) => (
                        <div
                            key={i}
                            className="bg-[#161b22] p-4 rounded-lg text-center"
                        >
                            <img
                                src={item.logo}
                                alt={item.label}
                                className="w-16 h-16 mx-auto object-cover mb-2 rounded"
                            />
                            <p className="text-sm">{item.label}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}