// "use client";

// import { useEffect, useState, useMemo } from "react";
// import axios from "axios";
// import {
//   Eye, Pencil, Trash2, ChevronDown, ChevronUp,
//   Trophy, Users, MapPin, TrendingUp, Search, X, AlertTriangle,
// } from "lucide-react";
// import React from "react";
// import Link from "next/link";

// // ─── TYPES 

// type Stats = { runs: string; sr: string; avg: string };
// type Overview = { captain: string; coach: string; owner: string; venue: string };

// type PlayerProfile = {
//   id: string;
//   name: string;
//   team: string;
//   battingStyle: string;
//   bowlingStyle: string;
//   about: string;
//   avatar: string;
//   stats: Stats;
//   overview: Overview;
//   createdAt: number;
//   updatedAt: number;
// };

// // ─── COMPONENT 

// export default function PlayerProfileListPage() {
//   const [allProfiles, setAllProfiles] = useState<PlayerProfile[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [deletingAll, setDeletingAll] = useState(false);
//   const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
//   const [currentPage, setCurrentPage] = useState(1);
//   const [totalPages, setTotalPages] = useState(1);
//   const [totalItems, setTotalItems] = useState(0);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [debouncedQuery, setDebouncedQuery] = useState("");
//   const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
//   const [confirmText, setConfirmText] = useState("");
//   const LIMIT = 20;

//   // Debounce search input by 400ms
//   useEffect(() => {
//     const timer = setTimeout(() => {
//       setDebouncedQuery(searchQuery);
//       setCurrentPage(1); // Reset to page 1 on new search
//     }, 400);
//     return () => clearTimeout(timer);
//   }, [searchQuery]);

//   // Fetch all profiles on component mount
//   useEffect(() => {
//     fetchAllProfiles();
//   }, []);

//   const fetchAllProfiles = async () => {
//     try {
//       setLoading(true);
//       const res = await axios.get(`/api/player-profile?limit=1000`); // Fetch all profiles
//       setAllProfiles(res.data.profiles || []);
//       setTotalItems(res.data.profiles?.length || 0);
//     } catch (error) {
//       console.error("Failed to fetch profiles", error);
//       setAllProfiles([]);
//     } finally {
//       setLoading(false);
//     }
//   };

//   // Client-side filtering based on search query
//   const filteredProfiles = useMemo(() => {
//     if (!debouncedQuery.trim()) {
//       return allProfiles;
//     }
//     const query = debouncedQuery.toLowerCase().trim();
//     return allProfiles.filter(profile => 
//       profile.name.toLowerCase().includes(query) ||
//       profile.team.toLowerCase().includes(query) ||
//       profile.battingStyle.toLowerCase().includes(query) ||
//       profile.bowlingStyle.toLowerCase().includes(query)
//     );
//   }, [allProfiles, debouncedQuery]);

//   // Update pagination based on filtered results
//   useEffect(() => {
//     const totalFiltered = filteredProfiles.length;
//     setTotalPages(Math.ceil(totalFiltered / LIMIT));
//     setTotalItems(totalFiltered);
//   }, [filteredProfiles]);

//   // Get current page data
//   const currentProfiles = useMemo(() => {
//     const startIndex = (currentPage - 1) * LIMIT;
//     const endIndex = startIndex + LIMIT;
//     return filteredProfiles.slice(startIndex, endIndex);
//   }, [filteredProfiles, currentPage]);

//   const handleDelete = async (id: string) => {
//     const confirmed = window.confirm(
//       "Delete this player profile? This action cannot be undone."
//     );
//     if (!confirmed) return;
//     try {
//       await axios.delete(`/api/player-profile/${id}`);
//       setAllProfiles((prev) => prev.filter((p) => p.id !== id));
//       setTotalItems((prev) => prev - 1);
//     } catch (error) {
//       console.error("Delete failed", error);
//       alert("Failed to delete player profile");
//     }
//   };

//   const handleDeleteAll = async () => {
//     if (confirmText !== "DELETE ALL") {
//       alert('Please type "DELETE ALL" to confirm');
//       return;
//     }

//     setDeletingAll(true);
//     try {
//       // Method 1: Delete one by one (safer, shows progress)
//       let deletedCount = 0;
//       let failedCount = 0;
      
