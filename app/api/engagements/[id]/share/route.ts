// app/api/engagements/[id]/share/route.ts — Share counter (one share per user)
import { NextRequest, NextResponse } from "next/server";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { countRecords } from "@/lib/engagementSocial";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const clean = (id: string) =>
  String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

// ─── GET: has this user shared + current share count ───
export async function GET(req: NextRequest, { params }: RouteParams) {
  const cleanId = clean((await params).id);
  const authUser = await getUser(req);
  const userId = authUser?.userId || authUser?.email || req.nextUrl.searchParams.get("userId");

  const shares = await countRecords(cleanId, "SHARE#").catch(() => 0);
  let shared = false;
  if (userId) {
    const r = await docClient
      .send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: `SHARE#${userId}` },
        })
      )
      .catch(() => null);
    shared = !!r?.Item;
  }
  return NextResponse.json({ shared, shares });
}

// ─── POST: record a share (idempotent per user) ───
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const cleanId = clean((await params).id);
    const body = await req.json().catch(() => ({}));
    const authUser = await getUser(req);
    const userId = authUser?.userId || authUser?.email || String(body?.userId || "").trim();
    const matchId = body?.matchId || req.nextUrl.searchParams.get("matchId") || undefined;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    const now = Date.now();
    let alreadyShared = false;
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `ENGAGEMENT#${cleanId}`,
            sk: `SHARE#${userId}`,
            entityId: "SHARE#ENGAGEMENT",
            userId,
            engagementId: cleanId,
            sharedAt: now,
            createdAt: now,
          },
          // one share per user, enforced by the database itself
          ConditionExpression: "attribute_not_exists(sk)",
        })
      );
    } catch (e: any) {
      if (e?.name === "ConditionalCheckFailedException") alreadyShared = true;
      else throw e;
    }

    const shares = await countRecords(cleanId, "SHARE#");

    let totalEngaged = 0;
    try {
      const found = await findEngagementById(cleanId, matchId);
      if (found?.item) {
        found.item.shares = shares;
        if (!alreadyShared) found.item.totalEngaged = (Number(found.item.totalEngaged) || 0) + 1;
        found.item.updatedAt = now;
        totalEngaged = Number(found.item.totalEngaged) || 0;
        await persistEngagementUpdate(cleanId, found.item, found.matchMomentsRecord);
      }
    } catch (e) {
      console.warn("share mirror notice:", e);
    }

    return NextResponse.json({
      success: true,
      shares,
      sharesCount: shares,
      totalEngaged,
      alreadyShared,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/share error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record share";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}