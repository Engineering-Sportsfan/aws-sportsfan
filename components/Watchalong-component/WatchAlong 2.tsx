// // "use client";

// // import axios from "axios";
// // import { useRouter } from "next/navigation";
// // import { useState, useEffect, ChangeEvent, InputHTMLAttributes } from "react";

// // /* ─── Types ─── */

// // type MatchOption = {
// //   id: string;
// //   matchNo: number;
// //   tournament: string;
// //   team1: { name: string; score: string; overs: string };
// //   team2: { name: string; score: string; overs: string };
// //   stadium: string;
// //   isLive: boolean;
// // };

// // type RoomForm = {
// //   name: string;
// //   role: string;
// //   badge: string;
// //   badgeColor: string;
// //   borderColor: string;
// //   watching: string;
// //   engagement: string;
// //   active: string;
// //   isLive: boolean;
// //   liveMatchId: string;
// // };

// // type MatchForm = {
// //   matchNo: string;
// //   tournament: string;
// //   stadium: string;
// //   team1Name: string;
// //   team1Score: string;
// //   team1Overs: string;
// //   team2Name: string;
// //   team2Score: string;
// //   team2Overs: string;
// //   isLive: boolean;
// // };

// // const BADGE_OPTIONS = [
// //   { label: "Legend",       badgeColor: "bg-pink-600",   borderColor: "border-pink-500"   },
// //   { label: "Pro Analyst",  badgeColor: "bg-orange-500", borderColor: "border-orange-400" },
// //   { label: "Elite Expert", badgeColor: "bg-purple-600", borderColor: "border-purple-500" },
// //   { label: "Custom",       badgeColor: "bg-gray-600",   borderColor: "border-gray-500"   },
// // ];

// // /* ─────────────────────────────────────────────
// //    MAIN COMPONENT
// //    Props:
// //      roomIdToEdit  → edit an existing room
// //      matchIdToEdit → edit an existing match
// //    ───────────────────────────────────────────── */
// // export default function CreateWatchAlong({
// //   roomIdToEdit,
// // }: {
// //   roomIdToEdit?: string;
// // }) {
// //   const router = useRouter();
// //   const [activeTab, setActiveTab] = useState<"room" | "match">("room");

// //   /* ── Room state ── */
// //   const [roomForm, setRoomForm] = useState<RoomForm>({
// //     name: "",
// //     role: "",
// //     badge: "Legend",
// //     badgeColor: "bg-blue-600",
// //     borderColor: "border-blue-500",
// //     watching: "",
// //     engagement: "",
// //     active: "",
// //     isLive: false,
// //     liveMatchId: "",
// //   });
// //   const [dpFile, setDpFile] = useState<File | null>(null);
// //   const [existingDp, setExistingDp] = useState("");
// //   const [roomLoading, setRoomLoading] = useState(false);

// //   /* ── Match state ── */
// //   const [matchForm, setMatchForm] = useState<MatchForm>({
// //     matchNo: "",
// //     tournament: "",
// //     stadium: "",
// //     team1Name: "",
// //     team1Score: "",
// //     team1Overs: "",
// //     team2Name: "",
// //     team2Score: "",
// //     team2Overs: "",
// //     isLive: false,
// //   });
// //   const [matchLoading, setMatchLoading] = useState(false);
// //   const [matchOptions, setMatchOptions] = useState<MatchOption[]>([]);

// //   /* ── Load match options for dropdown ── */
// //   useEffect(() => {
// //     axios
// //       .get("/api/watch-along/matches")
// //       .then((res) => {
// //         if (res.data.success) setMatchOptions(res.data.matches);
// //       })
// //       .catch(console.error);
// //   }, []);

// //   /* ── Load existing room for editing ── */
// //   useEffect(() => {
// //     if (!roomIdToEdit) return;
// //     axios.get(`/api/watch-along/${roomIdToEdit}`).then((res) => {
// //       if (!res.data.success) return;
// //       const r = res.data.room;
// //       setRoomForm({
// //         name: r.name || "",
// //         role: r.role || "",
// //         badge: r.badge || "Legend",
// //         badgeColor: r.badgeColor || "bg-blue-600",
// //         borderColor: r.borderColor || "border-blue-500",
// //         watching: r.watching || "",
// //         engagement: r.engagement || "",
// //         active: r.active || "",
// //         isLive: r.isLive || false,
// //         liveMatchId: r.liveMatchId || "",
// //       });
// //       setExistingDp(r.displayPicture || "");
// //     });
// //   }, [roomIdToEdit]);

// //   /* ─── Room handlers ─── */
// //   const handleRoomChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
// //     const { name, value, type } = e.target;
// //     setRoomForm((prev) => ({
// //       ...prev,
// //       [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
// //     }));
// //   };

// //   const handleBadgePick = (option: (typeof BADGE_OPTIONS)[0]) => {
// //     setRoomForm((prev) => ({
// //       ...prev,
// //       badge: option.label,
// //       badgeColor: option.badgeColor,
// //       borderColor: option.borderColor,
// //     }));
// //   };

// //   const handleRoomSubmit = async () => {
// //     if (!roomForm.name || !roomForm.role || !roomForm.badge) {
// //       alert("Name, role, and badge are required");
// //       return;
// //     }
// //     setRoomLoading(true);
// //     try {
// //       const fd = new FormData();
// //       Object.entries(roomForm).forEach(([k, v]) => fd.append(k, String(v)));
// //       if (dpFile) fd.append("displayPicture", dpFile);

// //       const url = roomIdToEdit
// //         ? `/api/watch-along/${roomIdToEdit}`
// //         : "/api/watch-along";
// //       const method = roomIdToEdit ? axios.put : axios.post;
// //       const res = await method(url, fd, {
// //         headers: { "Content-Type": "multipart/form-data" },
// //       });

// //       if (res.data.success) {
// //         alert(roomIdToEdit ? "Room updated!" : "Room created!");
// //         router.push("/admin/watch-along/list");
// //       }
// //     } catch (err) {
// //       console.error(err);
// //       alert("Error saving room");
// //     } finally {
// //       setRoomLoading(false);
// //     }
// //   };

// //   /* ─── Match handlers ─── */
// //   const handleMatchChange = (e: ChangeEvent<HTMLInputElement>) => {
// //     const { name, value, type, checked } = e.target;
// //     setMatchForm((prev) => ({
// //       ...prev,
// //       [name]: type === "checkbox" ? checked : value,
// //     }));
// //   };

// //   const handleMatchSubmit = async () => {
// //     if (!matchForm.matchNo || !matchForm.team1Name || !matchForm.team2Name) {
// //       alert("Match no, team 1 name, and team 2 name are required");
// //       return;
// //     }
// //     setMatchLoading(true);
// //     try {
// //       const payload = {
// //         matchNo: matchForm.matchNo,
// //         tournament: matchForm.tournament,
// //         stadium: matchForm.stadium,
// //         isLive: matchForm.isLive,
// //         team1: { name: matchForm.team1Name, score: matchForm.team1Score, overs: matchForm.team1Overs },
// //         team2: { name: matchForm.team2Name, score: matchForm.team2Score, overs: matchForm.team2Overs },
// //       };
// //       const res = await axios.post("/api/watch-along/matches", payload);
// //       if (res.data.success) {
// //         alert("Match created!");
// //         setMatchOptions((prev) => [res.data.match, ...prev]);
// //         setMatchForm({
// //           matchNo: "", tournament: "", stadium: "",
// //           team1Name: "", team1Score: "", team1Overs: "",
// //           team2Name: "", team2Score: "", team2Overs: "",
// //           isLive: false,
// //         });
// //       }
// //     } catch (err) {
// //       console.error(err);
// //       alert("Error saving match");
// //     } finally {
// //       setMatchLoading(false);
// //     }
// //   };

// //   /* ─── Render ─── */
// //   return (
// //     <div className="max-w-[1200px] mx-auto p-6">
// //       <div className="mb-6">
// //         <h1 className="text-lg font-semibold text-white">
// //           {roomIdToEdit ? "Edit Watch Along Room" : "Create Watch Along"}
// //         </h1>
// //         <p className="text-xs text-gray-500 mt-1">
// //           Rooms are expert cards in the lobby. Matches are the live game data linked to a room.
// //         </p>
// //       </div>

