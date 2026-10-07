"use client";

import React, { useState, useEffect } from "react";
import { EngagementItem, MemeRatingId, MemeRatingChoice } from "@/types/engagements";
import {
  Flame,
  Share2,
  Heart,
  MessageCircle,
  MoreVertical,
  CheckCircle2,
  Info,
  Sparkles,
  BarChart3,
  Loader2,
  Swords,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  item: EngagementItem;
  onVoteSuccess?: (data: any) => void;
  onSkip?: () => void;
}

const RATING_CONFIG: Record<
  MemeRatingId,
  { label: string; icon: string; bg: string; border: string; activeGlow: string; textColor: string }
> = {
  mid: {
    label: "Mild",
    icon: "🔥",
    bg: "rgba(110, 118, 129, 0.15)",
    border: "rgba(110, 118, 129, 0.4)",
    activeGlow: "rgba(110, 118, 129, 0.6)",
    textColor: "#8b949e",
  },
  funny: {
    label: "Funny",
    icon: "🔥",
    bg: "rgba(236, 72, 153, 0.15)",
    border: "rgba(236, 72, 153, 0.4)",
    activeGlow: "rgba(236, 72, 153, 0.6)",
    textColor: "#f472b6",
  },
  hot: {
    label: "Hot",
    icon: "🔥",
    bg: "rgba(249, 115, 22, 0.15)",
    border: "rgba(249, 115, 22, 0.4)",
    activeGlow: "rgba(249, 115, 22, 0.6)",
    textColor: "#fb923c",
  },
  fire: {
    label: "Fire",
    icon: "🔥🔥",
    bg: "rgba(239, 68, 68, 0.18)",
    border: "rgba(239, 68, 68, 0.45)",
    activeGlow: "rgba(239, 68, 68, 0.7)",
    textColor: "#f87171",
  },
  nuclear: {
    label: "Nuclear",
    icon: "☢️🔥",
    bg: "rgba(217, 70, 239, 0.2)",
    border: "rgba(217, 70, 239, 0.5)",
    activeGlow: "rgba(217, 70, 239, 0.8)",
    textColor: "#e879f9",
  },
};

