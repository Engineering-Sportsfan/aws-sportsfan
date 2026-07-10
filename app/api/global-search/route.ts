// {/*
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";

// // Define proper interfaces for the data structures
// interface PlayerHomeData {
//     playerName: string;
//     playerNameLower?: string;
//     playerNameTokens?: string[];
//     playerProfilesId?: string;
//     title?: string;
//     image?: string;
//     logo?: string;
// }

// interface PlayerSeasonData {
//     playerProfilesId: string;
//     season: {
//         jerseyNo?: string;
//         year?: string;
//     };
// }

// interface PlayerProfileData {
//     name: string;
//     team?: string;
//     avatar?: string;
//     stats?: {
//         runs?: string;
//         sr?: string;
//         avg?: string;
//     };
// }

// interface TeamData {
//     teamName: string;
//     teamNameLower?: string;
//     logo?: string;
//     category?: string[];
// }

// interface SearchResult {
//     type: 'player' | 'team';
//     id: string;
//     playerProfilesId?: string;
//     name: string;
//     image?: string | null;
//     logo?: string | null;
//     jerseyNumber?: string | null;
//     team?: string | null;
//     category?: string[];
//     stats?: {
//         runs?: string;
//         sr?: string;
//         avg?: string;
//     };
// }

// export async function GET(req: NextRequest) {
//     try {
//         const searchParams = req.nextUrl.searchParams;
//         const query = searchParams.get("q")?.toLowerCase().trim();

//         if (!query) {
//             return NextResponse.json({ results: [] });
//         }

//         // Check if query is a number (for jersey number search)
//         const isJerseyNumber = !isNaN(parseInt(query));

//         const playersMap = new Map<string, SearchResult>(); // Use Map to avoid duplicates
//         const teams: SearchResult[] = [];

//         // 1️ SEARCH PLAYERS BY NAME from playershome collection
//         try {
//             // Primary: prefix match on full name ("rohit sharma" → works for "rohit")
//             const playersByNameSnapshot = await db.collection("playershome")
//                 .where("playerNameLower", ">=", query)
//                 .where("playerNameLower", "<=", query + "\uf8ff")
//                 .limit(15)
//                 .get();

//             // Secondary: token match (works for last names, middle names, any prefix)
//             const playersByTokenSnapshot = await db.collection("playershome")
//                 .where("playerNameTokens", "array-contains", query)
//                 .limit(15)
//                 .get();

//             // Merge both, deduplicate by doc id
//             const seenDocIds = new Set<string>();

//             for (const doc of [...playersByNameSnapshot.docs, ...playersByTokenSnapshot.docs]) {
//                 if (seenDocIds.has(doc.id)) continue;
//                 seenDocIds.add(doc.id);

//                 const data = doc.data() as PlayerHomeData;
//                 const playerProfilesId = data.playerProfilesId || doc.id;

//                 let playerProfile: PlayerProfileData | null = null;
//                 try {
//                     const profileDoc = await db.collection("playerProfiles").doc(playerProfilesId).get();
//                     if (profileDoc.exists) {
//                         playerProfile = profileDoc.data() as PlayerProfileData;
//                     }
//                 } catch (err) {
//                     console.error(`Failed to fetch profile for ${playerProfilesId}:`, err);
//                 }

//                 playersMap.set(playerProfilesId, {
//                     type: 'player',
//                     id: doc.id,
//                     playerProfilesId,
//                     name: data.playerName,
//                     image: data.image || playerProfile?.avatar || null,
//                     jerseyNumber: null,
//                     team: playerProfile?.team || null,
//                     category: [],
//                     stats: playerProfile?.stats || undefined,
//                 });
//             }
//         } catch (error) {
//             console.error("Error searching players by name:", error);
//         }

//         // 2️ SEARCH BY JERSEY NUMBER from playerSeasons collection
//         if (isJerseyNumber) {
//             const jerseyNumber = query;
//             try {
//                 const playersByJerseySnapshot = await db.collection("playerSeasons")
//                     .where("season.jerseyNo", "==", jerseyNumber)
//                     .limit(10)
//                     .get();