// //       {/* Tabs */}
// //       <div className="flex gap-2 mb-6">
// //         {(["room", "match"] as const).map((t) => (
// //           <button
// //             key={t}
// //             onClick={() => setActiveTab(t)}
// //             className={`px-4 py-2 rounded text-sm font-semibold capitalize transition-all ${
// //               activeTab === t
// //                 ? "bg-blue-600 text-white"
// //                 : "bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#2a2a2a]"
// //             }`}
// //           >
// //             {t === "room" ? "Expert Room" : "Live Match"}
// //           </button>
// //         ))}
// //       </div>

// //       {/* ══════════ ROOM FORM ══════════ */}
// //       {activeTab === "room" && (
// //         <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
// //           <Section title="Expert Info">
// //             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
// //               <TextInput label="Expert Name *" name="name" value={roomForm.name} onChange={handleRoomChange} placeholder="e.g. Harsha Bhogle" />
// //               <TextInput label="Role / Subtitle *" name="role" value={roomForm.role} onChange={handleRoomChange} placeholder="e.g. Cricket Commentary Legend" />
// //             </div>
// //           </Section>

// //           <Section title="Display Picture">
// //             <div className="flex items-start gap-4">
// //               <div>
// //                 <label className="text-xs text-gray-400">Upload Photo</label>
// //                 <input
// //                   type="file"
// //                   accept="image/*"
// //                   onChange={(e) => setDpFile(e.target.files?.[0] ?? null)}
// //                   className="block w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 cursor-pointer"
// //                 />
// //               </div>
// //               {(dpFile || existingDp) && (
// //                 <img
// //                   src={dpFile ? URL.createObjectURL(dpFile) : existingDp}
// //                   alt="preview"
// //                   className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 mt-5"
// //                 />
// //               )}
// //             </div>
// //           </Section>

// //           <Section title="Badge">
// //             <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
// //               {BADGE_OPTIONS.map((opt) => (
// //                 <button
// //                   key={opt.label}
// //                   onClick={() => handleBadgePick(opt)}
// //                   className={`py-2 px-3 rounded text-xs font-semibold border transition-all ${
// //                     roomForm.badge === opt.label
// //                       ? "border-white text-white " + opt.badgeColor
// //                       : "border-[#333] text-gray-400 bg-[#0d1117] hover:border-gray-500"
// //                   }`}
// //                 >
// //                   {opt.label}
// //                 </button>
// //               ))}
// //             </div>
// //             {/* Custom badge name if "Custom" picked */}
// //             {roomForm.badge !== "Legend" &&
// //               roomForm.badge !== "Pro Analyst" &&
// //               roomForm.badge !== "Elite Expert" && (
// //                 <TextInput label="Custom Badge Label" name="badge" value={roomForm.badge} onChange={handleRoomChange} placeholder="e.g. Specialist" />
// //               )}
// //           </Section>

// //           <Section title="Stats (display only)">
// //             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
// //               <TextInput label="Watching" name="watching" value={roomForm.watching} onChange={handleRoomChange} placeholder="e.g. 24,892" />
// //               <TextInput label="Engagement" name="engagement" value={roomForm.engagement} onChange={handleRoomChange} placeholder="e.g. 94%" />
// //               <TextInput label="Active" name="active" value={roomForm.active} onChange={handleRoomChange} placeholder="e.g. 2.8k" />
// //             </div>
// //           </Section>

// //           <Section title="Live Match">
// //             <div className="flex items-center gap-3 mb-4">
// //               <input
// //                 type="checkbox"
// //                 id="isLive"
// //                 name="isLive"
// //                 checked={roomForm.isLive}
// //                 onChange={handleRoomChange}
// //                 className="w-4 h-4 bg-blue-600"
// //               />
// //               <label htmlFor="isLive" className="text-sm text-gray-300">
// //                 Mark this room as LIVE
// //               </label>
// //             </div>

// //             {roomForm.isLive && (
// //               <div>
// //                 <label className="text-xs text-gray-400">
// //                   Link to a Match <span className="text-gray-600">(optional — create one in the &quot;Live Match&quot; tab first)</span>
// //                 </label>
// //                 <select
// //                   name="liveMatchId"
// //                   value={roomForm.liveMatchId}
// //                   onChange={handleRoomChange}
// //                   className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1"
// //                 >
// //                   <option value="">— No match linked —</option>
// //                   {matchOptions.map((m) => (
// //                     <option key={m.id} value={m.id}>
// //                       Match {m.matchNo} · {m.team1.name} vs {m.team2.name} · {m.tournament}
// //                       {m.isLive ? " 🔴 LIVE" : ""}
// //                     </option>
// //                   ))}
// //                 </select>
// //               </div>
// //             )}
// //           </Section>

// //           <div className="flex gap-3">
// //             <button
// //               onClick={handleRoomSubmit}
// //               disabled={roomLoading}
// //               className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-3 rounded font-semibold text-white transition-all"
// //             >
// //               {roomLoading
// //                 ? roomIdToEdit ? "Updating..." : "Creating..."
// //                 : roomIdToEdit ? "Update Room" : "Create Room"}
// //             </button>
// //             <button
// //               onClick={() => router.back()}
// //               className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white transition-all"
// //             >
// //               Cancel
// //             </button>
// //           </div>
// //         </div>
// //       )}

// //       {/* ══════════ MATCH FORM ══════════ */}
// //       {activeTab === "match" && (
// //         <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
// //           <Section title="Match Info">
// //             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
// //               <TextInput label="Match No *" name="matchNo" value={matchForm.matchNo} onChange={handleMatchChange} placeholder="e.g. 23" />
// //               <TextInput label="Tournament" name="tournament" value={matchForm.tournament} onChange={handleMatchChange} placeholder="e.g. IPL 2026" />
// //               <TextInput label="Stadium" name="stadium" value={matchForm.stadium} onChange={handleMatchChange} placeholder="e.g. M. Chinnaswamy Stadium, Bengaluru" />
// //             </div>
// //           </Section>

// //           <Section title="Team 1">
// //             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
// //               <TextInput label="Team Name *" name="team1Name" value={matchForm.team1Name} onChange={handleMatchChange} placeholder="e.g. RCB" />
// //               <TextInput label="Score" name="team1Score" value={matchForm.team1Score} onChange={handleMatchChange} placeholder="e.g. 156/3" />
// //               <TextInput label="Overs" name="team1Overs" value={matchForm.team1Overs} onChange={handleMatchChange} placeholder="e.g. 15.2" />
// //             </div>
// //           </Section>

// //           <Section title="Team 2">
// //             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
// //               <TextInput label="Team Name *" name="team2Name" value={matchForm.team2Name} onChange={handleMatchChange} placeholder="e.g. MI" />
// //               <TextInput label="Score" name="team2Score" value={matchForm.team2Score} onChange={handleMatchChange} placeholder="e.g. 158/4" />
// //               <TextInput label="Overs" name="team2Overs" value={matchForm.team2Overs} onChange={handleMatchChange} placeholder="e.g. 20" />
// //             </div>
// //           </Section>

// //           <div className="flex items-center gap-3">
// //             <input
// //               type="checkbox"
// //               id="matchIsLive"
// //               name="isLive"
// //               checked={matchForm.isLive}
// //               onChange={handleMatchChange}
// //               className="w-4 h-4 accent-blue-600"
// //             />
// //             <label htmlFor="matchIsLive" className="text-sm text-gray-300">
// //               This match is currently LIVE
// //             </label>
// //           </div>

