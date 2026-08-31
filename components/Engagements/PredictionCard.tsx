"use client";

import React, { useState, useEffect } from "react";
import { EngagementItem } from "@/types/engagements";

interface Props {
  item: EngagementItem;
  onPredictionSuccess?: (data: any) => void;
}

export default function PredictionCard({ item, onPredictionSuccess }: Props) {
  const [selectedChoice, setSelectedChoice] = useState<"left" | "right" | null>(null);
  const [predicted, setPredicted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(Number(item.likes) || 0);
  const [sharesCount, setSharesCount] = useState<number>(Number(item.shares) || 0);
  const [totalEngaged, setTotalEngaged] = useState<number>(Number(item.totalEngaged) || 0);
  const [resultData, setResultData] = useState<{
    leftPercentage: number;
    rightPercentage: number;
    coinsLocked: number;
  } | null>(null);

  const pred = item.predictionData || {
    question: "India win the 1st Galle Test?",
    leftChoice: { id: "left", text: "Yes, India win", code: "IN", votes: 71 },
    rightChoice: { id: "right", text: "SL hold / win", code: "LK", votes: 29 },
    coinStake: 25,
    totalVotes: 100,
    status: "open",
  };

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

  async function handlePredict(choice: "left" | "right") {
    if (predicted || loading) return;
    setSelectedChoice(choice);
    setPredicted(true);
    setLoading(true);
    setTotalEngaged(prev => prev + 1);

    try {
      const res = await fetch(`/api/engagements/${item.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionId: choice }),
      });
      const data = await res.json();
      if (data.success) {
        setResultData({
          leftPercentage: data.leftPercentage,
          rightPercentage: data.rightPercentage,
          coinsLocked: data.coinsLocked || pred.coinStake || 25,
        });
        if (onPredictionSuccess) onPredictionSuccess(data);
      }
    } catch {
      setResultData({
        leftPercentage: choice === "left" ? 71 : 29,
        rightPercentage: choice === "right" ? 71 : 29,
        coinsLocked: pred.coinStake || 25,
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

  async function handleShare() {
    setSharesCount(prev => prev + 1);
    setTotalEngaged(prev => prev + 1);
    fetch(`/api/engagements/${item.id}/share`, { method: "POST" }).catch(() => {});

    const text = `Make your prediction: "${pred.question}" on SportsFan360!`;
    if (navigator.share) {
      navigator.share({ title: item.title, text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Prediction link copied! Share with friends.");
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
            🎯 PREDICTION
          </span>
          <span style={{ color: "#58a6ff", display: "flex", alignItems: "center", gap: 4 }}>
            💎 POINTS
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#6e7681" }}>{formattedTime}</span>
      </div>

      {/* Main Title Header */}
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 10px 0", color: "#f0f6fc", letterSpacing: "-0.01em" }}>
        {item.title || "Predict the outcome!"}
      </h2>

      {/* Question */}
      <div style={{ fontSize: 15, fontWeight: 600, color: "#c9d1d9", marginBottom: 16 }}>
        {pred.question}
      </div>

      {/* 2-Column Binary Prediction Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Left Choice */}
        <button
          onClick={() => handlePredict("left")}
          disabled={predicted}
          style={{
            background: selectedChoice === "left" ? "rgba(46, 160, 67, 0.12)" : "#0d131f",
            border: selectedChoice === "left" ? "2px solid #2ea043" : "1px solid #212c3f",
            borderRadius: 8,
            padding: "16px 14px",
            color: "#ffffff",
            cursor: predicted ? "default" : "pointer",
            textAlign: "center",
            transition: "all .2s ease",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: selectedChoice === "left" ? "#3fb950" : "#e6edf3" }}>
            {pred.leftChoice.text}{" "}
            {pred.leftChoice.code && (
              <span style={{ fontSize: 11, fontWeight: 800, color: selectedChoice === "left" ? "#3fb950" : "#7d8590" }}>
                {pred.leftChoice.code}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#3fb950",
              marginTop: 6,
            }}
          >
            {resultData ? `${resultData.leftPercentage}%` : "71%"}
          </div>
        </button>

        {/* Right Choice */}
        <button
          onClick={() => handlePredict("right")}
          disabled={predicted}
          style={{
            background: selectedChoice === "right" ? "rgba(218, 54, 51, 0.12)" : "#0d131f",
            border: selectedChoice === "right" ? "2px solid #da3633" : "1px solid #212c3f",
            borderRadius: 8,
            padding: "16px 14px",
            color: "#ffffff",
            cursor: predicted ? "default" : "pointer",
            textAlign: "center",
            transition: "all .2s ease",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: selectedChoice === "right" ? "#ff7b72" : "#e6edf3" }}>
            {pred.rightChoice.text}{" "}
            {pred.rightChoice.code && (
              <span style={{ fontSize: 11, fontWeight: 800, color: selectedChoice === "right" ? "#ff7b72" : "#7d8590" }}>
                {pred.rightChoice.code}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#ff7b72",
              marginTop: 6,
            }}
          >
            {resultData ? `${resultData.rightPercentage}%` : "29%"}
          </div>
        </button>
      </div>

      {/* FlipCoins Banner */}
      <div
        style={{
          background: "#0d131f",
          border: "1px solid #212c3f",
          borderRadius: 8,
          padding: "12px",
          marginTop: 12,
          textAlign: "center",
          fontSize: 13,
          color: "#e3b341",
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <span>🔒</span> +{resultData?.coinsLocked || pred.coinStake || 25} FlipCoins locked in · Results after match
      </div>

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
