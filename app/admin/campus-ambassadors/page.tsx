"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  GraduationCap,
  Users,
  Search,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  X,
  Building,
  UserCheck,
  Shield,
  Phone,
  Mail,
  Filter,
  SlidersHorizontal,
  LayoutGrid,
  List as ListIcon,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export interface CampusAmbassador {
  id: string;
  campusName: string;
  campusSlug: string;
  userId: string;
  userName: string;
  userEmail: string;
  avatar?: string;
  role: string;
  bio?: string;
  phone?: string;
  status: "active" | "inactive";
  createdAt: number;
  updatedAt: number;
}

export interface PlatformUser {
  userId?: string;
  id?: string;
  userName?: string;
  username?: string;
  name?: string;
  userEmail?: string;
  email?: string;
  avatarUrl?: string;
  photoURL?: string;
  picture?: string;
  avatar?: string;
  [key: string]: any;
}

const PRESET_CAMPUSES = [
  "Symbiosis",
  "Symbiosis SSSS",
  "IIT Bombay",
  "IIT Delhi",
  "IIT Madras",
  "IIM Ahmedabad",
  "IIM Bangalore",
  "BITS Pilani",
  "Delhi University",
  "Christ University",
  "SRM University",
  "Manipal University",
  "Ashoka University",
  "St. Xavier's College",
];

const PRESET_ROLES = [
  "Campus Ambassador",
  "Lead Campus Ambassador",
  "Campus Sports Lead",
  "Sports Secretary",
  "Student Ambassador",
  "Symbiosis Ambassador",
];

