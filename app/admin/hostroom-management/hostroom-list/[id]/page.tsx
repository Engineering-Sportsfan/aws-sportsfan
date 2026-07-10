"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import Link from "next/link";
import {
    ArrowLeft,
    BarChart2,
    Calendar,
    Eye,
    FileText,
    Globe,
    Image as ImageIcon,
    LayoutDashboard,
    MapPin,
    Pencil,
    Play,
    Shield,
    Tag,
    Users,
} from "lucide-react";

type RoomStatus = "draft" | "published" | "live" | "ended";
type RoomType = "open" | "inner" | "moment" | "reflection";
type ViewTab = "overview" | "details" | "assets" | "raw";
type Accent = "blue" | "green" | "yellow" | "purple" | "gray";

type RoomRecord = {
    id: string;
    userId?: string;
    firebaseUid?: string;
    status?: RoomStatus;
    currentStep?: number;
    event?: {
        selectedEvent?: {
            id?: string;
            name?: string;
        };
        roomType?: RoomType;
    };
    details?: {
        title?: string;
        description?: string;
        thumbnail?: string | null;
        capacity?: number;
        primaryLanguage?: string;
        schedule?: string;
        tags?: string[];
        moderators?: string[];
    };
    content?: {
        assets?: Array<{
            type?: string;
            url?: string;
            name?: string;
            size?: number;
        }>;
    };
    pricing?: {
        pricePerFan?: number;
        currency?: string;
    };
    createdAt?: number;
    updatedAt?: number;
    publishedAt?: number;
};

/*
const STATUS_COLORS: Record<RoomStatus, string> = {
    draft: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    published: "bg-green-500/10 text-green-400 border-green-500/20",
    live: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ended: "bg-red-500/10 text-red-400 border-red-500/20",
};
*/
const ROOM_TYPE_LABELS: Record<RoomType, string> = {
    open: "Open",
    inner: "Inner",
    moment: "Moment",
    reflection: "Reflection",
};

const TABS: Array<{ key: ViewTab; label: string; icon: ReactNode }> = [
    { key: "overview", label: "Overview", icon: <Shield size={15} /> },
    { key: "details", label: "Details", icon: <BarChart2 size={15} /> },
    { key: "assets", label: "Assets", icon: <Play size={15} /> },
    { key: "raw", label: "Raw Data", icon: <FileText size={15} /> },
];

