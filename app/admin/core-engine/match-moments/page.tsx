// "use client";

// import React, { useState, useEffect, useCallback, useMemo } from "react";
// import Link from "next/link";
// import { useSearchParams } from "next/navigation";
// import {
//   Trophy,
//   Calendar,
//   Clock,
//   PlusCircle,
//   PlayCircle,
//   CheckCircle2,
//   AlertCircle,
//   RefreshCw,
//   Sparkles,
//   ArrowRight,
//   Shield,
//   Layers,
//   HelpCircle,
//   BarChart2,
//   Target,
//   Scale,
//   Zap,
//   Flame,
//   Award,
//   Check,
//   X,
//   Plus,
//   Trash2,
//   Radio,
//   Eye,
//   Filter,
//   Edit3,
// } from "lucide-react";
// import { MATCH_MOMENTS_LIBRARY, MatchMomentTemplate } from "@/lib/data/matchMomentsData";

// interface MatchOption {
//   match_id: string;
//   team1: string;
//   team2: string;
//   team1_short?: string;
//   team2_short?: string;
//   venue?: string;
//   city?: string;
//   date?: string;
//   time?: string;
//   format?: string;
//   stage?: string;
//   status?: string;
// }

// interface MatchMomentItem {
//   id: string;
//   momentId: string;
//   matchId: string;
//   innings: number;
//   overs: string;
//   score: string;
//   matchOverTimestamp: string;
//   event: string;
//   matchMoment: string;
//   description: string;
//   createdAt: number;
//   status: string;
// }

// interface OptionItem {
//   id: string;
//   text: string;
// }

// interface EngagementItem {
//   id: string;
//   loopId?: string;
//   momentId?: string;
//   matchId?: string;
//   type: "poll" | "prediction" | "express" | "debate" | "question";
//   title: string;
//   subtitle?: string;
//   options: OptionItem[];
//   timerMinutes?: number;
//   durationMinutes?: number;
//   status?: "active" | "pending" | "resolved" | "settled" | string;
//   correctOptionId?: string;
//   winningChoiceId?: string;
//   outcomeWinningChoiceId?: string;
//   outcomeNotes?: string;
//   outcomeResolvedAt?: string;
//   predictionData?: any;
//   debateData?: any;
//   totalVotes?: number;
//   voteDistribution?: Record<string, number>;
//   createdAt?: string | number;
//   expiresAt?: string | number | null;
// }

// function CoreEngineMatchMomentsContent() {
//   const searchParams = useSearchParams();
//   const urlMatchId = searchParams.get("matchId");

//   // Top Tabs: "moments" (Tab 1: Match Moment Form) | "engagements" (Tab 2: Engagement Form & Outcomes)
//   const [activeTab, setActiveTab] = useState<"moments" | "engagements">("moments");

//   // Matches list
//   const [matches, setMatches] = useState<MatchOption[]>([]);
//   const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId || "NZ-IND-2026-T20I-04");
//   const [loadingMatches, setLoadingMatches] = useState(false);

//   // Moments list for selected match
//   const [moments, setMoments] = useState<MatchMomentItem[]>([]);
//   const [loadingMoments, setLoadingMoments] = useState(false);

//   // Engagements list for selected match
//   const [engagements, setEngagements] = useState<EngagementItem[]>([]);
//   const [loadingEngagements, setLoadingEngagements] = useState(false);

//   // Toast / feedback message
//   const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

//   const showToast = (type: "success" | "error", message: string) => {
//     setToast({ type, message });
//     setTimeout(() => setToast(null), 4500);
//   };

//   // ───────────────────────────────────────────────────────────────────────────
//   // TAB 1: MATCH MOMENT FORM STATE
//   // ───────────────────────────────────────────────────────────────────────────
//   const [momentId, setMomentId] = useState<string>("MM-NZ-01");
//   const [innings, setInnings] = useState<1 | 2>(1);
//   const [overs, setOvers] = useState<string>("");
//   const [score, setScore] = useState<string>("");
//   const [matchOverTimestamp, setMatchOverTimestamp] = useState<string>("");
//   const [event, setEvent] = useState<string>("");
//   const [matchMoment, setMatchMoment] = useState<string>("");
//   const [description, setDescription] = useState<string>("");
//   const [isSavingMoment, setIsSavingMoment] = useState(false);
//   const [editingMomentId, setEditingMomentId] = useState<string | null>(null);

//   // ───────────────────────────────────────────────────────────────────────────
//   // TAB 2: ENGAGEMENT FORM STATE
//   // ───────────────────────────────────────────────────────────────────────────
//   const [selectedMomentForEng, setSelectedMomentForEng] = useState<string>("");
//   const [engType, setEngType] = useState<"poll" | "prediction" | "express" | "debate" | "question">("poll");
//   const [loopId, setLoopId] = useState<string>("NZ-10.2");
//   const [engQuestion, setEngQuestion] = useState<string>("Is Phillips' dismissal the turning point of this innings?");
//   const [engTimer, setEngTimer] = useState<number>(4);
//   const [engOptions, setEngOptions] = useState<OptionItem[]>([
//     { id: "1", text: "Yes, India takes full control" },
//     { id: "2", text: "No, NZ batting depth will recover" },
//   ]);
//   const [correctOptionId, setCorrectOptionId] = useState<string>("");
//   const [resolveStatus, setResolveStatus] = useState<"pending" | "active" | "resolved" | "settled">("active");
//   const [isSubmittingEng, setIsSubmittingEng] = useState(false);
//   const [editingEngId, setEditingEngId] = useState<string | null>(null);

//   // ───────────────────────────────────────────────────────────────────────────
//   // OUTCOME SETTLEMENT MODAL STATE
//   // ───────────────────────────────────────────────────────────────────────────
//   const [settleModalItem, setSettleModalItem] = useState<EngagementItem | null>(null);
//   const [selectedWinningId, setSelectedWinningId] = useState<string>("");
//   const [settleNotes, setSettleNotes] = useState<string>("");
//   const [isSettling, setIsSettling] = useState(false);

//   // Live clock ticker for engagement countdowns (Active vs Expired)
//   const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

//   useEffect(() => {
//     const timer = setInterval(() => {
//       setCurrentTime(Date.now());
//     }, 1000);
//     return () => clearInterval(timer);
//   }, []);

//   // Helper to compute live Active/Expired status from timerMinutes / expiresAt
//   const getEngagementTimerStatus = (eng: EngagementItem) => {
//     const timerMins = Number(eng.timerMinutes || eng.durationMinutes || 4);
//     const createdMs =
//       typeof eng.createdAt === "number" && eng.createdAt > 0
//         ? eng.createdAt
//         : eng.createdAt
//         ? new Date(eng.createdAt).getTime()
//         : 0;

//     const expiryMs =
//       eng.expiresAt && Number(eng.expiresAt) > 0
//         ? Number(eng.expiresAt)
//         : createdMs > 0
//         ? createdMs + timerMins * 60 * 1000
//         : null;

//     const isExplicitExpired = eng.status === "expired";
//     const isExpired = isExplicitExpired || (expiryMs !== null && currentTime >= expiryMs);

//     let remainingText = "";
//     if (expiryMs !== null) {
//       if (currentTime < expiryMs) {
//         const diffMs = expiryMs - currentTime;
//         const mins = Math.floor(diffMs / 60000);
//         const secs = Math.floor((diffMs % 60000) / 1000);
//         remainingText = `${mins}m ${secs.toString().padStart(2, "0")}s left`;
//       } else {
//         remainingText = `Timed out (${timerMins}m)`;
//       }
//     } else {
//       remainingText = `${timerMins}m timer`;
//     }

//     return {
//       isExpired,
//       timerMins,
//       remainingText,
//       expiryMs,
//     };
//   };

//   // ───────────────────────────────────────────────────────────────────────────
//   // FETCH MATCHES
//   // ───────────────────────────────────────────────────────────────────────────
//   const fetchMatches = async () => {
//     setLoadingMatches(true);
//     try {
//       const res = await fetch("/api/matches?limit=100");
//       const data = await res.json();
//       if (data.success && Array.isArray(data.data) && data.data.length > 0) {
//         setMatches(data.data);
//         if (!selectedMatchId && data.data[0]) {
//           setSelectedMatchId(data.data[0].match_id || data.data[0].id);
//         }
//       } else {
//         // Fallback default match
//         setMatches([
//           {
//             match_id: "NZ-IND-2026-T20I-04",
//             team1: "New Zealand",
//             team2: "India",
//             venue: "Eden Park",
//             city: "Auckland",
//             date: "2026-10-30",
//             time: "19:00 NZDT",
//             format: "T20",
//             stage: "4th T20I",
//             status: "live",
//           },
//         ]);
//       }
//     } catch (err) {
//       console.warn("Failed to load matches:", err);
//     } finally {
//       setLoadingMatches(false);
//     }
//   };

//   // ───────────────────────────────────────────────────────────────────────────
//   // FETCH MOMENTS FOR CURRENT MATCH
//   // ───────────────────────────────────────────────────────────────────────────
//   const fetchMoments = useCallback(async () => {
//     if (!selectedMatchId) return;
//     setLoadingMoments(true);
//     try {
//       const res = await fetch(`/api/match-moments?matchId=${selectedMatchId}`);
//       const data = await res.json();
//       if (data.success && Array.isArray(data.data)) {
//         setMoments(data.data);
//         if (data.data.length > 0 && !selectedMomentForEng) {
//           setSelectedMomentForEng(data.data[0].momentId);
//         }
//       } else {
//         setMoments([]);
//       }
//     } catch (err) {
//       console.warn("Failed to fetch match moments:", err);
//     } finally {
//       setLoadingMoments(false);
//     }
//   }, [selectedMatchId, selectedMomentForEng]);

//   // ───────────────────────────────────────────────────────────────────────────
//   // FETCH ENGAGEMENTS FOR CURRENT MATCH
//   // ───────────────────────────────────────────────────────────────────────────
//   const fetchEngagements = useCallback(async () => {
//     setLoadingEngagements(true);
//     try {
//       const res = await fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&limit=100`);
//       const data = await res.json();
//       if (data.success && Array.isArray(data.engagements)) {
//         // Filter by selectedMatchId if matchId field exists
//         const filtered = data.engagements.filter((e: any) => !selectedMatchId || !e.matchId || e.matchId === selectedMatchId);
//         setEngagements(filtered);
//       }
//     } catch (err) {
//       console.warn("Failed to fetch engagements:", err);
//     } finally {
//       setLoadingEngagements(false);
//     }
//   }, [selectedMatchId]);

//   useEffect(() => {
//     fetchMatches();
//   }, []);

//   useEffect(() => {
//     if (selectedMatchId) {
//       fetchMoments();
//       fetchEngagements();
//     }
//   }, [selectedMatchId, fetchMoments, fetchEngagements]);

//   // Active match object
//   const activeMatch = useMemo(() => {
//     return (
//       matches.find((m) => (m.match_id || (m as any).id) === selectedMatchId) || {
//         match_id: selectedMatchId,
//         team1: "New Zealand",
//         team1_short: "NZ",
//         team2: "India",
//         team2_short: "IND",
//         venue: "Eden Park",
//         city: "Auckland",
//         date: "2026-10-30",
//         format: "T20",
//         stage: "4th T20I",
//         status: "live",
//       }
//     );
//   }, [matches, selectedMatchId]);

//   // Auto-calculate moment ID based on innings, team code, and moment count:
//   // 1st innings: MM-NZ-01, MM-NZ-02 ... after 4 moments -> MM-NZ-05
//   // 2nd innings: MM-IND-01 ...
//   useEffect(() => {
//     if (editingMomentId) return; // preserve ID during editing

//     const teamCode = (
//       innings === 1
//         ? activeMatch.team1_short || activeMatch.team1.slice(0, 3) || "NZ"
//         : activeMatch.team2_short || activeMatch.team2.slice(0, 3) || "IND"
//     ).toUpperCase();

//     const inningsMoments = moments.filter((m) => Number(m.innings) === innings);
//     const nextCount = (inningsMoments.length + 1).toString().padStart(2, "0");
//     setMomentId(`MM-${teamCode}-${nextCount}`);
//   }, [innings, moments, activeMatch, editingMomentId]);

//   // Standard Loop ID generation supporting multiple engagements per moment:
//   // e.g. For MM-NZ-01: LOOP-NZ-01-01, LOOP-NZ-01-02
//   useEffect(() => {
//     if (editingEngId || !selectedMomentForEng) return;
//     const momentBase = selectedMomentForEng.replace(/^MM-/, "");
//     const existingForMoment = engagements.filter((e) => e.momentId === selectedMomentForEng);
//     const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
//     setLoopId(`LOOP-${momentBase}-${engSeq}`);
//   }, [selectedMomentForEng, engagements, editingEngId]);

//   // Edit moment handler
//   const handleEditMoment = (m: MatchMomentItem) => {
//     setEditingMomentId(m.momentId);
//     setMomentId(m.momentId);
//     setInnings((Number(m.innings) || 1) as 1 | 2);
//     setOvers(m.overs || "");
//     setScore(m.score || "");
//     setMatchOverTimestamp(m.matchOverTimestamp || "");
//     setEvent(m.event || "");
//     setMatchMoment(m.matchMoment || "");
//     setDescription(m.description || "");
//     setActiveTab("moments");
//     showToast("success", `Editing Match Moment ${m.momentId}`);
//     if (typeof window !== "undefined") {
//       window.scrollTo({ top: 0, behavior: "smooth" });
//     }
//   };

//   // Cancel edit moment handler
//   const handleCancelEditMoment = () => {
//     setEditingMomentId(null);
//     setOvers("");
//     setScore("");
//     setMatchOverTimestamp("");
//     setEvent("");
//     setMatchMoment("");
//     setDescription("");
//     const teamCode = (
//       innings === 1
//         ? activeMatch.team1_short || activeMatch.team1.slice(0, 3) || "NZ"
//         : activeMatch.team2_short || activeMatch.team2.slice(0, 3) || "IND"
//     ).toUpperCase();
//     const inningsMoments = moments.filter((m) => Number(m.innings) === innings);
//     const nextCount = (inningsMoments.length + 1).toString().padStart(2, "0");
//     setMomentId(`MM-${teamCode}-${nextCount}`);
//   };

//   // Delete moment handler
//   const handleDeleteMoment = async (momentIdToDelete: string) => {
//     if (!confirm(`Are you sure you want to delete match moment ${momentIdToDelete}? This cannot be undone.`)) return;
//     try {
//       const res = await fetch(`/api/match-moments?momentId=${momentIdToDelete}&matchId=${selectedMatchId}`, {
//         method: "DELETE",
//       });
//       const data = await res.json();
//       if (res.ok && data.success) {
//         showToast("success", `Match moment ${momentIdToDelete} deleted successfully`);
//         if (editingMomentId === momentIdToDelete) {
//           handleCancelEditMoment();
//         }
//         fetchMoments();
//       } else {
//         showToast("error", data.error || "Failed to delete match moment");
//       }
//     } catch (err: any) {
//       showToast("error", err.message || "Failed to delete match moment");
//     }
//   };

//   // Delete engagement handler
//   const handleDeleteEngagement = async (id: string) => {
//     if (!confirm("Are you sure you want to delete this engagement?")) return;
//     try {
//       let res = await fetch(`/api/engagements?id=${encodeURIComponent(id)}&matchId=${encodeURIComponent(selectedMatchId || "")}`, {
//         method: "DELETE",
//       });
//       if (!res.ok) {
//         res = await fetch(`/api/engagements/${encodeURIComponent(id)}?matchId=${encodeURIComponent(selectedMatchId || "")}`, {
//           method: "DELETE",
//         });
//       }
//       const data = await res.json();
//       if (res.ok && data.success) {
//         showToast("success", "Engagement deleted successfully");
//         if (editingEngId === id) {
//           handleCancelEditEngagement();
//         }
//         // Optimistically remove from state immediately
//         setEngagements((prev) => prev.filter((e) => e.id !== id && (e as any).loopId !== id));
//         fetchEngagements();
//       } else {
//         showToast("error", data.error || "Failed to delete engagement");
//       }
//     } catch (err: any) {
//       showToast("error", err.message || "Failed to delete engagement");
//     }
//   };