// //           {/* Existing matches list */}
// //           {matchOptions.length > 0 && (
// //             <div>
// //               <p className="text-xs text-gray-500 mb-2">Existing matches</p>
// //               <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
// //                 {matchOptions.map((m) => (
// //                   <div
// //                     key={m.id}
// //                     className="flex items-center justify-between bg-[#0d1117] border border-[#2a2a2a] rounded px-3 py-2 text-xs text-gray-300"
// //                   >
// //                     <span>
// //                       Match {m.matchNo} · <span className="text-blue-400">{m.team1.name}</span> vs{" "}
// //                       <span className="text-blue-400">{m.team2.name}</span> · {m.tournament}
// //                     </span>
// //                     {m.isLive && (
// //                       <span className="ml-2 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">LIVE</span>
// //                     )}
// //                   </div>
// //                 ))}
// //               </div>
// //             </div>
// //           )}

// //           <div className="flex gap-3">
// //             <button
// //               onClick={handleMatchSubmit}
// //               disabled={matchLoading}
// //               className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-3 rounded font-semibold text-white transition-all"
// //             >
// //               {matchLoading ? "Creating..." : "Create Match"}
// //             </button>
// //             <button
// //               onClick={() =>
// //                 setMatchForm({
// //                   matchNo: "", tournament: "", stadium: "",
// //                   team1Name: "", team1Score: "", team1Overs: "",
// //                   team2Name: "", team2Score: "", team2Overs: "",
// //                   isLive: false,
// //                 })
// //               }
// //               className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white transition-all"
// //             >
// //               Clear
// //             </button>
// //           </div>
// //         </div>
// //       )}
// //     </div>
// //   );
// // }

// // /* ─── Reusable sub-components ─── */

// // function Section({ title, children }: { title: string; children: React.ReactNode }) {
// //   return (
// //     <div>
// //       <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-[#21262d] pb-2">
// //         {title}
// //       </h2>
// //       {children}
// //     </div>
// //   );
// // }

// // type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

// // function TextInput({ label, ...props }: TextInputProps) {
// //   return (
// //     <div>
// //       <label className="text-xs text-gray-400">{label}</label>
// //       <input
// //         {...props}
// //         className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 focus:outline-none focus:border-blue-500 transition-colors"
// //       />
// //     </div>
// //   );
// // }










// // app/admin/watchalong-management/add-watchalong/page.tsx
// "use client";

// import axios from "axios";
// import { useRouter } from "next/navigation";
// import { useState, useEffect, ChangeEvent, InputHTMLAttributes } from "react";
// import ChatAdminPanel from "./Chat";
// import PredictionsAdminPanel from "./Predictions";
// import QuizAdminPanel from "./Quiz";
// import EmojiStormAdminPanel from "./Emojistorm";


// /* ─── Types ─── */

// type MatchOption = {
//   id: string;
//   matchNo: number;
//   tournament: string;
//   team1: { name: string; score: string; overs: string };
//   team2: { name: string; score: string; overs: string };
//   stadium: string;
//   isLive: boolean;
// };

// type RoomForm = {
//   name: string;
//   role: string;
//   badge: string;
//   badgeColor: string;
//   borderColor: string;
//   watching: string;
//   engagement: string;
//   active: string;
//   isLive: boolean;
//   liveMatchId: string;
// };

// type MatchForm = {
//   matchNo: string;
//   tournament: string;
//   stadium: string;
//   team1Name: string;
//   team1Score: string;
//   team1Overs: string;
//   team2Name: string;
//   team2Score: string;
//   team2Overs: string;
//   isLive: boolean;
//   videoUrl: string;
//   videoType: string;
// };

// const BADGE_OPTIONS = [
//   { label: "Legend", badgeColor: "bg-pink-600", borderColor: "border-pink-500" },
//   { label: "Pro Analyst", badgeColor: "bg-orange-500", borderColor: "border-orange-400" },
//   { label: "Elite Expert", badgeColor: "bg-purple-600", borderColor: "border-purple-500" },
//   { label: "Custom", badgeColor: "bg-gray-600", borderColor: "border-gray-500" },
// ];

// type AdminTab = "room" | "match" | "chat" | "predictions" | "quiz" | "emoji";

// /* ─────────────────────────────────────────────
//    MAIN COMPONENT
//    ───────────────────────────────────────────── */
// export default function CreateWatchAlong({
//   roomIdToEdit,
//   matchIdToEdit,
// }: {
//   roomIdToEdit?: string;
//   matchIdToEdit?: string;
// }) {
//   const router = useRouter();
//   const [activeTab, setActiveTab] = useState<AdminTab>("room");
//   const [selectedMatchId, setSelectedMatchId] = useState<string>("");

//   /* ── Room state ── */
//   const [roomForm, setRoomForm] = useState<RoomForm>({
//     name: "",
//     role: "",
//     badge: "Legend",
//     badgeColor: "bg-blue-600",
//     borderColor: "border-blue-500",
//     watching: "",
//     engagement: "",
//     active: "",
//     isLive: false,
//     liveMatchId: "",
//   });
//   const [dpFile, setDpFile] = useState<File | null>(null);
//   const [existingDp, setExistingDp] = useState("");
//   const [roomLoading, setRoomLoading] = useState(false);

//   /* ── Match state ── */
//   const [matchForm, setMatchForm] = useState<MatchForm>({
//     matchNo: "",
//     tournament: "",
//     stadium: "",
//     team1Name: "",
//     team1Score: "",
//     team1Overs: "",
//     team2Name: "",
//     team2Score: "",
//     team2Overs: "",
//     isLive: false,
//     videoUrl: "",
//     videoType: "youtube",
//   });
//   const [matchLoading, setMatchLoading] = useState(false);
//   const [matchOptions, setMatchOptions] = useState<MatchOption[]>([]);
//   const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

//   /* ── Load match options for dropdown ── */
//   useEffect(() => {
//     axios
//       .get("/api/watch-along/matches")
//       .then((res) => {
//         if (res.data.success) setMatchOptions(res.data.matches);
//       })
//       .catch(console.error);
//   }, []);

//   /* ── Load existing room for editing ── */
//   useEffect(() => {
//     if (!roomIdToEdit) return;
//     axios.get(`/api/watch-along/${roomIdToEdit}`).then((res) => {
//       if (!res.data.success) return;
//       const r = res.data.room;
//       setRoomForm({
//         name: r.name || "",
//         role: r.role || "",
//         badge: r.badge || "Legend",
//         badgeColor: r.badgeColor || "bg-blue-600",
//         borderColor: r.borderColor || "border-blue-500",
//         watching: r.watching || "",
//         engagement: r.engagement || "",
//         active: r.active || "",
//         isLive: r.isLive || false,
//         liveMatchId: r.liveMatchId || "",
//       });
//       setExistingDp(r.displayPicture || "");
//       if (r.liveMatchId) {
//         setSelectedMatchId(r.liveMatchId);
//       }
//     });
//   }, [roomIdToEdit]);

//   /* ── Load existing match for editing ── */
//   useEffect(() => {
//     if (!matchIdToEdit) return;
//     axios.get(`/api/watch-along/matches/${matchIdToEdit}`).then((res) => {
//       if (!res.data.success) return;
//       const m = res.data.match;
//       setMatchForm({
//         matchNo: m.matchNo || "",
//         tournament: m.tournament || "",
//         stadium: m.stadium || "",
//         team1Name: m.team1?.name || "",
//         team1Score: m.team1?.score || "",
//         team1Overs: m.team1?.overs || "",
//         team2Name: m.team2?.name || "",
//         team2Score: m.team2?.score || "",
//         team2Overs: m.team2?.overs || "",
//         isLive: m.isLive || false,
//       });
//       setEditingMatchId(matchIdToEdit);
//       setSelectedMatchId(matchIdToEdit);
//     });
//   }, [matchIdToEdit]);

//   /* ─── Room handlers ─── */
//   const handleRoomChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
//     const { name, value, type } = e.target;
//     setRoomForm((prev) => ({
//       ...prev,
//       [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
//     }));
//   };

//   const handleBadgePick = (option: (typeof BADGE_OPTIONS)[0]) => {
//     setRoomForm((prev) => ({
//       ...prev,
//       badge: option.label,
//       badgeColor: option.badgeColor,
//       borderColor: option.borderColor,
//     }));
//   };

