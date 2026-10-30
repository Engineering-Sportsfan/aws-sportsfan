// app/api/engagements/[id]/share/route.ts — Dynamic Share counter increment
import { NextRequest, NextResponse } from "next/server";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || req.nextUrl.searchParams.get("userId") || "").trim();
    const matchId = body?.matchId || req.nextUrl.searchParams.get("matchId") || undefined;

    const found = await findEngagementById(cleanId, matchId);

    if (!found?.item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const item = found.item;
    const sharedUsers: string[] = Array.isArray(item.sharedUsers) ? item.sharedUsers : [];
    const alreadyShared = Boolean(userId && sharedUsers.includes(userId));

    let newShares = Number(item.shares) || 0;
    if (!alreadyShared) {
      newShares += 1;
      if (userId) {
        sharedUsers.push(userId);
      }
      item.shares = newShares;
      item.sharedUsers = sharedUsers;
      item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
      item.updatedAt = Date.now();

      await persistEngagementUpdate(cleanId, item, found.matchMomentsRecord);
    }

    return NextResponse.json({
      success: true,
      sharesCount: newShares,
      shares: newShares,
      totalEngaged: Number(item.totalEngaged) || 0,
      alreadyShared,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/share error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record share";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
