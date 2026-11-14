// app/api/user/followed-matches/route.ts — User Followed Matches Microservice (TABLES.GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { getUser } from "@/lib/getUser";
import { QueryCommand, PutCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function cleanUserId(val?: string | null): string {
  return String(val || "").trim().replace(/^USER#/i, "");
}

function cleanMatchId(val?: string | null): string {
  return String(val || "").trim().replace(/^MATCH#/i, "");
}

// ─── GET /api/user/followed-matches — Fetch matches followed by current user ───
export async function GET(req: NextRequest) {
  try {
    const authUser = await getUser(req).catch(() => null);
    const queryUid = req.nextUrl.searchParams.get("userId");
    const rawUserId = authUser?.userId || authUser?.email || queryUid;

    if (!rawUserId) {
      return NextResponse.json({ success: true, followedMatches: [] });
    }

    const uid = cleanUserId(rawUserId);

    // 1. Query GamificationAndWallet for FOLLOW#MATCH# records
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLES.GamificationAndWallet,
        KeyConditionExpression: "userId = :uid AND begins_with(sk, :skpfx)",
        ExpressionAttributeValues: {
          ":uid": `USER#${uid}`,
          ":skpfx": "FOLLOW#MATCH#",
        },
      })
    );

    const items = res.Items || [];
    const followedMatches = items.map((it) => ({
      matchId: cleanMatchId(it.matchId || it.sk?.replace(/^FOLLOW#MATCH#/, "")),
      matchTitle: it.matchTitle || it.title || "Match",
      teamA: it.teamA || it.team1 || "",
      teamB: it.teamB || it.team2 || "",
      date: it.date || it.matchDate || "",
      status: it.status || "live",
      followedAt: it.followedAt || it.createdAt || Date.now(),
      isFollowing: true,
    }));

    return NextResponse.json(
      { success: true, followedMatches },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch followed matches";
    console.error("GET /api/user/followed-matches error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── POST /api/user/followed-matches — Toggle or Set Follow for a Match ───
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req).catch(() => null);
    const rawUserId = authUser?.userId || authUser?.email || body.userId;
    const matchId = cleanMatchId(body.matchId);

    if (!rawUserId || !matchId) {
      return NextResponse.json(
        { success: false, error: "userId and matchId are required" },
        { status: 400 }
      );
    }

    const uid = cleanUserId(rawUserId);
    const action = String(body.action || "toggle").toLowerCase();
    const now = Date.now();

    // Check existing follow state
    const existing = await docClient.send(
      new GetCommand({
        TableName: TABLES.GamificationAndWallet,
        Key: {
          userId: `USER#${uid}`,
          sk: `FOLLOW#MATCH#${matchId}`,
        },
      })
    );

    const isCurrentlyFollowing = Boolean(existing.Item);
    let nextFollowing = false;

    if (action === "follow") {
      nextFollowing = true;
    } else if (action === "unfollow") {
      nextFollowing = false;
    } else {
      // toggle
      nextFollowing = !isCurrentlyFollowing;
    }

    if (nextFollowing) {
      const matchTitle = body.matchTitle || (body.teamA && body.teamB ? `${body.teamA} vs ${body.teamB}` : `Match ${matchId}`);
      await docClient.send(
        new PutCommand({
          TableName: TABLES.GamificationAndWallet,
          Item: {
            userId: `USER#${uid}`,
            sk: `FOLLOW#MATCH#${matchId}`,
            rawUserId: uid,
            matchId,
            matchTitle,
            teamA: body.teamA || "",
            teamB: body.teamB || "",
            date: body.date || "",
            status: body.status || "live",
            followedAt: now,
            isFollowing: true,
          },
        })
      );
    } else {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLES.GamificationAndWallet,
          Key: {
            userId: `USER#${uid}`,
            sk: `FOLLOW#MATCH#${matchId}`,
          },
        })
      );
    }

    return NextResponse.json({
      success: true,
      matchId,
      isFollowing: nextFollowing,
      action: nextFollowing ? "followed" : "unfollowed",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update match follow";
    console.error("POST /api/user/followed-matches error:", err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

