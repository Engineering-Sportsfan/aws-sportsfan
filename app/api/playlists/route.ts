import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/playlists?userId=xxx
//   → returns all playlists for a user
// GET /api/playlists?userId=xxx&playlistId=yyy
//   → returns a single playlist with full audio details
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const playlistId = searchParams.get("playlistId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Single playlist fetch
    if (playlistId) {
      const doc = await db.collection("playlists").doc(playlistId).get();

      if (!doc.exists) {
        return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
      }

      const data = doc.data()!;

      if (data.userId !== userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }

      return NextResponse.json({
        success: true,
        playlist: { id: doc.id, ...data },
      });
    }

    // All playlists for user
    const snapshot = await db
      .collection("playlists")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();

    const playlists = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ success: true, playlists });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching playlists:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/playlists
// Body: { userId, name, audioId? }
//   → creates a new playlist, optionally adds first audioId
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, name, audioId } = body;

    if (!userId || !name?.trim()) {
      return NextResponse.json(
        { error: "userId and name are required" },
        { status: 400 }
      );
    }

    // Check for duplicate playlist name for same user
    const existing = await db
      .collection("playlists")
      .where("userId", "==", userId)
      .where("name", "==", name.trim())
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { error: "A playlist with this name already exists" },
        { status: 409 }
      );
    }

    const newPlaylist = {
      userId,
      name: name.trim(),
      audioIds: audioId ? [audioId] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("playlists").add(newPlaylist);

    return NextResponse.json(
      {
        success: true,
        playlist: { id: docRef.id, ...newPlaylist },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating playlist:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


// PUT /api/playlists
// Body: { playlistId, userId, action, audioId?, name? }

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { playlistId, userId, action, audioId, name } = body;

    if (!playlistId || !userId || !action) {
      return NextResponse.json(
        { error: "playlistId, userId, and action are required" },
        { status: 400 }
      );
    }

    const validActions = ["add", "remove", "rename"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: "action must be one of: add, remove, rename" },
        { status: 400 }
      );
    }

    const docRef = db.collection("playlists").doc(playlistId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const data = doc.data()!;

    if (data.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = { updatedAt: Date.now() };

    if (action === "add") {
      if (!audioId) {
        return NextResponse.json({ error: "audioId is required for action 'add'" }, { status: 400 });
      }
      const currentIds: string[] = data.audioIds || [];
      if (currentIds.includes(audioId)) {
        return NextResponse.json(
          { error: "Audio already in playlist" },
          { status: 409 }
        );
      }
      updatePayload.audioIds = [...currentIds, audioId];
    }

    if (action === "remove") {
      if (!audioId) {
        return NextResponse.json({ error: "audioId is required for action 'remove'" }, { status: 400 });
      }
      const currentIds: string[] = data.audioIds || [];
      updatePayload.audioIds = currentIds.filter((id) => id !== audioId);
    }

    if (action === "rename") {
      if (!name?.trim()) {
        return NextResponse.json({ error: "name is required for action 'rename'" }, { status: 400 });
      }
      // Check duplicate name
      const existing = await db
        .collection("playlists")
        .where("userId", "==", userId)
        .where("name", "==", name.trim())
        .get();

      if (!existing.empty && existing.docs[0].id !== playlistId) {
        return NextResponse.json(
          { error: "A playlist with this name already exists" },
          { status: 409 }
        );
      }
      updatePayload.name = name.trim();
    }

    await docRef.update(updatePayload);

    const updated = await docRef.get();

    return NextResponse.json({
      success: true,
      playlist: { id: updated.id, ...updated.data() },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating playlist:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/playlists?playlistId=xxx&userId=yyy
//   → deletes the entire playlist
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playlistId = searchParams.get("playlistId");
    const userId = searchParams.get("userId");

    if (!playlistId || !userId) {
      return NextResponse.json(
        { error: "playlistId and userId are required" },
        { status: 400 }
      );
    }

    const docRef = db.collection("playlists").doc(playlistId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    if (doc.data()!.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: "Playlist deleted successfully",
      deletedId: playlistId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting playlist:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}