//       for (const profile of allProfiles) {
//         try {
//           await axios.delete(`/api/player-profile/${profile.id}`);
//           deletedCount++;
//           // Update progress every 10 deletions
//           if (deletedCount % 10 === 0) {
//             console.log(`Deleted ${deletedCount} of ${allProfiles.length} profiles`);
//           }
//         } catch (error) {
//           failedCount++;
//           console.error(`Failed to delete ${profile.name}:`, error);
//         }
        
//         // Small delay to avoid overwhelming the server
//         await new Promise(resolve => setTimeout(resolve, 50));
//       }
      
//       alert(`Successfully deleted ${deletedCount} profiles.\nFailed: ${failedCount}`);
      
//       // Refresh the list
//       await fetchAllProfiles();
//       setShowDeleteConfirm(false);
//       setConfirmText("");
      
//       // Reset to page 1
//       setCurrentPage(1);
//     } catch (error) {
//       console.error("Bulk delete failed", error);
//       alert("Failed to delete all profiles. Please try again.");
//     } finally {
//       setDeletingAll(false);
//     }
//   };

//   const toggleRow = (id: string) => {
//     const next = new Set(expandedRows);
//     next.has(id) ? next.delete(id) : next.add(id);
//     setExpandedRows(next);
//   };

//   const clearSearch = () => {
//     setSearchQuery("");
//     setDebouncedQuery("");
//     setCurrentPage(1);
//   };

//   const TABLE_HEADS = ["#", "Club", "Team", "Type", "Runs", "Avg", "SR", "Actions"];

//   return (
//     <div className="max-w-[1440px] mx-auto p-6">
//       {/* Delete All Confirmation Modal */}
//       {showDeleteConfirm && (
//         <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
//           <div className="bg-[#161b22] border border-red-500/30 rounded-lg max-w-md w-full p-6">
//             <div className="flex items-center gap-3 mb-4">
//               <div className="p-2 bg-red-500/10 rounded-full">
//                 <AlertTriangle className="text-red-500" size={24} />
//               </div>
//               <h2 className="text-xl font-semibold text-white">Delete All Profiles</h2>
//             </div>
            
//             <div className="mb-4">
//               <p className="text-gray-300 mb-2">
//                 You are about to delete <span className="font-bold text-red-400">{allProfiles.length}</span> player profiles.
//               </p>
//               <p className="text-red-400 text-sm mb-4">
//                 ⚠️ This action cannot be undone!
//               </p>
//               <p className="text-gray-400 text-sm mb-3">
//                 Type <span className="font-mono font-bold text-red-400">DELETE ALL</span> to confirm:
//               </p>
//               <input
//                 type="text"
//                 value={confirmText}
//                 onChange={(e) => setConfirmText(e.target.value)}
//                 placeholder="DELETE ALL"
//                 className="w-full bg-[#0d1117] border border-[#21262d] rounded-lg px-3 py-2 text-white focus:border-red-500 outline-none"
//                 autoFocus
//               />
//             </div>
            
//             <div className="flex gap-3">
//               <button
//                 onClick={() => {
//                   setShowDeleteConfirm(false);
//                   setConfirmText("");
//                 }}
//                 className="flex-1 px-4 py-2 rounded-lg bg-[#21262d] text-gray-300 hover:bg-[#30363d] transition"
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={handleDeleteAll}
//                 disabled={deletingAll || confirmText !== "DELETE ALL"}
//                 className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
//               >
//                 {deletingAll ? (
//                   <div className="flex items-center justify-center gap-2">
//                     <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
//                     <span>Deleting...</span>
//                   </div>
//                 ) : (
//                   "Delete All"
//                 )}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ── Header ── */}
//       <div className="mb-6 flex justify-between items-center gap-4 flex-wrap">
//         <div>
//           <h1 className="text-xl font-semibold text-white">Player Profiles</h1>
//           <p className="text-sm text-gray-400 mt-1">
//             {totalItems} profile{totalItems !== 1 ? "s" : ""} total
//             {debouncedQuery && (
//               <span className="ml-1 text-blue-400">
//                 for &quot;{debouncedQuery}&quot;
//               </span>
//             )}
//           </p>
//         </div>

