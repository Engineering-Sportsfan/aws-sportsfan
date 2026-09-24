// app/api/engagements/[id]/route.ts — Single Engagement GET, PUT/PATCH, DELETE
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementItem } from "@/types/engagements";

import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id] ────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    let item: any = null;

    // Try DynamoDB first with candidate table fallback
    const candidateTables = getCandidateTableNames(TABLES.SocialAndContent);
    for (const table of candidateTables) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: table,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
          })
        );
        if (getRes.Item) {
          item = getRes.Item;
          break;
        }
      } catch (dynErr: any) {
        const isTableMissing =
          dynErr?.name === "ResourceNotFoundException" ||
          dynErr?.message?.includes("Cannot do operations on a non-existent table") ||
          dynErr?.message?.includes("ResourceNotFoundException");
        if (isTableMissing) continue;
        console.warn(`DynamoDB get engagement notice on "${table}":`, dynErr?.message || dynErr);
      }
    }

    // Fallback to Firestore
    if (!item) {
      const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
      if (snap.exists) {
        item = { id: snap.id, ...snap.data() };
      }
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    // Hydrate user interaction state (userLiked, userVoted, userVote) matching api/roar pattern
    const authUser = await getUser(req);
    const resolvedUserId = authUser?.userId || authUser?.email || searchParams.get("userId");

    if (resolvedUserId) {
      try {
        const [likeRes, voteRes, userMarkerRes] = await Promise.all([
          docClient
            .send(
              new GetCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: `ENGAGEMENT#${id}`, sk: `LIKE#${resolvedUserId}` },
              })
            )
            .catch(() => ({ Item: null })),
          docClient
            .send(
              new GetCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${resolvedUserId}` },
              })
            )
            .catch(() => ({ Item: null })),
          docClient
            .send(
              new GetCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: `ENGAGEMENT#${id}`, sk: `USER#${resolvedUserId}` },
              })
            )
            .catch(() => ({ Item: null })),
        ]);

        item = {
          ...item,
          userLiked: !!likeRes?.Item,
          userVoted: !!voteRes?.Item || !!userMarkerRes?.Item,
          userVote: voteRes?.Item?.selectedOptionId ?? userMarkerRes?.Item?.selectedOptionId ?? null,
        };
      } catch (hydrationErr) {
        console.warn("Single engagement user hydration notice:", hydrationErr);
      }
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

    // Fetch existing
    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing) {
      const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
      if (snap.exists) existing = { id: snap.id, ...snap.data() };
    }

    if (!existing) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    const updatedItem: EngagementItem = {
      ...existing,
      ...body,
      id,
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${(updatedItem.type || existing.type).toUpperCase()}`,
      ...updatedItem,
    };

    await dualWrite("engagements", id, TABLES.SocialAndContent, dynamoItem);

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
    const { id } = await params;

    await dualDelete(
      "engagements",
      id,
      TABLES.SocialAndContent,
      { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" }
    );

    return NextResponse.json({ success: true, message: "Engagement deleted successfully" });
  } catch (error: unknown) {
    console.error("DELETE /api/engagements/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete engagement";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
