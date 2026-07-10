"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Eye, Pencil, Trash2 } from "lucide-react";

type RoomStatus = "draft" | "published" | "live" | "ended";
type RoomType = "open" | "inner" | "moment" | "reflection";

type RoomRecord = {
    id: string;
    userId?: string;
    status?: RoomStatus;
    event?: {
        selectedEvent?: {
            id?: string;
            name?: string;
        };
        roomType?: RoomType;
    };
    details?: {
        title?: string;
        thumbnail?: string | null;
        schedule?: string;
    };
    pricing?: {
        pricePerFan?: number;
        currency?: string;
    };
    createdAt?: number;
    updatedAt?: number;
};

const STATUS_COLORS: Record<RoomStatus, string> = {
    draft: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    published: "bg-green-500/10 text-green-400 border-green-500/20",
    live: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ended: "bg-red-500/10 text-red-400 border-red-500/20",
};

const ROOM_TYPE_ICONS: Record<RoomType, string> = {
    open: "Open",
    inner: "Inner",
    moment: "Moment",
    reflection: "Reflection",
};

export default function HostroomListPage() {
    const [rooms, setRooms] = useState<RoomRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>("all");

    useEffect(() => {
        fetchRooms();
    }, []);

    const fetchRooms = async () => {
        try {
            setLoading(true);
            const res = await axios.get("/api/hostrooms/adminlistdata?limit=100");
            const data = res.data?.rooms;
            setRooms(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch host rooms", error);
            setRooms([]);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = window.confirm("Delete this host room? This action cannot be undone.");
        if (!confirmed) return;

        try {
            await axios.delete(`/api/hostrooms/${id}`);
            setRooms((prev) => prev.filter((room) => room.id !== id));
        } catch (error) {
            console.error("Failed to delete host room", error);
            alert("Failed to delete host room");
        }
    };

    const filteredRooms = useMemo(() => {
        if (statusFilter === "all") return rooms;
        return rooms.filter((room) => room.status === statusFilter);
    }, [rooms, statusFilter]);

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-white">Host Rooms</h1>
                    <p className="text-sm text-gray-400 mt-1">
                        {filteredRooms.length} room{filteredRooms.length === 1 ? "" : "s"} shown
                    </p>
                </div>
                <Link href="/admin/hostroom-management/add-hostroom">
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition">
                        + Add Host Room
                    </button>
                </Link>
            </div>

            <div className="mb-4">
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-[#161b22] border border-[#21262d] text-sm text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
                >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="live">Live</option>
                    <option value="ended">Ended</option>
                </select>
            </div>

            <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1100px]">
                        <thead className="bg-[#1c2330] border-b border-[#21262d]">
                            <tr>
                                {[
                                    "#",
                                    "Host",
                                    "Title",
                                    "Room Type",
                                    "Event",
                                    "Price",
                                    "Status",
                                    "Updated",
                                    "Actions",
                                ].map((head) => (
                                    <th
                                        key={head}
                                        className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500"
                                    >
                                        {head}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-12 text-gray-500 text-sm">
                                        Loading host rooms...
                                    </td>
                                </tr>
                            ) : filteredRooms.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="text-center py-12 text-gray-600 text-sm">
                                        No host rooms found
                                    </td>
                                </tr>
                            ) : (
                                filteredRooms.map((room, index) => {
                                    const status = room.status || "draft";
                                    const roomType = room.event?.roomType;
                                    const title = room.details?.title || "Untitled room";
                                    const eventName = room.event?.selectedEvent?.name || "-";
                                    const currency = room.pricing?.currency || "INR";
                                    const price = room.pricing?.pricePerFan;
                                    const updatedAt = room.updatedAt || room.createdAt;

                                    return (
                                        <tr
                                            key={room.id}
                                            className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                                        >
                                            <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>

                                            <td className="px-4 py-3 text-sm text-gray-300 max-w-[200px] truncate">
                                                {room.userId || "-"}
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {room.details?.thumbnail ? (
                                                        <img
                                                            src={room.details.thumbnail}
                                                            alt={title}
                                                            className="w-9 h-9 rounded object-cover shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded bg-[#21262d] border border-[#30363d]" />
                                                    )}
                                                    <p className="text-sm text-white truncate max-w-[220px]">{title}</p>
                                                </div>
                                            </td>

                                            <td className="px-4 py-3 text-sm text-gray-300 capitalize">
                                                {roomType ? ROOM_TYPE_ICONS[roomType] : "-"}
                                            </td>

                                            <td className="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">
                                                {eventName}
                                            </td>

                                            <td className="px-4 py-3 text-sm text-gray-300">
                                                {typeof price === "number" ? `${currency} ${price}` : "Free"}
                                            </td>

                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-block text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${
                                                        STATUS_COLORS[status]
                                                    }`}
                                                >
                                                    {status}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3 text-xs text-gray-500">
                                                {updatedAt ? new Date(updatedAt).toLocaleString() : "-"}
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Link href={`/admin/hostroom-management/hostroom-list/${room.id}`}>
                                                        <button
                                                            className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                                            title="View"
                                                        >
                                                            <Eye size={15} />
                                                        </button>
                                                    </Link>

                                                    <Link href={`/admin/hostroom-management/add-hostroom?id=${room.id}`}>
                                                        <button
                                                            className="p-1.5 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                                                            title="Update"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                    </Link>

                                                    <button
                                                        onClick={() => handleDelete(room.id)}
                                                        className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}