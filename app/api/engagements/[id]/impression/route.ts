// app/api/engagements/[id]/impression/route.ts — Engagement Card Impression Tracking (non-unique: every view/re-view counts +1)
import { NextRequest, NextResponse } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { getUser } from "@/lib/getUser";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, getEngagementStats } from "@/lib/engagementSocial";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const clean = (id: string) =>
  String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const cleanId = clean((await params).id);
    const stats = await getEngagementStats(cleanId, { consistent: true });

    return NextResponse.json(
      { success: true, impressions: stats.impressions, totalActions: stats.totalActions },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch impressions";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const cleanId = clean((await params).id);
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req).catch(() => null);
    const userId =
      authUser?.userId ||
      authUser?.email ||
      String(body?.userId || "").trim() ||
      req.headers.get("x-user-id");

    if (!cleanId || !userId) {
      return NextResponse.json(
        { success: false, error: "engagementId and userId are required" },
        { status: 400 }
      );
    }

    const rawMatchId = body?.matchId || req.nextUrl.searchParams.get("matchId") || undefined;
    const found = await findEngagementById(cleanId, rawMatchId).catch(() => null);
    const parentItem = found?.item;
    const resolvedMatchId = rawMatchId || parentItem?.matchId || undefined;
    const resolvedMomentId = body?.momentId || parentItem?.momentId || undefined;
    const resolvedSeriesId = body?.seriesId || parentItem?.seriesId || undefined;

    const now = Date.now();
    const rand = Math.random().toString(36).slice(2, 7);

    await docClient.send(
      new PutCommand({
        TableName: TABLES.SocialAndContent,
        Item: {
          contentId: `ENGAGEMENT#${cleanId}`,
          sk: `IMPRESSION#${userId}#${now}_${rand}`,
          entityId: "IMPRESSION#ENGAGEMENT",
          userId,
          userName: body?.userName || authUser?.name || undefined,
          userAvatar: body?.userAvatar || authUser?.avatarUrl || undefined,
          engagementId: cleanId,
          ...(resolvedMatchId ? { matchId: resolvedMatchId } : {}),
          ...(resolvedMomentId ? { momentId: resolvedMomentId } : {}),
          ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
          impressionCount: 1,
          viewedAt: now,
          createdAt: now,
        },
      })
    );

    const stats = await getEngagementStats(cleanId, { consistent: true });
    if (parentItem) {
      applyEngagementStats(parentItem, stats);
      parentItem.updatedAt = now;
      await persistEngagementUpdate(cleanId, parentItem, found?.matchMomentsRecord).catch((err) =>
        console.warn("impression mirror notice:", err)
      );
    }

    return NextResponse.json({
      success: true,
      impressions: stats.impressions,
      totalActions: stats.totalActions,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/impression error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record impression";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