//                 for (const doc of playersByJerseySnapshot.docs) {
//                     const data = doc.data() as PlayerSeasonData;
//                     const playerProfilesId = data.playerProfilesId;

//                     if (!playersMap.has(playerProfilesId)) {
//                         // Fetch player details from playershome
//                         let playerName = "";
//                         let playerImage = null;
//                         let playerTeam = null;

//                         try {
//                             const playerHomeQuery = await db.collection("playershome")
//                                 .where("playerProfilesId", "==", playerProfilesId)
//                                 .limit(1)
//                                 .get();

//                             if (!playerHomeQuery.empty) {
//                                 const playerData = playerHomeQuery.docs[0].data() as PlayerHomeData;
//                                 playerName = playerData.playerName;
//                                 playerImage = playerData.image || null;
//                             }

//                             // Fetch profile for team info
//                             const profileDoc = await db.collection("playerProfiles").doc(playerProfilesId).get();
//                             if (profileDoc.exists) {
//                                 const profileData = profileDoc.data() as PlayerProfileData;
//                                 playerTeam = profileData.team || null;
//                                 if (!playerImage) playerImage = profileData.avatar || null;
//                             }
//                         } catch (err) {
//                             console.error(`Failed to fetch player details for ${playerProfilesId}:`, err);
//                         }

//                         if (playerName) {
//                             playersMap.set(playerProfilesId, {
//                                 type: 'player',
//                                 id: doc.id,
//                                 playerProfilesId: playerProfilesId,
//                                 name: playerName,
//                                 image: playerImage,
//                                 jerseyNumber: jerseyNumber,
//                                 team: playerTeam,
//                                 category: [],
//                             });
//                         }
//                     } else {
//                         // Update existing entry with jersey number
//                         const existing = playersMap.get(playerProfilesId);
//                         if (existing) {
//                             existing.jerseyNumber = jerseyNumber;
//                             playersMap.set(playerProfilesId, existing);
//                         }
//                     }
//                 }
//             } catch (error) {
//                 console.error("Error searching by jersey number:", error);
//             }
//         }

//         // Also search by jersey number in playerSeasons for different field structure
//         if (isJerseyNumber) {
//             try {
//                 const playersByJerseyAltSnapshot = await db.collection("playerSeasons")
//                     .where("jerseyNumber", "==", parseInt(query))
//                     .limit(5)
//                     .get();

//                 for (const doc of playersByJerseyAltSnapshot.docs) {
//                     const data = doc.data() as PlayerSeasonData & { jerseyNumber?: number };
//                     const playerProfilesId = data.playerProfilesId;

//                     if (!playersMap.has(playerProfilesId)) {
//                         let playerName = "";
//                         let playerImage = null;

//                         try {
//                             const playerHomeQuery = await db.collection("playershome")
//                                 .where("playerProfilesId", "==", playerProfilesId)
//                                 .limit(1)
//                                 .get();

//                             if (!playerHomeQuery.empty) {
//                                 const playerData = playerHomeQuery.docs[0].data() as PlayerHomeData;
//                                 playerName = playerData.playerName;
//                                 playerImage = playerData.image || null;
//                             }
//                         } catch (err) {
//                             console.error(err);
//                         }

//                         if (playerName) {
//                             playersMap.set(playerProfilesId, {
//                                 type: 'player',
//                                 id: doc.id,
//                                 playerProfilesId: playerProfilesId,
//                                 name: playerName,
//                                 image: playerImage,
//                                 jerseyNumber: query,
//                                 team: null,
//                                 category: [],
//                             });
//                         }
//                     }
//                 }
//             } catch (error) {
//                 console.error("Error searching by jersey number (alt):", error);
//             }
//         }

//         // 3️⃣ SEARCH TEAMS BY NAME from team360Posts
//         try {
//             const teamsSnapshot = await db.collection("team360Posts")
//                 .where("teamNameLower", ">=", query)
//                 .where("teamNameLower", "<=", query + "\uf8ff")
//                 .limit(10)
//                 .get();

