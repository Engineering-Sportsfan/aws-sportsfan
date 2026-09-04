"use client";

import React, { useState, useEffect } from "react";
import { EngagementItem } from "@/types/engagements";

interface Props {
  item: EngagementItem;
  onVoteSuccess?: (data: any) => void;
}

export default function PollCard({ item, onVoteSuccess }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [voted, setVoted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState(
    item.pollData?.options || [
      { id: "1", text: "Jasprit Bumrah 🏏", votes: 47 },
      { id: "2", text: "Maheesh Theekshana 🌀", votes: 31 },
      { id: "3", text: "Ravindra Jadeja 🍌", votes: 22 },
    ]
  );
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(Number(item.likes) || 0);
  const [sharesCount, setSharesCount] = useState<number>(Number(item.shares) || 0);
  const [totalEngaged, setTotalEngaged] = useState<number>(Number(item.totalEngaged) || 0);

  const totalVotes = options.reduce((sum, o) => sum + (o.votes || 0), 0) || 100;

  // Check initial like status
  useEffect(() => {
    async function checkLike() {
      try {
        const localLiked = localStorage.getItem(`liked_eng_${item.id}`);
        if (localLiked === "true") setLiked(true);

        const res = await fetch(`/api/engagements/${item.id}/like`);
        const data = await res.json();
        if (data.liked !== undefined) setLiked(data.liked);
      } catch {}
    }
    checkLike();
  }, [item.id]);

  async function handleVote(optId: string) {
    if (voted || loading) return;
    setSelectedId(optId);
    setVoted(true);
    setLoading(true);
    setTotalEngaged(prev => prev + 1);

    try {
      const res = await fetch(`/api/engagements/${item.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionId: optId }),
      });
      const data = await res.json();
      if (data.success && data.options) {
        setOptions(data.options);
        if (onVoteSuccess) onVoteSuccess(data);
      }
    } catch {
      setOptions(prev =>
        prev.map(o => (o.id === optId ? { ...o, votes: (o.votes || 0) + 1 } : o))
      );
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

  async function handleShare() {
    setSharesCount(prev => prev + 1);
    setTotalEngaged(prev => prev + 1);
    fetch(`/api/engagements/${item.id}/share`, { method: "POST" }).catch(() => {});

    const text = `Vote on this poll: "${item.pollData?.question || item.title}" on SportsFan360!`;
    if (navigator.share) {
      navigator.share({ title: item.title, text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Poll link copied! Share with friends.");
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
          <span style={{ color: "#58a6ff", display: "flex", alignItems: "center", gap: 4 }}>
            📊 POLL
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#6e7681" }}>{formattedTime}</span>
      </div>

      {/* Poll Question */}
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 16px 0", color: "#f0f6fc", letterSpacing: "-0.01em" }}>
        {item.pollData?.question || item.title}
      </h2>

      {/* Stacked Options */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map(opt => {
          const isSelected = selectedId === opt.id;
          const percentage = Math.round(((opt.votes || 0) / totalVotes) * 100) || (opt as any).percentage || 0;

          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={voted}
              style={{
                width: "100%",
                background: "#0d131f",
                border: isSelected ? "1.5px solid #388bfd" : "1px solid #212c3f",
                borderRadius: 8,
                padding: "14px 16px",
                color: isSelected ? "#58a6ff" : "#e6edf3",
                fontSize: 14,
                fontWeight: 600,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: voted ? "default" : "pointer",
                position: "relative",
                overflow: "hidden",
                textAlign: "left",
                transition: "all .2s ease",
              }}
            >
              {/* Animated Progress Bar fill when voted */}
              {voted && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${percentage}%`,
                    background: isSelected ? "rgba(56, 139, 253, 0.15)" : "rgba(110, 118, 129, 0.08)",
                    zIndex: 0,
                    transition: "width .5s ease",
                  }}
                />
              )}

              <span style={{ position: "relative", zIndex: 1 }}>{opt.text}</span>
              <span
                style={{
                  position: "relative",
                  zIndex: 1,
                  fontWeight: 800,
                  fontSize: 14,
                  color: isSelected ? "#58a6ff" : percentage > 35 ? "#3fb950" : "#d2a8ff",
                }}
              >
                {percentage}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Subtext */}
      {voted && (
        <div style={{ fontSize: 11, color: "#7d8590", textAlign: "center", marginTop: 12, animation: "fadeIn .3s ease" }}>
          Thanks for voting · Results based on all SF360 fans
        </div>
      )}

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
            onClick={handleShare}
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
