// app/api/engagements/[id]/share/route.ts — Dynamic Share counter increment
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    let item: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) item = getRes.Item;
    } catch {}

    if (!item && db) {
      const snap = await db.collection("engagements").doc(id).get();
      if (snap.exists) item = { id: snap.id, ...snap.data() };
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const newShares = (Number(item.shares) || 0) + 1;
    const newTotalEngaged = (Number(item.totalEngaged) || 0) + 1;
    item.shares = newShares;
    item.totalEngaged = newTotalEngaged;
    item.updatedAt = Date.now();

    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${String(item.type || "").toUpperCase()}`,
      ...item,
    };

    await dualWrite("engagements", id, "SocialAndContent", dynamoItem);

    return NextResponse.json({
      success: true,
      sharesCount: newShares,
      totalEngaged: newTotalEngaged,
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/share error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record share";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
