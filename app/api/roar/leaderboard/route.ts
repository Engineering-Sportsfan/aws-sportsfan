import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// In-memory cache to save Firestore document reads on repeat visits
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

    // Select fields to load from the globalLeaderboard collection
    const fields = showBreakdown
      ? ["userId", "userName", "userEmail", "totalPoints", "breakdown", "lastUpdated"]
      : ["userId", "userName", "userEmail", "totalPoints", "lastUpdated"];

    // Query from the single consolidated globalLeaderboard collection (blueprint compliant)
    let query = db
      .collection("globalLeaderboard")
      .orderBy("totalPoints", "desc")
      .select(...fields)
      .limit(limit);

    // Cursor pagination (using startAfter instead of offsets)
    if (cursorId) {
      const cursorDoc = await db.collection("globalLeaderboard").doc(cursorId).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snapshot = await query.get();

    const leaderboard = snapshot.docs.map((doc, index) => {
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

    // Re-index ranks correctly on the first page load
    if (!cursorId) {
      leaderboard.forEach((e, i) => {
        (e as any).rank = i + 1;
      });
    }

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    const hasMore = snapshot.docs.length === limit;

    const payload = {
      success: true,
      leaderboard,
      cached: false,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? lastDoc?.id : null,
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