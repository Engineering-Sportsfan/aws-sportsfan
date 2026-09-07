"use client";

import { useEffect, useState, useCallback } from "react";
import { EngagementItem, EngagementType, QuizOption, QuizLeaderboardEntry } from "@/types/engagements";

interface AdminQuizQuestion {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOptionId: string;
  pointsReward: number;
  explanation: string;
}

export default function EngagementsManagementPage() {
  const [activeTab, setActiveTab] = useState<"list" | "leaderboard" | "fan_battle" | "quiz" | "poll" | "prediction">("list");
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingItem, setEditingItem] = useState<EngagementItem | null>(null);

  // ── General Form State ───────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [sport, setSport] = useState("cricket");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  // Fan Battle state
  const [fbLeftCode, setFbLeftCode] = useState("IN");
  const [fbLeftName, setFbLeftName] = useState("Virat Kohli");
  const [fbLeftStat, setFbLeftStat] = useState("Avg 58.6 in Tests");
  const [fbRightCode, setFbRightCode] = useState("PK");
  const [fbRightName, setFbRightName] = useState("Babar Azam");
  const [fbRightStat, setFbRightStat] = useState("Avg 44.8 in Tests");

  // Multi-Question Quiz State with Starting Time & Frequency
  const [quizStartTime, setQuizStartTime] = useState<string>("");
  const [quizFrequencyMinutes, setQuizFrequencyMinutes] = useState<number>(10);
  const [quizQuestions, setQuizQuestions] = useState<AdminQuizQuestion[]>([
    {
      id: "q_1",
      question: "How many Test centuries has Virat Kohli scored?",
      optionA: "27",
      optionB: "29",
      optionC: "30",
      optionD: "32",
      correctOptionId: "B",
      pointsReward: 50,
      explanation: "Virat Kohli scored his 29th Test hundred against West Indies.",
    },
  ]);

  // Poll state
  const [pollQuestion, setPollQuestion] = useState("Who takes more wickets in Galle?");
  const [pollOptions, setPollOptions] = useState<string[]>([
    "Jasprit Bumrah 🏏",
    "Maheesh Theekshana 🌀",
    "Ravindra Jadeja 🍌",
  ]);

  // Prediction state
  const [predQuestion, setPredQuestion] = useState("India win the 1st Galle Test?");
  const [predLeftText, setPredLeftText] = useState("Yes, India win");
  const [predLeftCode, setPredLeftCode] = useState("IN");
  const [predRightText, setPredRightText] = useState("SL hold / win");
  const [predRightCode, setPredRightCode] = useState("LK");
  const [predCoinStake, setPredCoinStake] = useState(25);

  // ── Leaderboard Tab State ────────────────────────────────────────────────────
  const [leaderboardData, setLeaderboardData] = useState<QuizLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [selectedLeaderboardQuizId, setSelectedLeaderboardQuizId] = useState<string>("global");
  const [leaderboardSearch, setLeaderboardSearch] = useState<string>("");

  useEffect(() => {
    fetchEngagements();
  }, [typeFilter]);

  async function fetchEngagements() {
    setLoading(true);
    try {
      const res = await fetch(`/api/engagements?type=${typeFilter}`);
      const data = await res.json();
      setEngagements(data.engagements || []);
    } catch {
      setEngagements([]);
    } finally {
      setLoading(false);
    }
  }

  // Fetch Leaderboard for Admin Tab
  const fetchAdminLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const quizParam = selectedLeaderboardQuizId === "global" ? "" : `?quizId=${selectedLeaderboardQuizId}&limit=100`;
      const res = await fetch(`/api/engagements/quiz/leaderboard${quizParam}`);
      const data = await res.json();
      if (data.success) {
        setLeaderboardData(data.leaderboard || []);
      } else {
        setLeaderboardData([]);
      }
    } catch (err) {
      console.warn("Failed to fetch admin leaderboard:", err);
      setLeaderboardData([]);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [selectedLeaderboardQuizId]);

  useEffect(() => {
    if (activeTab === "leaderboard") {
      fetchAdminLeaderboard();
    }
  }, [activeTab, fetchAdminLeaderboard]);

  function handleOpenCreate(type: EngagementType) {
    setEditingItem(null);
    setActiveTab(type);
    if (type === "fan_battle") setTitle("Fan Battle · Who wins your vote?");
    else if (type === "quiz") {
      setTitle("Quick Live Cricket Quiz");
      setQuizStartTime("");
      setQuizFrequencyMinutes(10);
      setQuizQuestions([
        {
          id: "q_1",
          question: "How many Test centuries has Virat Kohli scored?",
          optionA: "27",
          optionB: "29",
          optionC: "30",
          optionD: "32",
          correctOptionId: "B",
          pointsReward: 50,
          explanation: "Virat Kohli scored his 29th Test hundred against West Indies.",
        },
      ]);
    } else if (type === "poll") setTitle("Who takes more wickets in Galle?");
    else if (type === "prediction") setTitle("Predict the outcome!");
  }

  function handleEdit(item: EngagementItem) {
    setEditingItem(item);
    setActiveTab(item.type);
    setTitle(item.title);
    setSubtitle(item.subtitle || "");
    setSport(item.sport || "cricket");
    setStatus(item.status === "active" ? "active" : "inactive");

    if (item.type === "fan_battle" && item.fanBattleData) {
      setFbLeftCode(item.fanBattleData.leftCompetitor.code);
      setFbLeftName(item.fanBattleData.leftCompetitor.name);
      setFbLeftStat(item.fanBattleData.leftCompetitor.stat);
      setFbRightCode(item.fanBattleData.rightCompetitor.code);
      setFbRightName(item.fanBattleData.rightCompetitor.name);
      setFbRightStat(item.fanBattleData.rightCompetitor.stat);
    } else if (item.type === "quiz" && item.quizData) {
      // Start Time
      if (item.quizData.startTime || item.quizData.scheduledStartTime) {
        try {
          const d = new Date(Number(item.quizData.startTime || item.quizData.scheduledStartTime));
          const pad = (n: number) => String(n).padStart(2, "0");
          setQuizStartTime(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        } catch {
          setQuizStartTime("");
        }
      } else {
        setQuizStartTime("");
      }

      // Frequency
      setQuizFrequencyMinutes(item.quizData.frequencyMinutes || 10);

      // Questions array
      if (item.quizData.questions && item.quizData.questions.length > 0) {
        setQuizQuestions(
          item.quizData.questions.map((q, idx) => ({
            id: q.id || `q_${idx + 1}`,
            question: q.question || "",
            optionA: q.options?.[0]?.text || "",
            optionB: q.options?.[1]?.text || "",
            optionC: q.options?.[2]?.text || "",
            optionD: q.options?.[3]?.text || "",
            correctOptionId: q.correctOptionId || "B",
            pointsReward: q.pointsReward || 50,
            explanation: q.explanation || "",
          }))
        );
      } else {
        setQuizQuestions([
          {
            id: "q_1",
            question: item.quizData.question || item.title || "",
            optionA: item.quizData.options?.[0]?.text || "",
            optionB: item.quizData.options?.[1]?.text || "",
            optionC: item.quizData.options?.[2]?.text || "",
            optionD: item.quizData.options?.[3]?.text || "",
            correctOptionId: item.quizData.correctOptionId || "B",
            pointsReward: item.quizData.pointsReward || 50,
            explanation: item.quizData.explanation || "",
          },
        ]);
      }
    } else if (item.type === "poll" && item.pollData) {
      setPollQuestion(item.pollData.question);
      setPollOptions(item.pollData.options.map(o => o.text));
    } else if (item.type === "prediction" && item.predictionData) {
      setPredQuestion(item.predictionData.question);
      setPredLeftText(item.predictionData.leftChoice.text);
      setPredLeftCode(item.predictionData.leftChoice.code || "");
      setPredRightText(item.predictionData.rightChoice.text);
      setPredRightCode(item.predictionData.rightChoice.code || "");
      setPredCoinStake(item.predictionData.coinStake || 25);
    }
  }

  // Quiz Question Array Helpers
  function handleAddQuizQuestion() {
    setQuizQuestions(prev => [
      ...prev,
      {
        id: `q_${Date.now()}_${prev.length + 1}`,
        question: "",
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        correctOptionId: "A",
        pointsReward: 50,
        explanation: "",
      },
    ]);
  }

  function handleRemoveQuizQuestion(index: number) {
    if (quizQuestions.length <= 1) {
      alert("At least one quiz question is required.");
      return;
    }
    setQuizQuestions(prev => prev.filter((_, i) => i !== index));
  }

  function handleUpdateQuizQuestion(index: number, field: keyof AdminQuizQuestion, value: any) {
    setQuizQuestions(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      let payload: any = {
        type: activeTab,
        title,
        subtitle,
        sport,
        status,
      };

      if (activeTab === "fan_battle") {
        payload.tags = ["⚔️ FAN BATTLE", "🔥 TRENDING"];
        payload.fanBattleData = {
          leftCompetitor: { code: fbLeftCode, name: fbLeftName, stat: fbLeftStat, votes: 0 },
          rightCompetitor: { code: fbRightCode, name: fbRightName, stat: fbRightStat, votes: 0 },
          totalVotes: 0,
        };
      } else if (activeTab === "quiz") {
        const startMs = quizStartTime ? new Date(quizStartTime).getTime() : Date.now();
        const formattedQuestions = quizQuestions.map((q, idx) => ({
          id: q.id || `q_${idx + 1}`,
          question: q.question,
          options: [
            { id: "A", text: q.optionA },
            { id: "B", text: q.optionB },
            { id: "C", text: q.optionC },
            { id: "D", text: q.optionD },
          ],
          correctOptionId: q.correctOptionId,
          pointsReward: Number(q.pointsReward) || 50,
          explanation: q.explanation,
        }));

        payload.tags = [
          "🧠 QUIZ",
          `⭐ ${formattedQuestions[0]?.pointsReward || 50} PTS/Q`,
          `⏱️ ${quizFrequencyMinutes}m`,
        ];

        payload.quizData = {
          startTime: startMs,
          scheduledStartTime: startMs,
          frequencyMinutes: Number(quizFrequencyMinutes) || 10,
          questions: formattedQuestions,
          // Backwards compatibility for single-question readers
          question: formattedQuestions[0]?.question || title,
          options: formattedQuestions[0]?.options || [],
          correctOptionId: formattedQuestions[0]?.correctOptionId || "B",
          pointsReward: Number(formattedQuestions[0]?.pointsReward) || 50,
          explanation: formattedQuestions[0]?.explanation || "",
        };
      } else if (activeTab === "poll") {
        payload.tags = ["📊 POLL"];
        payload.pollData = {
          question: pollQuestion,
          options: pollOptions.filter(o => o.trim()).map((optText, idx) => ({
            id: String(idx + 1),
            text: optText,
            votes: 0,
          })),
          totalVotes: 0,
        };
      } else if (activeTab === "prediction") {
        payload.tags = ["🎯 PREDICTION", "💎 POINTS"];
        payload.predictionData = {
          question: predQuestion,
          leftChoice: { id: "left", text: predLeftText, code: predLeftCode, votes: 0 },
          rightChoice: { id: "right", text: predRightText, code: predRightCode, votes: 0 },
          coinStake: Number(predCoinStake),
          totalVotes: 0,
          status: "open",
        };
      }

      const url = editingItem ? `/api/engagements/${editingItem.id}` : "/api/engagements";
      const method = editingItem ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save engagement");

      alert(editingItem ? "Updated successfully!" : "Created successfully!");
      setActiveTab("list");
      fetchEngagements();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this engagement item?")) return;
    try {
      await fetch(`/api/engagements/${id}`, { method: "DELETE" });
      setEngagements(prev => prev.filter(item => item.id !== id));
    } catch {
      alert("Failed to delete");
    }
  }

  async function handleToggleStatus(item: EngagementItem) {
    const nextStatus = item.status === "active" ? "inactive" : "active";
    try {
      await fetch(`/api/engagements/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      setEngagements(prev =>
        prev.map(i => (i.id === item.id ? { ...i, status: nextStatus } : i))
      );
    } catch {
      alert("Failed to toggle status");
    }
  }

  const filtered = engagements.filter(
    i =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      (i.subtitle || "").toLowerCase().includes(search.toLowerCase()) ||
      i.type.toLowerCase().includes(search.toLowerCase())
  );

  const quizEngagements = engagements.filter(i => i.type === "quiz");

  const filteredLeaderboard = leaderboardData.filter(
    entry =>
      entry.userName.toLowerCase().includes(leaderboardSearch.toLowerCase()) ||
      (entry.userEmail || "").toLowerCase().includes(leaderboardSearch.toLowerCase()) ||
      entry.userId.toLowerCase().includes(leaderboardSearch.toLowerCase())
  );

  // Leaderboard Statistics
  const totalParticipants = leaderboardData.length;
  const totalPointsDistributed = leaderboardData.reduce((acc, curr) => acc + (curr.totalPoints || 0), 0);
  const totalQuestionsAnswered = leaderboardData.reduce((acc, curr) => acc + (curr.totalAnswered || 0), 0);
  const topScorer = leaderboardData[0] || null;

  return (
    <div style={{ padding: "20px", color: "#e6edf3", maxWidth: 1250, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            ⚡ Interactive Engagements & Leaderboard Manager
          </h1>
          <p style={{ color: "#8b949e", fontSize: 13, marginTop: 4 }}>
            Create & manage Fan Battles, Multi-Question Quizzes, Polls, Predictions & view Live Leaderboards
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setActiveTab("leaderboard")}
            style={{
              background: activeTab === "leaderboard" ? "#e3b341" : "#21262d",
              color: activeTab === "leaderboard" ? "#000000" : "#e3b341",
              border: "1px solid #e3b341",
              padding: "8px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            🏆 Live Leaderboard
          </button>
          <button
            onClick={() => handleOpenCreate("fan_battle")}
            style={{
              background: "#238636", color: "#fff", padding: "8px 14px", borderRadius: 6,
              fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            + ⚔️ Fan Battle
          </button>
          <button
            onClick={() => handleOpenCreate("quiz")}
            style={{
              background: "#8957e5", color: "#fff", padding: "8px 14px", borderRadius: 6,
              fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            + 🧠 Multi-Question Quiz
          </button>
          <button
            onClick={() => handleOpenCreate("poll")}
            style={{
              background: "#1f6feb", color: "#fff", padding: "8px 14px", borderRadius: 6,
              fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            + 📊 Poll
          </button>
          <button
            onClick={() => handleOpenCreate("prediction")}
            style={{
              background: "#d29922", color: "#000", padding: "8px 14px", borderRadius: 6,
              fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
            }}
          >
            + 🎯 Prediction
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #30363d", paddingBottom: 10, marginBottom: 20 }}>
        {[
          { id: "list", label: "📋 All Engagements" },
          { id: "leaderboard", label: "🏆 Quiz Leaderboard" },
          { id: "fan_battle", label: "⚔️ Fan Battle Creator" },
          { id: "quiz", label: "🧠 Multi-Question Quiz Creator" },
          { id: "poll", label: "📊 Poll Creator" },
          { id: "prediction", label: "🎯 Prediction Creator" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              if (tab.id !== "list" && tab.id !== "leaderboard") setEditingItem(null);
            }}
            style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: activeTab === tab.id ? (tab.id === "leaderboard" ? "#e3b341" : "#388bfd") : "transparent",
              color: activeTab === tab.id ? (tab.id === "leaderboard" ? "#000" : "#fff") : "#8b949e",
              border: "1px solid",
              borderColor: activeTab === tab.id ? (tab.id === "leaderboard" ? "#e3b341" : "#388bfd") : "transparent",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: ENGAGEMENTS LIST ─────────────────────────────────────────── */}
      {activeTab === "list" && (
        <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
          {/* Toolbar */}
          <div style={{ padding: 12, display: "flex", gap: 10, borderBottom: "1px solid #30363d", alignItems: "center", flexWrap: "wrap" }}>
            <input
              placeholder="Search engagements…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                background: "#0d1117", border: "1px solid #30363d", borderRadius: 6,
                color: "#e6edf3", padding: "6px 12px", fontSize: 12, width: 250, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "fan_battle", "quiz", "poll", "prediction"].map(t => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  style={{
                    background: typeFilter === t ? "#21262d" : "transparent",
                    color: typeFilter === t ? "#58a6ff" : "#8b949e",
                    border: "1px solid",
                    borderColor: typeFilter === t ? "#58a6ff" : "#30363d",
                    borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {t.replace("_", " ")}
                </button>
              ))}
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12, color: "#8b949e" }}>
              Total: {filtered.length}
            </div>
          </div>

          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#1c2128", borderBottom: "1px solid #30363d", color: "#8b949e", textAlign: "left" }}>
                <th style={{ padding: "10px 14px" }}>Type</th>
                <th style={{ padding: "10px 14px" }}>Title / Question</th>
                <th style={{ padding: "10px 14px" }}>Details & Timing</th>
                <th style={{ padding: "10px 14px" }}>Engaged</th>
                <th style={{ padding: "10px 14px" }}>Status</th>
                <th style={{ padding: "10px 14px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 30, textAlign: "center", color: "#8b949e" }}>
                    Loading engagements…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
                    No engagement items found. Click one of the "+ Creator" buttons above to add your first one!
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  let typeBadgeBg = "rgba(56, 139, 253, 0.15)";
                  let typeBadgeColor = "#58a6ff";
                  if (item.type === "fan_battle") { typeBadgeBg = "rgba(46, 160, 67, 0.15)"; typeBadgeColor = "#3fb950"; }
                  else if (item.type === "quiz") { typeBadgeBg = "rgba(163, 113, 247, 0.15)"; typeBadgeColor = "#d2a8ff"; }
                  else if (item.type === "prediction") { typeBadgeBg = "rgba(210, 153, 34, 0.15)"; typeBadgeColor = "#e3b341"; }

                  const totalQuestions = item.quizData?.questions?.length || (item.quizData?.question ? 1 : 0);

                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid #21262d" }}>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{
                          padding: "3px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700,
                          background: typeBadgeBg, color: typeBadgeColor, textTransform: "uppercase",
                        }}>
                          {item.type.replace("_", " ")}
                        </span>
                      </td>

                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "#f0f6fc" }}>
                        {item.title}
                        {item.quizData && (
                          <div style={{ fontSize: 11, color: "#8b949e" }}>
                            {totalQuestions} Question{totalQuestions !== 1 ? "s" : ""} · {item.quizData.question || item.quizData.questions?.[0]?.question}
                          </div>
                        )}
                        {item.pollData?.question && <div style={{ fontSize: 11, color: "#8b949e" }}>{item.pollData.question}</div>}
                        {item.predictionData?.question && <div style={{ fontSize: 11, color: "#8b949e" }}>{item.predictionData.question}</div>}
                      </td>

                      <td style={{ padding: "10px 14px", color: "#8b949e", fontSize: 11 }}>
                        {item.type === "fan_battle" && (
                          <span>{item.fanBattleData?.leftCompetitor.name} vs {item.fanBattleData?.rightCompetitor.name}</span>
                        )}
                        {item.type === "quiz" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <span style={{ color: "#d2a8ff" }}>
                              🧠 {totalQuestions} Qs · ⏱️ Every {item.quizData?.frequencyMinutes || 10} mins
                            </span>
                            {item.quizData?.startTime && (
                              <span style={{ color: "#8b949e", fontSize: 10 }}>
                                📅 Starts: {new Date(item.quizData.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                        )}
                        {item.type === "poll" && (
                          <span>{item.pollData?.options.length} options</span>
                        )}
                        {item.type === "prediction" && (
                          <span>Stake: {item.predictionData?.coinStake} Coins</span>
                        )}
                      </td>

                      <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#8b949e" }}>
                        🔥 {item.totalEngaged} · ❤️ {item.likes}
                      </td>

                      <td style={{ padding: "10px 14px" }}>
                        <button
                          onClick={() => handleToggleStatus(item)}
                          style={{
                            padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
                            background: item.status === "active" ? "rgba(46,160,67,0.2)" : "rgba(139,148,158,0.2)",
                            color: item.status === "active" ? "#3fb950" : "#8b949e",
                          }}
                        >
                          {item.status === "active" ? "● Active" : "○ Inactive"}
                        </button>
                      </td>

                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => handleEdit(item)}
                            style={{
                              background: "#21262d", border: "1px solid #30363d", color: "#58a6ff",
                              borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            style={{
                              background: "#21262d", border: "1px solid #da3633", color: "#f85149",
                              borderRadius: 4, padding: "3px 8px", fontSize: 11, cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 2: LEADERBOARD LIST ─────────────────────────────────────────── */}
      {activeTab === "leaderboard" && (
        <div>
          {/* Top Metrics Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: "#8b949e", fontWeight: 600 }}>Total Participants</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#58a6ff", marginTop: 4 }}>
                {totalParticipants.toLocaleString()}
              </div>
            </div>

            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: "#8b949e", fontWeight: 600 }}>Total Points Awarded</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#e3b341", marginTop: 4 }}>
                {totalPointsDistributed.toLocaleString()} PTS
              </div>
            </div>

            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: "#8b949e", fontWeight: 600 }}>Total Questions Answered</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#3fb950", marginTop: 4 }}>
                {totalQuestionsAnswered.toLocaleString()}
              </div>
            </div>

            <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: "#8b949e", fontWeight: 600 }}>Top Performer</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#d2a8ff", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span>🥇</span> {topScorer ? `${topScorer.userName} (${topScorer.totalPoints} PTS)` : "None yet"}
              </div>
            </div>
          </div>

          {/* Leaderboard Table Container */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, overflow: "hidden" }}>
            {/* Filter & Search Bar */}
            <div style={{ padding: 14, display: "flex", gap: 12, borderBottom: "1px solid #30363d", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {/* Quiz Selection Filter */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <label style={{ fontSize: 12, color: "#8b949e", fontWeight: 600 }}>Filter by Quiz:</label>
                  <select
                    value={selectedLeaderboardQuizId}
                    onChange={e => setSelectedLeaderboardQuizId(e.target.value)}
                    style={{
                      background: "#0d1117",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      color: "#fff",
                      padding: "6px 12px",
                      fontSize: 12,
                      outline: "none",
                    }}
                  >
                    <option value="global">🌐 All Quizzes (Global Leaderboard)</option>
                    {quizEngagements.map(q => (
                      <option key={q.id} value={q.id}>
                        🧠 {q.title} ({q.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Search Input */}
                <input
                  placeholder="Search user name or ID…"
                  value={leaderboardSearch}
                  onChange={e => setLeaderboardSearch(e.target.value)}
                  style={{
                    background: "#0d1117",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    color: "#e6edf3",
                    padding: "6px 12px",
                    fontSize: 12,
                    width: 240,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#8b949e" }}>
                  Showing {filteredLeaderboard.length} users
                </span>
                <button
                  onClick={fetchAdminLeaderboard}
                  style={{
                    background: "#21262d",
                    border: "1px solid #30363d",
                    color: "#c9d1d9",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  🔄 Refresh Board
                </button>
              </div>
            </div>

            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#1c2128", borderBottom: "1px solid #30363d", color: "#8b949e", textAlign: "left" }}>
                  <th style={{ padding: "12px 14px", width: 80 }}>Rank</th>
                  <th style={{ padding: "12px 14px" }}>User</th>
                  <th style={{ padding: "12px 14px" }}>Total Points</th>
                  <th style={{ padding: "12px 14px" }}>Answers Breakdown</th>
                  <th style={{ padding: "12px 14px" }}>Accuracy</th>
                  <th style={{ padding: "12px 14px" }}>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {loadingLeaderboard ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
                      Loading leaderboard participants…
                    </td>
                  </tr>
                ) : filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#8b949e" }}>
                      No participants found for the selected quiz.
                    </td>
                  </tr>
                ) : (
                  filteredLeaderboard.map(entry => {
                    const isTop1 = entry.rank === 1;
                    const isTop2 = entry.rank === 2;
                    const isTop3 = entry.rank === 3;
                    const rankColor = isTop1 ? "#ffd700" : isTop2 ? "#c0c0c0" : isTop3 ? "#cd7f32" : "#8b949e";
                    const medal = isTop1 ? "🥇 #1" : isTop2 ? "🥈 #2" : isTop3 ? "🥉 #3" : `#${entry.rank}`;

                    const accuracyPct = entry.accuracy || "0%";
                    const lastDate = entry.lastAnsweredAt ? new Date(entry.lastAnsweredAt).toLocaleString() : "Recently";

                    return (
                      <tr key={entry.userId} style={{ borderBottom: "1px solid #21262d" }}>
                        <td style={{ padding: "12px 14px", fontWeight: 900, color: rankColor, fontSize: 13 }}>
                          {medal}
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <img
                              src={entry.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${entry.userId}`}
                              alt={entry.userName}
                              style={{ width: 34, height: 34, borderRadius: "50%", background: "#21262d" }}
                            />
                            <div>
                              <div style={{ fontWeight: 700, color: "#f0f6fc", fontSize: 13 }}>
                                {entry.userName}
                              </div>
                              <div style={{ color: "#6e7681", fontSize: 11 }}>
                                {entry.userEmail || entry.userId}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: "#e3b341" }}>
                            {entry.totalPoints.toLocaleString()} PTS
                          </span>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
                            <span style={{ color: "#3fb950", fontWeight: 700 }}>✓ {entry.correctCount} Correct</span>
                            <span style={{ color: "#8b949e" }}>·</span>
                            <span style={{ color: "#ff7b72", fontWeight: 700 }}>✕ {entry.incorrectCount} Incorrect</span>
                            <span style={{ color: "#8b949e" }}>·</span>
                            <span style={{ color: "#c9d1d9" }}>{entry.totalAnswered} Total</span>
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#3fb950", fontWeight: 700, width: 42 }}>
                              {accuracyPct}
                            </span>
                            <div style={{ width: 80, height: 6, background: "#21262d", borderRadius: 3, overflow: "hidden" }}>
                              <div
                                style={{
                                  width: accuracyPct,
                                  height: "100%",
                                  background: "#3fb950",
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: "12px 14px", color: "#8b949e", fontSize: 11 }}>
                          {lastDate}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3-6: CREATOR FORM TABS ───────────────────────────────────────── */}
      {activeTab !== "list" && activeTab !== "leaderboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 440px", gap: 24 }}>
          {/* Form Area */}
          <form onSubmit={handleSubmit} style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              {editingItem ? "✏️ Edit" : "+ Create New"}{" "}
              {activeTab === "fan_battle" && "⚔️ Fan Battle"}
              {activeTab === "quiz" && "🧠 Multi-Question Live Quiz"}
              {activeTab === "poll" && "📊 Poll"}
              {activeTab === "prediction" && "🎯 Match Prediction"}
            </h2>

            {/* General Fields */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Quiz / Engagement Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. IND vs ENG Match Quiz"
                  required
                  style={{ width: "100%", padding: "7px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 13 }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Sport Category</label>
                <select
                  value={sport}
                  onChange={e => setSport(e.target.value)}
                  style={{ width: "100%", padding: "7px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 13 }}
                >
                  <option value="cricket">Cricket</option>
                  <option value="football">Football</option>
                  <option value="athletics">Athletics</option>
                  <option value="general">General</option>
                </select>
              </div>
            </div>

            {/* ── FAN BATTLE FIELDS ──────────────────────────────────────────────── */}
            {activeTab === "fan_battle" && (
              <div style={{ borderTop: "1px solid #30363d", paddingTop: 14, marginTop: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: "#58a6ff", marginBottom: 10 }}>Left Competitor (e.g. IN / Virat Kohli)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <input placeholder="Code" value={fbLeftCode} onChange={e => setFbLeftCode(e.target.value)} style={{ padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                  <input placeholder="Player/Team Name" value={fbLeftName} onChange={e => setFbLeftName(e.target.value)} style={{ padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                  <input placeholder="Stat (e.g. Avg 58.6)" value={fbLeftStat} onChange={e => setFbLeftStat(e.target.value)} style={{ padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                </div>

                <h3 style={{ fontSize: 13, fontWeight: 600, color: "#58a6ff", marginBottom: 10 }}>Right Competitor (e.g. PK / Babar Azam)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <input placeholder="Code" value={fbRightCode} onChange={e => setFbRightCode(e.target.value)} style={{ padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                  <input placeholder="Player/Team Name" value={fbRightName} onChange={e => setFbRightName(e.target.value)} style={{ padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                  <input placeholder="Stat (e.g. Avg 44.8)" value={fbRightStat} onChange={e => setFbRightStat(e.target.value)} style={{ padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                </div>
              </div>
            )}

            {/* ── MULTI-QUESTION QUIZ FIELDS ───────────────────────────────────────── */}
            {activeTab === "quiz" && (
              <div style={{ borderTop: "1px solid #30363d", paddingTop: 14, marginTop: 14 }}>
                {/* 1. Timing & Frequency Section */}
                <div
                  style={{
                    background: "rgba(137, 87, 229, 0.08)",
                    border: "1px solid rgba(137, 87, 229, 0.25)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    marginBottom: 16,
                  }}
                >
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: "#d2a8ff", margin: "0 0 10px 0", display: "flex", alignItems: "center", gap: 6 }}>
                    ⏱️ Quiz Timing & Question Interval Setup
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, color: "#c9d1d9", display: "block", marginBottom: 4, fontWeight: 600 }}>
                        📅 Starting Time
                      </label>
                      <input
                        type="datetime-local"
                        value={quizStartTime}
                        onChange={e => setQuizStartTime(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          background: "#0d1117",
                          border: "1px solid #30363d",
                          borderRadius: 6,
                          color: "#fff",
                          fontSize: 12,
                        }}
                      />
                      <span style={{ fontSize: 10, color: "#8b949e", display: "block", marginTop: 3 }}>
                        When question #1 unlocks (leave empty for immediate start)
                      </span>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, color: "#c9d1d9", display: "block", marginBottom: 4, fontWeight: 600 }}>
                        ⏳ Question Frequency (Minutes)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={quizFrequencyMinutes}
                        onChange={e => setQuizFrequencyMinutes(Math.max(1, Number(e.target.value)))}
                        placeholder="10"
                        required
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          background: "#0d1117",
                          border: "1px solid #30363d",
                          borderRadius: 6,
                          color: "#fff",
                          fontSize: 12,
                        }}
                      />
                      <span style={{ fontSize: 10, color: "#8b949e", display: "block", marginTop: 3 }}>
                        How much time before the next quiz question shows (e.g. 10 mins)
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Questions List Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", margin: 0 }}>
                    🧠 Quiz Questions ({quizQuestions.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddQuizQuestion}
                    style={{
                      background: "#238636",
                      border: "none",
                      color: "#ffffff",
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    + Add Question
                  </button>
                </div>

                {/* 3. Questions Array Inputs */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {quizQuestions.map((q, qIdx) => (
                    <div
                      key={q.id || qIdx}
                      style={{
                        background: "#0d1117",
                        border: "1px solid #21262d",
                        borderRadius: 8,
                        padding: "14px",
                        position: "relative",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#58a6ff" }}>
                          Question #{qIdx + 1}
                        </span>
                        {quizQuestions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuizQuestion(qIdx)}
                            style={{
                              background: "transparent",
                              border: "1px solid #da3633",
                              color: "#f85149",
                              borderRadius: 4,
                              padding: "2px 8px",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            ✕ Remove
                          </button>
                        )}
                      </div>

                      {/* Question Text */}
                      <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>
                        Question Prompt
                      </label>
                      <input
                        value={q.question}
                        onChange={e => handleUpdateQuizQuestion(qIdx, "question", e.target.value)}
                        placeholder={`e.g. Which team has won the most IPL titles?`}
                        required
                        style={{
                          width: "100%",
                          padding: "7px 10px",
                          background: "#161b22",
                          border: "1px solid #30363d",
                          borderRadius: 6,
                          color: "#fff",
                          fontSize: 12,
                          marginBottom: 10,
                        }}
                      />

                      {/* Options Grid (A, B, C, D) */}
                      <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>
                        Options & Select Correct Answer
                      </label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                        {[
                          { id: "A", field: "optionA" as const },
                          { id: "B", field: "optionB" as const },
                          { id: "C", field: "optionC" as const },
                          { id: "D", field: "optionD" as const },
                        ].map(opt => (
                          <div
                            key={opt.id}
                            style={{
                              display: "flex",
                              gap: 6,
                              alignItems: "center",
                              background: "#161b22",
                              border: `1px solid ${q.correctOptionId === opt.id ? "#2ea043" : "#30363d"}`,
                              borderRadius: 6,
                              padding: "4px 8px",
                            }}
                          >
                            <input
                              type="radio"
                              name={`correct_${qIdx}`}
                              checked={q.correctOptionId === opt.id}
                              onChange={() => handleUpdateQuizQuestion(qIdx, "correctOptionId", opt.id)}
                            />
                            <span style={{ fontSize: 11, fontWeight: 700, color: q.correctOptionId === opt.id ? "#3fb950" : "#8b949e" }}>
                              {opt.id}:
                            </span>
                            <input
                              value={q[opt.field]}
                              onChange={e => handleUpdateQuizQuestion(qIdx, opt.field, e.target.value)}
                              placeholder={`Option ${opt.id}`}
                              required
                              style={{
                                flex: 1,
                                padding: "4px 6px",
                                background: "transparent",
                                border: "none",
                                color: "#fff",
                                fontSize: 12,
                                outline: "none",
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      {/* Points & Explanation */}
                      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
                        <div>
                          <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>
                            Points
                          </label>
                          <input
                            type="number"
                            value={q.pointsReward}
                            onChange={e => handleUpdateQuizQuestion(qIdx, "pointsReward", Number(e.target.value))}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              background: "#161b22",
                              border: "1px solid #30363d",
                              borderRadius: 6,
                              color: "#fff",
                              fontSize: 12,
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>
                            Feedback / Explanation
                          </label>
                          <input
                            value={q.explanation}
                            onChange={e => handleUpdateQuizQuestion(qIdx, "explanation", e.target.value)}
                            placeholder="e.g. Correct answer is Option B because..."
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              background: "#161b22",
                              border: "1px solid #30363d",
                              borderRadius: 6,
                              color: "#fff",
                              fontSize: 12,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Bottom Add Button */}
                <button
                  type="button"
                  onClick={handleAddQuizQuestion}
                  style={{
                    width: "100%",
                    background: "#21262d",
                    border: "1px dashed #388bfd",
                    color: "#58a6ff",
                    borderRadius: 8,
                    padding: "10px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    marginTop: 12,
                  }}
                >
                  + Add Question #{quizQuestions.length + 1}
                </button>
              </div>
            )}

            {/* ── POLL FIELDS ────────────────────────────────────────────────────── */}
            {activeTab === "poll" && (
              <div style={{ borderTop: "1px solid #30363d", paddingTop: 14, marginTop: 14 }}>
                <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Poll Question</label>
                <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} required style={{ width: "100%", padding: "7px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 13, marginBottom: 12 }} />

                <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Poll Options</label>
                {pollOptions.map((opt, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input
                      value={opt}
                      onChange={e => {
                        const copy = [...pollOptions];
                        copy[i] = e.target.value;
                        setPollOptions(copy);
                      }}
                      placeholder={`Option ${i + 1}`}
                      style={{ flex: 1, padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                        style={{ background: "transparent", border: "1px solid #da3633", color: "#f85149", borderRadius: 6, padding: "0 10px", cursor: "pointer" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ""])}
                    style={{ background: "#21262d", border: "1px solid #30363d", color: "#58a6ff", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer", marginTop: 4 }}
                  >
                    + Add Option
                  </button>
                )}
              </div>
            )}

            {/* ── PREDICTION FIELDS ──────────────────────────────────────────────── */}
            {activeTab === "prediction" && (
              <div style={{ borderTop: "1px solid #30363d", paddingTop: 14, marginTop: 14 }}>
                <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Prediction Question</label>
                <input value={predQuestion} onChange={e => setPredQuestion(e.target.value)} required style={{ width: "100%", padding: "7px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 13, marginBottom: 12 }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Option 1</label>
                    <input placeholder="Text (e.g. Yes, India win)" value={predLeftText} onChange={e => setPredLeftText(e.target.value)} required style={{ width: "100%", padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12, marginBottom: 6 }} />
                    <input placeholder="Code (e.g. IN)" value={predLeftCode} onChange={e => setPredLeftCode(e.target.value)} style={{ width: "100%", padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>Option 2</label>
                    <input placeholder="Text (e.g. SL hold / win)" value={predRightText} onChange={e => setPredRightText(e.target.value)} required style={{ width: "100%", padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                    <input placeholder="Code (e.g. LK)" value={predRightCode} onChange={e => setPredRightCode(e.target.value)} style={{ width: "100%", padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: "#8b949e", display: "block", marginBottom: 4 }}>FlipCoin Reward Stake</label>
                  <input type="number" value={predCoinStake} onChange={e => setPredCoinStake(Number(e.target.value))} style={{ width: 140, padding: "6px 10px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: "#238636", color: "#fff", padding: "8px 20px", borderRadius: 6,
                  fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                }}
              >
                {submitting ? "Saving…" : editingItem ? "Update Engagement" : "Publish to Live Feed"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("list")}
                style={{
                  background: "#21262d", color: "#c9d1d9", padding: "8px 14px", borderRadius: 6,
                  fontSize: 13, border: "1px solid #30363d", cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </form>

          {/* ── LIVE PREVIEW CARD ──────────────────────────────────────────────── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#8b949e", marginBottom: 8 }}>
              👁️ Live Frontend Preview
            </div>

            {/* Preview Container matching the exact dark style */}
            <div style={{ background: "#06090e", border: "1px solid #1f242c", borderRadius: 12, padding: 18, color: "#fff" }}>
              {/* Card Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, fontSize: 11, fontWeight: 800 }}>
                  {activeTab === "fan_battle" && (
                    <>
                      <span style={{ color: "#ff7b72" }}>⚔️ FAN BATTLE</span>
                      <span style={{ color: "#e3b341" }}>🔥 TRENDING</span>
                    </>
                  )}
                  {activeTab === "quiz" && (
                    <>
                      <span style={{ color: "#d2a8ff" }}>🧠 LIVE QUIZ</span>
                      <span style={{ color: "#e3b341" }}>⭐ {quizQuestions[0]?.pointsReward || 50} PTS/Q</span>
                    </>
                  )}
                  {activeTab === "poll" && <span style={{ color: "#58a6ff" }}>📊 POLL</span>}
                  {activeTab === "prediction" && (
                    <>
                      <span style={{ color: "#ff7b72" }}>🎯 PREDICTION</span>
                      <span style={{ color: "#58a6ff" }}>💎 POINTS</span>
                    </>
                  )}
                </div>
                <span style={{ fontSize: 10, color: "#8b949e" }}>Live Feed</span>
              </div>

              {/* Title */}
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{title}</div>

              {/* Fan Battle Preview */}
              {activeTab === "fan_battle" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "center", background: "#0d1117", border: "1px solid #21262d", borderRadius: 8, padding: 16 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{fbLeftCode}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{fbLeftName}</div>
                      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>{fbLeftStat}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#8b949e" }}>VS</div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{fbRightCode}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{fbRightName}</div>
                      <div style={{ fontSize: 11, color: "#8b949e", marginTop: 2 }}>{fbRightStat}</div>
                    </div>
                  </div>
                  <button style={{ width: "100%", background: "#161b22", border: "1px solid #30363d", borderRadius: 8, color: "#fff", padding: "10px", fontSize: 12, fontWeight: 600, marginTop: 10, cursor: "pointer" }}>
                    📢 Challenge a Friend
                  </button>
                </div>
              )}

              {/* Quiz Preview */}
              {activeTab === "quiz" && (
                <div>
                  {/* Progress & Frequency Bar Preview */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      background: "rgba(22, 30, 46, 0.6)",
                      border: "1px solid #1f2a3e",
                      borderRadius: 8,
                      padding: "6px 10px",
                      marginBottom: 10,
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: "#a5d6ff", fontWeight: 700 }}>
                      Question 1 of {quizQuestions.length}
                    </span>
                    <span style={{ color: "#3fb950", fontWeight: 700 }}>
                      ⏱️ Unlocks every {quizFrequencyMinutes}m
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: "#c9d1d9", marginBottom: 10, fontWeight: 600 }}>
                    {quizQuestions[0]?.question}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { id: "A", val: quizQuestions[0]?.optionA },
                      { id: "B", val: quizQuestions[0]?.optionB },
                      { id: "C", val: quizQuestions[0]?.optionC },
                      { id: "D", val: quizQuestions[0]?.optionD },
                    ].map(opt => (
                      <div
                        key={opt.id}
                        style={{
                          background: "#0d1117",
                          border: `1px solid ${quizQuestions[0]?.correctOptionId === opt.id ? "#2ea043" : "#30363d"}`,
                          borderRadius: 6,
                          padding: "8px 10px",
                          fontSize: 12,
                          fontWeight: 700,
                          display: "flex",
                          gap: 6,
                          color: quizQuestions[0]?.correctOptionId === opt.id ? "#3fb950" : "#e6edf3",
                        }}
                      >
                        <span style={{ color: "#8b949e" }}>{opt.id}</span>
                        <span>{opt.val}</span>
                      </div>
                    ))}
                  </div>
                  {quizQuestions[0]?.explanation && (
                    <div style={{ background: "rgba(46,160,67,0.12)", border: "1px solid rgba(46,160,67,0.3)", borderRadius: 6, padding: "8px 12px", marginTop: 10, fontSize: 11, color: "#3fb950", fontWeight: 600 }}>
                      💡 {quizQuestions[0]?.explanation}
                    </div>
                  )}
                </div>
              )}

              {/* Poll Preview */}
              {activeTab === "poll" && (
                <div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {pollOptions.map((opt, i) => {
                      const optVotes = editingItem?.pollData?.options?.[i]?.votes || 0;
                      const totalPollVotes = editingItem?.pollData?.totalVotes || 0;
                      const pct = totalPollVotes > 0 ? Math.round((optVotes / totalPollVotes) * 100) : 0;
                      return (
                        <div
                          key={i}
                          style={{
                            background: "#0d1117", border: "1px solid #30363d", borderRadius: 6,
                            padding: "10px 14px", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between",
                          }}
                        >
                          <span>{opt || `Option ${i + 1}`}</span>
                          <span style={{ color: "#3fb950" }}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: "#8b949e", textAlign: "center", marginTop: 10 }}>
                    Thanks for voting · Results based on all SF360 fans
                  </div>
                </div>
              )}

              {/* Prediction Preview */}
              {activeTab === "prediction" && (() => {
                const leftVotes = editingItem?.predictionData?.leftChoice?.votes || 0;
                const rightVotes = editingItem?.predictionData?.rightChoice?.votes || 0;
                const totalPred = leftVotes + rightVotes;
                const leftPct = totalPred > 0 ? Math.round((leftVotes / totalPred) * 100) : 50;
                const rightPct = totalPred > 0 ? 100 - leftPct : 50;
                return (
                  <div>
                    <div style={{ fontSize: 13, color: "#c9d1d9", marginBottom: 10 }}>{predQuestion}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div style={{ border: "2px solid #238636", background: "rgba(35,134,54,0.1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#3fb950" }}>{predLeftText} <span style={{ fontSize: 10 }}>{predLeftCode}</span></div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#3fb950", marginTop: 4 }}>{leftPct}%</div>
                      </div>
                      <div style={{ border: "1px solid #30363d", background: "#0d1117", borderRadius: 8, padding: 12, textAlign: "center" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#c9d1d9" }}>{predRightText} <span style={{ fontSize: 10 }}>{predRightCode}</span></div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#ff7b72", marginTop: 4 }}>{rightPct}%</div>
                      </div>
                    </div>
                    <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "8px", marginTop: 10, textAlign: "center", fontSize: 11, color: "#e3b341", fontWeight: 600 }}>
                      🔒 +{predCoinStake} FlipCoins locked in · Results after match
                    </div>
                  </div>
                );
              })()}

              {/* Card Footer with Dynamic Preview Numbers */}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #21262d", paddingTop: 12, marginTop: 14, fontSize: 12, color: "#8b949e" }}>
                <div style={{ display: "flex", gap: 14 }}>
                  <span>❤️ {editingItem ? editingItem.likes.toLocaleString() : "0"}</span>
                  <span>🔗 Share {editingItem && editingItem.shares > 0 ? `(${editingItem.shares})` : "(0)"}</span>
                </div>
                <div>{editingItem ? editingItem.totalEngaged.toLocaleString() : "0"} engaged</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
