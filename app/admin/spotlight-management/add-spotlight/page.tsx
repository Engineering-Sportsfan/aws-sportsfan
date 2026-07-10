"use client";

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { X, User, Save, Loader2, Target, Flame, TrendingUp, SearchIcon } from "lucide-react";

interface Player {
  id: string;
  name: string;
  team: string;
  avatar: string;
}

interface SpotlightData {
  playersToWatch: Player[];
  impactPlayers: Player[];
  consistentPerformers: Player[];
}

export default function AddSpotlightPage() {
  const [data, setData] = useState<SpotlightData>({
    playersToWatch: [],
    impactPlayers: [],
    consistentPerformers: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSpotlightData();
  }, []);

  const fetchSpotlightData = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/spotlight");
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (error) {
      console.error("Failed to fetch spotlight data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.post("/api/spotlight", data);
      alert("Spotlight updated successfully!");
    } catch (error) {
      console.error("Failed to save spotlight data", error);
      alert("Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const addPlayer = (section: keyof SpotlightData, player: Player) => {
    if (data[section].some((p) => p.id === player.id)) {
      alert("Player already added to this section");
      return;
    }
    setData((prev) => ({ ...prev, [section]: [...prev[section], player] }));
  };

  const removePlayer = (section: keyof SpotlightData, playerId: string) => {
    setData((prev) => ({
      ...prev,
      [section]: prev[section].filter((p) => p.id !== playerId),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Manage IPL Pulse Spotlight</h1>
          <p className="text-gray-400 text-sm">Update featured players for the Pulse dashboard</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-semibold transition shadow-lg"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <SpotlightSection
          title="Players to Watch"
          subtitle="Rising stars"
          players={data.playersToWatch}
          onAdd={(p) => addPlayer("playersToWatch", p)}
          onRemove={(id) => removePlayer("playersToWatch", id)}
          accentColor="text-pink-500"
          icon={<Target size={20} />}
        />
        <SpotlightSection
          title="Impact Players"
          subtitle="Game changers"
          players={data.impactPlayers}
          onAdd={(p) => addPlayer("impactPlayers", p)}
          onRemove={(id) => removePlayer("impactPlayers", id)}
          accentColor="text-orange-500"
          icon={<Flame size={20} />}
        />
        <SpotlightSection
          title="Consistent Performers"
          subtitle="Steady track records"
          players={data.consistentPerformers}
          onAdd={(p) => addPlayer("consistentPerformers", p)}
          onRemove={(id) => removePlayer("consistentPerformers", id)}
          accentColor="text-blue-400"
          icon={<TrendingUp size={20} />}
        />
      </div>
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

interface SectionProps {
  title: string;
  subtitle: string;
  players: Player[];
  onAdd: (player: Player) => void;
  onRemove: (id: string) => void;
  accentColor: string;
  icon: React.ReactNode;
}

function SpotlightSection({ title, subtitle, players, onAdd, onRemove, accentColor, icon }: SectionProps) {
  return (
    <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden">
      <div className="p-5 border-b border-[#21262d] flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`${accentColor} bg-black/20 p-2 rounded-lg`}>{icon}</div>
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="text-gray-500 text-xs">{subtitle}</p>
          </div>
        </div>
        <div className="text-xs font-mono text-gray-500">{players.length}/6 Players</div>
      </div>

      <div className="p-5 space-y-6">
        <PlayerSearch onSelect={onAdd} />

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {players.map((player) => (
            <div
              key={player.id}
              className="group relative bg-[#0d1117] border border-[#30363d] rounded-xl p-3 flex flex-col items-center text-center"
            >
              <button
                onClick={() => onRemove(player.id)}
                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition"
              >
                <X size={12} />
              </button>
              <div className="w-14 h-14 rounded-full overflow-hidden border border-[#30363d] mb-2">
                {player.avatar ? (
                  <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700">
                    <User size={20} />
                  </div>
                )}
              </div>
              <div className="text-[10px] font-bold text-white truncate w-full">{player.name}</div>
              <div className="text-[8px] text-gray-500 uppercase">{player.team}</div>
            </div>
          ))}
          {players.length === 0 && (
            <div className="col-span-full py-4 text-center text-gray-600 text-sm border-2 border-dashed border-[#21262d] rounded-lg">
              No players selected
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Player Search ────────────────────────────────────────────────────────────

function PlayerSearch({ onSelect }: { onSelect: (p: Player) => void }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [show, setShow]       = useState(false);
  const debounceRef           = useRef<NodeJS.Timeout | null>(null);
  const containerRef          = useRef<HTMLDivElement>(null);

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setShow(false);
      return;
    }

    // Clear previous timer
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setShow(true);
      try {
        // /api/player-profile/home returns { success, posts: HomeItem[] }
        // HomeItem has: id, playerProfilesId, playerName, logo, category[]{title}, ...
        // We map it to the Player shape this component needs.
        const res = await axios.get<{
          success: boolean;
          posts: {
            id: string;
            playerProfilesId?: string;
            playerName: string;
            logo: string;
            category?: { title: string }[];
          }[];
        }>("/api/player-profile/home", {
          params: { search: trimmed.toLowerCase(), limit: 15 },
        });

        if (res.data.success) {
          const raw = res.data.posts ?? [];

          const toPlayer = (p: typeof raw[number]): Player => ({
            id: p.playerProfilesId || p.id,
            name: p.playerName,
            // Use first category title as team label if no dedicated team field
            team: p.category?.[0]?.title ?? "",
            avatar: p.logo,
          });

          if (raw.length > 0) {
            setResults(raw.map(toPlayer));
          } else {
            // Client-side fallback: fetch more and filter locally
            const fallback = await axios.get<{
              success: boolean;
              posts: typeof raw;
            }>("/api/player-profile/home", { params: { limit: 100 } });

            const all = fallback.data.posts ?? [];
            const filtered = all.filter((p) =>
              p.playerName.toLowerCase().includes(trimmed.toLowerCase())
            );
            setResults(filtered.slice(0, 15).map(toPlayer));
          }
        }
      } catch (err) {
        console.error("PlayerSearch error:", err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (player: Player) => {
    onSelect(player);
    setQuery("");
    setResults([]);
    setShow(false);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setShow(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Input */}
      <div className="relative group">
        <SearchIcon
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors"
          size={18}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => { if (query.trim().length >= 2) setShow(true); }}
          placeholder="Search player by name (e.g. Kohli, Rohit)..."
          className="w-full bg-[#0d1117] border border-[#30363d] rounded-xl pl-10 pr-10 py-3 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-inner"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {show && (
        <div className="absolute z-20 mt-2 w-full bg-[#1c2128] border border-[#444c56] rounded-xl shadow-2xl max-h-72 overflow-y-auto">
          {searching ? (
            <div className="p-6 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-blue-500" size={24} />
              <span>Searching players…</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              No players found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="p-2 space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  className="w-full flex items-center gap-4 p-3 hover:bg-[#2d333b] rounded-lg transition-all text-left group/item"
                >
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-black border border-[#444c56] shrink-0 group-hover/item:border-blue-500 transition-colors">
                    {p.avatar ? (
                      <img src={p.avatar} className="w-full h-full object-cover" alt={p.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <User size={20} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white group-hover/item:text-blue-400 transition-colors truncate">
                      {p.name}
                    </div>
                    <div className="text-xs text-gray-500 uppercase font-mono">{p.team}</div>
                  </div>
                  <div className="text-xs font-bold text-blue-500 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                    SELECT +
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}