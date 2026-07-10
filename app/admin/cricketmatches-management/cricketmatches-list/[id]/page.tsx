// admin/cricket-matches-management/cricketmatches-list/[id]/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import Link from "next/link";

interface InningStats {
  runs: number;
  wickets: number;
  powerplay: number;
  middle: number;
  death: number;
  dots: number;
  fours: number;
  sixes: number;
  extras: number;
  highestOver?: number;
}

interface Match {
  id: string;
  matchId: number;
  date: string;
  season: string;
  team1: string;
  team2: string;
  venue: string;
  city: string;
  winner: string;
  tossWinner: string;
  tossDecision: string;
  playerOfMatch: string;
  inning1: InningStats;
  inning2: InningStats;
  target: number;
  chaseSuccess: boolean;
  isNoResult: boolean;
}

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Match>>({});

  useEffect(() => {
    setEditing(searchParams.get("edit") === "true");
  }, [searchParams]);

  const fetchMatch = useCallback(async () => {
    try {
      const res = await axios.get(`/api/matches/${params.id}`);
      if (res.data.success) {
        setMatch(res.data.match);
        setForm(res.data.match);
      }
    } catch (err) {
      console.error("Error fetching match:", err);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchMatch();
  }, [fetchMatch]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const numValue = type === "number" ? parseInt(value) || 0 : value;

    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setForm(prev => ({
        ...prev,
        [parent]: { ...(prev[parent as keyof Match] as InningStats), [child]: numValue }
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: numValue }));
    }
  };

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: checked }));
  };

  const handleUpdate = async () => {
    try {
      await axios.put(`/api/matches/${params.id}`, form);
      alert("Match updated successfully");
      setEditing(false);
      fetchMatch();
    } catch {
      alert("Failed to update match");
    }
  };

  const handleDelete = async () => {
    if (confirm("Delete this match?")) {
      try {
        await axios.delete(`/api/matches/${params.id}`);
        router.push("/admin/cricket-matches-management/cricketmatches-list");
      } catch {
        alert("Failed to delete");
      }
    }
  };

  if (loading) return <div className="p-6 text-center">Loading...</div>;
  if (!match) return <div className="p-6 text-center">Match not found</div>;

  const StatRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between py-2 border-b border-gray-800">
      <span className="text-gray-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );

  const renderInningStats = (inningNum: number, stats: InningStats) => (
    <div className="bg-gray-900 rounded-lg p-4">
      <h3 className="font-semibold mb-3 text-lg">Inning {inningNum}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <StatRow label="Runs" value={stats.runs} />
        <StatRow label="Wickets" value={stats.wickets} />
        <StatRow label="Powerplay" value={stats.powerplay} />
        <StatRow label="Middle Overs" value={stats.middle} />
        <StatRow label="Death Overs" value={stats.death} />
        <StatRow label="Dots" value={stats.dots} />
        <StatRow label="Fours" value={stats.fours} />
        <StatRow label="Sixes" value={stats.sixes} />
        <StatRow label="Extras" value={stats.extras} />
        {stats.highestOver !== undefined && <StatRow label="Highest Over" value={stats.highestOver} />}
      </div>
    </div>
  );

  const renderEditForm = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div><label className="text-sm text-gray-400">Match ID</label><input type="number" name="matchId" value={form.matchId || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">Date</label><input type="date" name="date" value={form.date || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">Season</label><input type="text" name="season" value={form.season || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">Toss Decision</label><select name="tossDecision" value={form.tossDecision || "field"} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded"><option value="bat">Bat</option><option value="field">Field</option></select></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label className="text-sm text-gray-400">Team 1</label><input type="text" name="team1" value={form.team1 || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">Team 2</label><input type="text" name="team2" value={form.team2 || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">Venue</label><input type="text" name="venue" value={form.venue || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">City</label><input type="text" name="city" value={form.city || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">Winner</label><input type="text" name="winner" value={form.winner || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
        <div><label className="text-sm text-gray-400">Player of Match</label><input type="text" name="playerOfMatch" value={form.playerOfMatch || ""} onChange={handleChange} className="w-full p-2 bg-gray-800 border border-gray-700 rounded" /></div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" name="chaseSuccess" checked={form.chaseSuccess || false} onChange={handleCheckbox} /> Chase Successful</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isNoResult" checked={form.isNoResult || false} onChange={handleCheckbox} /> No Result</label>
      </div>
      <div className="flex gap-3">
        <button onClick={handleUpdate} className="px-4 py-2 bg-blue-600 rounded">Save Changes</button>
        <button onClick={() => setEditing(false)} className="px-4 py-2 bg-gray-700 rounded">Cancel</button>
      </div>
    </div>
  );

  const renderViewMode = () => (
    <>
      <div className="bg-gray-900 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold">{match.team1} vs {match.team2}</h2>
            <p className="text-gray-400 mt-1">{match.venue}, {match.city}</p>
            <p className="text-sm text-gray-500 mt-2">Match #{match.matchId} | {new Date(match.date).toLocaleDateString()} | Season {match.season}</p>
          </div>
          <div className="text-right">
            <div className={`text-lg font-semibold px-4 py-2 rounded-lg ${match.isNoResult ? "bg-yellow-900 text-yellow-400" : "bg-green-900 text-green-400"}`}>
              {match.isNoResult ? "No Result" : match.winner ? `${match.winner} Won` : "—"}
            </div>
            {!match.isNoResult && match.chaseSuccess && <p className="text-sm mt-2">Target: {match.target}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-800">
          <StatRow label="Toss Winner" value={match.tossWinner} />
          <StatRow label="Toss Decision" value={match.tossDecision === "bat" ? "Bat First" : "Field First"} />
          <StatRow label="Player of the Match" value={match.playerOfMatch || "—"} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderInningStats(1, match.inning1)}
        {renderInningStats(2, match.inning2)}
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={() => setEditing(true)} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded">Edit Match</button>
        <button onClick={handleDelete} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded">Delete Match</button>
        <Link href="/admin/cricket-matches-management/cricketmatches-list" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">Back to List</Link>
      </div>
    </>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Match Details</h1>
      {editing ? renderEditForm() : renderViewMode()}
    </div>
  );
}