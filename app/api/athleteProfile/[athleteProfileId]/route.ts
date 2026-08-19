import { NextResponse } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ athleteProfileId: string }> }
) {
  try {
    const { athleteProfileId } = await params;

    const command = new GetCommand({
      TableName: "SportsData",
      Key: {
        entityId: `ATHLETE#${athleteProfileId}`,
        sk: "PROFILE#META",
      },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      // Fallback: Check if it is a Club in MS_Clubs
      const clubCommand = new GetCommand({
        TableName: "MS_Clubs",
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
              TableName: "MS_Transactions",
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

      return NextResponse.json(
        { message: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(response.Item);
  } catch (error: any) {
    console.error("Error fetching athlete:", error);

    return NextResponse.json(
      { message: error?.message || "Internal Server Error", error: String(error) },
      { status: 500 }
    );
  }
}