export default function MemeCard({ item, onVoteSuccess, onSkip }: Props) {
  const meme = item.memeData;
  const isDualMeme =
    meme?.memeMode === "dual" ||
    Boolean(meme?.memeA && meme?.memeB) ||
    (Array.isArray(meme?.options) && meme?.options.length >= 2);

  const [selectedRating, setSelectedRating] = useState<MemeRatingId>("hot");
  const [hasVoted, setHasVoted] = useState<boolean>(Boolean(item.userVoted));
  const [userVoteOption, setUserVoteOption] = useState<string | null>(item.userVote || null);
  const [loading, setLoading] = useState(false);
  const [pointsToast, setPointsToast] = useState(false);

  // Dual meme votes state
  const initialVotesA =
    Number(meme?.options?.[0]?.votes) || Number(meme?.memeA?.votes) || 0;
  const initialVotesB =
    Number(meme?.options?.[1]?.votes) || Number(meme?.memeB?.votes) || 0;
  const [dualVotesA, setDualVotesA] = useState<number>(initialVotesA);
  const [dualVotesB, setDualVotesB] = useState<number>(initialVotesB);

  // Single meme ratings map with default zero-values
  const [ratings, setRatings] = useState<Record<string, number>>({
    mid: Number(meme?.ratings?.mid) || 0,
    funny: Number(meme?.ratings?.funny) || 0,
    hot: Number(meme?.ratings?.hot) || 0,
    fire: Number(meme?.ratings?.fire) || 0,
    nuclear: Number(meme?.ratings?.nuclear) || 0,
  });

  const [totalVotes, setTotalVotes] = useState<number>(
    Number(meme?.totalVotes) ||
      (isDualMeme
        ? initialVotesA + initialVotesB
        : (Number(meme?.ratings?.mid) || 0) +
          (Number(meme?.ratings?.funny) || 0) +
          (Number(meme?.ratings?.hot) || 0) +
          (Number(meme?.ratings?.fire) || 0) +
          (Number(meme?.ratings?.nuclear) || 0))
  );

  const [heatIndex, setHeatIndex] = useState<number>(meme?.heatIndex || 78);

  // Social states
  const [liked, setLiked] = useState<boolean>(Boolean(item.userLiked));
  const [likesCount, setLikesCount] = useState<number>(Number(item.likes) || 0);
  const [sharesCount, setSharesCount] = useState<number>(Number(item.shares) || 0);
  const [showInfo, setShowInfo] = useState(false);

  // Hydrate user vote and likes status
  useEffect(() => {
    async function checkStatus() {
      try {
        const voteRes = await fetch(`/api/engagements/${item.id}/vote`);
        const voteData = await voteRes.json();
        if (voteData.hasVoted) {
          setHasVoted(true);
          const opt = voteData.selectedOptionId;
          if (opt) {
            setUserVoteOption(opt);
            if (!isDualMeme) {
              setSelectedRating(opt as MemeRatingId);
            }
          }
        }
      } catch {}

      try {
        const likeRes = await fetch(`/api/engagements/${item.id}/like`);
        const likeData = await likeRes.json();
        if (likeData.liked !== undefined) setLiked(likeData.liked);
        if (likeData.likesCount !== undefined) setLikesCount(likeData.likesCount);
      } catch {}
    }
    checkStatus();
  }, [item.id, isDualMeme]);

  function getPercentage(ratingKey: MemeRatingId): number {
    if (totalVotes === 0) return 0;
    const votes = ratings[ratingKey] || 0;
    return Math.round((votes / totalVotes) * 100);
  }

  function formatCount(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return String(num);
  }

  // Handle vote for single meme rating
  async function handleVote(ratingToCast?: MemeRatingId) {
    if (hasVoted || loading) return;
    const finalChoice = ratingToCast || selectedRating;
    setSelectedRating(finalChoice);
    setLoading(true);

    try {
      const res = await fetch(`/api/engagements/${item.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionId: finalChoice }),
      });

      const data = await res.json();
      if (data.success || data.alreadyVoted) {
        setHasVoted(true);
        setUserVoteOption(finalChoice);
        setPointsToast(true);
        setTimeout(() => setPointsToast(false), 3500);

        if (data.ratings) {
          setRatings(data.ratings);
        } else {
          setRatings((prev) => ({
            ...prev,
            [finalChoice]: (prev[finalChoice] || 0) + 1,
          }));
        }

        if (data.totalVotes !== undefined) setTotalVotes(data.totalVotes);
        else setTotalVotes((prev) => prev + 1);

        if (data.heatIndex !== undefined) setHeatIndex(data.heatIndex);

        if (onVoteSuccess) onVoteSuccess(data);
      } else {
        alert(data.error || "Unable to cast vote");
      }
    } catch {
      // Optimistic fallback
      setHasVoted(true);
      setUserVoteOption(finalChoice);
      setRatings((prev) => ({
        ...prev,
        [finalChoice]: (prev[finalChoice] || 0) + 1,
      }));
      setTotalVotes((prev) => prev + 1);
      setPointsToast(true);
      setTimeout(() => setPointsToast(false), 3500);
    } finally {
      setLoading(false);
    }
  }

  // Handle vote for dual meme (Meme A vs Meme B)
  async function handleDualVote(choice: "A" | "B") {
    if (hasVoted || loading) return;
    setUserVoteOption(choice);
    setLoading(true);

    try {
      const res = await fetch(`/api/engagements/${item.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionId: choice }),
      });

      const data = await res.json();
      if (data.success || data.alreadyVoted) {
        setHasVoted(true);
        setUserVoteOption(choice);
        setPointsToast(true);
        setTimeout(() => setPointsToast(false), 3500);

        if (Array.isArray(data.options)) {
          setDualVotesA(Number(data.options[0]?.votes) || 0);
          setDualVotesB(Number(data.options[1]?.votes) || 0);
        } else {
          if (choice === "A") setDualVotesA((p) => p + 1);
          else setDualVotesB((p) => p + 1);
        }

        if (data.totalVotes !== undefined) setTotalVotes(data.totalVotes);
        else setTotalVotes((prev) => prev + 1);

        if (onVoteSuccess) onVoteSuccess(data);
      } else {
        alert(data.error || "Unable to cast vote");
      }
    } catch {
      setHasVoted(true);
      setUserVoteOption(choice);
      if (choice === "A") setDualVotesA((p) => p + 1);
      else setDualVotesB((p) => p + 1);
      setTotalVotes((prev) => prev + 1);
      setPointsToast(true);
      setTimeout(() => setPointsToast(false), 3500);
    } finally {
      setLoading(false);
    }
  }

  async function handleLike() {
    const nextLiked = !liked;
    const nextCount = Math.max(0, likesCount + (nextLiked ? 1 : -1));
    setLiked(nextLiked);
    setLikesCount(nextCount);

    try {
      const res = await fetch(`/api/engagements/${item.id}/like`, { method: "POST" });
      const data = await res.json();
      if (data.likesCount !== undefined) {
        setLikesCount(data.likesCount);
        setLiked(data.liked);
      }
    } catch {}
  }

  async function handleShare() {
    setSharesCount((prev) => prev + 1);
    fetch(`/api/engagements/${item.id}/share`, { method: "POST" }).catch(() => {});

    const shareTitle = meme?.title || item.title || "Sports Meme";
    const shareText = `Check out this hilarious sports meme on SportsFan360 Arena! 🔥`;

    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: shareTitle, text: shareText, url: window.location.href }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      alert("Meme link copied to clipboard!");
    }
  }

  const mediaSource =
    meme?.imageUrl ||
    meme?.mediaUrl ||
    (item as any).imageUrl ||
    "/placeholder-meme.png";

  const labelA = meme?.memeA?.title || meme?.options?.[0]?.text || meme?.options?.[0]?.label || "Meme A";
  const imageA = meme?.memeA?.imageUrl || meme?.options?.[0]?.imageUrl || mediaSource;

  const labelB = meme?.memeB?.title || meme?.options?.[1]?.text || meme?.options?.[1]?.label || "Meme B";
  const imageB = meme?.memeB?.imageUrl || meme?.options?.[1]?.imageUrl || "/placeholder-meme.png";

  const totalDual = dualVotesA + dualVotesB;
  const pctA = totalDual > 0 ? Math.round((dualVotesA / totalDual) * 100) : 50;
  const pctB = 100 - pctA;

  const authorName = meme?.authorName || item.creatorName || "SportsFan";
  const authorHandle = meme?.authorHandle || `@${authorName.replace(/\s+/g, "").toLowerCase()}`;
  const authorAvatar =
    meme?.authorAvatar ||
    `https://api.dicebear.com/7.x/bottts/svg?seed=${authorHandle}`;

  const ratingKeys: MemeRatingId[] = ["mid", "funny", "hot", "fire", "nuclear"];
  const currentConfig = RATING_CONFIG[selectedRating] || RATING_CONFIG.hot;

  // Format creation time
  const timeAgo = (() => {
    const diff = Date.now() - (item.createdAt || Date.now());
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  })();

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #12161f 0%, #0d1117 100%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 16,
        padding: 0,
        overflow: "hidden",
        boxShadow: "0 12px 30px -10px rgba(0,0,0,0.5)",
        position: "relative",
      }}
    >
      {/* Toast Notification for +2 Points */}
      <AnimatePresence>
        {pointsToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              background: "linear-gradient(135deg, #ff7b00 0%, #ff007f 100%)",
              color: "#fff",
              padding: "8px 18px",
              borderRadius: 30,
              boxShadow: "0 8px 25px rgba(255, 123, 0, 0.6)",
              fontSize: 13,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 8,
              letterSpacing: "0.02em",
            }}
          >
            <Sparkles size={16} />
            +2 Points Awarded for Meme Voting! 🔥
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Author Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px 10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img
            src={authorAvatar}
            alt={authorName}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid rgba(255, 123, 0, 0.4)",
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/avataaars/svg?seed=meme_${authorHandle}`;
            }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 6 }}>
              <span>Meme by <span style={{ color: "#ff8b3d" }}>{authorHandle}</span></span>
              {isDualMeme && (
                <span style={{ fontSize: 10, background: "rgba(255, 42, 109, 0.15)", border: "1px solid rgba(255, 42, 109, 0.35)", color: "#ff2a6d", padding: "1px 6px", borderRadius: 10, fontWeight: 800 }}>
                  DUAL BATTLE
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#8b949e" }}>{timeAgo}</div>
          </div>
        </div>

        <button
          onClick={() => setShowInfo(!showInfo)}
          style={{
            background: "transparent",
            border: "none",
            color: "#8b949e",
            cursor: "pointer",
            padding: 6,
            borderRadius: 6,
          }}
          title="Meme Info"
        >
          <MoreVertical size={18} />
        </button>
      </div>

      {/* Headline / Title (Optional) */}
      {(meme?.title || (item.title && item.title !== "Meme Arena")) && (
        <div style={{ padding: "0 16px 8px" }}>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "0.01em",
              lineHeight: 1.3,
            }}
          >
            {meme?.title || item.title}
          </h3>
        </div>
      )}

      {/* Description / Context (Optional) */}
      {(meme?.description || item.subtitle) && (
        <div style={{ padding: "0 16px 10px" }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: "#8b949e",
              lineHeight: 1.4,
            }}
          >
            {meme?.description || item.subtitle}
          </p>
        </div>
      )}

      {/* ────────────────── 1. DUAL MEME DISPLAY & VOTING ────────────────── */}
      {isDualMeme ? (
        <div>
          {/* Dual Meme Images Side-by-Side */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              padding: "0 16px 14px",
            }}
          >
            {/* Meme A Card */}
            <div
              onClick={() => !hasVoted && handleDualVote("A")}
              style={{
                background: "#05070a",
                border: `1.5px solid ${userVoteOption === "A" ? "#ff5e00" : "rgba(255, 255, 255, 0.08)"}`,
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                cursor: hasVoted ? "default" : "pointer",
                transition: "all 0.2s ease",
                boxShadow: userVoteOption === "A" ? "0 0 16px rgba(255, 94, 0, 0.4)" : "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 2,
                  background: "rgba(0,0,0,0.75)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backdropFilter: "blur(6px)",
                  color: "#ff8b3d",
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>🅰️</span>
                <span>{labelA}</span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 220,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#080b11",
                  overflow: "hidden",
                }}
              >
                <img
                  src={imageA}
                  alt={labelA}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&auto=format&fit=crop&q=80";
                  }}
                />
              </div>
            </div>

            {/* Meme B Card */}
            <div
              onClick={() => !hasVoted && handleDualVote("B")}
              style={{
                background: "#05070a",
                border: `1.5px solid ${userVoteOption === "B" ? "#ff2a6d" : "rgba(255, 255, 255, 0.08)"}`,
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                cursor: hasVoted ? "default" : "pointer",
                transition: "all 0.2s ease",
                boxShadow: userVoteOption === "B" ? "0 0 16px rgba(255, 42, 109, 0.4)" : "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  zIndex: 2,
                  background: "rgba(0,0,0,0.75)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backdropFilter: "blur(6px)",
                  color: "#f472b6",
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "3px 8px",
                  borderRadius: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>🅱️</span>
                <span>{labelB}</span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 220,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#080b11",
                  overflow: "hidden",
                }}
              >
                <img
                  src={imageB}
                  alt={labelB}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&auto=format&fit=crop&q=80";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Dual Meme Poll Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 14px" }}>
            {[
              { id: "A", label: labelA, votes: dualVotesA, percentage: pctA, color: "#ff8b3d", border: "rgba(255, 139, 61, 0.5)", bg: "rgba(255, 139, 61, 0.15)" },
              { id: "B", label: labelB, votes: dualVotesB, percentage: pctB, color: "#f472b6", border: "rgba(244, 114, 182, 0.5)", bg: "rgba(244, 114, 182, 0.15)" },
            ].map((choice) => {
              const isChosen = userVoteOption === choice.id;
              return (
                <button
                  key={choice.id}
                  onClick={() => handleDualVote(choice.id as "A" | "B")}
                  disabled={hasVoted || loading}
                  style={{
                    position: "relative",
                    background: isChosen ? choice.bg : "rgba(22, 27, 34, 0.7)",
                    border: isChosen ? `2px solid ${choice.color}` : "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: hasVoted ? "default" : "pointer",
                    overflow: "hidden",
                    outline: "none",
                    transition: "all 0.2s ease",
                    textAlign: "left",
                  }}
                >
                  {/* Progress bar fill when voted */}
                  {hasVoted && (
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        bottom: 0,
                        width: `${choice.percentage}%`,
                        background: choice.bg,
                        opacity: 0.85,
                        transition: "width 0.6s ease-out",
                        zIndex: 0,
                      }}
                    />
                  )}

                  {/* Choice Label */}
                  <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: isChosen ? choice.color : "rgba(255,255,255,0.08)",
                        color: isChosen ? "#000" : "#fff",
                        fontSize: 11,
                        fontWeight: 800,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {choice.id}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                      {choice.label}
                    </span>
                    {isChosen && <CheckCircle2 size={16} color="#3fb950" />}
                  </div>

                  {/* Percentage & Vote Count */}
                  <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    {hasVoted ? (
                      <>
                        <span style={{ fontSize: 14, fontWeight: 800, color: choice.color }}>
                          {choice.percentage}%
                        </span>
                        <span style={{ fontSize: 11, color: "#8b949e" }}>
                          ({formatCount(choice.votes)})
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#8b949e" }}>
                        Tap to Vote
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* ────────────────── 2. SINGLE MEME DISPLAY & VOTING ────────────────── */
        <div>
          {/* Single Media Image */}
          <div
            style={{
              width: "100%",
              maxHeight: 520,
              background: "#05070a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative",
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
              borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <img
              src={mediaSource}
              alt={meme?.title || item.title || "Sports Meme"}
              style={{
                width: "100%",
                height: "auto",
                maxHeight: 520,
                objectFit: "contain",
                display: "block",
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&auto=format&fit=crop&q=80";
              }}
            />
          </div>

          {/* Question / Prompt Header */}
          <div
            style={{
              padding: "16px 16px 8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "0.01em",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              How Hot Is This Meme?
            </span>
            <button
              onClick={() => setShowInfo(!showInfo)}
              style={{
                background: "none",
                border: "none",
                color: "#8b949e",
                cursor: "pointer",
                padding: 4,
              }}
            >
              <Info size={16} />
            </button>
          </div>

          {/* Info Popover Note */}
          {showInfo && (
            <div
              style={{
                margin: "0 16px 12px",
                padding: "8px 12px",
                background: "rgba(33, 38, 45, 0.8)",
                borderRadius: 8,
                border: "1px solid rgba(255, 255, 255, 0.1)",
                fontSize: 11,
                color: "#8b949e",
              }}
            >
              Vote for how funny or spicy this meme is! You earn <strong>+2 points</strong> on your first vote for this meme arena event.
            </div>
          )}

          {/* 5 Rating Buttons Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
              padding: "0 16px 14px",
            }}
          >
            {ratingKeys.map((key) => {
              const cfg = RATING_CONFIG[key];
              const isSelected = selectedRating === key;
              const isUserVote = userVoteOption === key;
              const pct = getPercentage(key);
              const voteCount = ratings[key] || 0;

              return (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedRating(key);
                    if (!hasVoted) {
                      handleVote(key);
                    }
                  }}
                  style={{
                    position: "relative",
                    background: isSelected ? cfg.bg : "rgba(22, 27, 34, 0.7)",
                    border: isSelected
                      ? `2px solid ${cfg.textColor}`
                      : `1px solid ${cfg.border}`,
                    borderRadius: 10,
                    padding: "8px 4px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    cursor: hasVoted ? "default" : "pointer",
                    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                    outline: "none",
                    overflow: "hidden",
                    boxShadow: isSelected ? `0 0 14px ${cfg.activeGlow}` : "none",
                  }}
                >
                  {/* Background percentage fill bar */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      width: "100%",
                      height: `${pct}%`,
                      background: cfg.bg,
                      opacity: 0.6,
                      transition: "height 0.6s ease-out",
                      pointerEvents: "none",
                      zIndex: 0,
                    }}
                  />

                  {/* Flame Silhouette or Emoji */}
                  <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {key === "mid" && (
                      <Flame size={20} color="#6e7681" fill="#6e7681" />
                    )}
                    {key === "funny" && (
                      <Flame size={20} color="#ec4899" fill="#ec4899" />
                    )}
                    {key === "hot" && (
                      <Flame size={20} color="#f97316" fill="#f97316" />
                    )}
                    {key === "fire" && (
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <Flame size={18} color="#ef4444" fill="#ef4444" />
                        <Flame size={14} color="#f87171" fill="#f87171" style={{ marginLeft: -6 }} />
                      </div>
                    )}
                    {key === "nuclear" && (
                      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                        <Flame size={22} color="#d946ef" fill="#d946ef" />
                        <Sparkles size={11} color="#fbcfe8" style={{ position: "absolute", top: -4, right: -4 }} />
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <span
                    style={{
                      position: "relative",
                      zIndex: 1,
                      fontSize: 11,
                      fontWeight: isSelected ? 800 : 600,
                      color: isSelected ? cfg.textColor : "#c9d1d9",
                      lineHeight: 1,
                    }}
                  >
                    {cfg.label}
                  </span>

                  {/* Percentage & Vote Count Display */}
                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 1,
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: isSelected ? "#ffffff" : "#8b949e",
                      }}
                    >
                      {pct}%
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: "#6e7681",
                      }}
                    >
                      {formatCount(voteCount)}
                    </span>
                  </div>

                  {/* Checkmark badge if user voted this option */}
                  {isUserVote && (
                    <div
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        zIndex: 2,
                      }}
                    >
                      <CheckCircle2 size={11} color="#3fb950" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Heat Bar & Social Counters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px 12px",
          borderTop: "1px solid rgba(255, 255, 255, 0.05)",
          color: "#8b949e",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              color: "#ff8b3d",
              fontWeight: 800,
            }}
          >
            <BarChart3 size={15} />
            <span>{isDualMeme ? `${formatCount(totalDual > 0 ? totalDual : totalVotes)} Total Votes` : `${heatIndex}% Heat`}</span>
          </div>
          {!isDualMeme && (
            <>
              <span>•</span>
              <span>{formatCount(totalVotes)} votes</span>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Like */}
          <button
            onClick={handleLike}
            style={{
              background: "none",
              border: "none",
              color: liked ? "#ff7b72" : "#8b949e",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              padding: 0,
            }}
          >
            <Heart size={15} fill={liked ? "#ff7b72" : "none"} />
            <span>{likesCount}</span>
          </button>

          {/* Comments count */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <MessageCircle size={15} />
            <span>{Number(meme?.commentsCount) || 0}</span>
          </div>

          {/* Share */}
          <button
            onClick={handleShare}
            style={{
              background: "none",
              border: "none",
              color: "#8b949e",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 600,
              padding: 0,
            }}
          >
            <Share2 size={15} />
            <span>{sharesCount > 0 ? sharesCount : "Share"}</span>
          </button>
        </div>
      </div>

      {/* Bottom CTA Row: Only for Single Meme rating */}
      {!isDualMeme && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "4px 16px 16px",
          }}
        >
          <button
            onClick={() => handleVote(selectedRating)}
            disabled={hasVoted || loading}
            style={{
              flex: 1,
              background: hasVoted
                ? "linear-gradient(135deg, rgba(46, 160, 67, 0.25) 0%, rgba(35, 134, 54, 0.4) 100%)"
                : "linear-gradient(135deg, #ff5e00 0%, #ff2a6d 100%)",
              border: hasVoted ? "1px solid #3fb950" : "none",
              color: "#ffffff",
              padding: "12px 18px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 800,
              cursor: hasVoted ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: hasVoted ? "none" : "0 6px 20px rgba(255, 94, 0, 0.35)",
              transition: "all 0.2s ease",
              opacity: loading ? 0.8 : 1,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Voting...</span>
              </>
            ) : hasVoted ? (
              <>
                <CheckCircle2 size={16} color="#3fb950" />
                <span>Voted {currentConfig.label} (+2 pts)</span>
              </>
            ) : (
              <>
                <Flame size={16} fill="#fff" />
                <span>Vote {currentConfig.label}</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              if (onSkip) onSkip();
            }}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              color: "#8b949e",
              padding: "12px 20px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