//             for (const doc of teamsSnapshot.docs) {
//                 const data = doc.data() as TeamData;
//                 teams.push({
//                     type: 'team',
//                     id: doc.id,
//                     name: data.teamName,
//                     logo: data.logo || null,
//                     category: data.category || [],
//                 });
//             }
//         } catch (error) {
//             console.error("Error searching teams:", error);
//         }

//         // Also search teams in a simpler way if the above fails
//         if (teams.length === 0) {
//             try {
//                 const allTeamsSnapshot = await db.collection("team360Posts").limit(20).get();
//                 for (const doc of allTeamsSnapshot.docs) {
//                     const data = doc.data() as TeamData;
//                     const teamName = data.teamName?.toLowerCase() || "";
//                     if (teamName.includes(query)) {
//                         teams.push({
//                             type: 'team',
//                             id: doc.id,
//                             name: data.teamName,
//                             logo: data.logo || null,
//                             category: data.category || [],
//                         });
//                     }
//                 }
//             } catch (error) {
//                 console.error("Error in fallback team search:", error);
//             }
//         }

//         // Convert Map to array for players
//         const players = Array.from(playersMap.values());

//         // Combine results (players first, then teams)
//         const results = [...players.slice(0, 10), ...teams.slice(0, 10)];

//         return NextResponse.json({
//             success: true,
//             results,
//             totalCount: results.length,
//             searchInfo: {
//                 query,
//                 isJerseyNumber,
//                 playersFound: players.length,
//                 teamsFound: teams.length
//             }
//         });

//     } catch (error) {
//         console.error("Global search error:", error);
//         return NextResponse.json(
//             { success: false, error: "Search failed", results: [] },
//             { status: 500 }
//         );
//     }
// }






import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// ── Abbreviation map ─────────────────────────────────────────────────────────
const TEAM_ALIASES: Record<string, string> = {
    "mi": "mumbai indians",
    "csk": "chennai super kings",
    "rcb": "royal challengers bengaluru",
    "srh": "sunrisers hyderabad",
    "kkr": "kolkata knight riders",
    "dc": "delhi capitals",
    "rr": "rajasthan royals",
    "pbks": "punjab kings",
    "lsg": "lucknow super giants",
    "gt": "gujarat titans",
};

const PLAYER_ALIASES: Record<string, string[]> = {
    "sachin": ["sachin tendulkar"],
    "dhoni": ["ms dhoni", "mahendra singh dhoni"],
    "msd": ["ms dhoni", "mahendra singh dhoni"],
    "virat": ["virat kohli"],
    "rohit": ["rohit sharma"],
    "hitman": ["rohit sharma"],
    "sky": ["suryakumar yadav"],
};

interface PlayerHomeData {
    playerName: string;
    playerNameLower?: string;
    playerNameTokens?: string[];
    playerProfilesId?: string;
    title?: string;
    image?: string;
    logo?: string;
}

interface PlayerSeasonData {
    playerProfilesId: string;
    season: {
        jerseyNo?: string;
        year?: string;
    };
}

interface PlayerProfileData {
    name: string;
    team?: string;
    avatar?: string;
    stats?: {
        runs?: string;
        sr?: string;
        avg?: string;
    };
}

interface TeamData {
    teamName: string;
    teamNameLower?: string;
    logo?: string;
    category?: string[];
}

interface SearchResult {
    type: 'player' | 'team' | 'user'; // <-- Added 'user'
    id: string;
    playerProfilesId?: string;
    name: string;
    image?: string | null;
    logo?: string | null;
    jerseyNumber?: string | null;
    team?: string | null;
    category?: string[];
    stats?: {
        runs?: string;
        sr?: string;
        avg?: string;
    };
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const rawQuery = searchParams.get("q")?.trim() || "";
        const query = rawQuery.toLowerCase();

        if (!query) {
            return NextResponse.json({ results: [] });
        }

