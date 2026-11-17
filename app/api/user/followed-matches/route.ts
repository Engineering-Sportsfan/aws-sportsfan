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

function extractCandidateUserKeys(raw?: string | null): string[] {
  const clean = cleanUserId(raw);
  if (!clean) return [];
  const candidates = new Set<string>([clean, clean.toLowerCase()]);

  if (clean.includes("@")) {
    const lower = clean.toLowerCase();
    candidates.add(lower.replace(/[@.]/g, "_"));
    candidates.add(lower.replace(/[^a-z0-9]/g, "_"));
    candidates.add(lower.replace(/@/g, "_"));
  } else {
    for (const domain of ["gmail_com", "yahoo_com", "outlook_com", "hotmail_com", "icloud_com", "sportsfan360_com"]) {
      const lower = clean.toLowerCase();
      if (lower.endsWith(`_${domain}`)) {
        const local = lower.slice(0, -(domain.length + 1));
        const realDomain = domain.replace("_", ".");
        candidates.add(`${local}@${realDomain}`);
      }
    }
  }
  return Array.from(candidates);
}

// ─── GET /api/user/followed-matches — Fetch matches followed by current user ───
export async function GET(req: NextRequest) {
  try {
    const authUser = await getUser(req).catch(() => null);
    const queryUid = req.nextUrl.searchParams.get("userId");
    const rawUserId = authUser?.userId || authUser?.email || queryUid;

    const candidateIds = Array.from(
      new Set([
        ...extractCandidateUserKeys(rawUserId),
        ...extractCandidateUserKeys(queryUid),
        ...extractCandidateUserKeys(authUser?.userId),
        ...extractCandidateUserKeys(authUser?.email),
      ])
    );

    if (candidateIds.length === 0) {
      return NextResponse.json({ success: true, followedMatches: [] });
    }

    const matchMap = new Map<string, any>();

    // Query GamificationAndWallet for FOLLOW#MATCH# records across all candidate user keys
    for (const uid of candidateIds) {
      try {
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

        for (const it of res.Items || []) {
          const mId = cleanMatchId(it.matchId || it.sk?.replace(/^FOLLOW#MATCH#/, ""));
          if (mId && !matchMap.has(mId)) {
            matchMap.set(mId, {
              matchId: mId,
              matchTitle: it.matchTitle || it.title || (it.teamA && it.teamB ? `${it.teamA} vs ${it.teamB}` : `Match ${mId}`),
              teamA: it.teamA || it.team1 || "",
              teamB: it.teamB || it.team2 || "",
              date: it.date || it.matchDate || "",
              status: it.status || "live",
              followedAt: it.followedAt || it.createdAt || Date.now(),
              isFollowing: true,
            });
          }
        }
      } catch (qErr) {
        console.warn(`Query followed-matches notice for ${uid}:`, qErr);
      }
    }

    const followedMatches = Array.from(matchMap.values());

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

    const primaryUid = cleanUserId(rawUserId);
    const candidateIds = Array.from(
      new Set([
        primaryUid,
        ...extractCandidateUserKeys(rawUserId),
        ...extractCandidateUserKeys(body.userId),
        ...extractCandidateUserKeys(authUser?.userId),
        ...extractCandidateUserKeys(authUser?.email),
      ])
    );

    const action = String(body.action || "toggle").toLowerCase();
    const now = Date.now();

    // Check existing follow state across candidates
    let isCurrentlyFollowing = false;
    for (const uid of candidateIds) {
      try {
        const existing = await docClient.send(
          new GetCommand({
            TableName: TABLES.GamificationAndWallet,
            Key: {
              userId: `USER#${uid}`,
              sk: `FOLLOW#MATCH#${matchId}`,
            },
          })
        );
        if (existing.Item) {
          isCurrentlyFollowing = true;
          break;
        }
      } catch {}
    }

    let nextFollowing = false;
    if (action === "follow") {
      nextFollowing = true;
    } else if (action === "unfollow") {
      nextFollowing = false;
    } else {
      nextFollowing = !isCurrentlyFollowing;
    }

    const matchTitle = body.matchTitle || (body.teamA && body.teamB ? `${body.teamA} vs ${body.teamB}` : `Match ${matchId}`);

    // Persist across candidate IDs
    for (const uid of candidateIds) {
      try {
        if (nextFollowing) {
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
      } catch (wErr) {
        console.warn(`Write followed-match error for ${uid}:`, wErr);
      }
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

