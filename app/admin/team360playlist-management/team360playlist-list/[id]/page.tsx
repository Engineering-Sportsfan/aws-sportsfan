"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import { 
  ArrowLeft, 
  Music, 
  Video, 
  Calendar, 
  Eye, 
  ThumbsUp, 
  MessageCircle, 

  Play
} from "lucide-react";
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
    team360PostId: string;
    audioDrops: DropItem[];
    videoDrops: DropItem[];
    createdAt: number;
    updatedAt: number;
};

export default function PlaylistViewPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [playlist, setPlaylist] = useState<Playlist | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"audio" | "video">("audio");

    useEffect(() => {
        if (id) {
            fetchPlaylist();
        }
    }, [id]);

    const fetchPlaylist = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get(`/api/team360-playlist/${id}`);
            
            if (response.data.success) {
                setPlaylist(response.data.playlist);
            } else {
                setError("Playlist not found");
            }
        } catch (error) {
            console.error("Failed to fetch playlist:", error);
            setError("Failed to load playlist");
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (timestamp: number) => {
        if (!timestamp) return "N/A";
        const date = new Date(timestamp);
        return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getTimeAgo = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (minutes < 60) return `${minutes} minutes ago`;
        if (hours < 24) return `${hours} hours ago`;
        if (days < 7) return `${days} days ago`;
        return formatDate(timestamp);
    };

    const formatDuration = (duration: string) => {
        return duration || "0:00";
    };

    const formatNumber = (num: number) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };

    const getTotalStats = () => {
        if (!playlist) return { listens: 0, signals: 0, engagement: 0 };
        
        const audioListens = playlist.audioDrops?.reduce((sum, drop) => sum + drop.listens, 0) || 0;
        const videoListens = playlist.videoDrops?.reduce((sum, drop) => sum + drop.listens, 0) || 0;
        const audioSignals = playlist.audioDrops?.reduce((sum, drop) => sum + drop.signals, 0) || 0;
        const videoSignals = playlist.videoDrops?.reduce((sum, drop) => sum + drop.signals, 0) || 0;
        const audioEngagement = playlist.audioDrops?.reduce((sum, drop) => sum + drop.engagement, 0) || 0;
        const videoEngagement = playlist.videoDrops?.reduce((sum, drop) => sum + drop.engagement, 0) || 0;
        
        return {
            listens: audioListens + videoListens,
            signals: audioSignals + videoSignals,
            engagement: audioEngagement + videoEngagement
        };
    };

    const renderDropCard = (drop: DropItem, index: number, type: "audio" | "video") => {
        return (
            <div key={index} className="bg-[#0d1117] border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition">
                {/* Media Preview */}
                <div className="relative aspect-video bg-black">
                    {type === "audio" ? (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-blue-900/50">
                            <div className="text-center">
                                <Music size={48} className="text-purple-400 mx-auto mb-2" />
                                <p className="text-gray-400 text-sm">Audio Track</p>
                            </div>
                        </div>
                    ) : (
                        drop.thumbnail ? (
                            <img 
                                src={drop.thumbnail} 
                                alt={drop.title}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-900/50 to-blue-900/50">
                                <div className="text-center">
                                    <Video size={48} className="text-green-400 mx-auto mb-2" />
                                    <p className="text-gray-400 text-sm">Video Preview</p>
                                </div>
                            </div>
                        )
                    )}
                    
                    {/* Duration Badge */}
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                        {formatDuration(drop.duration)}
                    </div>
                </div>

                {/* Content */}
                <div className="p-4">
                    <h3 className="text-white font-semibold text-lg mb-2">{drop.title}</h3>
                    
                    {drop.description && (
                        <p className="text-gray-400 text-sm mb-4">{drop.description}</p>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-[#161b22] rounded p-2 text-center">
                            <Eye size={14} className="text-blue-400 mx-auto mb-1" />
                            <p className="text-white font-semibold text-sm">{formatNumber(drop.listens)}</p>
                            <p className="text-gray-500 text-xs">Listens</p>
                        </div>
                        <div className="bg-[#161b22] rounded p-2 text-center">
                            <ThumbsUp size={14} className="text-yellow-400 mx-auto mb-1" />
                            <p className="text-white font-semibold text-sm">{formatNumber(drop.signals)}</p>
                            <p className="text-gray-500 text-xs">Signals</p>
                        </div>
                        <div className="bg-[#161b22] rounded p-2 text-center">
                            <MessageCircle size={14} className="text-green-400 mx-auto mb-1" />
                            <p className="text-white font-semibold text-sm">{formatNumber(drop.engagement)}</p>
                            <p className="text-gray-500 text-xs">Engagement</p>
                        </div>
                    </div>

                    {/* Media Link */}
                    <a 
                        href={drop.mediaUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transition"
                    >
                        <Play size={16} />
                        {type === "audio" ? "Play Audio" : "Play Video"}
                    </a>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="max-w-[1440px] mx-auto p-6">
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8">
                    <div className="flex items-center justify-center">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                            <p className="text-gray-400">Loading playlist...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !playlist) {
        return (
            <div className="max-w-[1440px] mx-auto p-6">
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8">
                    <div className="text-center">
                        <p className="text-red-400 mb-4">{error || "Playlist not found"}</p>
                        <button
                            onClick={() => router.back()}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const totalStats = getTotalStats();
    const hasAudio = playlist.audioDrops && playlist.audioDrops.length > 0;
    const hasVideo = playlist.videoDrops && playlist.videoDrops.length > 0;

    return (
        <div className="max-w-[1440px] mx-auto p-6">
            {/* Header */}
            <div className="mb-6">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition"
                >
                    <ArrowLeft size={20} />
                    Back to Playlists
                </button>
                
                <div className="flex justify-between items-start flex-wrap gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Playlist Details
                        </h1>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <span className="font-mono bg-[#0d1117] px-2 py-1 rounded">
                                ID: {playlist.id}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Calendar size={14} />
                                Created {getTimeAgo(playlist.createdAt)}
                            </span>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <Link href={`/admin/team360playlist-management/add-team360playlist?id=${playlist.id}`}>
                            <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded transition">
                                Edit Playlist
                            </button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 text-sm">Total Listens</p>
                            <p className="text-2xl font-bold text-white">{formatNumber(totalStats.listens)}</p>
                        </div>
                        <Eye size={32} className="text-blue-400" />
                    </div>
                </div>
                
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 text-sm">Total Signals</p>
                            <p className="text-2xl font-bold text-white">{formatNumber(totalStats.signals)}</p>
                        </div>
                        <ThumbsUp size={32} className="text-yellow-400" />
                    </div>
                </div>
                
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 text-sm">Total Engagement</p>
                            <p className="text-2xl font-bold text-white">{formatNumber(totalStats.engagement)}</p>
                        </div>
                        <MessageCircle size={32} className="text-green-400" />
                    </div>
                </div>
            </div>

            {/* Team360 Post ID Card */}
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-4 mb-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                        <p className="text-gray-400 text-sm mb-1">Associated Team360 Post</p>
                        <p className="text-white font-mono text-lg">{playlist.team360PostId}</p>
                    </div>
                    <Link href={`/admin/team360-management/team360-list/${playlist.team360PostId}`}>
                        <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition">
                            View Post
                        </button>
                    </Link>
                </div>
            </div>

            {/* Tabs */}
            {(hasAudio && hasVideo) && (
                <div className="flex gap-2 mb-6 border-b border-gray-700">
                    <button
                        onClick={() => setActiveTab("audio")}
                        className={`px-4 py-2 transition ${
                            activeTab === "audio"
                                ? "text-blue-500 border-b-2 border-blue-500"
                                : "text-gray-400 hover:text-white"
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Music size={16} />
                            Audio Drops ({playlist.audioDrops.length})
                        </div>
                    </button>
                    <button
                        onClick={() => setActiveTab("video")}
                        className={`px-4 py-2 transition ${
                            activeTab === "video"
                                ? "text-blue-500 border-b-2 border-blue-500"
                                : "text-gray-400 hover:text-white"
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Video size={16} />
                            Video Drops ({playlist.videoDrops.length})
                        </div>
                    </button>
                </div>
            )}

            {/* Audio Drops Section */}
            {(activeTab === "audio" || !hasVideo) && hasAudio && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <Music size={15} />
                        Audio Drops ({playlist.audioDrops.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {playlist.audioDrops.map((drop, index) => renderDropCard(drop, index, "audio"))}
                    </div>
                </div>
            )}

            {/* Video Drops Section */}
            {(activeTab === "video" || !hasAudio) && hasVideo && (
                <div className="mb-8">
                    <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                        <Video size={15} />
                        Video Drops ({playlist.videoDrops.length})
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {playlist.videoDrops.map((drop, index) => renderDropCard(drop, index, "video"))}
                    </div>
                </div>
            )}

            {/* No Content Message */}
            {!hasAudio && !hasVideo && (
                <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-8 text-center">
                    <p className="text-gray-400">No audio or video drops found in this playlist</p>
                </div>
            )}

            {/* Metadata Section */}
            {/* <div className="mt-8 pt-6 border-t border-gray-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-gray-500">Created At:</span>
                        <p className="text-gray-300">{formatDate(playlist.createdAt)}</p>
                    </div>
                    <div>
                        <span className="text-gray-500">Last Updated:</span>
                        <p className="text-gray-300">{formatDate(playlist.updatedAt)}</p>
                    </div>
                </div>
            </div> */}
        </div>
    );
}