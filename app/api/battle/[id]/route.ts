// app/api/battle/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type BattleType = "PLAYERS" | "CLUBS";

interface InvitedFriend {
  email: string;
  name: string;
}

function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// ─── GET: Fetch battle by ID ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Battle ID is required" }, { status: 400 });
    }

    let battleData: Record<string, unknown> | null = null;

    // 1. Query DynamoDB SocialAndContent table
    try {
      const candidates = [`BATTLE#${id}`, id];
      for (const cand of candidates) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "SocialAndContent",
            KeyConditionExpression: "contentId = :c",
            ExpressionAttributeValues: { ":c": cand },
            Limit: 1,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          battleData = qRes.Items[0];
          break;
        }
      }
    } catch (err) {
      console.warn("DynamoDB battle query notice:", err);
    }

    // 2. Fallback to Firebase
    if (!battleData) {
      try {
        const docRef = db.collection("fanBattles").doc(id);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          battleData = { id: docSnap.id, ...docSnap.data() };
        }
      } catch (fbErr) {
        console.warn("Firebase battle fetch fallback notice:", fbErr);
      }
    }

    if (!battleData) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      battle: {
        id: (battleData.contentId as string)?.replace(/^BATTLE#/, "") || battleData.battleId || id,
        ...battleData,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/battle/[id] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT: Update a battle ─────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Battle ID is required" }, { status: 400 });
    }

    const body = await req.json();
    const {
      battleName,
      battleType,
      selectedPlayers,
      selectedClubs,
      invitedFriends,
      userName,
    } = body;

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (battleName !== undefined) {
      if (typeof battleName !== "string" || !battleName.trim()) {
        return NextResponse.json({ error: "battleName must be a non-empty string" }, { status: 400 });
      }
      updates.battleName = battleName.trim();
    }

    if (battleType !== undefined) {
      const validTypes: BattleType[] = ["PLAYERS", "CLUBS"];
      if (!validTypes.includes(battleType)) {
        return NextResponse.json({ error: "battleType must be PLAYERS or CLUBS" }, { status: 400 });
      }
      updates.battleType = battleType;
    }

    if (selectedPlayers !== undefined) {
      if (!Array.isArray(selectedPlayers)) {
        return NextResponse.json({ error: "selectedPlayers must be an array" }, { status: 400 });
      }
      updates.selectedPlayers = selectedPlayers;
    }

    if (selectedClubs !== undefined) {
      if (!Array.isArray(selectedClubs)) {
        return NextResponse.json({ error: "selectedClubs must be an array" }, { status: 400 });
      }
      updates.selectedClubs = selectedClubs;
    }

    if (invitedFriends !== undefined) {
      if (!Array.isArray(invitedFriends)) {
        return NextResponse.json({ error: "invitedFriends must be an array" }, { status: 400 });
      }
      updates.invitedFriends = invitedFriends;
    }

    if (userName !== undefined) {
      updates.userName = userName.trim();
    }

    // 1. Update in DynamoDB
    try {
      const candidates = [`BATTLE#${id}`, id];
      for (const cand of candidates) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "SocialAndContent",
            KeyConditionExpression: "contentId = :c",
            ExpressionAttributeValues: { ":c": cand },
            Limit: 1,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          const item = qRes.Items[0];
          await docClient.send(
            new UpdateCommand({
              TableName: "SocialAndContent",
              Key: {
                contentId: item.contentId as string,
                sk: item.sk as string,
              },
              UpdateExpression: "SET battleName = :bn, updatedAt = :u",
              ExpressionAttributeValues: {
                ":bn": updates.battleName || item.battleName,
                ":u": updates.updatedAt,
              },
            })
          );
          break;
        }
      }
    } catch (err) {
      console.warn("DynamoDB battle update notice:", err);
    }

    // 2. Sync to Firebase
    try {
      const docRef = db.collection("fanBattles").doc(id);
      await docRef.update(updates);
    } catch (fbErr) {
      console.warn("Firebase battle update notice:", fbErr);
    }

    return NextResponse.json({
      success: true,
      message: "Battle updated successfully",
      updates,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/battle/[id] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE: Remove a battle ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Battle ID is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB
    try {
      const candidates = [`BATTLE#${id}`, id];
      for (const cand of candidates) {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "SocialAndContent",
            KeyConditionExpression: "contentId = :c",
            ExpressionAttributeValues: { ":c": cand },
            Limit: 1,
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          const item = qRes.Items[0];
          await docClient.send(
            new DeleteCommand({
              TableName: "SocialAndContent",
              Key: {
                contentId: item.contentId as string,
                sk: item.sk as string,
              },
            })
          );
          break;
        }
      }
    } catch (err) {
      console.warn("DynamoDB battle delete notice:", err);
    }

    // 2. Delete from Firebase
    try {
      const docRef = db.collection("fanBattles").doc(id);
      await docRef.delete();
    } catch (fbErr) {
      console.warn("Firebase battle delete notice:", fbErr);
    }

    return NextResponse.json({
      success: true,
      message: `Battle ${id} deleted successfully`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/battle/[id] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}