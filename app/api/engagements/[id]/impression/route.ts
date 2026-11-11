// app/api/engagements/[id]/impression/route.ts — Engagement Card Impression Tracking (1 unique impression per user per engagement)
import { NextRequest, NextResponse } from "next/server";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { getUser } from "@/lib/getUser";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, countRecords, getEngagementStats } from "@/lib/engagementSocial";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const clean = (id: string) =>
  String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const cleanId = clean((await params).id);
    const authUser = await getUser(req).catch(() => null);
    const userId = authUser?.userId || authUser?.email || req.nextUrl.searchParams.get("userId");

    const impressions = await countRecords(cleanId, "IMPRESSION#").catch(() => 0);
    let impressed = false;
    if (userId) {
      const r = await docClient
        .send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: `IMPRESSION#${userId}` },
          })
        )
        .catch(() => null);
      impressed = !!r?.Item;
    }

    return NextResponse.json(
      { success: true, impressed, impressions },
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
    let alreadyImpressed = false;

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `ENGAGEMENT#${cleanId}`,
            sk: `IMPRESSION#${userId}`,
            entityId: "IMPRESSION#ENGAGEMENT",
            userId,
            userName: body?.userName || authUser?.name || undefined,
            userAvatar: body?.userAvatar || authUser?.avatarUrl || undefined,
            engagementId: cleanId,
            ...(resolvedMatchId ? { matchId: resolvedMatchId } : {}),
            ...(resolvedMomentId ? { momentId: resolvedMomentId } : {}),
            ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
            viewedAt: now,
            createdAt: now,
          },
          ConditionExpression: "attribute_not_exists(sk)",
        })
      );
    } catch (e: any) {
      if (e?.name === "ConditionalCheckFailedException") {
        alreadyImpressed = true;
      } else {
        throw e;
      }
    }

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
      alreadyImpressed,
      impressions: stats.impressions,
      totalActions: stats.totalActions,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/impression error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record impression";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

