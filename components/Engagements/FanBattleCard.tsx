"use client";

import React, { useState, useEffect } from "react";
import { EngagementItem } from "@/types/engagements";

interface Props {
  item: EngagementItem;
  onVoteSuccess?: (data: any) => void;
}

export default function FanBattleCard({ item, onVoteSuccess }: Props) {
  const [selectedSide, setSelectedSide] = useState<"left" | "right" | null>(null);
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(Number(item.likes) || 0);
  const [sharesCount, setSharesCount] = useState<number>(Number(item.shares) || 0);
  const [totalEngaged, setTotalEngaged] = useState<number>(Number(item.totalEngaged) || 0);
  const [resultData, setResultData] = useState<{
    leftPercentage: number;
    rightPercentage: number;
    totalVotes: number;
  } | null>(null);

  const left = item.fanBattleData?.leftCompetitor || {
    code: "IN",
    name: "Virat Kohli",
    stat: "Avg 58.6 in Tests",
    votes: 0,
  };

  const right = item.fanBattleData?.rightCompetitor || {
    code: "PK",
    name: "Babar Azam",
    stat: "Avg 44.8 in Tests",
    votes: 0,
  };

  // Check initial like status
  useEffect(() => {
    async function checkLike() {
      try {
        const localLiked = localStorage.getItem(`liked_eng_${item.id}`);
        if (localLiked === "true") setLiked(true);

        const res = await fetch(`/api/engagements/${item.id}/like`);
        const data = await res.json();
        if (data.liked !== undefined) {
          setLiked(data.liked);
        }
      } catch {}
    }
    checkLike();
  }, [item.id]);

  async function handleVote(side: "left" | "right") {
    if (selectedSide || loading) return;
    setSelectedSide(side);
    setLoading(true);
    setTotalEngaged(prev => prev + 1);

    try {
      const res = await fetch(`/api/engagements/${item.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionId: side }),
      });
      const data = await res.json();
      if (data.success) {
        setResultData({
          leftPercentage: data.leftPercentage,
          rightPercentage: data.rightPercentage,
          totalVotes: data.totalVotes,
        });
        if (onVoteSuccess) onVoteSuccess(data);
      }
    } catch {
      setResultData({
        leftPercentage: side === "left" ? 62 : 38,
        rightPercentage: side === "right" ? 62 : 38,
        totalVotes: 1,
      });
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
      localStorage.setItem(`liked_eng_${item.id}`, String(nextLiked));
      const res = await fetch(`/api/engagements/${item.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.likesCount !== undefined) {
        setLikesCount(data.likesCount);
        setLiked(data.liked);
      }
    } catch {}
  }

  async function handleChallenge() {
    setSharesCount(prev => prev + 1);
    setTotalEngaged(prev => prev + 1);
    fetch(`/api/engagements/${item.id}/share`, { method: "POST" }).catch(() => {});

    const text = `Who wins your vote? ${left.name} vs ${right.name}! Vote now on SportsFan360.`;
    if (navigator.share) {
      navigator.share({ title: item.title, text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Link copied! Share with your friends to challenge them.");
    }
  }

  const formattedTime = new Date(item.createdAt || Date.now()).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        background: "#080c14",
        border: "1px solid #161e2e",
        borderRadius: 14,
        padding: "18px 20px",
        color: "#ffffff",
        maxWidth: 580,
        margin: "0 auto 16px auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header Badges */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontWeight: 800, letterSpacing: ".04em" }}>
          <span style={{ color: "#ff6b6b", display: "flex", alignItems: "center", gap: 4 }}>
            ⚔️ FAN BATTLE
          </span>
          <span style={{ color: "#ff922b", display: "flex", alignItems: "center", gap: 4 }}>
            🔥 TRENDING
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#6e7681" }}>{formattedTime}</span>
      </div>

      {/* Main Title */}
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 14px 0", color: "#f0f6fc", letterSpacing: "-0.01em" }}>
        {item.title}
      </h2>

      {/* VS Box Container */}
      <div
        style={{
          background: "#0d131f",
          border: "1px solid #212c3f",
          borderRadius: 10,
          padding: "20px 16px",
          display: "grid",
          gridTemplateColumns: "1fr 40px 1fr",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Left Competitor Card */}
        <div
          onClick={() => handleVote("left")}
          style={{
            textAlign: "center",
            cursor: selectedSide ? "default" : "pointer",
            padding: "10px",
            borderRadius: 8,
            transition: "all .2s ease",
            background: selectedSide === "left" ? "rgba(56, 139, 253, 0.12)" : "transparent",
            border: selectedSide === "left" ? "1px solid #388bfd" : "1px solid transparent",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: ".02em", color: "#ffffff" }}>
            {left.code}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3", marginTop: 4 }}>
            {left.name}
          </div>
          <div style={{ fontSize: 12, color: "#7d8590", marginTop: 2 }}>
            {left.stat}
          </div>

          {/* Percentage on Voted */}
          {resultData && (
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#58a6ff",
                marginTop: 8,
                animation: "fadeIn .3s ease",
              }}
            >
              {resultData.leftPercentage}%
            </div>
          )}
        </div>

        {/* Center VS Divider */}
        <div style={{ textAlign: "center", color: "#6e7681", fontSize: 12, fontWeight: 800, letterSpacing: ".05em" }}>
          VS
        </div>

        {/* Right Competitor Card */}
        <div
          onClick={() => handleVote("right")}
          style={{
            textAlign: "center",
            cursor: selectedSide ? "default" : "pointer",
            padding: "10px",
            borderRadius: 8,
            transition: "all .2s ease",
            background: selectedSide === "right" ? "rgba(56, 139, 253, 0.12)" : "transparent",
            border: selectedSide === "right" ? "1px solid #388bfd" : "1px solid transparent",
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: ".02em", color: "#ffffff" }}>
            {right.code}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3", marginTop: 4 }}>
            {right.name}
          </div>
          <div style={{ fontSize: 12, color: "#7d8590", marginTop: 2 }}>
            {right.stat}
          </div>

          {/* Percentage on Voted */}
          {resultData && (
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#58a6ff",
                marginTop: 8,
                animation: "fadeIn .3s ease",
              }}
            >
              {resultData.rightPercentage}%
            </div>
          )}
        </div>
      </div>

      {/* Challenge Button */}
      <button
        onClick={handleChallenge}
        style={{
          width: "100%",
          background: "#131b29",
          border: "1px solid #283449",
          borderRadius: 8,
          color: "#e6edf3",
          padding: "12px",
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 12,
          cursor: "pointer",
          transition: "background .15s",
        }}
      >
        <span>📢</span> Challenge a Friend
      </button>

      {/* Footer / Counters with Dynamic Likes */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
          paddingTop: 12,
          borderTop: "1px solid #141b27",
          fontSize: 12,
          color: "#7d8590",
        }}
      >
        <div style={{ display: "flex", gap: 16 }}>
          <button
            onClick={handleLike}
            style={{
              background: "none", border: "none", color: liked ? "#ff6b6b" : "#7d8590",
              display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12,
              transition: "transform .15s ease",
              transform: liked ? "scale(1.08)" : "scale(1)",
            }}
          >
            <span>{liked ? "❤️" : "🤍"}</span> {likesCount.toLocaleString()}
          </button>
          <button
            onClick={handleChallenge}
            style={{
              background: "none", border: "none", color: "#7d8590",
              display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12,
            }}
          >
            <span>🔗</span> Share {sharesCount > 0 ? `(${sharesCount})` : ""}
          </button>
        </div>
        <div>
          {totalEngaged.toLocaleString()} engaged
        </div>
      </div>
    </div>
  );
}