export default function CampusAmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<CampusAmbassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Platform Users for selection
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCampusFilter, setSelectedCampusFilter] = useState("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAmbassador, setEditingAmbassador] = useState<CampusAmbassador | null>(null);
  const [deleteAmbassador, setDeleteAmbassador] = useState<CampusAmbassador | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form State
  const [formCampusName, setFormCampusName] = useState("Symbiosis");
  const [formCustomCampus, setFormCustomCampus] = useState("");
  const [formUserId, setFormUserId] = useState("");
  const [formUserName, setFormUserName] = useState("");
  const [formUserEmail, setFormUserEmail] = useState("");
  const [formAvatar, setFormAvatar] = useState("");
  const [formRole, setFormRole] = useState("Campus Ambassador");
  const [formCustomRole, setFormCustomRole] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");

  // User search within modal
  const [userPickerSearch, setUserPickerSearch] = useState("");
  const [showUserPicker, setShowUserPicker] = useState(false);

  // Feedback Toast
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    fetchAmbassadors();
    fetchPlatformUsers();
  }, []);

  const fetchAmbassadors = async () => {
    try {
      setRefreshing(true);
      const res = await axios.get("/api/campus-ambassadors");
      if (res.data.success) {
        setAmbassadors(res.data.ambassadors || []);
      }
    } catch (err: any) {
      console.error("Failed to load campus ambassadors:", err);
      showToast(err.response?.data?.error || "Failed to load campus ambassadors", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPlatformUsers = async () => {
    try {
      setUsersLoading(true);
      const res = await axios.get("/api/users");
      const list = res.data?.users || res.data?.data?.users || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      setPlatformUsers(list);
    } catch (err) {
      console.warn("Notice: could not load user picker list:", err);
    } finally {
      setUsersLoading(false);
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingAmbassador(null);
    setFormCampusName("Symbiosis");
    setFormCustomCampus("");
    setFormUserId("");
    setFormUserName("");
    setFormUserEmail("");
    setFormAvatar("");
    setFormRole("Campus Ambassador");
    setFormCustomRole("");
    setFormBio("");
    setFormPhone("");
    setFormStatus("active");
    setUserPickerSearch("");
    setShowUserPicker(false);
    setModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (amb: CampusAmbassador) => {
    setEditingAmbassador(amb);
    const isPresetCampus = PRESET_CAMPUSES.includes(amb.campusName);
    setFormCampusName(isPresetCampus ? amb.campusName : "custom");
    setFormCustomCampus(isPresetCampus ? "" : amb.campusName);

    setFormUserId(amb.userId || "");
    setFormUserName(amb.userName || "");
    setFormUserEmail(amb.userEmail || "");
    setFormAvatar(amb.avatar || "");

    const isPresetRole = PRESET_ROLES.includes(amb.role);
    setFormRole(isPresetRole ? amb.role : "custom");
    setFormCustomRole(isPresetRole ? "" : amb.role);

    setFormBio(amb.bio || "");
    setFormPhone(amb.phone || "");
    setFormStatus(amb.status || "active");
    setUserPickerSearch("");
    setShowUserPicker(false);
    setModalOpen(true);
  };

  // Select User from platform list
  const handleSelectUser = (u: PlatformUser) => {
    const uId = u.userId || u.id || u.actualUserId || u.email || "";
    const name = u.userName || u.name || u.username || (u.userEmail || u.email || "").split("@")[0] || "Student";
    const email = u.userEmail || u.email || "";
    const img = u.avatarUrl || u.photoURL || u.picture || u.avatar || "";

    setFormUserId(String(uId));
    setFormUserName(name);
    setFormUserEmail(email);
    setFormAvatar(img);
    setShowUserPicker(false);
  };

  // Save Ambassador (Create / Edit)
  const handleSaveAmbassador = async (e: React.FormEvent) => {
    e.preventDefault();

    const resolvedCampus =
      formCampusName === "custom"
        ? formCustomCampus.trim()
        : formCampusName.trim();

    if (!resolvedCampus) {
      alert("Please select or enter a campus / college name.");
      return;
    }

    if (!formUserName.trim()) {
      alert("Please provide the ambassador's name or select a user from the platform.");
      return;
    }

    const resolvedRole =
      formRole === "custom"
        ? formCustomRole.trim() || "Campus Ambassador"
        : formRole.trim();

    setActionLoading(true);

    try {
      const payload = {
        ...(editingAmbassador ? { id: editingAmbassador.id } : {}),
        campusName: resolvedCampus,
        userId: formUserId.trim() || (editingAmbassador ? editingAmbassador.userId : undefined),
        userName: formUserName.trim(),
        userEmail: formUserEmail.trim(),
        avatar: formAvatar.trim(),
        role: resolvedRole,
        bio: formBio.trim(),
        phone: formPhone.trim(),
        status: formStatus,
      };

      if (editingAmbassador) {
        const res = await axios.put("/api/campus-ambassadors", payload);
        if (res.data.success) {
          showToast("Campus ambassador updated successfully!");
          setModalOpen(false);
          await fetchAmbassadors();
        }
      } else {
        const res = await axios.post("/api/campus-ambassadors", payload);
        if (res.data.success) {
          showToast("Campus ambassador assigned successfully!");
          setModalOpen(false);
          await fetchAmbassadors();
        }
      }
    } catch (err: any) {
      console.error("Failed to save campus ambassador:", err);
      showToast(err.response?.data?.error || err.message || "Failed to save ambassador", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Ambassador
  const handleConfirmDelete = async () => {
    if (!deleteAmbassador) return;
    setActionLoading(true);

    try {
      const res = await axios.delete(`/api/campus-ambassadors?id=${encodeURIComponent(deleteAmbassador.id)}`);
      if (res.data.success) {
        showToast("Campus ambassador removed successfully.");
        setAmbassadors((prev) => prev.filter((a) => a.id !== deleteAmbassador.id));
        setDeleteAmbassador(null);
      } else {
        showToast(res.data.error || "Failed to delete ambassador", "error");
      }
    } catch (err: any) {
      console.error("Delete failed:", err);
      showToast(err.response?.data?.error || "Failed to delete ambassador", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Users in modal picker
  const filteredPickerUsers = useMemo(() => {
    if (!userPickerSearch.trim()) return platformUsers.slice(0, 15);
    const q = userPickerSearch.toLowerCase().trim();
    return platformUsers
      .filter((u) => {
        const name = (u.userName || u.name || u.username || "").toLowerCase();
        const email = (u.userEmail || u.email || "").toLowerCase();
        const id = String(u.userId || u.id || "").toLowerCase();
        return name.includes(q) || email.includes(q) || id.includes(q);
      })
      .slice(0, 20);
  }, [platformUsers, userPickerSearch]);

  // Unique campus list from ambassadors
  const uniqueCampuses = useMemo(() => {
    const s = new Set<string>();
    ambassadors.forEach((a) => {
      if (a.campusName) s.add(a.campusName);
    });
    return Array.from(s).sort();
  }, [ambassadors]);

  // Client-side Filtered ambassadors
  const filteredAmbassadors = useMemo(() => {
    let list = [...ambassadors];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((a) => {
        const name = (a.userName || "").toLowerCase();
        const email = (a.userEmail || "").toLowerCase();
        const campus = (a.campusName || "").toLowerCase();
        const role = (a.role || "").toLowerCase();
        return name.includes(q) || email.includes(q) || campus.includes(q) || role.includes(q);
      });
    }

    if (selectedCampusFilter !== "all") {
      list = list.filter((a) => a.campusName.toLowerCase() === selectedCampusFilter.toLowerCase());
    }

    if (selectedStatusFilter !== "all") {
      list = list.filter((a) => a.status === selectedStatusFilter);
    }

    return list;
  }, [ambassadors, searchQuery, selectedCampusFilter, selectedStatusFilter]);

  // Metrics
  const metrics = useMemo(() => {
    const total = ambassadors.length;
    const active = ambassadors.filter((a) => a.status === "active").length;
    const campusSet = new Set(ambassadors.map((a) => a.campusName.toLowerCase()));
    const symbiosisCount = ambassadors.filter((a) => a.campusName.toLowerCase().includes("symbiosis")).length;

    return {
      total,
      active,
      campusCount: campusSet.size,
      symbiosisCount,
    };
  }, [ambassadors]);

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 p-6 lg:p-8">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#21262d]">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-2xl">🎓</span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Campus Ambassadors Management
            </h1>
            <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-mono font-semibold">
              api/campus-ambassadors
            </span>
            <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-mono font-semibold">
              DynamoDB + Firestore
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Assign, manage, and promote student leaders as official Campus Ambassadors for Symbiosis and colleges nationwide.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950/40 border border-emerald-400/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Assign New Ambassador</span>
          </button>

          <button
            onClick={fetchAmbassadors}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#161b22] hover:bg-[#1f242c] border border-[#30363d] rounded-lg text-xs font-semibold text-gray-300 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Toast Notification ────────────────────────────────────────────── */}
      {toastMessage && (
        <div
          className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/40 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-gray-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Metrics Summary Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-gray-600 transition-colors">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Total Ambassadors</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.total}</div>
          <div className="text-[11px] text-gray-500 mt-1">Across all registered colleges</div>
        </div>

        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-blue-500/40 transition-colors">
          <div className="flex items-center justify-between text-xs text-blue-400 font-semibold">
            <span>Active Campus Leads</span>
            <UserCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.active}</div>
          <div className="text-[11px] text-blue-400/70 mt-1">Currently highlighted on leaderboard</div>
        </div>

        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 flex flex-col justify-between hover:border-purple-500/40 transition-colors">
          <div className="flex items-center justify-between text-xs text-purple-400 font-semibold">
            <span>Colleges Covered</span>
            <Building className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.campusCount}</div>
          <div className="text-[11px] text-purple-300/70 mt-1">Distinct institutions</div>
        </div>

        <div className="bg-[#161b22] border border-amber-500/30 rounded-xl p-4 flex flex-col justify-between hover:border-amber-400 transition-colors">
          <div className="flex items-center justify-between text-xs text-amber-400 font-semibold">
            <span>Symbiosis Ambassadors</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">{metrics.symbiosisCount}</div>
          <div className="text-[11px] text-amber-400/70 mt-1">Symbiosis SSSS & campuses</div>
        </div>
      </div>

      {/* ── Search & Filter Controls ────────────────────────────────────────── */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-4 mb-6 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ambassador name, email, college, or role..."
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-8 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
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

          {/* Campus Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedCampusFilter}
              onChange={(e) => setSelectedCampusFilter(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Campuses</option>
              {uniqueCampuses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Statuses ({ambassadors.length})</option>
              <option value="active">Active ({metrics.active})</option>
              <option value="inactive">Inactive ({metrics.total - metrics.active})</option>
            </select>
          </div>

          {/* View Mode */}
          <div className="flex items-center border border-[#30363d] rounded-lg overflow-hidden bg-[#0d1117]">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${
                viewMode === "grid" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-2 transition-colors ${
                viewMode === "table" ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              title="Table View"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Content: Grid or Table ───────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-16 text-center text-gray-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-medium">Loading campus ambassadors from DynamoDB &amp; Firestore...</p>
        </div>
      ) : filteredAmbassadors.length === 0 ? (
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl p-16 text-center text-gray-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-base font-semibold text-white">No Campus Ambassadors found</p>
          <p className="text-xs text-gray-500 mt-1">
            {searchQuery || selectedCampusFilter !== "all" || selectedStatusFilter !== "all"
              ? "Try clearing your filters or search query."
              : "Assign your first student leader as a Campus Ambassador using the button above."}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        /* ── GRID VIEW ───────────────────────────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAmbassadors.map((amb) => {
            const isSymbiosis = amb.campusName.toLowerCase().includes("symbiosis");
            const initial = (amb.userName?.charAt(0) || "A").toUpperCase();

            return (
              <div
                key={amb.id}
                className="bg-[#161b22] border border-[#21262d] hover:border-gray-600 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl group relative overflow-hidden"
              >
                {/* Accent Top Bar */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isSymbiosis
                      ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                      : "bg-gradient-to-r from-emerald-500 to-teal-400"
                  }`}
                />

                <div>
                  {/* College & Status Badge */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                        isSymbiosis
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      <Building className="w-3 h-3" />
                      <span>{amb.campusName}</span>
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        amb.status === "active"
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-gray-500/15 text-gray-400 border border-gray-500/30"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          amb.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-gray-400"
                        }`}
                      />
                      <span className="capitalize">{amb.status}</span>
                    </span>
                  </div>

                  {/* Ambassador Profile Row */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-white/20 bg-gradient-to-br from-emerald-500/30 to-purple-600/30 flex items-center justify-center text-white font-bold text-base shadow-sm">
                      {amb.avatar ? (
                        <img
                          src={amb.avatar}
                          alt={amb.userName}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-white truncate">{amb.userName}</h3>
                      <p className="text-xs text-gray-400 truncate flex items-center gap-1 mt-0.5">
                        <Mail className="w-3 h-3 shrink-0 text-gray-500" />
                        <span>{amb.userEmail || "No email"}</span>
                      </p>
                      <span className="inline-block mt-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {amb.role}
                      </span>
                    </div>
                  </div>

                  {/* Bio or Phone */}
                  {(amb.bio || amb.phone) && (
                    <div className="mt-3.5 pt-3 border-t border-[#21262d] text-xs text-gray-400 space-y-1">
                      {amb.bio && <p className="text-[11px] line-clamp-2 text-gray-300">{amb.bio}</p>}
                      {amb.phone && (
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-gray-600" />
                          <span>{amb.phone}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="mt-4 pt-3 border-t border-[#21262d] flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 font-mono">
                    ID: {amb.userId ? amb.userId.slice(0, 14) : amb.id.slice(0, 12)}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEdit(amb)}
                      className="p-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white transition-colors cursor-pointer"
                      title="Edit Ambassador"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteAmbassador(amb)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer"
                      title="Remove Ambassador"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ── TABLE VIEW ──────────────────────────────────────────────────────── */
        <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="bg-[#0d1117] text-gray-400 uppercase text-[10px] border-b border-[#21262d]">
              <tr>
                <th className="px-4 py-3 font-semibold">Ambassador</th>
                <th className="px-4 py-3 font-semibold">College / Campus</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262d]">
              {filteredAmbassadors.map((amb) => {
                const initial = (amb.userName?.charAt(0) || "A").toUpperCase();
                const isSymbiosis = amb.campusName.toLowerCase().includes("symbiosis");

                return (
                  <tr key={amb.id} className="hover:bg-[#1f242c] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/20 bg-gradient-to-br from-emerald-500/30 to-purple-600/30 flex items-center justify-center text-white font-bold text-xs">
                          {amb.avatar ? (
                            <img src={amb.avatar} alt={amb.userName} className="w-full h-full object-cover" />
                          ) : (
                            <span>{initial}</span>
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-white block">{amb.userName}</span>
                          <span className="text-[10px] text-gray-500 font-mono">ID: {amb.userId || amb.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                          isSymbiosis
                            ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                        }`}
                      >
                        {amb.campusName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-emerald-400">{amb.role}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-[11px]">{amb.userEmail || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          amb.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-gray-500/15 text-gray-400 border border-gray-500/30"
                        }`}
                      >
                        {amb.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(amb)}
                          className="p-1.5 rounded-lg bg-[#21262d] hover:bg-[#30363d] text-gray-300 hover:text-white"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteAmbassador(amb)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* ── Assign / Edit Ambassador Modal ──────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {editingAmbassador ? "Edit Campus Ambassador" : "Assign Campus Ambassador"}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveAmbassador} className="p-6 space-y-4">
              {/* College / Campus Selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Select College / Campus <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formCampusName}
                  onChange={(e) => setFormCampusName(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                >
                  {PRESET_CAMPUSES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="custom">-- Custom / Other College --</option>
                </select>

                {formCampusName === "custom" && (
                  <input
                    type="text"
                    value={formCustomCampus}
                    onChange={(e) => setFormCustomCampus(e.target.value)}
                    placeholder="Enter custom college / institution name (e.g. Loyola College)"
                    className="w-full mt-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    required
                  />
                )}
              </div>

              {/* User Selection Section */}
              <div className="pt-2 border-t border-[#21262d]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-gray-300">
                    Ambassador User <span className="text-rose-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowUserPicker(!showUserPicker)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold cursor-pointer underline"
                  >
                    <Search className="w-3 h-3" />
                    <span>{showUserPicker ? "Hide User Search" : "Select User from Platform"}</span>
                  </button>
                </div>

                {/* Autocomplete User Search Picker */}
                {showUserPicker && (
                  <div className="mb-3 p-3 bg-[#0d1117] border border-emerald-500/30 rounded-xl space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userPickerSearch}
                        onChange={(e) => setUserPickerSearch(e.target.value)}
                        placeholder="Search users by name, email, or user ID..."
                        className="w-full bg-[#161b22] border border-[#30363d] rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {usersLoading ? (
                        <p className="text-[11px] text-gray-400 text-center py-2">Loading users...</p>
                      ) : filteredPickerUsers.length === 0 ? (
                        <p className="text-[11px] text-gray-500 text-center py-2">No users matched search.</p>
                      ) : (
                        filteredPickerUsers.map((u) => {
                          const name = u.userName || u.name || u.username || "User";
                          const email = u.userEmail || u.email || "";
                          const img = u.avatarUrl || u.photoURL || u.picture || u.avatar || "";
                          const initial = (name.charAt(0) || "U").toUpperCase();

                          return (
                            <div
                              key={u.userId || u.id || email}
                              onClick={() => handleSelectUser(u)}
                              className="flex items-center justify-between p-2 rounded-lg bg-[#161b22] hover:bg-emerald-950/30 hover:border-emerald-500/40 border border-transparent cursor-pointer transition-all"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full overflow-hidden bg-emerald-700/40 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                                  {img ? <img src={img} alt={name} className="w-full h-full object-cover" /> : initial}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-white truncate">{name}</p>
                                  <p className="text-[10px] text-gray-400 truncate">{email || "No email"}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-emerald-400 shrink-0">Select</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Direct Name & Email Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Ambassador Full Name</label>
                    <input
                      type="text"
                      value={formUserName}
                      onChange={(e) => setFormUserName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Student Email Address</label>
                    <input
                      type="email"
                      value={formUserEmail}
                      onChange={(e) => setFormUserEmail(e.target.value)}
                      placeholder="e.g. rahul@ssss.edu.in"
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2.5">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">User ID / Handle</label>
                    <input
                      type="text"
                      value={formUserId}
                      onChange={(e) => setFormUserId(e.target.value)}
                      placeholder="Platform User ID or Handle"
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Avatar / Photo URL</label>
                    <input
                      type="url"
                      value={formAvatar}
                      onChange={(e) => setFormAvatar(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Role & Status Section */}
              <div className="pt-2 border-t border-[#21262d]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Role / Title</label>
                    <select
                      value={formRole}
                      onChange={(e) => setFormRole(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                    >
                      {PRESET_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                      <option value="custom">-- Custom Role --</option>
                    </select>

                    {formRole === "custom" && (
                      <input
                        type="text"
                        value={formCustomRole}
                        onChange={(e) => setFormCustomRole(e.target.value)}
                        placeholder="e.g. Head of Sports Council"
                        className="w-full mt-2 bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="active">Active (Visible on Leaderboard)</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-[11px] text-gray-400 mb-1">Short Bio / Department (Optional)</label>
                  <textarea
                    rows={2}
                    value={formBio}
                    onChange={(e) => setFormBio(e.target.value)}
                    placeholder="e.g. Sports Management batch 2026, Basketball Captain"
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-[#30363d] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-950/50 cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingAmbassador ? "Save Changes" : "Assign Ambassador"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      {deleteAmbassador && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-white">Remove Campus Ambassador?</h3>
              <p className="text-xs text-gray-400 mt-1">
                Are you sure you want to remove <strong className="text-white">{deleteAmbassador.userName}</strong> as
                the ambassador for <strong className="text-emerald-400">{deleteAmbassador.campusName}</strong>?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteAmbassador(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={actionLoading}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-rose-950/50 cursor-pointer flex items-center gap-1.5"
              >
                {actionLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
