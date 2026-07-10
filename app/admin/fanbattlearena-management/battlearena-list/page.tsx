"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { 
  Trophy, Calendar, Trash2, Pencil, 
  Search, Plus, Users, Mail 
} from "lucide-react";
import Link from "next/link";

interface Battle {
  id: string;
  battleName: string;
  battleType: "PLAYERS" | "CLUBS";
  selectedPlayers: string[];
  selectedClubs: string[];
  invitedFriends: { name: string, email: string }[];
  userId: string;
  userName: string;
  createdAt: number;
}

export default function BattleArenaListPage() {
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchBattles();
  }, []);

  const fetchBattles = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/battle?limit=50");
      setBattles(res.data.battles || []);
    } catch (error) {
      console.error("Failed to fetch battles", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this battle?")) return;
    try {
      await axios.delete(`/api/battle/${id}`);
      setBattles(prev => prev.filter(b => b.id !== id));
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete battle");
    }
  };

  const filteredBattles = battles.filter(b => 
    b.battleName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-[1440px] mx-auto p-6 text-white min-h-screen bg-[#0d0d1a]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="text-purple-500" size={24} />
            Battle Arena List
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage all fan battle competitions</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search battles..."
              className="bg-[#16162a] border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-purple-500 transition-colors w-64"
            />
          </div>
          <Link href="/admin/fanbattlearena-management/add-battlearena">
            <button className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all">
              <Plus size={18} />
              Create Battle
            </button>
          </Link>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        </div>
      ) : filteredBattles.length === 0 ? (
        <div className="bg-[#16162a] border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trophy size={32} className="text-gray-700" />
          </div>
          <h3 className="text-lg font-semibold">No battles found</h3>
          <p className="text-gray-500 mt-1">Start by creating your first fan battle arena!</p>
          <Link href="/admin/fanbattlearena-management/add-battlearena">
            <button className="mt-6 text-purple-400 hover:text-purple-300 font-medium">+ Create Battle</button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBattles.map((battle) => (
            <div key={battle.id} className="bg-[#16162a] border border-white/10 rounded-2xl overflow-hidden hover:border-purple-500/30 transition-all group">
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    battle.battleType === "PLAYERS" ? "bg-blue-500/10 text-blue-400" : "bg-orange-500/10 text-orange-400"
                  }`}>
                    {battle.battleType}
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500 text-xs">
                    <Calendar size={12} />
                    {battle.createdAt ? new Date(battle.createdAt).toLocaleDateString() : "—"}
                  </div>
                </div>

                <h3 className="text-lg font-bold mb-4 line-clamp-1">{battle.battleName}</h3>

                <div className="flex items-center gap-4 mb-6">
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Users size={14} className="text-purple-400" />
                    <span>{battle.battleType === "PLAYERS" ? battle.selectedPlayers?.length : battle.selectedClubs?.length} {battle.battleType === "PLAYERS" ? "Players" : "Clubs"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Mail size={14} className="text-purple-400" />
                    <span>{battle.invitedFriends?.length || 0} Invited</span>
                  </div>
                </div>

                <div className="pt-5 border-t border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-[10px] font-bold">
                      {battle.userName?.[0] || "?"}
                    </div>
                    <span className="text-[10px] text-gray-500 font-medium truncate max-w-[100px]">{battle.userName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/admin/fanbattlearena-management/add-battlearena?id=${battle.id}`}>
                      <button className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition">
                        <Pencil size={16} />
                      </button>
                    </Link>
                    <button 
                      onClick={() => handleDelete(battle.id)}
                      className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400 transition"
                    >
                      <Trash2 size={16} />
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
