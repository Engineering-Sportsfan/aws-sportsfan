// "use client";

// import { useEffect, useState } from "react";
// import { useRouter, useSearchParams } from "next/navigation";
// import axios from "axios";
// import { ChevronLeft } from "lucide-react";

// type BattleType = "PLAYERS" | "CLUBS";

// type InvitedFriend = {
//   name: string;
//   email: string;
// };

// type Battle = {
//   id: string;
//   battleName: string;
//   battleType: BattleType;
//   selectedPlayers?: string[];
//   selectedClubs?: string[];
//   invitedFriends?: InvitedFriend[];
//   userId?: string;
//   userName?: string;
//   createdAt?: number;
//   updatedAt?: number;
// };
// //done
// export default function AddBattlePage() {
//   const router = useRouter();
//   const searchParams = useSearchParams();
//   const battleId = searchParams.get("id");

//   const [battle, setBattle] = useState<Battle>({
//     id: "",
//     battleName: "",
//     battleType: "PLAYERS",
//     selectedPlayers: [],
//     selectedClubs: [],
//     invitedFriends: [],
//     userId: "admin",
//     userName: "Admin User",
//   });

//   const [loading, setLoading] = useState(!!battleId);
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState("");

//   useEffect(() => {
//     if (battleId) {
//       fetchBattle();
//     }
//   }, [battleId]);

//   const fetchBattle = async () => {
//     try {
//       setLoading(true);
//       const res = await axios.get(`/api/battle/${battleId}`);
//       setBattle(res.data.battle);
//     } catch (err) {
//       console.error("Failed to fetch battle", err);
//       setError("Failed to load battle details");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleSave = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setError("");
//     setSaving(true);

//     try {
//       if (battleId) {
//         await axios.put(`/api/battle/${battleId}`, battle);
//         alert("Battle updated successfully");
//       } else {
//         const res = await axios.post("/api/battle", battle);
//         console.log("Create response:", res.data);
//         alert("Battle created successfully");
//       }
//       router.push("/admin/fanbattle-management/battle-list");
//     } catch (err) {
//       console.error("Save failed", err);
//       setError("Failed to save battle");
//     } finally {
//       setSaving(false);
//     }
//   };

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center min-h-screen">
//         <div className="text-center">
//           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
//           <p className="text-gray-400">Loading battle...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="max-w-2xl mx-auto p-6">
//       <div className="flex items-center gap-2 mb-6">
//         <button
//           onClick={() => router.back()}
//           className="p-2 hover:bg-gray-700 rounded transition"
//         >
//           <ChevronLeft size={20} className="text-gray-400" />
//         </button>
//         <h1 className="text-2xl font-semibold text-white">
//           {battleId ? "Edit Battle" : "Create Battle"}
//         </h1>
//       </div>

//       <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6">
//         {error && (
//           <div className="mb-4 p-3 bg-red-500/10 border border-red-600/30 rounded text-red-400 text-sm">
//             {error}
//           </div>
//         )}

//         <form onSubmit={handleSave} className="space-y-5">
//           {/* Battle Name */}
//           <div>
//             <label className="block text-sm text-gray-300 mb-2">Battle Name *</label>
//             <input
//               type="text"
//               value={battle.battleName}
//               onChange={(e) => setBattle({ ...battle, battleName: e.target.value })}
//               placeholder="Enter battle name"
//               className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-white outline-none focus:border-blue-500 transition"
//               required
//             />
//           </div>

//           {/* Battle Type */}
//           <div>
//             <label className="block text-sm text-gray-300 mb-2">Battle Type *</label>
//             <div className="flex gap-3">
//               {(["PLAYERS", "CLUBS"] as BattleType[]).map((type) => (
//                 <label key={type} className="flex items-center gap-2 cursor-pointer">
//                   <input
//                     type="radio"
//                     name="battleType"
//                     value={type}
//                     checked={battle.battleType === type}
//                     onChange={(e) => setBattle({ ...battle, battleType: e.target.value as BattleType })}
//                     className="w-4 h-4"
//                   />
//                   <span className="text-sm text-gray-300">{type}</span>
//                 </label>
//               ))}
//             </div>
//           </div>

