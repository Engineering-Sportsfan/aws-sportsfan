// app/admin/watchalong-management/watchalong-view/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import axios from "axios";
import { Room } from "@/context/WatchAlongContext";

export default function WatchAlongViewPage() {
    const params = useParams();
    const router = useRouter();
    const roomId = params?.id as string;
    const [room, setRoom] = useState<Room | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (roomId) {
            axios.get(`/api/watch-along/${roomId}`).then(res => {
                if (res.data.success) {
                    setRoom(res.data.room);
                }
                setLoading(false);
            }).catch(() => setLoading(false));
        }
    }, [roomId]);

    if (loading) return <div className="p-6 text-white">Loading...</div>;
    if (!room) return <div className="p-6 text-white">Room not found</div>;

    return (
        <div className="max-w-4xl mx-auto p-6">
            <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6">
                <ArrowLeft size={20} /> Back
            </button>
            
            <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
                <h1 className="text-2xl font-bold text-white mb-6">{room.name}</h1>
                
                {/* Show all room fields here */}
                <div className="space-y-4">
                    <div><label className="text-gray-400 w-32 inline-block">Role:</label> {room.role}</div>
                    <div><label className="text-gray-400 w-32 inline-block">Badge:</label> {room.badge}</div>
                    <div><label className="text-gray-400 w-32 inline-block">Status:</label> {room.isLive ? "LIVE" : "RECORDED"}</div>
                    <div><label className="text-gray-400 w-32 inline-block">Match ID:</label> {room.liveMatchId}</div>
                    <div><label className="text-gray-400 w-32 inline-block">Watching:</label> {room.watching}</div>
                    <div><label className="text-gray-400 w-32 inline-block">Engagement:</label> {room.engagement}%</div>
                    <div><label className="text-gray-400 w-32 inline-block">Active:</label> {room.active}</div>
                    {room.displayPicture && (
                        <div><label className="text-gray-400 w-32 inline-block">Avatar:</label> <img src={room.displayPicture} className="w-16 h-16 rounded-full mt-2" /></div>
                    )}
                </div>
            </div>
        </div>
    );
}