//   // Edit engagement handler
//   const handleEditEngagement = (eng: EngagementItem) => {
//     setEditingEngId(eng.id);
//     if (eng.type) setEngType(eng.type);
//     if (eng.loopId) setLoopId(eng.loopId);
//     if (eng.momentId) setSelectedMomentForEng(eng.momentId);
//     setEngQuestion(eng.title || "");
//     setEngTimer(eng.timerMinutes || 4);
//     const isOutcomeType = eng.type === "prediction" || eng.type === "debate";
//     const statusVal: "pending" | "active" | "resolved" | "settled" =
//       eng.status === "active" || eng.status === "resolved" || eng.status === "settled"
//         ? eng.status
//         : "pending";
//     setResolveStatus(isOutcomeType ? statusVal : "active");
//     if (eng.options && eng.options.length > 0) {
//       setEngOptions(eng.options.map((o, idx) => ({ id: o.id || String(idx + 1), text: o.text })));
//     }
//     if (eng.correctOptionId) {
//       setCorrectOptionId(eng.correctOptionId);
//     }
//     setActiveTab("engagements");
//     showToast("success", `Editing engagement ${eng.loopId || eng.id}`);
//     if (typeof window !== "undefined") {
//       window.scrollTo({ top: 0, behavior: "smooth" });
//     }
//   };

//   // Cancel edit engagement handler
//   const handleCancelEditEngagement = () => {
//     setEditingEngId(null);
//     setEngQuestion("");
//     handleTypeChange("poll");
//     setResolveStatus("active");
//     if (selectedMomentForEng) {
//       const momentBase = selectedMomentForEng.replace(/^MM-/, "");
//       const existingForMoment = engagements.filter((e) => e.momentId === selectedMomentForEng);
//       const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
//       setLoopId(`LOOP-${momentBase}-${engSeq}`);
//     }
//   };

//   // Selected moment object in Tab 2
//   const activeMoment = useMemo(() => {
//     return moments.find((m) => m.momentId === selectedMomentForEng);
//   }, [moments, selectedMomentForEng]);

//   // Auto-fill template when preset event is picked
//   const handleApplyPresetTemplate = (tpl: MatchMomentTemplate) => {
//     setEvent(tpl.title || tpl.sportsMoment);
//     setMatchMoment(tpl.sportsMoment);
//     setDescription(tpl.description || tpl.title);
//     setEngQuestion(tpl.promptTemplate);
//     if (tpl.defaultOptions && tpl.defaultOptions.length > 0) {
//       setEngOptions(tpl.defaultOptions.map((opt: string, i: number) => ({ id: String(i + 1), text: opt })));
//     }
//     showToast("success", `Applied template: ${tpl.sportsMoment}`);
//   };

//   // ───────────────────────────────────────────────────────────────────────────
//   // TAB 1: SAVE MATCH MOMENT
//   // ───────────────────────────────────────────────────────────────────────────
//   const handleSaveMoment = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!momentId.trim() || !selectedMatchId) {
//       showToast("error", "Moment ID and Match Selection are required");
//       return;
//     }

//     setIsSavingMoment(true);
//     try {
//       const payload = {
//         momentId: momentId.trim(),
//         matchId: selectedMatchId,
//         innings,
//         overs: overs.trim(),
//         score: score.trim(),
//         matchOverTimestamp: matchOverTimestamp.trim(),
//         event: event.trim(),
//         matchMoment: matchMoment.trim(),
//         description: description.trim(),
//         status: "active",
//       };

//       const res = await fetch("/api/match-moments", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
//       const data = await res.json();

//       if (res.ok && data.success) {
//         showToast(
//           "success",
//           editingMomentId
//             ? `Match Moment ${momentId} updated successfully!`
//             : `Match Moment ${momentId} recorded successfully!`
//         );
//         setEditingMomentId(null);
//         setOvers("");
//         setScore("");
//         setMatchOverTimestamp("");
//         setEvent("");
//         setMatchMoment("");
//         setDescription("");
//         fetchMoments();
//         // Set as selected moment for engagement form
//         setSelectedMomentForEng(momentId.trim());
//       } else {
//         showToast("error", data.error || "Failed to save match moment");
//       }
//     } catch (err: any) {
//       showToast("error", err.message || "Network error saving match moment");
//     } finally {
//       setIsSavingMoment(false);
//     }
//   };

//   // Switch to Tab 2 and bind to this moment
//   const handleProceedToEngagement = (m: MatchMomentItem) => {
//     setSelectedMomentForEng(m.momentId);
//     const momentBase = m.momentId.replace(/^MM-/, "");
//     const existingForMoment = engagements.filter((e) => e.momentId === m.momentId);
//     const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
//     setLoopId(`LOOP-${momentBase}-${engSeq}`);
//     setInnings(m.innings as 1 | 2);
//     setOvers(m.overs);
//     setScore(m.score);
//     setActiveTab("engagements");
//   };

//   // ───────────────────────────────────────────────────────────────────────────
//   // TAB 2: ENGAGEMENT TYPE CHANGE HANDLER
//   // ───────────────────────────────────────────────────────────────────────────
//   const handleTypeChange = (type: "poll" | "prediction" | "express" | "debate" | "question") => {
//     setEngType(type);
//     if (type === "poll") {
//       setResolveStatus("active");
//       setEngOptions([
//         { id: "1", text: "Batters dominating" },
//         { id: "2", text: "Bowlers pulling it back" },
//       ]);
//     } else if (type === "prediction") {
//       setResolveStatus("pending");
//       setEngOptions([
//         { id: "1", text: "Yes, under 165 runs" },
//         { id: "2", text: "No, 166 or more" },
//       ]);
//     } else if (type === "debate") {
//       setResolveStatus("pending");
//       setEngOptions([
//         { id: "1", text: "Side A: Smart aggression" },
//         { id: "2", text: "Side B: Costly mistake" },
//       ]);
//     } else if (type === "express") {
//       setResolveStatus("active");
//       setEngOptions([
//         { id: "1", text: "🔥 On Fire" },
//         { id: "2", text: "🤯 Shocked" },
//         { id: "3", text: "👏 World Class" },
//         { id: "4", text: "💔 Heartbroken" },
//       ]);
//     } else if (type === "question") {
//       setResolveStatus("active");
//       setEngOptions([
//         { id: "1", text: "Option A" },
//         { id: "2", text: "Option B" },
//         { id: "3", text: "Option C" },
//         { id: "4", text: "Option D" },
//       ]);
//       setCorrectOptionId("1");
//     }
//   };

//   // ───────────────────────────────────────────────────────────────────────────
//   // TAB 2: CREATE ENGAGEMENT
//   // ───────────────────────────────────────────────────────────────────────────
//   const handleCreateEngagement = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!engQuestion.trim()) {
//       showToast("error", "Question / Prompt is required");
//       return;
//     }
//     if (engOptions.some((o) => !o.text.trim())) {
//       showToast("error", "All option fields must have text");
//       return;
//     }

//     setIsSubmittingEng(true);
//     try {
//       const isOutcomeType = engType === "prediction" || engType === "debate";
//       const payload: any = {
//         id: editingEngId || undefined,
//         title: engQuestion.trim(),
//         subtitle: `${activeMatch.team1} vs ${activeMatch.team2} · Innings ${innings} · Over ${overs}`,
//         type: engType,
//         sport: "cricket",
//         status: isOutcomeType ? resolveStatus : "active",
//         timerMinutes: engTimer,
//         options: engOptions.map((o) => ({ id: o.id, text: o.text.trim() })),
//         correctOptionId: engType === "question" ? correctOptionId : undefined,
//         coinStake: 10,
//         // Match Moment & Loop bindings
//         loopId: loopId.trim() || `LOOP-${overs}`,
//         momentId: selectedMomentForEng || momentId,
//         matchId: selectedMatchId,
//         innings,
//         overNumber: overs,
//         scoreState: score,
//         anchorTrigger: activeMoment?.description || description,
//         sportsMoment: activeMoment?.matchMoment || matchMoment,
//         source: "match_moment",
//       };

//       const res = await fetch("/api/engagements", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });
//       const data = await res.json();

//       if (res.ok && data.success) {
//         showToast(
//           "success",
//           editingEngId ? `Engagement ${loopId} updated successfully!` : `Engagement ${loopId} pushed live to fans!`
//         );
//         if (editingEngId) {
//           setEditingEngId(null);
//         }
//         fetchEngagements();
//       } else {
//         showToast("error", data.error || "Failed to create engagement");
//       }
//     } catch (err: any) {
//       showToast("error", err.message || "Network error creating engagement");
//     } finally {
//       setIsSubmittingEng(false);
//     }
//   };

//   // ───────────────────────────────────────────────────────────────────────────
//   // OUTCOME SETTLEMENT HANDLER
//   // ───────────────────────────────────────────────────────────────────────────
//   const handleSettleOutcome = async () => {
//     if (!settleModalItem) return;
//     if (!selectedWinningId) {
//       showToast("error", "Please select the winning choice to settle outcome");
//       return;
//     }

//     setIsSettling(true);
//     try {
//       const selectedOption = settleModalItem.options?.find((o) => o.id === selectedWinningId);
//       const res = await fetch(`/api/engagements/${settleModalItem.id}/resolve`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           winningChoiceId: selectedWinningId,
//           winningChoiceText: selectedOption?.text || "",
//           outcomeNotes: settleNotes.trim(),
//           matchId: selectedMatchId || settleModalItem.matchId,
//         }),
//       });
//       const data = await res.json();

//       if (res.ok && data.success) {
//         showToast("success", `Outcome resolved! +10 SXPs awarded to winning fans.`);
//         // Optimistically update engagements in state so the table updates immediately
//         setEngagements((prev) =>
//           prev.map((item) =>
//             item.id === settleModalItem.id
//               ? {
//                   ...item,
//                   status: "settled",
//                   winningChoiceId: selectedWinningId,
//                   outcomeWinningChoiceId: selectedWinningId,
//                   outcomeNotes: settleNotes.trim(),
//                 }
//               : item
//           )
//         );
//         setSettleModalItem(null);
//         setSelectedWinningId("");
//         setSettleNotes("");
//         fetchEngagements();
//       } else {
//         showToast("error", data.error || "Failed to settle outcome");
//       }
//     } catch (err: any) {
//       showToast("error", err.message || "Network error settling outcome");
//     } finally {
//       setIsSettling(false);
//     }
//   };

//   return (
//     <div
//       style={{
//         minHeight: "100vh",
//         background: "#0d1117",
//         color: "#e6edf3",
//         fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
//         padding: "20px 24px",
//       }}
//     >
//       {/* Toast Alert */}
//       {toast && (
//         <div
//           style={{
//             position: "fixed",
//             top: 20,
//             right: 24,
//             zIndex: 9999,
//             background: toast.type === "success" ? "#1f6feb" : "#da3633",
//             color: "#fff",
//             padding: "12px 20px",
//             borderRadius: 8,
//             boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
//             fontSize: 13,
//             fontWeight: 600,
//             display: "flex",
//             alignItems: "center",
//             gap: 10,
//           }}
//         >
//           {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
//           <span>{toast.message}</span>
//         </div>
//       )}

//       {/* HEADER BAR */}
//       <div style={{ maxWidth: 1240, margin: "0 auto 20px" }}>
//         <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b949e", marginBottom: 6 }}>
//           <span>Core Engine</span>
//           <span>/</span>
//           <span style={{ color: "#58a6ff", fontWeight: 600 }}>Match Moments & Loops</span>
//         </div>

//         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
//           <div>
//             <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 10 }}>
//               <Zap size={22} color="#f59e0b" />
//               Core Engine: Match Moments & Loop Engagements
//             </h1>
//             <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8b949e" }}>
//               Record in-match events (overs, score, verified triggers), then attach live fan engagements with outcome settlement.
//             </p>
//           </div>

//           <div style={{ display: "flex", gap: 10 }}>
//             <Link
//               href="/admin/core-engine/matches"
//               style={{
//                 display: "inline-flex",
//                 alignItems: "center",
//                 gap: 6,
//                 background: "#21262d",
//                 color: "#c9d1d9",
//                 border: "1px solid #30363d",
//                 padding: "7px 14px",
//                 borderRadius: 6,
//                 fontSize: 12,
//                 fontWeight: 600,
//                 textDecoration: "none",
//               }}
//             >
//               <Trophy size={14} color="#f59e0b" /> Section 1: Match Setup
//             </Link>
//           </div>
//         </div>

//         {/* ACTIVE MATCH SELECTOR STRIP */}
//         <div
//           style={{
//             marginTop: 14,
//             background: "#161b22",
//             border: "1px solid #30363d",
//             borderRadius: 8,
//             padding: "10px 16px",
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "space-between",
//             flexWrap: "wrap",
//             gap: 12,
//           }}
//         >
//           <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
//             <span style={{ fontSize: 12, fontWeight: 700, color: "#8b949e", textTransform: "uppercase" }}>
//               Active Match:
//             </span>
//             <select
//               value={selectedMatchId}
//               onChange={(e) => setSelectedMatchId(e.target.value)}
//               style={{
//                 background: "#0d1117",
//                 color: "#58a6ff",
//                 border: "1px solid #388bfd",
//                 borderRadius: 6,
//                 padding: "6px 12px",
//                 fontSize: 13,
//                 fontWeight: 600,
//                 outline: "none",
//                 cursor: "pointer",
//               }}
//             >
//               {matches.map((m) => (
//                 <option key={m.match_id || (m as any).id} value={m.match_id || (m as any).id}>
//                   {m.match_id || (m as any).id} — {m.team1} vs {m.team2} ({m.venue || "Stadium"})
//                 </option>
//               ))}
//             </select>
//           </div>

//           <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
//             <span style={{ fontSize: 12, color: "#8b949e" }}>
//               📍 {activeMatch.venue}, {activeMatch.city}
//             </span>
//             <span
//               style={{
//                 fontSize: 10,
//                 fontWeight: 700,
//                 padding: "2px 8px",
//                 borderRadius: 10,
//                 background: "rgba(46,160,67,0.2)",
//                 color: "#3fb950",
//                 border: "1px solid #2ea043",
//                 textTransform: "uppercase",
//               }}
//             >
//               ● {activeMatch.status || "live"}
//             </span>
//           </div>
//         </div>
//       </div>

//       {/* 2 MAIN TABS */}
//       <div style={{ maxWidth: 1240, margin: "0 auto 20px", display: "flex", gap: 8, borderBottom: "1px solid #30363d", paddingBottom: 10 }}>
//         <button
//           onClick={() => setActiveTab("moments")}
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: 8,
//             padding: "8px 18px",
//             borderRadius: 6,
//             fontSize: 13,
//             fontWeight: 600,
//             background: activeTab === "moments" ? "#21262d" : "transparent",
//             color: activeTab === "moments" ? "#58a6ff" : "#8b949e",
//             border: activeTab === "moments" ? "1px solid #388bfd" : "1px solid transparent",
//             cursor: "pointer",
//           }}
//         >
//           <Zap size={15} />
//           Tab 1: Match Moment Form ({moments.length} Recorded)
//         </button>

//         <button
//           onClick={() => {
//             setActiveTab("engagements");
//             fetchEngagements();
//           }}
//           style={{
//             display: "flex",
//             alignItems: "center",
//             gap: 8,
//             padding: "8px 18px",
//             borderRadius: 6,
//             fontSize: 13,
//             fontWeight: 600,
//             background: activeTab === "engagements" ? "#21262d" : "transparent",
//             color: activeTab === "engagements" ? "#58a6ff" : "#8b949e",
//             border: activeTab === "engagements" ? "1px solid #388bfd" : "1px solid transparent",
//             cursor: "pointer",
//           }}
//         >
//           <Target size={15} />
//           Tab 2: Engagement Form & Visible Outcomes ({engagements.length} Served)
//         </button>
//       </div>

