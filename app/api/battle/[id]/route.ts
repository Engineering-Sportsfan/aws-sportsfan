import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

type BattleType = "PLAYERS" | "CLUBS";

interface InvitedFriend {
  email: string;
  name: string;
}

//  Helper: extract ID from URL 
function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET - Fetch single article by ID
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Battle ID is required" }, { status: 400 });
    }

    const docRef = db.collection("fanBattles").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      battle: { id: docSnap.id, ...docSnap.data() },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/battles/[id] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PUT — Update a battle ────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Battle ID is required" }, { status: 400 });
    }

    const docRef = db.collection("fanBattles").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
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

    // ── Build partial update object (only include provided fields) ──
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (battleName !== undefined) {
      if (typeof battleName !== "string" || !battleName.trim()) {
        return NextResponse.json(
          { error: "battleName must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.battleName = battleName.trim();
    }

    if (battleType !== undefined) {
      const validTypes: BattleType[] = ["PLAYERS", "CLUBS"];
      if (!validTypes.includes(battleType)) {
        return NextResponse.json(
          { error: "battleType must be PLAYERS or CLUBS" },
          { status: 400 }
        );
      }
      updates.battleType = battleType;
    }

    if (selectedPlayers !== undefined) {
      if (!Array.isArray(selectedPlayers)) {
        return NextResponse.json(
          { error: "selectedPlayers must be an array" },
          { status: 400 }
        );
      }
      updates.selectedPlayers = selectedPlayers;
    }

    if (selectedClubs !== undefined) {
      if (!Array.isArray(selectedClubs)) {
        return NextResponse.json(
          { error: "selectedClubs must be an array" },
          { status: 400 }
        );
      }
      updates.selectedClubs = selectedClubs;
    }

    if (invitedFriends !== undefined) {
      if (!Array.isArray(invitedFriends)) {
        return NextResponse.json(
          { error: "invitedFriends must be an array" },
          { status: 400 }
        );
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const friend of invitedFriends as InvitedFriend[]) {
        if (!friend.email || !friend.name) {
          return NextResponse.json(
            { error: "Each invitedFriend must have email and name" },
            { status: 400 }
          );
        }
        if (!emailRegex.test(friend.email)) {
          return NextResponse.json(
            { error: `Invalid email: ${friend.email}` },
            { status: 400 }
          );
        }
      }
      updates.invitedFriends = invitedFriends;
    }

    if (userName !== undefined) {
      if (typeof userName !== "string" || !userName.trim()) {
        return NextResponse.json(
          { error: "userName must be a non-empty string" },
          { status: 400 }
        );
      }
      updates.userName = userName.trim();
    }

    // ── Cross-field consistency check ──
    const resolvedType = (updates.battleType ?? docSnap.data()?.battleType) as BattleType;
    const resolvedPlayers = (updates.selectedPlayers ?? docSnap.data()?.selectedPlayers) as string[];
    const resolvedClubs = (updates.selectedClubs ?? docSnap.data()?.selectedClubs) as string[];

    if (resolvedType === "PLAYERS" && resolvedPlayers.length === 0) {
      return NextResponse.json(
        { error: "selectedPlayers cannot be empty when battleType is PLAYERS" },
        { status: 400 }
      );
    }

    if (resolvedType === "CLUBS" && resolvedClubs.length === 0) {
      return NextResponse.json(
        { error: "selectedClubs cannot be empty when battleType is CLUBS" },
        { status: 400 }
      );
    }

    await docRef.update(updates);
    const updated = await docRef.get();

    return NextResponse.json({
      success: true,
      battle: { id: updated.id, ...updated.data() },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/battles/[id] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE — Remove a battle 
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Battle ID is required" }, { status: 400 });
    }

    const docRef = db.collection("fanBattles").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: `Battle ${id} deleted successfully`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/battles/[id] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}