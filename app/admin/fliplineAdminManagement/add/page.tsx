"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

interface User {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  avatar?: string;
}

export default function FlipLineAdminAdd() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch(searchQuery.trim());
      } else {
        setSearchResults([]);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    try {
      setSearching(true);
      const res = await axios.get(`/api/admin/flipline-admins?search=${encodeURIComponent(query)}`);
      setSearchResults(res.data.users || []);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setSearching(false);
    }
  };

  const handleGrantAccess = async (email: string, name: string) => {
    try {
      setSubmitting(email);
      await axios.post("/api/admin/flipline-admins", { email, role: "FlipLineAdmin" });
      alert(`FlipLineAdmin access granted to ${name || email} successfully!`);
      router.push("/admin/fliplineAdminManagement/list");
    } catch (error) {
      console.error("Failed to grant access", error);
      alert("Failed to grant access.");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="max-w-[800px] mx-auto p-6">
      <div className="mb-6">
        <Link href="/admin/fliplineAdminManagement/list" className="text-blue-500 hover:text-blue-400 font-semibold flex items-center gap-1">
          &larr; Back to FlipLine Admins List
        </Link>
      </div>

      <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
        <h1 className="text-xl font-semibold text-white mb-4">Grant FlipLine Admin Access</h1>
        <p className="text-sm text-gray-400 mb-6">
          Search for an existing user by entering their name or email address below. Once found, click the grant button to promote them.
        </p>

        <div className="mb-6">
          <label htmlFor="user-search" className="block text-sm font-semibold text-gray-300 mb-2">
            Search User Name / Email
          </label>
          <input
            id="user-search"
            type="text"
            placeholder="Type at least 2 characters to search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Results list */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Search Results {searching && <span className="ml-2 text-gray-400 animate-pulse">(searching...)</span>}
          </h3>

          {searchResults.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm border border-dashed border-[#30363d] rounded-lg">
              {searchQuery.trim().length < 2
                ? "Start typing to search users..."
                : "No matching users found."}
            </div>
          ) : (
            <div className="border border-[#21262d] rounded-lg overflow-hidden divide-y divide-[#21262d]">
              {searchResults.map((user) => {
                const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "–";
                const isAlreadyAdmin = user.role === "FlipLineAdmin";
                return (
                  <div key={user.email} className="flex items-center justify-between p-4 bg-[#0d1117]/50 hover:bg-[#161b22] transition-colors">
                    <div className="flex items-center gap-3">
                      {user.avatar ? (
                        <img src={user.avatar} alt={fullName} className="w-10 h-10 object-cover rounded-full bg-gray-800" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 font-bold">
                          {(user.firstName?.[0] || user.email[0]).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="block text-sm font-bold text-white leading-snug">{fullName}</span>
                        <span className="block text-xs text-gray-400">{user.email}</span>
                      </div>
                    </div>

                    <div>
                      {isAlreadyAdmin ? (
                        <span className="bg-purple-900/30 text-purple-400 border border-purple-800/40 px-3 py-1 rounded-full text-xs font-bold uppercase select-none">
                          Already Admin
                        </span>
                      ) : (
                        <button
                          onClick={() => handleGrantAccess(user.email, fullName)}
                          disabled={submitting !== null}
                          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/40 disabled:text-gray-500 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all active:scale-95"
                        >
                          {submitting === user.email ? "Granting..." : "Grant Admin Access"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
