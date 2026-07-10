"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import axios from "axios";
import { ArrowLeft, User, Shield, Plus, X, Search, Mail } from "lucide-react";

type BattleType = "PLAYERS" | "CLUBS";

interface InvitedFriend {
  email: string;
  name: string;
}

interface Player {
  id: string;
  name: string;
  team: string;
  avatar?: string;
}

interface Club {
  id: string;
  name: string;
  avatar?: string;
}

export default function AddBattleArenaForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const battleId = searchParams.get("id");

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Form state
  const [battleName, setBattleName] = useState("");
  const [battleType, setBattleType] = useState<BattleType>("PLAYERS");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
  const [invitedFriends, setInvitedFriends] = useState<InvitedFriend[]>([
    { name: "", email: "" }
  ]);
  const [userId, setUserId] = useState("admin_001");
  const [userName, setUserName] = useState("Admin User");

  // Selection data
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchBattleForEdit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/battle/${battleId}`);
      const battle = res.data.battle;
      setBattleName(battle.battleName);
      setBattleType(battle.battleType);
      setSelectedPlayers(battle.selectedPlayers || []);
      setSelectedClubs(battle.selectedClubs || []);
      setInvitedFriends(battle.invitedFriends?.length > 0 ? battle.invitedFriends : [{ name: "", email: "" }]);
      setUserId(battle.userId);
      setUserName(battle.userName);
    } catch (error) {
      console.error("Failed to fetch battle", error);
      setFormError("Failed to load battle data");
    } finally {
      setLoading(false);
    }
  }, [battleId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [playersRes, clubsRes] = await Promise.all([
          axios.get("/api/player-profile?limit=100"),
          axios.get("/api/club-profile?limit=100"),
        ]);
        setAllPlayers(playersRes.data.profiles || []);
        setAllClubs(clubsRes.data.profiles || []);
      } catch (error) {
        console.error("Failed to fetch data", error);
      }
    };
    fetchData();

    if (battleId) {
      fetchBattleForEdit();
    }
  }, [battleId, fetchBattleForEdit]);

  const addFriend = () => {
    setInvitedFriends([...invitedFriends, { name: "", email: "" }]);
  };

  const removeFriend = (index: number) => {
    if (invitedFriends.length <= 1) return;
    setInvitedFriends(invitedFriends.filter((_, i) => i !== index));
  };

  const updateFriend = (index: number, field: keyof InvitedFriend, value: string) => {
    const next = [...invitedFriends];
    next[index][field] = value;
    setInvitedFriends(next);
  };

  const toggleSelection = (id: string) => {
    if (battleType === "PLAYERS") {
      setSelectedPlayers(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else {
      setSelectedClubs(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    }
  };

  const handleSubmit = async () => {
    setFormError("");
    if (!battleName.trim()) return setFormError("Battle name is required.");

    if (battleType === "PLAYERS" && selectedPlayers.length === 0) {
      return setFormError("Please select at least one player.");
    }
    if (battleType === "CLUBS" && selectedClubs.length === 0) {
      return setFormError("Please select at least one club.");
    }

    const validFriends = invitedFriends.filter(f => f.name.trim() && f.email.trim());

    setSubmitting(true);
    try {
      const payload = {
        battleName: battleName.trim(),
        battleType,
        selectedPlayers: battleType === "PLAYERS" ? selectedPlayers : [],
        selectedClubs: battleType === "CLUBS" ? selectedClubs : [],
        invitedFriends: validFriends,
        userId,
        userName,
      };

      if (battleId) {
        await axios.put(`/api/battle/${battleId}`, payload);
      } else {
        await axios.post("/api/battle", payload);
      }

      router.push("/admin/fanbattlearena-management/battlearena-list");
    }
    catch (error: unknown) {
  let errorMessage = "An error occurred";
  
  if (error && typeof error === 'object') {
    // Handle axios error with response
    if ('response' in error && error.response && typeof error.response === 'object') {
      const response = error.response as { data?: { error?: string } };
      if (response.data?.error) {
        errorMessage = response.data.error;
      }
    }
    
    // Handle standard Error object
    if ('message' in error && typeof error.message === 'string') {
      errorMessage = error.message;
    }
  }
  
  setFormError(errorMessage);
}
      finally {
        setSubmitting(false);
      }
    };

    const filteredItems = battleType === "PLAYERS"
      ? allPlayers.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : allClubs.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (loading) {
      return (
        <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#0d0d1a] text-white font-sans pb-20">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Back</span>
          </button>

          <div className="flex items-center gap-3 mb-8">
            {/* <span className="text-purple-400 text-3xl">⚔️</span> */}
            <h1 className="text-2xl font-bold tracking-tight">
              {battleId ? "Edit" : "Create New"} Battle Arena
            </h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* General Info */}
              <div className="bg-[#16162a] border border-white/10 rounded-2xl p-6 space-y-5">
                <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">General Information</h2>

                <div className="space-y-1">
                  <label className="text-xs text-gray-400 font-medium">Battle Name</label>
                  <input
                    value={battleName}
                    onChange={(e) => setBattleName(e.target.value)}
                    placeholder="e.g. The Ultimate Showdown"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-gray-400 font-medium">Battle Type</label>
                  <div className="flex p-1 bg-white/5 border border-white/10 rounded-xl w-fit">
                    <button
                      onClick={() => setBattleType("PLAYERS")}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${battleType === "PLAYERS" ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        }`}
                    >
                      <User size={16} />
                      Players
                    </button>
                    <button
                      onClick={() => setBattleType("CLUBS")}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${battleType === "CLUBS" ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        }`}
                    >
                      <Shield size={16} />
                      Clubs
                    </button>
                  </div>
                </div>
              </div>

              {/* Selection Area */}
              <div className="bg-[#16162a] border border-white/10 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">
                    Select {battleType === "PLAYERS" ? "Players" : "Clubs"}
                  </h2>
                  <span className="text-xs text-gray-500">
                    {battleType === "PLAYERS" ? selectedPlayers.length : selectedClubs.length} selected
                  </span>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search ${battleType.toLowerCase()}...`}
                    className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {filteredItems.map((item) => {
                    const isSelected = battleType === "PLAYERS"
                      ? selectedPlayers.includes(item.id)
                      : selectedClubs.includes(item.id);

                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleSelection(item.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isSelected
                          ? "bg-purple-600/20 border-purple-500/50"
                          : "bg-white/5 border-white/5 hover:bg-white/10"
                          }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex-shrink-0 overflow-hidden border border-white/10">
                          {item.avatar ? (
                            <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {battleType === "PLAYERS" ? <User size={20} /> : <Shield size={20} />}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          {battleType === "PLAYERS" && <p className="text-[10px] text-gray-500 truncate">{(item as Player).team}</p>}
                        </div>
                        {isSelected && <div className="ml-auto w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-[10px]">✓</div>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Invited Friends */}
              <div className="bg-[#16162a] border border-white/10 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Invite Friends</h2>
                  <button onClick={addFriend} className="p-1 hover:bg-white/10 rounded-full transition">
                    <Plus size={18} className="text-purple-400" />
                  </button>
                </div>

                <div className="space-y-4">
                  {invitedFriends.map((friend, i) => (
                    <div key={i} className="space-y-2 p-3 bg-white/5 border border-white/5 rounded-xl relative group">
                      <button
                        onClick={() => removeFriend(i)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg"
                      >
                        <X size={12} />
                      </button>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 px-2 py-1">
                          <User size={12} className="text-gray-500" />
                          <input
                            value={friend.name}
                            onChange={(e) => updateFriend(i, "name", e.target.value)}
                            placeholder="Friend's Name"
                            className="bg-transparent border-none text-xs text-white focus:outline-none w-full"
                          />
                        </div>
                        <div className="flex items-center gap-2 px-2 py-1">
                          <Mail size={12} className="text-gray-500" />
                          <input
                            value={friend.email}
                            onChange={(e) => updateFriend(i, "email", e.target.value)}
                            placeholder="Friend's Email"
                            className="bg-transparent border-none text-xs text-white focus:outline-none w-full"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Admin Info (Read-only or Pre-filled) */}
              <div className="bg-[#16162a] border border-white/10 rounded-2xl p-6 space-y-4">
                <h2 className="text-sm font-semibold text-purple-400 uppercase tracking-wider">Creator</h2>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400">
                    <User size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{userName}</p>
                    <p className="text-[10px] text-gray-500">{userId}</p>
                  </div>
                </div>
              </div>

              {formError && <p className="text-red-400 text-xs bg-red-400/10 p-3 rounded-lg border border-red-400/20">{formError}</p>}

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-bold shadow-xl shadow-purple-900/20 transition-all transform active:scale-95"
                >
                  {submitting ? "Saving Battle..." : battleId ? "Update Battle Arena" : "Launch Battle Arena"}
                </button>
                <button
                  onClick={() => router.back()}
                  className="w-full py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.3);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.5);
        }
      `}</style>
      </div>
    );
  }