//       {/* ═════════════════════════════════════════════════════════════════════════ */}
//       {/* TAB 1: MATCH MOMENT FORM & TABLE */}
//       {/* ═════════════════════════════════════════════════════════════════════════ */}
//       {activeTab === "moments" && (
//         <div style={{ maxWidth: 1240, margin: "0 auto" }}>
//           {/* Quick Preset Template Pills */}
//           <div style={{ marginBottom: 16 }}>
//             <div style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
//               <Sparkles size={14} color="#f59e0b" /> Quick-Apply Moment Presets:
//             </div>
//             <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
//               {MATCH_MOMENTS_LIBRARY.slice(0, 7).map((tpl) => (
//                 <button
//                   key={tpl.templateId}
//                   type="button"
//                   onClick={() => handleApplyPresetTemplate(tpl)}
//                   style={{
//                     background: "#161b22",
//                     border: "1px solid #30363d",
//                     borderRadius: 6,
//                     padding: "5px 10px",
//                     color: "#c9d1d9",
//                     fontSize: 11,
//                     cursor: "pointer",
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 6,
//                   }}
//                 >
//                   <span>⚡</span>
//                   <span style={{ fontWeight: 600 }}>{tpl.sportsMoment}</span>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {/* Tab 1 Form Card */}
//           <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 22, marginBottom: 24 }}>
//             {/* Edit Mode Notice Banner */}
//             {editingMomentId && (
//               <div
//                 style={{
//                   background: "rgba(210,153,34,0.15)",
//                   border: "1px solid #d29922",
//                   borderRadius: 8,
//                   padding: "10px 16px",
//                   marginBottom: 16,
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "space-between",
//                 }}
//               >
//                 <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#d29922", fontWeight: 600, fontSize: 13 }}>
//                   <Edit3 size={16} />
//                   Editing Match Moment: <strong>{editingMomentId}</strong>
//                 </div>
//                 <button
//                   type="button"
//                   onClick={handleCancelEditMoment}
//                   style={{
//                     background: "#21262d",
//                     color: "#c9d1d9",
//                     border: "1px solid #30363d",
//                     borderRadius: 6,
//                     padding: "4px 10px",
//                     fontSize: 11,
//                     cursor: "pointer",
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 4,
//                   }}
//                 >
//                   <X size={12} /> Cancel Edit
//                 </button>
//               </div>
//             )}

//             <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
//               {editingMomentId ? <Edit3 size={16} color="#d29922" /> : <PlusCircle size={16} color="#388bfd" />}
//               {editingMomentId ? `Edit Match Moment (${editingMomentId})` : "Record New Match Moment"}
//             </div>

//             <form onSubmit={handleSaveMoment}>
//               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
//                 {/* Match (Select Dropdown) */}
//                 <div>
//                   <label style={labelStyle}>Selected Match *</label>
//                   <select
//                     value={selectedMatchId}
//                     onChange={(e) => setSelectedMatchId(e.target.value)}
//                     style={{ ...inputStyle, fontWeight: 600, color: "#58a6ff" }}
//                   >
//                     {matches.map((m) => (
//                       <option key={m.match_id || (m as any).id} value={m.match_id || (m as any).id}>
//                         {m.match_id || (m as any).id}
//                       </option>
//                     ))}
//                   </select>
//                 </div>

//                 {/* Innings */}
//                 <div>
//                   <label style={labelStyle}>Innings</label>
//                   <div style={{ display: "flex", gap: 6 }}>
//                     <button
//                       type="button"
//                       onClick={() => setInnings(1)}
//                       style={{
//                         flex: 1,
//                         padding: "7px 10px",
//                         borderRadius: 6,
//                         border: "1px solid",
//                         borderColor: innings === 1 ? "#388bfd" : "#30363d",
//                         background: innings === 1 ? "#1f6feb" : "#0d1117",
//                         color: "#fff",
//                         fontSize: 12,
//                         fontWeight: 600,
//                         cursor: "pointer",
//                       }}
//                     >
//                       1st Innings
//                     </button>
//                     <button
//                       type="button"
//                       onClick={() => setInnings(2)}
//                       style={{
//                         flex: 1,
//                         padding: "7px 10px",
//                         borderRadius: 6,
//                         border: "1px solid",
//                         borderColor: innings === 2 ? "#388bfd" : "#30363d",
//                         background: innings === 2 ? "#1f6feb" : "#0d1117",
//                         color: "#fff",
//                         fontSize: 12,
//                         fontWeight: 600,
//                         cursor: "pointer",
//                       }}
//                     >
//                       2nd Innings
//                     </button>
//                   </div>
//                 </div>

//                 {/* Overs */}
//                 <div>
//                   <label style={labelStyle}>Overs (e.g. 10.2 / 14.1) *</label>
//                   <input
//                     type="text"
//                     required
//                     value={overs}
//                     onChange={(e) => setOvers(e.target.value)}
//                     style={{ ...inputStyle, fontFamily: "monospace", fontWeight: 700 }}
//                     placeholder="10.2"
//                   />
//                 </div>
//               </div>

//               <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
//                 {/* Score */}
//                 <div>
//                   <label style={labelStyle}>Live Score / State *</label>
//                   <input
//                     type="text"
//                     required
//                     value={score}
//                     onChange={(e) => setScore(e.target.value)}
//                     style={inputStyle}
//                     placeholder="e.g. NZ 84/2 (10.2 ov)"
//                   />
//                 </div>

//                 {/* Match Over Timestamp (Match Clock) */}
//                 <div>
//                   <label style={labelStyle}>
//                     Match Over Timestamp <span style={{ color: "#7ee787", fontSize: 10 }}>(Match Time Clock)</span> *
//                   </label>
//                   <input
//                     type="text"
//                     required
//                     value={matchOverTimestamp}
//                     onChange={(e) => setMatchOverTimestamp(e.target.value)}
//                     style={inputStyle}
//                     placeholder="e.g. 19:42 NZDT or 20:15"
//                   />
//                 </div>

//                 {/* Event Type (Simple text input as requested) */}
//                 <div>
//                   <label style={labelStyle}>Cricket Event *</label>
//                   <input
//                     type="text"
//                     required
//                     value={event}
//                     onChange={(e) => setEvent(e.target.value)}
//                     style={inputStyle}
//                     placeholder="e.g. Wicket Falls, DRS Review, Boundary Burst"
//                   />
//                 </div>
//               </div>

//               {/* Match Moment Headline */}
//               <div style={{ marginBottom: 14 }}>
//                 <label style={labelStyle}>Match Moment Headline *</label>
//                 <input
//                   type="text"
//                   required
//                   value={matchMoment}
//                   onChange={(e) => setMatchMoment(e.target.value)}
//                   style={{ ...inputStyle, fontWeight: 600 }}
//                   placeholder="e.g. Glenn Phillips caught at deep midwicket by Kohli off Bumrah"
//                 />
//               </div>

//               {/* Match Moment Description */}
//               <div style={{ marginBottom: 18 }}>
//                 <label style={labelStyle}>Match Moment Description / Commentary Context</label>
//                 <textarea
//                   rows={2}
//                   value={description}
//                   onChange={(e) => setDescription(e.target.value)}
//                   style={{ ...inputStyle, resize: "vertical" }}
//                   placeholder="Describe the moment and key tactical context..."
//                 />
//               </div>

//               <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
//                 {editingMomentId && (
//                   <button
//                     type="button"
//                     onClick={handleCancelEditMoment}
//                     style={{
//                       background: "#21262d",
//                       color: "#c9d1d9",
//                       border: "1px solid #30363d",
//                       borderRadius: 6,
//                       padding: "9px 16px",
//                       fontSize: 13,
//                       fontWeight: 600,
//                       cursor: "pointer",
//                       display: "flex",
//                       alignItems: "center",
//                       gap: 6,
//                     }}
//                   >
//                     <X size={14} /> Cancel Edit
//                   </button>
//                 )}
//                 <button
//                   type="submit"
//                   disabled={isSavingMoment}
//                   style={{
//                     background: "#238636",
//                     color: "#fff",
//                     border: "none",
//                     borderRadius: 6,
//                     padding: "9px 20px",
//                     fontSize: 13,
//                     fontWeight: 700,
//                     cursor: isSavingMoment ? "not-allowed" : "pointer",
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 8,
//                   }}
//                 >
//                   {isSavingMoment ? (
//                     <RefreshCw size={14} className="animate-spin" />
//                   ) : editingMomentId ? (
//                     <Edit3 size={14} />
//                   ) : (
//                     <PlusCircle size={14} />
//                   )}
//                   {editingMomentId ? "Update Match Moment" : "Save Match Moment"}
//                 </button>
//               </div>
//             </form>
//           </div>

//           {/* Moments Table List */}
//           <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 18 }}>
//             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
//               <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 8 }}>
//                 <Layers size={16} color="#58a6ff" />
//                 Recorded Match Moments for {selectedMatchId} ({moments.length})
//               </div>
//               <button
//                 onClick={fetchMoments}
//                 style={{
//                   background: "#21262d",
//                   color: "#c9d1d9",
//                   border: "1px solid #30363d",
//                   borderRadius: 6,
//                   padding: "5px 10px",
//                   fontSize: 11,
//                   cursor: "pointer",
//                   display: "flex",
//                   alignItems: "center",
//                   gap: 6,
//                 }}
//               >
//                 <RefreshCw size={12} className={loadingMoments ? "animate-spin" : ""} /> Refresh
//               </button>
//             </div>

//             {loadingMoments ? (
//               <div style={{ padding: 30, textAlign: "center", color: "#8b949e" }}>Loading moments...</div>
//             ) : moments.length === 0 ? (
//               <div style={{ padding: 30, textAlign: "center", color: "#8b949e", fontSize: 13 }}>
//                 No match moments recorded yet for this match. Fill out the form above to record your first moment!
//               </div>
//             ) : (
//               <div style={{ overflowX: "auto" }}>
//                 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
//                   <thead>
//                     <tr style={{ borderBottom: "1px solid #30363d", color: "#8b949e", textAlign: "left" }}>
//                       <th style={{ padding: "8px 12px" }}>Moment ID</th>
//                       <th style={{ padding: "8px 12px" }}>Innings & Over</th>
//                       <th style={{ padding: "8px 12px" }}>Score</th>
//                       <th style={{ padding: "8px 12px" }}>Match Time</th>
//                       <th style={{ padding: "8px 12px" }}>Event</th>
//                       <th style={{ padding: "8px 12px" }}>Moment & Description</th>
//                       <th style={{ padding: "8px 12px", textAlign: "right" }}>Actions</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {moments.map((m) => (
//                       <tr key={m.id || m.momentId} style={{ borderBottom: "1px solid #21262d" }}>
//                         <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#58a6ff", fontWeight: 700 }}>
//                           {m.momentId}
//                         </td>
//                         <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
//                           Inn {m.innings} · Over <strong>{m.overs}</strong>
//                         </td>
//                         <td style={{ padding: "10px 12px", fontWeight: 600, color: "#3fb950", whiteSpace: "nowrap" }}>
//                           {m.score}
//                         </td>
//                         <td style={{ padding: "10px 12px", color: "#8b949e", whiteSpace: "nowrap" }}>
//                           {m.matchOverTimestamp || "—"}
//                         </td>
//                         <td style={{ padding: "10px 12px" }}>
//                           <span
//                             style={{
//                               fontSize: 10,
//                               fontWeight: 700,
//                               padding: "2px 8px",
//                               borderRadius: 10,
//                               background: "rgba(56,139,253,0.15)",
//                               color: "#58a6ff",
//                               border: "1px solid rgba(56,139,253,0.3)",
//                               whiteSpace: "nowrap",
//                             }}
//                           >
//                             {m.event}
//                           </span>
//                         </td>
//                         <td style={{ padding: "10px 12px", maxWidth: 300 }}>
//                           <div style={{ fontWeight: 600, color: "#f0f6fc", marginBottom: 2 }}>{m.matchMoment}</div>
//                           <div style={{ fontSize: 11, color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
//                             {m.description}
//                           </div>
//                         </td>
//                         <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
//                           <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
//                             <button
//                               onClick={() => handleProceedToEngagement(m)}
//                               style={{
//                                 background: "#1f6feb",
//                                 color: "#fff",
//                                 border: "none",
//                                 borderRadius: 6,
//                                 padding: "6px 12px",
//                                 fontSize: 11,
//                                 fontWeight: 600,
//                                 cursor: "pointer",
//                                 display: "inline-flex",
//                                 alignItems: "center",
//                                 gap: 6,
//                               }}
//                             >
//                               ⚡ Create Engagement <ArrowRight size={12} />
//                             </button>

//                             <button
//                               onClick={() => handleEditMoment(m)}
//                               title="Edit Match Moment"
//                               style={{
//                                 background: "#21262d",
//                                 color: "#58a6ff",
//                                 border: "1px solid #30363d",
//                                 borderRadius: 6,
//                                 padding: "6px 10px",
//                                 fontSize: 11,
//                                 fontWeight: 600,
//                                 cursor: "pointer",
//                                 display: "inline-flex",
//                                 alignItems: "center",
//                                 gap: 4,
//                               }}
//                             >
//                               <Edit3 size={12} /> Edit
//                             </button>

//                             <button
//                               onClick={() => handleDeleteMoment(m.momentId)}
//                               title="Delete Match Moment"
//                               style={{
//                                 background: "rgba(248,81,73,0.15)",
//                                 color: "#f85149",
//                                 border: "1px solid rgba(248,81,73,0.3)",
//                                 borderRadius: 6,
//                                 padding: "6px 10px",
//                                 fontSize: 11,
//                                 fontWeight: 600,
//                                 cursor: "pointer",
//                                 display: "inline-flex",
//                                 alignItems: "center",
//                                 gap: 4,
//                               }}
//                             >
//                               <Trash2 size={12} /> Delete
//                             </button>
//                           </div>
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//             )}
//           </div>
//         </div>
//       )}

//       {/* ═════════════════════════════════════════════════════════════════════════ */}
//       {/* TAB 2: ENGAGEMENT FORM & REVEAL VISIBLE OUTCOMES */}
//       {/* ═════════════════════════════════════════════════════════════════════════ */}
//       {activeTab === "engagements" && (
//         <div style={{ maxWidth: 1240, margin: "0 auto" }}>
//           {/* Main 2-Column Engagement Creator */}
//           <div
//             style={{
//               background: "#161b22",
//               border: "1px solid #30363d",
//               borderRadius: 10,
//               padding: 22,
//               marginBottom: 24,
//             }}
//           >
//             {/* Edit Mode Notice Banner */}
//             {editingEngId && (
//               <div
//                 style={{
//                   background: "rgba(210,153,34,0.15)",
//                   border: "1px solid #d29922",
//                   borderRadius: 8,
//                   padding: "10px 16px",
//                   marginBottom: 18,
//                   display: "flex",
//                   alignItems: "center",
//                   justifyContent: "space-between",
//                 }}
//               >
//                 <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#d29922", fontWeight: 600, fontSize: 13 }}>
//                   <Edit3 size={16} />
//                   Editing Engagement: <strong>{editingEngId}</strong> {loopId ? `(${loopId})` : ""}
//                 </div>
//                 <button
//                   type="button"
//                   onClick={handleCancelEditEngagement}
//                   style={{
//                     background: "#21262d",
//                     color: "#c9d1d9",
//                     border: "1px solid #30363d",
//                     borderRadius: 6,
//                     padding: "4px 10px",
//                     fontSize: 11,
//                     cursor: "pointer",
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 4,
//                   }}
//                 >
//                   <X size={12} /> Cancel Edit
//                 </button>
//               </div>
//             )}