//         <div className="flex items-center gap-3">
//           {/* Search Bar */}
//           <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 w-[260px] focus-within:border-blue-500 transition">
//             <Search size={15} className="text-gray-500 shrink-0" />
//             <input
//               type="text"
//               placeholder="Search by player name..."
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               className="bg-transparent outline-none text-sm text-white placeholder:text-gray-500 w-full ml-2"
//             />
//             {searchQuery && (
//               <button onClick={clearSearch} className="text-gray-500 hover:text-gray-300 transition ml-1">
//                 <X size={14} />
//               </button>
//             )}
//           </div>

//           {/* Delete All Button */}
//           {allProfiles.length > 0 && (
//             <button
//               onClick={() => setShowDeleteConfirm(true)}
//               className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white text-sm transition whitespace-nowrap flex items-center gap-2"
//             >
//               <Trash2 size={16} />
//               Delete All
//             </button>
//           )}

//           <Link href="/admin/playerprofile-management/add-playerprofile">
//             <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white text-sm transition whitespace-nowrap">
//               Create Player Profile
//             </button>
//           </Link>
//         </div>
//       </div>

//       {/* ── Table Card ── */}
//       <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
//         <div className="overflow-x-auto">
//           <table className="w-full min-w-[1100px]">
//             <thead className="bg-[#1c2330] border-b border-[#21262d]">
//               <tr>
//                 {TABLE_HEADS.map((h) => (
//                   <th
//                     key={h}
//                     className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
//                   >
//                     {h}
//                   </th>
//                 ))}
//               </tr>
//             </thead>

//             <tbody>
//               {loading ? (
//                 <tr>
//                   <td colSpan={10} className="text-center py-12 text-gray-500">
//                     <div className="flex flex-col items-center gap-2">
//                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
//                       <span className="text-sm">
//                         Loading profiles...
//                       </span>
//                     </div>
//                   </td>
//                 </tr>
//               ) : currentProfiles.length === 0 ? (
//                 <tr>
//                   <td colSpan={10} className="text-center py-12 text-sm">
//                     {debouncedQuery ? (
//                       <div className="flex flex-col items-center gap-2 text-gray-500">
//                         <Search size={32} className="text-gray-700" />
//                         <p>No players found for &quot;{debouncedQuery}&quot;</p>
//                         <button
//                           onClick={clearSearch}
//                           className="text-blue-400 hover:text-blue-300 text-xs underline mt-1"
//                         >
//                           Clear search
//                         </button>
//                       </div>
//                     ) : (
//                       <span className="text-gray-500">No player profiles found</span>
//                     )}
//                   </td>
//                 </tr>
//               ) : (
//                 currentProfiles.map((profile, index) => (
//                   <React.Fragment key={profile.id}>
//                     {/* ── Main Row ── */}
//                     <tr
//                       className="border-b border-[#21262d] hover:bg-[#0d1117] transition cursor-pointer"
//                       onClick={() => toggleRow(profile.id)}
//                     >
//                       <td className="px-4 py-3 text-sm text-gray-500">
//                         {(currentPage - 1) * LIMIT + index + 1}
//                       </td>

//                       <td className="px-4 py-3">
//                         <div className="flex items-center gap-3">
//                           {profile.avatar ? (
//                             <img
//                               src={profile.avatar}
//                               alt={profile.name}
//                               className="w-9 h-9 rounded-full object-cover border border-[#30363d] shrink-0"
//                             />
//                           ) : (
//                             <div className="w-9 h-9 rounded-full bg-[#21262d] flex items-center justify-center shrink-0">
//                               <Trophy size={16} className="text-gray-600" />
//                             </div>
//                           )}
//                           <div>
//                             <p className="text-white text-sm font-medium leading-tight">{profile.name}</p>
//                             <p className="text-gray-500 text-xs">{profile.bowlingStyle}</p>
//                           </div>
//                         </div>
//                       </td>

//                       <td className="px-4 py-3">
//                         <span className="text-xs font-bold bg-blue-900/30 text-blue-400 border border-blue-800/40 px-2 py-1 rounded">
//                           {profile.team}
//                         </span>
//                       </td>

