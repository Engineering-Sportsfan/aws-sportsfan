// "use client";

// import { useState, useEffect, useCallback } from "react";
// import axios from "axios";
// import { Search, X, User, Save, Trash2, SearchIcon, Loader2 } from "lucide-react";

// interface Player {
//   id: string;
//   name: string;
//   team: string;
//   avatar: string;
// }

// interface SpotlightData {
//   playersToWatch: Player[];
//   impactPlayers: Player[];
//   consistentPerformers: Player[];
// }

// export default function IPLPulseSpotlightPage() {
//   const [data, setData] = useState<SpotlightData>({
//     playersToWatch: [],
//     impactPlayers: [],
//     consistentPerformers: [],
//   });
//   const [loading, setLoading] = useState(true);
//   const [saving, setSaving] = useState(false);

//   useEffect(() => {
//     fetchSpotlightData();
//   }, []);

//   const fetchSpotlightData = async () => {
//     try {
//       setLoading(true);
//       const res = await axios.get("/api/ipl-pulse/spotlight");
//       if (res.data.success) {
//         setData(res.data.data);
//       }
//     } catch (error) {
//       console.error("Failed to fetch spotlight data", error);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleSave = async () => {
//     try {
//       setSaving(true);
//       await axios.post("/api/ipl-pulse/spotlight", data);
//       alert("Spotlight updated successfully!");
//     } catch (error) {
//       console.error("Failed to save spotlight data", error);
//       alert("Failed to save changes");
//     } finally {
//       setSaving(false);
//     }
//   };

//   const addPlayer = (section: keyof SpotlightData, player: Player) => {
//     // Check if player already exists in this section
//     if (data[section].some(p => p.id === player.id)) {
//       alert("Player already added to this section");
//       return;
//     }
    
//     setData(prev => ({
//       ...prev,
//       [section]: [...prev[section], player],
//     }));
//   };

//   const removePlayer = (section: keyof SpotlightData, playerId: string) => {
//     setData(prev => ({
//       ...prev,
//       [section]: prev[section].filter(p => p.id !== playerId),
//     }));
//   };

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center min-h-[400px]">
//         <Loader2 className="animate-spin text-blue-500" size={32} />
//       </div>
//     );
//   }

//   return (
//     <div className="max-w-6xl mx-auto space-y-8 pb-12">
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-2xl font-bold text-white">IPL Pulse Spotlight</h1>
//           <p className="text-gray-400 text-sm">Manage featured players for the Pulse dashboard</p>
//         </div>
//         <button
//           onClick={handleSave}
//           disabled={saving}
//           className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-semibold transition shadow-lg"
//         >
//           {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
//           {saving ? "Saving..." : "Save Changes"}
//         </button>
//       </div>

//       <div className="grid grid-cols-1 gap-8">
//         <SpotlightSection
//           title="Players to Watch"
//           subtitle="Rising stars and ones to keep an eye on"
//           players={data.playersToWatch}
//           onAdd={(p) => addPlayer("playersToWatch", p)}
//           onRemove={(id) => removePlayer("playersToWatch", id)}
//           accentColor="text-pink-500"
//         />

//         <SpotlightSection
//           title="Impact Players"
//           subtitle="Game changers who make a difference"
//           players={data.impactPlayers}
//           onAdd={(p) => addPlayer("impactPlayers", p)}
//           onRemove={(id) => removePlayer("impactPlayers", id)}
//           accentColor="text-orange-500"
//         />

//         <SpotlightSection
//           title="Consistent Performers"
//           subtitle="Reliable players with steady track records"
//           players={data.consistentPerformers}
//           onAdd={(p) => addPlayer("consistentPerformers", p)}
//           onRemove={(id) => removePlayer("consistentPerformers", id)}
//           accentColor="text-blue-400"
//         />
//       </div>
//     </div>
//   );
// }

// interface SectionProps {
//   title: string;
//   subtitle: string;
//   players: Player[];
//   onAdd: (player: Player) => void;
//   onRemove: (id: string) => void;
//   accentColor: string;
// }

// function SpotlightSection({ title, subtitle, players, onAdd, onRemove, accentColor }: SectionProps) {
//   return (
//     <div className="bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden shadow-sm">
//       <div className="p-5 border-b border-[#21262d] flex justify-between items-start">
//         <div>
//           <h2 className={`text-lg font-bold ${accentColor}`}>{title}</h2>
//           <p className="text-gray-500 text-xs mt-0.5">{subtitle}</p>
//         </div>
//         <div className="text-xs font-mono text-gray-500 bg-black/20 px-2 py-1 rounded">
//           {players.length} Players
//         </div>
//       </div>

//       <div className="p-5 space-y-6">
//         {/* Search & Add */}
//         <div>
//           <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Search & Add Player</label>
//           <PlayerSearch onSelect={onAdd} />
//         </div>