//             {/* Top Selector Bar: Match Moment Selector + Right-Side Engagement Type Dropdown */}
//             <div
//               style={{
//                 display: "grid",
//                 gridTemplateColumns: "1fr 280px",
//                 gap: 20,
//                 alignItems: "start",
//                 borderBottom: "1px solid #21262d",
//                 paddingBottom: 18,
//                 marginBottom: 20,
//               }}
//             >
//               {/* Left: Moment Selector */}
//               <div>
//                 <label style={labelStyle}>1. Select Match Moment to Attach Engagement To *</label>
//                 {moments.length === 0 ? (
//                   <div style={{ fontSize: 12, color: "#f0883e", padding: "8px 0" }}>
//                     ⚠️ No match moments found for {selectedMatchId}. Please record a moment in Tab 1 first!
//                   </div>
//                 ) : (
//                   <select
//                     value={selectedMomentForEng}
//                     onChange={(e) => {
//                       setSelectedMomentForEng(e.target.value);
//                       const m = moments.find((it) => it.momentId === e.target.value);
//                       if (m) {
//                         const momentBase = m.momentId.replace(/^MM-/, "");
//                         const existingForMoment = engagements.filter((eng) => eng.momentId === m.momentId);
//                         const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
//                         setLoopId(`LOOP-${momentBase}-${engSeq}`);
//                         setInnings(m.innings as 1 | 2);
//                         setOvers(m.overs);
//                         setScore(m.score);
//                       }
//                     }}
//                     style={{ ...inputStyle, fontWeight: 600, color: "#58a6ff" }}
//                   >
//                     {moments.map((m) => (
//                       <option key={m.momentId} value={m.momentId}>
//                         {m.momentId} • Inn {m.innings} Over {m.overs} • {m.score} • {m.event} ({m.matchMoment})
//                       </option>
//                     ))}
//                   </select>
//                 )}

//                 {activeMoment && (
//                   <div style={{ marginTop: 8, fontSize: 11, color: "#8b949e", display: "flex", gap: 12, flexWrap: "wrap" }}>
//                     <span>📍 Match: <strong style={{ color: "#f0f6fc" }}>{selectedMatchId}</strong></span>
//                     <span>⚡ Event: <strong style={{ color: "#f0f6fc" }}>{activeMoment.event}</strong></span>
//                     <span>📊 Score: <strong style={{ color: "#3fb950" }}>{activeMoment.score}</strong></span>
//                     <span>⏱ Clock: <strong style={{ color: "#f0f6fc" }}>{activeMoment.matchOverTimestamp || "—"}</strong></span>
//                   </div>
//                 )}
//               </div>

//               {/* Right: Engagement Type Dropdown (As Requested by User) */}
//               <div>
//                 <label style={labelStyle}>2. Choose Engagement Type *</label>
//                 <select
//                   value={engType}
//                   onChange={(e) => handleTypeChange(e.target.value as any)}
//                   style={{
//                     ...inputStyle,
//                     fontWeight: 700,
//                     color:
//                       engType === "poll"
//                         ? "#58a6ff"
//                         : engType === "prediction"
//                         ? "#f59e0b"
//                         : engType === "debate"
//                         ? "#a371f7"
//                         : engType === "express"
//                         ? "#f0883e"
//                         : "#3fb950",
//                     border: "1px solid #388bfd",
//                     background: "#0d1117",
//                     cursor: "pointer",
//                   }}
//                 >
//                   <option value="poll">📊 Poll (Fan Sentiment)</option>
//                   <option value="prediction">🎯 Prediction (Outcome Settlement)</option>
//                   <option value="express">⚡ Express (Live Emoji Reactions)</option>
//                   <option value="debate">⚖️ Debate (Two Viewpoints)</option>
//                   <option value="question">❓ Question (Trivia Quiz)</option>
//                 </select>
//               </div>
//             </div>

//             {/* Dynamic Engagement Form based on Type */}
//             <form onSubmit={handleCreateEngagement}>
//               <div
//                 style={{
//                   display: "grid",
//                   gridTemplateColumns:
//                     engType === "prediction" || engType === "debate"
//                       ? "1fr 1fr 1fr 1fr"
//                       : "1fr 1fr 1fr",
//                   gap: 14,
//                   marginBottom: 16,
//                 }}
//               >
//                 <div>
//                   <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
//                     Loop ID <span style={{ fontSize: 10, color: "#7ee787" }}>🔒 (Auto-generated · Non-editable)</span> *
//                   </label>
//                   <input
//                     type="text"
//                     readOnly
//                     required
//                     value={loopId}
//                     style={{
//                       ...inputStyle,
//                       fontFamily: "monospace",
//                       fontWeight: 700,
//                       color: "#58a6ff",
//                       background: "#161b22",
//                       cursor: "not-allowed",
//                       borderColor: "#30363d",
//                     }}
//                     placeholder="Auto-generated e.g. LOOP-NZ-01-01"
//                   />
//                 </div>
//                 <div>
//                   <label style={labelStyle}>Attached Moment ID</label>
//                   <input
//                     type="text"
//                     readOnly
//                     value={selectedMomentForEng || momentId}
//                     style={{ ...inputStyle, background: "#161b22", color: "#8b949e", cursor: "not-allowed" }}
//                   />
//                 </div>
//                 <div>
//                   <label style={labelStyle}>Timer (Minutes) *</label>
//                   <select
//                     value={engTimer}
//                     onChange={(e) => setEngTimer(Number(e.target.value))}
//                     style={inputStyle}
//                   >
//                     <option value={2}>2 Minutes</option>
//                     <option value={3}>3 Minutes</option>
//                     <option value={4}>4 Minutes (Standard)</option>
//                     <option value={5}>5 Minutes</option>
//                     <option value={10}>10 Minutes</option>
//                   </select>
//                 </div>
//                 {(engType === "prediction" || engType === "debate") && (
//                   <div>
//                     <label style={labelStyle}>Initial Resolve Status</label>
//                     <select
//                       value={resolveStatus}
//                       onChange={(e) => setResolveStatus(e.target.value as any)}
//                       style={inputStyle}
//                     >
//                       <option value="pending">🟡 Pending (Wait for Outcome)</option>
//                       <option value="active">🟢 Active / Open</option>
//                       {resolveStatus === "settled" && (
//                         <option value="settled">✓ Settled / Fulfilled</option>
//                       )}
//                     </select>
//                   </div>
//                 )}
//               </div>

//               {/* Question Field */}
//               <div style={{ marginBottom: 16 }}>
//                 <label style={labelStyle}>
//                   {engType === "poll" && "Poll Question / Prompt *"}
//                   {engType === "prediction" && "Prediction Question (Settled later with accuracy bonus) *"}
//                   {engType === "debate" && "Debate Discussion Topic *"}
//                   {engType === "express" && "Expression Reaction Headline *"}
//                   {engType === "question" && "Trivia Quiz Question *"}
//                 </label>
//                 <input
//                   type="text"
//                   required
//                   value={engQuestion}
//                   onChange={(e) => setEngQuestion(e.target.value)}
//                   style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }}
//                   placeholder="Enter engagement question for fans..."
//                 />
//               </div>

//               {/* Options Fields */}
//               <div style={{ marginBottom: 20 }}>
//                 <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
//                   <label style={labelStyle}>
//                     Answer Choices / Options {engType === "question" && "(Select correct answer radio)"}
//                   </label>
//                   {engOptions.length < 5 && (
//                     <button
//                       type="button"
//                       onClick={() =>
//                         setEngOptions([
//                           ...engOptions,
//                           { id: String(engOptions.length + 1), text: `Option ${engOptions.length + 1}` },
//                         ])
//                       }
//                       style={{
//                         background: "transparent",
//                         border: "1px dashed #30363d",
//                         color: "#58a6ff",
//                         borderRadius: 4,
//                         padding: "2px 8px",
//                         fontSize: 11,
//                         cursor: "pointer",
//                       }}
//                     >
//                       ＋ Add Option
//                     </button>
//                   )}
//                 </div>

//                 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
//                   {engOptions.map((opt, idx) => (
//                     <div
//                       key={opt.id}
//                       style={{
//                         display: "flex",
//                         alignItems: "center",
//                         gap: 8,
//                         background: "#0d1117",
//                         border: "1px solid #30363d",
//                         borderRadius: 6,
//                         padding: "4px 8px",
//                       }}
//                     >
//                       {engType === "question" && (
//                         <input
//                           type="radio"
//                           name="correctOption"
//                           checked={correctOptionId === opt.id}
//                           onChange={() => setCorrectOptionId(opt.id)}
//                           style={{ cursor: "pointer" }}
//                         />
//                       )}
//                       <span style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", width: 20 }}>
//                         {String.fromCharCode(65 + idx)}
//                       </span>
//                       <input
//                         type="text"
//                         value={opt.text}
//                         onChange={(e) => {
//                           const updated = [...engOptions];
//                           updated[idx].text = e.target.value;
//                           setEngOptions(updated);
//                         }}
//                         style={{
//                           flex: 1,
//                           background: "transparent",
//                           border: "none",
//                           color: "#e6edf3",
//                           fontSize: 13,
//                           outline: "none",
//                         }}
//                         placeholder={`Option ${idx + 1}`}
//                       />
//                       {engOptions.length > 2 && (
//                         <button
//                           type="button"
//                           onClick={() => setEngOptions(engOptions.filter((_, i) => i !== idx))}
//                           style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
//                         >
//                           <X size={14} />
//                         </button>
//                       )}
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {/* Submit Button */}
//               <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
//                 {editingEngId && (
//                   <button
//                     type="button"
//                     onClick={handleCancelEditEngagement}
//                     style={{
//                       background: "#21262d",
//                       color: "#c9d1d9",
//                       border: "1px solid #30363d",
//                       borderRadius: 6,
//                       padding: "10px 18px",
//                       fontSize: 13,
//                       fontWeight: 600,
//                       cursor: "pointer",
//                       display: "flex",
//                       alignItems: "center",
//                       gap: 6,
//                     }}
//                   >
//                     <X size={14} /> Cancel Edit
//                   </button>
//                 )}
//                 <button
//                   type="submit"
//                   disabled={isSubmittingEng}
//                   style={{
//                     background: "#1f6feb",
//                     color: "#fff",
//                     border: "none",
//                     borderRadius: 6,
//                     padding: "10px 24px",
//                     fontSize: 13,
//                     fontWeight: 700,
//                     cursor: isSubmittingEng ? "not-allowed" : "pointer",
//                     display: "flex",
//                     alignItems: "center",
//                     gap: 8,
//                     boxShadow: "0 2px 8px rgba(31,111,235,0.3)",
//                   }}
//                 >
//                   {isSubmittingEng ? (
//                     <RefreshCw size={14} className="animate-spin" />
//                   ) : editingEngId ? (
//                     <Edit3 size={15} />
//                   ) : (
//                     <PlayCircle size={15} />
//                   )}
//                   {editingEngId ? "✏️ Update Engagement" : `🚀 Push ${engType.toUpperCase()} Live to Fans`}
//                 </button>
//               </div>
//             </form>
//           </div>

//           {/* REVEAL VISIBLE OUTCOMES & ENGAGEMENTS LOG */}
//           <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 18 }}>
//             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
//               <div>
//                 <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 8 }}>
//                   <Award size={16} color="#f59e0b" />
//                   Loop Engagements & Reveal Visible Outcomes ({engagements.length})
//                 </div>
//                 <div style={{ fontSize: 11, color: "#8b949e" }}>
//                   For predictions and debates, reveal the verified outcome to credit +10 SXP accuracy bonus to fans.
//                 </div>
//               </div>

//               <button
//                 onClick={fetchEngagements}
//                 style={{
//                   background: "#21262d",
//                   color: "#c9d1d9",
//                   border: "1px solid #30363d",
//                   borderRadius: 6,
//                   padding: "5px 10px",
//                   fontSize: 11,
//                   cursor: "pointer",
//                   display: "flex",
//                   alignItems: "center",
//                   gap: 6,
//                 }}
//               >
//                 <RefreshCw size={12} className={loadingEngagements ? "animate-spin" : ""} /> Refresh
//               </button>
//             </div>

//             {loadingEngagements ? (
//               <div style={{ padding: 30, textAlign: "center", color: "#8b949e" }}>Loading engagements...</div>
//             ) : engagements.length === 0 ? (
//               <div style={{ padding: 30, textAlign: "center", color: "#8b949e", fontSize: 13 }}>
//                 No engagements served yet for this match. Fill out the form above to push your first live engagement!
//               </div>
//             ) : (
//               <div style={{ overflowX: "auto" }}>
//                 <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
//                   <thead>
//                     <tr style={{ borderBottom: "1px solid #30363d", color: "#8b949e", textAlign: "left" }}>
//                       <th style={{ padding: "8px 12px" }}>Loop ID</th>
//                       <th style={{ padding: "8px 12px" }}>Moment ID</th>
//                       <th style={{ padding: "8px 12px" }}>Type</th>
//                       <th style={{ padding: "8px 12px" }}>Question / Prompt</th>
//                       <th style={{ padding: "8px 12px" }}>Options</th>
//                       <th style={{ padding: "8px 12px" }}>Timer / Status</th>
//                       <th style={{ padding: "8px 12px" }}>Resolution</th>
//                       <th style={{ padding: "8px 12px", textAlign: "right" }}>Actions</th>
//                     </tr>
//                   </thead>
//                   <tbody>
//                     {engagements.map((eng) => {
//                       const winningId =
//                         eng.winningChoiceId ||
//                         eng.outcomeWinningChoiceId ||
//                         (eng as any).predictionData?.winningChoiceId ||
//                         (eng as any).debateData?.winningChoiceId;
//                       const isFulfilled = Boolean(
//                         winningId ||
//                         eng.status === "settled" ||
//                         eng.status === "resolved" ||
//                         eng.status === "fulfilled"
//                       );
//                       return (
//                         <tr key={eng.id} style={{ borderBottom: "1px solid #21262d" }}>
//                         <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#58a6ff", fontWeight: 700 }}>
//                           {eng.loopId || eng.id.slice(0, 8)}
//                         </td>
//                         <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#8b949e" }}>
//                           {eng.momentId || "—"}
//                         </td>
//                         <td style={{ padding: "10px 12px" }}>
//                           <span
//                             style={{
//                               fontSize: 10,
//                               fontWeight: 700,
//                               padding: "2px 8px",
//                               borderRadius: 10,
//                               background:
//                                 eng.type === "poll"
//                                   ? "rgba(56,139,253,0.15)"
//                                   : eng.type === "prediction"
//                                   ? "rgba(245,158,11,0.15)"
//                                   : eng.type === "debate"
//                                   ? "rgba(163,113,247,0.15)"
//                                   : "rgba(63,185,80,0.15)",
//                               color:
//                                 eng.type === "poll"
//                                   ? "#58a6ff"
//                                   : eng.type === "prediction"
//                                   ? "#f59e0b"
//                                   : eng.type === "debate"
//                                   ? "#a371f7"
//                                   : "#3fb950",
//                               border: "1px solid rgba(255,255,255,0.1)",
//                               textTransform: "uppercase",
//                             }}
//                           >
//                             {eng.type}
//                           </span>
//                         </td>
//                         <td style={{ padding: "10px 12px", maxWidth: 280 }}>
//                           <div style={{ fontWeight: 600, color: "#f0f6fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
//                             {eng.title}
//                           </div>
//                           {eng.subtitle && <div style={{ fontSize: 11, color: "#8b949e" }}>{eng.subtitle}</div>}
//                         </td>
//                         <td style={{ padding: "10px 12px" }}>
//                           <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
//                             {(eng.options || []).map((o) => {
//                               const isWinner = winningId === o.id;
//                               return (
//                                 <span
//                                   key={o.id}
//                                   style={{
//                                     fontSize: 10,
//                                     background: isWinner ? "rgba(46,160,67,0.3)" : "#21262d",
//                                     color: isWinner ? "#3fb950" : "#c9d1d9",
//                                     border: `1px solid ${isWinner ? "#2ea043" : "#30363d"}`,
//                                     padding: "1px 6px",
//                                     borderRadius: 4,
//                                   }}
//                                 >
//                                   {o.text} {isWinner && "✓ WINNER"}
//                                 </span>
//                               );
//                             })}
//                           </div>
//                         </td>
//                         <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
//                           {(() => {
//                             const { isExpired, remainingText } = getEngagementTimerStatus(eng);
//                             return (
//                               <div>
//                                 <span
//                                   style={{
//                                     display: "inline-flex",
//                                     alignItems: "center",
//                                     gap: 5,
//                                     fontSize: 10,
//                                     fontWeight: 700,
//                                     padding: "2px 8px",
//                                     borderRadius: 10,
//                                     background: isExpired
//                                       ? "rgba(248,81,73,0.15)"
//                                       : "rgba(63,185,80,0.15)",
//                                     color: isExpired ? "#f85149" : "#3fb950",
//                                     border: `1px solid ${isExpired ? "rgba(248,81,73,0.3)" : "rgba(63,185,80,0.3)"}`,
//                                     textTransform: "uppercase",
//                                     letterSpacing: "0.04em",
//                                   }}
//                                 >
//                                   <span
//                                     style={{
//                                       width: 6,
//                                       height: 6,
//                                       borderRadius: "50%",
//                                       background: isExpired ? "#f85149" : "#3fb950",
//                                     }}
//                                   />
//                                   {isExpired ? "Expired" : "Active"}
//                                 </span>
//                                 <div
//                                   style={{
//                                     fontSize: 10,
//                                     color: isExpired ? "#8b949e" : "#58a6ff",
//                                     marginTop: 3,
//                                     fontFamily: "monospace",
//                                   }}
//                                 >
//                                   ⏱️ {remainingText}
//                                 </div>
//                               </div>
//                             );
//                           })()}
//                         </td>
//                         <td style={{ padding: "10px 12px" }}>
//                           {eng.type === "prediction" || eng.type === "debate" ? (
//                             isFulfilled ? (
//                               <span style={{ color: "#3fb950", fontWeight: 700, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
//                                 ✓ Outcome Fulfilled
//                               </span>
//                             ) : (
//                               <span style={{ color: "#f59e0b", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
//                                 ● Pending Outcome
//                               </span>
//                             )
//                           ) : (
//                             <span style={{ color: "#8b949e", fontSize: 11 }}>
//                               — Instant (No outcome needed)
//                             </span>
//                           )}
//                         </td>
//                         <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
//                           <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
//                             {(eng.type === "prediction" || eng.type === "debate") && (
//                               <button
//                                 onClick={() => {
//                                   const opts =
//                                     Array.isArray(eng.options) && eng.options.length > 0
//                                       ? eng.options
//                                       : eng.predictionData?.leftChoice && eng.predictionData?.rightChoice
//                                       ? [
//                                           { id: eng.predictionData.leftChoice.id || "left", text: eng.predictionData.leftChoice.text || "Left" },
//                                           { id: eng.predictionData.rightChoice.id || "right", text: eng.predictionData.rightChoice.text || "Right" },
//                                         ]
//                                       : [
//                                           { id: "A", text: "Option A" },
//                                           { id: "B", text: "Option B" },
//                                         ];
//                                   setSettleModalItem({ ...eng, options: opts });
//                                   setSelectedWinningId(winningId || (opts[0]?.id ?? ""));
//                                   setSettleNotes(eng.outcomeNotes || "");
//                                 }}
//                                 style={{
//                                   background: isFulfilled ? "#21262d" : "#f59e0b",
//                                   color: isFulfilled ? "#58a6ff" : "#000",
//                                   border: isFulfilled ? "1px solid #30363d" : "none",
//                                   borderRadius: 6,
//                                   padding: "5px 10px",
//                                   fontSize: 11,
//                                   fontWeight: 700,
//                                   cursor: "pointer",
//                                   display: "inline-flex",
//                                   alignItems: "center",
//                                   gap: 4,
//                                 }}
//                               >
//                                 <Scale size={12} />
//                                 {isFulfilled ? "Update Outcome" : "⚖️ Reveal Visible Outcome"}
//                               </button>
//                             )}