//   const handleRoomSubmit = async () => {
//     if (!roomForm.name || !roomForm.role || !roomForm.badge) {
//       alert("Name, role, and badge are required");
//       return;
//     }
//     setRoomLoading(true);
//     try {
//       const fd = new FormData();
//       Object.entries(roomForm).forEach(([k, v]) => fd.append(k, String(v)));
//       if (dpFile) fd.append("displayPicture", dpFile);

//       const url = roomIdToEdit
//         ? `/api/watch-along/${roomIdToEdit}`
//         : "/api/watch-along";
//       const method = roomIdToEdit ? axios.put : axios.post;
//       const res = await method(url, fd, {
//         headers: { "Content-Type": "multipart/form-data" },
//       });

//       if (res.data.success) {
//         alert(roomIdToEdit ? "Room updated!" : "Room created!");
//         router.push("/admin/watch-along/list");
//       }
//     } catch (err) {
//       console.error(err);
//       alert("Error saving room");
//     } finally {
//       setRoomLoading(false);
//     }
//   };

//   /* ─── Match handlers ─── */
//   const handleMatchChange = (e: ChangeEvent<HTMLInputElement>) => {
//     const { name, value, type, checked } = e.target;
//     setMatchForm((prev) => ({
//       ...prev,
//       [name]: type === "checkbox" ? checked : value,
//     }));
//   };

//   const handleMatchSubmit = async () => {
//     if (!matchForm.matchNo || !matchForm.team1Name || !matchForm.team2Name) {
//       alert("Match no, team 1 name, and team 2 name are required");
//       return;
//     }
//     setMatchLoading(true);
//     try {
//       const payload = {
//         matchNo: matchForm.matchNo,
//         tournament: matchForm.tournament,
//         stadium: matchForm.stadium,
//         isLive: matchForm.isLive,
//         team1: { name: matchForm.team1Name, score: matchForm.team1Score, overs: matchForm.team1Overs },
//         team2: { name: matchForm.team2Name, score: matchForm.team2Score, overs: matchForm.team2Overs },
//         videoUrl: matchForm.videoUrl,
//         videoType: matchForm.videoType,
//       };

//       let res;
//       if (editingMatchId) {
//         res = await axios.put(`/api/watch-along/matches/${editingMatchId}`, payload);
//       } else {
//         res = await axios.post("/api/watch-along/matches", payload);
//       }

//       if (res.data.success) {
//         alert(editingMatchId ? "Match updated!" : "Match created!");
//         setMatchOptions((prev) => {
//           if (editingMatchId) {
//             return prev.map((m) => m.id === editingMatchId ? res.data.match : m);
//           }
//           return [res.data.match, ...prev];
//         });
//         setMatchForm({
//           matchNo: "", tournament: "", stadium: "",
//           team1Name: "", team1Score: "", team1Overs: "",
//           team2Name: "", team2Score: "", team2Overs: "",
//           isLive: false,
//         });
//         setEditingMatchId(null);
//         if (res.data.match?.id) {
//           setSelectedMatchId(res.data.match.id);
//         }
//       }
//     } catch (err) {
//       console.error(err);
//       alert("Error saving match");
//     } finally {
//       setMatchLoading(false);
//     }
//   };

//   const handleEditMatch = (match: MatchOption) => {
//     setMatchForm({
//       matchNo: match.matchNo.toString(),
//       tournament: match.tournament || "",
//       stadium: match.stadium || "",
//       team1Name: match.team1.name,
//       team1Score: match.team1.score,
//       team1Overs: match.team1.overs,
//       team2Name: match.team2.name,
//       team2Score: match.team2.score,
//       team2Overs: match.team2.overs,
//       isLive: match.isLive,
//     });
//     setEditingMatchId(match.id);
//     setActiveTab("match");
//   };

//   const handleSelectMatchForFeatures = (matchId: string) => {
//     setSelectedMatchId(matchId);
//     const match = matchOptions.find(m => m.id === matchId);
//     if (match) {
//       alert(`Selected: Match ${match.matchNo} - ${match.team1.name} vs ${match.team2.name}`);
//     }
//   };

//   return (
//     <div className="max-w-[1400px] mx-auto p-6">
//       <div className="mb-6">
//         <h1 className="text-lg font-semibold text-white">
//           {roomIdToEdit ? "Edit Watch Along Room" : "Create Watch Along"}
//         </h1>
//         <p className="text-xs text-gray-500 mt-1">
//           Rooms are expert cards in the lobby. Matches are the live game data linked to a room.
//           After creating a match, you can manage Chat, Predictions, Quiz, and Emoji Storm features.
//         </p>
//       </div>

//       {/* Main Tabs */}
//       <div className="flex flex-wrap gap-2 mb-6 border-b border-[#21262d] pb-3">
//         {[
//           { id: "room", label: "Expert Room", icon: "" },
//           { id: "match", label: "Live Match", icon: "" },
//           { id: "chat", label: "Chat", icon: "" },
//           { id: "predictions", label: "Predictions", icon: "" },
//           { id: "quiz", label: "Quiz", icon: "" },
//           { id: "emoji", label: "Emoji Storm", icon: "" },
//         ].map((tab) => (
//           <button
//             key={tab.id}
//             onClick={() => setActiveTab(tab.id as AdminTab)}
//             className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${activeTab === tab.id
//               ? "bg-blue-600 text-white"
//               : "bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#2a2a2a]"
//               }`}
//           >
//             <span>{tab.icon}</span>
//             {tab.label}
//           </button>
//         ))}
//       </div>

//       {/* Match Selector for Feature Tabs */}
//       {(activeTab === "chat" || activeTab === "predictions" || activeTab === "quiz" || activeTab === "emoji") && (
//         <div className="mb-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
//           <div className="flex items-center justify-between flex-wrap gap-4">
//             <div>
//               <label className="text-xs text-gray-400 block mb-1">Select Match</label>
//               <select
//                 value={selectedMatchId}
//                 onChange={(e) => handleSelectMatchForFeatures(e.target.value)}
//                 className="bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white min-w-[250px]"
//               >
//                 <option value="">— Select a match —</option>
//                 {matchOptions.map((m) => (
//                   <option key={m.id} value={m.id}>
//                     Match {m.matchNo}: {m.team1.name} vs {m.team2.name} {m.isLive ? "🔴 LIVE" : ""}
//                   </option>
//                 ))}
//               </select>
//             </div>
//             {selectedMatchId && (
//               <div className="text-xs text-green-400">
//                 ✓ Editing features for Match ID: {selectedMatchId}
//               </div>
//             )}
//           </div>
//         </div>
//       )}

//       {/* ══════════ ROOM FORM ══════════ */}
//       {activeTab === "room" && (
//         <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
//           <Section title="Expert Info">
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//               <TextInput label="Expert Name *" name="name" value={roomForm.name} onChange={handleRoomChange} placeholder="e.g. Harsha Bhogle" />
//               <TextInput label="Role / Subtitle *" name="role" value={roomForm.role} onChange={handleRoomChange} placeholder="e.g. Cricket Commentary Legend" />
//             </div>
//           </Section>

//           <Section title="Display Picture">
//             <div className="flex items-start gap-4">
//               <div>
//                 <label className="text-xs text-gray-400">Upload Photo</label>
//                 <input
//                   type="file"
//                   accept="image/*"
//                   onChange={(e) => setDpFile(e.target.files?.[0] ?? null)}
//                   className="block w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 cursor-pointer"
//                 />
//               </div>
//               {(dpFile || existingDp) && (
//                 <img
//                   src={dpFile ? URL.createObjectURL(dpFile) : existingDp}
//                   alt="preview"
//                   className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 mt-5"
//                 />
//               )}
//             </div>
//           </Section>

//           <Section title="Badge">
//             <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
//               {BADGE_OPTIONS.map((opt) => (
//                 <button
//                   key={opt.label}
//                   onClick={() => handleBadgePick(opt)}
//                   className={`py-2 px-3 rounded text-xs font-semibold border transition-all ${roomForm.badge === opt.label
//                     ? "border-white text-white " + opt.badgeColor
//                     : "border-[#333] text-gray-400 bg-[#0d1117] hover:border-gray-500"
//                     }`}
//                 >
//                   {opt.label}
//                 </button>
//               ))}
//             </div>
//             {roomForm.badge !== "Legend" &&
//               roomForm.badge !== "Pro Analyst" &&
//               roomForm.badge !== "Elite Expert" && (
//                 <TextInput label="Custom Badge Label" name="badge" value={roomForm.badge} onChange={handleRoomChange} placeholder="e.g. Specialist" />
//               )}
//           </Section>