//                       <td className="px-4 py-3 text-sm text-gray-300">{profile.battingStyle || "—"}</td>
//                       <td className="px-4 py-3 text-sm text-gray-300 font-mono">{profile.stats?.runs || "—"}</td>
//                       <td className="px-4 py-3 text-sm text-gray-300 font-mono">{profile.stats?.avg || "—"}</td>
//                       <td className="px-4 py-3 text-sm text-gray-300 font-mono">{profile.stats?.sr || "—"}</td>

//                       <td className="px-4 py-3">
//                         <div className="flex items-center gap-2">
//                           <button
//                             onClick={(e) => { e.stopPropagation(); toggleRow(profile.id); }}
//                             className="p-2 rounded-md bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition"
//                             title={expandedRows.has(profile.id) ? "Collapse" : "Expand"}
//                           >
//                             {expandedRows.has(profile.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
//                           </button>
//                           <Link href={`/admin/playerprofile-management/playerprofile-list/${profile.id}`}>
//                             <button
//                               onClick={(e) => e.stopPropagation()}
//                               className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
//                               title="View Details"
//                             >
//                               <Eye size={16} />
//                             </button>
//                           </Link>
//                           <Link href={`/admin/playerprofile-management/add-playerprofile?id=${profile.id}`}>
//                             <button
//                               onClick={(e) => e.stopPropagation()}
//                               className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
//                               title="Edit"
//                             >
//                               <Pencil size={16} />
//                             </button>
//                           </Link>
//                           <button
//                             onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
//                             className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
//                             title="Delete"
//                           >
//                             <Trash2 size={16} />
//                           </button>
//                         </div>
//                       </td>
//                     </tr>

//                     {/* ── Expanded Row ── */}
//                     {expandedRows.has(profile.id) && (
//                       <tr className="bg-[#0a0f16] border-b border-[#21262d]">
//                         <td colSpan={10} className="px-6 py-5">
//                           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//                             {profile.about && (
//                               <div className="md:col-span-2">
//                                 <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">About</p>
//                                 <p className="text-sm text-gray-300 leading-relaxed">{profile.about}</p>
//                               </div>
//                             )}
//                             <div className="space-y-2">
//                               <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Overview</p>
//                               <OverviewItem icon={<Users size={13} />} label="Captain" value={profile.overview?.captain} />
//                               <OverviewItem icon={<Users size={13} />} label="Coach" value={profile.overview?.coach} />
//                               <OverviewItem icon={<Trophy size={13} />} label="Owner" value={profile.overview?.owner} />
//                               <OverviewItem icon={<MapPin size={13} />} label="Venue" value={profile.overview?.venue} />
//                             </div>
//                           </div>
//                           <div className="mt-4 flex gap-4 pt-4 border-t border-[#21262d]">
//                             <StatPill label="Runs" value={profile.stats?.runs} color="blue" />
//                             <StatPill label="Strike Rate" value={profile.stats?.sr} color="green" />
//                             <StatPill label="Average" value={profile.stats?.avg} color="yellow" />
//                           </div>
//                         </td>
//                       </tr>
//                     )}
//                   </React.Fragment>
//                 ))
//               )}
//             </tbody>
//           </table>
//         </div>

//         {/* ── Pagination ── */}
//         {totalPages > 1 && (
//           <div className="flex items-center justify-between px-4 py-3 border-t border-[#21262d]">
//             <p className="text-xs text-gray-500">
//               Page {currentPage} of {totalPages}
//             </p>
//             <div className="flex gap-2">
//               <button
//                 onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
//                 disabled={currentPage === 1}
//                 className="px-3 py-1 rounded text-sm bg-[#21262d] text-gray-300 hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition"
//               >
//                 ← Prev
//               </button>
//               <button
//                 onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
//                 disabled={currentPage === totalPages}
//                 className="px-3 py-1 rounded text-sm bg-[#21262d] text-gray-300 hover:bg-[#30363d] disabled:opacity-40 disabled:cursor-not-allowed transition"
//               >
//                 Next →
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // ─── HELPERS ───────────────────────────────────────────────────────────────────

