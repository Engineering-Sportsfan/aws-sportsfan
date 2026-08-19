// app/api/player-profile/search/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Player profile id required" },
        { status: 400 }
      );
    }

    let profile: any = null;
    let home: any[] = [];
    let season: any = null;
    let insights: any = null;
    let media: any = null;

    // 1. Try DynamoDB
    try {
      const pRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `PLAYER_PROFILE#${id}`, sk: "PROFILE#META" },
        })
      );
      if (pRes.Item) profile = { id, ...pRes.Item };

      const scanHome = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :hPrefix) AND playerProfilesId = :id",
          ExpressionAttributeValues: { ":hPrefix": "PLAYER_HOME#", ":id": id },
          Limit: 50,
        })
      );
      if (scanHome.Items && scanHome.Items.length > 0) {
        home = scanHome.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^PLAYER_HOME#/, ""),
          ...item,
        }));
      }

      const scanSeason = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :sPrefix) AND (playerProfilesId = :id OR playerProfileId = :id)",
          ExpressionAttributeValues: { ":sPrefix": "PLAYER_SEASON#", ":id": id },
          Limit: 1,
        })
      );
      if (scanSeason.Items && scanSeason.Items.length > 0) {
        season = {
          id: scanSeason.Items[0].id || (scanSeason.Items[0].entityId as string).replace(/^PLAYER_SEASON#/, ""),
          ...scanSeason.Items[0],
        };
      }

      const scanInsights = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :iPrefix) AND (playerProfilesId = :id OR playerProfileId = :id)",
          ExpressionAttributeValues: { ":iPrefix": "PLAYER_INSIGHT#", ":id": id },
          Limit: 1,
        })
      );
      if (scanInsights.Items && scanInsights.Items.length > 0) {
        insights = {
          id: scanInsights.Items[0].id || (scanInsights.Items[0].entityId as string).replace(/^PLAYER_INSIGHT#/, ""),
          ...scanInsights.Items[0],
        };
      }

      const scanMedia = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :mPrefix) AND (playerProfileId = :id OR playerProfilesId = :id)",
          ExpressionAttributeValues: { ":mPrefix": "PLAYER_MEDIA#", ":id": id },
          Limit: 1,
        })
      );
      if (scanMedia.Items && scanMedia.Items.length > 0) {
        media = {
          id: scanMedia.Items[0].id || (scanMedia.Items[0].entityId as string).replace(/^PLAYER_MEDIA#/, ""),
          ...scanMedia.Items[0],
        };
      }
    } catch (e) {
      console.warn("[player-profile search [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!profile && db) {
      const [
        profileSnap,
        homeSnap,
        seasonSnap,
        insightsSnap,
        mediaSnap,
      ] = await Promise.all([
        db.collection("PlayerProfiles").doc(id).get(),
        db.collection("playershome").where("playerProfilesId", "==", id).orderBy("createdAt", "desc").get(),
        db.collection("playerSeasons").where("playerProfilesId", "==", id).orderBy("createdAt", "desc").limit(1).get(),
        db.collection("playerInsights").where("playerProfilesId", "==", id).limit(1).get(),
        db.collection("playerMedia").where("playerProfileId", "==", id).orderBy("createdAt", "desc").limit(1).get(),
      ]);

      if (profileSnap.exists) {
        profile = { id: profileSnap.id, ...profileSnap.data() };
      }
      if (!homeSnap.empty) {
        home = homeSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }
      if (!seasonSnap.empty) {
        season = { id: seasonSnap.docs[0].id, ...seasonSnap.docs[0].data() };
      }
      if (!insightsSnap.empty) {
        insights = { id: insightsSnap.docs[0].id, ...insightsSnap.docs[0].data() };
      }
      if (!mediaSnap.empty) {
        media = { id: mediaSnap.docs[0].id, ...mediaSnap.docs[0].data() };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        profile,
        home,
        season,
        insights,
        media,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}