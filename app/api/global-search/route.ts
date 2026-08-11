// app/api/global-search/route.ts — Migrated with DynamoDB & Firestore fallback
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface PlayerHomeData {
    playerName: string;
    playerNameLower?: string;
    playerNameTokens?: string[];
    playerProfilesId?: string;
    title?: string;
    image?: string;
    logo?: string;
}

interface SearchResult {
    type: "player" | "team" | "user";
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

const TEAM_ALIASES: Record<string, string> = {
    csk: "chennai super kings",
    rcb: "royal challengers bengaluru",
    mi: "mumbai indians",
    kkr: "kolkata knight riders",
    srh: "sunrisers hyderabad",
    dc: "delhi capitals",
    pbks: "punjab kings",
    rr: "rajasthan royals",
    gt: "gujarat titans",
    lsg: "lucknow super giants",
};

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const query = searchParams.get("q")?.toLowerCase().trim();

        if (!query) {
            return NextResponse.json({ results: [] });
        }

        const isJerseyNumber = !isNaN(parseInt(query));
        const resolvedTeamQuery = TEAM_ALIASES[query] || query;

        const playersMap = new Map<string, SearchResult>();
        const teamsMap = new Map<string, SearchResult>();
        const usersMap = new Map<string, SearchResult>();

        // 1. Search DynamoDB
        try {
            // Scan SportsData for players
            const sportsRes = await docClient.send(
                new ScanCommand({
                    TableName: "SportsData",
                    FilterExpression: "begins_with(entityId, :pfx)",
                    ExpressionAttributeValues: { ":pfx": "PLAYER_HOME#" },
                    Limit: 100,
                })
            );

            if (sportsRes.Items) {
                for (const item of sportsRes.Items) {
                    const name = (item.playerName || item.name || "").toLowerCase();
                    const jersey = item.jerseyNumber ? String(item.jerseyNumber) : "";
                    if (name.includes(query) || (isJerseyNumber && jersey === query)) {
                        const id = item.playerProfilesId || item.id || item.entityId;
                        playersMap.set(id, {
                            type: "player",
                            id,
                            playerProfilesId: item.playerProfilesId || id,
                            name: item.playerName || item.name,
                            image: item.image || item.avatar || null,
                            jerseyNumber: item.jerseyNumber || null,
                            team: item.team || null,
                            category: item.category || [],
                        });
                    }
                }
            }

            // Scan SocialAndContent for teams
            const teamRes = await docClient.send(
                new ScanCommand({
                    TableName: "SocialAndContent",
                    FilterExpression: "begins_with(contentId, :tPfx)",
                    ExpressionAttributeValues: { ":tPfx": "TEAM_POST#" },
                    Limit: 50,
                })
            );

            if (teamRes.Items) {
                for (const item of teamRes.Items) {
                    const tName = (item.teamName || item.name || "").toLowerCase();
                    if (tName.includes(query) || tName.includes(resolvedTeamQuery)) {
                        const id = item.id || (item.contentId as string).replace(/^TEAM_POST#/, "");
                        teamsMap.set(id, {
                            type: "team",
                            id,
                            name: item.teamName || item.name,
                            logo: item.logo || null,
                            category: item.category || [],
                        });
                    }
                }
            }

            // Scan UserData for users
            const userRes = await docClient.send(
                new ScanCommand({
                    TableName: "UserData",
                    FilterExpression: "sk = :pSk",
                    ExpressionAttributeValues: { ":pSk": "PROFILE#META" },
                    Limit: 50,
                })
            );

            if (userRes.Items) {
                for (const item of userRes.Items) {
                    const uName = (item.name || item.displayName || item.username || item.fullName || "").toLowerCase();
                    if (uName.includes(query)) {
                        const id = item.id || (item.userId as string).replace(/^USER#/, "").replace(/^ADMIN_USER#/, "");
                        usersMap.set(id, {
                            type: "user",
                            id,
                            name: item.name || item.displayName || item.username || item.fullName,
                            image: item.image || item.photoURL || item.avatar || null,
                        });
                    }
                }
            }
        } catch (e) {
            console.warn("[global-search DynamoDB scan]:", e);
        }

        // 2. Fallback to Firestore if results are low
        if (playersMap.size === 0 && db) {
            try {
                const pSnap = await db.collection("playershome").limit(30).get();
                for (const doc of pSnap.docs) {
                    const data = doc.data() as PlayerHomeData;
                    const name = (data.playerName || "").toLowerCase();
                    if (name.includes(query)) {
                        const id = data.playerProfilesId || doc.id;
                        playersMap.set(id, {
                            type: "player",
                            id,
                            playerProfilesId: id,
                            name: data.playerName,
                            image: data.image || null,
                            logo: data.logo || null,
                        });
                    }
                }
            } catch {}
        }

        if (teamsMap.size === 0 && db) {
            try {
                const tSnap = await db.collection("team360Posts").limit(30).get();
                for (const doc of tSnap.docs) {
                    const data = doc.data();
                    const name = (data.teamName || "").toLowerCase();
                    if (name.includes(query) || name.includes(resolvedTeamQuery)) {
                        teamsMap.set(doc.id, {
                            type: "team",
                            id: doc.id,
                            name: data.teamName,
                            logo: data.logo || null,
                            category: data.category || [],
                        });
                    }
                }
            } catch {}
        }

        if (usersMap.size === 0 && db) {
            try {
                const uSnap = await db.collection("users").limit(30).get();
                for (const doc of uSnap.docs) {
                    const data = doc.data();
                    const uName = (data.name || data.displayName || data.username || data.fullName || "").toLowerCase();
                    if (uName.includes(query)) {
                        usersMap.set(doc.id, {
                            type: "user",
                            id: doc.id,
                            name: data.name || data.displayName || data.username || data.fullName,
                            image: data.image || data.photoURL || data.avatar || null,
                        });
                    }
                }
            } catch {}
        }

        const players = Array.from(playersMap.values());
        const teams = Array.from(teamsMap.values());
        const users = Array.from(usersMap.values());

        const results = [
            ...players.slice(0, 10),
            ...users.slice(0, 10),
            ...teams.slice(0, 10),
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
