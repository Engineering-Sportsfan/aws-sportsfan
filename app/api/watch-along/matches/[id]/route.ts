// app/api/watch-along/matches/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserSessionAndRole } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

// ─────────────────────────────────────────────
// GET  /api/watch-along/matches/[id]
// ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let matchData: any = null;

    // 1. Query DynamoDB SportsData
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `MATCH#${id}`, sk: "MATCH#META" },
        })
      );
      if (getRes.Item) matchData = { id, ...getRes.Item };
    } catch (e) {
      // fallback
    }

    // 2. Fallback to Firestore
    if (!matchData) {
      const doc = await db.collection("watchAlongMatches").doc(id).get();
      if (!doc.exists) {
        return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
      }
      matchData = { id: doc.id, ...doc.data() };
    }

    return NextResponse.json({ success: true, match: matchData });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// PUT  /api/watch-along/matches/[id]
// ─────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const authorizedRoles = ["super_admin", "admin"];
    if (!authorizedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    let existingData: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SportsData",
          Key: { entityId: `MATCH#${id}`, sk: "MATCH#META" },
        })
      );
      if (getRes.Item) existingData = getRes.Item;
    } catch (e) {
      // fallback
    }

    if (!existingData) {
      const docRef = db.collection("watchAlongMatches").doc(id);
      const existing = await docRef.get();
      if (!existing.exists) {
        return NextResponse.json({ success: false, message: "Match not found" }, { status: 404 });
      }
      existingData = existing.data();
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (body.matchNo !== undefined) updates.matchNo = Number(body.matchNo);
    if (body.tournament !== undefined) updates.tournament = body.tournament;
    if (body.stadium !== undefined) updates.stadium = body.stadium;
    if (body.isLive !== undefined) updates.isLive = Boolean(body.isLive);

    if (body.team1) {
      const prev = (existingData?.team1 || {}) as Record<string, string>;
      updates.team1 = { ...prev, ...body.team1 };
    }
    if (body.team2) {
      const prev = (existingData?.team2 || {}) as Record<string, string>;
      updates.team2 = { ...prev, ...body.team2 };
    }

    const finalMatch = {
      ...existingData,
      ...updates,
      id,
    };

    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `MATCH#${id}`,
        sk: "MATCH#META",
        ...finalMatch,
      },
      firestoreRef: db.collection("watchAlongMatches").doc(id),
      firestoreData: updates,
    });

    return NextResponse.json({ success: true, match: finalMatch });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// DELETE  /api/watch-along/matches/[id]
// ─────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const authorizedRoles = ["super_admin", "admin"];
    if (!authorizedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "SportsData",
          Key: { entityId: `MATCH#${id}`, sk: "MATCH#META" },
        })
      );
    } catch (e) {
      console.warn("[watch-along/matches/[id] DELETE] DynamoDB notice:", e);
    }

    // 2. Delete from Firestore
    try {
      await db.collection("watchAlongMatches").doc(id).delete();
    } catch (e) {
      console.warn("[watch-along/matches/[id] DELETE] Firestore notice:", e);
    }

    return NextResponse.json({ success: true, message: "Match deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