export default function HostroomViewPage() {
    const params = useParams();
    const router = useRouter();
    const roomId = params.id as string;

    const [room, setRoom] = useState<RoomRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ViewTab>("overview");

    useEffect(() => {
        if (roomId) fetchRoom();
    }, [roomId]);

    const fetchRoom = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/hostrooms/adminlistdata?id=${roomId}`);
            if (!res.data?.success || !res.data?.room) {
                setError("Host room not found");
                return;
            }
            setRoom(res.data.room);
            setError(null);
        } catch (err) {
            console.error("Failed to fetch room", err);
            setError("Failed to load host room details");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-[1440px] mx-auto p-6">
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-16 flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                    <p className="text-gray-500 text-sm">Loading host room...</p>
                </div>
            </div>
        );
    }

    if (error || !room) {
        return (
            <div className="max-w-[1440px] mx-auto p-6">
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-16 text-center">
                    <p className="text-red-400 mb-4">{error || "Host room not found"}</p>
                    <button
                        onClick={() => router.push("/admin/hostroom-management/hostroom-list")}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const status = room.status || "draft";
    const roomType = room.event?.roomType;
    const title = room.details?.title || "Untitled room";
    const description = room.details?.description || "No description available";
    const tags = room.details?.tags || [];
    const moderators = room.details?.moderators || [];
    const assets = room.content?.assets || [];
    const fullDocument = JSON.stringify(room, null, 2);

    const metrics = [
        {
            label: "Room Type",
            value: roomType ? ROOM_TYPE_LABELS[roomType] : "-",
            icon: <Shield size={14} />,
            accent: "blue" as Accent,
        },
        {
            label: "Assets",
            value: String(assets.length),
            icon: <ImageIcon size={14} />,
            accent: "green" as Accent,
        },
        {
            label: "Tags",
            value: String(tags.length),
            icon: <Tag size={14} />,
            accent: "yellow" as Accent,
        },
        {
            label: "Moderators",
            value: String(moderators.length),
            icon: <Users size={14} />,
            accent: "purple" as Accent,
        },
        {
            label: "Capacity",
            value: room.details?.capacity ? String(room.details.capacity) : "-",
            icon: <LayoutDashboard size={14} />,
            accent: "gray" as Accent,
        },
        {
            label: "Price",
            value:
                typeof room.pricing?.pricePerFan === "number"
                    ? `${room.pricing.currency || "INR"} ${room.pricing.pricePerFan}`
                    : "Free",
            icon: <LayoutDashboard size={14} />,
            accent: "gray" as Accent,
        },
    ];

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            <button
                onClick={() => router.push("/admin/hostroom-management/hostroom-list")}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-5 transition"
            >
                <ArrowLeft size={18} /> Back to Host Rooms
            </button>

            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-semibold text-white">Host Room Details</h1>
                    <p className="text-sm text-gray-400 mt-0.5">View and manage the selected host room</p>
                </div>

                <Link href={`/admin/hostroom-management/add-hostroom?id=${room.id}`}>
                    <button className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm transition">
                        <Pencil size={14} /> Update Host Room
                    </button>
                </Link>
            </div>

            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 mb-6">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                    <div className="relative shrink-0">
                        {room.details?.thumbnail ? (
                            <img
                                src={room.details.thumbnail}
                                alt={title}
                                className="w-24 h-24 rounded-full object-cover border-2 border-[#30363d]"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-full bg-[#21262d] flex items-center justify-center border-2 border-[#30363d]">
                                <Eye size={36} className="text-gray-600" />
                            </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {roomType ? ROOM_TYPE_LABELS[roomType] : "Room"}
                        </span>
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h1 className="text-2xl font-bold text-white">{title}</h1>
                                <div className="flex flex-wrap items-center gap-3 mt-1">
                                    {roomType && (
                                        <span className="text-xs text-gray-400 bg-[#0d1117] px-2 py-1 rounded border border-[#30363d]">
                                            {roomType}
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-400 bg-[#0d1117] px-2 py-1 rounded border border-[#30363d] capitalize">
                                        {status}
                                    </span>
                                    <span className="text-xs text-gray-600 flex items-center gap-1">
                                        <Calendar size={11} /> Created {getTimeAgo(room.createdAt || Date.now())}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <p className="mt-3 text-sm text-gray-400 leading-relaxed max-w-3xl">{description}</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-6 pt-5 border-t border-[#21262d]">
                    {metrics.map((item) => (
                        <StatCard
                            key={item.label}
                            label={item.label}
                            value={item.value}
                            icon={item.icon}
                            accent={item.accent}
                        />
                    ))}
                </div>
            </div>

            <div className="flex gap-1 mb-5 bg-[#0d1117] p-1 rounded-lg border border-[#21262d] w-fit overflow-x-auto max-w-full">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                            activeTab === tab.key
                                ? "bg-blue-600 text-white shadow"
                                : "text-gray-400 hover:text-white hover:bg-[#161b22]"
                        }`}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {activeTab === "overview" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="lg:col-span-2 bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                        <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                            <Shield size={15} className="text-blue-400" /> Room Overview
                        </h2>
                        <div className="space-y-3">
                            <InfoRow label="Host" value={room.userId || "-"} />
                            <InfoRow label="Firebase UID" value={room.firebaseUid || "-"} />
                            <InfoRow label="Event" value={room.event?.selectedEvent?.name || "-"} />
                            <InfoRow label="Event ID" value={room.event?.selectedEvent?.id || "-"} />
                            <InfoRow label="Room Type" value={roomType ? ROOM_TYPE_LABELS[roomType] : "-"} />
                            <InfoRow label="Current Step" value={room.currentStep ? String(room.currentStep) : "-"} />
                            <InfoRow label="Language" value={room.details?.primaryLanguage || "-"} />
                            <InfoRow label="Schedule" value={room.details?.schedule || "-"} />
                            <InfoRow label="Created" value={room.createdAt ? new Date(room.createdAt).toLocaleString() : "-"} />
                            <InfoRow label="Updated" value={room.updatedAt ? new Date(room.updatedAt).toLocaleString() : "-"} />
                            <InfoRow label="Published" value={room.publishedAt ? new Date(room.publishedAt).toLocaleString() : "-"} />
                        </div>
                    </div>

                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                        <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                            <LayoutDashboard size={15} className="text-green-400" /> Quick Info
                        </h2>
                        <div className="space-y-3">
                            <InfoRow label="Capacity" value={room.details?.capacity ? String(room.details.capacity) : "-"} />
                            <InfoRow
                                label="Price"
                                value={
                                    typeof room.pricing?.pricePerFan === "number"
                                        ? `${room.pricing.currency || "INR"} ${room.pricing.pricePerFan}`
                                        : "Free"
                                }
                            />
                            <InfoRow label="Tags" value={tags.length ? `${tags.length} tag(s)` : "-"} />
                            <InfoRow label="Moderators" value={moderators.length ? `${moderators.length} person(s)` : "-"} />
                            <InfoRow label="Assets" value={String(assets.length)} />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "details" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                        <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                            <BarChart2 size={15} className="text-blue-400" /> Room Details
                        </h2>
                        <div className="space-y-3">
                            <InfoRow label="Title" value={title} />
                            <InfoRow label="Description" value={description} />
                            <InfoRow label="Status" value={status} />
                            <InfoRow label="Room Type" value={roomType ? ROOM_TYPE_LABELS[roomType] : "-"} />
                            <InfoRow label="Event Name" value={room.event?.selectedEvent?.name || "-"} />
                            <InfoRow label="Capacity" value={room.details?.capacity ? String(room.details.capacity) : "-"} />
                            <InfoRow label="Language" value={room.details?.primaryLanguage || "-"} />
                            <InfoRow label="Schedule" value={room.details?.schedule || "-"} />
                        </div>
                    </div>

                    <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                        <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                            <MapPin size={15} className="text-yellow-400" /> Tags & Moderators
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 mb-2">Tags</p>
                                {tags.length === 0 ? (
                                    <p className="text-sm text-gray-500">No tags</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        {tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="text-xs bg-[#0d1117] border border-[#30363d] text-gray-300 px-2 py-1 rounded"
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <p className="text-xs text-gray-500 mb-2">Moderators</p>
                                {moderators.length === 0 ? (
                                    <p className="text-sm text-gray-500">No moderators</p>
                                ) : (
                                    <div className="space-y-2">
                                        {moderators.map((moderator) => (
                                            <p
                                                key={moderator}
                                                className="text-sm text-gray-300 bg-[#0d1117] border border-[#30363d] px-3 py-2 rounded"
                                            >
                                                {moderator}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === "assets" && (
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                    <h2 className="text-sm font-semibold text-gray-200 mb-4 flex items-center gap-2">
                        <Play size={15} className="text-purple-400" /> Assets ({assets.length})
                    </h2>
                    {assets.length === 0 ? (
                        <p className="text-sm text-gray-500">No assets uploaded</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {assets.map((asset, idx) => (
                                <div
                                    key={`${asset.url || asset.name || "asset"}-${idx}`}
                                    className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4"
                                >
                                    <div className="h-36 bg-[#111827] border border-[#21262d] rounded-md flex items-center justify-center overflow-hidden mb-3">
                                        <ImageIcon size={28} className="text-gray-500" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm text-white truncate">{asset.name || "Untitled asset"}</p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {asset.type || "file"}
                                            {typeof asset.size === "number" ? ` • ${asset.size} bytes` : ""}
                                        </p>
                                        {asset.url ? (
                                            <a
                                                href={asset.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 mt-2"
                                            >
                                                Open <Globe size={11} />
                                            </a>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === "raw" && (
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-5">
                    <h2 className="text-sm font-semibold text-gray-200 mb-3 flex items-center gap-2">
                        <FileText size={15} className="text-gray-400" /> Full Host Room Data
                    </h2>
                    <p className="text-xs text-gray-500 mb-4">Complete document for this host room.</p>
                    <pre className="bg-[#0d1117] border border-[#30363d] rounded-lg p-4 overflow-auto text-xs text-gray-300 whitespace-pre-wrap break-words max-h-[600px]">
                        {fullDocument}
                    </pre>
                </div>
            )}
        </div>
    );
}

function getTimeAgo(timestamp: number) {
    const diff = Date.now() - timestamp;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor(diff / 60000);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${minutes}m ago`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 border-b border-[#21262d] py-2 last:border-b-0">
            <span className="text-xs text-gray-500">{label}</span>
            <span className="text-xs text-white text-right break-all">{value}</span>
        </div>
    );
}

function StatCard({
    label,
    value,
    icon,
    accent,
}: {
    label: string;
    value: string;
    icon: ReactNode;
    accent: Accent;
}) {
    const accentClasses: Record<Accent, string> = {
        blue: "text-blue-400",
        green: "text-green-400",
        yellow: "text-yellow-400",
        purple: "text-purple-400",
        gray: "text-gray-400",
    };

    return (
        <div className="bg-[#0d1117] rounded-lg border border-[#21262d] px-4 py-4 min-h-[88px] flex flex-col justify-between">
            <div className={`flex items-center gap-2 ${accentClasses[accent]}`}>{icon}</div>
            <div>
                <p className="text-lg font-semibold text-white leading-none">{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
            </div>
        </div>
    );
}