//         {/* Selected Players Grid */}
//         <div>
//           <label className="text-xs text-gray-400 uppercase tracking-wider mb-3 block">Selected Players</label>
//           {players.length === 0 ? (
//             <div className="border-2 border-dashed border-[#21262d] rounded-lg p-8 text-center">
//               <User className="mx-auto text-gray-700 mb-2" size={32} />
//               <p className="text-gray-500 text-sm">No players selected yet</p>
//             </div>
//           ) : (
//             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
//               {players.map((player) => (
//                 <div key={player.id} className="group relative bg-[#0d1117] border border-[#30363d] rounded-xl p-3 flex flex-col items-center text-center transition hover:border-[#8b949e]">
//                   <button
//                     onClick={() => onRemove(player.id)}
//                     className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition scale-75 group-hover:scale-100"
//                   >
//                     <X size={14} />
//                   </button>
//                   <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#30363d] mb-2 bg-gradient-to-br from-[#161b22] to-[#0d1117]">
//                     {player.avatar ? (
//                       <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
//                     ) : (
//                       <div className="w-full h-full flex items-center justify-center text-gray-600">
//                         <User size={24} />
//                       </div>
//                     )}
//                   </div>
//                   <h3 className="text-xs font-semibold text-white truncate w-full">{player.name}</h3>
//                   <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold">{player.team}</p>
//                 </div>
//               ))}
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }

// function PlayerSearch({ onSelect }: { onSelect: (p: Player) => void }) {
//   const [query, setQuery] = useState("");
//   const [results, setResults] = useState<Player[]>([]);
//   const [searching, setSearching] = useState(false);
//   const [showResults, setShowResults] = useState(false);

//   useEffect(() => {
//     if (!query.trim()) {
//       setResults([]);
//       return;
//     }

//     const timer = setTimeout(async () => {
//       setSearching(true);
//       try {
//         const res = await axios.get(`/api/player-profile?search=${encodeURIComponent(query)}&limit=10`);
//         setResults(res.data.profiles || []);
//         setShowResults(true);
//       } catch (error) {
//         console.error("Search failed", error);
//       } finally {
//         setSearching(false);
//       }
//     }, 400);

//     return () => clearTimeout(timer);
//   }, [query]);

//   return (
//     <div className="relative">
//       <div className="relative">
//         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
//           <SearchIcon size={16} className="text-gray-500" />
//         </div>
//         <input
//           type="text"
//           value={query}
//           onChange={(e) => setQuery(e.target.value)}
//           onFocus={() => query && setShowResults(true)}
//           placeholder="Search for a player by name..."
//           className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-10 pr-10 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
//         />
//         {query && (
//           <button
//             onClick={() => { setQuery(""); setShowResults(false); }}
//             className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"
//           >
//             <X size={16} />
//           </button>
//         )}
//       </div>

//       {showResults && (query || searching) && (
//         <>
//           <div className="fixed inset-0 z-10" onClick={() => setShowResults(false)} />
//           <div className="absolute z-20 mt-2 w-full bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl max-h-64 overflow-y-auto overflow-x-hidden">
//             {searching ? (
//               <div className="p-4 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
//                 <Loader2 className="animate-spin" size={16} />
//                 Searching...
//               </div>
//             ) : results.length === 0 ? (
//               <div className="p-4 text-center text-gray-500 text-sm">
//                 No players found
//               </div>
//             ) : (
//               <div className="p-2 space-y-1">
//                 {results.map((player) => (
//                   <button
//                     key={player.id}
//                     onClick={() => {
//                       onSelect(player);
//                       setQuery("");
//                       setShowResults(false);
//                     }}
//                     className="w-full flex items-center gap-3 p-2 hover:bg-[#21262d] rounded-lg transition text-left group"
//                   >
//                     <div className="w-10 h-10 rounded-full overflow-hidden border border-[#30363d] bg-black shrink-0">
//                       {player.avatar ? (
//                         <img src={player.avatar} alt={player.name} className="w-full h-full object-cover" />
//                       ) : (
//                         <div className="w-full h-full flex items-center justify-center text-gray-700">
//                           <User size={18} />
//                         </div>
//                       )}
//                     </div>
//                     <div className="flex-1 overflow-hidden">
//                       <div className="text-sm font-medium text-white group-hover:text-blue-400 transition truncate">{player.name}</div>
//                       <div className="text-xs text-gray-500 font-mono">{player.team}</div>
//                     </div>
//                     <div className="text-[10px] font-bold text-blue-500 opacity-0 group-hover:opacity-100 transition pr-2">
//                       ADD +
//                     </div>
//                   </button>
//                 ))}
//               </div>
//             )}
//           </div>
//         </>
//       )}
//     </div>
//   );
// }




export default function Spotlight(){

  return (
    <>
    <p>Spotplayers list page</p>
    </>
  )
}