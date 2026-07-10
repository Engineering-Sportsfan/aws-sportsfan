"use client";

import axios from "axios";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, Trash2, Search, Music } from "lucide-react";

type Playlist = {
    id: string;
    userId: string;
    name: string;
    audioIds?: string[];
    createdAt: number;
    updatedAt: number;
};

export default function PlaylistsListPage() {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [userFilter, setUserFilter] = useState("");
    const [playlistNameFilter, setPlaylistNameFilter] = useState("");
    const [playlistNames, setPlaylistNames] = useState<string[]>([]);

    useEffect(() => {
        fetchPlaylists();
    }, [searchQuery, userFilter, playlistNameFilter]);

    const fetchPlaylists = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({
                limit: "1000",
            });
            if (searchQuery) params.append("search", searchQuery);
            if (userFilter) params.append("userId", userFilter);
            if (playlistNameFilter) params.append("playlistName", playlistNameFilter);

            const [playlistsResponse, namesResponse] = await Promise.all([
                axios.get(`/api/admin/playlists?${params.toString()}`),
                axios.get(`/api/admin/playlists?includeNames=true`),
            ]);

            setPlaylists(playlistsResponse.data.playlists || []);
            setPlaylistNames((namesResponse.data.playlistNames || []) as string[]);
        } catch (error) {
            console.error("Failed to fetch playlists", error);
            setPlaylists([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = window.confirm("Delete this playlist? This action cannot be undone.");
        if (!confirmed) return;

        try {
            await axios.delete(`/api/admin/playlists?playlistId=${id}`);
            setPlaylists((prev) => prev.filter((item) => item.id !== id));
            alert("Playlist deleted successfully");
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete playlist");
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6 text-white">
            <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold">Playlists Management</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        View and manage all playlists from all users
                    </p>
                </div>
            </div>

            <div className="mb-6 bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                placeholder="Search by playlist name, user id, or audio count..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#0d1117] border border-[#21262d] rounded px-3 py-2 pl-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                            User ID Filter
                        </label>
                        <input
                            type="text"
                            placeholder="Filter by user ID"
                            value={userFilter}
                            onChange={(e) => setUserFilter(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#21262d] rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                            Playlist Name
                        </label>
                        <select
                            value={playlistNameFilter}
                            onChange={(e) => setPlaylistNameFilter(e.target.value)}
                            className="w-full bg-[#0d1117] border border-[#21262d] rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        >
                            <option value="">All Playlist Names</option>
                            {playlistNames.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px]">
                        <thead className="bg-[#1c2330] border-b border-[#21262d]">
                            <tr>
                                {[
                                    "#",
                                    "Playlist Name",
                                    "User ID",
                                    "Audio IDs",
                                    "Total Audio",
                                    "Created",
                                    "Updated",
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
                                            <span className="text-sm">Loading playlists...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : playlists.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-gray-500 text-sm">
                                        No playlists found
                                    </td>
                                </tr>
                            ) : (
                                playlists.map((playlist, index) => (
                                    <tr
                                        key={playlist.id}
                                        className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                                    >
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {index + 1}
                                        </td>

                                        <td className="px-4 py-3 text-sm text-white font-medium">
                                            {playlist.name}
                                        </td>

                                        <td className="px-4 py-3 text-sm text-gray-300 font-mono">
                                            {playlist.userId}
                                        </td>

                                        <td className="px-4 py-3 text-sm text-gray-300 max-w-[280px] truncate">
                                            {(playlist.audioIds || []).join(", ") || "—"}
                                        </td>

                                        <td className="px-4 py-3 text-sm text-gray-300">
                                            <div className="flex items-center gap-1">
                                                <Music size={14} className="text-blue-400" />
                                                {playlist.audioIds?.length || 0}
                                            </div>
                                        </td>

                                        <td className="px-4 py-3 text-xs text-gray-400">
                                            {formatDate(playlist.createdAt)}
                                        </td>

                                        <td className="px-4 py-3 text-xs text-gray-400">
                                            {formatDate(playlist.updatedAt)}
                                        </td>

                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Link href={`/admin/playlists-management/playlists-list/${playlist.id}`}>
                                                    <button
                                                        className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                                        title="View"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                </Link>

                                                <button
                                                    onClick={() => handleDelete(playlist.id)}
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
