// app/api/club-profile/search/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamName = searchParams.get("teamName");
    const seasonsLimit = parseInt(searchParams.get("seasonsLimit") || "5");

    if (!teamName) {
      return NextResponse.json(
        { success: false, message: "teamName is required" },
        { status: 400 }
      );
    }

    let profile: Record<string, unknown> | null = null;
    let seasons: any[] = [];
    let insights: any[] = [];
    let strengths: any[] = [];
    let media: any[] = [];

    // 1. Query Profile from DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :pfx) AND (#n = :tName OR nameLower = :tLower)",
          ExpressionAttributeNames: { "#n": "name" },
          ExpressionAttributeValues: {
            ":pfx": "PROFILE_CLUB#",
            ":tName": teamName,
            ":tLower": teamName.toLowerCase(),
          },
          Limit: 1,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        const item = scanRes.Items[0];
        profile = {
          id: (item.id as string) || (item.entityId as string).replace(/^PROFILE_CLUB#/, ""),
          ...item,
        };
      }
    } catch (e) {
      console.warn("[club-profile search] DynamoDB profile scan error:", e);
    }

    // Fallback profile to Firebase
    if (!profile && db) {
      const profileSnapshot = await db
        .collection("clubProfiles")
        .where("name", "==", teamName)
        .limit(1)
        .get();

      if (!profileSnapshot.empty) {
        const doc = profileSnapshot.docs[0];
        profile = { id: doc.id, ...doc.data() };
      }
    }

    if (!profile) {
      return NextResponse.json(
        { success: false, message: `Team "${teamName}" not found` },
        { status: 404 }
      );
    }

    const profileId = profile.id as string;

    // 2. Query Seasons
    try {
      const seasonsRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :sPfx) AND clubProfileId = :cpId",
          ExpressionAttributeValues: {
            ":sPfx": "CLUB_SEASON#",
            ":cpId": profileId,
          },
          Limit: 50,
        })
      );

      if (seasonsRes.Items && seasonsRes.Items.length > 0) {
        seasons = seasonsRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^CLUB_SEASON#/, ""),
          ...(item.season as Record<string, unknown> || item),
        }));
      }
    } catch (e) {
      console.warn("[club-profile search] DynamoDB seasons notice:", e);
    }

    if (seasons.length === 0 && db) {
      const seasonsSnapshot = await db
        .collection("clubSeasons")
        .where("clubProfileId", "==", profileId)
        .orderBy("season.year", "desc")
        .limit(seasonsLimit)
        .get();

      seasons = seasonsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data().season,
      }));
    }

    // 3. Query Insights
    try {
      const insightsRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :iPfx) AND clubProfileId = :cpId",
          ExpressionAttributeValues: {
            ":iPfx": "CLUB_INSIGHT#",
            ":cpId": profileId,
          },
          Limit: 1,
        })
      );

      if (insightsRes.Items && insightsRes.Items.length > 0) {
        const iDoc = insightsRes.Items[0];
        insights = (iDoc.insights as any[]) || [];
        strengths = (iDoc.strengths as any[]) || [];
      }
    } catch (e) {
      console.warn("[club-profile search] DynamoDB insights notice:", e);
    }

    if (insights.length === 0 && strengths.length === 0 && db) {
      const insightsSnapshot = await db
        .collection("clubInsights")
        .where("clubProfileId", "==", profileId)
        .limit(1)
        .get();

      if (!insightsSnapshot.empty) {
        const insightsData = insightsSnapshot.docs[0].data();
        insights = insightsData.insights || [];
        strengths = insightsData.strengths || [];
      }
    }

    // 4. Query Media
    try {
      const mediaRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :mPfx) AND clubProfileId = :cpId",
          ExpressionAttributeValues: {
            ":mPfx": "CLUB_MEDIA#",
            ":cpId": profileId,
          },
          Limit: 1,
        })
      );

      if (mediaRes.Items && mediaRes.Items.length > 0) {
        const mDoc = mediaRes.Items[0];
        media = (mDoc.mediaItems as any[]) || [];
      }
    } catch (e) {
      console.warn("[club-profile search] DynamoDB media notice:", e);
    }

    if (media.length === 0 && db) {
      const mediaSnapshot = await db
        .collection("clubMedia")
        .where("clubProfileId", "==", profileId)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();

      if (!mediaSnapshot.empty) {
        const mediaData = mediaSnapshot.docs[0].data();
        media = mediaData.mediaItems || [];
      }
    }

    const completeTeamData = {
      ...profile,
      seasons: seasons.slice(0, seasonsLimit),
      seasonsHasMore: seasons.length > seasonsLimit,
      insights,
      strengths,
      media,
    };

    return NextResponse.json({
      success: true,
      data: completeTeamData,
    });
  } catch (error) {
    console.error("Error fetching complete team data:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch team data" },
      { status: 500 }
    );
  }
}