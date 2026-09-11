"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import {
  Search,
  Trash2,
  Eye,
  Pencil,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Users,
  Shield,
  Award,
  Layers,
  X,
  ExternalLink,
  ChevronRight,
  Database,
  Filter,
  CheckSquare,
  Square,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export interface MasterProfile {
  id: string;
  originalId: string;
  entityId: string;
  sk?: string;
  type: "athlete" | "player" | "team";
  name: string;
  sport: string;
  country: string;
  team: string;
  image: string;
  about: string;
  stats?: Record<string, any>;
  overview?: Record<string, any>;
  isVerified?: boolean;
  fanImpactScore?: number;
  source: string;
  tableOrCollection: string;
  createdAt?: number | string;
  updatedAt?: number | string;
  isDuplicate?: boolean;
  duplicateGroup?: string;
  duplicateCount?: number;
  raw?: Record<string, any>;
}

interface StatsSummary {
  total: number;
  athletes: number;
  players: number;
  teams: number;
  duplicates: number;
  duplicateGroups: number;
}

function MasterProfilesContent() {
  const searchParams = useSearchParams();
  const initialType = (searchParams.get("type") as "all" | "athlete" | "player" | "team") || "all";
  const initialDuplicates = searchParams.get("tab") === "duplicates";

  const [profiles, setProfiles] = useState<MasterProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<StatsSummary>({
    total: 0,
    athletes: 0,
    players: 0,
    teams: 0,
    duplicates: 0,
    duplicateGroups: 0,
  });

  // Filters
  const [activeTab, setActiveTab] = useState<"all" | "athlete" | "player" | "team">(initialType);
  const [searchQuery, setSearchQuery] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(initialDuplicates);
  const [selectedSport, setSelectedSport] = useState<string>("all");

  // Selection for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals state
  const [viewProfile, setViewProfile] = useState<MasterProfile | null>(null);
  const [editProfile, setEditProfile] = useState<MasterProfile | null>(null);
  const [deleteProfile, setDeleteProfile] = useState<MasterProfile | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit form fields
  const [editForm, setEditForm] = useState({
    name: "",
    sport: "",
    country: "",
    team: "",
    image: "",
    about: "",
    isVerified: false,
    fanImpactScore: 0,
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setRefreshing(true);

      // 1. Fetch concurrently from api/ms_players, api/ms_teams, and api/athleteProfile
      const [playersRes, teamsRes, athletesRes, adminAthletesRes] = await Promise.allSettled([
        axios.get("/api/ms_players"),
        axios.get("/api/ms_teams"),
        axios.get("/api/athleteProfile"),
        axios.get("/api/admin/athleteProfile"),
      ]);

      const loadedProfiles: MasterProfile[] = [];

      // Process api/ms_players
      if (playersRes.status === "fulfilled" && playersRes.value.data) {
        const rawPlayers =
          playersRes.value.data.players ||
          playersRes.value.data.data ||
          playersRes.value.data.items ||
          [];
        for (const item of rawPlayers) {
          const rawEntityId = item.entityId || "";
          const isAthleteEntity = rawEntityId.startsWith("ATHLETE#");
          const cleanId =
            item.playerId ||
            item.id ||
            rawEntityId.replace(/^(PLAYER|ATHLETE)#/, "");

          loadedProfiles.push({
            id: cleanId,
            originalId: item.playerId || cleanId,
            entityId: rawEntityId || (cleanId ? `PLAYER#${cleanId}` : ""),
            sk: item.sk || "PROFILE#META",
            type: isAthleteEntity ? "athlete" : "player",
            name: item.name || item.fullName || "Unnamed Player",
            sport: item.sportId || item.sport || "Cricket",
            country: item.country || "–",
            team: item.currentClubId || item.team || item.clubName || "–",
            image: item.profileImage || item.image || "",
            about: item.about || item.bio || item.role || "",
            stats: item.stats || {
              role: item.role,
              battingStyle: item.battingStyle,
              bowlingStyle: item.bowlingStyle,
              isCaptain: item.isCaptain,
              format: item.format,
              gender: item.gender,
              testCaps: item.testCaps,
              dateOfBirth: item.dateOfBirth,
              birthPlace: item.birthPlace,
              heightCm: item.heightCm,
            },
            overview: item.overview || {},
            isVerified: Boolean(item.isVerified || item.isCaptain),
            fanImpactScore: item.fanImpactScore || 0,
            source: "api/ms_players",
            tableOrCollection: "MS_Players",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            raw: item,
          });
        }
      }

      // Process api/ms_teams
      if (teamsRes.status === "fulfilled" && teamsRes.value.data) {
        const rawTeams =
          teamsRes.value.data.teams ||
          teamsRes.value.data.data ||
          teamsRes.value.data.items ||
          [];
        for (const item of rawTeams) {
          const rawEntityId = item.entityId || "";
          const cleanId =
            item.team_id || item.id || rawEntityId.replace(/^CLUB#/, "");

          loadedProfiles.push({
            id: cleanId,
            originalId: item.team_id || cleanId,
            entityId: rawEntityId || (cleanId ? `CLUB#${cleanId}` : ""),
            sk: item.sk || "CLUB#META",
            type: "team",
            name:
              item.clubName ||
              item.teamName ||
              item.name ||
              item.shortName ||
              "Unnamed Team",
            sport: item.sportId || item.sport || "Cricket",
            country: item.country || "–",
            team: item.shortName || item.clubType || "–",
            image: item.logoUrl || item.teamPhotoUrl || item.image || "",
            about: item.bio || (item.headCoach ? `Coach: ${item.headCoach}` : "") || "",
            stats: item.stats || {
              clubType: item.clubType,
              captain: item.captain,
              viceCaptain: item.viceCaptain,
              headCoach: item.headCoach,
              homeGround: item.homeGround,
              founded: item.founded,
              shortName: item.shortName,
              levelFormatId: item.levelFormatId,
            },
            overview: item.overview || {},
            isVerified: true,
            fanImpactScore: item.fanImpactScore || 0,
            source: "api/ms_teams",
            tableOrCollection: "MS_Clubs",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            raw: item,
          });
        }
      }

      // Process api/athleteProfile (SportsData)
      const existingAthleteKeys = new Set<string>();
      if (athletesRes.status === "fulfilled" && athletesRes.value.data) {
        const rawAthletes =
          athletesRes.value.data.athletes ||
          athletesRes.value.data.data ||
          athletesRes.value.data.items ||
          [];
        for (const item of rawAthletes) {
          const rawEntityId = item.entityId || "";
          const cleanId =
            item.athleteId ||
            item.id ||
            rawEntityId.replace(/^ATHLETE#/, "");

          if (cleanId) existingAthleteKeys.add(cleanId.toLowerCase());
          if (item.name) existingAthleteKeys.add(item.name.toLowerCase().trim());

          loadedProfiles.push({
            id: cleanId,
            originalId: item.athleteId || cleanId,
            entityId: rawEntityId || (cleanId ? `ATHLETE#${cleanId}` : ""),
            sk: item.sk || "PROFILE#META",
            type: "athlete",
            name: item.name || item.coreInfo?.name || "Unnamed Athlete",
            sport:
              item.sport ||
              item.sportId ||
              item.coreInfo?.discipline ||
              item.discipline ||
              "Athletics",
            country: item.country || item.coreInfo?.country || "–",
            team: item.team || item.coreInfo?.club || item.club || "–",
            image:
              item.profileImage ||
              item.image ||
              item.coreInfo?.profileImage ||
              "",
            about: item.about || item.bio || item.welcomeMessage || "",
            stats:
              item.performance?.stats ||
              item.stats ||
              item.analytics?.stats ||
              {},
            overview: item.coreInfo || item.overview || {},
            isVerified: Boolean(item.isVerified || item.coreInfo?.isVerified),
            fanImpactScore: item.fanImpactScore || 0,
            source: "api/athleteProfile",
            tableOrCollection: "SportsData",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            raw: item,
          });
        }
      }

      // Supplementary check from admin/athleteProfile (Firestore / IdentityAndAccess)
      if (
        adminAthletesRes.status === "fulfilled" &&
        adminAthletesRes.value.data?.data
      ) {
        const rawAdminAthletes = adminAthletesRes.value.data.data || [];
        for (const item of rawAdminAthletes) {
          const cleanId = item.id || "";
          const nameKey = (item.name || "").toLowerCase().trim();
          if (
            !existingAthleteKeys.has(cleanId.toLowerCase()) &&
            !existingAthleteKeys.has(nameKey)
          ) {
            existingAthleteKeys.add(cleanId.toLowerCase());
            existingAthleteKeys.add(nameKey);
            loadedProfiles.push({
              id: cleanId,
              originalId: cleanId,
              entityId: `ATHLETE#${cleanId}`,
              sk: "PROFILE#META",
              type: "athlete",
              name: item.name || "Unnamed Athlete",
              sport: item.sport || "Athletics",
              country: item.country || "–",
              team: "–",
              image: item.image || "",
              about: item.about || item.bio || "",
              stats: {},
              overview: item,
              isVerified: Boolean(item.isVerified),
              fanImpactScore: item.fanImpactScore || 0,
              source: "api/athleteProfile",
              tableOrCollection: "athletesProfile",
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              raw: item,
            });
          }
        }
      }

      // Fallback: If direct calls yielded 0 profiles, query /api/admin/master-profiles
      if (loadedProfiles.length === 0) {
        try {
          const fallbackRes = await axios.get("/api/admin/master-profiles");
          if (fallbackRes.data.success && fallbackRes.data.profiles) {
            setProfiles(fallbackRes.data.profiles);
            if (fallbackRes.data.counts) {
              setStats(fallbackRes.data.counts);
            }
            return;
          }
        } catch {}
      }

      // Duplicate detection across all combined profiles
      const nameGroups: Record<string, MasterProfile[]> = {};
      for (const p of loadedProfiles) {
        const norm = (p.name || "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .trim();
        if (norm) {
          if (!nameGroups[norm]) nameGroups[norm] = [];
          nameGroups[norm].push(p);
        }
      }

      let dupCount = 0;
      let dupGroupCount = 0;
      for (const group of Object.values(nameGroups)) {
        if (group.length > 1) {
          dupGroupCount++;
          for (const p of group) {
            p.isDuplicate = true;
            p.duplicateGroup = (p.name || "")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .trim();
            p.duplicateCount = group.length;
            dupCount++;
          }
        } else if (group.length === 1) {
          group[0].isDuplicate = false;
          group[0].duplicateCount = 1;
        }
      }

      setProfiles(loadedProfiles);
      setStats({
        total: loadedProfiles.length,
        athletes: loadedProfiles.filter((p) => p.type === "athlete").length,
        players: loadedProfiles.filter((p) => p.type === "player").length,
        teams: loadedProfiles.filter((p) => p.type === "team").length,
        duplicates: dupCount,
        duplicateGroups: dupGroupCount,
      });
    } catch (error) {
      console.error("Failed to load master profiles:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Distinct sports list for dropdown
  const availableSports = useMemo(() => {
    const sports = new Set<string>();
    profiles.forEach((p) => {
      if (p.sport && p.sport.trim()) sports.add(p.sport.trim());
    });
    return Array.from(sports).sort();
  }, [profiles]);

  // Client-side filtering
  const filteredProfiles = useMemo(() => {
    let result = profiles;

    // Type tab
    if (activeTab !== "all") {
      result = result.filter((p) => p.type === activeTab);
    }

    // Duplicates only
    if (duplicatesOnly) {
      result = result.filter((p) => p.isDuplicate);
    }

    // Sport filter
    if (selectedSport !== "all") {
      result = result.filter(
        (p) => (p.sport || "").toLowerCase() === selectedSport.toLowerCase()
      );
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sport.toLowerCase().includes(q) ||
          p.country.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.source.toLowerCase().includes(q)
      );
    }

    return result;
  }, [profiles, activeTab, duplicatesOnly, selectedSport, searchQuery]);

  // Group filtered duplicates for duplicate inspection
  const duplicateClusters = useMemo(() => {
    const clusters: Record<string, MasterProfile[]> = {};
    for (const p of filteredProfiles) {
      if (p.isDuplicate && p.duplicateGroup) {
        if (!clusters[p.duplicateGroup]) clusters[p.duplicateGroup] = [];
        clusters[p.duplicateGroup].push(p);
      }
    }
    return Object.values(clusters).filter((c) => c.length > 1);
  }, [filteredProfiles]);

  // Toggle single selection
  const toggleSelect = (profileKey: string) => {
    const next = new Set(selectedIds);
    if (next.has(profileKey)) {
      next.delete(profileKey);
    } else {
      next.add(profileKey);
    }
    setSelectedIds(next);
  };

  // Select all currently visible
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProfiles.length && filteredProfiles.length > 0) {
      setSelectedIds(new Set());
    } else {
      const allKeys = new Set(filteredProfiles.map((p) => `${p.type}:${p.id}:${p.source}`));
      setSelectedIds(allKeys);
    }
  };

  // Open Edit Modal
  const openEditModal = (p: MasterProfile) => {
    setEditProfile(p);
    setEditForm({
      name: p.name || "",
      sport: p.sport || "",
      country: p.country || "",
      team: p.team || "",
      image: p.image || "",
      about: p.about || "",
      isVerified: Boolean(p.isVerified),
      fanImpactScore: p.fanImpactScore || 0,
    });
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editProfile) return;
    try {
      setSavingEdit(true);
      const payload = {
        id: editProfile.id,
        originalId: editProfile.originalId,
        entityId: editProfile.entityId,
        sk: editProfile.sk,
        type: editProfile.type,
        source: editProfile.source,
        tableOrCollection: editProfile.tableOrCollection,
        ...editForm,
        stats: editProfile.stats,
        overview: editProfile.overview,
      };

      const res = await axios.put("/api/admin/master-profiles", payload);
      if (res.data.success) {
        setEditProfile(null);
        await fetchProfiles();
      } else {
        alert(res.data.message || "Failed to update profile");
      }
    } catch (err: any) {
      console.error("Save edit failed:", err);
      alert(err.response?.data?.message || "Failed to update profile");
    } finally {
      setSavingEdit(false);
    }
  };

  // Delete Single Profile
  const handleConfirmDeleteSingle = async () => {
    if (!deleteProfile) return;
    try {
      setActionLoading(true);
      const url = `/api/admin/master-profiles?id=${encodeURIComponent(
        deleteProfile.id
      )}&type=${encodeURIComponent(deleteProfile.type)}&entityId=${encodeURIComponent(
        deleteProfile.entityId
      )}&source=${encodeURIComponent(deleteProfile.source)}&sk=${encodeURIComponent(
        deleteProfile.sk || ""
      )}`;

      const res = await axios.delete(url);
      if (res.data.success) {
        setDeleteProfile(null);
        await fetchProfiles();
      } else {
        alert(res.data.message || "Failed to delete profile");
      }
    } catch (err: any) {
      console.error("Delete failed:", err);
      alert(err.response?.data?.message || "Failed to delete profile");
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk Delete Selected Profiles
  const handleConfirmBulkDelete = async () => {
    try {
      setActionLoading(true);
      const itemsToDelete: any[] = [];

      for (const p of profiles) {
        const key = `${p.type}:${p.id}:${p.source}`;
        if (selectedIds.has(key)) {
          itemsToDelete.push({
            id: p.id,
            type: p.type,
            entityId: p.entityId,
            sk: p.sk,
            source: p.source,
            tableOrCollection: p.tableOrCollection,
          });
        }
      }

      const res = await axios.delete("/api/admin/master-profiles", {
        data: { ids: itemsToDelete },
      });

      if (res.data.success) {
        setSelectedIds(new Set());
        setBulkDeleteConfirm(false);
        await fetchProfiles();
      } else {
        alert(res.data.message || "Failed bulk delete");
      }
    } catch (err: any) {
      console.error("Bulk delete failed:", err);
      alert(err.response?.data?.message || "Bulk delete failed");
    } finally {
      setActionLoading(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "athlete":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            🏃 Athlete
          </span>
        );
      case "player":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            🏏 Player
          </span>
        );
      case "team":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            🛡️ Team
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 p-6 lg:p-8">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#21262d]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl">🏆</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Master Profiles Hub
            </h1>
            <span className="ml-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-mono">
              api/ms_players
            </span>
            <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-mono">
              api/ms_teams
            </span>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono">
              api/athleteProfile
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Unified directory populated directly from <code className="text-blue-300 font-mono text-xs">api/ms_players</code>, <code className="text-purple-300 font-mono text-xs">api/ms_teams</code>, and <code className="text-emerald-300 font-mono text-xs">api/athleteProfile</code> with automated duplicate detection, deep view, edit, and cross-store management.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/admin/athlete-management/add"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22] hover:bg-[#1f242c] border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold transition-colors"
          >
            <span>+ Add Athlete</span>
          </Link>
          <Link
            href="/admin/player360-management/add-player360"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22] hover:bg-[#1f242c] border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold transition-colors"
          >
            <span>+ Add Player</span>
          </Link>
          <Link
            href="/admin/team360-management/add-team360"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161b22] hover:bg-[#1f242c] border border-purple-500/40 text-purple-300 rounded-lg text-xs font-semibold transition-colors"
          >
            <span>+ Add Team</span>
          </Link>
          <button
            onClick={fetchProfiles}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Metrics Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 my-6">
        {/* Total Profiles */}
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-gray-600 transition-colors">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Total Profiles</span>
            <Layers className="w-4 h-4 text-gray-500" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{stats.total}</div>
          <div className="text-[11px] text-gray-500 mt-1">Across all databases</div>
        </div>

        {/* Athletes */}
        <div
          onClick={() => setActiveTab(activeTab === "athlete" ? "all" : "athlete")}
          className={`cursor-pointer bg-[#161b22] border rounded-xl p-4 flex flex-col justify-between transition-colors ${
            activeTab === "athlete" ? "border-emerald-500 bg-emerald-950/10" : "border-[#21262d] hover:border-emerald-500/50"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Athletes</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{stats.athletes}</div>
          <div className="text-[11px] text-gray-500 mt-1">Track, Olympic & Field</div>
        </div>

        {/* Players */}
        <div
          onClick={() => setActiveTab(activeTab === "player" ? "all" : "player")}
          className={`cursor-pointer bg-[#161b22] border rounded-xl p-4 flex flex-col justify-between transition-colors ${
            activeTab === "player" ? "border-blue-500 bg-blue-950/10" : "border-[#21262d] hover:border-blue-500/50"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-blue-400">
            <span>Cricket Players</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{stats.players}</div>
          <div className="text-[11px] text-gray-500 mt-1">IPL, T20 & Masters</div>
        </div>

        {/* Teams */}
        <div
          onClick={() => setActiveTab(activeTab === "team" ? "all" : "team")}
          className={`cursor-pointer bg-[#161b22] border rounded-xl p-4 flex flex-col justify-between transition-colors ${
            activeTab === "team" ? "border-purple-500 bg-purple-950/10" : "border-[#21262d] hover:border-purple-500/50"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-purple-400">
            <span>Teams & Clubs</span>
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{stats.teams}</div>
          <div className="text-[11px] text-gray-500 mt-1">Clubs & Franchises</div>
        </div>

        {/* Duplicate Profiles Detected Alert Card */}
        <div
          onClick={() => setDuplicatesOnly(!duplicatesOnly)}
          className={`cursor-pointer bg-[#161b22] border rounded-xl p-4 flex flex-col justify-between transition-all ${
            stats.duplicates > 0
              ? duplicatesOnly
                ? "border-amber-500 ring-2 ring-amber-500/30 bg-amber-950/20"
                : "border-amber-500/50 hover:border-amber-500 bg-[#191512]"
              : "border-[#21262d] opacity-75"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>Duplicates Detected</span>
            <AlertTriangle className={`w-4 h-4 ${stats.duplicates > 0 ? "animate-pulse" : ""}`} />
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold text-white">{stats.duplicates}</span>
            <span className="text-xs text-amber-400/90 font-mono">
              ({stats.duplicateGroups} clusters)
            </span>
          </div>
          <div className="text-[11px] text-amber-300/80 mt-1">
            {stats.duplicates > 0
              ? duplicatesOnly
                ? "Showing duplicates only (Click to show all)"
                : "Click to filter duplicates only"
              : "No duplicates detected"}
          </div>
        </div>
      </div>

      {/* ── Filter Controls Bar ─────────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 mb-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0d1117] rounded-lg border border-[#30363d] overflow-x-auto">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "all" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              All Profiles ({profiles.length})
            </button>
            <button
              onClick={() => setActiveTab("athlete")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "athlete" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              🏃 Athletes ({stats.athletes})
            </button>
            <button
              onClick={() => setActiveTab("player")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "player" ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              🏏 Players ({stats.players})
            </button>
            <button
              onClick={() => setActiveTab("team")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === "team" ? "bg-purple-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
              }`}
            >
              🛡️ Teams ({stats.teams})
            </button>
          </div>

          {/* Quick Action: Duplicates Filter Switch */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDuplicatesOnly(!duplicatesOnly)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                duplicatesOnly
                  ? "bg-amber-500/20 text-amber-300 border-amber-500 shadow-sm"
                  : "bg-[#0d1117] text-gray-300 border-[#30363d] hover:border-amber-500/50"
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Duplicates Only</span>
              {stats.duplicates > 0 && (
                <span className="bg-amber-500 text-black px-1.5 py-0.2 rounded-full font-bold text-[10px]">
                  {stats.duplicates}
                </span>
              )}
            </button>

            {/* Bulk delete trigger if items selected */}
            {selectedIds.size > 0 && (
              <button
                onClick={() => setBulkDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 rounded-lg text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedIds.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* Search & Sport Dropdown */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-[#21262d]">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by profile name, sport, team, country, ID, or database table..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-8 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Sports ({availableSports.length})</option>
              {availableSports.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Duplicates Highlight Panel (if active) ─────────────────────────── */}
      {duplicatesOnly && duplicateClusters.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-950/20 border border-amber-500/40">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="font-semibold text-amber-300 text-sm">
                Duplicate Profile Clusters ({duplicateClusters.length})
              </h3>
            </div>
            <span className="text-xs text-amber-200/70">
              Multiple entries found with the same name. Compare below and delete the redundant copies.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
            {duplicateClusters.map((cluster, idx) => (
              <div
                key={idx}
                className="bg-[#161b22] border border-amber-500/30 rounded-lg p-3 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between font-semibold text-white">
                  <span>{cluster[0]?.name}</span>
                  <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px]">
                    {cluster.length} duplicate copies
                  </span>
                </div>
                <div className="space-y-1.5">
                  {cluster.map((item) => (
                    <div
                      key={`${item.id}-${item.source}`}
                      className="flex items-center justify-between p-2 rounded bg-[#0d1117] border border-[#21262d]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-6 h-6 rounded-full object-cover bg-gray-800"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-[10px] text-gray-400">
                            {item.name.charAt(0)}
                          </div>
                        )}
                        <span className="text-gray-300 font-mono text-[11px] truncate">
                          [{item.source}] ID: {item.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setViewProfile(item)}
                          className="text-blue-400 hover:text-blue-300 px-1"
                        >
                          View
                        </button>
                        <button
                          onClick={() => setDeleteProfile(item)}
                          className="text-red-400 hover:text-red-300 px-1 font-semibold"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Profiles Table ─────────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0d1117] border-b border-[#21262d] uppercase tracking-wider text-[11px] text-gray-400 font-semibold select-none">
              <tr>
                <th className="w-10 px-4 py-3.5 text-center">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === filteredProfiles.length && filteredProfiles.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3.5">Profile</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5">Sport / Team</th>
                <th className="px-4 py-3.5">Storage Location</th>
                <th className="px-4 py-3.5 text-center">Duplicate Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#21262d]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                    Scanning DynamoDB tables & Firestore collections...
                  </td>
                </tr>
              ) : filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-gray-500">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-gray-600" />
                    No profiles matched your current filters.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((profile) => {
                  const selectKey = `${profile.type}:${profile.id}:${profile.source}`;
                  const isSelected = selectedIds.has(selectKey);

                  return (
                    <tr
                      key={selectKey}
                      className={`hover:bg-[#1c2128] transition-colors ${
                        profile.isDuplicate ? "bg-amber-950/5 hover:bg-amber-950/15" : ""
                      } ${isSelected ? "bg-blue-950/20" : ""}`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(selectKey)}
                          className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Profile Image & Name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {profile.image ? (
                            <img
                              src={profile.image}
                              alt={profile.name}
                              className="w-10 h-10 rounded-full object-cover bg-gray-800 shrink-0 border border-gray-700"
                              onError={(e) => {
                                (e.target as any).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center font-bold text-gray-300 shrink-0 border border-gray-700">
                              {profile.name.charAt(0)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="font-semibold text-white text-sm flex items-center gap-1.5 truncate">
                              <span className="truncate">{profile.name}</span>
                              {profile.isVerified && (
                                <span className="text-blue-400" title="Verified">
                                  ✓
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-400 font-mono flex items-center gap-2 mt-0.5">
                              <span>ID: {profile.id}</span>
                              {profile.country && (
                                <span className="text-gray-500">• {profile.country}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {getTypeBadge(profile.type)}
                      </td>

                      {/* Sport & Team */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-gray-200">{profile.sport || "N/A"}</div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {profile.team || profile.country || "—"}
                        </div>
                      </td>

                      {/* Storage Location */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-gray-500" />
                          <span
                            className={`font-mono text-[11px] px-2 py-0.5 rounded font-semibold border ${
                              profile.source.includes("ms_players")
                                ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                                : profile.source.includes("ms_teams")
                                ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            }`}
                          >
                            {profile.source}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono mt-1">
                          Table: {profile.tableOrCollection}
                        </div>
                      </td>

                      {/* Duplicate Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {profile.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <AlertTriangle className="w-3 h-3 text-amber-400" />
                            Duplicate ({profile.duplicateCount} copies)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-gray-500 bg-gray-800/40">
                            Unique
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View */}
                          <button
                            onClick={() => setViewProfile(profile)}
                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                            title="View Full Profile"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => openEditModal(profile)}
                            className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                            title="Edit Profile"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => setDeleteProfile(profile)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Delete Profile"
                          >
                            <Trash2 className="w-4 h-4" />
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

        {/* Footer Count */}
        <div className="bg-[#0d1117] border-t border-[#21262d] px-4 py-3 flex items-center justify-between text-xs text-gray-400">
          <span>
            Showing <strong className="text-white">{filteredProfiles.length}</strong> of{" "}
            <strong className="text-white">{profiles.length}</strong> total profiles
          </span>
          {selectedIds.size > 0 && (
            <span className="text-blue-400 font-semibold">
              {selectedIds.size} profile(s) selected
            </span>
          )}
        </div>
      </div>

      {/* ── MODAL: View Profile ────────────────────────────────────────────── */}
      {viewProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {viewProfile.type === "athlete"
                    ? "🏃"
                    : viewProfile.type === "player"
                    ? "🏏"
                    : "🛡️"}
                </span>
                <div>
                  <h3 className="text-base font-bold text-white">{viewProfile.name}</h3>
                  <p className="text-xs text-gray-400">Profile Inspector & Diagnostics</p>
                </div>
              </div>
              <button
                onClick={() => setViewProfile(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              {/* Profile Card Summary */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-[#0d1117] border border-[#21262d]">
                {viewProfile.image ? (
                  <img
                    src={viewProfile.image}
                    alt={viewProfile.name}
                    className="w-16 h-16 rounded-full object-cover bg-gray-800 border-2 border-gray-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center text-xl font-bold text-gray-400">
                    {viewProfile.name.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-base">{viewProfile.name}</h4>
                    {getTypeBadge(viewProfile.type)}
                    {viewProfile.isDuplicate && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300">
                        Duplicate
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Sport: <span className="text-gray-200">{viewProfile.sport || "N/A"}</span> | Team:{" "}
                    <span className="text-gray-200">{viewProfile.team || "N/A"}</span> | Country:{" "}
                    <span className="text-gray-200">{viewProfile.country || "N/A"}</span>
                  </p>
                </div>
              </div>

              {/* Data Fields */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-500 block">ID:</span>
                  <span className="text-gray-200 font-mono">{viewProfile.id}</span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-500 block">Entity ID:</span>
                  <span className="text-gray-200 font-mono">{viewProfile.entityId}</span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-500 block">Origin Database:</span>
                  <span className="text-emerald-400 font-semibold">{viewProfile.source}</span>
                </div>
                <div className="p-3 bg-[#0d1117] rounded-lg border border-[#21262d]">
                  <span className="text-gray-500 block">Table / Collection:</span>
                  <span className="text-gray-200 font-mono">{viewProfile.tableOrCollection}</span>
                </div>
              </div>

              {/* Bio / About */}
              {viewProfile.about && (
                <div>
                  <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    About / Bio
                  </h5>
                  <div className="p-3 rounded-lg bg-[#0d1117] border border-[#21262d] text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {viewProfile.about}
                  </div>
                </div>
              )}

              {/* Raw JSON Inspect */}
              <div>
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Raw Storage Payload
                </h5>
                <pre className="p-3 rounded-lg bg-[#0d1117] border border-[#21262d] text-[11px] font-mono text-gray-300 overflow-x-auto max-h-48">
                  {JSON.stringify(viewProfile.raw || viewProfile, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#21262d] bg-[#0d1117]">
              <button
                onClick={() => {
                  setViewProfile(null);
                  openEditModal(viewProfile);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs transition-colors"
              >
                Edit Profile
              </button>
              <button
                onClick={() => setViewProfile(null)}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Edit Profile ────────────────────────────────────────────── */}
      {editProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#21262d]">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Edit Profile: {editProfile.name}</h3>
              </div>
              <button
                onClick={() => setEditProfile(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div>
                <label className="block text-gray-400 mb-1 font-semibold">Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 mb-1 font-semibold">Sport</label>
                  <input
                    type="text"
                    value={editForm.sport}
                    onChange={(e) => setEditForm({ ...editForm, sport: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1 font-semibold">Country</label>
                  <input
                    type="text"
                    value={editForm.country}
                    onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-semibold">Team / Club Affiliation</label>
                <input
                  type="text"
                  value={editForm.team}
                  onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-semibold">Image / Avatar URL</label>
                <input
                  type="text"
                  value={editForm.image}
                  onChange={(e) => setEditForm({ ...editForm, image: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1 font-semibold">Bio / About</label>
                <textarea
                  rows={3}
                  value={editForm.about}
                  onChange={(e) => setEditForm({ ...editForm, about: e.target.value })}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  placeholder="Profile description..."
                />
              </div>

              {editProfile.type === "athlete" && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-gray-400 mb-1 font-semibold">Fan Impact Score</label>
                    <input
                      type="number"
                      value={editForm.fanImpactScore}
                      onChange={(e) =>
                        setEditForm({ ...editForm, fanImpactScore: Number(e.target.value) })
                      }
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="verified"
                      checked={editForm.isVerified}
                      onChange={(e) => setEditForm({ ...editForm, isVerified: e.target.checked })}
                      className="rounded bg-gray-900 border-gray-600 text-blue-600"
                    />
                    <label htmlFor="verified" className="text-gray-300 font-semibold cursor-pointer">
                      Verified Athlete
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#21262d] bg-[#0d1117]">
              <button
                onClick={() => setEditProfile(null)}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition-colors"
              >
                {savingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Delete Single Confirmation ──────────────────────────────── */}
      {deleteProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="p-2 rounded-full bg-red-500/10 border border-red-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Profile</h3>
                <p className="text-xs text-gray-400">Irreversible dual-store deletion</p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              Are you sure you want to permanently delete{" "}
              <strong className="text-white">{deleteProfile.name}</strong> (
              <span className="text-gray-400 font-mono">{deleteProfile.id}</span>)?
            </p>

            <div className="p-3 bg-[#0d1117] border border-[#21262d] rounded-lg text-xs space-y-1 mb-6">
              <div className="text-gray-400">
                Type: <strong className="text-gray-200 capitalize">{deleteProfile.type}</strong>
              </div>
              <div className="text-gray-400">
                Origin: <strong className="text-emerald-400">{deleteProfile.source}</strong>
              </div>
              <div className="text-amber-400 text-[11px] pt-1">
                ✓ Will remove record from both DynamoDB and Firestore simultaneously.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteProfile(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteSingle}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs transition-colors"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Bulk Delete Confirmation ────────────────────────────────── */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-red-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <div className="p-2 rounded-full bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Bulk Delete {selectedIds.size} Profiles
                </h3>
                <p className="text-xs text-gray-400">Mass duplicate cleanup</p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              You are about to delete <strong className="text-white">{selectedIds.size}</strong>{" "}
              selected profiles across all databases. This action will permanently wipe them and
              cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={actionLoading}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkDelete}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs transition-colors"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Permanently Delete All Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MasterProfilesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-gray-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            <span>Loading Master Profiles Hub...</span>
          </div>
        </div>
      }
    >
      <MasterProfilesContent />
    </Suspense>
  );
}