//                             <button
//                               onClick={() => handleEditEngagement(eng)}
//                               title="Edit Engagement"
//                               style={{
//                                 background: "#21262d",
//                                 color: "#58a6ff",
//                                 border: "1px solid #30363d",
//                                 borderRadius: 6,
//                                 padding: "5px 8px",
//                                 fontSize: 11,
//                                 fontWeight: 600,
//                                 cursor: "pointer",
//                                 display: "inline-flex",
//                                 alignItems: "center",
//                                 gap: 4,
//                               }}
//                             >
//                               <Edit3 size={12} />
//                               Edit
//                             </button>

//                             <button
//                               onClick={() => handleDeleteEngagement(eng.id)}
//                               title="Delete Engagement"
//                               style={{
//                                 background: "rgba(248,81,73,0.15)",
//                                 color: "#f85149",
//                                 border: "1px solid rgba(248,81,73,0.3)",
//                                 borderRadius: 6,
//                                 padding: "5px 8px",
//                                 fontSize: 11,
//                                 fontWeight: 600,
//                                 cursor: "pointer",
//                                 display: "inline-flex",
//                                 alignItems: "center",
//                                 gap: 4,
//                               }}
//                             >
//                               <Trash2 size={12} />
//                               Delete
//                             </button>
//                           </div>
//                         </td>
//                       </tr>
//                     );
//                   })}
//                   </tbody>
//                 </table>
//               </div>
//             )}
//           </div>
//         </div>
//       )}

//       {/* ═════════════════════════════════════════════════════════════════════════ */}
//       {/* OUTCOME SETTLEMENT MODAL */}
//       {/* ═════════════════════════════════════════════════════════════════════════ */}
//       {settleModalItem && (
//         <div
//           style={{
//             position: "fixed",
//             inset: 0,
//             background: "rgba(0,0,0,0.75)",
//             backdropFilter: "blur(4px)",
//             zIndex: 10000,
//             display: "grid",
//             placeItems: "center",
//             padding: 20,
//           }}
//         >
//           <div
//             style={{
//               background: "#161b22",
//               border: "1px solid #30363d",
//               borderRadius: 12,
//               padding: 24,
//               maxWidth: 520,
//               width: "100%",
//               boxShadow: "0 20px 48px rgba(0,0,0,0.6)",
//             }}
//           >
//             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
//               <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 8 }}>
//                 <Scale size={18} color="#f59e0b" />
//                 Reveal Visible Outcome & Settle {settleModalItem.type === "debate" ? "Debate" : "Prediction"}
//               </div>
//               <button
//                 onClick={() => setSettleModalItem(null)}
//                 style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
//               >
//                 <X size={18} />
//               </button>
//             </div>

//             <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 12, marginBottom: 16 }}>
//               <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>QUESTION / PROMPT</div>
//               <div style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc" }}>{settleModalItem.title}</div>
//             </div>

//             <div style={{ marginBottom: 16 }}>
//               <label style={labelStyle}>Select the Verified Winning Choice:</label>
//               <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
//                 {(settleModalItem.options || []).map((opt) => (
//                   <label
//                     key={opt.id}
//                     style={{
//                       display: "flex",
//                       alignItems: "center",
//                       gap: 10,
//                       background: selectedWinningId === opt.id ? "rgba(46,160,67,0.15)" : "#0d1117",
//                       border: `1px solid ${selectedWinningId === opt.id ? "#2ea043" : "#30363d"}`,
//                       borderRadius: 6,
//                       padding: "10px 14px",
//                       cursor: "pointer",
//                       fontSize: 13,
//                       fontWeight: 600,
//                       color: selectedWinningId === opt.id ? "#3fb950" : "#e6edf3",
//                     }}
//                   >
//                     <input
//                       type="radio"
//                       name="winningChoice"
//                       value={opt.id}
//                       checked={selectedWinningId === opt.id}
//                       onChange={() => setSelectedWinningId(opt.id)}
//                     />
//                     <span>{opt.text}</span>
//                   </label>
//                 ))}
//               </div>
//             </div>

//             <div style={{ marginBottom: 20 }}>
//               <label style={labelStyle}>Resolution Notes / Verified Commentary:</label>
//               <input
//                 type="text"
//                 value={settleNotes}
//                 onChange={(e) => setSettleNotes(e.target.value)}
//                 style={inputStyle}
//                 placeholder="e.g. Confirmed: Target was successfully defended under 165."
//               />
//             </div>

//             <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
//               <button
//                 type="button"
//                 onClick={() => setSettleModalItem(null)}
//                 style={{
//                   background: "#21262d",
//                   color: "#c9d1d9",
//                   border: "1px solid #30363d",
//                   borderRadius: 6,
//                   padding: "8px 16px",
//                   fontSize: 13,
//                   cursor: "pointer",
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 type="button"
//                 disabled={isSettling}
//                 onClick={handleSettleOutcome}
//                 style={{
//                   background: "#238636",
//                   color: "#fff",
//                   border: "none",
//                   borderRadius: 6,
//                   padding: "8px 18px",
//                   fontSize: 13,
//                   fontWeight: 700,
//                   cursor: isSettling ? "not-allowed" : "pointer",
//                   display: "flex",
//                   alignItems: "center",
//                   gap: 6,
//                 }}
//               >
//                 {isSettling ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
//                 Publish Outcome & Award +10 SXPs
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default function CoreEngineMatchMomentsPage() {
//   return (
//     <React.Suspense fallback={<div style={{ padding: 40, color: "#8b949e", textAlign: "center" }}>Loading Match Moments Console...</div>}>
//       <CoreEngineMatchMomentsContent />
//     </React.Suspense>
//   );
// }

// const labelStyle: React.CSSProperties = {
//   display: "block",
//   fontSize: 12,
//   fontWeight: 600,
//   color: "#8b949e",
//   marginBottom: 5,
// };

// const inputStyle: React.CSSProperties = {
//   width: "100%",
//   boxSizing: "border-box",
//   background: "#0d1117",
//   border: "1px solid #30363d",
//   borderRadius: 6,
//   padding: "8px 12px",
//   color: "#e6edf3",
//   fontSize: 13,
//   outline: "none",
// };




"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Trophy,
  Calendar,
  Clock,
  PlusCircle,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  HelpCircle,
  BarChart2,
  Target,
  Scale,
  Zap,
  Flame,
  Award,
  Check,
  X,
  Plus,
  Trash2,
  Radio,
  Eye,
  Filter,
  Edit3,
} from "lucide-react";
import { MATCH_MOMENTS_LIBRARY, MatchMomentTemplate } from "@/lib/data/matchMomentsData";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  team1_short?: string;
  team2_short?: string;
  venue?: string;
  city?: string;
  date?: string;
  time?: string;
  format?: string;
  stage?: string;
  status?: string;
}

interface MatchMomentItem {
  id: string;
  momentId: string;
  matchId: string;
  innings: number;
  overs: string;
  score: string;
  matchOverTimestamp: string;
  event: string;
  matchMoment: string;
  description: string;
  createdAt: number;
  status: string;
}

interface OptionItem {
  id: string;
  text: string;
}

interface EngagementItem {
  id: string;
  loopId?: string;
  momentId?: string;
  matchId?: string;
  type: "poll" | "prediction" | "express" | "debate" | "question";
  title: string;
  subtitle?: string;
  options: OptionItem[];
  timerMinutes?: number;
  durationMinutes?: number;
  status?: "active" | "pending" | "resolved" | "settled" | string;
  correctOptionId?: string;
  winningChoiceId?: string;
  outcomeWinningChoiceId?: string;
  outcomeNotes?: string;
  outcomeResolvedAt?: string;
  predictionData?: any;
  debateData?: any;
  totalVotes?: number;
  voteDistribution?: Record<string, number>;
  createdAt?: string | number;
  expiresAt?: string | number | null;
}

