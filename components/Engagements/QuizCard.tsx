"use client";

import React, { useState, useEffect } from "react";
import { EngagementItem } from "@/types/engagements";

interface Props {
  item: EngagementItem;
  onAnswerSuccess?: (data: any) => void;
}

export default function QuizCard({ item, onAnswerSuccess }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [correctOptionId, setCorrectOptionId] = useState<string>(item.quizData?.correctOptionId || "B");
  const [explanation, setExplanation] = useState<string>(item.quizData?.explanation || "Correct: 29");
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(Number(item.likes) || 0);
  const [sharesCount, setSharesCount] = useState<number>(Number(item.shares) || 0);
  const [totalEngaged, setTotalEngaged] = useState<number>(Number(item.totalEngaged) || 0);

  const quiz = item.quizData || {
    question: "How many Test centuries has Virat Kohli scored?",
    options: [
      { id: "A", text: "27" },
      { id: "B", text: "29" },
      { id: "C", text: "30" },
      { id: "D", text: "32" },
    ],
    correctOptionId: "B",
    pointsReward: 50,
    explanation: "Correct: 29",
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

  async function handleOptionSelect(optId: string) {
    if (answered) return;
    setSelectedId(optId);
    setAnswered(true);
    setTotalEngaged(prev => prev + 1);

    try {
      const res = await fetch(`/api/engagements/${item.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedOptionId: optId }),
      });
      const data = await res.json();
      if (data.success) {
        setIsCorrect(data.isCorrect);
        setCorrectOptionId(data.correctOptionId || quiz.correctOptionId);
        setExplanation(data.explanation || quiz.explanation);
        if (onAnswerSuccess) onAnswerSuccess(data);
      }
    } catch {
      const correct = optId.toUpperCase() === quiz.correctOptionId.toUpperCase();
      setIsCorrect(correct);
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

    const text = `Can you solve this cricket quiz? "${quiz.question}" on SportsFan360!`;
    if (navigator.share) {
      navigator.share({ title: item.title, text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Quiz link copied! Share with friends.");
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
          <span style={{ color: "#d2a8ff", display: "flex", alignItems: "center", gap: 4 }}>
            🧠 QUIZ
          </span>
          <span style={{ color: "#e3b341", display: "flex", alignItems: "center", gap: 4 }}>
            ⭐ {quiz.pointsReward || 50} PTS
          </span>
        </div>
        <span style={{ fontSize: 11, color: "#6e7681" }}>{formattedTime}</span>
      </div>

      {/* Main Title */}
      <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 10px 0", color: "#f0f6fc", letterSpacing: "-0.01em" }}>
        {item.title}
      </h2>

      {/* Question */}
      <div style={{ fontSize: 15, fontWeight: 600, color: "#c9d1d9", marginBottom: 16, lineHeight: 1.4 }}>
        {quiz.question}
      </div>

      {/* 2x2 Options Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {quiz.options.map(opt => {
          const isSelected = selectedId === opt.id;
          const isThisCorrect = opt.id.toUpperCase() === correctOptionId.toUpperCase();

          let bg = "#0d131f";
          let border = "1px solid #212c3f";
          let textColor = "#e6edf3";
          let icon = null;

          if (answered) {
            if (isThisCorrect) {
              bg = "rgba(46, 160, 67, 0.15)";
              border = "1.5px solid #2ea043";
              textColor = "#3fb950";
              icon = <span style={{ color: "#3fb950", marginRight: 6 }}>✓</span>;
            } else if (isSelected && !isThisCorrect) {
              bg = "rgba(218, 54, 51, 0.15)";
              border = "1.5px solid #da3633";
              textColor = "#f85149";
              icon = <span style={{ color: "#f85149", marginRight: 6 }}>✕</span>;
            } else {
              textColor = "#6e7681";
            }
          }

          return (
            <button
              key={opt.id}
              onClick={() => handleOptionSelect(opt.id)}
              disabled={answered}
              style={{
                background: bg,
                border: border,
                borderRadius: 8,
                padding: "14px 16px",
                color: textColor,
                fontSize: 14,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                cursor: answered ? "default" : "pointer",
                transition: "all .15s ease",
                textAlign: "left",
              }}
            >
              {icon}
              {!icon && <span style={{ color: "#6e7681", marginRight: 8, fontWeight: 600 }}>{opt.id}</span>}
              <span>{opt.text}</span>
            </button>
          );
        })}
      </div>

      {/* Feedback Banner */}
      {answered && (
        <div
          style={{
            background: isCorrect ? "rgba(46, 160, 67, 0.15)" : "rgba(218, 54, 51, 0.15)",
            border: `1px solid ${isCorrect ? "rgba(46, 160, 67, 0.3)" : "rgba(218, 54, 51, 0.3)"}`,
            borderRadius: 8,
            padding: "12px 14px",
            marginTop: 12,
            fontSize: 13,
            fontWeight: 700,
            color: isCorrect ? "#3fb950" : "#ff7b72",
            display: "flex",
            alignItems: "center",
            gap: 8,
            animation: "fadeIn .3s ease",
          }}
        >
          <span>{isCorrect ? "✓" : "✕"}</span>
          <span>{isCorrect ? `Correct! +${quiz.pointsReward || 50} Points Added` : explanation || `Correct: ${correctOptionId}`}</span>
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
