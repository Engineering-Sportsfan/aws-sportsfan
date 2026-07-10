"use client";

import axios from "axios";
import { useEffect, useState } from "react";
import { Eye, Pencil, Trash2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Drop = {
  id: string;
  title: string;
  url: string;
};

type Profile = {
  id: string;
  name: string;
  about: string;
  avatar: string;
  drops: Drop[];
  createdAt: number;
  updatedAt: number;
};

type PaginationCursor = {
  lastDocId: string;
  lastDocValue: string | number;
};

type ApiResponse = {
  profiles: Profile[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: PaginationCursor | null;
  };
};

export default function Sportsfan360ProfileListPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<PaginationCursor | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async (loadMore = false) => {
    try {
      if (loadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      let url = "/api/sportsfan360card?limit=20";
      
      if (searchTerm) {
        url += `&search=${encodeURIComponent(searchTerm)}`;
      }
      
      if (loadMore && lastDoc) {
        url += `&lastDocId=${lastDoc.lastDocId}&lastDocValue=${lastDoc.lastDocValue}`;
      }

      const res = await axios.get<ApiResponse>(url);
      
      const newProfiles = res.data.profiles || [];
      setHasMore(res.data.pagination?.hasMore || false);
      
      if (res.data.pagination?.nextCursor) {
        setLastDoc(res.data.pagination.nextCursor);
      } else {
        setLastDoc(null);
      }

      if (loadMore) {
        setProfiles(prev => [...prev, ...newProfiles]);
      } else {
        setProfiles(newProfiles);
      }
    } catch (error) {
      console.error("Failed to fetch profiles", error);
      if (!loadMore) setProfiles([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSearch = () => {
    setLastDoc(null);
    fetchProfiles(false);
  };

  const handleView = (id: string) => {
    router.push(`/admin/sportsfan360profile-management/sportsfan360profile-list/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/admin/sportsfan360profile-management/add-sportsfan360profile?id=${id}`);
  };

  const handleDelete = async (id: string) => {
    const confirmDelete = window.confirm("Delete this profile? This action cannot be undone.");
    if (!confirmDelete) return;

    try {
      await axios.delete(`/api/sportsfan360card/${id}`);
      setProfiles((prev) => prev.filter((profile) => profile.id !== id));
      alert("Profile deleted successfully");
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete profile");
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold">Sportsfan360 Profiles</h1>
          <p className="text-sm text-gray-400">
            Manage all Sportsfan360 profiles and their audio drops
          </p>
        </div>
        
        <button
          onClick={() => router.push("/admin/sportsfan360profile-management/add-sportsfan360profile")}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition"
        >
          <Plus size={18} />
          Add New Profile
        </button>
      </div>

      {/* SEARCH BAR */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          placeholder="Search profiles by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSearch()}
          className="flex-1 bg-[#0d1117] border border-gray-700 rounded-lg px-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition"
        >
          Search
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-[#161b22] border border-[#21262d] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-[#1c2330] border-b border-[#21262d]">
              <tr>
                {[
                  "#",
                  "Avatar",
                  "Name",
                  "About",
                  "Total Drops",
                  "Created",
                  "Updated",
                  "Actions",
                ].map((head) => (
                  <th
                    key={head}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      <span>Loading profiles...</span>
                    </div>
                  </td>
                </tr>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    {searchTerm ? "No profiles found matching your search" : "No profiles found. Click 'Add New Profile' to create one."}
                  </td>
                </tr>
              ) : (
                profiles.map((profile, index) => (
                  <tr
                    key={profile.id}
                    className="border-b border-[#21262d] hover:bg-[#0d1117] transition"
                  >
                    <td className="px-4 py-3 text-sm">{index + 1}</td>

                    <td className="px-4 py-3">
                      {profile.avatar ? (
                        <div className="relative w-10 h-10">
                          <Image
                            src={profile.avatar}
                            alt={profile.name}
                            fill
                            className="rounded-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                          <span className="text-xs text-gray-400">No img</span>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-sm">{profile.name}</p>
                        {profile.drops && profile.drops.length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Latest: {profile.drops[0]?.title?.substring(0, 30)}
                            {profile.drops[0]?.title && profile.drops[0].title.length > 30 ? "..." : ""}
                          </p>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-300 max-w-xs truncate">
                        {profile.about || "No description"}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        {profile.drops?.length || 0} drops
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDate(profile.createdAt)}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-400">
                      {formatDate(profile.updatedAt)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleView(profile.id)}
                          className="p-2 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => handleEdit(profile.id)}
                          className="p-2 rounded-md bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition"
                          title="Edit Profile"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => handleDelete(profile.id)}
                          className="p-2 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                          title="Delete Profile"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* LOAD MORE BUTTON */}
        {!loading && hasMore && (
          <div className="p-4 text-center">
            <button
              onClick={() => fetchProfiles(true)}
              disabled={loadingMore}
              className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Loading...
                </span>
              ) : (
                "Load More"
              )}
            </button>
          </div>
        )}

        {/* SHOWING RESULTS INFO */}
        {!loading && profiles.length > 0 && (
          <div className="px-4 py-3 border-t border-[#21262d] text-xs text-gray-400">
            Showing {profiles.length} profile{profiles.length !== 1 ? "s" : ""}
            {searchTerm && ` for "${searchTerm}"`}
            {hasMore && " (more available)"}
          </div>
        )}
      </div>
    </div>
  );
}