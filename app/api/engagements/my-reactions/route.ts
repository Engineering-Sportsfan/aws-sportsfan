// app/api/engagements/my-reactions/route.ts
// GET /api/engagements/my-reactions?userId=<id>&limit=5
// The logged-in user's latest reactions (like / comment / reply) on match-moment engagements, newest first.
import { NextRequest, NextResponse } from "next/server";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { getUser } from "@/lib/getUser";
import { batchGetItems } from "@/lib/dynamodbBatch";
import { cacheService } from "@/lib/cacheService";
import {
  REACTION_GSI_NAME,
  REACTION_ACTIONS,
  reactorKeyOf,
  isMissingIndexError,
  type ReactionAction,
} from "@/lib/engagementReactions";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const CACHE_TTL_SECONDS = 12;

interface Reaction {
  id: string;
  engagementId: string;
  action: ReactionAction;
  title: string;
  text: string;
  createdAt: number;
  imageUrl?: string;
}

function parseLimit(raw: string | null): number {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Like/comment rows are written with `authUser.userId`, so that is the key we query.
    const userId = authUser.userId;
    const { searchParams } = new URL(req.url);
    const requested = searchParams.get("userId");
    if (requested && requested !== authUser.userId && requested !== authUser.email) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    const limit = parseLimit(searchParams.get("limit"));

    const cacheKey = `my-reactions:${userId}:${limit}`;
    const cached = await cacheService.get<{ success: true; reactions: Reaction[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { "Cache-Control": "no-store" } });
    }

    // 1. Latest `limit` rows per action type: one Query each on the sparse GSI, newest first.
    let rows: Array<{ action: ReactionAction; item: Record<string, any> }> = [];
    try {
      const perAction = await Promise.all(
        REACTION_ACTIONS.map(async (action) => {
          const res = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              IndexName: REACTION_GSI_NAME,
              KeyConditionExpression: "reactorKey = :k",
              ExpressionAttributeValues: { ":k": reactorKeyOf(userId, action) },
              ScanIndexForward: false,
              Limit: limit,
            })
          );
          return (res.Items || []).map((item) => ({ action, item }));
        })
      );
      rows = perAction.flat();
    } catch (err: any) {
      if (isMissingIndexError(err)) {
        // Index not created yet: return an empty (uncached) result instead of failing the page.
        console.warn(`[my-reactions] GSI ${REACTION_GSI_NAME} is missing; returning no reactions.`);
        return NextResponse.json({ success: true, reactions: [] }, { headers: { "Cache-Control": "no-store" } });
      }
      throw err;
    }

    // 2. Merge, sort by when the user reacted, keep the newest `limit`.
    const merged = rows
      .map(({ action, item }) => ({
        action,
        engagementId: String(item.engagementId || "").trim(),
        // A like row's sk is LIKE#<userId>, so key it by engagement; comments/replies use their commentId.
        id:
          action === "like"
            ? `like_${item.engagementId}`
            : String(item.commentId || String(item.sk || "").replace(/^COMMENT#/, "")),
        text: action === "like" ? "" : String(item.text || ""),
        createdAt: Number(item.reactedAt) || 0,
      }))
      .filter((r) => r.engagementId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    // 3. Hydrate engagement titles (+ image) with one BatchGetItem.
    const titles = new Map<string, { title: string; imageUrl?: string }>();
    const ids = Array.from(new Set(merged.map((r) => r.engagementId)));
    if (ids.length > 0) {
      try {
        const metas = await batchGetItems(
          TABLES.SocialAndContent,
          ids.map((id) => ({ contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" })),
          {
            projectionExpression: "#c, #t, #iu, #iua, #md.#mi, #md.#mu",
            expressionAttributeNames: {
              "#c": "contentId",
              "#t": "title",
              "#iu": "imageUrl",
              "#iua": "imageUrlA",
              "#md": "memeData",
              "#mi": "imageUrl",
              "#mu": "mediaUrl",
            },
          }
        );
        for (const m of metas) {
          const id = String(m.contentId || "").replace(/^ENGAGEMENT#/, "");
          const imageUrl = m.imageUrl || m.imageUrlA || m.memeData?.imageUrl || m.memeData?.mediaUrl || undefined;
          titles.set(id, { title: String(m.title || ""), ...(imageUrl ? { imageUrl } : {}) });
        }
      } catch (err) {
        console.warn("[my-reactions] title hydration notice:", err);
      }
    }

    const reactions: Reaction[] = merged.map((r) => {
      const meta = titles.get(r.engagementId);
      return {
        id: r.id,
        engagementId: r.engagementId,
        action: r.action,
        title: meta?.title || "",
        text: r.text,
        createdAt: r.createdAt,
        ...(meta?.imageUrl ? { imageUrl: meta.imageUrl } : {}),
      };
    });

    const payload = { success: true as const, reactions };
    await cacheService.set(cacheKey, payload, CACHE_TTL_SECONDS);
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("GET /api/engagements/my-reactions error:", error);
    return NextResponse.json({ success: false, error: "Failed to load reactions" }, { status: 500 });
  }
}
