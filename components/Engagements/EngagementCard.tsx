"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Heart,
    Share2,
    MessageSquare,
    CheckCircle2,
    XCircle,
    Flame,
    Zap,
    Trophy,
    Users,
    Clock,
    Sparkles,
    Coins,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import axios from "axios";
import type { EngagementItem } from "@/types/engagements";
import { useUserProfile } from "@/context/UserProfileContext";
import EngagementCommentsThread from "./EngagementCommentsThread";

export interface EngagementCardProps {
    item: EngagementItem;
    onInteraction?: (data?: any) => void;
    className?: string;
    compact?: boolean;
    variant?: "post" | "card";
}

function timeAgo(ts?: number | string): string {
    if (!ts) return "now";
    const date = typeof ts === "number" ? ts : new Date(ts).getTime();
    if (isNaN(date)) return "now";
    const diff = Math.max(0, Date.now() - date);
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
}

export function useRunningCountdown(
    timerMinutes?: number,
    createdAt?: number | string,
    expiresAt?: number | null
) {
    const [timeLeft, setTimeLeft] = useState<string>("00:00");

    useEffect(() => {
        const calculate = () => {
            const now = Date.now();
            let remainingMs = 0;

            if (expiresAt && Number(expiresAt) > 0) {
                const exp = Number(expiresAt) > 1e11 ? Number(expiresAt) : Number(expiresAt) * 1000;
                remainingMs = Math.max(0, exp - now);
            } else if (createdAt) {
                const start = typeof createdAt === "number" ? createdAt : new Date(createdAt).getTime();
                const durationMs = (timerMinutes || 4) * 60 * 1000;
                const end = start + durationMs;
                remainingMs = Math.max(0, end - now);
            } else {
                remainingMs = (timerMinutes || 4) * 60 * 1000;
            }

            if (remainingMs <= 0) {
                setTimeLeft("Expired");
                return;
            }

            const totalSec = Math.floor(remainingMs / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            setTimeLeft(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
        };

        calculate();
        const interval = setInterval(calculate, 1000);
        return () => clearInterval(interval);
    }, [timerMinutes, createdAt, expiresAt]);

    return timeLeft;
}

export default function EngagementCard({
    item,
    onInteraction,
    className = "",
    compact = false,
    variant = "post",
}: EngagementCardProps) {
    const { userProfile } = useUserProfile();
    const currentUserId = userProfile?.actualUserId || userProfile?.email || "fan_guest";
    const currentUserName = userProfile?.username || userProfile?.name || "Fan";
    const currentUserAvatar = userProfile?.avatarUrl || userProfile?.avatar || "";

    // ── Local State & Storage Keys ──
    const voteKey = `sf_vote_${item.id}`;
    const likeKey = `sf_like_${item.id}`;

    const [userVoted, setUserVoted] = useState<boolean>(() => {
        if (item.userVoted) return true;
        if (typeof window !== "undefined") {
            try {
                return Boolean(localStorage.getItem(voteKey));
            } catch {
                return false;
            }
        }
        return false;
    });

    const [selectedOptionId, setSelectedOptionId] = useState<string | null>(() => {
        if (item.userVote) return item.userVote;
        if (typeof window !== "undefined") {
            try {
                return localStorage.getItem(voteKey);
            } catch {
                return null;
            }
        }
        return null;
    });

    const [isVoting, setIsVoting] = useState(false);

    // Likes state with localStorage persistence
    const [likes, setLikes] = useState<number>(Number(item.likes) || 0);
    const [isLiked, setIsLiked] = useState<boolean>(() => {
        if (item.userLiked !== undefined) return Boolean(item.userLiked);
        if (typeof window !== "undefined") {
            try {
                return localStorage.getItem(likeKey) === "true";
            } catch {
                return false;
            }
        }
        return false;
    });

    // Shares state
    const [shares, setShares] = useState<number>(Number(item.shares) || 0);
    const [shareCopied, setShareCopied] = useState(false);

    // Comments count state
    const [showComments, setShowComments] = useState(false);
    const [commentsCount, setCommentsCount] = useState<number>(() => {
        return Number(item.commentsCount ?? item.memeData?.commentsCount ?? 0);
    });

    // Total Engaged (Participation count) state
    const [totalEngaged, setTotalEngaged] = useState<number>(() => {
        return Number(item.totalEngaged) || 0;
    });

    // Dynamic Votes calculation cache
    const [liveVoteData, setLiveVoteData] = useState<any>(null);

    // Live Running Timer (ticks every second)
    const runningTimer = useRunningCountdown(item.timerMinutes, item.createdAt, item.expiresAt);

    // Sync with item prop changes
    useEffect(() => {
        if (item.likes !== undefined) setLikes(Number(item.likes) || 0);
        if (item.shares !== undefined) setShares(Number(item.shares) || 0);
        if (item.totalEngaged !== undefined) setTotalEngaged(Number(item.totalEngaged) || 0);
        if (item.commentsCount !== undefined) setCommentsCount(Number(item.commentsCount) || 0);
        if (item.userLiked !== undefined) setIsLiked(Boolean(item.userLiked));
        if (item.userVote) {
            setSelectedOptionId(item.userVote);
            setUserVoted(true);
        }
    }, [item.likes, item.shares, item.totalEngaged, item.commentsCount, item.userLiked, item.userVote]);

    // ── Type Theme Info ──
    const theme = useMemo(() => {
        switch (item.type) {
            case "prediction":
                return {
                    label: "PREDICTION",
                    icon: "🎯",
                    badgeBg: "bg-amber-500/20 text-amber-400 border border-amber-500/40",
                    accent: "#fbbf24",
                };
            case "debate":
            case "poll":
            case "express":
                return {
                    label: item.type === "debate" ? "DEBATE" : "POLL",
                    icon: "📊",
                    badgeBg: "bg-blue-500/20 text-blue-400 border border-blue-500/40",
                    accent: "#60a5fa",
                };
            case "quiz":
            case "question":
                return {
                    label: "QUIZ",
                    icon: "🧠",
                    badgeBg: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
                    accent: "#22c55e",
                };
            case "fan_battle":
                return {
                    label: "BATTLE",
                    icon: "⚔️",
                    badgeBg: "bg-rose-500/20 text-rose-400 border border-rose-500/40",
                    accent: "#e91e8c",
                };
            default:
                return {
                    label: "MATCH MOMENT",
                    icon: "🔥",
                    badgeBg: "bg-orange-500/20 text-orange-400 border border-orange-500/40",
                    accent: "#ff6b35",
                };
        }
    }, [item.type]);

    // ── Submit Vote / Participation ──
    const handleVote = async (optionId: string) => {
        if (userVoted || isVoting) return;

        setIsVoting(true);
        setSelectedOptionId(optionId);
        setUserVoted(true);
        setTotalEngaged(prev => prev + 1);

        try {
            localStorage.setItem(voteKey, optionId);
        } catch {
            // ignore
        }

        try {
            const res = await axios.post(
                `/api/engagements/${encodeURIComponent(item.id)}/vote`,
                {
                    selectedOptionId: optionId,
                    userId: currentUserId,
                    userName: currentUserName,
                    userAvatar: currentUserAvatar,
                    matchId: item.matchId,
                },
                { timeout: 8000 }
            );

            if (res.data) {
                setLiveVoteData(res.data);
                if (res.data.totalEngaged !== undefined) {
                    setTotalEngaged(Number(res.data.totalEngaged) || 0);
                }
            }

            // Award points trigger
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("sf360:points-updated", { detail: { points: 2 } }));
            }

            onInteraction?.({
                userVoted: true,
                userVote: optionId,
                totalEngaged: (totalEngaged || 0) + 1,
                ...(res.data || {}),
            });
        } catch (err) {
            console.warn("Notice submitting vote:", err);
            onInteraction?.({
                userVoted: true,
                userVote: optionId,
                totalEngaged: (totalEngaged || 0) + 1,
            });
        } finally {
            setIsVoting(false);
        }
    };

    // ── Toggle Like ──
    const handleToggleLike = async () => {
        const nextLiked = !isLiked;
        const nextLikes = Math.max(0, likes + (nextLiked ? 1 : -1));

        setIsLiked(nextLiked);
        setLikes(nextLikes);
        if (nextLiked) {
            setTotalEngaged(prev => prev + 1);
        }

        try {
            localStorage.setItem(likeKey, nextLiked ? "true" : "false");
        } catch {}

        onInteraction?.({
            likes: nextLikes,
            userLiked: nextLiked,
            totalEngaged: nextLiked ? totalEngaged + 1 : totalEngaged,
        });

        try {
            const res = await axios.post(
                `/api/engagements/${encodeURIComponent(item.id)}/like`,
                {
                    userId: currentUserId,
                    matchId: item.matchId,
                },
                { timeout: 8000 }
            );
            if (res.data) {
                if (res.data.likes !== undefined) setLikes(Number(res.data.likes) || 0);
                if (res.data.totalEngaged !== undefined) setTotalEngaged(Number(res.data.totalEngaged) || 0);
            }
        } catch (err) {
            console.warn("Notice toggling engagement like:", err);
        }
    };

    // ── Share Engagement ──
    const handleShare = async () => {
        const nextShares = shares + 1;
        setShares(nextShares);
        setTotalEngaged(prev => prev + 1);
        onInteraction?.({ shares: nextShares, totalEngaged: totalEngaged + 1 });

        const shareUrl =
            typeof window !== "undefined"
                ? `${window.location.origin}${window.location.pathname}?engagement=${item.id}`
                : "";
        const shareTitle = item.title || "Check out this live match moment on SportsFan360!";

        if (typeof navigator !== "undefined" && navigator.share) {
            try {
                await navigator.share({
                    title: shareTitle,
                    text: item.subtitle || shareTitle,
                    url: shareUrl,
                });
            } catch {
                // Ignore cancel
            }
        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(shareUrl);
                setShareCopied(true);
                setTimeout(() => setShareCopied(false), 2200);
            } catch {
                // Ignore clipboard errors
            }
        }

        try {
            const res = await axios.post(
                `/api/engagements/${encodeURIComponent(item.id)}/share`,
                { userId: currentUserId, matchId: item.matchId },
                { timeout: 8000 }
            );
            if (res.data) {
                if (res.data.shares !== undefined) setShares(Number(res.data.shares) || 0);
                if (res.data.totalEngaged !== undefined) setTotalEngaged(Number(res.data.totalEngaged) || 0);
            }
        } catch (err) {
            console.warn("Notice logging share:", err);
        }
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER: Prediction Body
    // ─────────────────────────────────────────────────────────────
    const renderPrediction = () => {
        const pred = item.predictionData;
        const leftChoice = pred?.leftChoice || { id: "left", text: "Team A", votes: 0, code: "A" };
        const rightChoice = pred?.rightChoice || { id: "right", text: "Team B", votes: 0, code: "B" };

        const rawLeftVotes = Number(liveVoteData?.leftVotes ?? pred?.leftChoice?.votes ?? 0);
        const rawRightVotes = Number(liveVoteData?.rightVotes ?? pred?.rightChoice?.votes ?? 0);

        // Optimistically add user's vote if liveVoteData is not yet returned
        const leftVotes = rawLeftVotes + (!liveVoteData && selectedOptionId === "left" ? 1 : 0);
        const rightVotes = rawRightVotes + (!liveVoteData && selectedOptionId === "right" ? 1 : 0);

        const total = leftVotes + rightVotes;
        const leftPct =
            liveVoteData?.leftPercentage !== undefined
                ? Math.round(liveVoteData.leftPercentage)
                : (total > 0 ? Math.round((leftVotes / total) * 100) : 50);
        const rightPct = 100 - leftPct;

        return (
            <div className="flex flex-col gap-1.5 mt-1">
                {!userVoted ? (
                    <div className="grid grid-cols-2 gap-2 mt-0.5">
                        <button
                            type="button"
                            disabled={isVoting}
                            onClick={() => handleVote("left")}
                            className="p-2.5 rounded-lg bg-white/5 hover:bg-amber-500/15 border border-white/10 hover:border-amber-400/50 transition-all text-left group"
                        >
                            <span className="block text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                                {leftChoice.text}
                            </span>
                            <span className="text-[9px] text-white/50 block mt-0.5">Predict This</span>
                        </button>
                        <button
                            type="button"
                            disabled={isVoting}
                            onClick={() => handleVote("right")}
                            className="p-2.5 rounded-lg bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-400/50 transition-all text-left group"
                        >
                            <span className="block text-xs font-bold text-white group-hover:text-rose-400 transition-colors">
                                {rightChoice.text}
                            </span>
                            <span className="text-[9px] text-white/50 block mt-0.5">Predict This</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 mt-0.5">
                        <div className="flex items-center justify-between text-xs font-bold">
                            <span className={selectedOptionId === "left" ? "text-amber-400 flex items-center gap-1" : "text-white/80"}>
                                {selectedOptionId === "left" && <CheckCircle2 size={12} />} {leftChoice.text} ({leftPct}%)
                            </span>
                            <span className={selectedOptionId === "right" ? "text-[#e91e8c] flex items-center gap-1" : "text-white/80"}>
                                {rightChoice.text} ({rightPct}%) {selectedOptionId === "right" && <CheckCircle2 size={12} />}
                            </span>
                        </div>
                        {/* Progress Bar */}
                        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden flex">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${leftPct}%` }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
                            />
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${rightPct}%` }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-[#ff6b35] to-[#e91e8c]"
                            />
                        </div>
                        <div className="flex justify-between items-center text-[9px] text-white/50">
                            <span>Your pick: <strong className="text-white">{selectedOptionId === "left" ? leftChoice.text : rightChoice.text}</strong></span>
                            <span>{total} total predictions</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER: Poll / Debate / Express Body
    // ─────────────────────────────────────────────────────────────
    const renderPoll = () => {
        const rawOptions =
            liveVoteData?.options ||
            item.pollData?.options ||
            item.debateData?.options ||
            item.expressData?.options ||
            item.questionData?.options ||
            item.options ||
            [
                { id: "opt_1", text: "Option A", votes: 0 },
                { id: "opt_2", text: "Option B", votes: 0 },
            ];

        // Optimistically calculate votes including user's current pick
        const displayOptions = rawOptions.map((opt: any) => {
            let votes = Number(opt.votes || 0);
            if (!liveVoteData && selectedOptionId && (opt.id === selectedOptionId || opt.text === selectedOptionId)) {
                votes += 1;
            }
            return { ...opt, votes };
        });

        const totalVotes = displayOptions.reduce((sum: number, o: any) => sum + (Number(o.votes) || 0), 0);

        return (
            <div className="flex flex-col gap-1.5 mt-1">
                <div className="flex flex-col gap-1.5">
                    {displayOptions.map((opt: any) => {
                        const optVotes = Number(opt.votes) || 0;
                        const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                        const isChosen = selectedOptionId === opt.id || selectedOptionId === opt.text;

                        if (!userVoted) {
                            return (
                                <button
                                    key={opt.id || opt.text}
                                    type="button"
                                    disabled={isVoting}
                                    onClick={() => handleVote(opt.id || opt.text)}
                                    className="w-full px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 transition-all text-left flex items-center justify-between group"
                                >
                                    <span className="text-xs text-white group-hover:text-blue-400 font-medium transition-colors">
                                        {opt.text || opt.label}
                                    </span>
                                    <span className="text-[9px] text-white/40 group-hover:text-white/70">Vote</span>
                                </button>
                            );
                        }

                        return (
                            <div
                                key={opt.id || opt.text}
                                className={`relative w-full rounded-lg overflow-hidden p-2 border transition-all ${
                                    isChosen ? "border-blue-400/60 bg-blue-500/10" : "border-white/5 bg-white/5"
                                }`}
                            >
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                    className={`absolute inset-y-0 left-0 ${
                                        isChosen ? "bg-blue-500/25" : "bg-white/10"
                                    }`}
                                />
                                <div className="relative flex items-center justify-between text-xs">
                                    <span className={`font-medium flex items-center gap-1.5 ${isChosen ? "text-blue-300 font-bold" : "text-white"}`}>
                                        {isChosen && <CheckCircle2 size={12} className="text-blue-400 shrink-0" />}
                                        {opt.text || opt.label}
                                    </span>
                                    <span className="text-[11px] font-bold text-white/80 shrink-0 ml-2">{pct}%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {userVoted && (
                    <div className="text-[9px] text-white/40 text-right mt-0.5">
                        {totalVotes} total votes
                    </div>
                )}
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER: Quiz / Trivia Body
    // ─────────────────────────────────────────────────────────────
    const renderQuiz = () => {
        const quiz = item.quizData;
        const options = quiz?.options || [
            { id: "A", text: "Answer Option A" },
            { id: "B", text: "Answer Option B" },
            { id: "C", text: "Answer Option C" },
        ];
        const correctId = quiz?.correctOptionId || "A";

        return (
            <div className="flex flex-col gap-1.5 mt-1">
                {quiz?.pointsReward && (
                    <div className="text-[9px] font-bold text-emerald-400 mb-0.5">
                        ⭐ +{quiz.pointsReward} SXPs Reward
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {options.map((opt: any) => {
                        const isChosen = selectedOptionId === opt.id;
                        const isCorrectAnswer = opt.id === correctId;

                        let btnStyle = "bg-white/5 border-white/10 text-white hover:bg-white/10";
                        if (userVoted) {
                            if (isCorrectAnswer) {
                                btnStyle = "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-bold";
                            } else if (isChosen) {
                                btnStyle = "bg-rose-500/20 border-rose-500/60 text-rose-300 font-bold";
                            } else {
                                btnStyle = "bg-white/5 border-white/5 text-white/40";
                            }
                        }

                        return (
                            <button
                                key={opt.id}
                                type="button"
                                disabled={userVoted || isVoting}
                                onClick={() => handleVote(opt.id)}
                                className={`p-2 rounded-lg border text-left text-xs transition-all flex items-center justify-between ${btnStyle}`}
                            >
                                <span>{opt.text}</span>
                                {userVoted && isCorrectAnswer && <CheckCircle2 size={13} className="text-emerald-400" />}
                                {userVoted && isChosen && !isCorrectAnswer && <XCircle size={13} className="text-rose-400" />}
                            </button>
                        );
                    })}
                </div>

                {userVoted && quiz?.explanation && (
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/70 leading-relaxed mt-1">
                        <strong className="text-emerald-400">Explanation: </strong>
                        {quiz.explanation}
                    </div>
                )}
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER: Fan Battle Body
    // ─────────────────────────────────────────────────────────────
    const renderFanBattle = () => {
        const battle = item.fanBattleData;
        const left = battle?.leftCompetitor || { code: "P1", name: "Player 1", stat: "Form 8.4", votes: 0, imageUrl: "" };
        const right = battle?.rightCompetitor || { code: "P2", name: "Player 2", stat: "Form 7.9", votes: 0, imageUrl: "" };

        const rawLeftVotes = Number(liveVoteData?.leftVotes ?? battle?.leftCompetitor?.votes ?? 0);
        const rawRightVotes = Number(liveVoteData?.rightVotes ?? battle?.rightCompetitor?.votes ?? 0);

        const leftVotes = rawLeftVotes + (!liveVoteData && selectedOptionId === "left" ? 1 : 0);
        const rightVotes = rawRightVotes + (!liveVoteData && selectedOptionId === "right" ? 1 : 0);

        const total = leftVotes + rightVotes;
        const leftPct =
            liveVoteData?.leftPercentage !== undefined
                ? Math.round(liveVoteData.leftPercentage)
                : (total > 0 ? Math.round((leftVotes / total) * 100) : 50);
        const rightPct = 100 - leftPct;

        return (
            <div className="flex flex-col gap-2 mt-1">
                <div className="grid grid-cols-2 gap-2 relative">
                    {/* Left Competitor */}
                    <div className={`p-2.5 rounded-lg border text-center transition-all ${
                        selectedOptionId === "left" ? "bg-rose-500/15 border-rose-500/60" : "bg-white/5 border-white/10"
                    }`}>
                        <div className="w-10 h-10 mx-auto rounded-full overflow-hidden bg-white/10 mb-1 border border-white/20">
                            {left.imageUrl ? (
                                <img src={left.imageUrl} alt={left.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center font-black text-rose-400 bg-rose-500/10 text-xs">
                                    {left.name.slice(0, 2).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <h4 className="text-[11px] font-bold text-white truncate">{left.name}</h4>
                        <p className="text-[9px] text-white/50">{left.stat}</p>

                        {!userVoted ? (
                            <button
                                type="button"
                                disabled={isVoting}
                                onClick={() => handleVote("left")}
                                className="w-full mt-1.5 py-1 px-2 rounded bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-bold text-[10px] transition-colors"
                            >
                                Back {left.name.split(" ")[0]}
                            </button>
                        ) : (
                            <span className="block mt-1 text-[11px] font-black text-rose-400">{leftPct}%</span>
                        )}
                    </div>

                    {/* VS Badge */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 flex items-center justify-center text-[8px] font-black text-white shadow-lg pointer-events-none z-10">
                        VS
                    </div>

                    {/* Right Competitor */}
                    <div className={`p-2.5 rounded-lg border text-center transition-all ${
                        selectedOptionId === "right" ? "bg-amber-500/15 border-amber-500/60" : "bg-white/5 border-white/10"
                    }`}>
                        <div className="w-10 h-10 mx-auto rounded-full overflow-hidden bg-white/10 mb-1 border border-white/20">
                            {right.imageUrl ? (
                                <img src={right.imageUrl} alt={right.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center font-black text-amber-400 bg-amber-500/10 text-xs">
                                    {right.name.slice(0, 2).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <h4 className="text-[11px] font-bold text-white truncate">{right.name}</h4>
                        <p className="text-[9px] text-white/50">{right.stat}</p>

                        {!userVoted ? (
                            <button
                                type="button"
                                disabled={isVoting}
                                onClick={() => handleVote("right")}
                                className="w-full mt-1.5 py-1 px-2 rounded bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white font-bold text-xs transition-colors"
                            >
                                Back {right.name.split(" ")[0]}
                            </button>
                        ) : (
                            <span className="block mt-1 text-[11px] font-black text-amber-400">{rightPct}%</span>
                        )}
                    </div>
                </div>

                {userVoted && (
                    <div className="flex flex-col gap-1">
                        <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden flex">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${leftPct}%` }}
                                transition={{ duration: 0.5 }}
                                className="h-full bg-rose-500"
                            />
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${rightPct}%` }}
                                transition={{ duration: 0.5 }}
                                className="h-full bg-amber-400"
                            />
                        </div>
                        <div className="text-[9px] text-white/40 text-center">{total} votes</div>
                    </div>
                )}
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────
    // RENDER: Generic Meme / Drop Body
    // ─────────────────────────────────────────────────────────────
    const renderMeme = () => {
        const meme = item.memeData;
        return (
            <div className="flex flex-col gap-1.5 mt-1">
                {meme?.imageUrl && (
                    <div className="rounded-lg overflow-hidden max-h-52 bg-black/40 border border-white/10">
                        <img src={meme.imageUrl} alt={item.title} className="w-full h-full object-contain" />
                    </div>
                )}
                {meme?.caption && (
                    <p className="text-xs text-white/80 leading-relaxed">{meme.caption}</p>
                )}
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────
    // VARIANT: "post" (Matches regular room discussion posts seamlessly)
    // ─────────────────────────────────────────────────────────────
    if (variant === "post") {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`w-full ${className}`}
                style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
                {/* ── Post Header ── */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, minWidth: 0 }}>
                    <div style={{ flexShrink: 0 }}>
                        <img
                            src={item.creatorAvatar || "/images/sportsfan360logo.png"}
                            alt={item.creatorName || "SportsFan360"}
                            className="w-6 h-6 rounded-full object-contain border border-white/10 bg-black/40"
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/images/sportsfan360logo.png";
                            }}
                        />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 10, color: "#fff", whiteSpace: "nowrap" }}>
                            {item.creatorName || "SportsFan360"}
                        </span>
                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.48)", whiteSpace: "nowrap" }}>
                            {timeAgo(item.createdAt)}
                        </span>
                        <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.2 rounded ${theme.badgeBg}`}>
                            {theme.label}
                        </span>

                        {/* Running Timer */}
                        <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 flex items-center gap-1 ml-auto">
                            <Clock size={10} className="text-amber-400" />
                            <span>{runningTimer} remaining</span>
                        </span>
                    </div>
                </div>

                {/* ── Post Content / Title ── */}
                <p className="leading-snug text-white font-medium my-1" style={{ fontSize: 10 }}>
                    {item.title}
                </p>
                {item.subtitle && item.subtitle !== item.title && (
                    <p className="text-[10px] text-white/60 mb-2 leading-relaxed">
                        {item.subtitle}
                    </p>
                )}

                {/* ── Interactive Options ── */}
                <div className="my-1.5">
                    {item.type === "prediction" && renderPrediction()}
                    {(item.type === "debate" || item.type === "poll" || item.type === "express") && renderPoll()}
                    {(item.type === "quiz" || item.type === "question") && renderQuiz()}
                    {item.type === "fan_battle" && renderFanBattle()}
                    {item.type === "meme" && renderMeme()}
                </div>

                {/* ── Action Bar (Comments, Likes, Shares, Fans Engaged) ── */}
                <div style={{ display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 5, alignItems: "center" }}>
                    {/* Live Like */}
                    <button
                        type="button"
                        onClick={handleToggleLike}
                        className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                            isLiked ? "text-[#e91e8c]" : "text-[#9494ad] hover:text-white"
                        }`}
                        title="Like this moment"
                    >
                        <Heart size={12} fill={isLiked ? "currentColor" : "none"} />
                        <span style={{ fontSize: 10 }}>{likes}</span>
                    </button>

                    {/* Comments Toggle Button */}
                    <button
                        type="button"
                        onClick={() => setShowComments(prev => !prev)}
                        className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                            showComments ? "text-[#e91e8c]" : "text-[#9494ad] hover:text-white"
                        }`}
                        title="View comments"
                    >
                        <MessageSquare size={12} />
                        <span style={{ fontSize: 10 }}>Comments ({commentsCount})</span>
                        {showComments ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {/* Native Share */}
                    <button
                        type="button"
                        onClick={handleShare}
                        className="flex items-center gap-1 text-[11px] text-[#9494ad] hover:text-white transition-colors relative"
                        title="Share"
                    >
                        <Share2 size={12} />
                        <span style={{ fontSize: 10 }}>{shares}</span>
                        {shareCopied && (
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 border border-white/20 text-[9px] text-white whitespace-nowrap shadow-md pointer-events-none">
                                Copied!
                            </span>
                        )}
                    </button>

                    {/* Fans Engaged indicator */}
                    <div className="ml-auto flex items-center gap-1 text-[9px] text-white/40">
                        <Users size={10} />
                        <span>{totalEngaged} fans</span>
                    </div>
                </div>

                {/* ── Inline Comments Thread ── */}
                <AnimatePresence>
                    {showComments && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <EngagementCommentsThread
                                engagementId={item.id}
                                accentColor={theme.accent}
                                onCommentCountChange={(cnt: number) => {
                                    setCommentsCount(cnt);
                                    setTotalEngaged(prev => Math.max(prev, cnt));
                                    onInteraction?.({ commentsCount: cnt });
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        );
    }

    // ─────────────────────────────────────────────────────────────
    // VARIANT: "card" (Used in top Hero Loop Banner)
    // ─────────────────────────────────────────────────────────────
    return (
        <div
            className={`rounded-2xl bg-gradient-to-b from-[#181822]/95 to-[#101016]/98 border border-white/10 p-3 shadow-xl hover:border-white/20 transition-all ${className}`}
        >
            {/* ── CARD HEADER ── */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${theme.badgeBg}`}>
                        {theme.icon} {theme.label}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 flex items-center gap-1">
                        <Clock size={10} className="text-amber-400" />
                        <span>{runningTimer} remaining</span>
                    </span>
                </div>
                {item.sport && (
                    <span className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">
                        {item.sport}
                    </span>
                )}
            </div>

            {/* ── TITLE ── */}
            <h3 className="text-sm font-bold text-white mt-1.5 leading-snug">
                {item.title}
            </h3>
            {item.subtitle && item.subtitle !== item.title && (
                <p className="text-xs text-white/60 mt-0.5 line-clamp-2">{item.subtitle}</p>
            )}

            {/* ── INTERACTIVE BODY ── */}
            {item.type === "prediction" && renderPrediction()}
            {(item.type === "debate" || item.type === "poll" || item.type === "express") && renderPoll()}
            {(item.type === "quiz" || item.type === "question") && renderQuiz()}
            {item.type === "fan_battle" && renderFanBattle()}
            {item.type === "meme" && renderMeme()}

            {/* ── CARD FOOTER ACTIONS ── */}
            <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-white/5 text-xs text-white/60">
                <div className="flex items-center gap-3">
                    {/* Live Like Button */}
                    <button
                        type="button"
                        onClick={handleToggleLike}
                        className={`flex items-center gap-1 transition-all ${
                            isLiked ? "text-[#e91e8c] font-bold scale-105" : "hover:text-white"
                        }`}
                        title="Like this moment"
                    >
                        <Heart size={13} fill={isLiked ? "currentColor" : "none"} />
                        <span>{likes}</span>
                    </button>

                    {/* Comments Button */}
                    <button
                        type="button"
                        onClick={() => setShowComments(prev => !prev)}
                        className={`flex items-center gap-1 transition-colors ${
                            showComments ? "text-[#e91e8c] font-bold" : "hover:text-white"
                        }`}
                        title="View comments"
                    >
                        <MessageSquare size={13} />
                        <span>Comments ({commentsCount})</span>
                        {showComments ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {/* Native Share Button */}
                    <button
                        type="button"
                        onClick={handleShare}
                        className="flex items-center gap-1 hover:text-white transition-colors relative"
                        title="Share with friends"
                    >
                        <Share2 size={13} />
                        <span>{shares}</span>
                        {shareCopied && (
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 border border-white/20 text-[9px] text-white whitespace-nowrap shadow-md pointer-events-none">
                                Copied!
                            </span>
                        )}
                    </button>
                </div>

                {/* Total Engaged indicator */}
                <div className="flex items-center gap-1 text-[10px] text-white/40">
                    <Users size={11} />
                    <span>{totalEngaged} fans</span>
                </div>
            </div>

            {/* ── INLINE COMMENTS SECTION ── */}
            <AnimatePresence>
                {showComments && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <EngagementCommentsThread
                            engagementId={item.id}
                            accentColor={theme.accent}
                            onCommentCountChange={(cnt: number) => {
                                setCommentsCount(cnt);
                                setTotalEngaged(prev => Math.max(prev, cnt));
                                onInteraction?.({ commentsCount: cnt });
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