//           <Section title="Stats (display only)">
//             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
//               <TextInput label="Watching" name="watching" value={roomForm.watching} onChange={handleRoomChange} placeholder="e.g. 24,892" />
//               <TextInput label="Engagement" name="engagement" value={roomForm.engagement} onChange={handleRoomChange} placeholder="e.g. 94%" />
//               <TextInput label="Active" name="active" value={roomForm.active} onChange={handleRoomChange} placeholder="e.g. 2.8k" />
//             </div>
//           </Section>

//           <Section title="Live Match">
//             <div className="flex items-center gap-3 mb-4">
//               <input
//                 type="checkbox"
//                 id="isLive"
//                 name="isLive"
//                 checked={roomForm.isLive}
//                 onChange={handleRoomChange}
//                 className="w-4 h-4 bg-blue-600"
//               />
//               <label htmlFor="isLive" className="text-sm text-gray-300">
//                 Mark this room as LIVE
//               </label>
//             </div>

//             {roomForm.isLive && (
//               <div>
//                 <label className="text-xs text-gray-400">
//                   Link to a Match <span className="text-gray-600">(create one in the &quot;Live Match&quot; tab first)</span>
//                 </label>
//                 <select
//                   name="liveMatchId"
//                   value={roomForm.liveMatchId}
//                   onChange={handleRoomChange}
//                   className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1"
//                 >
//                   <option value="">— No match linked —</option>
//                   {matchOptions.map((m) => (
//                     <option key={m.id} value={m.id}>
//                       Match {m.matchNo} · {m.team1.name} vs {m.team2.name} · {m.tournament}
//                       {m.isLive ? " 🔴 LIVE" : ""}
//                     </option>
//                   ))}
//                 </select>
//               </div>
//             )}
//           </Section>

//           <div className="flex gap-3">
//             <button
//               onClick={handleRoomSubmit}
//               disabled={roomLoading}
//               className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-3 rounded font-semibold text-white transition-all"
//             >
//               {roomLoading
//                 ? roomIdToEdit ? "Updating..." : "Creating..."
//                 : roomIdToEdit ? "Update Room" : "Create Room"}
//             </button>
//             <button
//               onClick={() => router.back()}
//               className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white transition-all"
//             >
//               Cancel
//             </button>
//           </div>
//         </div>
//       )}

//       {/* ══════════ MATCH FORM ══════════ */}
//       {activeTab === "match" && (
//         <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
//           <div className="flex items-center justify-between">
//             <Section title={editingMatchId ? "Edit Match" : "Create New Match"}>
//               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//                 <TextInput label="Match No *" name="matchNo" value={matchForm.matchNo} onChange={handleMatchChange} placeholder="e.g. 23" />
//                 <TextInput label="Tournament" name="tournament" value={matchForm.tournament} onChange={handleMatchChange} placeholder="e.g. IPL 2026" />
//                 <TextInput label="Stadium" name="stadium" value={matchForm.stadium} onChange={handleMatchChange} placeholder="e.g. M. Chinnaswamy Stadium" />
//               </div>
//             </Section>
//             {editingMatchId && (
//               <button
//                 onClick={() => {
//                   setEditingMatchId(null);
//                   setMatchForm({
//                     matchNo: "", tournament: "", stadium: "",
//                     team1Name: "", team1Score: "", team1Overs: "",
//                     team2Name: "", team2Score: "", team2Overs: "",
//                     isLive: false,
//                   });
//                 }}
//                 className="text-xs text-gray-500 hover:text-gray-300"
//               >
//                 Cancel Edit
//               </button>
//             )}
//           </div>

//           <Section title="Team 1">
//             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
//               <TextInput label="Team Name *" name="team1Name" value={matchForm.team1Name} onChange={handleMatchChange} placeholder="e.g. RCB" />
//               <TextInput label="Score" name="team1Score" value={matchForm.team1Score} onChange={handleMatchChange} placeholder="e.g. 156/3" />
//               <TextInput label="Overs" name="team1Overs" value={matchForm.team1Overs} onChange={handleMatchChange} placeholder="e.g. 15.2" />
//             </div>
//           </Section>

//           <Section title="Team 2">
//             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
//               <TextInput label="Team Name *" name="team2Name" value={matchForm.team2Name} onChange={handleMatchChange} placeholder="e.g. MI" />
//               <TextInput label="Score" name="team2Score" value={matchForm.team2Score} onChange={handleMatchChange} placeholder="e.g. 158/4" />
//               <TextInput label="Overs" name="team2Overs" value={matchForm.team2Overs} onChange={handleMatchChange} placeholder="e.g. 20" />
//             </div>
//           </Section>

//           <div className="flex items-center gap-3">
//             <input
//               type="checkbox"
//               id="matchIsLive"
//               name="isLive"
//               checked={matchForm.isLive}
//               onChange={handleMatchChange}
//               className="w-4 h-4 accent-blue-600"
//             />
//             <label htmlFor="matchIsLive" className="text-sm text-gray-300">
//               This match is currently LIVE
//             </label>
//           </div>

//           {/* Existing matches list */}
//           {matchOptions.length > 0 && (
//             <div>
//               <p className="text-xs text-gray-500 mb-2">Existing matches</p>
//               <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
//                 {matchOptions.map((m) => (
//                   <div
//                     key={m.id}
//                     className="flex items-center justify-between bg-[#0d1117] border border-[#2a2a2a] rounded px-3 py-2 text-xs text-gray-300"
//                   >
//                     <span>
//                       Match {m.matchNo} · <span className="text-blue-400">{m.team1.name}</span> vs{" "}
//                       <span className="text-blue-400">{m.team2.name}</span> · {m.tournament}
//                     </span>
//                     <div className="flex gap-2">
//                       {m.isLive && (
//                         <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">LIVE</span>
//                       )}
//                       <button
//                         onClick={() => handleEditMatch(m)}
//                         className="text-blue-400 hover:text-blue-300 text-[10px]"
//                       >
//                         Edit
//                       </button>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}

//           <div className="flex gap-3">
//             <button
//               onClick={handleMatchSubmit}
//               disabled={matchLoading}
//               className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-3 rounded font-semibold text-white transition-all"
//             >
//               {matchLoading ? "Saving..." : editingMatchId ? "Update Match" : "Create Match"}
//             </button>
//             <button
//               onClick={() => {
//                 setMatchForm({
//                   matchNo: "", tournament: "", stadium: "",
//                   team1Name: "", team1Score: "", team1Overs: "",
//                   team2Name: "", team2Score: "", team2Overs: "",
//                   isLive: false,
//                 });
//                 setEditingMatchId(null);
//               }}
//               className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white transition-all"
//             >
//               Clear
//             </button>
//           </div>
//         </div>
//       )}

//       {/* ══════════ CHAT PANEL ══════════ */}
//       {activeTab === "chat" && (
//         selectedMatchId ? (
//           <ChatAdminPanel matchId={selectedMatchId} />
//         ) : (
//           <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
//             <p className="text-gray-400">Please select a match first to manage chat.</p>
//             <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
//           </div>
//         )
//       )}

//       {/* ══════════ PREDICTIONS PANEL ══════════ */}
//       {activeTab === "predictions" && (
//         selectedMatchId ? (
//           <PredictionsAdminPanel matchId={selectedMatchId} />
//         ) : (
//           <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
//             <p className="text-gray-400">Please select a match first to manage predictions.</p>
//             <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
//           </div>
//         )
//       )}

//       {/* ══════════ QUIZ PANEL ══════════ */}
//       {activeTab === "quiz" && (
//         selectedMatchId ? (
//           <QuizAdminPanel matchId={selectedMatchId} />
//         ) : (
//           <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
//             <p className="text-gray-400">Please select a match first to manage quiz.</p>
//             <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
//           </div>
//         )
//       )}

