"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Eye, Pencil, Trash2, Music, Video, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

type DropItem = {
    title: string;
    duration: string;
    description?: string;
    mediaUrl: string;
    thumbnail?: string;
    listens: number;
    signals: number;
    engagement: number;
};

type Playlist = {
    id: string;
    name?: string;
    playerName?: string; // Add playerName field
    playerProfilesId: string;
    audioDrops: DropItem[];
    videoDrops: DropItem[];
    createdAt: number;
    updatedAt: number;
};

export default function PlayerProfilesPlaylistListPage() {
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchPlaylists();
    }, []);

    const fetchPlaylists = async () => {
        try {
            setLoading(true);
            const res = await axios.get("/api/playersprofile-playlist");
            const playlistsData = res.data.playlists || [];
            
            // Fetch player names for each playlist
            const playlistsWithPlayerNames = await Promise.all(
                playlistsData.map(async (playlist: Playlist) => {
                    try {
                        const playerRes = await axios.get(`/api/player-profile/search/${playlist.playerProfilesId}`);
                        if (playerRes.data?.success && playerRes.data?.data?.profile) {
                            return {
                                ...playlist,
                                playerName: playerRes.data.data.profile.name
                            };
                        }
                        return {
                            ...playlist,
                            playerName: "Unknown Player"
                        };
                    } catch (error) {
                        console.error(`Failed to fetch player for ID ${playlist.playerProfilesId}:`, error);
                        return {
                            ...playlist,
                            playerName: "Unknown Player"
                        };
                    }
                })
            );
            
            setPlaylists(playlistsWithPlayerNames);
        } catch (error) {
            console.error("Failed to fetch playlists", error);
            setPlaylists([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmDelete = window.confirm("Delete this playlist? All associated audio and video drops will also be deleted.");
        if (!confirmDelete) return;

        try {
            await axios.delete(`/api/playersprofile-playlist/${id}`);
            setPlaylists((prev) => prev.filter((playlist) => playlist.id !== id));
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete playlist");
        }
    };

    const handleEdit = (id: string) => {
        console.log("Edit", id);
    };

    const handleView = (id: string) => {
        console.log("View", id);
    };

    const toggleRow = (id: string) => {
        const newExpanded = new Set(expandedRows);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedRows(newExpanded);
    };

    const getTotalDrops = (playlist: Playlist) => {
        return (playlist.audioDrops?.length || 0) + (playlist.videoDrops?.length || 0);
    };

    const getTotalEngagement = (playlist: Playlist) => {
        const audioEngagement = playlist.audioDrops?.reduce((sum, drop) => sum + drop.engagement, 0) || 0;
        const videoEngagement = playlist.videoDrops?.reduce((sum, drop) => sum + drop.engagement, 0) || 0;
        return audioEngagement + videoEngagement;
    };

    const getTotalListens = (playlist: Playlist) => {
        const audioListens = playlist.audioDrops?.reduce((sum, drop) => sum + drop.listens, 0) || 0;
        const videoListens = playlist.videoDrops?.reduce((sum, drop) => sum + drop.listens, 0) || 0;
        return audioListens + videoListens;
    };

    const renderDropSection = (drops: DropItem[], type: "audio" | "video") => {
        if (!drops || drops.length === 0) return null;

        return (
            <div className="mt-3 space-y-2">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                    {type === "audio" ? <Music size={14} /> : <Video size={14} />}
                    {type === "audio" ? "Audio Drops" : "Video Drops"} ({drops.length})
                </h4>
                <div className="space-y-2 pl-4">
                    {drops.map((drop, idx) => (
                        <div key={idx} className="bg-[#0d1117] rounded p-3 border border-gray-700">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                    <span className="text-gray-500 text-xs">Title:</span>
                                    <p className="text-white">{drop.title}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs">Duration:</span>
                                    <p className="text-gray-300">{drop.duration}</p>
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs">Stats:</span>
                                    <p className="text-gray-300">
                                        👂 {drop.listens} | 🔔 {drop.signals} | 💬 {drop.engagement}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-gray-500 text-xs">Media:</span>
                                    <a 
                                        href={drop.mediaUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:underline text-xs block truncate"
                                    >
                                        View {type === "audio" ? "Audio" : "Video"}
                                    </a>
                                </div>
                            </div>
                            {drop.description && (
                                <div className="mt-2">
                                    <span className="text-gray-500 text-xs">Description:</span>
                                    <p className="text-gray-400 text-xs">{drop.description}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            {/* Header */}
            <div className="mb-6 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-semibold text-white">
                        Players Profile Playlists
                    </h1>
                    <p className="text-sm text-gray-400">
                        Manage all audio and video drops for Player profiles
                    </p>
                </div>
                <Link href="/admin/playerprofileplaylist-management/add-playerprofileplaylist">
                    <button className="bg-blue-600 px-4 py-2 rounded text-white hover:bg-blue-700 transition">
                         Create New Playlist
                    </button>
                </Link>
            </div>

            {/* Table Card */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1000px]">
                        <thead className="bg-[#1c2330] border-b border-[#21262d]">
                            <tr>
                                {[
                                    "#",
                                    "Player Name",
                                    "Audio Drops",
                                    "Video Drops",
                                    "Total Drops",
                                    "Total Listens",
                                    "Total Engagement",
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
                                        Loading playlists...
                                    </td>
                                </tr>
                            ) : playlists.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-8 text-gray-400">
                                        No playlists found
                                    </td>
                                </tr>
                            ) : (
                                playlists.map((playlist, index) => (
                                    <>
                                        <tr
                                            key={playlist.id}
                                            className="border-b border-[#21262d] hover:bg-[#0d1117] transition cursor-pointer"
                                            onClick={() => toggleRow(playlist.id)}
                                        >
                                            {/* Index */}
                                            <td className="px-4 py-3 text-sm text-gray-400">
                                                {index + 1}
                                            </td>

                                            {/* Player Name - Fixed */}
                                            <td className="px-4 py-3 text-sm text-white font-mono">
                                                {playlist.playerName || "Loading..."}
                                            </td>

                                            {/* Audio Drops */}
                                            <td className="px-4 py-3 text-sm text-gray-300">
                                                <div className="flex items-center gap-1">
                                                    <Music size={14} className="text-blue-400" />
                                                    {playlist.audioDrops?.length || 0}
                                                </div>
                                            </td>

                                            {/* Video Drops */}
                                            <td className="px-4 py-3 text-sm text-gray-300">
                                                <div className="flex items-center gap-1">
                                                    <Video size={14} className="text-green-400" />
                                                    {playlist.videoDrops?.length || 0}
                                                </div>
                                            </td>

                                            {/* Total Drops */}
                                            <td className="px-4 py-3 text-sm text-gray-300">
                                                {getTotalDrops(playlist)}
                                            </td>

                                            {/* Total Listens */}
                                            <td className="px-4 py-3 text-sm text-gray-300">
                                                {getTotalListens(playlist).toLocaleString()}
                                            </td>

                                            {/* Total Engagement */}
                                            <td className="px-4 py-3 text-sm text-gray-300">
                                                {getTotalEngagement(playlist).toLocaleString()}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleRow(playlist.id);
                                                        }}
                                                        className="p-2 rounded-md bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition"
                                                        title={expandedRows.has(playlist.id) ? "Collapse" : "Expand"}
                                                    >
                                                        {expandedRows.has(playlist.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </button>
                                                    <Link href={`/admin/playerprofileplaylist-management/playerprofile-list/${playlist.id}`}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleView(playlist.id);
                                                            }}
                                                            className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                                            title="View Details"
                                                        >
                                                            <Eye size={16} />
                                                        </button>
                                                    </Link>
                                                    <Link href={`/admin/playerprofileplaylist-management/add-playerprofileplaylist?id=${playlist.id}`}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEdit(playlist.id);
                                                            }}
                                                            className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                                                            title="Edit"
                                                        >
                                                            <Pencil size={16} />
                                                        </button>
                                                    </Link>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(playlist.id);
                                                        }}
                                                        className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        
                                        {/* Expanded Row - Shows Audio and Video Drops */}
                                        {expandedRows.has(playlist.id) && (
                                            <tr className="bg-[#0d1117] border-b border-[#21262d]">
                                                <td colSpan={8} className="px-4 py-4">
                                                    <div className="space-y-4">
                                                        {renderDropSection(playlist.audioDrops, "audio")}
                                                        {renderDropSection(playlist.videoDrops, "video")}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}