// function OverviewItem({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
//   if (!value) return null;
//   return (
//     <div className="flex items-center gap-2 text-sm">
//       <span className="text-gray-600">{icon}</span>
//       <span className="text-gray-500">{label}:</span>
//       <span className="text-gray-200">{value}</span>
//     </div>
//   );
// }

// function StatPill({ label, value, color }: { label: string; value?: string; color: "blue" | "green" | "yellow" }) {
//   const colors = {
//     blue: "bg-blue-900/20 text-blue-300 border-blue-800/30",
//     green: "bg-green-900/20 text-green-300 border-green-800/30",
//     yellow: "bg-yellow-900/20 text-yellow-300 border-yellow-800/30",
//   };
//   return (
//     <div className={`flex items-center gap-2 px-3 py-1.5 rounded border ${colors[color]}`}>
//       <TrendingUp size={12} />
//       <span className="text-xs text-gray-400">{label}:</span>
//       <span className="text-xs font-semibold">{value || "—"}</span>
//     </div>
//   );
// }








"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import {
  Eye, Pencil, Trash2, ChevronDown, ChevronUp,
  Trophy, Users, MapPin, TrendingUp, Search, X, AlertTriangle,
} from "lucide-react";
import React from "react";
import Link from "next/link";

// ─── TYPES 

type Stats = { runs: string; sr: string; avg: string };
type Overview = { captain: string; coach: string; owner: string; venue: string };

