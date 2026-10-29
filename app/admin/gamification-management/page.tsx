"use client";

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Trophy,
  Award,
  Zap,
  Flame,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Search,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Layers,
  Sliders,
  Shield,
  Star,
  Users,
  Upload,
} from "lucide-react";
import { FEATURE_ICONS, GLOBAL_TIER_ICONS, FeatureKey } from "@/lib/roarBadges";

// ─── Interfaces ─────────────────────────────────────────────────────────────
interface PointRuleItem {
  id: string;
  name: string;
  category: "FlipArena" | "ROAR" | "Referrals" | "System";
  points: number;
  dailyLimit: number;
  status: "active" | "inactive";
  description?: string;
}

interface GlobalTierItem {
  id: string;
  tierLevel: number;
  name: string;
  minSXP: number;
  maxSXP: number | null;
  subLevels: number;
  badgeColor: string;
  badgeIconUrl?: string; // Cloudinary secure_url for tier badge
  description?: string;
}

interface FeatureLadderItem {
  id: string;
  name: string;
  category: string;
  thresholds: number[];
  names: string[];
  icons?: string[]; // Cloudinary secure_urls for each ladder level
  unit: string;
}

interface EditableLevelItem {
  threshold: number;
  name: string;
  icon: string;
}

interface StreakBracket {
  days: number;
  multiplier: number;
  label: string;
}

interface MultipliersConfig {
  matchDayBoost: number;
  squadBoost: number;
  dailyCapConsumption: number;
  streakBrackets: StreakBracket[];
}

const LADDER_META: Record<string, { icon: string; bg: string; border: string; text: string }> = {
  prediction: { icon: "🎯", bg: "bg-cyan-950/60", border: "border-cyan-500/40", text: "text-cyan-300" },
  trivia:     { icon: "🧠", bg: "bg-amber-950/60", border: "border-amber-500/40", text: "text-amber-300" },
  fanBattle:  { icon: "⚔️", bg: "bg-rose-950/60", border: "border-rose-500/40", text: "text-rose-300" },
  post:       { icon: "✍️", bg: "bg-emerald-950/60", border: "border-emerald-500/40", text: "text-emerald-300" },
  debate:     { icon: "🗣️", bg: "bg-purple-950/60", border: "border-purple-500/40", text: "text-purple-300" },
  community:  { icon: "🤝", bg: "bg-pink-950/60", border: "border-pink-500/40", text: "text-pink-300" },
  shares:     { icon: "📢", bg: "bg-sky-950/60", border: "border-sky-500/40", text: "text-sky-300" },
  comments:   { icon: "💬", bg: "bg-indigo-950/60", border: "border-indigo-500/40", text: "text-indigo-300" },
  media:      { icon: "📸", bg: "bg-fuchsia-950/60", border: "border-fuchsia-500/40", text: "text-fuchsia-300" },
  referrals:  { icon: "👥", bg: "bg-yellow-950/60", border: "border-yellow-500/40", text: "text-yellow-300" },
};

function BadgeThumbnail({
  src,
  alt,
  category,
  level,
  size = "md",
  className = "",
  badgeColor,
  isTier = false,
}: {
  src?: string;
  alt: string;
  category?: string;
  level?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  badgeColor?: string;
  isTier?: boolean;
}) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [src]);

  const shouldRenderImage = !loadError && Boolean(src);

  const sizeClasses = {
    sm: "w-8 h-8 text-[11px]",
    md: "w-9 h-9 text-xs",
    lg: "w-11 h-11 text-sm",
  }[size];

  const meta = category ? LADDER_META[category] : undefined;

  return (
    <div
      className={`relative ${sizeClasses} flex-shrink-0 flex items-center justify-center rounded-lg overflow-hidden border shadow-sm transition-all ${
        meta ? `${meta.bg} ${meta.border}` : "bg-black/50 border-white/10"
      } ${className}`}
      style={
        badgeColor && isTier
          ? { borderColor: `${badgeColor}60`, backgroundColor: `${badgeColor}18` }
          : undefined
      }
    >
      {shouldRenderImage ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain p-0.5"
          onError={() => setLoadError(true)}
        />
      ) : isTier ? (
        <div className="flex flex-col items-center justify-center">
          <Award size={size === "lg" ? 22 : 16} style={{ color: badgeColor || "#FF9800" }} />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center select-none">
          <span className="leading-none text-base sm:text-lg">{meta?.icon || "⭐"}</span>
        </div>
      )}

      {/* Level Tag Pill */}
      {typeof level === "number" && (
        <span className="absolute -bottom-0.5 -right-0.5 px-1 rounded bg-black/90 border border-purple-500/50 text-[9px] font-mono font-black text-purple-300 leading-tight shadow">
          L{level}
        </span>
      )}
    </div>
  );
}