//       {/* ══════════ EMOJI STORM PANEL ══════════ */}
//       {activeTab === "emoji" && (
//         selectedMatchId ? (
//           <EmojiStormAdminPanel matchId={selectedMatchId} />
//         ) : (
//           <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
//             <p className="text-gray-400">Please select a match first to manage emoji storm.</p>
//             <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
//           </div>
//         )
//       )}
//     </div>
//   );
// }

// /* ─── Reusable sub-components ─── */

// function Section({ title, children }: { title: string; children: React.ReactNode }) {
//   return (
//     <div>
//       <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-[#21262d] pb-2">
//         {title}
//       </h2>
//       {children}
//     </div>
//   );
// }

// type TextInputProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

// function TextInput({ label, ...props }: TextInputProps) {
//   return (
//     <div>
//       <label className="text-xs text-gray-400">{label}</label>
//       <input
//         {...props}
//         className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 focus:outline-none focus:border-blue-500 transition-colors"
//       />
//     </div>
//   );
// }










// app/admin/watchalong-management/add-watchalong/page.tsx
"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useState, useEffect, ChangeEvent, InputHTMLAttributes } from "react";
import ChatAdminPanel from "./Chat";
import PredictionsAdminPanel from "./Predictions";
import QuizAdminPanel from "./Quiz";
import EmojiStormAdminPanel from "./Emojistorm";

/* ─── Types ─── */

interface MatchOption {
  id: string;
  matchNo: number;
  tournament: string;
  team1: { name: string; score: string; overs: string };
  team2: { name: string; score: string; overs: string };
  stadium: string;
  isLive: boolean;
  videoUrl?: string;
  videoType?: string;
}

interface RoomForm {
  name: string;
  role: string;
  badge: string;
  badgeColor: string;
  borderColor: string;
  watching: string;
  engagement: string;
  active: string;
  isLive: boolean;
  liveMatchId: string;
  hostUserId?: string;
  coHostUserId?: string;
  sport?: string;
}

interface MatchForm {
  matchNo: string;
  tournament: string;
  stadium: string;
  team1Name: string;
  team1Score: string;
  team1Overs: string;
  team2Name: string;
  team2Score: string;
  team2Overs: string;
  isLive: boolean;
  videoUrl: string;
  videoType: string;
}

interface BadgeOption {
  label: string;
  badgeColor: string;
  borderColor: string;
}

const BADGE_OPTIONS: BadgeOption[] = [
  { label: "Legend", badgeColor: "bg-pink-600", borderColor: "border-pink-500" },
  { label: "Pro Analyst", badgeColor: "bg-orange-500", borderColor: "border-orange-400" },
  { label: "Elite Expert", badgeColor: "bg-purple-600", borderColor: "border-purple-500" },
  { label: "Custom", badgeColor: "bg-gray-600", borderColor: "border-gray-500" },
];

type AdminTab = "room" | "match" | "chat" | "predictions" | "quiz" | "emoji";

interface TabItem {
  id: AdminTab;
  label: string;
  icon: string;
}

const TABS: TabItem[] = [
  { id: "room", label: "Expert Room", icon: "" },
  { id: "match", label: "Live Match", icon: "" },
  { id: "chat", label: "Chat", icon: "" },
  { id: "predictions", label: "Predictions", icon: "" },
  { id: "quiz", label: "Quiz", icon: "" },
  { id: "emoji", label: "Emoji Storm", icon: "" },
];

/* ─────────────────────────────────────────────
   MAIN COMPONENT
   ───────────────────────────────────────────── */