//           {/* Selected Players */}
//           {battle.battleType === "PLAYERS" && (
//             <div>
//               <label className="block text-sm text-gray-300 mb-2">Selected Players</label>
//               <textarea
//                 value={battle.selectedPlayers?.join(", ") || ""}
//                 onChange={(e) =>
//                   setBattle({
//                     ...battle,
//                     selectedPlayers: e.target.value.split(",").map((s) => s.trim()),
//                   })
//                 }
//                 placeholder="Enter player IDs separated by commas"
//                 rows={4}
//                 className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-white outline-none focus:border-blue-500 transition text-sm"
//               />
//               <p className="text-xs text-gray-500 mt-1">
//                 Current: {battle.selectedPlayers?.length ?? 0} player(s)
//               </p>
//             </div>
//           )}

//           {/* Selected Clubs */}
//           {battle.battleType === "CLUBS" && (
//             <div>
//               <label className="block text-sm text-gray-300 mb-2">Selected Clubs</label>
//               <textarea
//                 value={battle.selectedClubs?.join(", ") || ""}
//                 onChange={(e) =>
//                   setBattle({
//                     ...battle,
//                     selectedClubs: e.target.value.split(",").map((s) => s.trim()),
//                   })
//                 }
//                 placeholder="Enter club IDs separated by commas"
//                 rows={4}
//                 className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-white outline-none focus:border-blue-500 transition text-sm"
//               />
//               <p className="text-xs text-gray-500 mt-1">
//                 Current: {battle.selectedClubs?.length ?? 0} club(s)
//               </p>
//             </div>
//           )}

//           {/* Invited Friends */}
//           <div>
//             <label className="block text-sm text-gray-300 mb-2">Invited Friends</label>
//             <textarea
//               value={
//                 battle.invitedFriends
//                   ?.map((f) => `${f.name}|${f.email}`)
//                   .join("\n") || ""
//               }
//               onChange={(e) =>
//                 setBattle({
//                   ...battle,
//                   invitedFriends: e.target.value
//                     .split("\n")
//                     .filter((line) => line.trim())
//                     .map((line) => {
//                       const [name, email] = line.split("|");
//                       return { name: name?.trim() || "", email: email?.trim() || "" };
//                     }),
//                 })
//               }
//               placeholder="Enter friends (one per line): Name|Email"
//               rows={4}
//               className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-white outline-none focus:border-blue-500 transition text-sm"
//             />
//             <p className="text-xs text-gray-500 mt-1">
//               Current: {battle.invitedFriends?.length ?? 0} friend(s)
//             </p>
//           </div>

//           {/* User Info */}
//           <div className="grid grid-cols-2 gap-4">
//             <div>
//               <label className="block text-sm text-gray-300 mb-2">User ID</label>
//               <input
//                 type="text"
//                 value={battle.userId || ""}
//                 onChange={(e) => setBattle({ ...battle, userId: e.target.value })}
//                 className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-white outline-none focus:border-blue-500 transition text-sm"
//               />
//             </div>
//             <div>
//               <label className="block text-sm text-gray-300 mb-2">User Name</label>
//               <input
//                 type="text"
//                 value={battle.userName || ""}
//                 onChange={(e) => setBattle({ ...battle, userName: e.target.value })}
//                 className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-white outline-none focus:border-blue-500 transition text-sm"
//               />
//             </div>
//           </div>

//           {/* Actions */}
//           <div className="flex gap-3 pt-4">
//             <button
//               type="submit"
//               disabled={saving}
//               className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded text-white font-medium transition"
//             >
//               {saving ? "Saving..." : battleId ? "Update Battle" : "Create Battle"}
//             </button>
//             <button
//               type="button"
//               onClick={() => router.back()}
//               className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white font-medium transition"
//             >
//               Cancel
//             </button>
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// }


export default function PageContent() {
    return (
        <div className="max-w-[1440px] mx-auto p-6">  
        <p>Fan Battle</p>
        </div>
    )
  }