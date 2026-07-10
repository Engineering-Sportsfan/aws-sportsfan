// admin/cricket-matches-management/cricketmatches-list/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Link from "next/link";

interface Match {
  id: string;
  matchId: number;
  date: string;
  season: string;
  team1: string;
  team2: string;
  winner: string;
  venue: string;
  city: string;
  inning1: { runs: number; wickets: number };
  inning2: { runs: number; wickets: number };
}

export default function CricketMatchesListPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeason, setFilterSeason] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterSeason) params.append("season", filterSeason);
      if (filterTeam) params.append("team", filterTeam);
      params.append("limit", "100");

      const res = await axios.get(`/api/matches?${params}`);
      if (res.data.success) {
        const apiMatches = (res.data.matches ?? res.data.data) as Match[];
        setMatches(apiMatches);
        setTotalCount(res.data.totalCount ?? res.data.count ?? apiMatches.length);

        // Extract unique seasons and teams for filters
        const allSeasons = [...new Set(apiMatches.map((m) => m.season))].sort();
        const allTeams = [...new Set(apiMatches.flatMap((m) => [m.team1, m.team2]))].sort();
        setSeasons(allSeasons);
        setTeams(allTeams);
      }
    } catch (err) {
      console.error("Error fetching matches:", err);
    } finally {
      setLoading(false);
    }
  }, [filterSeason, filterTeam]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const handleDelete = async (id: string, matchId: number) => {
    if (confirm(`Delete match ${matchId}?`)) {
      try {
        await axios.delete(`/api/matches/${id}`);
        fetchMatches();
      } catch {
        alert("Failed to delete");
      }
    }
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredMatches = matches.filter((m) => {
    const matchesSeason = !filterSeason || String(m.season) === filterSeason;
    const matchesTeam = !filterTeam || [m.team1, m.team2].some((t) => t.toLowerCase().includes(filterTeam.toLowerCase()));
    const matchesSearch = !normalizedSearch ||
      `${m.matchId} ${m.team1} ${m.team2} ${m.venue} ${m.city} ${m.winner}`
        .toLowerCase()
        .includes(normalizedSearch);
    return matchesSeason && matchesTeam && matchesSearch;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Cricket Matches</h1>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-end gap-4 mb-6">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search match #, team, venue, city or winner"
          className="w-full md:w-72 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
        />
        <select value={filterSeason} onChange={(e) => setFilterSeason(e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded">
          <option value="">All Seasons</option>
          {seasons.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterTeam} onChange={(e) => setFilterTeam(e.target.value)} className="px-3 py-2 bg-gray-800 border border-gray-700 rounded">
          <option value="">All Teams</option>
          {teams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => { setSearchQuery(""); setFilterSeason(""); setFilterTeam(""); }} className="px-3 py-2 bg-gray-700 rounded">Clear</button>
        <button onClick={fetchMatches} className="px-3 py-2 bg-gray-700 rounded">Refresh</button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <span className="text-sm text-gray-400">Showing {filteredMatches.length} of {totalCount} matches</span>
      </div>

      {/* Match List */}
      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : filteredMatches.length === 0 ? (
        <div className="text-center py-10 text-gray-500">No matches found</div>
      ) : (
        <div className="space-y-3">
          {filteredMatches.map((match) => (
            <div key={match.id} className="bg-gray-900 border border-gray-700 rounded-lg p-4 hover:bg-gray-800 transition">
              <div className="flex flex-col lg:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className="text-xs text-gray-500 font-mono">#{match.matchId}</span>
                    <span className="text-xs text-gray-500">{new Date(match.date).toLocaleDateString()}</span>
                    <span className="text-xs bg-gray-700 px-2 py-0.5 rounded">{match.season}</span>
                  </div>
                  <div className="text-lg font-semibold">
                    {match.team1} vs {match.team2}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {match.venue}, {match.city}
                  </div>
                  <div className="text-sm mt-2">
                    {match.inning1.runs}/{match.inning1.wickets} → {match.inning2.runs}/{match.inning2.wickets}
                  </div>
                </div>

                <div className="flex flex-col justify-between gap-3 text-right min-w-[160px]">
                  <div className={`px-3 py-1 rounded-full text-sm ${match.winner === "No Result" ? "bg-yellow-900 text-yellow-400" : "bg-green-900 text-green-400"}`}>
                    {match.winner || "—"}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link href={`/admin/cricket-matches-management/cricketmatches-list/${match.id}`} className="px-3 py-1 bg-blue-700 rounded text-sm hover:bg-blue-600">View</Link>
                    <Link href={`/admin/cricket-matches-management/cricketmatches-list/${match.id}?edit=true`} className="px-3 py-1 bg-yellow-600 rounded text-sm hover:bg-yellow-500">Edit</Link>
                    <button
                      onClick={() => handleDelete(match.id, match.matchId)}
                      className="px-3 py-1 bg-red-700 rounded text-sm hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}