type PlayerProfile = {
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

type PaginationCursor = {
  lastDocId: string;
  lastDocValue: string | number;
};

// ─── COMPONENT 

export default function PlayerProfileListPage() {
  const [allProfiles, setAllProfiles] = useState<PlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingMore, setFetchingMore] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<PaginationCursor | null>(null);
  

  const LIMIT = 20;

  // Debounce search input by 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      // Reset pagination when search changes
      setAllProfiles([]);
      setNextCursor(null);
      setHasMore(true);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch profiles using cursor pagination
  const fetchProfiles = useCallback(async (reset: boolean = true) => {
    try {
      if (reset) {
        setLoading(true);
      } else {
        setFetchingMore(true);
      }

      // Build URL with cursor
      let url = `/api/player-profile?limit=${LIMIT}`;
      
      // Add search parameter if exists
      if (debouncedQuery) {
        url += `&search=${encodeURIComponent(debouncedQuery)}`;
      }
      
      // Add cursor for pagination (if not resetting and cursor exists)
      if (!reset && nextCursor) {
        url += `&lastDocId=${nextCursor.lastDocId}&lastDocValue=${nextCursor.lastDocValue}`;
      }

      const res = await axios.get(url);
      const newProfiles = res.data.profiles || [];
      const pagination = res.data.pagination;

      if (reset) {
        setAllProfiles(newProfiles);
      } else {
        setAllProfiles(prev => [...prev, ...newProfiles]);
      }

      setHasMore(pagination?.hasMore || false);
      setNextCursor(pagination?.nextCursor || null);
      setTotalItems(prev => reset ? newProfiles.length : prev + newProfiles.length);
      
      // Calculate total pages (approximate, since we don't know total count)
      if (reset && pagination?.hasMore === false) {
        setTotalPages(1);
      } else if (!reset && !pagination?.hasMore) {
        setTotalPages(Math.ceil(allProfiles.length / LIMIT));
      }

      console.log(`Fetched ${newProfiles.length} profiles. Total: ${reset ? newProfiles.length : allProfiles.length + newProfiles.length}`);
    } catch (error) {
      console.error("Failed to fetch profiles", error);
      if (reset) {
        setAllProfiles([]);
      }
    } finally {
      setLoading(false);
      setFetchingMore(false);
    }
  }, [debouncedQuery, nextCursor, LIMIT]);

  // Initial load and when search changes
  useEffect(() => {
    fetchProfiles(true);
  }, [debouncedQuery]);

  // Load more when page changes (for pagination buttons)
  const loadMore = async () => {
    if (hasMore && !loading && !fetchingMore) {
      await fetchProfiles(false);
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/player-profile/search/${id}`);
      // Remove from local state
      setAllProfiles((prev) => prev.filter((p) => p.id !== id));
      setTotalItems((prev) => prev - 1);
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete player profile");
    }
  };

  const handleDeleteAll = async () => {
    if (confirmText !== "DELETE ALL") {
      alert('Please type "DELETE ALL" to confirm');
      return;
    }

    setDeletingAll(true);
    try {
      let deletedCount = 0;
      let failedCount = 0;
      
      for (const profile of allProfiles) {
        try {
          await axios.delete(`/api/player-profile/${profile.id}`);
          deletedCount++;
          if (deletedCount % 10 === 0) {
            console.log(`Deleted ${deletedCount} of ${allProfiles.length} profiles`);
          }
        } catch (error) {
          failedCount++;
          console.error(`Failed to delete ${profile.name}:`, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      alert(`Successfully deleted ${deletedCount} profiles.\nFailed: ${failedCount}`);
      
      // Reset and reload
      setAllProfiles([]);
      setNextCursor(null);
      setHasMore(true);
      setCurrentPage(1);
      await fetchProfiles(true);
      
      setShowDeleteConfirm(false);
      setConfirmText("");
    } catch (error) {
      console.error("Bulk delete failed", error);
      alert("Failed to delete all profiles. Please try again.");
    } finally {
      setDeletingAll(false);
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedRows(next);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setAllProfiles([]);
    setNextCursor(null);
    setHasMore(true);
    setCurrentPage(1);
  };

  // Get current page data (client-side pagination from loaded data)
  const currentProfiles = useMemo(() => {
    const startIndex = (currentPage - 1) * LIMIT;
    const endIndex = startIndex + LIMIT;
    return allProfiles.slice(startIndex, endIndex);
  }, [allProfiles, currentPage]);

  // Update total pages when data changes
  useEffect(() => {
    const totalFiltered = allProfiles.length;
    setTotalPages(Math.ceil(totalFiltered / LIMIT));
    setTotalItems(totalFiltered);
  }, [allProfiles]);

  const TABLE_HEADS = ["#", "Club", "Team", "Type", "Runs", "Avg", "SR", "Actions"];

  return (
    <div className="max-w-[1440px] mx-auto p-6">
      {/* Delete All Confirmation Modal - Same as before */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161b22] border border-red-500/30 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-500/10 rounded-full">
                <AlertTriangle className="text-red-500" size={24} />
              </div>
              <h2 className="text-xl font-semibold text-white">Delete All Profiles</h2>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-300 mb-2">
                You are about to delete <span className="font-bold text-red-400">{allProfiles.length}</span> player profiles.
              </p>
              <p className="text-red-400 text-sm mb-4">
                ⚠️ This action cannot be undone!
              </p>
              <p className="text-gray-400 text-sm mb-3">
                Type <span className="font-mono font-bold text-red-400">DELETE ALL</span> to confirm:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE ALL"
                className="w-full bg-[#0d1117] border border-[#21262d] rounded-lg px-3 py-2 text-white focus:border-red-500 outline-none"
                autoFocus
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConfirmText("");
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-[#21262d] text-gray-300 hover:bg-[#30363d] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll || confirmText !== "DELETE ALL"}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingAll ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>Deleting...</span>
                  </div>
                ) : (
                  "Delete All"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Player Profiles</h1>
          <p className="text-sm text-gray-400 mt-1">
            {totalItems} profile{totalItems !== 1 ? "s" : ""} loaded
            {debouncedQuery && (
              <span className="ml-1 text-blue-400">
                for &quot;{debouncedQuery}&quot;
              </span>
            )}
            {hasMore && allProfiles.length > 0 && (
              <span className="ml-1 text-green-400">
                (scroll to load more)
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="flex items-center bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2 w-[260px] focus-within:border-blue-500 transition">
            <Search size={15} className="text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Search by player name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-sm text-white placeholder:text-gray-500 w-full ml-2"
            />
            {searchQuery && (
              <button onClick={clearSearch} className="text-gray-500 hover:text-gray-300 transition ml-1">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Delete All Button */}
          {allProfiles.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-white text-sm transition whitespace-nowrap flex items-center gap-2"
            >
              <Trash2 size={16} />
              Delete All
            </button>
          )}

          <Link href="/admin/playerprofile-management/add-playerprofile">
            <button className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white text-sm transition whitespace-nowrap">
              Create Player Profile
            </button>
          </Link>
        </div>
      </div>

      {/* Table */}
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
              {loading && allProfiles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                      <span className="text-sm">Loading profiles...</span>
                    </div>
                  </td>
                </tr>
              ) : currentProfiles.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm">
                    {debouncedQuery ? (
                      <div className="flex flex-col items-center gap-2 text-gray-500">
                        <Search size={32} className="text-gray-700" />
                        <p>No players found for &quot;{debouncedQuery}&quot;</p>
                        <button
                          onClick={clearSearch}
                          className="text-blue-400 hover:text-blue-300 text-xs underline mt-1"
                        >
                          Clear search
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-500">No player profiles found</span>
                    )}
                  </td>
                </tr>
              ) : (
                <>
                  {currentProfiles.map((profile, index) => (
                    <React.Fragment key={profile.id}>
                      {/* Main Row */}
                      <tr
                        className="border-b border-[#21262d] hover:bg-[#0d1117] transition cursor-pointer"
                        onClick={() => toggleRow(profile.id)}
                      >
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {(currentPage - 1) * LIMIT + index + 1}
                        </td>
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
                              <p className="text-white text-sm font-medium leading-tight">{profile.name}</p>
                              <p className="text-gray-500 text-xs">{profile.bowlingStyle}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold bg-blue-900/30 text-blue-400 border border-blue-800/40 px-2 py-1 rounded">
                            {profile.team}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{profile.battingStyle || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-300 font-mono">{profile.stats?.runs || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-300 font-mono">{profile.stats?.avg || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-300 font-mono">{profile.stats?.sr || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleRow(profile.id); }}
                              className="p-2 rounded-md bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition"
                              title={expandedRows.has(profile.id) ? "Collapse" : "Expand"}
                            >
                              {expandedRows.has(profile.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            <Link href={`/admin/playerprofile-management/playerprofile-list/${profile.id}`}>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                                title="View Details"
                              >
                                <Eye size={16} />
                              </button>
                            </Link>
                            <Link href={`/admin/playerprofile-management/add-playerprofile?id=${profile.id}`}>
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

                      {/* Expanded Row */}
                      {expandedRows.has(profile.id) && (
                        <tr className="bg-[#0a0f16] border-b border-[#21262d]">
                          <td colSpan={10} className="px-6 py-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {profile.about && (
                                <div className="md:col-span-2">
                                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">About</p>
                                  <p className="text-sm text-gray-300 leading-relaxed">{profile.about}</p>
                                </div>
                              )}
                              <div className="space-y-2">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Overview</p>
                                <OverviewItem icon={<Users size={13} />} label="Captain" value={profile.overview?.captain} />
                                <OverviewItem icon={<Users size={13} />} label="Coach" value={profile.overview?.coach} />
                                <OverviewItem icon={<Trophy size={13} />} label="Owner" value={profile.overview?.owner} />
                                <OverviewItem icon={<MapPin size={13} />} label="Venue" value={profile.overview?.venue} />
                              </div>
                            </div>
                            <div className="mt-4 flex gap-4 pt-4 border-t border-[#21262d]">
                              <StatPill label="Runs" value={profile.stats?.runs} color="blue" />
                              <StatPill label="Strike Rate" value={profile.stats?.sr} color="green" />
                              <StatPill label="Average" value={profile.stats?.avg} color="yellow" />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  
                  {/* Load More Trigger */}
                  {hasMore && !loading && (
                    <tr>
                      <td colSpan={10}>
                        <div className="py-4 text-center">
                          <button
                            onClick={loadMore}
                            disabled={fetchingMore}
                            className="px-4 py-2 bg-[#21262d] text-gray-300 rounded-lg hover:bg-[#30363d] transition text-sm"
                          >
                            {fetchingMore ? (
                              <div className="flex items-center gap-2">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                                <span>Loading more...</span>
                              </div>
                            ) : (
                              'Load More'
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && !hasMore && (
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

// ─── HELPERS (same as before)
function OverviewItem({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">{icon}</span>
      <span className="text-gray-500">{label}:</span>
      <span className="text-gray-200">{value}</span>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value?: string; color: "blue" | "green" | "yellow" }) {
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