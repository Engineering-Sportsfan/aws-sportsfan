// app/api/engagements/[id]/comments/impression/route.ts — Social Response Impression Tracking on Engagement Comments
import { NextRequest, NextResponse } from "next/server";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { getUser } from "@/lib/getUser";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, getEngagementStats } from "@/lib/engagementSocial";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const clean = (id: string) =>
  String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const cleanEngId = clean((await params).id);
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req).catch(() => null);
    const actorUserId =
      authUser?.userId ||
      authUser?.email ||
      String(body?.userId || "").trim() ||
      req.headers.get("x-user-id");

    const commentIds: string[] = Array.isArray(body?.commentIds)
      ? body.commentIds.map((c: any) => String(c).replace(/^COMMENT#/, "").trim()).filter(Boolean)
      : body?.commentId
      ? [String(body.commentId).replace(/^COMMENT#/, "").trim()]
      : [];

    if (!cleanEngId || !actorUserId || commentIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "engagementId, userId, and commentIds are required" },
        { status: 400 }
      );
    }

    const rawMatchId = body?.matchId || req.nextUrl.searchParams.get("matchId") || undefined;
    const found = await findEngagementById(cleanEngId, rawMatchId).catch(() => null);
    const parentEng = found?.item;
    const resolvedMatchId = rawMatchId || parentEng?.matchId || undefined;
    const resolvedMomentId = body?.momentId || parentEng?.momentId || undefined;
    const resolvedSeriesId = body?.seriesId || parentEng?.seriesId || undefined;

    const cleanActorLower = String(actorUserId).replace(/^USER#/i, "").trim().toLowerCase();
    const now = Date.now();
    let newlyRecorded = 0;

    for (const cid of commentIds.slice(0, 50)) {
      // Verify the target comment author so users don't get social response impressions for their own comment
      const commentRes = await docClient
        .send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${cleanEngId}`, sk: `COMMENT#${cid}` },
          })
        )
        .catch(() => null);

      const targetAuthorUid = String(commentRes?.Item?.authorUid || "").trim();
      const targetAuthorLower = targetAuthorUid.replace(/^USER#/i, "").toLowerCase();
      if (targetAuthorLower && targetAuthorLower === cleanActorLower) {
        continue;
      }

      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLES.SocialAndContent,
            Item: {
              contentId: `ENGAGEMENT#${cleanEngId}`,
              sk: `SOCIAL_IMPRESSION#${cid}#${actorUserId}`,
              entityId: "SOCIAL_RESPONSE#IMPRESSION",
              responseType: "impression",
              actorUserId,
              targetCommentId: cid,
              targetAuthorUid: targetAuthorUid || undefined,
              engagementId: cleanEngId,
              ...(resolvedMatchId ? { matchId: resolvedMatchId } : {}),
              ...(resolvedMomentId ? { momentId: resolvedMomentId } : {}),
              ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
              createdAt: now,
            },
            ConditionExpression: "attribute_not_exists(sk)",
          })
        );
        newlyRecorded++;
      } catch (e: any) {
        if (e?.name !== "ConditionalCheckFailedException") {
          console.warn("social impression put notice:", e);
        }
      }
    }

    const stats = await getEngagementStats(cleanEngId, { consistent: true });
    if (parentEng) {
      applyEngagementStats(parentEng, stats);
      parentEng.updatedAt = now;
      await persistEngagementUpdate(cleanEngId, parentEng, found?.matchMomentsRecord).catch((err) =>
        console.warn("social impression mirror notice:", err)
      );
    }

    return NextResponse.json({
      success: true,
      newlyRecorded,
      socialImpressions: stats.socialImpressions,
      totalSocialResponses: stats.totalSocialResponses,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/comments/impression error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record social response impression";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

