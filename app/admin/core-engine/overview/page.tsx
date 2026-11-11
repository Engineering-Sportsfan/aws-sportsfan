"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import Link from "next/link";
import {
  Trophy,
  Zap,
  Filter,
  Users,
  CheckCircle2,
  Clock,
  ThumbsUp,
  MessageSquare,
  Share2,
  Eye,
  Vote,
  Award,
  RotateCcw,
  RefreshCw,
  Layers,
  TrendingUp,
  Activity,
  Check,
} from "lucide-react";
import CoreEngineStepper from "../components/CoreEngineStepper";

interface MatchOption {
  match_id: string;
  team1: string;
  team2: string;
  format?: string;
  status?: string;
  isCoreEngineMatch?: boolean;
  source_file?: string | null;
}

interface MatchMomentItem {
  id?: string;
  momentId: string;
  matchId: string;
  innings?: number;
  overs: string;
  score: string;
  event: string;
  matchMoment?: string;
}

interface EngagementOptionItem {
  id?: string;
  text?: string;
  label?: string;
}

interface EngagementItem {
  id: string;
  type: string;
  title: string;
  seriesId?: string;
  matchId?: string;
  momentId?: string;
  loopId?: string;
  recognitionId?: string;
  hasRecognition?: boolean;
  status?: string;
  options?: EngagementOptionItem[];
  pollData?: { options?: EngagementOptionItem[] };
  predictionData?: {
    options?: EngagementOptionItem[];
    leftChoice?: { id?: string; text?: string };
    rightChoice?: { id?: string; text?: string };
  };
  debateData?: { options?: EngagementOptionItem[] };
  expressData?: { options?: EngagementOptionItem[] };
  questionData?: { options?: EngagementOptionItem[] };
  winningChoiceId?: string | null;
  outcomeWinningChoiceId?: string | null;
  outcomeNotes?: string | null;
  resolvedAt?: string | number | null;
  totalVotes?: number;
}

interface RecognitionItem {
  id: string;
  recognitionId?: string;
  seriesId?: string;
  matchId?: string;
  momentId?: string;
  engagementId?: string;
  targetType?: "all" | "user";
  targetUserId?: string | null;
  targetUserName?: string | null;
  headline?: string;
  archetype?: string;
  rewards?: {
    accuracySxp?: number;
    participationSxp?: number;
    streakBonusSxp?: number;
    totalSxp?: number;
  };
}

interface UserEngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  participations: number;
  socialLikes: number;
  socialComments: number;
  socialShares: number;
  socialImpressions: number;
}

interface OverviewUser {
  userId: string;
  name: string;
  username?: string;
  email?: string;
  avatar?: string | null;
  engagements: Record<string, UserEngagementMetrics>;
  roomVisitMatchIds: string[];
}

interface EngagementTotals {
  engagementId: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  participations: number;
  totalActions: number;
  socialLikes: number;
  socialComments: number;
  socialShares: number;
  socialImpressions: number;
  totalSocial: number;
  uniqueParticipants: number;
}

