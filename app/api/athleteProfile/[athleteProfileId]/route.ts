import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ athleteProfileId: string }> }
) {
  try {
    const { athleteProfileId } = await params;

    const command = new GetCommand({
      TableName: TABLES.SportsData,
      Key: {
        entityId: `ATHLETE#${athleteProfileId}`,
        sk: "PROFILE#META",
      },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      // Fallback: Check if it is a Club in MS_Clubs
      const clubCommand = new GetCommand({
        TableName: TABLES.MS_Clubs,
        Key: {
          entityId: `CLUB#${athleteProfileId}`,
          sk: "CLUB#META",
        },
      });

      let clubResponse = null;
      let stintsResponse = null;
      try {
        clubResponse = await docClient.send(clubCommand);
        if (clubResponse.Item) {
          const QueryCommand = (await import("@aws-sdk/lib-dynamodb")).QueryCommand;
          stintsResponse = await docClient.send(
            new QueryCommand({
              TableName: TABLES.MS_Transactions,
              KeyConditionExpression: "entityId = :e",
              ExpressionAttributeValues: { ":e": `CLUB#${athleteProfileId}` },
            })
          );
        }
      } catch (clubErr) {
        console.error("Error fetching club fallback:", clubErr);
      }

      if (clubResponse && clubResponse.Item) {
        const club = clubResponse.Item;
        const stints = stintsResponse?.Items ?? [];
        const statsItem = stints.find((i: any) => (i.sk as string)?.endsWith("#STATS"));
        
        const recordHighlight = statsItem?.record ?? null;
        const analytics = statsItem?.analytics ?? null;

        // Map club schema properties to match expected athlete schema
        const mappedClub = {
          entityId: club.entityId,
          sk: club.sk,
          athleteId: athleteProfileId,
          name: club.clubName ?? "–",
          sport: club.sportId ?? "–",
          country: club.country ?? "–",
          profileImage: club.logoUrl ?? null,
          coverImage: club.teamPhotoUrl ?? null,
          bio: club.bio ?? "",
          welcomeMessage: club.bio ?? "",
          welcomeVideoUrl: club.teamPhotoUrl ?? null,
          isVerified: true,
          
          // CoreInfo nested object
          coreInfo: {
            name: club.clubName ?? "–",
            country: club.country ?? "–",
            profileImage: club.logoUrl ?? null,
            coverImage: club.teamPhotoUrl ?? null,
            isVerified: true,
            dob: club.founded ? `${club.founded}-01-01` : null,
            age: club.founded ? new Date().getFullYear() - parseInt(club.founded) : "–",
            gender: club.clubType ?? "–",
            role: "Club / Team",
            club: club.shortName ?? "–",
            nickname: club.shortName ?? "–",
            discipline: club.sportId ?? "–",
            birthplace: club.homeGround ?? "–",
            yearsActiveSince: club.founded ?? "–",
            coachName: club.headCoach ?? "–",
            coach: club.headCoach ?? "–",
            captain: club.captain ?? "–",
            owner: club.owner ?? "–",
            venue: club.homeGround ?? "–",
            hand: club.founded ?? "–"
          },
          
          // Performance nested object
          performance: {
            primaryEvent: club.sportId ?? "–",
            stats: {
              seasonBest: analytics?.heroStat ?? "–",
              personalBest: analytics?.stats?.rating ?? "–",
            },
            medalCabinet: [
              { category: "Founded Year", medal: "GOLD", year: club.founded ?? "–" },
              { category: "Captain: " + (club.captain ?? "–"), medal: "SILVER" },
              { category: "Coach: " + (club.headCoach ?? "–"), medal: "BRONZE" }
            ],
          },
          
          // Record highlight
          record_highlight: recordHighlight ?? {
            progressData: [],
            benchmarks: []
          },
          
          // Analytics nested object
          analytics: analytics ?? {
            sport: club.sportId ?? "–",
            radarData: [],
            stats: {
              worldRank: "–",
            }
          }
        };
        return NextResponse.json(mappedClub);
      }

      // Fallback 2: Check if it is a Player/Athlete in MS_PLAYERS_TABLE
      const entityCandidates = [
        `ATHLETE#${athleteProfileId}`,
        `PLAYER#${athleteProfileId}`,
        athleteProfileId,
      ];
      let playerProfile = null;
      let resolvedPlayerEntityId = `PLAYER#${athleteProfileId}`;

      for (const entId of entityCandidates) {
        try {
          const pCmd = new GetCommand({
            TableName: TABLES.MS_Players,
            Key: { entityId: entId, sk: "PROFILE#META" },
          });
          const pRes = await docClient.send(pCmd);
          if (pRes.Item) {
            playerProfile = pRes.Item;
            resolvedPlayerEntityId = entId;
            break;
          }
        } catch {}
      }

      if (playerProfile) {
        let playerStats: any[] = [];
        try {
          const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
          const statsRes = await docClient.send(
            new QueryCommand({
              TableName: TABLES.MS_Transactions,
              KeyConditionExpression: "entityId = :entityId AND begins_with(sk, :prefix)",
              ExpressionAttributeValues: {
                ":entityId": resolvedPlayerEntityId,
                ":prefix": "AFFIL#",
              },
            })
          );
          playerStats = statsRes.Items || [];
        } catch {}

        const { assemblePlayerDocument } = await import("@/lib/assemblePlayerDocument");
        return NextResponse.json(
          assemblePlayerDocument(playerProfile as any, playerStats as any)
        );
      }

      return NextResponse.json(
        { message: "Profile not found" },
        { status: 404 }
      );
    }

    const { assemblePlayerDocument } = await import("@/lib/assemblePlayerDocument");
    return NextResponse.json(assemblePlayerDocument(response.Item as any, []));
  } catch (error: any) {
    console.error("Error fetching athlete:", error);

    return NextResponse.json(
      { message: error?.message || "Internal Server Error", error: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ athleteProfileId: string }> }
) {
  try {
    const { athleteProfileId } = await params;
    const body = await request.json();
    const { worldRank } = body;

    // Check SportsData first
    const getRes = await docClient.send(
      new GetCommand({
        TableName: TABLES.SportsData,
        Key: { entityId: `ATHLETE#${athleteProfileId}`, sk: "PROFILE#META" },
      })
    );

    let targetTable: string = TABLES.SportsData;
    let currentItem = getRes.Item;

    if (!currentItem) {
      // Check MS_Players
      const playerRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.MS_Players,
          Key: { entityId: `PLAYER#${athleteProfileId}`, sk: "PROFILE#META" },
        })
      );
      if (playerRes.Item) {
        targetTable = TABLES.MS_Players;
        currentItem = playerRes.Item;
      }
    }

    if (!currentItem) {
      return NextResponse.json({ message: "Profile not found" }, { status: 404 });
    }

    const updatedItem = { ...currentItem };

    if (worldRank !== undefined) {
      const rankStr = String(worldRank).trim();

      // Update in analytics.stats
      if (!updatedItem.analytics) updatedItem.analytics = {};
      if (!updatedItem.analytics.stats) updatedItem.analytics.stats = {};
      updatedItem.analytics.stats.worldRank = rankStr;

      // Update in performance.stats
      if (!updatedItem.performance) updatedItem.performance = {};
      if (!updatedItem.performance.stats) updatedItem.performance.stats = {};
      updatedItem.performance.stats.worldRank = rankStr;

      // Update in stats if present
      if (updatedItem.stats && typeof updatedItem.stats === "object") {
        updatedItem.stats.worldRank = rankStr;
      }
    }

    // Also support any other arbitrary profile updates passed in the body
    for (const [key, val] of Object.entries(body)) {
      if (key !== "worldRank" && key !== "entityId" && key !== "sk") {
        updatedItem[key] = val;
      }
    }

    const { PutCommand } = await import("@aws-sdk/lib-dynamodb");
    await docClient.send(
      new PutCommand({
        TableName: targetTable,
        Item: updatedItem,
      })
    );

    return NextResponse.json({
      success: true,
      message: `Updated profile for ${athleteProfileId}`,
      worldRank: updatedItem.analytics?.stats?.worldRank,
      item: updatedItem,
    });
  } catch (error: any) {
    console.error("Error updating athlete profile:", error);
    return NextResponse.json(
      { message: error?.message || "Internal Server Error", error: String(error) },
      { status: 500 }
    );
  }
}