// app/admin/watchalong-management/watchalong-list/page.tsx
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Eye, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Room } from "@/context/WatchAlongContext";

export default function WatchAlongListPage() {
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const fetchRooms = async () => {
        try {
            setLoading(true);
            const res = await axios.get("/api/watch-along");
            setRooms(res.data.rooms || []);
        } catch (error) {
            console.error("Failed to fetch rooms", error);
            setRooms([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRooms();
    }, []);

    const handleDelete = async (id: string) => {
        const confirmDelete = window.confirm("Delete this watch along room? All associated data (chats, predictions, etc.) will be deleted.");
        if (!confirmDelete) return;

        setDeletingId(id);
        try {
            await axios.delete(`/api/watch-along/${id}`, {
                headers: {
                    "x-user-role": "admin",
                    "x-user-id": "admin_user"
                }
            });
            setRooms((prev) => prev.filter((room) => room.id !== id));
        } catch (error) {
            console.error("Delete failed", error);
            alert("Failed to delete room");
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-white">
                        Watch Along Rooms
                    </h1>
                    <p className="text-sm text-gray-400">
                        Manage all expert commentary rooms
                    </p>
                </div>
                <Link href="/admin/watchalong-management/add-watchalong">
                    <button className="flex items-center gap-2 bg-blue-600 hover:bg-pink-700 px-4 py-2 rounded-lg text-sm font-semibold text-white transition">
                        Create Room
                    </button>
                </Link>
            </div>

            {/* Table Card */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                        <thead className="bg-[#1c2330] border-b border-[#21262d]">
                            <tr>
                                {[
                                    "#",
                                    "Room Name",
                                    "Expert",
                                    "Status",
                                    "Match",
                                    "Stats",
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
                                        colSpan={7}
                                        className="text-center py-8 text-gray-400"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500"></div>
                                            Loading rooms...
                                        </div>
                                    </td>
                                </tr>
                            ) : rooms.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="text-center py-8 text-gray-400"
                                    >
                                        No watch along rooms found. Create your first room!
                                    </td>
                                </tr>
                            ) : (
                                rooms.map((room, index) => (
                                    <tr
                                        key={room.id}
                                        className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                                    >
                                        {/* Index */}
                                        <td className="px-4 py-3 text-sm text-gray-400">
                                            {index + 1}
                                        </td>

                                        {/* Room Name */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {room.displayPicture ? (
                                                    <img 
                                                        src={room.displayPicture} 
                                                        alt={room.name}
                                                        className="w-6 h-6 rounded-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white">
                                                        {room.name?.charAt(0) || "R"}
                                                    </div>
                                                )}
                                                <span className="text-sm font-medium text-white">
                                                    {room.name || "Unnamed"}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Expert */}
                                        <td className="px-4 py-3 text-sm text-gray-300">
                                            <div>
                                                <div>{room.role || "—"}</div>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${room.badgeColor} text-white`}>
                                                    {room.badge || "No badge"}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            {room.isLive ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold bg-pink-600/20 text-pink-400 border border-pink-600/30">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                                                    LIVE
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold bg-gray-700/50 text-gray-400 border border-gray-600">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                                                    RECORDED
                                                </span>
                                            )}
                                        </td>

                                        {/* Match */}
                                        <td className="px-4 py-3 text-sm text-gray-300">
                                            {room.liveMatchId ? (
                                                <span className="text-blue-400 text-xs font-mono">
                                                    {room.liveMatchId.slice(0, 8)}...
                                                </span>
                                            ) : (
                                                <span className="text-gray-500">No match linked</span>
                                            )}
                                        </td>

                                        {/* Stats */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3 text-xs text-gray-400">
                                                <span>👥 {room.watching || 0}</span>
                                                <span>📈 {room.engagement || 0}%</span>
                                                <span>⚡ {room.active || 0}</span>
                                            </div>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Link href={`/admin/watchalong-management/watchalong-list/${room.id}`}>
                                                    <button
                                                        className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                                        title="View Room"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                </Link>
                                                <Link href={`/admin/watchalong-management/add-watchalong?id=${room.id}`}>
                                                    <button
                                                        className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                                                        title="Edit Room"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(room.id)}
                                                    disabled={deletingId === room.id}
                                                    className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                                                    title="Delete Room"
                                                >
                                                    {deletingId === room.id ? (
                                                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Trash2 size={16} />
                                                    )}
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

            {/* Stats Summary */}
            {rooms.length > 0 && (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                        <p className="text-xs text-gray-400">Total Rooms</p>
                        <p className="text-2xl font-bold text-white">{rooms.length}</p>
                    </div>
                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                        <p className="text-xs text-gray-400">Live Rooms</p>
                        <p className="text-2xl font-bold text-green-400">
                            {rooms.filter(r => r.isLive).length}
                        </p>
                    </div>
                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                        <p className="text-xs text-gray-400">Total Watching</p>
                        <p className="text-2xl font-bold text-white">
                            {rooms.reduce((sum, r) => sum + (parseInt(r.watching) || 0), 0).toLocaleString()}
                        </p>
                    </div>
                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                        <p className="text-xs text-gray-400">Avg Engagement</p>
                        <p className="text-2xl font-bold text-white">
                            {Math.round(rooms.reduce((sum, r) => sum + (parseInt(r.engagement) || 0), 0) / (rooms.length || 1))}%
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}