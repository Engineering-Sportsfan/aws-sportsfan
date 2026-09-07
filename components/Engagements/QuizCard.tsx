"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { EngagementItem, QuizQuestion, QuizOption, QuizLeaderboardEntry } from "@/types/engagements";

interface Props {
  item: EngagementItem;
  onAnswerSuccess?: (data: any) => void;
  userId?: string;
  userName?: string;
  userAvatar?: string;
}

export default function QuizCard({
  item,
  onAnswerSuccess,
  userId: propUserId,
  userName: propUserName,
  userAvatar: propUserAvatar,
}: Props) {
  // Tab Switcher: "quiz" or "leaderboard"
  const [activeTab, setActiveTab] = useState<"quiz" | "leaderboard">("quiz");

  // Normalize questions array from payload or fallback single question
  const questions: QuizQuestion[] = useMemo(() => {
    if (item.quizData?.questions && item.quizData.questions.length > 0) {
      return item.quizData.questions;
    }
    const defaultQuiz = item.quizData || {
      question: item.title || "How many Test centuries has Virat Kohli scored?",
      options: [
        { id: "A", text: "27" },
        { id: "B", text: "29" },
        { id: "C", text: "30" },
        { id: "D", text: "32" },
      ],
      correctOptionId: "B",
      pointsReward: 50,
      explanation: "Virat Kohli scored his 29th Test hundred against West Indies.",
    };

    return [
      {
        id: "q_1",
        question: defaultQuiz.question || item.title,
        options: defaultQuiz.options || [
          { id: "A", text: "Option A" },
          { id: "B", text: "Option B" },
          { id: "C", text: "Option C" },
          { id: "D", text: "Option D" },
        ],
        correctOptionId: defaultQuiz.correctOptionId || "B",
        pointsReward: defaultQuiz.pointsReward || 50,
        explanation: defaultQuiz.explanation || "Correct Answer",
      },
    ];
  }, [item]);

  // Timing & Frequency setup
  const startTime = useMemo(() => {
    return Number(
      item.quizData?.startTime ||
      item.quizData?.scheduledStartTime ||
      item.createdAt ||
      Date.now()
    );
  }, [item]);

  const frequencyMinutes = useMemo(() => {
    return Number(item.quizData?.frequencyMinutes || 10);
  }, [item]);

  const frequencyMs = frequencyMinutes * 60 * 1000;

  // Local state for answers & stats
  // Key: questionId -> { selectedId: string, isCorrect: boolean, pointsAwarded: number }
  const [answers, setAnswers] = useState<
    Record<string, { selectedId: string; isCorrect: boolean; pointsAwarded: number }>
  >({});
  const [submittingQId, setSubmittingQId] = useState<string | null>(null);

  // User Stats & Total Points Earned in this quiz
  const [totalPointsEarned, setTotalPointsEarned] = useState<number>(0);
  const [correctCount, setCorrectCount] = useState<number>(0);
  const [incorrectCount, setIncorrectCount] = useState<number>(0);

  // Social Stats
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState<number>(Number(item.likes) || 0);
  const [sharesCount, setSharesCount] = useState<number>(Number(item.shares) || 0);
  const [totalEngaged, setTotalEngaged] = useState<number>(Number(item.totalEngaged) || 0);

  // Live Timer State for frequency countdown
  const [now, setNow] = useState<number>(Date.now());

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<QuizLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [currentUserEntry, setCurrentUserEntry] = useState<QuizLeaderboardEntry | null>(null);

  // 1. Tick timer every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Load stored answers from localStorage on mount
  useEffect(() => {
    try {
      const storedAnswers: Record<
        string,
        { selectedId: string; isCorrect: boolean; pointsAwarded: number }
      > = {};
      let pts = 0;
      let corr = 0;
      let incorr = 0;

      for (const q of questions) {
        const local = localStorage.getItem(`answered_quiz_${item.id}_${q.id}`);
        if (local) {
          try {
            const parsed = JSON.parse(local);
            storedAnswers[q.id] = parsed;
            if (parsed.isCorrect) {
              pts += Number(parsed.pointsAwarded || q.pointsReward || 50);
              corr++;
            } else {
              incorr++;
            }
          } catch {}
        }
      }

      setAnswers(storedAnswers);
      setTotalPointsEarned(pts);
      setCorrectCount(corr);
      setIncorrectCount(incorr);
    } catch {}
  }, [item.id, questions]);

  // 3. Check like status
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

  // 4. Fetch Leaderboard
  const fetchLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch(`/api/engagements/quiz/leaderboard?quizId=${item.id}&limit=20`);
      const data = await res.json();
      if (data.success) {
        setLeaderboard(data.leaderboard || []);
        if (data.currentUser) setCurrentUserEntry(data.currentUser);
      }
    } catch (err) {
      console.warn("Failed to fetch quiz leaderboard:", err);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [item.id]);

  useEffect(() => {
    if (activeTab === "leaderboard") {
      fetchLeaderboard();
    }
  }, [activeTab, fetchLeaderboard]);

  // ─── Current Single Question Calculation based on Start Time & Frequency ──
  const { currentSlotIndex, timeRemainingInSlotMs, isStarted } = useMemo(() => {
    const elapsed = Math.max(0, now - startTime);
    const slotIdx = Math.floor(elapsed / frequencyMs);
    const timeInCurrentSlot = elapsed % frequencyMs;
    const remainingMs = Math.max(0, frequencyMs - timeInCurrentSlot);
    const started = now >= startTime;

    return {
      currentSlotIndex: Math.min(slotIdx, questions.length - 1),
      timeRemainingInSlotMs: remainingMs,
      isStarted: started,
    };
  }, [now, startTime, frequencyMs, questions.length]);

  // Formatted countdown timer MM:SS
  const formattedCountdown = useMemo(() => {
    const totalSecs = Math.floor(timeRemainingInSlotMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, [timeRemainingInSlotMs]);

  // Current active single question
  const currentQuestion = questions[currentSlotIndex] || questions[0];
  const isCurrentQuestionAnswered = !!answers[currentQuestion?.id];

  // ─── Handle Option Selection ───────────────────────────────────────────────
  async function handleOptionSelect(q: QuizQuestion, optId: string) {
    if (answers[q.id] || submittingQId === q.id) return;

    setSubmittingQId(q.id);
    const localIsCorrect = optId.toUpperCase() === q.correctOptionId.toUpperCase();
    const pts = localIsCorrect ? Number(q.pointsReward || 50) : 0;

    // Optimistic answer state
    const newAnswerData = {
      selectedId: optId,
      isCorrect: localIsCorrect,
      pointsAwarded: pts,
    };

    setAnswers(prev => ({ ...prev, [q.id]: newAnswerData }));
    setTotalPointsEarned(prev => prev + pts);
    if (localIsCorrect) {
      setCorrectCount(prev => prev + 1);
    } else {
      setIncorrectCount(prev => prev + 1);
    }
    setTotalEngaged(prev => prev + 1);

    // Save to localStorage so this question is never re-asked
    try {
      localStorage.setItem(`answered_quiz_${item.id}_${q.id}`, JSON.stringify(newAnswerData));
    } catch {}

    // Post to Leaderboard API & Vote API in parallel
    try {
      const [voteRes, lbRes] = await Promise.all([
        fetch(`/api/engagements/${item.id}/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selectedOptionId: optId,
            questionId: q.id,
            userId: propUserId,
            userName: propUserName,
            userAvatar: propUserAvatar,
          }),
        }),
        fetch(`/api/engagements/quiz/leaderboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quizId: item.id,
            questionId: q.id,
            selectedOptionId: optId,
            isCorrect: localIsCorrect,
            pointsEarned: pts,
            userId: propUserId,
            userName: propUserName,
            userAvatar: propUserAvatar,
          }),
        }),
      ]);

      const data = await voteRes.json();
      if (data.success && onAnswerSuccess) {
        onAnswerSuccess(data);
      }
    } catch (err) {
      console.warn("Quiz vote sync notice:", err);
    } finally {
      setSubmittingQId(null);
    }
  }

  // Like handler
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

  // Share handler
  async function handleShare() {
    setSharesCount(prev => prev + 1);
    setTotalEngaged(prev => prev + 1);
    fetch(`/api/engagements/${item.id}/share`, { method: "POST" }).catch(() => {});

    const text = `Can you solve this live sports quiz? "${item.title}" on SportsFan360!`;
    if (navigator.share) {
      navigator.share({ title: item.title, text, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Quiz link copied! Share with friends.");
    }
  }

  return (
    <div
      style={{
        background: "linear-gradient(180deg, #0b101b 0%, #070a12 100%)",
        border: "1px solid #1a2333",
        borderRadius: 16,
        padding: "20px 22px",
        color: "#ffffff",
        maxWidth: 600,
        margin: "0 auto 18px auto",
        boxShadow: "0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "relative",
      }}
    >
      {/* Top Header & Tab Switcher */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {/* Left Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              background: "rgba(163, 113, 247, 0.15)",
              color: "#d2a8ff",
              border: "1px solid rgba(163, 113, 247, 0.3)",
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: ".04em",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            🧠 LIVE QUIZ
          </span>

          <span
            style={{
              background: "rgba(227, 179, 65, 0.15)",
              color: "#e3b341",
              border: "1px solid rgba(227, 179, 65, 0.3)",
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            ⭐ {totalPointsEarned > 0 ? `${totalPointsEarned} PTS EARNED` : `${currentQuestion?.pointsReward || 50} PTS/Q`}
          </span>
        </div>

        {/* Right Tab Toggle (Quiz vs Leaderboard) */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => setActiveTab("quiz")}
            style={{
              background: activeTab === "quiz" ? "#21262d" : "transparent",
              color: activeTab === "quiz" ? "#58a6ff" : "#8b949e",
              border: `1px solid ${activeTab === "quiz" ? "#388bfd" : "#30363d"}`,
              borderRadius: 8,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all .15s ease",
            }}
          >
            ⚡ Quiz
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            style={{
              background: activeTab === "leaderboard" ? "#21262d" : "transparent",
              color: activeTab === "leaderboard" ? "#e3b341" : "#8b949e",
              border: `1px solid ${activeTab === "leaderboard" ? "#e3b341" : "#30363d"}`,
              borderRadius: 8,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "all .15s ease",
            }}
          >
            🏆 Leaderboard
          </button>
        </div>
      </div>

      {/* ─── TAB 1: SINGLE QUESTION DISPLAY (FREQUENCY INTERVAL) ──────────── */}
      {activeTab === "quiz" && (
        <div>
          {/* Main Title */}
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 12px 0", color: "#f0f6fc", letterSpacing: "-0.01em" }}>
            {item.title}
          </h2>

          {/* Progress & Live Frequency Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "rgba(22, 30, 46, 0.6)",
              border: "1px solid #1f2a3e",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 14,
              fontSize: 12,
            }}
          >
            <div style={{ color: "#a5d6ff", fontWeight: 700 }}>
              Question {currentSlotIndex + 1} of {questions.length}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#3fb950", fontWeight: 700, fontSize: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950", display: "inline-block" }} />
              <span>Next in: {formattedCountdown} (every {frequencyMinutes}m)</span>
            </div>
          </div>

          {/* Check if current single question was already answered */}
          {isCurrentQuestionAnswered ? (
            /* Question Already Answered State -> Don't show again, show result & live countdown */
            <div
              style={{
                background: answers[currentQuestion.id]?.isCorrect
                  ? "rgba(46, 160, 67, 0.12)"
                  : "rgba(218, 54, 51, 0.12)",
                border: `1.5px solid ${answers[currentQuestion.id]?.isCorrect ? "#2ea043" : "#da3633"}`,
                borderRadius: 12,
                padding: "20px",
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>
                {answers[currentQuestion.id]?.isCorrect ? "🎉" : "💡"}
              </div>
              <h3
                style={{
                  margin: "0 0 6px 0",
                  fontSize: 16,
                  fontWeight: 800,
                  color: answers[currentQuestion.id]?.isCorrect ? "#3fb950" : "#ff7b72",
                }}
              >
                {answers[currentQuestion.id]?.isCorrect
                  ? `Correct! +${answers[currentQuestion.id]?.pointsAwarded || 50} Points Earned`
                  : "Question Answered!"}
              </h3>
              <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "#c9d1d9" }}>
                {currentQuestion.explanation || `Correct Answer: Option ${currentQuestion.correctOptionId}`}
              </p>

              {/* Countdown to Next Question Slot */}
              {currentSlotIndex < questions.length - 1 ? (
                <div
                  style={{
                    background: "#080c14",
                    border: "1px solid #1f2a3e",
                    borderRadius: 8,
                    padding: "12px 16px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    color: "#8b949e",
                  }}
                >
                  <span>⏱️ Next Question unlocks in:</span>
                  <strong style={{ color: "#58a6ff", fontSize: 15, fontFamily: "monospace" }}>
                    {formattedCountdown}
                  </strong>
                </div>
              ) : (
                <div style={{ color: "#e3b341", fontWeight: 700, fontSize: 14 }}>
                  🏆 All {questions.length} Questions Completed! Check your ranking in the Leaderboard!
                </div>
              )}
            </div>
          ) : (
            /* Unanswered Active Single Question Renderer */
            <SingleQuestionRenderer
              question={currentQuestion}
              index={currentSlotIndex}
              answer={answers[currentQuestion?.id]}
              onSelect={optId => handleOptionSelect(currentQuestion, optId)}
              isSubmitting={submittingQId === currentQuestion?.id}
            />
          )}
        </div>
      )}

      {/* ─── TAB 2: LIVE LEADERBOARD ──────────────────────────────────────── */}
      {activeTab === "leaderboard" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#f0f6fc" }}>
                🏆 Quiz Live Leaderboard
              </h3>
              <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "#8b949e" }}>
                Rankings based on total points & correct answers
              </p>
            </div>
            <button
              onClick={fetchLeaderboard}
              style={{
                background: "#21262d",
                border: "1px solid #30363d",
                color: "#c9d1d9",
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              🔄 Refresh
            </button>
          </div>

          {/* Current User Snapshot Card */}
          <div
            style={{
              background: "linear-gradient(90deg, rgba(31, 111, 235, 0.15) 0%, rgba(137, 87, 229, 0.15) 100%)",
              border: "1px solid rgba(56, 139, 253, 0.4)",
              borderRadius: 10,
              padding: "12px 16px",
              marginBottom: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: "#1f6feb",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {currentUserEntry ? `#${currentUserEntry.rank}` : "👤"}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ffffff" }}>
                  {currentUserEntry?.userName || propUserName || "You"} (Your Rank)
                </div>
                <div style={{ fontSize: 11, color: "#8b949e" }}>
                  ✓ {correctCount} Correct · ✕ {incorrectCount} Incorrect
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "#e3b341" }}>
                {totalPointsEarned || currentUserEntry?.totalPoints || 0} PTS
              </div>
              <div style={{ fontSize: 11, color: "#3fb950", fontWeight: 700 }}>
                {correctCount + incorrectCount > 0
                  ? `${Math.round((correctCount / (correctCount + incorrectCount)) * 100)}% Accuracy`
                  : "0% Accuracy"}
              </div>
            </div>
          </div>

          {/* Leaderboard Rankings List */}
          {loadingLeaderboard ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#8b949e", fontSize: 13 }}>
              Loading leaderboard rankings...
            </div>
          ) : leaderboard.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "#8b949e", fontSize: 13 }}>
              No participants yet. Be the first to answer and climb the board!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {leaderboard.map(entry => {
                const isTop1 = entry.rank === 1;
                const isTop2 = entry.rank === 2;
                const isTop3 = entry.rank === 3;
                const rankColor = isTop1 ? "#ffd700" : isTop2 ? "#c0c0c0" : isTop3 ? "#cd7f32" : "#8b949e";
                const medal = isTop1 ? "🥇" : isTop2 ? "🥈" : isTop3 ? "🥉" : `#${entry.rank}`;

                return (
                  <div
                    key={entry.userId}
                    style={{
                      background: entry.userId === propUserId ? "rgba(56, 139, 253, 0.1)" : "#0d131f",
                      border: `1px solid ${entry.userId === propUserId ? "rgba(56, 139, 253, 0.4)" : "#1b2536"}`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: rankColor, width: 24, textAlign: "center" }}>
                        {medal}
                      </span>
                      <img
                        src={entry.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`}
                        alt={entry.userName}
                        style={{ width: 30, height: 30, borderRadius: "50%", background: "#21262d" }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc" }}>
                          {entry.userName}
                        </div>
                        <div style={{ fontSize: 11, color: "#6e7681" }}>
                          ✓ {entry.correctCount} Correct · ✕ {entry.incorrectCount} Incorrect
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: "#e3b341" }}>
                        {entry.totalPoints} PTS
                      </span>
                      <div style={{ fontSize: 10, color: "#3fb950", fontWeight: 600 }}>
                        {entry.accuracy || "100%"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Footer with Like, Share, and Engagement Stats ─────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 18,
          paddingTop: 12,
          borderTop: "1px solid #161e2e",
          fontSize: 12,
          color: "#7d8590",
        }}
      >
        <div style={{ display: "flex", gap: 16 }}>
          <button
            onClick={handleLike}
            style={{
              background: "none",
              border: "none",
              color: liked ? "#ff6b6b" : "#7d8590",
              display: "flex",
              alignItems: "center",
              gap: 5,
              cursor: "pointer",
              fontSize: 12,
              transition: "transform .15s ease",
              transform: liked ? "scale(1.08)" : "scale(1)",
            }}
          >
            <span>{liked ? "❤️" : "🤍"}</span> {likesCount.toLocaleString()}
          </button>
          <button
            onClick={handleShare}
            style={{
              background: "none",
              border: "none",
              color: "#7d8590",
              display: "flex",
              alignItems: "center",
              gap: 5,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <span>🔗</span> Share {sharesCount > 0 ? `(${sharesCount})` : ""}
          </button>
        </div>
        <div>
          {totalEngaged.toLocaleString()} engaged · ⭐ {totalPointsEarned} pts scored
        </div>
      </div>
    </div>
  );
}

// ─── Sub-Component: Single Question Card Renderer ───────────────────────────
interface QuestionRendererProps {
  question: QuizQuestion;
  index: number;
  answer?: { selectedId: string; isCorrect: boolean; pointsAwarded: number };
  onSelect: (optionId: string) => void;
  isSubmitting?: boolean;
}

function SingleQuestionRenderer({
  question,
  index,
  answer,
  onSelect,
  isSubmitting,
}: QuestionRendererProps) {
  const answered = !!answer;
  const isCorrect = answer?.isCorrect;
  const selectedId = answer?.selectedId;

  return (
    <div
      style={{
        background: "#080c14",
        border: "1px solid #161e2e",
        borderRadius: 12,
        padding: "16px",
      }}
    >
      {/* Question Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#58a6ff" }}>
          QUESTION {index + 1}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#e3b341" }}>
          +{question.pointsReward || 50} PTS
        </span>
      </div>

      {/* Question Text */}
      <div style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3", marginBottom: 14, lineHeight: 1.4 }}>
        {question.question}
      </div>

      {/* 2x2 Options Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {(question.options || []).map((opt: QuizOption) => {
          const isSelected = selectedId === opt.id;
          const isThisCorrect = opt.id.toUpperCase() === question.correctOptionId.toUpperCase();

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
              onClick={() => onSelect(opt.id)}
              disabled={answered || isSubmitting}
              style={{
                background: bg,
                border: border,
                borderRadius: 8,
                padding: "12px 14px",
                color: textColor,
                fontSize: 13,
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
            padding: "10px 12px",
            marginTop: 12,
            fontSize: 12,
            fontWeight: 700,
            color: isCorrect ? "#3fb950" : "#ff7b72",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>{isCorrect ? "✓" : "✕"}</span>
          <span>
            {isCorrect
              ? `Correct! +${question.pointsReward || 50} Points Added`
              : question.explanation || `Correct Answer: Option ${question.correctOptionId}`}
          </span>
        </div>
      )}
    </div>
  );
}
