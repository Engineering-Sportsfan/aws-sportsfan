import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// In-memory cache to save database reads on repeat visits
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache: {
  data: Record<string, { entries: any[]; cachedAt: number }>;
} = { data: {} };

function cacheKey(limit: number, cursor: string) {
  return `${limit}__${cursor}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const cursorId = searchParams.get("cursor") || "";
    const showBreakdown = searchParams.get("breakdown") === "true";

    const key = cacheKey(limit, cursorId);
    const now = Date.now();

    // Cache hit
    const cached = cache.data[key];
    if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
      return NextResponse.json(
        {
          success: true,
          leaderboard: cached.entries,
          cached: true,
          cachedAt: cached.cachedAt,
        },
        {
          headers: {
            "Cache-Control": `public, s-maxage=${CACHE_TTL_MS / 1000}, stale-while-revalidate=30`,
          },
        }
      );
    }

    let leaderboard: any[] = [];
    let fetchedFromDynamo = false;
    let hasMore = false;
    let nextCursorId: string | null = null;

    // 1. Try querying DynamoDB first using leaderboardType-points-index
    try {
      const queryParams: any = {
        TableName: "GamificationAndWallet",
        IndexName: "leaderboardType-points-index",
        KeyConditionExpression: "leaderboardType = :t",
        ExpressionAttributeValues: {
          ":t": "GLOBAL"
        },
        ScanIndexForward: false, // highest points first
        Limit: limit
      };

      if (cursorId) {
        // Resolve cursor record points to structure ExclusiveStartKey
        const getRes = await docClient.send(new GetCommand({
          TableName: "GamificationAndWallet",
          Key: { userId: `USER#${cursorId}`, sk: "LEADERBOARD#GLOBAL" }
        }));
        if (getRes.Item) {
          queryParams.ExclusiveStartKey = {
            userId: `USER#${cursorId}`,
            sk: "LEADERBOARD#GLOBAL",
            leaderboardType: "GLOBAL",
            points: getRes.Item.points ?? getRes.Item.totalPoints ?? 0
          };
        }
      }

      const res = await docClient.send(new QueryCommand(queryParams));

      if (res.Items) {
        leaderboard = res.Items.map((item, index) => ({
          rank: cursorId ? "?" : index + 1,
          userId: item.userId.replace(/^USER#/, ""),
          userName: item.userName || "User",
          userEmail: item.userEmail || "",
          totalPoints: item.points ?? item.totalPoints ?? 0,
          lastUpdated: item.lastUpdated ?? now,
          ...(showBreakdown && { breakdown: item.breakdown ?? {} }),
          _docId: item.userId.replace(/^USER#/, "")
        }));

        hasMore = res.LastEvaluatedKey !== undefined;
        if (res.LastEvaluatedKey && res.LastEvaluatedKey.userId) {
          nextCursorId = (res.LastEvaluatedKey.userId as string).replace(/^USER#/, "");
        }
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[Leaderboard GET] DynamoDB GSI lookup failed:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const fields = showBreakdown
          ? ["userId", "userName", "userEmail", "totalPoints", "breakdown", "lastUpdated"]
          : ["userId", "userName", "userEmail", "totalPoints", "lastUpdated"];

        let query = db
          .collection("globalLeaderboard")
          .orderBy("totalPoints", "desc")
          .select(...fields)
          .limit(limit);

        if (cursorId) {
          const cursorDoc = await db.collection("globalLeaderboard").doc(cursorId).get();
          if (cursorDoc.exists) {
            query = query.startAfter(cursorDoc);
          }
        }

        const snapshot = await query.get();

        leaderboard = snapshot.docs.map((doc, index) => {
          const d = doc.data();
          return {
            rank: cursorId ? "?" : index + 1,
            userId: d.userId || doc.id,
            userName: d.userName || "User",
            userEmail: d.userEmail || "",
            totalPoints: d.totalPoints ?? 0,
            lastUpdated: d.lastUpdated ?? now,
            ...(showBreakdown && { breakdown: d.breakdown ?? {} }),
            _docId: doc.id,
          };
        });

        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        hasMore = snapshot.docs.length === limit;
        nextCursorId = hasMore ? lastDoc?.id : null;
      } catch (fsErr) {
        console.error("[Leaderboard GET] Firestore fallback failed:", fsErr);
        return NextResponse.json({ success: false, error: "Failed to fetch leaderboard" }, { status: 500 });
      }
    }

    // Re-index ranks correctly on the first page load
    if (!cursorId) {
      leaderboard.forEach((e, i) => {
        (e as any).rank = i + 1;
      });
    }

    const payload = {
      success: true,
      leaderboard,
      cached: false,
      pagination: {
        limit,
        hasMore,
        nextCursor: nextCursorId,
      },
    };

    // Store in cache
    cache.data[key] = { entries: leaderboard, cachedAt: now };

    // Evict expired cache entries
    for (const k of Object.keys(cache.data)) {
      if (now - cache.data[k].cachedAt > CACHE_TTL_MS * 2) {
        delete cache.data[k];
      }
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_TTL_MS / 1000}, stale-while-revalidate=30`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/roar/leaderboard error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}