export default function CreateWatchAlong({
  roomIdToEdit,
  matchIdToEdit,
}: {
  roomIdToEdit?: string;
  matchIdToEdit?: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("room");
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");

  /* ── Room state ── */
  const [roomForm, setRoomForm] = useState<RoomForm>({
    name: "",
    role: "",
    badge: "Legend",
    badgeColor: "bg-blue-600",
    borderColor: "border-blue-500",
    watching: "",
    engagement: "",
    active: "",
    isLive: false,
    liveMatchId: "",
    hostUserId: "",
    coHostUserId: "",
    sport: "cricket",
  });
  const [dpFile, setDpFile] = useState<File | null>(null);
  const [existingDp, setExistingDp] = useState<string>("");
  const [roomLoading, setRoomLoading] = useState<boolean>(false);

  /* ── Match state ── */
  const [matchForm, setMatchForm] = useState<MatchForm>({
    matchNo: "",
    tournament: "",
    stadium: "",
    team1Name: "",
    team1Score: "",
    team1Overs: "",
    team2Name: "",
    team2Score: "",
    team2Overs: "",
    isLive: false,
    videoUrl: "",
    videoType: "youtube",
  });
  const [matchLoading, setMatchLoading] = useState<boolean>(false);
  const [matchOptions, setMatchOptions] = useState<MatchOption[]>([]);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  // Automatically set admin auth headers for all API requests originating from the admin console watchalong panel
  useEffect(() => {
    if (!axios.defaults.headers) {
      (axios.defaults as any).headers = {};
    }
    if (!axios.defaults.headers.common) {
      axios.defaults.headers.common = {};
    }
    const prevRole = axios.defaults.headers.common["x-user-role"];
    const prevId = axios.defaults.headers.common["x-user-id"];

    axios.defaults.headers.common["x-user-role"] = "admin";
    axios.defaults.headers.common["x-user-id"] = "admin_user";

    return () => {
      if (axios.defaults.headers?.common) {
        if (prevRole) {
          axios.defaults.headers.common["x-user-role"] = prevRole;
        } else {
          delete axios.defaults.headers.common["x-user-role"];
        }
        if (prevId) {
          axios.defaults.headers.common["x-user-id"] = prevId;
        } else {
          delete axios.defaults.headers.common["x-user-id"];
        }
      }
    };
  }, []);

  /* ── Load match options for dropdown ── */
  useEffect(() => {
    axios
      .get("/api/watch-along/matches")
      .then((res) => {
        if (res.data.success) setMatchOptions(res.data.matches);
      })
      .catch(console.error);
  }, []);

  /* ── Load existing room for editing ── */
  useEffect(() => {
    if (!roomIdToEdit) return;
    axios.get(`/api/watch-along/${roomIdToEdit}`).then((res) => {
      if (!res.data.success) return;
      const r = res.data.room;
      setRoomForm({
        name: r.name || "",
        role: r.role || "",
        badge: r.badge || "Legend",
        badgeColor: r.badgeColor || "bg-blue-600",
        borderColor: r.borderColor || "border-blue-500",
        watching: r.watching || "",
        engagement: r.engagement || "",
        active: r.active || "",
        isLive: r.isLive || false,
        liveMatchId: r.liveMatchId || "",
        hostUserId: r.hostUserId || "",
        coHostUserId: r.coHostUserId || "",
        sport: r.sport || "cricket",
      });
      setExistingDp(r.displayPicture || "");
      if (r.liveMatchId) {
        setSelectedMatchId(r.liveMatchId);
      }
    });
  }, [roomIdToEdit]);

  /* ── Load existing match for editing ── */
  useEffect(() => {
    if (!matchIdToEdit) return;
    axios.get(`/api/watch-along/matches/${matchIdToEdit}`).then((res) => {
      if (!res.data.success) return;
      const m = res.data.match;
      setMatchForm({
        matchNo: m.matchNo?.toString() || "",
        tournament: m.tournament || "",
        stadium: m.stadium || "",
        team1Name: m.team1?.name || "",
        team1Score: m.team1?.score || "",
        team1Overs: m.team1?.overs || "",
        team2Name: m.team2?.name || "",
        team2Score: m.team2?.score || "",
        team2Overs: m.team2?.overs || "",
        isLive: m.isLive || false,
        videoUrl: m.videoUrl || "",
        videoType: m.videoType || "youtube",
      });
      setEditingMatchId(matchIdToEdit);
      setSelectedMatchId(matchIdToEdit);
    });
  }, [matchIdToEdit]);

  /* ─── Room handlers ─── */
  const handleRoomChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setRoomForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleBadgePick = (option: BadgeOption) => {
    setRoomForm((prev) => ({
      ...prev,
      badge: option.label,
      badgeColor: option.badgeColor,
      borderColor: option.borderColor,
    }));
  };

  const handleRoomSubmit = async () => {
    if (!roomForm.name || !roomForm.role || !roomForm.badge) {
      alert("Name, role, and badge are required");
      return;
    }
    setRoomLoading(true);
    try {
      const fd = new FormData();
      Object.entries(roomForm).forEach(([k, v]) => fd.append(k, String(v)));
      if (dpFile) fd.append("displayPicture", dpFile);

      const url = roomIdToEdit
        ? `/api/watch-along/${roomIdToEdit}`
        : "/api/watch-along";
      const method = roomIdToEdit ? axios.put : axios.post;
      const res = await method(url, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.success) {
        alert(roomIdToEdit ? "Room updated!" : "Room created!");
        router.push("/admin/watchalong-management/watchalong-list");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving room");
    } finally {
      setRoomLoading(false);
    }
  };

  /* ─── Match handlers ─── */
  const handleMatchChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setMatchForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleMatchSubmit = async () => {
    if (!matchForm.matchNo || !matchForm.team1Name || !matchForm.team2Name) {
      alert("Match no, team 1 name, and team 2 name are required");
      return;
    }
    setMatchLoading(true);
    try {
      const payload = {
        matchNo: matchForm.matchNo,
        tournament: matchForm.tournament,
        stadium: matchForm.stadium,
        isLive: matchForm.isLive,
        team1: { 
          name: matchForm.team1Name, 
          score: matchForm.team1Score, 
          overs: matchForm.team1Overs 
        },
        team2: { 
          name: matchForm.team2Name, 
          score: matchForm.team2Score, 
          overs: matchForm.team2Overs 
        },
        videoUrl: matchForm.videoUrl,
        videoType: matchForm.videoType,
      };

      let res;
      if (editingMatchId) {
        res = await axios.put(`/api/watch-along/matches/${editingMatchId}`, payload);
      } else {
        res = await axios.post("/api/watch-along/matches", payload);
      }

      if (res.data.success) {
        alert(editingMatchId ? "Match updated!" : "Match created!");
        setMatchOptions((prev) => {
          if (editingMatchId) {
            return prev.map((m) => m.id === editingMatchId ? res.data.match : m);
          }
          return [res.data.match, ...prev];
        });
        setMatchForm({
          matchNo: "", tournament: "", stadium: "",
          team1Name: "", team1Score: "", team1Overs: "",
          team2Name: "", team2Score: "", team2Overs: "",
          isLive: false,
          videoUrl: "",
          videoType: "youtube",
        });
        setEditingMatchId(null);
        if (res.data.match?.id) {
          setSelectedMatchId(res.data.match.id);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Error saving match");
    } finally {
      setMatchLoading(false);
    }
  };

  const handleEditMatch = (match: MatchOption) => {
    setMatchForm({
      matchNo: match.matchNo.toString(),
      tournament: match.tournament || "",
      stadium: match.stadium || "",
      team1Name: match.team1?.name || "",
      team1Score: match.team1?.score || "",
      team1Overs: match.team1?.overs || "",
      team2Name: match.team2?.name || "",
      team2Score: match.team2?.score || "",
      team2Overs: match.team2?.overs || "",
      isLive: match.isLive,
      videoUrl: match.videoUrl || "",
      videoType: match.videoType || "youtube",
    });
    setEditingMatchId(match.id);
    setActiveTab("match");
  };

  const handleSelectMatchForFeatures = (matchId: string) => {
    setSelectedMatchId(matchId);
    const match = matchOptions.find(m => m.id === matchId);
    if (match) {
      alert(`Selected: Match ${match.matchNo} - ${match.team1?.name || "TBA"} vs ${match.team2?.name || "TBA"}`);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-white">
          {roomIdToEdit ? "Edit Watch Along Room" : "Create Watch Along"}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          Rooms are expert cards in the lobby. Matches are the live game data linked to a room.
          After creating a match, you can manage Chat, Predictions, Quiz, and Emoji Storm features.
        </p>
      </div>

      {/* Main Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-[#21262d] pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "bg-[#1a1a1a] text-gray-400 hover:text-white border border-[#2a2a2a]"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Match Selector for Feature Tabs */}
      {(activeTab === "chat" || activeTab === "predictions" || activeTab === "quiz" || activeTab === "emoji") && (
        <div className="mb-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Select Match</label>
              <select
                value={selectedMatchId}
                onChange={(e) => handleSelectMatchForFeatures(e.target.value)}
                className="bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white min-w-[250px]"
              >
                <option value="">— Select a match —</option>
                {matchOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    Match {m.matchNo}: {m.team1?.name || "TBA"} vs {m.team2?.name || "TBA"} {m.isLive ? "🔴 LIVE" : ""}
                  </option>
                ))}
              </select>
            </div>
            {selectedMatchId && (
              <div className="text-xs text-green-400">
                ✓ Editing features for Match ID: {selectedMatchId}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════ ROOM FORM ══════════ */}
      {activeTab === "room" && (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
          <Section title="Expert Info">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInput label="Expert Name *" name="name" value={roomForm.name} onChange={handleRoomChange} placeholder="e.g. Harsha Bhogle" />
              <TextInput label="Role / Subtitle *" name="role" value={roomForm.role} onChange={handleRoomChange} placeholder="e.g. Cricket Commentary Legend" />
            </div>
            <div className="mt-4">
              <TextInput label="Host User ID / Email" name="hostUserId" value={roomForm.hostUserId || ""} onChange={handleRoomChange} placeholder="e.g. user_123 or user@gmail.com" />
              <TextInput label="Co-Host User ID / Email" name="coHostUserId" value={roomForm.coHostUserId || ""} onChange={handleRoomChange} placeholder="e.g. cohost@gmail.com (gets host controls)" />
            </div>
            
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-400 uppercase mb-2">Sport</label>
              <select
                name="sport"
                value={roomForm.sport || "cricket"}
                onChange={handleRoomChange}
                className="w-full bg-[#0d1117] border border-[#2a2a2a] text-white text-sm rounded px-3 py-2 outline-none focus:border-blue-500 transition-colors"
              >
                <option value="cricket">Cricket</option>
                <option value="football">Football</option>
              </select>
            </div>
          </Section>

          <Section title="Display Picture">
            <div className="flex items-start gap-4">
              <div>
                <label className="text-xs text-gray-400">Upload Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setDpFile(e.target.files?.[0] ?? null)}
                  className="block w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 cursor-pointer"
                />
              </div>
              {(dpFile || existingDp) && (
                <img
                  src={dpFile ? URL.createObjectURL(dpFile) : existingDp}
                  alt="preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-blue-500 mt-5"
                />
              )}
            </div>
          </Section>

          <Section title="Badge">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {BADGE_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handleBadgePick(opt)}
                  className={`py-2 px-3 rounded text-xs font-semibold border transition-all ${
                    roomForm.badge === opt.label
                      ? "border-white text-white " + opt.badgeColor
                      : "border-[#333] text-gray-400 bg-[#0d1117] hover:border-gray-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {roomForm.badge !== "Legend" &&
              roomForm.badge !== "Pro Analyst" &&
              roomForm.badge !== "Elite Expert" && (
                <TextInput label="Custom Badge Label" name="badge" value={roomForm.badge} onChange={handleRoomChange} placeholder="e.g. Specialist" />
              )}
          </Section>

          <Section title="Stats (display only)">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextInput label="Watching" name="watching" value={roomForm.watching} onChange={handleRoomChange} placeholder="e.g. 24,892" />
              <TextInput label="Engagement" name="engagement" value={roomForm.engagement} onChange={handleRoomChange} placeholder="e.g. 94%" />
              <TextInput label="Active" name="active" value={roomForm.active} onChange={handleRoomChange} placeholder="e.g. 2.8k" />
            </div>
          </Section>

          <Section title="Live Match">
            <div className="flex items-center gap-3 mb-4">
              <input
                type="checkbox"
                id="isLive"
                name="isLive"
                checked={roomForm.isLive}
                onChange={handleRoomChange}
                className="w-4 h-4 bg-blue-600"
              />
              <label htmlFor="isLive" className="text-sm text-gray-300">
                Mark this room as LIVE
              </label>
            </div>

            {roomForm.isLive && (
              <div>
                <label className="text-xs text-gray-400">
                  Link to a Match <span className="text-gray-600">(create one in the &quot;Live Match&quot; tab first)</span>
                </label>
                <select
                  name="liveMatchId"
                  value={roomForm.liveMatchId}
                  onChange={handleRoomChange}
                  className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1"
                >
                  <option value="">— No match linked —</option>
                  {matchOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      Match {m.matchNo} · {m.team1?.name || "TBA"} vs {m.team2?.name || "TBA"} · {m.tournament}
                      {m.isLive ? " 🔴 LIVE" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Section>

          <div className="flex gap-3">
            <button
              onClick={handleRoomSubmit}
              disabled={roomLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-3 rounded font-semibold text-white transition-all"
            >
              {roomLoading
                ? roomIdToEdit ? "Updating..." : "Creating..."
                : roomIdToEdit ? "Update Room" : "Create Room"}
            </button>
            <button
              onClick={() => router.back()}
              className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ══════════ MATCH FORM ══════════ */}
      {activeTab === "match" && (
        <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between">
            <Section title={editingMatchId ? "Edit Match" : "Create New Match"}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TextInput label="Match No *" name="matchNo" value={matchForm.matchNo} onChange={handleMatchChange} placeholder="e.g. 23" />
                <TextInput label="Tournament" name="tournament" value={matchForm.tournament} onChange={handleMatchChange} placeholder="e.g. Women's T20 World Cup" />
                <TextInput label="Stadium" name="stadium" value={matchForm.stadium} onChange={handleMatchChange} placeholder="e.g. M. Chinnaswamy Stadium" />
              </div>
            </Section>
            {editingMatchId && (
              <button
                onClick={() => {
                  setEditingMatchId(null);
                  setMatchForm({
                    matchNo: "", tournament: "", stadium: "",
                    team1Name: "", team1Score: "", team1Overs: "",
                    team2Name: "", team2Score: "", team2Overs: "",
                    isLive: false,
                    videoUrl: "",
                    videoType: "youtube",
                  });
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <Section title="Team 1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextInput label="Team Name *" name="team1Name" value={matchForm.team1Name} onChange={handleMatchChange} placeholder="e.g. RCB" />
              <TextInput label="Score" name="team1Score" value={matchForm.team1Score} onChange={handleMatchChange} placeholder="e.g. 156/3" />
              <TextInput label="Overs" name="team1Overs" value={matchForm.team1Overs} onChange={handleMatchChange} placeholder="e.g. 15.2" />
            </div>
          </Section>

          <Section title="Team 2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextInput label="Team Name *" name="team2Name" value={matchForm.team2Name} onChange={handleMatchChange} placeholder="e.g. MI" />
              <TextInput label="Score" name="team2Score" value={matchForm.team2Score} onChange={handleMatchChange} placeholder="e.g. 158/4" />
              <TextInput label="Overs" name="team2Overs" value={matchForm.team2Overs} onChange={handleMatchChange} placeholder="e.g. 20" />
            </div>
          </Section>

          {/* Video URL Section */}
          <Section title="Video Stream">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-xs text-gray-400">Video Type</label>
                <select
                  name="videoType"
                  value={matchForm.videoType}
                  onChange={handleMatchChange}
                  className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1"
                >
                  <option value="youtube">YouTube</option>
                  <option value="googledrive">Google Drive</option>
                  <option value="mp4">Direct MP4 URL</option>
                  <option value="hls">HLS (.m3u8)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">Video URL</label>
                <input
                  type="text"
                  name="videoUrl"
                  value={matchForm.videoUrl}
                  onChange={handleMatchChange}
                  placeholder={
                    matchForm.videoType === "youtube" 
                      ? "https://www.youtube.com/watch?v=..." 
                      : matchForm.videoType === "googledrive"
                      ? "https://drive.google.com/file/d/.../view"
                      : "https://example.com/video.mp4"
                  }
                  className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  {matchForm.videoType === "youtube" && "YouTube video will be embedded automatically"}
                  {matchForm.videoType === "googledrive" && "Make sure the file is shared publicly (Anyone with link can view)"}
                  {matchForm.videoType === "mp4" && "Direct link to .mp4 file"}
                  {matchForm.videoType === "hls" && "HLS stream URL (.m3u8 file)"}
                </p>
              </div>
            </div>
          </Section>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="matchIsLive"
              name="isLive"
              checked={matchForm.isLive}
              onChange={handleMatchChange}
              className="w-4 h-4 accent-blue-600"
            />
            <label htmlFor="matchIsLive" className="text-sm text-gray-300">
              This match is currently LIVE
            </label>
          </div>

          {/* Existing matches list */}
          {matchOptions.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Existing matches</p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {matchOptions.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-[#0d1117] border border-[#2a2a2a] rounded px-3 py-2 text-xs text-gray-300"
                  >
                    <span>
                      Match {m.matchNo} · <span className="text-blue-400">{m.team1?.name || "TBA"}</span> vs{" "}
                      <span className="text-blue-400">{m.team2?.name || "TBA"}</span> · {m.tournament}
                    </span>
                    <div className="flex gap-2">
                      {m.isLive && (
                        <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">LIVE</span>
                      )}
                      <button
                        onClick={() => handleEditMatch(m)}
                        className="text-blue-400 hover:text-blue-300 text-[10px]"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleMatchSubmit}
              disabled={matchLoading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 py-3 rounded font-semibold text-white transition-all"
            >
              {matchLoading ? "Saving..." : editingMatchId ? "Update Match" : "Create Match"}
            </button>
            <button
              onClick={() => {
                setMatchForm({
                  matchNo: "", tournament: "", stadium: "",
                  team1Name: "", team1Score: "", team1Overs: "",
                  team2Name: "", team2Score: "", team2Overs: "",
                  isLive: false,
                  videoUrl: "",
                  videoType: "youtube",
                });
                setEditingMatchId(null);
              }}
              className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded font-semibold text-white transition-all"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ══════════ CHAT PANEL ══════════ */}
      {activeTab === "chat" && (
        selectedMatchId ? (
          <ChatAdminPanel matchId={selectedMatchId} />
        ) : (
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
            <p className="text-gray-400">Please select a match first to manage chat.</p>
            <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
          </div>
        )
      )}

      {/* ══════════ PREDICTIONS PANEL ══════════ */}
      {activeTab === "predictions" && (
        selectedMatchId ? (
          <PredictionsAdminPanel matchId={selectedMatchId} />
        ) : (
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
            <p className="text-gray-400">Please select a match first to manage predictions.</p>
            <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
          </div>
        )
      )}

      {/* ══════════ QUIZ PANEL ══════════ */}
      {activeTab === "quiz" && (
        selectedMatchId ? (
          <QuizAdminPanel matchId={selectedMatchId} />
        ) : (
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
            <p className="text-gray-400">Please select a match first to manage quiz.</p>
            <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
          </div>
        )
      )}

      {/* ══════════ EMOJI STORM PANEL ══════════ */}
      {activeTab === "emoji" && (
        selectedMatchId ? (
          <EmojiStormAdminPanel matchId={selectedMatchId} />
        ) : (
          <div className="bg-[#161b22] border border-[#21262d] rounded-lg p-12 text-center">
            <p className="text-gray-400">Please select a match first to manage emoji storm.</p>
            <p className="text-xs text-gray-600 mt-2">Create a match in the &apos;Live Match&apos; tab first.</p>
          </div>
        )
      )}
    </div>
  );
}

/* ─── Reusable sub-components ─── */

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-[#21262d] pb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

function TextInput({ label, ...props }: TextInputProps) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <input
        {...props}
        className="w-full bg-[#0d1117] border border-gray-700 px-3 py-2 rounded text-sm text-white mt-1 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}