// Next free moment ID for a team prefix (e.g. MM-NZ-03).
// Uses the HIGHEST existing number for that prefix (not the count), and skips any ID
// already in use, so a new moment can never reuse (and overwrite) an existing ID —
// even for older moments that were saved without an `innings` value.
const getNextMomentId = (teamCode: string, existing: MatchMomentItem[]): string => {
  const prefix = `MM-${teamCode}-`;
  const used = new Set(existing.map((m) => m.momentId));
  let max = 0;
  existing.forEach((m) => {
    if (m.momentId && m.momentId.startsWith(prefix)) {
      const n = parseInt(m.momentId.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  });
  let next = max + 1;
  let id = `${prefix}${String(next).padStart(2, "0")}`;
  while (used.has(id)) {
    next += 1;
    id = `${prefix}${String(next).padStart(2, "0")}`;
  }
  return id;
};

function CoreEngineMatchMomentsContent() {
  const searchParams = useSearchParams();
  const urlMatchId = searchParams.get("matchId");

  // Top Tabs: "moments" (Tab 1: Match Moment Form) | "engagements" (Tab 2: Engagement Form & Outcomes)
  const [activeTab, setActiveTab] = useState<"moments" | "engagements">("moments");

  // Matches list
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(urlMatchId || "NZ-IND-2026-T20I-04");
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Moments list for selected match
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [loadingMoments, setLoadingMoments] = useState(false);

  // Engagements list for selected match
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [loadingEngagements, setLoadingEngagements] = useState(false);

  // Toast / feedback message
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 1: MATCH MOMENT FORM STATE
  // ───────────────────────────────────────────────────────────────────────────
  const [momentId, setMomentId] = useState<string>("MM-NZ-01");
  const [innings, setInnings] = useState<1 | 2>(1);
  const [overs, setOvers] = useState<string>("");
  const [score, setScore] = useState<string>("");
  const [matchOverTimestamp, setMatchOverTimestamp] = useState<string>("");
  const [event, setEvent] = useState<string>("");
  const [matchMoment, setMatchMoment] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [isSavingMoment, setIsSavingMoment] = useState(false);
  const [editingMomentId, setEditingMomentId] = useState<string | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 2: ENGAGEMENT FORM STATE
  // ───────────────────────────────────────────────────────────────────────────
  const [selectedMomentForEng, setSelectedMomentForEng] = useState<string>("");
  const [engType, setEngType] = useState<"poll" | "prediction" | "express" | "debate" | "question">("poll");
  const [loopId, setLoopId] = useState<string>("NZ-10.2");
  const [engQuestion, setEngQuestion] = useState<string>("Is Phillips' dismissal the turning point of this innings?");
  const [engTimer, setEngTimer] = useState<number>(4);
  const [engOptions, setEngOptions] = useState<OptionItem[]>([
    { id: "1", text: "Yes, India takes full control" },
    { id: "2", text: "No, NZ batting depth will recover" },
  ]);
  const [correctOptionId, setCorrectOptionId] = useState<string>("");
  const [resolveStatus, setResolveStatus] = useState<"pending" | "active" | "resolved" | "settled">("active");
  const [isSubmittingEng, setIsSubmittingEng] = useState(false);
  const [editingEngId, setEditingEngId] = useState<string | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // OUTCOME SETTLEMENT MODAL STATE
  // ───────────────────────────────────────────────────────────────────────────
  const [settleModalItem, setSettleModalItem] = useState<EngagementItem | null>(null);
  const [selectedWinningId, setSelectedWinningId] = useState<string>("");
  const [settleNotes, setSettleNotes] = useState<string>("");
  const [isSettling, setIsSettling] = useState(false);

   const [settledOverrides, setSettledOverrides] = useState<
    Record<string, { winningChoiceId: string; outcomeNotes?: string }>
  >({});
  const settledOverridesRef = React.useRef(settledOverrides);
  useEffect(() => {
    settledOverridesRef.current = settledOverrides;
  }, [settledOverrides]);

  // Live clock ticker for engagement countdowns (Active vs Expired)
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper to compute live Active/Expired status from timerMinutes / expiresAt
  const getEngagementTimerStatus = (eng: EngagementItem) => {
    const timerMins = Number(eng.timerMinutes || eng.durationMinutes || 4);
    const createdMs =
      typeof eng.createdAt === "number" && eng.createdAt > 0
        ? eng.createdAt
        : eng.createdAt
        ? new Date(eng.createdAt).getTime()
        : 0;

    const expiryMs =
      eng.expiresAt && Number(eng.expiresAt) > 0
        ? Number(eng.expiresAt)
        : createdMs > 0
        ? createdMs + timerMins * 60 * 1000
        : null;

    const isExplicitExpired = eng.status === "expired";
    const isExpired = isExplicitExpired || (expiryMs !== null && currentTime >= expiryMs);

    let remainingText = "";
    if (expiryMs !== null) {
      if (currentTime < expiryMs) {
        const diffMs = expiryMs - currentTime;
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        remainingText = `${mins}m ${secs.toString().padStart(2, "0")}s left`;
      } else {
        remainingText = `Timed out (${timerMins}m)`;
      }
    } else {
      remainingText = `${timerMins}m timer`;
    }

    return {
      isExpired,
      timerMins,
      remainingText,
      expiryMs,
    };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // FETCH MATCHES
  // ───────────────────────────────────────────────────────────────────────────
  const fetchMatches = async () => {
    setLoadingMatches(true);
    try {
      const res = await fetch("/api/matches?limit=100");
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        setMatches(data.data);
        if (!selectedMatchId && data.data[0]) {
          setSelectedMatchId(data.data[0].match_id || data.data[0].id);
        }
      } else {
        // Fallback default match
        setMatches([
          {
            match_id: "NZ-IND-2026-T20I-04",
            team1: "New Zealand",
            team2: "India",
            venue: "Eden Park",
            city: "Auckland",
            date: "2026-10-30",
            time: "19:00 NZDT",
            format: "T20",
            stage: "4th T20I",
            status: "live",
          },
        ]);
      }
    } catch (err) {
      console.warn("Failed to load matches:", err);
    } finally {
      setLoadingMatches(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // FETCH MOMENTS FOR CURRENT MATCH
  // ───────────────────────────────────────────────────────────────────────────
  const fetchMoments = useCallback(async () => {
    if (!selectedMatchId) return;
    setLoadingMoments(true);
    try {
      const res = await fetch(`/api/match-moments?matchId=${encodeURIComponent(selectedMatchId)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setMoments(data.data);
        if (data.data.length > 0 && !selectedMomentForEng) {
          setSelectedMomentForEng(data.data[0].momentId);
        }
      } else {
        setMoments([]);
      }
    } catch (err) {
      console.warn("Failed to fetch match moments:", err);
    } finally {
      setLoadingMoments(false);
    }
  }, [selectedMatchId, selectedMomentForEng]);

  // ───────────────────────────────────────────────────────────────────────────
  // FETCH ENGAGEMENTS FOR CURRENT MATCH
  // ───────────────────────────────────────────────────────────────────────────
  const fetchEngagements = useCallback(async () => {
    setLoadingEngagements(true);
    try {
      const res = await fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&limit=100`);
      const data = await res.json();
          if (data.success && Array.isArray(data.engagements)) {
        // Filter by selectedMatchId if matchId field exists
        const filtered = data.engagements.filter((e: any) => !selectedMatchId || !e.matchId || e.matchId === selectedMatchId);
        const merged = filtered.map((e: any) => {
          const ov = settledOverridesRef.current[e.id] || settledOverridesRef.current[e.loopId];
          return ov
            ? {
                ...e,
                status: "settled",
                winningChoiceId: ov.winningChoiceId,
                outcomeWinningChoiceId: ov.winningChoiceId,
                outcomeNotes: ov.outcomeNotes ?? e.outcomeNotes,
              }
            : e;
        });
        setEngagements(merged);
      }
    } catch (err) {
      console.warn("Failed to fetch engagements:", err);
    } finally {
      setLoadingEngagements(false);
    }
  }, [selectedMatchId]);

  useEffect(() => {
    fetchMatches();
  }, []);

  useEffect(() => {
    if (selectedMatchId) {
      fetchMoments();
      fetchEngagements();
    }
  }, [selectedMatchId, fetchMoments, fetchEngagements]);

  // Active match object
  const activeMatch = useMemo(() => {
    return (
      matches.find((m) => (m.match_id || (m as any).id) === selectedMatchId) || {
        match_id: selectedMatchId,
        team1: "New Zealand",
        team1_short: "NZ",
        team2: "India",
        team2_short: "IND",
        venue: "Eden Park",
        city: "Auckland",
        date: "2026-10-30",
        format: "T20",
        stage: "4th T20I",
        status: "live",
      }
    );
  }, [matches, selectedMatchId]);

  // Auto-calculate a UNIQUE moment ID based on innings team code + highest existing number:
  // 1st innings: MM-NZ-01, MM-NZ-02 ...   2nd innings: MM-IND-01, MM-IND-02 ...
  useEffect(() => {
    if (editingMomentId) return; // preserve ID during editing

    const teamCode = (
      innings === 1
        ? activeMatch.team1_short || activeMatch.team1.slice(0, 3) || "NZ"
        : activeMatch.team2_short || activeMatch.team2.slice(0, 3) || "IND"
    ).toUpperCase();

    setMomentId(getNextMomentId(teamCode, moments));
  }, [innings, moments, activeMatch, editingMomentId]);

  // Standard Loop ID generation supporting multiple engagements per moment:
  // e.g. For MM-NZ-01: LOOP-NZ-01-01, LOOP-NZ-01-02
  useEffect(() => {
    if (editingEngId || !selectedMomentForEng) return;
    const momentBase = selectedMomentForEng.replace(/^MM-/, "");
    const existingForMoment = engagements.filter((e) => e.momentId === selectedMomentForEng);
    const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
    setLoopId(`LOOP-${momentBase}-${engSeq}`);
  }, [selectedMomentForEng, engagements, editingEngId]);

  // Edit moment handler
  const handleEditMoment = (m: MatchMomentItem) => {
    setEditingMomentId(m.momentId);
    setMomentId(m.momentId);
    setInnings((Number(m.innings) || 1) as 1 | 2);
    setOvers(m.overs || "");
    setScore(m.score || "");
    setMatchOverTimestamp(m.matchOverTimestamp || "");
    setEvent(m.event || "");
    setMatchMoment(m.matchMoment || "");
    setDescription(m.description || "");
    setActiveTab("moments");
    showToast("success", `Editing Match Moment ${m.momentId}`);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Cancel edit moment handler
  const handleCancelEditMoment = () => {
    setEditingMomentId(null);
    setOvers("");
    setScore("");
    setMatchOverTimestamp("");
    setEvent("");
    setMatchMoment("");
    setDescription("");
    const teamCode = (
      innings === 1
        ? activeMatch.team1_short || activeMatch.team1.slice(0, 3) || "NZ"
        : activeMatch.team2_short || activeMatch.team2.slice(0, 3) || "IND"
    ).toUpperCase();
    setMomentId(getNextMomentId(teamCode, moments));
  };

  // Delete moment handler
  const handleDeleteMoment = async (momentIdToDelete: string) => {
    if (!confirm(`Are you sure you want to delete match moment ${momentIdToDelete}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/match-moments?momentId=${momentIdToDelete}&matchId=${selectedMatchId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("success", `Match moment ${momentIdToDelete} deleted successfully`);
        if (editingMomentId === momentIdToDelete) {
          handleCancelEditMoment();
        }
        fetchMoments();
      } else {
        showToast("error", data.error || "Failed to delete match moment");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to delete match moment");
    }
  };

  // Delete engagement handler
  const handleDeleteEngagement = async (id: string) => {
    if (!confirm("Are you sure you want to delete this engagement?")) return;
    try {
      let res = await fetch(`/api/engagements?id=${encodeURIComponent(id)}&matchId=${encodeURIComponent(selectedMatchId || "")}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        res = await fetch(`/api/engagements/${encodeURIComponent(id)}?matchId=${encodeURIComponent(selectedMatchId || "")}`, {
          method: "DELETE",
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("success", "Engagement deleted successfully");
        if (editingEngId === id) {
          handleCancelEditEngagement();
        }
        // Optimistically remove from state immediately
        setEngagements((prev) => prev.filter((e) => e.id !== id && (e as any).loopId !== id));
        fetchEngagements();
      } else {
        showToast("error", data.error || "Failed to delete engagement");
      }
    } catch (err: any) {
      showToast("error", err.message || "Failed to delete engagement");
    }
  };

  // Edit engagement handler
  const handleEditEngagement = (eng: EngagementItem) => {
    setEditingEngId(eng.id);
    if (eng.type) setEngType(eng.type);
    if (eng.loopId) setLoopId(eng.loopId);
    if (eng.momentId) setSelectedMomentForEng(eng.momentId);
    setEngQuestion(eng.title || "");
    setEngTimer(eng.timerMinutes || 4);
    const isOutcomeType = eng.type === "prediction" || eng.type === "debate";
    const statusVal: "pending" | "active" | "resolved" | "settled" =
      eng.status === "active" || eng.status === "resolved" || eng.status === "settled"
        ? eng.status
        : "pending";
    setResolveStatus(isOutcomeType ? statusVal : "active");
    if (eng.options && eng.options.length > 0) {
      setEngOptions(eng.options.map((o, idx) => ({ id: o.id || String(idx + 1), text: o.text })));
    }
    if (eng.correctOptionId) {
      setCorrectOptionId(eng.correctOptionId);
    }
    setActiveTab("engagements");
    showToast("success", `Editing engagement ${eng.loopId || eng.id}`);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Cancel edit engagement handler
  const handleCancelEditEngagement = () => {
    setEditingEngId(null);
    setEngQuestion("");
    handleTypeChange("poll");
    setResolveStatus("active");
    if (selectedMomentForEng) {
      const momentBase = selectedMomentForEng.replace(/^MM-/, "");
      const existingForMoment = engagements.filter((e) => e.momentId === selectedMomentForEng);
      const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
      setLoopId(`LOOP-${momentBase}-${engSeq}`);
    }
  };

  // Selected moment object in Tab 2
  const activeMoment = useMemo(() => {
    return moments.find((m) => m.momentId === selectedMomentForEng);
  }, [moments, selectedMomentForEng]);

  // Auto-fill template when preset event is picked
  const handleApplyPresetTemplate = (tpl: MatchMomentTemplate) => {
    setEvent(tpl.title || tpl.sportsMoment);
    setMatchMoment(tpl.sportsMoment);
    setDescription(tpl.description || tpl.title);
    setEngQuestion(tpl.promptTemplate);
    if (tpl.defaultOptions && tpl.defaultOptions.length > 0) {
      setEngOptions(tpl.defaultOptions.map((opt: string, i: number) => ({ id: String(i + 1), text: opt })));
    }
    showToast("success", `Applied template: ${tpl.sportsMoment}`);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 1: SAVE MATCH MOMENT
  // ───────────────────────────────────────────────────────────────────────────
  const handleSaveMoment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!momentId.trim() || !selectedMatchId) {
      showToast("error", "Moment ID and Match Selection are required");
      return;
    }

    setIsSavingMoment(true);
    try {
      const payload = {
        momentId: momentId.trim(),
        matchId: selectedMatchId,
        innings,
        overs: overs.trim(),
        score: score.trim(),
        matchOverTimestamp: matchOverTimestamp.trim(),
        event: event.trim(),
        matchMoment: matchMoment.trim(),
        description: description.trim(),
        status: "active",
        // true only when updating an existing moment; false = create (server rejects duplicate IDs)
        isEdit: Boolean(editingMomentId),
      };

      const res = await fetch("/api/match-moments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const savedId = momentId.trim();
        showToast(
          "success",
          editingMomentId
            ? `Match Moment ${savedId} updated successfully!`
            : `Match Moment ${savedId} recorded successfully!`
        );
        setEditingMomentId(null);
        setOvers("");
        setScore("");
        setMatchOverTimestamp("");
        setEvent("");
        setMatchMoment("");
        setDescription("");
        // Reload the list first so the next auto-generated ID is based on fresh data
        await fetchMoments();
        // Set as selected moment for engagement form
        setSelectedMomentForEng(savedId);
      } else {
        showToast("error", data.error || "Failed to save match moment");
        // ID already taken (409) -> refresh list so the next free ID is generated
        if (res.status === 409) {
          await fetchMoments();
        }
      }
    } catch (err: any) {
      showToast("error", err.message || "Network error saving match moment");
    } finally {
      setIsSavingMoment(false);
    }
  };

  // Switch to Tab 2 and bind to this moment
  const handleProceedToEngagement = (m: MatchMomentItem) => {
    setSelectedMomentForEng(m.momentId);
    const momentBase = m.momentId.replace(/^MM-/, "");
    const existingForMoment = engagements.filter((e) => e.momentId === m.momentId);
    const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
    setLoopId(`LOOP-${momentBase}-${engSeq}`);
    setInnings(m.innings as 1 | 2);
    setOvers(m.overs);
    setScore(m.score);
    setActiveTab("engagements");
  };

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 2: ENGAGEMENT TYPE CHANGE HANDLER
  // ───────────────────────────────────────────────────────────────────────────
  const handleTypeChange = (type: "poll" | "prediction" | "express" | "debate" | "question") => {
    setEngType(type);
    if (type === "poll") {
      setResolveStatus("active");
      setEngOptions([
        { id: "1", text: "Batters dominating" },
        { id: "2", text: "Bowlers pulling it back" },
      ]);
    } else if (type === "prediction") {
      setResolveStatus("pending");
      setEngOptions([
        { id: "1", text: "Yes, under 165 runs" },
        { id: "2", text: "No, 166 or more" },
      ]);
    } else if (type === "debate") {
      setResolveStatus("pending");
      setEngOptions([
        { id: "1", text: "Side A: Smart aggression" },
        { id: "2", text: "Side B: Costly mistake" },
      ]);
    } else if (type === "express") {
      setResolveStatus("active");
      setEngOptions([
        { id: "1", text: "🔥 On Fire" },
        { id: "2", text: "🤯 Shocked" },
        { id: "3", text: "👏 World Class" },
        { id: "4", text: "💔 Heartbroken" },
      ]);
    } else if (type === "question") {
      setResolveStatus("active");
      setEngOptions([
        { id: "1", text: "Option A" },
        { id: "2", text: "Option B" },
        { id: "3", text: "Option C" },
        { id: "4", text: "Option D" },
      ]);
      setCorrectOptionId("1");
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // TAB 2: CREATE ENGAGEMENT
  // ───────────────────────────────────────────────────────────────────────────
  const handleCreateEngagement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!engQuestion.trim()) {
      showToast("error", "Question / Prompt is required");
      return;
    }
    if (engOptions.some((o) => !o.text.trim())) {
      showToast("error", "All option fields must have text");
      return;
    }

    setIsSubmittingEng(true);
    try {
      const isOutcomeType = engType === "prediction" || engType === "debate";
      const payload: any = {
        id: editingEngId || undefined,
        title: engQuestion.trim(),
        subtitle: `${activeMatch.team1} vs ${activeMatch.team2} · Innings ${innings} · Over ${overs}`,
        type: engType,
        sport: "cricket",
        status: isOutcomeType ? resolveStatus : "active",
        timerMinutes: engTimer,
        options: engOptions.map((o) => ({ id: o.id, text: o.text.trim() })),
        correctOptionId: engType === "question" ? correctOptionId : undefined,
        coinStake: 10,
        // Match Moment & Loop bindings
        loopId: loopId.trim() || `LOOP-${overs}`,
        momentId: selectedMomentForEng || momentId,
        matchId: selectedMatchId,
        innings,
        overNumber: overs,
        scoreState: score,
        anchorTrigger: activeMoment?.description || description,
        sportsMoment: activeMoment?.matchMoment || matchMoment,
        source: "match_moment",
      };

      const res = await fetch("/api/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        showToast(
          "success",
          editingEngId ? `Engagement ${loopId} updated successfully!` : `Engagement ${loopId} pushed live to fans!`
        );
        if (editingEngId) {
          setEditingEngId(null);
        }
        fetchEngagements();
      } else {
        showToast("error", data.error || "Failed to create engagement");
      }
    } catch (err: any) {
      showToast("error", err.message || "Network error creating engagement");
    } finally {
      setIsSubmittingEng(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // OUTCOME SETTLEMENT HANDLER
  // ───────────────────────────────────────────────────────────────────────────
  const handleSettleOutcome = async () => {
    if (!settleModalItem) return;
    if (!selectedWinningId) {
      showToast("error", "Please select the winning choice to settle outcome");
      return;
    }

    setIsSettling(true);
    try {
      const selectedOption = settleModalItem.options?.find((o) => o.id === selectedWinningId);
      const res = await fetch(`/api/engagements/${settleModalItem.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          winningChoiceId: selectedWinningId,
          winningChoiceText: selectedOption?.text || "",
          outcomeNotes: settleNotes.trim(),
          matchId: selectedMatchId || settleModalItem.matchId,
        }),
      });
      const data = await res.json();

          if (res.ok && data.success) {
        showToast("success", `Outcome resolved! +10 SXPs awarded to winning fans.`);

        // Remember the result so later refetches can't overwrite it with stale data
        const ov = { winningChoiceId: selectedWinningId, outcomeNotes: settleNotes.trim() };
        setSettledOverrides((prev) => ({ ...prev, [settleModalItem.id]: ov }));
        settledOverridesRef.current = { ...settledOverridesRef.current, [settleModalItem.id]: ov };

        // Optimistically update engagements in state so the table updates immediately
        setEngagements((prev) =>
          prev.map((item) =>
            item.id === settleModalItem.id
              ? {
                  ...item,
                  status: "settled",
                  winningChoiceId: selectedWinningId,
                  outcomeWinningChoiceId: selectedWinningId,
                  outcomeNotes: ov.outcomeNotes,
                }
              : item
          )
        );
        setSettleModalItem(null);
        setSelectedWinningId("");
        setSettleNotes("");
        fetchEngagements();
      } else {
        showToast("error", data.error || "Failed to settle outcome");
      }
    } catch (err: any) {
      showToast("error", err.message || "Network error settling outcome");
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "20px 24px",
      }}
    >
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 24,
            zIndex: 9999,
            background: toast.type === "success" ? "#1f6feb" : "#da3633",
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <div style={{ maxWidth: 1240, margin: "0 auto 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8b949e", marginBottom: 6 }}>
          <span>Core Engine</span>
          <span>/</span>
          <span style={{ color: "#58a6ff", fontWeight: 600 }}>Match Moments & Loops</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 10 }}>
              <Zap size={22} color="#f59e0b" />
              Core Engine: Match Moments & Loop Engagements
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#8b949e" }}>
              Record in-match events (overs, score, verified triggers), then attach live fan engagements with outcome settlement.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Link
              href="/admin/core-engine/matches"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#21262d",
                color: "#c9d1d9",
                border: "1px solid #30363d",
                padding: "7px 14px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              <Trophy size={14} color="#f59e0b" /> Section 1: Match Setup
            </Link>
          </div>
        </div>

        {/* ACTIVE MATCH SELECTOR STRIP */}
        <div
          style={{
            marginTop: 14,
            background: "#161b22",
            border: "1px solid #30363d",
            borderRadius: 8,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#8b949e", textTransform: "uppercase" }}>
              Active Match:
            </span>
            <select
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              style={{
                background: "#0d1117",
                color: "#58a6ff",
                border: "1px solid #388bfd",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 600,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {matches.map((m) => (
                <option key={m.match_id || (m as any).id} value={m.match_id || (m as any).id}>
                  {m.match_id || (m as any).id} — {m.team1} vs {m.team2} ({m.venue || "Stadium"})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 12, color: "#8b949e" }}>
              📍 {activeMatch.venue}, {activeMatch.city}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 10,
                background: "rgba(46,160,67,0.2)",
                color: "#3fb950",
                border: "1px solid #2ea043",
                textTransform: "uppercase",
              }}
            >
              ● {activeMatch.status || "live"}
            </span>
          </div>
        </div>
      </div>

      {/* 2 MAIN TABS */}
      <div style={{ maxWidth: 1240, margin: "0 auto 20px", display: "flex", gap: 8, borderBottom: "1px solid #30363d", paddingBottom: 10 }}>
        <button
          onClick={() => setActiveTab("moments")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: activeTab === "moments" ? "#21262d" : "transparent",
            color: activeTab === "moments" ? "#58a6ff" : "#8b949e",
            border: activeTab === "moments" ? "1px solid #388bfd" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          <Zap size={15} />
          Tab 1: Match Moment Form ({moments.length} Recorded)
        </button>

        <button
          onClick={() => {
            setActiveTab("engagements");
            fetchEngagements();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 18px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            background: activeTab === "engagements" ? "#21262d" : "transparent",
            color: activeTab === "engagements" ? "#58a6ff" : "#8b949e",
            border: activeTab === "engagements" ? "1px solid #388bfd" : "1px solid transparent",
            cursor: "pointer",
          }}
        >
          <Target size={15} />
          Tab 2: Engagement Form & Visible Outcomes ({engagements.length} Served)
        </button>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: MATCH MOMENT FORM & TABLE */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "moments" && (
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          {/* Quick Preset Template Pills */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} color="#f59e0b" /> Quick-Apply Moment Presets:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {MATCH_MOMENTS_LIBRARY.slice(0, 7).map((tpl) => (
                <button
                  key={tpl.templateId}
                  type="button"
                  onClick={() => handleApplyPresetTemplate(tpl)}
                  style={{
                    background: "#161b22",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "5px 10px",
                    color: "#c9d1d9",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>⚡</span>
                  <span style={{ fontWeight: 600 }}>{tpl.sportsMoment}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab 1 Form Card */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 22, marginBottom: 24 }}>
            {/* Edit Mode Notice Banner */}
            {editingMomentId && (
              <div
                style={{
                  background: "rgba(210,153,34,0.15)",
                  border: "1px solid #d29922",
                  borderRadius: 8,
                  padding: "10px 16px",
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#d29922", fontWeight: 600, fontSize: 13 }}>
                  <Edit3 size={16} />
                  Editing Match Moment: <strong>{editingMomentId}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleCancelEditMoment}
                  style={{
                    background: "#21262d",
                    color: "#c9d1d9",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <X size={12} /> Cancel Edit
                </button>
              </div>
            )}

            <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              {editingMomentId ? <Edit3 size={16} color="#d29922" /> : <PlusCircle size={16} color="#388bfd" />}
              {editingMomentId ? `Edit Match Moment (${editingMomentId})` : "Record New Match Moment"}
            </div>

            <form onSubmit={handleSaveMoment}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                {/* Match (Select Dropdown) */}
                <div>
                  <label style={labelStyle}>Selected Match *</label>
                  <select
                    value={selectedMatchId}
                    onChange={(e) => setSelectedMatchId(e.target.value)}
                    style={{ ...inputStyle, fontWeight: 600, color: "#58a6ff" }}
                  >
                    {matches.map((m) => (
                      <option key={m.match_id || (m as any).id} value={m.match_id || (m as any).id}>
                        {m.match_id || (m as any).id}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Innings */}
                <div>
                  <label style={labelStyle}>Innings</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setInnings(1)}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1px solid",
                        borderColor: innings === 1 ? "#388bfd" : "#30363d",
                        background: innings === 1 ? "#1f6feb" : "#0d1117",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      1st Innings
                    </button>
                    <button
                      type="button"
                      onClick={() => setInnings(2)}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 6,
                        border: "1px solid",
                        borderColor: innings === 2 ? "#388bfd" : "#30363d",
                        background: innings === 2 ? "#1f6feb" : "#0d1117",
                        color: "#fff",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      2nd Innings
                    </button>
                  </div>
                </div>

                {/* Overs */}
                <div>
                  <label style={labelStyle}>Overs (e.g. 10.2 / 14.1) *</label>
                  <input
                    type="text"
                    required
                    value={overs}
                    onChange={(e) => setOvers(e.target.value)}
                    style={{ ...inputStyle, fontFamily: "monospace", fontWeight: 700 }}
                    placeholder="10.2"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                {/* Score */}
                <div>
                  <label style={labelStyle}>Live Score / State *</label>
                  <input
                    type="text"
                    required
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    style={inputStyle}
                    placeholder="e.g. NZ 84/2 (10.2 ov)"
                  />
                </div>

                {/* Match Over Timestamp (Match Clock) */}
                <div>
                  <label style={labelStyle}>
                    Match Over Timestamp <span style={{ color: "#7ee787", fontSize: 10 }}>(Match Time Clock)</span> *
                  </label>
                  <input
                    type="text"
                    required
                    value={matchOverTimestamp}
                    onChange={(e) => setMatchOverTimestamp(e.target.value)}
                    style={inputStyle}
                    placeholder="e.g. 19:42 NZDT or 20:15"
                  />
                </div>

                {/* Event Type (Simple text input as requested) */}
                <div>
                  <label style={labelStyle}>Cricket Event *</label>
                  <input
                    type="text"
                    required
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                    style={inputStyle}
                    placeholder="e.g. Wicket Falls, DRS Review, Boundary Burst"
                  />
                </div>
              </div>

              {/* Match Moment Headline */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Match Moment Headline *</label>
                <input
                  type="text"
                  required
                  value={matchMoment}
                  onChange={(e) => setMatchMoment(e.target.value)}
                  style={{ ...inputStyle, fontWeight: 600 }}
                  placeholder="e.g. Glenn Phillips caught at deep midwicket by Kohli off Bumrah"
                />
              </div>

              {/* Match Moment Description */}
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Match Moment Description / Commentary Context</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ ...inputStyle, resize: "vertical" }}
                  placeholder="Describe the moment and key tactical context..."
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                {editingMomentId && (
                  <button
                    type="button"
                    onClick={handleCancelEditMoment}
                    style={{
                      background: "#21262d",
                      color: "#c9d1d9",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      padding: "9px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <X size={14} /> Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSavingMoment}
                  style={{
                    background: "#238636",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSavingMoment ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {isSavingMoment ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : editingMomentId ? (
                    <Edit3 size={14} />
                  ) : (
                    <PlusCircle size={14} />
                  )}
                  {editingMomentId ? "Update Match Moment" : "Save Match Moment"}
                </button>
              </div>
            </form>
          </div>

          {/* Moments Table List */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={16} color="#58a6ff" />
                Recorded Match Moments for {selectedMatchId} ({moments.length})
              </div>
              <button
                onClick={fetchMoments}
                style={{
                  background: "#21262d",
                  color: "#c9d1d9",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RefreshCw size={12} className={loadingMoments ? "animate-spin" : ""} /> Refresh
              </button>
            </div>

            {loadingMoments ? (
              <div style={{ padding: 30, textAlign: "center", color: "#8b949e" }}>Loading moments...</div>
            ) : moments.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#8b949e", fontSize: 13 }}>
                No match moments recorded yet for this match. Fill out the form above to record your first moment!
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #30363d", color: "#8b949e", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px" }}>Moment ID</th>
                      <th style={{ padding: "8px 12px" }}>Innings & Over</th>
                      <th style={{ padding: "8px 12px" }}>Score</th>
                      <th style={{ padding: "8px 12px" }}>Match Time</th>
                      <th style={{ padding: "8px 12px" }}>Event</th>
                      <th style={{ padding: "8px 12px" }}>Moment & Description</th>
                      <th style={{ padding: "8px 12px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moments.map((m) => (
                      <tr key={`${m.matchId || selectedMatchId}-${m.momentId}`} style={{ borderBottom: "1px solid #21262d" }}>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#58a6ff", fontWeight: 700 }}>
                          {m.momentId}
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          Inn {m.innings ?? "—"} · Over <strong>{m.overs || "—"}</strong>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: "#3fb950", whiteSpace: "nowrap" }}>
                          {m.score}
                        </td>
                        <td style={{ padding: "10px 12px", color: "#8b949e", whiteSpace: "nowrap" }}>
                          {m.matchOverTimestamp || "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 10,
                              background: "rgba(56,139,253,0.15)",
                              color: "#58a6ff",
                              border: "1px solid rgba(56,139,253,0.3)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {m.event}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: 300 }}>
                          <div style={{ fontWeight: 600, color: "#f0f6fc", marginBottom: 2 }}>{m.matchMoment}</div>
                          <div style={{ fontSize: 11, color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.description}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={() => handleProceedToEngagement(m)}
                              style={{
                                background: "#1f6feb",
                                color: "#fff",
                                border: "none",
                                borderRadius: 6,
                                padding: "6px 12px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              ⚡ Create Engagement <ArrowRight size={12} />
                            </button>

                            <button
                              onClick={() => handleEditMoment(m)}
                              title="Edit Match Moment"
                              style={{
                                background: "#21262d",
                                color: "#58a6ff",
                                border: "1px solid #30363d",
                                borderRadius: 6,
                                padding: "6px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Edit3 size={12} /> Edit
                            </button>

                            <button
                              onClick={() => handleDeleteMoment(m.momentId)}
                              title="Delete Match Moment"
                              style={{
                                background: "rgba(248,81,73,0.15)",
                                color: "#f85149",
                                border: "1px solid rgba(248,81,73,0.3)",
                                borderRadius: 6,
                                padding: "6px 10px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: ENGAGEMENT FORM & REVEAL VISIBLE OUTCOMES */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "engagements" && (
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          {/* Main 2-Column Engagement Creator */}
          <div
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 10,
              padding: 22,
              marginBottom: 24,
            }}
          >
            {/* Edit Mode Notice Banner */}
            {editingEngId && (
              <div
                style={{
                  background: "rgba(210,153,34,0.15)",
                  border: "1px solid #d29922",
                  borderRadius: 8,
                  padding: "10px 16px",
                  marginBottom: 18,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#d29922", fontWeight: 600, fontSize: 13 }}>
                  <Edit3 size={16} />
                  Editing Engagement: <strong>{editingEngId}</strong> {loopId ? `(${loopId})` : ""}
                </div>
                <button
                  type="button"
                  onClick={handleCancelEditEngagement}
                  style={{
                    background: "#21262d",
                    color: "#c9d1d9",
                    border: "1px solid #30363d",
                    borderRadius: 6,
                    padding: "4px 10px",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <X size={12} /> Cancel Edit
                </button>
              </div>
            )}

            {/* Top Selector Bar: Match Moment Selector + Right-Side Engagement Type Dropdown */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 280px",
                gap: 20,
                alignItems: "start",
                borderBottom: "1px solid #21262d",
                paddingBottom: 18,
                marginBottom: 20,
              }}
            >
              {/* Left: Moment Selector */}
              <div>
                <label style={labelStyle}>1. Select Match Moment to Attach Engagement To *</label>
                {moments.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#f0883e", padding: "8px 0" }}>
                    ⚠️ No match moments found for {selectedMatchId}. Please record a moment in Tab 1 first!
                  </div>
                ) : (
                  <select
                    value={selectedMomentForEng}
                    onChange={(e) => {
                      setSelectedMomentForEng(e.target.value);
                      const m = moments.find((it) => it.momentId === e.target.value);
                      if (m) {
                        const momentBase = m.momentId.replace(/^MM-/, "");
                        const existingForMoment = engagements.filter((eng) => eng.momentId === m.momentId);
                        const engSeq = (existingForMoment.length + 1).toString().padStart(2, "0");
                        setLoopId(`LOOP-${momentBase}-${engSeq}`);
                        setInnings(m.innings as 1 | 2);
                        setOvers(m.overs);
                        setScore(m.score);
                      }
                    }}
                    style={{ ...inputStyle, fontWeight: 600, color: "#58a6ff" }}
                  >
                    {moments.map((m) => (
                      <option key={`${m.matchId || selectedMatchId}-${m.momentId}`} value={m.momentId}>
                        {m.momentId} • Inn {m.innings} Over {m.overs} • {m.score} • {m.event} ({m.matchMoment})
                      </option>
                    ))}
                  </select>
                )}

                {activeMoment && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#8b949e", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>📍 Match: <strong style={{ color: "#f0f6fc" }}>{selectedMatchId}</strong></span>
                    <span>⚡ Event: <strong style={{ color: "#f0f6fc" }}>{activeMoment.event}</strong></span>
                    <span>📊 Score: <strong style={{ color: "#3fb950" }}>{activeMoment.score}</strong></span>
                    <span>⏱ Clock: <strong style={{ color: "#f0f6fc" }}>{activeMoment.matchOverTimestamp || "—"}</strong></span>
                  </div>
                )}
              </div>

              {/* Right: Engagement Type Dropdown (As Requested by User) */}
              <div>
                <label style={labelStyle}>2. Choose Engagement Type *</label>
                <select
                  value={engType}
                  onChange={(e) => handleTypeChange(e.target.value as any)}
                  style={{
                    ...inputStyle,
                    fontWeight: 700,
                    color:
                      engType === "poll"
                        ? "#58a6ff"
                        : engType === "prediction"
                        ? "#f59e0b"
                        : engType === "debate"
                        ? "#a371f7"
                        : engType === "express"
                        ? "#f0883e"
                        : "#3fb950",
                    border: "1px solid #388bfd",
                    background: "#0d1117",
                    cursor: "pointer",
                  }}
                >
                  <option value="poll">📊 Poll (Fan Sentiment)</option>
                  <option value="prediction">🎯 Prediction (Outcome Settlement)</option>
                  <option value="express">⚡ Express (Live Emoji Reactions)</option>
                  <option value="debate">⚖️ Debate (Two Viewpoints)</option>
                  <option value="question">❓ Question (Trivia Quiz)</option>
                </select>
              </div>
            </div>

            {/* Dynamic Engagement Form based on Type */}
            <form onSubmit={handleCreateEngagement}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    engType === "prediction" || engType === "debate"
                      ? "1fr 1fr 1fr 1fr"
                      : "1fr 1fr 1fr",
                  gap: 14,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
                    Loop ID <span style={{ fontSize: 10, color: "#7ee787" }}>🔒 (Auto-generated · Non-editable)</span> *
                  </label>
                  <input
                    type="text"
                    readOnly
                    required
                    value={loopId}
                    style={{
                      ...inputStyle,
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "#58a6ff",
                      background: "#161b22",
                      cursor: "not-allowed",
                      borderColor: "#30363d",
                    }}
                    placeholder="Auto-generated e.g. LOOP-NZ-01-01"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Attached Moment ID</label>
                  <input
                    type="text"
                    readOnly
                    value={selectedMomentForEng || momentId}
                    style={{ ...inputStyle, background: "#161b22", color: "#8b949e", cursor: "not-allowed" }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Timer (Minutes) *</label>
                  <select
                    value={engTimer}
                    onChange={(e) => setEngTimer(Number(e.target.value))}
                    style={inputStyle}
                  >
                    <option value={2}>2 Minutes</option>
                    <option value={3}>3 Minutes</option>
                    <option value={4}>4 Minutes (Standard)</option>
                    <option value={5}>5 Minutes</option>
                    <option value={10}>10 Minutes</option>
                  </select>
                </div>
                {(engType === "prediction" || engType === "debate") && (
                  <div>
                    <label style={labelStyle}>Initial Resolve Status</label>
                    <select
                      value={resolveStatus}
                      onChange={(e) => setResolveStatus(e.target.value as any)}
                      style={inputStyle}
                    >
                      <option value="pending">🟡 Pending (Wait for Outcome)</option>
                      <option value="active">🟢 Active / Open</option>
                      {resolveStatus === "settled" && (
                        <option value="settled">✓ Settled / Fulfilled</option>
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Question Field */}
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>
                  {engType === "poll" && "Poll Question / Prompt *"}
                  {engType === "prediction" && "Prediction Question (Settled later with accuracy bonus) *"}
                  {engType === "debate" && "Debate Discussion Topic *"}
                  {engType === "express" && "Expression Reaction Headline *"}
                  {engType === "question" && "Trivia Quiz Question *"}
                </label>
                <input
                  type="text"
                  required
                  value={engQuestion}
                  onChange={(e) => setEngQuestion(e.target.value)}
                  style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }}
                  placeholder="Enter engagement question for fans..."
                />
              </div>

              {/* Options Fields */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={labelStyle}>
                    Answer Choices / Options {engType === "question" && "(Select correct answer radio)"}
                  </label>
                  {engOptions.length < 5 && (
                    <button
                      type="button"
                      onClick={() =>
                        setEngOptions([
                          ...engOptions,
                          { id: String(engOptions.length + 1), text: `Option ${engOptions.length + 1}` },
                        ])
                      }
                      style={{
                        background: "transparent",
                        border: "1px dashed #30363d",
                        color: "#58a6ff",
                        borderRadius: 4,
                        padding: "2px 8px",
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      ＋ Add Option
                    </button>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {engOptions.map((opt, idx) => (
                    <div
                      key={opt.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "#0d1117",
                        border: "1px solid #30363d",
                        borderRadius: 6,
                        padding: "4px 8px",
                      }}
                    >
                      {engType === "question" && (
                        <input
                          type="radio"
                          name="correctOption"
                          checked={correctOptionId === opt.id}
                          onChange={() => setCorrectOptionId(opt.id)}
                          style={{ cursor: "pointer" }}
                        />
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#8b949e", width: 20 }}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <input
                        type="text"
                        value={opt.text}
                        onChange={(e) => {
                          const updated = [...engOptions];
                          updated[idx].text = e.target.value;
                          setEngOptions(updated);
                        }}
                        style={{
                          flex: 1,
                          background: "transparent",
                          border: "none",
                          color: "#e6edf3",
                          fontSize: 13,
                          outline: "none",
                        }}
                        placeholder={`Option ${idx + 1}`}
                      />
                      {engOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setEngOptions(engOptions.filter((_, i) => i !== idx))}
                          style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                {editingEngId && (
                  <button
                    type="button"
                    onClick={handleCancelEditEngagement}
                    style={{
                      background: "#21262d",
                      color: "#c9d1d9",
                      border: "1px solid #30363d",
                      borderRadius: 6,
                      padding: "10px 18px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <X size={14} /> Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmittingEng}
                  style={{
                    background: "#1f6feb",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    padding: "10px 24px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSubmittingEng ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: "0 2px 8px rgba(31,111,235,0.3)",
                  }}
                >
                  {isSubmittingEng ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : editingEngId ? (
                    <Edit3 size={15} />
                  ) : (
                    <PlayCircle size={15} />
                  )}
                  {editingEngId ? "✏️ Update Engagement" : `🚀 Push ${engType.toUpperCase()} Live to Fans`}
                </button>
              </div>
            </form>
          </div>

          {/* REVEAL VISIBLE OUTCOMES & ENGAGEMENTS LOG */}
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 8 }}>
                  <Award size={16} color="#f59e0b" />
                  Loop Engagements & Reveal Visible Outcomes ({engagements.length})
                </div>
                <div style={{ fontSize: 11, color: "#8b949e" }}>
                  For predictions and debates, reveal the verified outcome to credit +10 SXP accuracy bonus to fans.
                </div>
              </div>

              <button
                onClick={fetchEngagements}
                style={{
                  background: "#21262d",
                  color: "#c9d1d9",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <RefreshCw size={12} className={loadingEngagements ? "animate-spin" : ""} /> Refresh
              </button>
            </div>

            {loadingEngagements ? (
              <div style={{ padding: 30, textAlign: "center", color: "#8b949e" }}>Loading engagements...</div>
            ) : engagements.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#8b949e", fontSize: 13 }}>
                No engagements served yet for this match. Fill out the form above to push your first live engagement!
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #30363d", color: "#8b949e", textAlign: "left" }}>
                      <th style={{ padding: "8px 12px" }}>Loop ID</th>
                      <th style={{ padding: "8px 12px" }}>Moment ID</th>
                      <th style={{ padding: "8px 12px" }}>Type</th>
                      <th style={{ padding: "8px 12px" }}>Question / Prompt</th>
                      <th style={{ padding: "8px 12px" }}>Options</th>
                      <th style={{ padding: "8px 12px" }}>Timer / Status</th>
                      <th style={{ padding: "8px 12px" }}>Resolution</th>
                      <th style={{ padding: "8px 12px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                                       {engagements.map((eng) => {
                      const winningId =
                        eng.winningChoiceId ||
                        eng.outcomeWinningChoiceId ||
                        eng.predictionData?.winningChoiceId ||
                        eng.predictionData?.outcomeWinningChoiceId ||
                        eng.predictionData?.correctAnswer ||
                        eng.debateData?.winningChoiceId ||
                        eng.debateData?.outcomeWinningChoiceId ||
                        eng.debateData?.verdict;
                      const isFulfilled = Boolean(
                        winningId ||
                        ["settled", "resolved", "fulfilled"].includes(String(eng.status)) ||
                        eng.predictionData?.status === "settled" ||
                        eng.debateData?.status === "settled"
                      );
                      return (
                        <tr key={eng.id} style={{ borderBottom: "1px solid #21262d" }}>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#58a6ff", fontWeight: 700 }}>
                          {eng.loopId || eng.id.slice(0, 8)}
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#8b949e" }}>
                          {eng.momentId || "—"}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 10,
                              background:
                                eng.type === "poll"
                                  ? "rgba(56,139,253,0.15)"
                                  : eng.type === "prediction"
                                  ? "rgba(245,158,11,0.15)"
                                  : eng.type === "debate"
                                  ? "rgba(163,113,247,0.15)"
                                  : "rgba(63,185,80,0.15)",
                              color:
                                eng.type === "poll"
                                  ? "#58a6ff"
                                  : eng.type === "prediction"
                                  ? "#f59e0b"
                                  : eng.type === "debate"
                                  ? "#a371f7"
                                  : "#3fb950",
                              border: "1px solid rgba(255,255,255,0.1)",
                              textTransform: "uppercase",
                            }}
                          >
                            {eng.type}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", maxWidth: 280 }}>
                          <div style={{ fontWeight: 600, color: "#f0f6fc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {eng.title}
                          </div>
                          {eng.subtitle && <div style={{ fontSize: 11, color: "#8b949e" }}>{eng.subtitle}</div>}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {(eng.options || []).map((o) => {
                              const isWinner = winningId === o.id;
                              return (
                                <span
                                  key={o.id}
                                  style={{
                                    fontSize: 10,
                                    background: isWinner ? "rgba(46,160,67,0.3)" : "#21262d",
                                    color: isWinner ? "#3fb950" : "#c9d1d9",
                                    border: `1px solid ${isWinner ? "#2ea043" : "#30363d"}`,
                                    padding: "1px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  {o.text} {isWinner && "✓ WINNER"}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          {(() => {
                            const { isExpired, remainingText } = getEngagementTimerStatus(eng);
                            return (
                              <div>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: "2px 8px",
                                    borderRadius: 10,
                                    background: isExpired
                                      ? "rgba(248,81,73,0.15)"
                                      : "rgba(63,185,80,0.15)",
                                    color: isExpired ? "#f85149" : "#3fb950",
                                    border: `1px solid ${isExpired ? "rgba(248,81,73,0.3)" : "rgba(63,185,80,0.3)"}`,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      background: isExpired ? "#f85149" : "#3fb950",
                                    }}
                                  />
                                  {isExpired ? "Expired" : "Active"}
                                </span>
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: isExpired ? "#8b949e" : "#58a6ff",
                                    marginTop: 3,
                                    fontFamily: "monospace",
                                  }}
                                >
                                  ⏱️ {remainingText}
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          {eng.type === "prediction" || eng.type === "debate" ? (
                            isFulfilled ? (
                              <span style={{ color: "#3fb950", fontWeight: 700, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                ✓ Outcome Fulfilled
                              </span>
                            ) : (
                              <span style={{ color: "#f59e0b", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                                ● Pending Outcome
                              </span>
                            )
                          ) : (
                            <span style={{ color: "#8b949e", fontSize: 11 }}>
                              — Instant (No outcome needed)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            {(eng.type === "prediction" || eng.type === "debate") && (
                              <button
                                onClick={() => {
                                  const opts =
                                    Array.isArray(eng.options) && eng.options.length > 0
                                      ? eng.options
                                      : eng.predictionData?.leftChoice && eng.predictionData?.rightChoice
                                      ? [
                                          { id: eng.predictionData.leftChoice.id || "left", text: eng.predictionData.leftChoice.text || "Left" },
                                          { id: eng.predictionData.rightChoice.id || "right", text: eng.predictionData.rightChoice.text || "Right" },
                                        ]
                                      : [
                                          { id: "A", text: "Option A" },
                                          { id: "B", text: "Option B" },
                                        ];
                                  setSettleModalItem({ ...eng, options: opts });
                                  setSelectedWinningId(winningId || (opts[0]?.id ?? ""));
                                  setSettleNotes(eng.outcomeNotes || "");
                                }}
                                style={{
                                  background: isFulfilled ? "#21262d" : "#f59e0b",
                                  color: isFulfilled ? "#58a6ff" : "#000",
                                  border: isFulfilled ? "1px solid #30363d" : "none",
                                  borderRadius: 6,
                                  padding: "5px 10px",
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <Scale size={12} />
                                {isFulfilled ? "Update Outcome" : "⚖️ Reveal Visible Outcome"}
                              </button>
                            )}

                            <button
                              onClick={() => handleEditEngagement(eng)}
                              title="Edit Engagement"
                              style={{
                                background: "#21262d",
                                color: "#58a6ff",
                                border: "1px solid #30363d",
                                borderRadius: 6,
                                padding: "5px 8px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Edit3 size={12} />
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeleteEngagement(eng.id)}
                              title="Delete Engagement"
                              style={{
                                background: "rgba(248,81,73,0.15)",
                                color: "#f85149",
                                border: "1px solid rgba(248,81,73,0.3)",
                                borderRadius: 6,
                                padding: "5px 8px",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {/* OUTCOME SETTLEMENT MODAL */}
      {/* ═════════════════════════════════════════════════════════════════════════ */}
      {settleModalItem && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 10000,
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 12,
              padding: 24,
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 20px 48px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f0f6fc", display: "flex", alignItems: "center", gap: 8 }}>
                <Scale size={18} color="#f59e0b" />
                Reveal Visible Outcome & Settle {settleModalItem.type === "debate" ? "Debate" : "Prediction"}
              </div>
              <button
                onClick={() => setSettleModalItem(null)}
                style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>QUESTION / PROMPT</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#f0f6fc" }}>{settleModalItem.title}</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Select the Verified Winning Choice:</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(settleModalItem.options || []).map((opt) => (
                  <label
                    key={opt.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: selectedWinningId === opt.id ? "rgba(46,160,67,0.15)" : "#0d1117",
                      border: `1px solid ${selectedWinningId === opt.id ? "#2ea043" : "#30363d"}`,
                      borderRadius: 6,
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 600,
                      color: selectedWinningId === opt.id ? "#3fb950" : "#e6edf3",
                    }}
                  >
                    <input
                      type="radio"
                      name="winningChoice"
                      value={opt.id}
                      checked={selectedWinningId === opt.id}
                      onChange={() => setSelectedWinningId(opt.id)}
                    />
                    <span>{opt.text}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Resolution Notes / Verified Commentary:</label>
              <input
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                style={inputStyle}
                placeholder="e.g. Confirmed: Target was successfully defended under 165."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setSettleModalItem(null)}
                style={{
                  background: "#21262d",
                  color: "#c9d1d9",
                  border: "1px solid #30363d",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSettling}
                onClick={handleSettleOutcome}
                style={{
                  background: "#238636",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isSettling ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {isSettling ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Publish Outcome & Award +10 SXPs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoreEngineMatchMomentsPage() {
  return (
    <React.Suspense fallback={<div style={{ padding: 40, color: "#8b949e", textAlign: "center" }}>Loading Match Moments Console...</div>}>
      <CoreEngineMatchMomentsContent />
    </React.Suspense>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#8b949e",
  marginBottom: 5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 6,
  padding: "8px 12px",
  color: "#e6edf3",
  fontSize: 13,
  outline: "none",
};
