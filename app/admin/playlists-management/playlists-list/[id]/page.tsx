"use client";

import axios from "axios";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Music, Trash2 } from "lucide-react";

type Playlist = {
    id: string;
    userId: string;
    name: string;
    audioIds?: string[];
    createdAt: number;
    updatedAt: number;
};

export default function PlaylistDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        fetchPlaylist();
    }, [id]);

    const fetchPlaylist = async () => {
        try {
            setLoading(true);
            setError("");
            const response = await axios.get(`/api/admin/playlists?limit=1000`);
            const playlists = response.data.playlists || [];
            const foundPlaylist = playlists.find((item: Playlist) => item.id === id);

            if (!foundPlaylist) {
                setError("Playlist not found");
                setPlaylist(null);
            } else {
                setPlaylist(foundPlaylist);
            }
        } catch (err) {
            console.error("Failed to fetch playlist", err);
            setError("Failed to load playlist details");
            setPlaylist(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!playlist) return;

        const confirmed = window.confirm("Delete this playlist? This action cannot be undone.");
        if (!confirmed) return;

        try {
            await axios.delete(`/api/admin/playlists?playlistId=${playlist.id}`);
            alert("Playlist deleted successfully");
            router.push("/admin/playlists-management/playlists-list");
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete playlist");
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
                    <Link href="/admin/playlists-management/playlists-list">
                        <button className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                            <ArrowLeft size={20} />
                            Back
                        </button>
                    </Link>
                </div>
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
                    <span className="text-gray-400">Loading playlist details...</span>
                </div>
            </div>
        );
    }

    if (error || !playlist) {
        return (
            <div className="max-w-[1440px] mx-auto p-6 text-white">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/admin/playlists-management/playlists-list">
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
            <div className="mb-8 flex items-center justify-between gap-4">
                <Link href="/admin/playlists-management/playlists-list">
                    <button className="flex items-center gap-2 text-gray-400 hover:text-white transition">
                        <ArrowLeft size={20} />
                        Back to Playlists
                    </button>
                </Link>
                <button
                    onClick={handleDelete}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white text-sm transition font-medium"
                >
                    <Trash2 size={16} />
                    Delete Playlist
                </button>
            </div>

            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8 space-y-8">
                <div className="pb-8 border-b border-[#21262d]">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                        Playlist Information
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                Playlist Name
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all">
                                    {playlist.name}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(playlist.name, "name")}
                                    className={`p-2 rounded transition ${
                                        copiedField === "name"
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
                                Playlist ID
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all font-mono text-sm">
                                    {playlist.id}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(playlist.id, "id")}
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

                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                User ID
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="bg-[#0d1117] rounded px-4 py-3 flex-1 text-gray-300 break-all font-mono text-sm">
                                    {playlist.userId}
                                </div>
                                <button
                                    onClick={() => copyToClipboard(playlist.userId, "userId")}
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

                        <div>
                            <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                                Audio Count
                            </label>
                            <div className="bg-[#0d1117] rounded px-4 py-3 text-gray-300 flex items-center gap-2">
                                <Music size={16} className="text-blue-400" />
                                {(playlist.audioIds || []).length} audio IDs
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pb-8 border-b border-[#21262d]">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
                        Audio IDs
                    </h2>
                    <div className="bg-[#0d1117] rounded p-4">
                        {playlist.audioIds && playlist.audioIds.length > 0 ? (
                            <div className="space-y-2">
                                {playlist.audioIds.map((audioId, index) => (
                                    <div
                                        key={audioId + index}
                                        className="flex items-center justify-between gap-4 bg-[#161b22] border border-[#21262d] rounded px-3 py-2"
                                    >
                                        <span className="text-gray-300 text-sm break-all">{audioId}</span>
                                        <button
                                            onClick={() => copyToClipboard(audioId, `audio-${index}`)}
                                            className={`p-2 rounded transition ${
                                                copiedField === `audio-${index}`
                                                    ? "bg-green-500/20 text-green-400"
                                                    : "bg-gray-500/10 text-gray-400 hover:bg-gray-500/20"
                                            }`}
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-gray-500 text-sm">No audio IDs in this playlist</p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                            Created At
                        </label>
                        <div className="bg-[#0d1117] rounded px-4 py-3 text-gray-300">
                            {formatDate(playlist.createdAt)}
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-gray-500 uppercase tracking-wider mb-2 block">
                            Updated At
                        </label>
                        <div className="bg-[#0d1117] rounded px-4 py-3 text-gray-300">
                            {formatDate(playlist.updatedAt)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
