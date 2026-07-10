"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Eye,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Trophy,
  Users,
  MapPin,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

// ─── TYPES 

type Stats = { runs: string; sr: string; avg: string };
type Overview = { captain: string; coach: string; owner: string; venue: string };

type ClubProfile = {
  id: string;
  name: string;
  team: string;
  battingStyle: string;
  bowlingStyle: string;
  about: string;
  avatar: string;
  stats: Stats;
  overview: Overview;
  createdAt: number;
  updatedAt: number;
};

// ─── COMPONENT ─────────────────────────────────────────────────────────────────

export default function ClubProfileListPage() {
  const [profiles, setProfiles] = useState<ClubProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    fetchProfiles(currentPage);
  }, [currentPage]);

  const fetchProfiles = async (page: number) => {
    try {
      setLoading(true);
      const res = await axios.get(
        `/api/club-profile?limit=${LIMIT}&page=${page}`
      );
      setProfiles(res.data.profiles || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
      setTotalItems(res.data.pagination?.totalItems || 0);
    } catch (error) {
      console.error("Failed to fetch profiles", error);
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      "Delete this club profile? This action cannot be undone."
    );
    if (!confirmed) return;
    try {
      await axios.delete(`/api/club-profile/${id}`);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setTotalItems((prev) => prev - 1);
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete club profile");
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedRows(next);
  };

  const TABLE_HEADS = [
    "#",
    "Club",
    "Team",
    "Type",
    "Captain",
    "Venue",
    "Runs",
    "Avg",
    "SR",
    "Actions",
  ];

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      {/* ── Header ── */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold text-white">Club Profiles</h1>
          <p className="text-sm text-gray-400 mt-1">
            10 profile{totalItems !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link href="/admin/club-profile-management/add-club-profile">
          <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white text-sm transition">
             Create Club Profile
          </button>
        </Link>
      </div>

      {/* ── Table Card ── */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {TABLE_HEADS.map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                      <span className="text-sm">Loading profiles...</span>
                    </div>
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-500 text-sm">
                    No club profiles found
                  </td>
                </tr>
              ) : (
                profiles.map((profile, index) => (
                  <>
                    {/* ── Main Row ── */}
                    <tr
                      key={profile.id}
                      className="border-b border-[#21262d] hover:bg-[#0d1117] transition cursor-pointer"
                      onClick={() => toggleRow(profile.id)}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {(currentPage - 1) * LIMIT + index + 1}
                      </td>

                      {/* Club */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {profile.avatar ? (
                            <img
                              src={profile.avatar}
                              alt={profile.name}
                              className="w-9 h-9 rounded-full object-cover border border-[#30363d] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-[#21262d] flex items-center justify-center shrink-0">
                              <Trophy size={16} className="text-gray-600" />
                            </div>
                          )}
                          <div>
                            <p className="text-white text-sm font-medium leading-tight">
                              {profile.name}
                            </p>
                            <p className="text-gray-500 text-xs">{profile.bowlingStyle}</p>
                          </div>
                        </div>
                      </td>

                      {/* Team */}
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold bg-blue-900/30 text-blue-400 border border-blue-800/40 px-2 py-1 rounded">
                          {profile.team}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {profile.battingStyle || "—"}
                      </td>

                      {/* Captain */}
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {profile.overview?.captain || "—"}
                      </td>

                      {/* Venue */}
                      <td className="px-4 py-3 text-sm text-gray-400 max-w-[160px] truncate">
                        {profile.overview?.venue || "—"}
                      </td>

                      {/* Runs */}
                      <td className="px-4 py-3 text-sm text-gray-300 font-mono">
                        {profile.stats?.runs || "—"}
                      </td>

                      {/* Avg */}
                      <td className="px-4 py-3 text-sm text-gray-300 font-mono">
                        {profile.stats?.avg || "—"}
                      </td>

                      {/* SR */}
                      <td className="px-4 py-3 text-sm text-gray-300 font-mono">
                        {profile.stats?.sr || "—"}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRow(profile.id); }}
                            className="p-2 rounded-md bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition"
                            title={expandedRows.has(profile.id) ? "Collapse" : "Expand"}
                          >
                            {expandedRows.has(profile.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>

                          <Link href={`/admin/clubprofile-management/clubprofile-list/${profile.id}`}>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                              title="View Details"
                            >
                              <Eye size={16} />
                            </button>
                          </Link>

                          <Link href={`/admin/clubprofile-management/add-clubprofile?id=${profile.id}`}>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                              title="Edit"
                            >
                              <Pencil size={16} />
                            </button>
                          </Link>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                            className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded Row ── */}
                    {expandedRows.has(profile.id) && (
                      <tr className="bg-[#0a0f16] border-b border-[#21262d]">
                        <td colSpan={10} className="px-6 py-5">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                            {/* About */}
                            {profile.about && (
                              <div className="md:col-span-2">
                                <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">About</p>
                                <p className="text-sm text-gray-300 leading-relaxed">{profile.about}</p>
                              </div>
                            )}

                            {/* Overview grid */}
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Overview</p>
                              <OverviewItem icon={<Users size={13} />} label="Captain" value={profile.overview?.captain} />
                              <OverviewItem icon={<Users size={13} />} label="Coach" value={profile.overview?.coach} />
                              <OverviewItem icon={<Trophy size={13} />} label="Owner" value={profile.overview?.owner} />
                              <OverviewItem icon={<MapPin size={13} />} label="Venue" value={profile.overview?.venue} />
                            </div>
                          </div>

                          {/* Stats bar */}
                          <div className="mt-4 flex gap-4 pt-4 border-t border-[#21262d]">
                            <StatPill label="Runs" value={profile.stats?.runs} color="blue" />
                            <StatPill label="Strike Rate" value={profile.stats?.sr} color="green" />
                            <StatPill label="Average" value={profile.stats?.avg} color="yellow" />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#21262d]">
            <p className="text-xs text-gray-500">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded text-sm bg-[#21262d] text-gray-300 hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                ← Prev
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded text-sm bg-[#21262d] text-gray-300 hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function OverviewItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">{icon}</span>
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value?: string;
  color: "blue" | "green" | "yellow";
}) {
  const colors = {
    blue: "bg-blue-900/20 text-blue-300 border-blue-800/30",
    green: "bg-green-900/20 text-green-300 border-green-800/30",
    yellow: "bg-yellow-900/20 text-yellow-300 border-yellow-800/30",
  };
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded border ${colors[color]}`}>
      <TrendingUp size={12} />
      <span className="text-xs text-gray-400">{label}:</span>
      <span className="text-xs font-semibold">{value || "—"}</span>
    </div>
  );
}