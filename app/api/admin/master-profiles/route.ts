// app/api/admin/master-profiles/route.ts
//
// Unified Master Profiles API for Admin Panel:
// Aggregates data from ms_players, ms_teams, and athleteProfile (SportsData + Firestore).
// Provides GET, PUT (update profile), and DELETE (single and bulk delete) with dual-store sync.

import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import {
  ScanCommand,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

import { GET as getMsPlayers } from "@/app/api/ms_players/route";
import { GET as getMsTeams } from "@/app/api/ms_teams/route";
import { GET as getAthleteProfile } from "@/app/api/athleteProfile/route";

export const dynamic = "force-dynamic";

export interface UnifiedProfile {
  id: string;
  originalId: string;
  entityId: string;
  sk?: string;
  type: "athlete" | "player" | "team";
  name: string;
  sport: string;
  country: string;
  team: string;
  image: string;
  about: string;
  stats?: Record<string, any>;
  overview?: Record<string, any>;
  isVerified?: boolean;
  fanImpactScore?: number;
  source: string;
  tableOrCollection: string;
  createdAt?: number | string;
  updatedAt?: number | string;
  isDuplicate?: boolean;
  duplicateGroup?: string;
  duplicateCount?: number;
  raw?: Record<string, any>;
}

// Helper to normalize names for duplicate detection
function normalizeName(name: string): string {
  if (!name) return "";
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// GET: Fetch and aggregate all profiles directly from api/ms_players, api/ms_teams, and api/athleteProfile
export async function GET(req: NextRequest) {
  try {
    const profiles: UnifiedProfile[] = [];

    // 1. Fetch Players directly from api/ms_players route
    try {
      const res = await getMsPlayers(req);
      if (res.ok) {
        const json = await res.json();
        const rawPlayers = json.players || [];
        for (const item of rawPlayers) {
          const rawEntityId = item.entityId || "";
          const isAthleteEntity = rawEntityId.startsWith("ATHLETE#");
          const cleanId =
            item.playerId ||
            item.id ||
            rawEntityId.replace(/^(PLAYER|ATHLETE)#/, "");

          profiles.push({
            id: cleanId,
            originalId: item.playerId || cleanId,
            entityId: rawEntityId || (cleanId ? `PLAYER#${cleanId}` : ""),
            sk: item.sk || "PROFILE#META",
            type: isAthleteEntity ? "athlete" : "player",
            name: item.name || item.fullName || "Unnamed Player",
            sport: item.sportId || item.sport || "Cricket",
            country: item.country || "–",
            team: item.currentClubId || item.team || item.clubName || "–",
            image: item.profileImage || item.image || "",
            about: item.about || item.bio || item.role || "",
            stats: item.stats || {
              role: item.role,
              battingStyle: item.battingStyle,
              bowlingStyle: item.bowlingStyle,
              isCaptain: item.isCaptain,
              format: item.format,
              gender: item.gender,
              testCaps: item.testCaps,
              dateOfBirth: item.dateOfBirth,
              birthPlace: item.birthPlace,
              heightCm: item.heightCm,
            },
            overview: item.overview || {},
            isVerified: Boolean(item.isVerified || item.isCaptain),
            fanImpactScore: item.fanImpactScore || 0,
            source: "api/ms_players",
            tableOrCollection: "MS_Players",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            raw: item,
          });
        }
      }
    } catch (err) {
      console.warn("[MasterProfiles GET] Error calling api/ms_players route:", err);
    }

    // 2. Fetch Teams directly from api/ms_teams route
    try {
      const res = await getMsTeams(req);
      if (res.ok) {
        const json = await res.json();
        const rawTeams = json.teams || [];
        for (const item of rawTeams) {
          const rawEntityId = item.entityId || "";
          const cleanId =
            item.team_id || item.id || rawEntityId.replace(/^CLUB#/, "");

          profiles.push({
            id: cleanId,
            originalId: item.team_id || cleanId,
            entityId: rawEntityId || (cleanId ? `CLUB#${cleanId}` : ""),
            sk: item.sk || "CLUB#META",
            type: "team",
            name:
              item.clubName ||
              item.teamName ||
              item.name ||
              item.shortName ||
              "Unnamed Team",
            sport: item.sportId || item.sport || "Cricket",
            country: item.country || "–",
            team: item.shortName || item.clubType || "–",
            image: item.logoUrl || item.teamPhotoUrl || item.image || "",
            about: item.bio || (item.headCoach ? `Coach: ${item.headCoach}` : "") || "",
            stats: item.stats || {
              clubType: item.clubType,
              captain: item.captain,
              viceCaptain: item.viceCaptain,
              headCoach: item.headCoach,
              homeGround: item.homeGround,
              founded: item.founded,
              shortName: item.shortName,
              levelFormatId: item.levelFormatId,
            },
            overview: item.overview || {},
            isVerified: true,
            fanImpactScore: item.fanImpactScore || 0,
            source: "api/ms_teams",
            tableOrCollection: "MS_Clubs",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            raw: item,
          });
        }
      }
    } catch (err) {
      console.warn("[MasterProfiles GET] Error calling api/ms_teams route:", err);
    }

    // 3. Fetch Athletes directly from api/athleteProfile route
    try {
      const res = await getAthleteProfile();
      if (res.ok) {
        const json = await res.json();
        const rawAthletes = json.athletes || [];
        for (const item of rawAthletes) {
          const rawEntityId = item.entityId || "";
          const cleanId =
            item.athleteId ||
            item.id ||
            rawEntityId.replace(/^ATHLETE#/, "");

          profiles.push({
            id: cleanId,
            originalId: item.athleteId || cleanId,
            entityId: rawEntityId || (cleanId ? `ATHLETE#${cleanId}` : ""),
            sk: item.sk || "PROFILE#META",
            type: "athlete",
            name:
              item.name || item.coreInfo?.name || "Unnamed Athlete",
            sport:
              item.sport ||
              item.sportId ||
              item.coreInfo?.discipline ||
              item.discipline ||
              "Athletics",
            country: item.country || item.coreInfo?.country || "–",
            team: item.team || item.coreInfo?.club || item.club || "–",
            image:
              item.profileImage ||
              item.image ||
              item.coreInfo?.profileImage ||
              "",
            about:
              item.about || item.bio || item.welcomeMessage || "",
            stats:
              item.performance?.stats ||
              item.stats ||
              item.analytics?.stats ||
              {},
            overview: item.coreInfo || item.overview || {},
            isVerified: Boolean(
              item.isVerified || item.coreInfo?.isVerified
            ),
            fanImpactScore: item.fanImpactScore || 0,
            source: "api/athleteProfile",
            tableOrCollection: "SportsData",
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            raw: item,
          });
        }
      }
    } catch (err) {
      console.warn("[MasterProfiles GET] Error calling api/athleteProfile route:", err);
    }

    // 4. Supplementary: Fetch from Firestore athletesProfile if available
    try {
      const existingAthleteIds = new Set(
        profiles.filter((p) => p.type === "athlete").map((p) => p.id)
      );
      const snapshot = await db.collection("athletesProfile").get();
      if (!snapshot.empty) {
        for (const doc of snapshot.docs) {
          if (!existingAthleteIds.has(doc.id)) {
            const data = doc.data();
            profiles.push({
              id: doc.id,
              originalId: doc.id,
              entityId: `ATHLETE#${doc.id}`,
              sk: "PROFILE#META",
              type: "athlete",
              name: data.name || "Unnamed Athlete",
              sport: data.sport || "Athletics",
              country: data.country || "–",
              team: data.team || "–",
              image: data.image || "",
              about: data.about || data.bio || "",
              stats: data.stats || {},
              overview: data,
              isVerified: Boolean(data.isVerified),
              fanImpactScore: data.fanImpactScore || 0,
              source: "api/athleteProfile (Firestore)",
              tableOrCollection: "athletesProfile",
              createdAt: data.createdAt,
              updatedAt: data.updatedAt,
              raw: data,
            });
          }
        }
      }
    } catch (err) {
      console.warn("[MasterProfiles GET] Firestore athletesProfile check passed:", err);
    }

    // 5. Calculate Duplicate Clusters
    const nameGroups: Record<string, UnifiedProfile[]> = {};
    for (const p of profiles) {
      const key = normalizeName(p.name);
      if (key) {
        if (!nameGroups[key]) nameGroups[key] = [];
        nameGroups[key].push(p);
      }
    }

    let duplicateCount = 0;
    let duplicateGroupCount = 0;

    for (const group of Object.values(nameGroups)) {
      if (group.length > 1) {
        duplicateGroupCount++;
        for (const p of group) {
          p.isDuplicate = true;
          p.duplicateGroup = normalizeName(p.name);
          p.duplicateCount = group.length;
          duplicateCount++;
        }
      } else if (group.length === 1) {
        group[0].isDuplicate = false;
        group[0].duplicateCount = 1;
      }
    }

    // Counts summary
    const counts = {
      total: profiles.length,
      athletes: profiles.filter((p) => p.type === "athlete").length,
      players: profiles.filter((p) => p.type === "player").length,
      teams: profiles.filter((p) => p.type === "team").length,
      duplicates: duplicateCount,
      duplicateGroups: duplicateGroupCount,
    };

    return NextResponse.json(
      { success: true, profiles, counts },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("[MasterProfiles GET] Error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

// PUT: Update an existing profile across its respective table/collection
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      entityId,
      sk,
      type,
      name,
      sport,
      country,
      team,
      image,
      about,
      isVerified,
      fanImpactScore,
    } = body;

    if (!id && !entityId) {
      return NextResponse.json(
        { success: false, message: "id or entityId is required for update" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    if (type === "player") {
      const targetEntityId = entityId || `PLAYER#${id}`;
      const targetSk = sk || "PROFILE#META";

      // Fetch existing item to preserve detailed stats
      const existing = await docClient.send(
        new GetCommand({
          TableName: TABLES.MS_Players,
          Key: { entityId: targetEntityId, sk: targetSk },
        })
      );

      const existingItem = existing.Item || {};
      const updatedItem = {
        ...existingItem,
        entityId: targetEntityId,
        sk: targetSk,
        playerId: id,
        name: name ?? existingItem.name,
        sportId: sport ?? existingItem.sportId ?? "cricket",
        country: country ?? existingItem.country,
        currentClubId: team ?? existingItem.currentClubId,
        profileImage: image ?? existingItem.profileImage,
        about: about ?? existingItem.about,
        isVerified: Boolean(isVerified),
        fanImpactScore: fanImpactScore ?? existingItem.fanImpactScore ?? 0,
        updatedAt: now,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLES.MS_Players,
          Item: updatedItem,
        })
      );
    } else if (type === "team") {
      const targetEntityId = entityId || `CLUB#${id}`;
      const targetSk = sk || "CLUB#META";

      const existing = await docClient.send(
        new GetCommand({
          TableName: TABLES.MS_Clubs,
          Key: { entityId: targetEntityId, sk: targetSk },
        })
      );

      const existingItem = existing.Item || {};
      const updatedItem = {
        ...existingItem,
        entityId: targetEntityId,
        sk: targetSk,
        team_id: id,
        clubName: name ?? existingItem.clubName,
        sportId: sport ?? existingItem.sportId ?? "cricket",
        country: country ?? existingItem.country,
        shortName: team ?? existingItem.shortName,
        logoUrl: image ?? existingItem.logoUrl,
        bio: about ?? existingItem.bio,
        fanImpactScore: fanImpactScore ?? existingItem.fanImpactScore ?? 0,
        updatedAt: now,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLES.MS_Clubs,
          Item: updatedItem,
        })
      );
    } else if (type === "athlete") {
      const targetEntityId = entityId || `ATHLETE#${id}`;
      const targetSk = sk || "PROFILE#META";

      // Try updating in SportsData
      try {
        const existing = await docClient.send(
          new GetCommand({
            TableName: TABLES.SportsData,
            Key: { entityId: targetEntityId, sk: targetSk },
          })
        );
        if (existing.Item) {
          const existingItem = existing.Item;
          const updatedItem = {
            ...existingItem,
            name: name ?? existingItem.name,
            sport: sport ?? existingItem.sport,
            country: country ?? existingItem.country,
            team: team ?? existingItem.team,
            profileImage: image ?? existingItem.profileImage,
            about: about ?? existingItem.about,
            isVerified: Boolean(isVerified),
            fanImpactScore: fanImpactScore ?? existingItem.fanImpactScore ?? 0,
            updatedAt: now,
          };
          await docClient.send(
            new PutCommand({
              TableName: TABLES.SportsData,
              Item: updatedItem,
            })
          );
        }
      } catch (dynErr) {
        console.warn("[MasterProfiles PUT] SportsData update fallback:", dynErr);
      }

      // Also try syncing to Firestore athletesProfile
      try {
        const docRef = db.collection("athletesProfile").doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          await docRef.set(
            {
              name,
              sport,
              country,
              image,
              about,
              isVerified: Boolean(isVerified),
              fanImpactScore: Number(fanImpactScore) || 0,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
      } catch (fsErr) {
        console.warn("[MasterProfiles PUT] Firestore update fallback:", fsErr);
      }
    }

    return NextResponse.json({ success: true, message: "Profile updated successfully" });
  } catch (error: any) {
    console.error("[MasterProfiles PUT] Error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to update profile" },
      { status: 500 }
    );
  }
}

// DELETE: Delete single profile or bulk profiles across DynamoDB and Firestore
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryId = searchParams.get("id");
    const queryType = searchParams.get("type");
    const queryEntityId = searchParams.get("entityId");
    const querySk = searchParams.get("sk");
    const queryTable = searchParams.get("source");

    // Check if bulk deletion requested via request body
    let itemsToDelete: any[] = [];
    try {
      const body = await req.json();
      if (body && Array.isArray(body.ids)) {
        itemsToDelete = body.ids;
      }
    } catch {
      // Body may be empty for single query param delete
    }

    if (queryId || queryEntityId) {
      itemsToDelete.push({
        id: queryId,
        entityId: queryEntityId,
        type: queryType,
        sk: querySk,
        source: queryTable,
      });
    }

    if (itemsToDelete.length === 0) {
      return NextResponse.json(
        { success: false, message: "No items specified for deletion" },
        { status: 400 }
      );
    }

    let deletedCount = 0;

    for (const item of itemsToDelete) {
      const id = item.id;
      const type = item.type;
      const entityId = item.entityId || (id ? `${type?.toUpperCase()}#${id}` : "");
      const sk = item.sk || (type === "team" ? "CLUB#META" : "PROFILE#META");

      // 1. If player, delete from MS_Players
      if (type === "player" || entityId.startsWith("PLAYER#")) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.MS_Players,
              Key: { entityId, sk },
            })
          );
          deletedCount++;
        } catch (err) {
          console.warn(`[MasterProfiles DELETE] Failed to delete player ${entityId}:`, err);
        }
      }

      // 2. If team, delete from MS_Clubs
      if (type === "team" || entityId.startsWith("CLUB#")) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.MS_Clubs,
              Key: { entityId, sk: sk || "CLUB#META" },
            })
          );
          deletedCount++;
        } catch (err) {
          console.warn(`[MasterProfiles DELETE] Failed to delete team ${entityId}:`, err);
        }
      }

      // 3. If athlete, delete from SportsData, IdentityAndAccess & Firestore
      if (type === "athlete" || entityId.startsWith("ATHLETE#")) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.SportsData,
              Key: { entityId, sk: sk || "PROFILE#META" },
            })
          );
          deletedCount++;
        } catch (err) {
          console.warn(`[MasterProfiles DELETE] SportsData delete error for ${entityId}:`, err);
        }

        // Also check if in MS_Players
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: TABLES.MS_Players,
              Key: { entityId, sk: "PROFILE#META" },
            })
          );
        } catch {}

        // Also check Firestore
        if (id) {
          try {
            await db.collection("athletesProfile").doc(id).delete();
          } catch {}
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${deletedCount} profile(s)`,
      deletedCount,
    });
  } catch (error: any) {
    console.error("[MasterProfiles DELETE] Error:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Failed to delete profile(s)" },
      { status: 500 }
    );
  }
}