export default function GamificationManagementPage() {
  const [activeTab, setActiveTab] = useState<"rules" | "tiers" | "badges" | "multipliers">("rules");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"success" | "error">("success");

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // ─── 1. Point Rules State ──────────────────────────────────────────────────
  const [rules, setRules] = useState<PointRuleItem[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [searchRule, setSearchRule] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRulePoints, setEditRulePoints] = useState<number>(10);
  const [editRuleDailyLimit, setEditRuleDailyLimit] = useState<number>(100);
  const [editRuleStatus, setEditRuleStatus] = useState<"active" | "inactive">("active");

  // New Rule Modal
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [newRuleId, setNewRuleId] = useState("");
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState<"FlipArena" | "ROAR" | "Referrals" | "System">("FlipArena");
  const [newRulePoints, setNewRulePoints] = useState(10);
  const [newRuleDailyLimit, setNewRuleDailyLimit] = useState(100);
  const [newRuleDescription, setNewRuleDescription] = useState("");

  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await axios.get("/api/admin/gamification/rules");
      if (res.data?.success && Array.isArray(res.data.rules)) {
        setRules(res.data.rules);
      }
    } catch (err) {
      console.error("Failed to fetch rules:", err);
      showToast("Failed to load point rules", "error");
    } finally {
      setLoadingRules(false);
    }
  }, []);

  const handleSaveRuleEdit = async (rule: PointRuleItem) => {
    try {
      const res = await axios.post("/api/admin/gamification/rules", {
        ...rule,
        points: editRulePoints,
        dailyLimit: editRuleDailyLimit,
        status: editRuleStatus,
      });
      if (res.data?.success) {
        showToast(`Rule "${rule.name}" updated successfully`);
        setEditingRuleId(null);
        fetchRules();
      }
    } catch (err) {
      showToast("Failed to update rule", "error");
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleId.trim() || !newRuleName.trim()) {
      showToast("ID and Name are required", "error");
      return;
    }
    try {
      const res = await axios.post("/api/admin/gamification/rules", {
        id: newRuleId.trim(),
        name: newRuleName.trim(),
        category: newRuleCategory,
        points: newRulePoints,
        dailyLimit: newRuleDailyLimit,
        status: "active",
        description: newRuleDescription.trim(),
      });
      if (res.data?.success) {
        showToast(`Rule "${newRuleName}" created successfully!`);
        setShowAddRuleModal(false);
        setNewRuleId("");
        setNewRuleName("");
        setNewRuleDescription("");
        fetchRules();
      }
    } catch (err) {
      showToast("Failed to create rule", "error");
    }
  };

  const handleDeleteRule = async (rule: PointRuleItem) => {
    if (!window.confirm(`Are you sure you want to delete rule "${rule.name}" (${rule.id})?`)) {
      return;
    }
    try {
      const res = await axios.delete(`/api/admin/gamification/rules?id=${encodeURIComponent(rule.id)}`);
      if (res.data?.success) {
        showToast(`Rule "${rule.name}" deleted successfully`);
        if (editingRuleId === rule.id) setEditingRuleId(null);
        fetchRules();
      } else {
        showToast(res.data?.error || "Failed to delete rule", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || "Failed to delete rule", "error");
    }
  };

  // ─── 2. Global Tiers State ─────────────────────────────────────────────────
  const [tiers, setTiers] = useState<GlobalTierItem[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierMin, setEditTierMin] = useState<number>(0);
  const [editTierMax, setEditTierMax] = useState<number | string>("");
  const [editTierSubLevels, setEditTierSubLevels] = useState<number>(3);
  const [editTierColor, setEditTierColor] = useState<string>("#FF9800");
  const [editTierIconUrl, setEditTierIconUrl] = useState<string>("");
  const [uploadingTierIcon, setUploadingTierIcon] = useState(false);

  // New Tier Modal
  const [showAddTierModal, setShowAddTierModal] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [newTierLevel, setNewTierLevel] = useState(8);
  const [newTierMin, setNewTierMin] = useState(300000);
  const [newTierMax, setNewTierMax] = useState<string>("");
  const [newTierSubLevels, setNewTierSubLevels] = useState(3);
  const [newTierColor, setNewTierColor] = useState("#7C4DFF");
  const [newTierIconUrl, setNewTierIconUrl] = useState("");
  const [newTierDescription, setNewTierDescription] = useState("");

  const handleUploadCloudinary = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data?.success && res.data.url) {
        showToast("Image uploaded to Cloudinary successfully!");
        return res.data.url;
      }
      showToast("Upload failed to return URL", "error");
      return null;
    } catch (err) {
      console.error("Cloudinary upload failed:", err);
      showToast("Failed to upload image to Cloudinary", "error");
      return null;
    }
  };

  const fetchTiers = useCallback(async () => {
    setLoadingTiers(true);
    try {
      const res = await axios.get("/api/admin/gamification/tiers");
      if (res.data?.success && Array.isArray(res.data.tiers)) {
        setTiers(res.data.tiers);
      }
    } catch (err) {
      console.error("Failed to fetch tiers:", err);
      showToast("Failed to load tiers", "error");
    } finally {
      setLoadingTiers(false);
    }
  }, []);

  const handleSaveTierEdit = async (tier: GlobalTierItem) => {
    try {
      const res = await axios.post("/api/admin/gamification/tiers", {
        ...tier,
        minSXP: editTierMin,
        maxSXP: editTierMax === "" ? null : Number(editTierMax),
        subLevels: editTierSubLevels,
        badgeColor: editTierColor,
        badgeIconUrl: editTierIconUrl,
      });
      if (res.data?.success) {
        showToast(`Tier "${tier.name}" updated successfully`);
        setEditingTierId(null);
        fetchTiers();
      }
    } catch (err) {
      showToast("Failed to update tier", "error");
    }
  };

  const handleDeleteTier = async (tier: GlobalTierItem) => {
    if (!window.confirm(`Are you sure you want to delete tier "${tier.name}" (Tier #${tier.tierLevel})?`)) {
      return;
    }
    try {
      const res = await axios.delete(`/api/admin/gamification/tiers?id=${encodeURIComponent(tier.id)}`);
      if (res.data?.success) {
        showToast(`Tier "${tier.name}" deleted successfully`);
        if (editingTierId === tier.id) setEditingTierId(null);
        fetchTiers();
      } else {
        showToast(res.data?.error || "Failed to delete tier", "error");
      }
    } catch (err: any) {
      showToast(err.response?.data?.error || "Failed to delete tier", "error");
    }
  };

  const handleCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTierName.trim()) {
      showToast("Tier name is required", "error");
      return;
    }
    try {
      const res = await axios.post("/api/admin/gamification/tiers", {
        name: newTierName.trim(),
        tierLevel: newTierLevel,
        minSXP: newTierMin,
        maxSXP: newTierMax === "" ? null : Number(newTierMax),
        subLevels: newTierSubLevels,
        badgeColor: newTierColor,
        badgeIconUrl: newTierIconUrl || undefined,
        description: newTierDescription.trim(),
      });
      if (res.data?.success) {
        showToast(`Tier "${newTierName}" created with badge!`);
        setShowAddTierModal(false);
        setNewTierName("");
        setNewTierIconUrl("");
        setNewTierDescription("");
        fetchTiers();
      }
    } catch (err) {
      showToast("Failed to create tier", "error");
    }
  };

  // ─── 3. Badge Ladders State ────────────────────────────────────────────────
  const [ladders, setLadders] = useState<FeatureLadderItem[]>([]);
  const [loadingLadders, setLoadingLadders] = useState(true);
  const [editingLadderId, setEditingLadderId] = useState<string | null>(null);
  const [editLadderLevels, setEditLadderLevels] = useState<EditableLevelItem[]>([]);
  const [uploadingLevelIdx, setUploadingLevelIdx] = useState<number | null>(null);

  const fetchLadders = useCallback(async () => {
    setLoadingLadders(true);
    try {
      const res = await axios.get("/api/admin/gamification/thresholds");
      if (res.data?.success && Array.isArray(res.data.ladders)) {
        setLadders(res.data.ladders);
      }
    } catch (err) {
      console.error("Failed to fetch ladders:", err);
      showToast("Failed to load badge ladders", "error");
    } finally {
      setLoadingLadders(false);
    }
  }, []);

  const handleUploadLevelBadge = async (idx: number, file: File) => {
    setUploadingLevelIdx(idx);
    const url = await handleUploadCloudinary(file);
    if (url) {
      const updated = [...editLadderLevels];
      updated[idx] = { ...updated[idx], icon: url };
      setEditLadderLevels(updated);
      showToast(`Level ${idx + 1} badge image uploaded to Cloudinary!`);
    }
    setUploadingLevelIdx(null);
  };

  const handleAddLevel = () => {
    const nextNum = editLadderLevels.length + 1;
    const lastThreshold = editLadderLevels[editLadderLevels.length - 1]?.threshold || 100;
    setEditLadderLevels([
      ...editLadderLevels,
      {
        name: `Level ${nextNum}`,
        threshold: Math.round(lastThreshold * 1.5),
        icon: "",
      },
    ]);
  };

  const handleSaveLadderEdit = async (ladder: FeatureLadderItem) => {
    try {
      const thresholds = editLadderLevels.map((l) => Math.max(1, parseInt(String(l.threshold), 10) || 1));
      const names = editLadderLevels.map((l) => l.name.trim() || `Level`);
      const icons = editLadderLevels.map((l) => l.icon.trim());

      if (names.some((n) => !n)) {
        showToast("All levels must have a title", "error");
        return;
      }

      const res = await axios.post("/api/admin/gamification/thresholds", {
        ...ladder,
        thresholds,
        names,
        icons,
      });

      if (res.data?.success) {
        showToast(`Ladder "${ladder.name}" updated with custom badge images!`);
        setEditingLadderId(null);
        fetchLadders();
      }
    } catch (err) {
      showToast("Failed to update ladder", "error");
    }
  };

  // ─── 4. Multipliers State ──────────────────────────────────────────────────
  const [multipliers, setMultipliers] = useState<MultipliersConfig | null>(null);
  const [loadingMultipliers, setLoadingMultipliers] = useState(true);
  const [savingMultipliers, setSavingMultipliers] = useState(false);

  const fetchMultipliers = useCallback(async () => {
    setLoadingMultipliers(true);
    try {
      const res = await axios.get("/api/admin/gamification/multipliers");
      if (res.data?.success && res.data.config) {
        setMultipliers(res.data.config);
      }
    } catch (err) {
      console.error("Failed to fetch multipliers:", err);
      showToast("Failed to load multipliers", "error");
    } finally {
      setLoadingMultipliers(false);
    }
  }, []);

  const handleSaveMultipliers = async () => {
    if (!multipliers) return;
    setSavingMultipliers(true);
    try {
      const res = await axios.post("/api/admin/gamification/multipliers", multipliers);
      if (res.data?.success) {
        showToast("Streak multipliers & boosts updated successfully!");
        fetchMultipliers();
      }
    } catch (err) {
      showToast("Failed to save multipliers", "error");
    } finally {
      setSavingMultipliers(false);
    }
  };

  useEffect(() => {
    fetchRules();
    fetchTiers();
    fetchLadders();
    fetchMultipliers();
  }, [fetchRules, fetchTiers, fetchLadders, fetchMultipliers]);

  // Filtered Rules
  const filteredRules = rules.filter((r) => {
    if (!searchRule.trim()) return true;
    const q = searchRule.toLowerCase();
    return r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 p-6 lg:p-8 font-sans">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-6 right-6 z-[99999] px-5 py-3 rounded-xl text-xs font-bold text-white shadow-2xl flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-4 ${
            toastType === "success"
              ? "bg-emerald-600/95 border border-emerald-400/40"
              : "bg-red-600/95 border border-red-400/40"
          }`}
        >
          {toastType === "success" ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#21262d]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400">
              <Trophy size={22} />
            </span>
            <h1 className="text-xl lg:text-2xl font-black text-white tracking-tight">
              Gamification & SXP Engine Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/15 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
              DYNAMIC RULES
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Configure SXP point weights, add new global reputation tiers (e.g. Mythic), expand badge ladders to Level 6+, and tune multipliers on the fly.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              fetchRules();
              fetchTiers();
              fetchLadders();
              fetchMultipliers();
              showToast("All gamification configurations refreshed!");
            }}
            className="px-3.5 py-2 rounded-xl bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] text-xs font-semibold text-gray-300 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw size={14} />
            <span>Refresh All</span>
          </button>
        </div>
      </div>

      {/* Main 4-Tab Navigation */}
      <div className="mt-6 flex items-center gap-2 border-b border-[#21262d] pb-0 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("rules")}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap border-t border-x ${
            activeTab === "rules"
              ? "bg-[#161b22] text-amber-400 border-[#30363d] border-b-2 border-b-amber-500"
              : "bg-transparent text-gray-400 border-transparent hover:text-white"
          }`}
        >
          <Zap size={15} />
          <span>1. Point Rules & SXP Weights</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-gray-300">{rules.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("tiers")}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap border-t border-x ${
            activeTab === "tiers"
              ? "bg-[#161b22] text-blue-400 border-[#30363d] border-b-2 border-b-blue-500"
              : "bg-transparent text-gray-400 border-transparent hover:text-white"
          }`}
        >
          <Shield size={15} />
          <span>2. Global Reputation Tiers</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-gray-300">{tiers.length} Tiers</span>
        </button>

        <button
          onClick={() => setActiveTab("badges")}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap border-t border-x ${
            activeTab === "badges"
              ? "bg-[#161b22] text-purple-400 border-[#30363d] border-b-2 border-b-purple-500"
              : "bg-transparent text-gray-400 border-transparent hover:text-white"
          }`}
        >
          <Award size={15} />
          <span>3. Badge Ladders & Cutoffs</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-gray-300">{ladders.length} Ladders</span>
        </button>

        <button
          onClick={() => setActiveTab("multipliers")}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap border-t border-x ${
            activeTab === "multipliers"
              ? "bg-[#161b22] text-rose-400 border-[#30363d] border-b-2 border-b-rose-500"
              : "bg-transparent text-gray-400 border-transparent hover:text-white"
          }`}
        >
          <Flame size={15} />
          <span>4. Streaks & Multipliers</span>
        </button>
      </div>

      {/* ─── TAB 1: POINT RULES & SXP WEIGHTS ────────────────────────────────── */}
      {activeTab === "rules" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161b22] p-4 rounded-2xl border border-[#21262d]">
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search action or rule name..."
                value={searchRule}
                onChange={(e) => setSearchRule(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              onClick={() => setShowAddRuleModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-600/20 cursor-pointer self-start sm:self-auto"
            >
              <Plus size={15} />
              <span>Add Custom Point Rule</span>
            </button>
          </div>

          <div className="rounded-2xl bg-[#161b22] border border-[#21262d] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-[#0d1117] text-gray-400 uppercase text-[10px] font-bold border-b border-[#21262d]">
                  <tr>
                    <th className="py-3 px-4">Action / Event Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">SXP Points</th>
                    <th className="py-3 px-4">Daily Cap</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Quick Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {loadingRules ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-500 font-semibold">
                        Loading point rules...
                      </td>
                    </tr>
                  ) : filteredRules.map((rule) => {
                    const isEditing = editingRuleId === rule.id;

                    return (
                      <tr key={rule.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-bold text-white">{rule.name}</p>
                          <p className="text-[10px] font-mono text-gray-500">{rule.id}</p>
                          {rule.description && (
                            <p className="text-[10px] text-gray-400 mt-0.5">{rule.description}</p>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              rule.category === "FlipArena"
                                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                : rule.category === "ROAR"
                                ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                                : rule.category === "Referrals"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                            }`}
                          >
                            {rule.category}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              value={editRulePoints}
                              onChange={(e) => setEditRulePoints(parseInt(e.target.value, 10) || 0)}
                              className="w-20 px-2 py-1 bg-[#0d1117] border border-amber-500 rounded-lg text-xs font-black text-amber-400 focus:outline-none"
                            />
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-black text-amber-400">
                              +{rule.points} SXP
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isEditing ? (
                            <input
                              type="number"
                              min={1}
                              value={editRuleDailyLimit}
                              onChange={(e) => setEditRuleDailyLimit(parseInt(e.target.value, 10) || 1)}
                              className="w-20 px-2 py-1 bg-[#0d1117] border border-gray-600 rounded-lg text-xs font-semibold text-white focus:outline-none"
                            />
                          ) : (
                            <span className="font-mono text-gray-300">{rule.dailyLimit} / day</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isEditing ? (
                            <select
                              value={editRuleStatus}
                              onChange={(e) => setEditRuleStatus(e.target.value as "active" | "inactive")}
                              className="px-2 py-1 bg-[#0d1117] border border-gray-600 rounded-lg text-xs text-white focus:outline-none"
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          ) : (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                rule.status === "active"
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                  : "bg-red-500/15 text-red-400 border border-red-500/30"
                              }`}
                            >
                              {rule.status === "active" ? "Active" : "Disabled"}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleSaveRuleEdit(rule)}
                                className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                                title="Save"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                onClick={() => setEditingRuleId(null)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                                title="Cancel"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingRuleId(rule.id);
                                  setEditRulePoints(rule.points);
                                  setEditRuleDailyLimit(rule.dailyLimit);
                                  setEditRuleStatus(rule.status);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer text-xs font-semibold inline-flex items-center gap-1.5"
                              >
                                <Pencil size={12} />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDeleteRule(rule)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                                title="Delete Rule"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: GLOBAL REPUTATION TIERS ──────────────────────────────────── */}
      {activeTab === "tiers" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161b22] p-4 rounded-2xl border border-[#21262d]">
            <div>
              <h3 className="text-sm font-bold text-white">Global Reputation Ranks ({tiers.length} Tiers)</h3>
              <p className="text-xs text-gray-400">Total cumulative SXP thresholds. Admins can add Tier 8, 9 (e.g. Mythic, Immortal) anytime.</p>
            </div>

            <button
              onClick={() => {
                setNewTierLevel(tiers.length + 1);
                setShowAddTierModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black flex items-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer self-start sm:self-auto"
            >
              <Plus size={15} />
              <span>Add New Global Tier</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loadingTiers ? (
              <div className="col-span-full py-12 text-center text-gray-500 font-semibold">
                Loading reputation tiers...
              </div>
            ) : tiers.map((tier) => {
              const isEditing = editingTierId === tier.id;

              return (
                <div
                  key={tier.id}
                  className="rounded-2xl bg-[#161b22] border border-[#21262d] p-5 flex flex-col justify-between hover:border-blue-500/40 transition-all shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BadgeThumbnail
                          src={tier.badgeIconUrl || GLOBAL_TIER_ICONS[tier.name] || `/images/badges/global${tier.name.toLowerCase()}.png`}
                          alt={tier.name}
                          badgeColor={tier.badgeColor}
                          isTier={true}
                          size="sm"
                        />
                        <span className="text-[10px] font-mono font-bold text-gray-500">Tier #{tier.tierLevel}</span>
                      </div>
                      <span
                        className="w-2.5 h-2.5 rounded-full shadow-sm"
                        style={{ backgroundColor: tier.badgeColor }}
                      />
                    </div>

                    <h4 className="text-base font-black text-white mt-1" style={{ color: tier.badgeColor }}>
                      {tier.name}
                    </h4>
                    {tier.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{tier.description}</p>
                    )}

                    <div className="mt-4 p-3 rounded-xl bg-[#0d1117] border border-[#21262d] space-y-2 text-xs">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] text-gray-500 block">Min SXP:</label>
                            <input
                              type="number"
                              value={editTierMin}
                              onChange={(e) => setEditTierMin(parseInt(e.target.value, 10) || 0)}
                              className="w-full px-2 py-1 bg-[#161b22] border border-blue-500 rounded text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block">Max SXP (empty for +):</label>
                            <input
                              type="text"
                              value={editTierMax}
                              onChange={(e) => setEditTierMax(e.target.value)}
                              placeholder="e.g. 999 or leave empty"
                              className="w-full px-2 py-1 bg-[#161b22] border border-blue-500 rounded text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block">Sub-Levels Count:</label>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={editTierSubLevels}
                              onChange={(e) => setEditTierSubLevels(parseInt(e.target.value, 10) || 1)}
                              className="w-full px-2 py-1 bg-[#161b22] border border-blue-500 rounded text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block">Badge Color Hex:</label>
                            <input
                              type="text"
                              value={editTierColor}
                              onChange={(e) => setEditTierColor(e.target.value)}
                              className="w-full px-2 py-1 bg-[#161b22] border border-blue-500 rounded text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 block mb-1">Badge Icon (Cloudinary):</label>
                            <div className="flex items-center gap-2">
                              {editTierIconUrl ? (
                                <div className="relative group flex-shrink-0">
                                  <BadgeThumbnail
                                    src={editTierIconUrl}
                                    alt="Preview"
                                    badgeColor={editTierColor}
                                    isTier={true}
                                    size="sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditTierIconUrl("");
                                      showToast("Tier badge image removed");
                                    }}
                                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-[9px] shadow cursor-pointer"
                                    title="Delete image"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ) : null}
                              <label className="flex-1 cursor-pointer flex items-center justify-center gap-1.5 px-2 py-1.5 bg-[#161b22] hover:bg-white/5 border border-dashed border-[#30363d] rounded-lg text-[11px] text-gray-300">
                                <Upload size={12} className="text-blue-400" />
                                <span>{uploadingTierIcon ? "Uploading..." : editTierIconUrl ? "Replace Badge" : "Upload Badge"}</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingTierIcon}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setUploadingTierIcon(true);
                                    const url = await handleUploadCloudinary(file);
                                    if (url) setEditTierIconUrl(url);
                                    setUploadingTierIcon(false);
                                  }}
                                />
                              </label>
                              {editTierIconUrl ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditTierIconUrl("");
                                    showToast("Tier badge image removed");
                                  }}
                                  className="px-2 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Delete Badge Image"
                                >
                                  <Trash2 size={12} />
                                  <span>Delete</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-500">SXP Range:</span>
                            <span className="font-mono font-bold text-white">
                              {tier.minSXP.toLocaleString()} – {tier.maxSXP !== null ? tier.maxSXP.toLocaleString() : "Infinity"} SXP
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Sub-Ranks:</span>
                            <span className="font-bold text-gray-300">
                              {tier.subLevels > 1 ? `${tier.subLevels} Levels (${tier.name} I to ${["", "I", "II", "III", "IV", "V"][tier.subLevels] || tier.subLevels})` : "Pinnacle (Single)"}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                    <div>
                      {tier.tierLevel > 7 && !isEditing && (
                        <button
                          onClick={() => handleDeleteTier(tier)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                          title="Delete Custom Tier"
                        >
                          <Trash2 size={12} />
                          <span>Delete Tier</span>
                        </button>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveTierEdit(tier)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTierId(null)}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingTierId(tier.id);
                          setEditTierMin(tier.minSXP);
                          setEditTierMax(tier.maxSXP !== null ? String(tier.maxSXP) : "");
                          setEditTierSubLevels(tier.subLevels);
                          setEditTierColor(tier.badgeColor);
                          setEditTierIconUrl(tier.badgeIconUrl || GLOBAL_TIER_ICONS[tier.name] || "");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Pencil size={12} />
                        <span>Edit Tier</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 3: BADGE LADDERS & CUTOFFS ──────────────────────────────────── */}
      {activeTab === "badges" && (
        <div className="mt-6 space-y-4">
          <div className="bg-[#161b22] p-4 rounded-2xl border border-[#21262d]">
            <h3 className="text-sm font-bold text-white">10 Feature Mastery Ladders (Expandable to Level 6, 7+)</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Edit action thresholds and badge titles for each skill ladder. To add Level 6 or 7, append more numbers and titles separated by commas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingLadders ? (
              <div className="col-span-full py-12 text-center text-gray-500 font-semibold">
                Loading badge ladders...
              </div>
            ) : ladders.map((ladder) => {
              const isEditing = editingLadderId === ladder.id;

              return (
                <div
                  key={ladder.id}
                  className="rounded-2xl bg-[#161b22] border border-[#21262d] p-5 hover:border-purple-500/40 transition-all flex flex-col justify-between shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        {ladder.category}
                      </span>
                      <span className="text-[11px] font-mono text-gray-400 font-bold">
                        {ladder.thresholds.length} Levels
                      </span>
                    </div>

                    <h4 className="text-sm font-black text-white mt-2 flex items-center gap-2">
                      <Award size={16} className="text-purple-400" />
                      <span>{ladder.name}</span>
                    </h4>

                    {isEditing ? (
                      <div className="mt-4 space-y-3 p-3 bg-[#0d1117] rounded-xl border border-purple-500/40">
                        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                          <span className="text-xs font-bold text-gray-200">Levels & Upload Badge Images</span>
                          <span className="text-[11px] text-gray-500 font-mono">Unit: {ladder.unit}</span>
                        </div>

                        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                          {editLadderLevels.map((level, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                            >
                              <div className="flex items-center gap-3">
                                {/* Badge Image Thumbnail + Direct Upload + Delete X */}
                                <div className="relative group flex-shrink-0">
                                  <BadgeThumbnail
                                    src={level.icon}
                                    alt={level.name}
                                    category={ladder.id}
                                    level={idx + 1}
                                    size="lg"
                                  />

                                  {level.icon ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updated = [...editLadderLevels];
                                        updated[idx] = { ...updated[idx], icon: "" };
                                        setEditLadderLevels(updated);
                                        showToast(`Badge image removed for Level ${idx + 1}`);
                                      }}
                                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-[9px] shadow z-10 cursor-pointer"
                                      title="Delete image"
                                    >
                                      <X size={10} />
                                    </button>
                                  ) : null}

                                  <label className="cursor-pointer absolute inset-0 bg-black/75 rounded-lg opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-[9px] text-white transition-opacity">
                                    <Upload size={12} className="text-purple-300 mb-0.5" />
                                    <span>{uploadingLevelIdx === idx ? "..." : "Change"}</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      disabled={uploadingLevelIdx === idx}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUploadLevelBadge(idx, file);
                                      }}
                                    />
                                  </label>
                                </div>

                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold">
                                      Level {idx + 1}
                                    </span>
                                    <label className="cursor-pointer text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold">
                                      <Upload size={10} />
                                      <span>{uploadingLevelIdx === idx ? "Uploading..." : "Upload Badge"}</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        disabled={uploadingLevelIdx === idx}
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) handleUploadLevelBadge(idx, file);
                                        }}
                                      />
                                    </label>
                                    {level.icon ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = [...editLadderLevels];
                                          updated[idx] = { ...updated[idx], icon: "" };
                                          setEditLadderLevels(updated);
                                          showToast(`Badge image removed for Level ${idx + 1}`);
                                        }}
                                        className="cursor-pointer text-[10px] text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold transition-colors"
                                        title="Delete custom badge image"
                                      >
                                        <Trash2 size={10} />
                                        <span>Delete Image</span>
                                      </button>
                                    ) : null}
                                  </div>
                                  <input
                                    type="text"
                                    value={level.name}
                                    placeholder="Badge Title (e.g. Master)"
                                    onChange={(e) => {
                                      const updated = [...editLadderLevels];
                                      updated[idx].name = e.target.value;
                                      setEditLadderLevels(updated);
                                    }}
                                    className="px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs text-white font-bold focus:outline-none focus:border-purple-500 w-36 sm:w-44"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={1}
                                    value={level.threshold}
                                    onChange={(e) => {
                                      const updated = [...editLadderLevels];
                                      updated[idx].threshold = parseInt(e.target.value, 10) || 1;
                                      setEditLadderLevels(updated);
                                    }}
                                    className="w-16 px-2 py-1 bg-[#0d1117] border border-[#30363d] rounded-lg text-xs font-mono text-purple-300 text-right focus:outline-none focus:border-purple-500 font-bold"
                                  />
                                  <span className="text-[10px] text-gray-500 font-mono">{ladder.unit}</span>
                                </div>

                                {idx >= 5 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = editLadderLevels.filter((_, i) => i !== idx);
                                      setEditLadderLevels(updated);
                                    }}
                                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer"
                                    title="Remove Level"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleAddLevel}
                          className="w-full py-2 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Plus size={13} />
                          <span>Add Level {editLadderLevels.length + 1}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {ladder.names.map((badgeName, idx) => {
                          const defaultIcon =
                            FEATURE_ICONS[ladder.id as FeatureKey]?.[idx] ||
                            `/images/badges/${ladder.id}l${idx + 1}.png`;
                          const iconUrl = ladder.icons?.[idx] || defaultIcon;

                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#0d1117] border border-[#21262d] text-xs hover:border-purple-500/30 transition-all"
                            >
                              <div className="flex items-center gap-3">
                                <BadgeThumbnail
                                  src={iconUrl}
                                  alt={badgeName}
                                  category={ladder.id}
                                  level={idx + 1}
                                  size="md"
                                />
                                <div>
                                  <span className="font-bold text-gray-200 block text-xs">{badgeName}</span>
                                  <span className="text-[10px] text-gray-500 font-mono">Level {idx + 1}</span>
                                </div>
                              </div>

                              <span className="font-mono text-purple-300 font-bold text-xs bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                                {ladder.thresholds[idx] || "?"} {ladder.unit}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-end">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveLadderEdit(ladder)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer shadow-md"
                        >
                          Save Changes
                        </button>
                        <button
                          onClick={() => setEditingLadderId(null)}
                          className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-400 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingLadderId(ladder.id);
                          const levels: EditableLevelItem[] = ladder.names.map((name, idx) => {
                            const defaultIcon =
                              FEATURE_ICONS[ladder.id as FeatureKey]?.[idx] ||
                              `/images/badges/${ladder.id}l${idx + 1}.png`;
                            return {
                              name,
                              threshold: ladder.thresholds[idx] || (idx + 1) * 10,
                              icon: ladder.icons?.[idx] || defaultIcon,
                            };
                          });
                          setEditLadderLevels(levels);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold text-gray-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Pencil size={12} />
                        <span>Edit Thresholds & Add Levels</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 4: STREAKS & MULTIPLIERS ────────────────────────────────────── */}
      {activeTab === "multipliers" && (
        <div className="mt-6 space-y-6 max-w-3xl">
          <div className="bg-[#161b22] p-5 rounded-2xl border border-[#21262d] space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Flame size={18} className="text-rose-400" />
              <span>Global Multipliers & Anti-Spam Limits</span>
            </h3>

            {loadingMultipliers || !multipliers ? (
              <div className="py-12 text-center text-gray-500 font-semibold">
                Loading multipliers config...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                    <label className="text-xs font-bold text-gray-300 block mb-1">
                      Match-Day Boost (Multiplier)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="1.0"
                      value={multipliers.matchDayBoost}
                      onChange={(e) =>
                        setMultipliers({ ...multipliers, matchDayBoost: parseFloat(e.target.value) || 1.0 })
                      }
                      className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-xs font-bold text-amber-400 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">e.g. 1.2 = +20% during live matches</p>
                  </div>

                  <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                    <label className="text-xs font-bold text-gray-300 block mb-1">
                      Squad Boost (Multiplier)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="1.0"
                      value={multipliers.squadBoost}
                      onChange={(e) =>
                        setMultipliers({ ...multipliers, squadBoost: parseFloat(e.target.value) || 1.0 })
                      }
                      className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-xs font-bold text-emerald-400 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">e.g. 1.1 = +10% when active with squad</p>
                  </div>

                  <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d]">
                    <label className="text-xs font-bold text-gray-300 block mb-1">
                      Daily Consumption Cap (SXP)
                    </label>
                    <input
                      type="number"
                      min="50"
                      value={multipliers.dailyCapConsumption}
                      onChange={(e) =>
                        setMultipliers({ ...multipliers, dailyCapConsumption: parseInt(e.target.value, 10) || 300 })
                      }
                      className="w-full px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-xs font-bold text-rose-400 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Max daily points from casual reactions</p>
                  </div>
                </div>

                {/* Streak Curve */}
                <div className="p-4 bg-[#0d1117] rounded-xl border border-[#30363d] space-y-3">
                  <h4 className="text-xs font-bold text-gray-200">Daily Login Streak Multiplier Brackets</h4>
                  <div className="space-y-2">
                    {multipliers.streakBrackets.map((bracket, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-xs">
                        <span className="w-28 text-gray-400 font-semibold">{bracket.days}+ Days:</span>
                        <input
                          type="number"
                          step="0.05"
                          min="1.0"
                          value={bracket.multiplier}
                          onChange={(e) => {
                            const newBrackets = [...multipliers.streakBrackets];
                            newBrackets[idx].multiplier = parseFloat(e.target.value) || 1.0;
                            setMultipliers({ ...multipliers, streakBrackets: newBrackets });
                          }}
                          className="w-24 px-2 py-1 bg-[#161b22] border border-[#30363d] rounded text-xs font-bold text-white focus:outline-none"
                        />
                        <input
                          type="text"
                          value={bracket.label}
                          onChange={(e) => {
                            const newBrackets = [...multipliers.streakBrackets];
                            newBrackets[idx].label = e.target.value;
                            setMultipliers({ ...multipliers, streakBrackets: newBrackets });
                          }}
                          className="flex-1 px-2 py-1 bg-[#161b22] border border-[#30363d] rounded text-xs text-gray-300 focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleSaveMultipliers}
                    disabled={savingMultipliers}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white text-xs font-black shadow-lg shadow-rose-600/25 cursor-pointer disabled:opacity-50"
                  >
                    {savingMultipliers ? "Saving..." : "Save Multipliers & Boosts"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD CUSTOM POINT RULE ────────────────────────────────────── */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Plus size={16} className="text-amber-400" />
                <span>Create Custom SXP Rule</span>
              </h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1">Rule ID (UPPERCASE) *</label>
                <input
                  type="text"
                  placeholder="e.g. SQUAD_MATCH_WIN_BONUS"
                  value={newRuleId}
                  onChange={(e) => setNewRuleId(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1">Rule Display Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Squad Match Win Bonus"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">Category</label>
                  <select
                    value={newRuleCategory}
                    onChange={(e) => setNewRuleCategory(e.target.value as any)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none"
                  >
                    <option value="FlipArena">FlipArena</option>
                    <option value="ROAR">ROAR</option>
                    <option value="Referrals">Referrals</option>
                    <option value="System">System</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">SXP Points *</label>
                  <input
                    type="number"
                    min={0}
                    value={newRulePoints}
                    onChange={(e) => setNewRulePoints(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs font-bold text-amber-400 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1">Daily Cap (Max Times / Day)</label>
                <input
                  type="number"
                  min={1}
                  value={newRuleDailyLimit}
                  onChange={(e) => setNewRuleDailyLimit(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Short explanation of when points are awarded"
                  value={newRuleDescription}
                  onChange={(e) => setNewRuleDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#21262d] text-xs font-semibold text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black shadow-lg shadow-amber-600/30 cursor-pointer"
                >
                  Create Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD GLOBAL TIER ──────────────────────────────────────────── */}
      {showAddTierModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#21262d] flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Plus size={16} className="text-blue-400" />
                <span>Add Global Reputation Tier</span>
              </h3>
              <button
                onClick={() => setShowAddTierModal(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateTier} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">Tier Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Mythic"
                    value={newTierName}
                    onChange={(e) => setNewTierName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">Tier Order Level *</label>
                  <input
                    type="number"
                    min={1}
                    value={newTierLevel}
                    onChange={(e) => setNewTierLevel(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs font-mono text-white focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">Min SXP *</label>
                  <input
                    type="number"
                    min={0}
                    value={newTierMin}
                    onChange={(e) => setNewTierMin(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs font-mono text-white focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">Max SXP (empty for +)</label>
                  <input
                    type="text"
                    placeholder="leave empty for pinnacle"
                    value={newTierMax}
                    onChange={(e) => setNewTierMax(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs font-mono text-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">Sub-Levels (I, II, III)</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newTierSubLevels}
                    onChange={(e) => setNewTierSubLevels(parseInt(e.target.value, 10) || 3)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-200 block mb-1">Badge Color Hex</label>
                  <input
                    type="text"
                    value={newTierColor}
                    onChange={(e) => setNewTierColor(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs font-mono text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1">Badge Image (Upload to Cloudinary)</label>
                <div className="flex items-center gap-3">
                  {newTierIconUrl ? (
                    <div className="relative">
                      <img
                        src={newTierIconUrl}
                        alt="Tier Badge Preview"
                        className="w-12 h-12 object-contain rounded-xl bg-black/50 p-1.5 border border-blue-500/50 shadow-md"
                      />
                      <button
                        type="button"
                        onClick={() => setNewTierIconUrl("")}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center text-[10px] cursor-pointer"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-3 py-2 bg-[#0d1117] hover:bg-white/5 border border-dashed border-[#30363d] hover:border-blue-500 rounded-xl text-xs text-gray-300 transition-colors">
                    <Upload size={14} className="text-blue-400" />
                    <span>{uploadingTierIcon ? "Uploading to Cloudinary..." : newTierIconUrl ? "Replace Badge Icon" : "Upload Badge Image (PNG/SVG)"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingTierIcon}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingTierIcon(true);
                        const url = await handleUploadCloudinary(file);
                        if (url) setNewTierIconUrl(url);
                        setUploadingTierIcon(false);
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-200 block mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Transcendent prestige rank"
                  value={newTierDescription}
                  onChange={(e) => setNewTierDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-xl text-xs text-white focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddTierModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#21262d] text-xs font-semibold text-gray-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg shadow-blue-600/30 cursor-pointer"
                >
                  Create Tier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