function normalizeMatchKey(val?: string | null): string {
  return String(val || "").trim().replace(/^MATCH#/i, "").replace(/^MATCH-/i, "").toLowerCase();
}

function normalizeMomentKey(val?: string | null): string {
  return String(val || "").trim().replace(/^MOMENT#/i, "").toLowerCase();
}

function getMomentCompositeKey(matchId?: string | null, momentId?: string | null): string {
  return `${normalizeMatchKey(matchId)}|${normalizeMomentKey(momentId)}`;
}

function resolveOptionLabel(eng: EngagementItem, choiceId?: string | null): string | null {
  if (!choiceId) return null;
  const target = String(choiceId).trim().toLowerCase();
  const candidates: EngagementOptionItem[] = [
    ...(eng.options || []),
    ...(eng.pollData?.options || []),
    ...(eng.predictionData?.options || []),
    ...(eng.debateData?.options || []),
    ...(eng.expressData?.options || []),
    ...(eng.questionData?.options || []),
  ];
  if (eng.predictionData?.leftChoice) {
    candidates.push({ id: eng.predictionData.leftChoice.id || "left", text: eng.predictionData.leftChoice.text });
  }
  if (eng.predictionData?.rightChoice) {
    candidates.push({ id: eng.predictionData.rightChoice.id || "right", text: eng.predictionData.rightChoice.text });
  }

  const found = candidates.find(
    (o) =>
      String(o.id || "").trim().toLowerCase() === target ||
      String(o.text || o.label || "").trim().toLowerCase() === target
  );
  return found?.text || found?.label || String(choiceId);
}

function OverviewContent() {
  // Filter states
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");
  const [selectedMomentId, setSelectedMomentId] = useState<string>("");
  const [selectedEngagementId, setSelectedEngagementId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Raw data collections
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [moments, setMoments] = useState<MatchMomentItem[]>([]);
  const [engagements, setEngagements] = useState<EngagementItem[]>([]);
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);
  const [telemetryByEngagement, setTelemetryByEngagement] = useState<Record<string, EngagementTotals>>({});
  const [telemetryUsers, setTelemetryUsers] = useState<OverviewUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>("");

  const fetchOverviewData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, momRes, engRes, recRes] = await Promise.allSettled([
        fetch(`/api/matches?limit=1000&_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/match-moments?_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/engagements?excludeFlipArena=true&source=match_moment&allEnvs=true&limit=500&_t=${Date.now()}`).then((r) => r.json()),
        fetch(`/api/visible-recognition?allEnvs=true&_t=${Date.now()}`).then((r) => r.json()),
      ]);

      const loadedMatches: MatchOption[] =
        mRes.status === "fulfilled" && mRes.value?.success && Array.isArray(mRes.value.data) ? mRes.value.data : [];
      const loadedMoments: MatchMomentItem[] =
        momRes.status === "fulfilled" && momRes.value?.success && Array.isArray(momRes.value.data) ? momRes.value.data : [];
      const rawEngagements: EngagementItem[] =
        engRes.status === "fulfilled" && engRes.value?.success && Array.isArray(engRes.value.engagements)
          ? engRes.value.engagements
          : [];
      const loadedEngagements = rawEngagements.filter(
        (e) =>
          Boolean(e.matchId && e.matchId !== "GLOBAL") ||
          Boolean(e.momentId || e.loopId)
      );
      const loadedRecognitions: RecognitionItem[] =
        recRes.status === "fulfilled" && recRes.value?.success && Array.isArray(recRes.value.data) ? recRes.value.data : [];

      setMatches(loadedMatches);
      setMoments(loadedMoments);
      setEngagements(loadedEngagements);
      setRecognitions(loadedRecognitions);

      // Query real per-user / per-engagement child records from DynamoDB & Firestore
      const engIds = loadedEngagements.map((e) => e.id).filter(Boolean);
      const activeMatchKeys = Array.from(
        new Set([
          ...loadedMatches
            .filter(
              (m) =>
                m.isCoreEngineMatch ||
                String(m.match_id || "").toUpperCase().startsWith("MATCH-")
            )
            .map((m) => m.match_id),
          ...loadedMoments.map((m) => m.matchId),
          ...loadedEngagements.map((e) => e.matchId || ""),
        ].filter(Boolean))
      );

      if (engIds.length > 0 || activeMatchKeys.length > 0) {
        try {
          const telRes = await fetch("/api/admin/core-engine/overview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ engagementIds: engIds, matchIds: activeMatchKeys }),
          }).then((r) => r.json());

          if (telRes?.success) {
            setTelemetryByEngagement(telRes.perEngagement || {});
            setTelemetryUsers(Array.isArray(telRes.users) ? telRes.users : []);
          }
        } catch (telErr) {
          console.warn("Failed to load detailed user telemetry:", telErr);
        }
      } else {
        setTelemetryByEngagement({});
        setTelemetryUsers([]);
      }

      setLastRefreshedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("Failed to load overview data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  // ─── Core Engine Matches Scope (excludes raw Cricsheet archive matches unless linked) ──

  const coreMatches = useMemo(() => {
    const referencedMatchKeys = new Set<string>();
    const rawMatchIdByKey = new Map<string, string>();
    const recordRef = (rawId?: string | null) => {
      const k = normalizeMatchKey(rawId);
      if (!k) return;
      referencedMatchKeys.add(k);
      if (!rawMatchIdByKey.has(k)) rawMatchIdByKey.set(k, String(rawId).replace(/^MATCH#/i, "").trim());
    };
    moments.forEach((m) => recordRef(m.matchId));
    engagements.forEach((e) => recordRef(e.matchId));
    recognitions.forEach((r) => recordRef(r.matchId));

    const matchByKey = new Map<string, MatchOption>();
    for (const m of matches) {
      const k = normalizeMatchKey(m.match_id);
      if (!k) continue;
      const isCore =
        Boolean(m.isCoreEngineMatch) ||
        String(m.match_id || "").toUpperCase().startsWith("MATCH-") ||
        referencedMatchKeys.has(k);
      if (!isCore) continue;
      if (!matchByKey.has(k)) matchByKey.set(k, m);
    }

    // Include any matchId referenced on a Moment/Engagement/Recognition even if MATCH#META wasn't returned
    for (const k of referencedMatchKeys) {
      if (!matchByKey.has(k)) {
        const rawId = rawMatchIdByKey.get(k) || k;
        matchByKey.set(k, {
          match_id: rawId,
          team1: rawId,
          team2: "Core Engine Match",
        });
      }
    }

    return Array.from(matchByKey.values());
  }, [matches, moments, engagements, recognitions]);

  // ─── Filter Hierarchies ────────────────────────────────────────────────────

  const matchLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of coreMatches) {
      const k = normalizeMatchKey(m.match_id);
      if (k) {
        map.set(k, m.team2 === "Core Engine Match" ? m.team1 : `${m.team1} vs ${m.team2}`);
      }
    }
    return map;
  }, [coreMatches]);

  const availableMoments = useMemo(() => {
    const deduped = new Map<string, MatchMomentItem>();
    const targetM = normalizeMatchKey(selectedMatchId);
    for (const m of moments) {
      const mMatchKey = normalizeMatchKey(m.matchId);
      if (targetM && mMatchKey !== targetM) continue;
      const compKey = getMomentCompositeKey(m.matchId, m.momentId);
      if (!deduped.has(compKey)) deduped.set(compKey, m);
    }
    return Array.from(deduped.values());
  }, [moments, selectedMatchId]);

  useEffect(() => {
    if (
      selectedMomentId &&
      !availableMoments.some((m) => getMomentCompositeKey(m.matchId, m.momentId) === selectedMomentId)
    ) {
      setSelectedMomentId("");
    }
  }, [selectedMatchId, availableMoments, selectedMomentId]);

  const availableEngagements = useMemo(() => {
    const targetMatch = normalizeMatchKey(selectedMatchId);
    const hasCompositeMoment = selectedMomentId.includes("|");
    const [selMomMatch, selMomId] = hasCompositeMoment
      ? selectedMomentId.split("|")
      : ["", normalizeMomentKey(selectedMomentId)];

    return engagements.filter((e) => {
      const engMatch = normalizeMatchKey(e.matchId);
      if (targetMatch && engMatch !== targetMatch) return false;
      if (selectedMomentId) {
        if (selMomMatch && engMatch && engMatch !== selMomMatch) return false;
        const engMom = normalizeMomentKey(e.momentId);
        const engLoop = normalizeMomentKey(e.loopId);
        const matchesMom = engMom ? engMom === selMomId : engLoop === selMomId;
        if (!matchesMom) return false;
      }
      return true;
    });
  }, [engagements, selectedMatchId, selectedMomentId]);

  useEffect(() => {
    if (selectedEngagementId && !availableEngagements.some((e) => e.id === selectedEngagementId)) {
      setSelectedEngagementId("");
    }
  }, [selectedMatchId, selectedMomentId, availableEngagements, selectedEngagementId]);

  const engagementsInScope = useMemo(() => {
    if (selectedEngagementId) {
      return availableEngagements.filter((e) => e.id === selectedEngagementId);
    }
    return availableEngagements;
  }, [availableEngagements, selectedEngagementId]);

  const momentsInScope = useMemo(() => {
    if (selectedMomentId) {
      return availableMoments.filter((m) => getMomentCompositeKey(m.matchId, m.momentId) === selectedMomentId);
    }
    return availableMoments;
  }, [availableMoments, selectedMomentId]);

  // Real users who actually participated or engaged (vote/participation, like, comment, share, impression, or social response)
  const usersInScope = useMemo(() => {
    const engIdSet = new Set(engagementsInScope.map((e) => e.id));

    return telemetryUsers
      .map((user) => {
        let participations = 0;
        let likes = 0;
        let comments = 0;
        let shares = 0;
        let impressions = 0;
        let socialLikes = 0;
        let socialComments = 0;
        let socialShares = 0;
        let socialImpressions = 0;
        let activeEngagements = 0;

        for (const [engId, stats] of Object.entries(user.engagements || {})) {
          if (!engIdSet.has(engId)) continue;
          const engSum =
            stats.participations +
            stats.likes +
            stats.comments +
            stats.shares +
            stats.impressions +
            stats.socialLikes +
            stats.socialComments +
            stats.socialShares +
            stats.socialImpressions;

          if (engSum > 0) {
            activeEngagements += 1;
          }
          participations += stats.participations;
          likes += stats.likes;
          comments += stats.comments;
          shares += stats.shares;
          impressions += stats.impressions;
          socialLikes += stats.socialLikes;
          socialComments += stats.socialComments;
          socialShares += stats.socialShares;
          socialImpressions += stats.socialImpressions;
        }

        const totalActionCount = participations + likes + comments + shares + impressions;
        const totalSocialCount = socialLikes + socialComments + socialShares + socialImpressions;

        return {
          user,
          participations,
          likes,
          comments,
          shares,
          impressions,
          socialLikes,
          socialComments,
          socialShares,
          socialImpressions,
          totalActionCount,
          totalSocialCount,
          activeEngagements,
        };
      })
      .filter((entry) => entry.totalActionCount > 0 || entry.totalSocialCount > 0)
      .sort((a, b) => (b.totalActionCount + b.totalSocialCount) - (a.totalActionCount + a.totalSocialCount));
  }, [telemetryUsers, engagementsInScope]);

  useEffect(() => {
    if (selectedUserId && !usersInScope.some((entry) => entry.user.userId === selectedUserId)) {
      setSelectedUserId("");
    }
  }, [usersInScope, selectedUserId]);

  const handleResetFilters = () => {
    setSelectedMatchId("");
    setSelectedMomentId("");
    setSelectedEngagementId("");
    setSelectedUserId("");
  };

  const hasActiveFilters = Boolean(selectedMatchId || selectedMomentId || selectedEngagementId || selectedUserId);

  const activeUserEntry = usersInScope.find((u) => u.user.userId === selectedUserId) || null;
  const activeMatch = coreMatches.find((m) => normalizeMatchKey(m.match_id) === normalizeMatchKey(selectedMatchId));
  const activeMoment = momentsInScope.find((m) => getMomentCompositeKey(m.matchId, m.momentId) === selectedMomentId);
  const activeEngagement = engagementsInScope.find((e) => e.id === selectedEngagementId);

  // Moment lookup for table rows (composite matchId|momentId + fallback by momentId)
  const momentMap = useMemo(() => {
    const map = new Map<string, MatchMomentItem>();
    moments.forEach((m) => {
      if (m.momentId) {
        map.set(getMomentCompositeKey(m.matchId, m.momentId), m);
        const rawKey = normalizeMomentKey(m.momentId);
        if (!map.has(rawKey)) map.set(rawKey, m);
      }
    });
    return map;
  }, [moments]);

  // ─── Real KPI Aggregations (Zero Hardcoded / Mock Numbers) ────────────────

  const actionMetrics = useMemo(() => {
    if (activeUserEntry) {
      const totalActions =
        activeUserEntry.likes +
        activeUserEntry.comments +
        activeUserEntry.shares +
        activeUserEntry.impressions +
        activeUserEntry.participations;

      return {
        totalActions,
        likes: activeUserEntry.likes,
        comments: activeUserEntry.comments,
        shares: activeUserEntry.shares,
        impressions: activeUserEntry.impressions,
        participations: activeUserEntry.participations,
      };
    }

    let likes = 0;
    let comments = 0;
    let shares = 0;
    let impressions = 0;
    let participations = 0;

    for (const eng of engagementsInScope) {
      const t = telemetryByEngagement[eng.id];
      if (!t) continue;
      likes += t.likes;
      comments += t.comments;
      shares += t.shares;
      impressions += t.impressions;
      participations += t.participations;
    }

    return {
      totalActions: likes + comments + shares + impressions + participations,
      likes,
      comments,
      shares,
      impressions,
      participations,
    };
  }, [activeUserEntry, engagementsInScope, telemetryByEngagement]);

  const socialMetrics = useMemo(() => {
    if (activeUserEntry) {
      const totalSocial =
        activeUserEntry.socialLikes +
        activeUserEntry.socialComments +
        activeUserEntry.socialShares +
        activeUserEntry.socialImpressions;

      return {
        totalSocial,
        likesOnOthers: activeUserEntry.socialLikes,
        commentsOnOthers: activeUserEntry.socialComments,
        sharesOfOthers: activeUserEntry.socialShares,
        impressionsOnOthers: activeUserEntry.socialImpressions,
      };
    }

    let likesOnOthers = 0;
    let commentsOnOthers = 0;
    let sharesOfOthers = 0;
    let impressionsOnOthers = 0;

    for (const eng of engagementsInScope) {
      const t = telemetryByEngagement[eng.id];
      if (!t) continue;
      likesOnOthers += t.socialLikes;
      commentsOnOthers += t.socialComments;
      sharesOfOthers += t.socialShares;
      impressionsOnOthers += t.socialImpressions;
    }

    return {
      totalSocial: likesOnOthers + commentsOnOthers + sharesOfOthers + impressionsOnOthers,
      likesOnOthers,
      commentsOnOthers,
      sharesOfOthers,
      impressionsOnOthers,
    };
  }, [activeUserEntry, engagementsInScope, telemetryByEngagement]);

  const outcomeMetrics = useMemo(() => {
    const total = engagementsInScope.length;
    const resolvedCount = engagementsInScope.filter(
      (e) =>
        e.status === "settled" ||
        e.status === "resolved" ||
        Boolean(e.outcomeWinningChoiceId || e.winningChoiceId)
    ).length;
    const pendingCount = total - resolvedCount;
    const resolutionPercentage = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

    return {
      totalEngagements: total,
      resolvedCount,
      pendingCount,
      resolutionPercentage,
      engagements: engagementsInScope,
    };
  }, [engagementsInScope]);

  const recognitionByEngagement = useMemo(() => {
    const map = new Map<string, RecognitionItem>();
    for (const r of recognitions) {
      const rEng = String(r.engagementId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
      if (rEng && !map.has(rEng)) {
        map.set(rEng, r);
      }
    }
    return map;
  }, [recognitions]);

  const recognitionMetrics = useMemo(() => {
    const targetMatch = normalizeMatchKey(selectedMatchId);
    const hasCompositeMoment = selectedMomentId.includes("|");
    const [selMomMatch, selMomId] = hasCompositeMoment
      ? selectedMomentId.split("|")
      : ["", normalizeMomentKey(selectedMomentId)];
    const cleanSelectedEng = selectedEngagementId.replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

    const filtered = recognitions.filter((r) => {
      const rMatch = normalizeMatchKey(r.matchId);
      if (targetMatch && rMatch !== targetMatch) return false;
      if (selectedMomentId) {
        if (selMomMatch && rMatch && rMatch !== selMomMatch) return false;
        if (normalizeMomentKey(r.momentId) !== selMomId) return false;
      }

      if (cleanSelectedEng) {
        const rEng = String(r.engagementId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
        const activeRecId = activeEngagement?.recognitionId;
        if (rEng) {
          if (rEng !== cleanSelectedEng) return false;
        } else if (activeRecId) {
          if ((r.recognitionId || r.id) !== activeRecId) return false;
        } else {
          return false;
        }
      }

      if (activeUserEntry) {
        if (r.targetType !== "user") return false;
        const rUid = String(r.targetUserId || "").trim().toLowerCase().replace(/^user#/i, "");
        const uId = activeUserEntry.user.userId.toLowerCase();
        const uEmail = (activeUserEntry.user.email || "").toLowerCase();
        const uName = activeUserEntry.user.name.toLowerCase();
        const rName = String(r.targetUserName || "").trim().toLowerCase();
        return Boolean(
          (rUid && (rUid === uId || (uEmail && rUid === uEmail))) ||
          (rName && rName === uName)
        );
      }

      return true;
    });

    const totalSxp = filtered.reduce((acc, r) => {
      const direct = Number(r.rewards?.totalSxp || 0);
      if (direct > 0) return acc + direct;
      return (
        acc +
        Number(r.rewards?.accuracySxp || 0) +
        Number(r.rewards?.participationSxp || 0) +
        Number(r.rewards?.streakBonusSxp || 0)
      );
    }, 0);

    const archetypeCount = new Set(filtered.map((r) => r.archetype).filter(Boolean)).size;

    return {
      totalDispatched: filtered.length,
      totalSxp,
      archetypeCount,
    };
  }, [recognitions, selectedMatchId, selectedMomentId, selectedEngagementId, activeEngagement, activeUserEntry]);

  const returnMetrics = useMemo(() => {
    const totalServed = engagementsInScope.length;

    if (totalServed === 0) {
      return {
        totalServed: 0,
        returnedEngagements: 0,
        percentageReturn: 0,
        activeUsersCount: 0,
      };
    }

    if (activeUserEntry) {
      const returned = activeUserEntry.activeEngagements;
      const pct = Math.min(100, Math.round((returned / totalServed) * 100));
      return {
        totalServed,
        returnedEngagements: returned,
        percentageReturn: pct,
        activeUsersCount: 1,
      };
    }

    const activeUsers = usersInScope.filter((u) => u.activeEngagements > 0);
    if (activeUsers.length === 0) {
      return {
        totalServed,
        returnedEngagements: 0,
        percentageReturn: 0,
        activeUsersCount: 0,
      };
    }

    const totalUserReturns = activeUsers.reduce((sum, u) => sum + u.activeEngagements, 0);
    const pct = Math.min(100, Math.round((totalUserReturns / (activeUsers.length * totalServed)) * 100));

    return {
      totalServed,
      returnedEngagements: Math.round((totalUserReturns / activeUsers.length) * 10) / 10,
      percentageReturn: pct,
      activeUsersCount: activeUsers.length,
    };
  }, [engagementsInScope, activeUserEntry, usersInScope]);

  const formatUserOptionLabel = (entry: (typeof usersInScope)[number]) => {
    const parts: string[] = [];
    if (entry.participations > 0) parts.push(`${entry.participations} vote${entry.participations > 1 ? "s" : ""}`);
    if (entry.likes > 0) parts.push(`${entry.likes} like${entry.likes > 1 ? "s" : ""}`);
    if (entry.comments + entry.socialComments > 0) {
      const c = entry.comments + entry.socialComments;
      parts.push(`${c} comment${c > 1 ? "s" : ""}`);
    }
    if (entry.shares > 0) parts.push(`${entry.shares} share${entry.shares > 1 ? "s" : ""}`);
    if (entry.impressions > 0) parts.push(`${entry.impressions} impression${entry.impressions > 1 ? "s" : ""}`);
    if (entry.socialLikes > 0) parts.push(`${entry.socialLikes} reply like${entry.socialLikes > 1 ? "s" : ""}`);
    if (entry.socialImpressions > 0) parts.push(`${entry.socialImpressions} reply impr.`);

    const identity = entry.user.email && entry.user.name !== entry.user.email
      ? `${entry.user.name} (${entry.user.email})`
      : entry.user.name;

    return `${identity}${parts.length > 0 ? ` — ${parts.join(", ")}` : ""}`;
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6 text-white space-y-6">
      {/* Stepper Header */}
      <CoreEngineStepper currentStepKey="overview" matchId={selectedMatchId} compact />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-[1.5px]">
            <div className="w-full h-full bg-[#0D111C] rounded-[10px] flex items-center justify-center text-xl">
              📊
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Core Engine Overview</h1>
            <p className="text-xs text-gray-400">
              Live telemetry across moments, served engagements, actions, social responses, outcomes, recognitions, and % return
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {lastRefreshedAt && (
            <span className="text-[11px] text-gray-400 hidden sm:inline-block">
              Updated: <span className="text-gray-200 font-mono">{lastRefreshedAt}</span>
            </span>
          )}
          <button
            onClick={fetchOverviewData}
            disabled={loading}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/10 flex items-center gap-1.5 text-xs font-bold"
            title="Refresh Telemetry"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-pink-400" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <Link href="/admin/core-engine/create-loop">
            <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:opacity-95 text-white text-xs font-black transition-all shadow-md">
              <Zap size={14} />
              <span>Interactive Create Loop</span>
            </button>
          </Link>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-5 rounded-2xl bg-[#111625] border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-pink-400" />
            <h2 className="text-xs font-black uppercase tracking-wider text-white">Filters</h2>
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] text-pink-400 hover:text-pink-300 font-bold flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={12} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Match Filter */}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Trophy size={12} className="text-pink-400" />
              <span>Match</span>
            </label>
            <select
              value={selectedMatchId}
              onChange={(e) => {
                setSelectedMatchId(e.target.value);
                setSelectedMomentId("");
                setSelectedEngagementId("");
                setSelectedUserId("");
              }}
              className="w-full bg-[#0a0d17] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 font-bold"
            >
              <option value="">All Matches ({coreMatches.length})</option>
              {coreMatches.map((m) => (
                <option key={m.match_id} value={m.match_id}>
                  {m.team2 === "Core Engine Match" ? m.team1 : `${m.team1} vs ${m.team2}`} {m.format ? `(${m.format})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Moment Filter */}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Zap size={12} className="text-amber-400" />
              <span>Moment</span>
            </label>
            <select
              value={selectedMomentId}
              onChange={(e) => {
                setSelectedMomentId(e.target.value);
                setSelectedEngagementId("");
              }}
              className="w-full bg-[#0a0d17] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
            >
              <option value="">All Moments ({availableMoments.length})</option>
              {availableMoments.map((m) => {
                const compKey = getMomentCompositeKey(m.matchId, m.momentId);
                const mLabel = !selectedMatchId ? matchLabelByKey.get(normalizeMatchKey(m.matchId)) : "";
                return (
                  <option key={compKey} value={compKey}>
                    {mLabel ? `[${mLabel}] ` : ""}Over {m.overs} {m.score ? `(${m.score})` : ""} — {m.event || m.matchMoment || m.momentId}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Engagement Filter */}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MessageSquare size={12} className="text-cyan-400" />
              <span>Engagement</span>
            </label>
            <select
              value={selectedEngagementId}
              onChange={(e) => setSelectedEngagementId(e.target.value)}
              className="w-full bg-[#0a0d17] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-bold"
            >
              <option value="">All Engagements ({availableEngagements.length})</option>
              {availableEngagements.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.type.toUpperCase()}] {e.title}
                </option>
              ))}
            </select>
          </div>

          {/* Fan User Scope Filter (Actual participating / impression users) */}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Users size={12} className="text-purple-400" />
              <span>Fan User</span>
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full bg-[#0a0d17] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 font-bold"
            >
              <option value="">
                {usersInScope.length > 0
                  ? `All Participated Fans (${usersInScope.length})`
                  : "All Participated Fans (0)"}
              </option>
              {usersInScope.map((entry) => (
                <option key={entry.user.userId} value={entry.user.userId}>
                  {formatUserOptionLabel(entry)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
            {activeMatch && (
              <span className="px-2.5 py-1 rounded-lg bg-pink-500/15 border border-pink-500/30 text-pink-300 font-bold">
                Match: {activeMatch.team1} vs {activeMatch.team2}
              </span>
            )}
            {activeMoment && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                Moment: Over {activeMoment.overs} ({activeMoment.event || activeMoment.score})
              </span>
            )}
            {activeEngagement && (
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-bold truncate max-w-[260px]">
                Engagement: {activeEngagement.title}
              </span>
            )}
            {activeUserEntry && (
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold">
                User: {activeUserEntry.user.name}
                {activeUserEntry.user.email ? ` (${activeUserEntry.user.email})` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Selected User Summary Panel */}
      {activeUserEntry && (
        <div className="p-6 rounded-2xl bg-gradient-to-br from-[#13182b] to-[#0f1320] border border-purple-500/35 space-y-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              {activeUserEntry.user.avatar ? (
                <img
                  src={activeUserEntry.user.avatar}
                  alt={activeUserEntry.user.name}
                  className="w-11 h-11 rounded-full object-cover border border-purple-400/50"
                />
              ) : (
                <div className="w-11 h-11 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-base font-black text-purple-300">
                  {activeUserEntry.user.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-white">{activeUserEntry.user.name}</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Fan Summary
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono">
                  {activeUserEntry.user.email || activeUserEntry.user.userId}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold">
                {activeUserEntry.totalActionCount} Total Actions
              </span>
              <span className="px-3 py-1 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 font-bold">
                {activeUserEntry.totalSocialCount} Social Responses
              </span>
              <span className="px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                {returnMetrics.percentageReturn}% Return ({activeUserEntry.activeEngagements}/{returnMetrics.totalServed})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-9 gap-2.5 text-center">
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-emerald-400 block">Participations</span>
              <span className="text-lg font-black text-white">{activeUserEntry.participations}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-pink-400 block">Likes</span>
              <span className="text-lg font-black text-white">{activeUserEntry.likes}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-cyan-400 block">Comments</span>
              <span className="text-lg font-black text-white">{activeUserEntry.comments}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-purple-400 block">Shares</span>
              <span className="text-lg font-black text-white">{activeUserEntry.shares}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-blue-400 block">Impressions</span>
              <span className="text-lg font-black text-white">{activeUserEntry.impressions}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-pink-300 block">Social Likes</span>
              <span className="text-lg font-black text-white">{activeUserEntry.socialLikes}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-cyan-300 block">Social Replies</span>
              <span className="text-lg font-black text-white">{activeUserEntry.socialComments}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-white/5">
              <span className="text-[10px] font-bold uppercase text-blue-300 block">Social Impr.</span>
              <span className="text-lg font-black text-white">{activeUserEntry.socialImpressions}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#0a0d17] border border-emerald-500/20">
              <span className="text-[10px] font-bold uppercase text-amber-300 block">SXP Awarded</span>
              <span className="text-lg font-black text-white">{recognitionMetrics.totalSxp}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-2 px-2.5">Engagement Participated</th>
                  <th className="py-2 px-2.5">Moment</th>
                  <th className="py-2 px-2.5 text-right">Vote</th>
                  <th className="py-2 px-2.5 text-right">Like</th>
                  <th className="py-2 px-2.5 text-right">Comment</th>
                  <th className="py-2 px-2.5 text-right">Share</th>
                  <th className="py-2 px-2.5 text-right">Impr.</th>
                  <th className="py-2 px-2.5 text-right">Social Resp.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {engagementsInScope
                  .filter((eng) => {
                    const st = activeUserEntry.user.engagements?.[eng.id];
                    if (!st) return false;
                    return (
                      st.participations +
                        st.likes +
                        st.comments +
                        st.shares +
                        st.impressions +
                        st.socialLikes +
                        st.socialComments +
                        st.socialShares +
                        st.socialImpressions >
                      0
                    );
                  })
                  .map((eng) => {
                    const st = activeUserEntry.user.engagements[eng.id];
                    const linkedMom = eng.momentId
                      ? (momentMap.get(getMomentCompositeKey(eng.matchId, eng.momentId)) ||
                        momentMap.get(normalizeMomentKey(eng.momentId)))
                      : undefined;
                    const socialTotal = st.socialLikes + st.socialComments + st.socialShares + st.socialImpressions;
                    return (
                      <tr key={eng.id} className="hover:bg-white/[0.02]">
                        <td className="py-2 px-2.5 font-semibold text-white max-w-[260px] truncate">{eng.title}</td>
                        <td className="py-2 px-2.5 text-amber-300 text-[11px]">
                          {linkedMom ? `Over ${linkedMom.overs}` : eng.momentId || "—"}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-gray-200">{st.participations}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-gray-200">{st.likes}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-gray-200">{st.comments}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-gray-200">{st.shares}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-gray-200">{st.impressions}</td>
                        <td className="py-2 px-2.5 text-right font-mono text-purple-300">{socialTotal}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Row: Moments, Served, Recognition */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Moments */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-pink-500/20 space-y-2">
          <div className="flex items-center justify-between text-pink-400">
            <span className="text-xs font-black uppercase tracking-wider">Moments</span>
            <Zap size={15} />
          </div>
          <div className="text-3xl font-black text-white">{momentsInScope.length}</div>
          <p className="text-xs text-gray-400">
            Verified sporting moments captured across {selectedMatchId ? "selected match" : `${coreMatches.length} matches`}
          </p>
        </div>

        {/* Served */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-cyan-500/20 space-y-2">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="text-xs font-black uppercase tracking-wider">Served</span>
            <Layers size={15} />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black text-white">{engagementsInScope.length}</span>
            <span className="text-xs text-gray-400">
              {engagementsInScope.length === 1 ? "engagement card" : "engagement cards"}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {usersInScope.length} active fan{usersInScope.length === 1 ? "" : "s"} reached • {actionMetrics.impressions} card impression{actionMetrics.impressions === 1 ? "" : "s"}
          </p>
        </div>

        {/* Recognition */}
        <div className="p-5 rounded-2xl bg-[#111625] border border-purple-500/20 space-y-2">
          <div className="flex items-center justify-between text-purple-400">
            <span className="text-xs font-black uppercase tracking-wider">Recognition</span>
            <Award size={15} />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black text-white">{recognitionMetrics.totalDispatched}</span>
            <span className="text-xs font-bold text-emerald-400">
              {recognitionMetrics.totalSxp.toLocaleString()} SXP awarded
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {recognitionMetrics.archetypeCount} archetype{recognitionMetrics.archetypeCount === 1 ? "" : "s"} dispatched
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-6 rounded-2xl bg-[#111625] border border-amber-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Activity size={16} className="text-amber-400" />
              <span>Actions</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              All user actions on moment engagements: likes, comments, shares, impressions, and participations
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block">Total Actions</span>
            <span className="text-2xl font-black text-amber-400">
              {actionMetrics.totalActions.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-pink-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Likes</span>
              <ThumbsUp size={14} />
            </div>
            <div className="text-2xl font-black text-white">{actionMetrics.likes.toLocaleString()}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-cyan-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Comments</span>
              <MessageSquare size={14} />
            </div>
            <div className="text-2xl font-black text-white">{actionMetrics.comments.toLocaleString()}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-purple-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Shares</span>
              <Share2 size={14} />
            </div>
            <div className="text-2xl font-black text-white">{actionMetrics.shares.toLocaleString()}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-blue-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Impressions</span>
              <Eye size={14} />
            </div>
            <div className="text-2xl font-black text-white">{actionMetrics.impressions.toLocaleString()}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-emerald-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Participation</span>
              <Vote size={14} />
            </div>
            <div className="text-2xl font-black text-white">{actionMetrics.participations.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Social Response */}
      <div className="p-6 rounded-2xl bg-[#111625] border border-purple-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <MessageSquare size={16} className="text-purple-400" />
              <span>Social Response</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Actions done on other users’ content: likes on peer comments, threaded replies, shares, and impressions
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold block">
              Total Social Responses
            </span>
            <span className="text-2xl font-black text-purple-400">
              {socialMetrics.totalSocial.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-pink-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Likes</span>
              <ThumbsUp size={14} />
            </div>
            <div className="text-2xl font-black text-white">{socialMetrics.likesOnOthers.toLocaleString()}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-cyan-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Comments</span>
              <MessageSquare size={14} />
            </div>
            <div className="text-2xl font-black text-white">{socialMetrics.commentsOnOthers.toLocaleString()}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-purple-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Shares</span>
              <Share2 size={14} />
            </div>
            <div className="text-2xl font-black text-white">{socialMetrics.sharesOfOthers.toLocaleString()}</div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0a0d17] border border-white/5">
            <div className="flex items-center justify-between text-blue-400 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Impressions</span>
              <Eye size={14} />
            </div>
            <div className="text-2xl font-black text-white">{socialMetrics.impressionsOnOthers.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Percentage Return */}
      <div className="p-6 rounded-2xl bg-[#111625] border border-emerald-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              <span>% Return</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Share of served engagements where the fan returned with at least one action (impression, like, comment, share, or participation)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-[#0a0d17] border border-emerald-500/25 space-y-2">
            <span className="text-[11px] uppercase tracking-wider font-bold text-gray-400 block">
              Return Rate
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-black text-emerald-400">{returnMetrics.percentageReturn}%</span>
              <span className="text-xs text-gray-400">
                {returnMetrics.returnedEngagements} / {returnMetrics.totalServed} engagements
                {!activeUserEntry && returnMetrics.activeUsersCount > 0
                  ? ` (avg across ${returnMetrics.activeUsersCount} fan${returnMetrics.activeUsersCount === 1 ? "" : "s"})`
                  : ""}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${returnMetrics.percentageReturn}%` }}
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#0a0d17] border border-white/5 flex flex-col justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider font-bold text-gray-400 block mb-2">
                Actions Breakdown Contributing to Returns
              </span>
              <div className="grid grid-cols-5 gap-2 text-center text-[11px]">
                <div className="p-2 rounded-lg bg-white/5">
                  <span className="text-gray-400 block text-[10px]">Impr.</span>
                  <span className="font-bold text-white">{actionMetrics.impressions}</span>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                  <span className="text-gray-400 block text-[10px]">Likes</span>
                  <span className="font-bold text-white">{actionMetrics.likes + socialMetrics.likesOnOthers}</span>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                  <span className="text-gray-400 block text-[10px]">Comm.</span>
                  <span className="font-bold text-white">{actionMetrics.comments + socialMetrics.commentsOnOthers}</span>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                  <span className="text-gray-400 block text-[10px]">Shares</span>
                  <span className="font-bold text-white">{actionMetrics.shares}</span>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                  <span className="text-gray-400 block text-[10px]">Votes</span>
                  <span className="font-bold text-white">{actionMetrics.participations}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Outcomes (Evaluated Per Engagement) */}
      <div className="p-6 rounded-2xl bg-[#111625] border border-cyan-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <CheckCircle2 size={16} className="text-cyan-400" />
              <span>Outcomes</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              A single moment can have multiple engagements; outcomes are resolved per engagement
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              {outcomeMetrics.resolvedCount} Resolved ({outcomeMetrics.resolutionPercentage}%)
            </span>
            <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              {outcomeMetrics.pendingCount} Pending
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-gray-400 text-[11px] uppercase font-bold tracking-wider">
                <th className="py-2.5 px-3">Engagement</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Moment</th>
                <th className="py-2.5 px-3">1:1 Recognition</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Winning Outcome</th>
                <th className="py-2.5 px-3 text-right">Votes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {outcomeMetrics.engagements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-400 text-xs">
                    No engagements found for this filter selection.
                  </td>
                </tr>
              ) : (
                outcomeMetrics.engagements.map((eng) => {
                  const isSettled =
                    eng.status === "settled" ||
                    eng.status === "resolved" ||
                    Boolean(eng.outcomeWinningChoiceId || eng.winningChoiceId);

                  const resolvedChoiceLabel = resolveOptionLabel(
                    eng,
                    eng.outcomeWinningChoiceId || eng.winningChoiceId
                  );
                  const winningText =
                    resolvedChoiceLabel ||
                    eng.outcomeNotes ||
                    (isSettled ? "Settled" : "Awaiting outcome");

                  const linkedMoment = eng.momentId
                    ? (momentMap.get(getMomentCompositeKey(eng.matchId, eng.momentId)) ||
                      momentMap.get(normalizeMomentKey(eng.momentId)))
                    : undefined;

                  const linkedRecognition =
                    recognitionByEngagement.get(eng.id) ||
                    (eng.recognitionId
                      ? recognitions.find((r) => (r.recognitionId || r.id) === eng.recognitionId)
                      : undefined);

                  const realVoteCount = activeUserEntry
                    ? activeUserEntry.user.engagements?.[eng.id]?.participations || 0
                    : telemetryByEngagement[eng.id]?.participations ?? (eng.totalVotes || 0);

                  return (
                    <tr key={eng.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-3 font-bold text-white max-w-[280px] truncate">{eng.title}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-white/5 text-gray-300">
                          {eng.type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-400">
                        {linkedMoment ? (
                          <span className="text-amber-400 text-[11px] font-medium">
                            Over {linkedMoment.overs} — {linkedMoment.event || linkedMoment.momentId}
                          </span>
                        ) : eng.momentId ? (
                          <span className="text-amber-400 font-mono text-[11px]">{eng.momentId}</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {linkedRecognition ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            {linkedRecognition.headline || linkedRecognition.archetype || "Linked 1:1"}
                          </span>
                        ) : (
                          <Link
                            href={`/admin/core-engine/visible-recognition/add?matchId=${encodeURIComponent(eng.matchId || "")}&momentId=${encodeURIComponent(eng.momentId || "")}&engagementId=${encodeURIComponent(eng.id)}`}
                            className="text-[11px] text-purple-400 hover:underline font-medium"
                          >
                            + Link 1:1
                          </Link>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isSettled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                            <Check size={10} />
                            <span>Settled</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 w-fit">
                            <Clock size={10} />
                            <span>Pending</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-gray-300">
                        {isSettled ? (
                          <span className="text-emerald-300 font-medium">{winningText}</span>
                        ) : (
                          <span className="text-gray-500 italic">{winningText}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-gray-200">
                        {realVoteCount}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading Overview...</div>}>
      <OverviewContent />
    </Suspense>
  );
}