        // ── Resolve aliases ──────────────────────────────────────────────────
        const resolvedTeamQuery = TEAM_ALIASES[query] || query;
        const resolvedPlayerQueries: string[] = [query];
        if (PLAYER_ALIASES[query]) {
            resolvedPlayerQueries.push(...PLAYER_ALIASES[query]);
        }

        const isJerseyNumber = !isNaN(parseInt(query)) && query.length <= 3;
        const playersMap = new Map<string, SearchResult>();
        const teamsMap = new Map<string, SearchResult>();
        const usersMap = new Map<string, SearchResult>(); // <-- Added users map

        // ── 1. Search players ────────────────────────────────────────────────
        for (const pQuery of resolvedPlayerQueries) {
            try {
                const [byName, byToken] = await Promise.all([
                    db.collection("playershome")
                        .where("playerNameLower", ">=", pQuery)
                        .where("playerNameLower", "<=", pQuery + "\uf8ff")
                        .limit(15)
                        .get(),
                    db.collection("playershome")
                        .where("playerNameTokens", "array-contains", pQuery)
                        .limit(15)
                        .get(),
                ]);

                const seenDocIds = new Set<string>();
                for (const doc of [...byName.docs, ...byToken.docs]) {
                    if (seenDocIds.has(doc.id)) continue;
                    seenDocIds.add(doc.id);

                    const data = doc.data() as PlayerHomeData;
                    const playerProfilesId = data.playerProfilesId || doc.id;

                    if (playersMap.has(playerProfilesId)) continue;

                    let playerProfile: PlayerProfileData | null = null;
                    try {
                        const profileDoc = await db.collection("playerProfiles").doc(playerProfilesId).get();
                        if (profileDoc.exists) {
                            playerProfile = profileDoc.data() as PlayerProfileData;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch profile for ${playerProfilesId}:`, err);
                    }

                    playersMap.set(playerProfilesId, {
                        type: "player",
                        id: doc.id,
                        playerProfilesId,
                        name: data.playerName,
                        image: data.image || playerProfile?.avatar || null,
                        jerseyNumber: null,
                        team: playerProfile?.team || null,
                        category: [],
                        stats: playerProfile?.stats || undefined,
                    });
                }
            } catch (error) {
                console.error("Error searching players:", error);
            }
        }

        // ── 2. Jersey number search ──────────────────────────────────────────
        if (isJerseyNumber) {
            try {
                const [byJersey, byJerseyAlt] = await Promise.all([
                    db.collection("playerSeasons")
                        .where("season.jerseyNo", "==", query)
                        .limit(10)
                        .get(),
                    db.collection("playerSeasons")
                        .where("jerseyNumber", "==", parseInt(query))
                        .limit(5)
                        .get(),
                ]);

                for (const doc of [...byJersey.docs, ...byJerseyAlt.docs]) {
                    const data = doc.data() as PlayerSeasonData;
                    const playerProfilesId = data.playerProfilesId;

                    if (!playersMap.has(playerProfilesId)) {
                        let playerName = "";
                        let playerImage = null;
                        let playerTeam = null;

                        try {
                            const [playerHomeQuery, profileDoc] = await Promise.all([
                                db.collection("playershome")
                                    .where("playerProfilesId", "==", playerProfilesId)
                                    .limit(1)
                                    .get(),
                                db.collection("playerProfiles").doc(playerProfilesId).get(),
                            ]);

                            if (!playerHomeQuery.empty) {
                                const pd = playerHomeQuery.docs[0].data() as PlayerHomeData;
                                playerName = pd.playerName;
                                playerImage = pd.image || null;
                            }
                            if (profileDoc.exists) {
                                const pd = profileDoc.data() as PlayerProfileData;
                                playerTeam = pd.team || null;
                                if (!playerImage) playerImage = pd.avatar || null;
                            }
                        } catch (err) {
                            console.error(err);
                        }

                        if (playerName) {
                            playersMap.set(playerProfilesId, {
                                type: "player",
                                id: doc.id,
                                playerProfilesId,
                                name: playerName,
                                image: playerImage,
                                jerseyNumber: query,
                                team: playerTeam,
                                category: [],
                            });
                        }
                    } else {
                        const existing = playersMap.get(playerProfilesId);
                        if (existing) {
                            existing.jerseyNumber = query;
                            playersMap.set(playerProfilesId, existing);
                        }
                    }
                }
            } catch (error) {
                console.error("Error searching by jersey number:", error);
            }
        }

        // ── 3. Search teams ──────────────────────────────────────────────────
        const teamQueriesToTry = [...new Set([query, resolvedTeamQuery])];

        for (const tQuery of teamQueriesToTry) {
            try {
                const teamsSnapshot = await db.collection("team360Posts")
                    .where("teamNameLower", ">=", tQuery)
                    .where("teamNameLower", "<=", tQuery + "\uf8ff")
                    .limit(10)
                    .get();

                for (const doc of teamsSnapshot.docs) {
                    if (teamsMap.has(doc.id)) continue;
                    const data = doc.data() as TeamData;
                    teamsMap.set(doc.id, {
                        type: "team",
                        id: doc.id,
                        name: data.teamName,
                        logo: data.logo || null,
                        category: data.category || [],
                    });
                }
            } catch (error) {
                console.error("Error searching teams:", error);
            }
        }

        // ── 4. Fallback: substring match on all teams ────────────────────────
        if (teamsMap.size === 0) {
            try {
                const allTeams = await db.collection("team360Posts").limit(30).get();
                for (const doc of allTeams.docs) {
                    if (teamsMap.has(doc.id)) continue;
                    const data = doc.data() as TeamData;
                    const name = data.teamName?.toLowerCase() || "";
                    const matchesAlias = Object.entries(TEAM_ALIASES).some(
                        ([abbr, full]) => abbr === query && name.includes(full)
                    );
                    if (name.includes(query) || name.includes(resolvedTeamQuery) || matchesAlias) {
                        teamsMap.set(doc.id, {
                            type: "team",
                            id: doc.id,
                            name: data.teamName,
                            logo: data.logo || null,
                            category: data.category || [],
                        });
                    }
                }
            } catch (error) {
                console.error("Error in fallback team search:", error);
            }
        }

        // ── 5. Search End Users ──────────────────────────────────────────────
        try {
            // ** CHANGE "users" TO YOUR ACTUAL USER COLLECTION NAME IF DIFFERENT **
            const usersSnapshot = await db.collection("users")
                .limit(20) // Limit to avoid massive reads
                .get();

            for (const doc of usersSnapshot.docs) {
                const data = doc.data();
                // Check various common fields for name/image in case your schema differs
                const userName = data.name || data.displayName || data.username || data.fullName || "";
                const userImage = data.image || data.photoURL || data.avatar || null;

                // Perform a simple case-insensitive text match
                if (userName.toLowerCase().includes(query)) {
                    usersMap.set(doc.id, {
                        type: "user",
                        id: doc.id,
                        name: userName,
                        image: userImage,
                    });
                }
            }
        } catch (error) {
            console.error("Error searching end users:", error);
        }

        // ── Combine Results in specified order (Players -> Users -> Teams) ───
        const players = Array.from(playersMap.values());
        const teams = Array.from(teamsMap.values());
        const users = Array.from(usersMap.values());

        // This enforces your layout rule!
        const results = [
            ...players.slice(0, 10), 
            ...users.slice(0, 10), 
            ...teams.slice(0, 10)
        ];

        return NextResponse.json({
            success: true,
            results,
            totalCount: results.length,
            searchInfo: {
                query,
                resolvedTeamQuery,
                isJerseyNumber,
                playersFound: players.length,
                usersFound: users.length,
                teamsFound: teams.length,
            },
        });
    } catch (error) {
        console.error("Global search error:", error);
        return NextResponse.json(
            { success: false, error: "Search failed", results: [] },
            { status: 500 }
        );
    }
}
