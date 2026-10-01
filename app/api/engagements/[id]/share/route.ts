// app/api/engagements/[id]/share/route.ts — Dynamic Share counter increment
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").trim();

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || req.nextUrl.searchParams.get("userId") || "").trim();

    let item: any = null;
    const candidateTables = getCandidateTableNames(TABLES.SocialAndContent);
    for (const table of candidateTables) {
      if (item) break;
      for (const cid of [`ENGAGEMENT#${cleanId}`, cleanId]) {
        try {
          const getRes = await docClient.send(
            new GetCommand({
              TableName: table,
              Key: { contentId: cid, sk: "ENGAGEMENT#META" },
            })
          );
          if (getRes.Item) {
            item = getRes.Item;
            break;
          }
        } catch {}
      }
    }

    if (!item && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).doc(cleanId).get();
        if (snap.exists) item = { id: snap.id, ...snap.data() };
      } catch {}
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

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
      item.updatedAt = Date.now();

      const dynamoItem = {
        contentId: `ENGAGEMENT#${cleanId}`,
        sk: "ENGAGEMENT#META",
        entityId: `ENGAGEMENT#${String(item.type || "").toUpperCase()}`,
        ...item,
        id: cleanId,
      };

      await dualWrite("engagements", cleanId, TABLES.SocialAndContent, dynamoItem);
    }

    return NextResponse.json({
      success: true,
      sharesCount: newShares,
      totalEngaged: Number(item.totalEngaged) || 0,
      alreadyShared,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/share error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record share";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
