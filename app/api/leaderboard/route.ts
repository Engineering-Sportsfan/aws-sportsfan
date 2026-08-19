// app/api/leaderboard/route.ts — Migrated to AWS DynamoDB (UserData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unknown error occurred";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const userId = searchParams.get("userId");

    let entries: any[] = [];

    // 1. Try DynamoDB UserData or SportsData
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "UserData",
          FilterExpression: "begins_with(userId, :uPrefix) AND sk = :profileSk",
          ExpressionAttributeValues: {
            ":uPrefix": "USER#",
            ":profileSk": "PROFILE",
          },
          Limit: 300,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        entries = scanRes.Items
          .map((item) => ({
            userId: (item.userId as string).replace(/^USER#/, "") || item.id,
            username: item.name || item.username || item.userName || "User",
            totalPoints: Number(item.totalPoints || item.points || 0),
            correctPredictions: item.correctPredictions || 0,
            totalPredictions: item.totalPredictions || 0,
          }))
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((e, index) => ({
            rank: index + 1,
            ...e,
          }));
      }
    } catch (e) {
      console.warn("[leaderboard GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore globalLeaderboard
    if (entries.length === 0 && db) {
      const snapshot = await db
        .collection("globalLeaderboard")
        .orderBy("totalPoints", "desc")
        .select("userId", "userName", "userEmail", "totalPoints", "lastUpdated")
        .get();

      entries = snapshot.docs.map((doc, index) => {
        const d = doc.data();
        return {
          rank: index + 1,
          userId: d.userId || doc.id,
          username: d.userName || "User",
          totalPoints: d.totalPoints ?? 0,
          correctPredictions: 0,
          totalPredictions: 0,
        };
      });
    }

    const totalParticipants = entries.length;
    const pagedEntries = entries.slice(0, limit);

    let currentUser = null;
    if (userId) {
      currentUser = entries.find((e) => e.userId === userId) ?? null;
    }

    return NextResponse.json({
      success: true,
      data: {
        entries: pagedEntries,
        totalParticipants,
        currentUser,
      },
    });
  } catch (err: unknown) {
    console.error("Leaderboard API error:", err);
    return NextResponse.json(
      { success: false, error: getErrorMessage(err) },
      { status: 500 }
    );
  }
}