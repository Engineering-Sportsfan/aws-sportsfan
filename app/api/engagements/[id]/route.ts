// app/api/engagements/[id]/route.ts — Single Engagement GET, PUT/PATCH, DELETE
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, findUserVote, getEngagementStats } from "@/lib/engagementSocial";
import { DeleteCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementItem } from "@/types/engagements";

import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id] ────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const matchIdParam = searchParams.get("matchId") || undefined;
    const found = await findEngagementById(cleanId, matchIdParam);

    let item: any = found?.item || null;
    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    // Real counts + user interaction state (userLiked, userVoted, userVote) from the child records
    const authUser = await getUser(req);
    const candidateIds = Array.from(
      new Set([authUser?.userId, authUser?.email, searchParams.get("userId")].filter(Boolean))
    ) as string[];

    try {
      const stats = await getEngagementStats(cleanId);
      applyEngagementStats(item, stats);
      if (candidateIds.length > 0) {
        const userVote = findUserVote(stats, candidateIds);
        item = {
          ...item,
          userLiked: candidateIds.some((uid) => stats.userLikes.has(uid)),
          userVoted: userVote !== null,
          userVote,
        };
      }
    } catch (hydrationErr) {
      console.warn("Single engagement stats hydration notice:", hydrationErr);
    }

    return NextResponse.json({ success: true, engagement: item });
  } catch (error: unknown) {
    console.error("GET /api/engagements/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT /api/engagements/[id] — Update engagement ────────────────────────────
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();

    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const matchIdParam = body.matchId || req.nextUrl.searchParams.get("matchId") || undefined;
    const found = await findEngagementById(cleanId, matchIdParam);

    if (!found?.item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const existing = found.item;
    const updatedItem: EngagementItem = {
      ...existing,
      ...body,
      id: cleanId,
      updatedAt: Date.now(),
    };

    await persistEngagementUpdate(cleanId, updatedItem, found.matchMomentsRecord);

    return NextResponse.json({
      success: true,
      message: "Engagement updated successfully",
      engagement: updatedItem,
    });
  } catch (error: unknown) {
    console.error("PUT /api/engagements/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to update engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/engagements/[id] — Delete engagement ─────────────────────────
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: rawId } = await params;
    const { searchParams } = new URL(req.url);
    const rawMatchId = searchParams.get("matchId");

    const cleanId = rawId.replace(/^ENGAGEMENT#/, "").replace(/^LOOP#/, "").trim();
    const cleanMatchId = rawMatchId ? rawMatchId.replace(/^MATCH#/, "").trim() : "";

    // 1. Delete from SocialAndContent table (with candidate table fallback)
    try {
      await dualDelete(
        "engagements",
        cleanId,
        TABLES.SocialAndContent,
        { contentId: `ENGAGEMENT#${cleanId}`, sk: "ENGAGEMENT#META" }
      );
    } catch (e) {
      console.warn("Notice deleting from SocialAndContent:", e);
    }

    // 2. Delete from MatchMoments table (MatchMoments-dev, MatchMoments-release, MatchMoments)
    try {
      const matchMomentTables = getCandidateTableNames(TABLES.MatchMoments);
      for (const table of matchMomentTables) {
        try {
          if (cleanMatchId) {
            await docClient.send(
              new DeleteCommand({
                TableName: table,
                Key: {
                  entityId: `MATCH#${cleanMatchId}`,
                  sk: `LOOP#${cleanId}`,
                },
              })
            );
          }

          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: table,
              FilterExpression:
                "sk = :loopSk OR begins_with(sk, :loopPfx) OR id = :cid OR loopId = :cid OR contentId = :engCid",
              ExpressionAttributeValues: {
                ":loopSk": `LOOP#${cleanId}`,
                ":loopPfx": `LOOP#${cleanId}`,
                ":cid": cleanId,
                ":engCid": `ENGAGEMENT#${cleanId}`,
              },
              Limit: 50,
            })
          );

          if (scanRes.Items && scanRes.Items.length > 0) {
            for (const item of scanRes.Items) {
              if (item.entityId && item.sk) {
                await docClient.send(
                  new DeleteCommand({
                    TableName: table,
                    Key: {
                      entityId: item.entityId,
                      sk: item.sk,
                    },
                  })
                );
              }
            }
          }
        } catch (tblErr) {
          // Continue to next candidate table
        }
      }
    } catch (mmErr) {
      console.warn("Notice deleting from MatchMoments:", mmErr);
    }

    // 3. Delete from Firestore match_moments_engagements collection if exists
    try {
      if (db) {
        const col = getFirestoreCollection("match_moments_engagements");
        const snap = await db.collection(col).where("id", "==", cleanId).get();
        for (const doc of snap.docs) {
          await doc.ref.delete();
        }
        if (cleanMatchId) {
          await db.collection(col).doc(`${cleanMatchId}_${cleanId}`).delete().catch(() => {});
        }
      }
    } catch {}

    return NextResponse.json({ success: true, message: "Engagement deleted successfully" });
  } catch (error: unknown) {
    console.error("DELETE /api/engagements/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete engagement";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
