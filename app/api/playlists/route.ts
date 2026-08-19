// app/api/playlists/route.ts — Migrated to AWS DynamoDB (UserData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

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
      let playlist: any = null;

      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "UserData",
            Key: { userId: `USER#${userId}`, sk: `PLAYLIST#${playlistId}` },
          })
        );
        if (getRes.Item) playlist = { id: playlistId, ...getRes.Item };
      } catch (e) {
        console.warn("[playlists GET single] DynamoDB notice:", e);
      }

      if (!playlist && db) {
        const doc = await db.collection("playlists").doc(playlistId).get();
        if (doc.exists) {
          const data = doc.data()!;
          if (data.userId === userId) {
            playlist = { id: doc.id, ...data };
          }
        }
      }

      if (!playlist) {
        return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        playlist,
      });
    }

    // All playlists for user
    let playlists: any[] = [];

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "UserData",
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :pfx)",
          ExpressionAttributeValues: {
            ":uid": `USER#${userId}`,
            ":pfx": "PLAYLIST#",
          },
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        playlists = qRes.Items.map((item) => ({
          id: item.id || (item.sk as string).replace(/^PLAYLIST#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[playlists GET all] DynamoDB notice:", e);
    }

    if (playlists.length === 0 && db) {
      const snapshot = await db
        .collection("playlists")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .get();

      playlists = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    playlists.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

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

    const now = Date.now();
    const id = `playlist_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const newPlaylist = {
      id,
      userId,
      name: name.trim(),
      audioIds: audioId ? [audioId] : [],
      createdAt: now,
      updatedAt: now,
    };

    // Dual-write
    await dualWrite({
      tableName: "UserData",
      dynamoItem: {
        ...newPlaylist,
        userId: `USER#${userId}`,
        sk: `PLAYLIST#${id}`,
      },
      firestoreRef: db.collection("playlists").doc(id),
      firestoreData: newPlaylist,
    });

    return NextResponse.json(
      {
        success: true,
        playlist: newPlaylist,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating playlist:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/playlists
// Body: { playlistId, userId, action, audioId?, name? }
// ─────────────────────────────────────────────────────────────────────────────
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

    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "UserData",
          Key: { userId: `USER#${userId}`, sk: `PLAYLIST#${playlistId}` },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing && db) {
      const doc = await db.collection("playlists").doc(playlistId).get();
      if (doc.exists) existing = doc.data();
    }

    if (!existing) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    if (existing.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = { updatedAt: Date.now() };

    if (action === "add") {
      if (!audioId) {
        return NextResponse.json({ error: "audioId is required for action 'add'" }, { status: 400 });
      }
      const currentIds: string[] = existing.audioIds || [];
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
      const currentIds: string[] = existing.audioIds || [];
      updatePayload.audioIds = currentIds.filter((id: string) => id !== audioId);
    }

    if (action === "rename") {
      if (!name?.trim()) {
        return NextResponse.json({ error: "name is required for action 'rename'" }, { status: 400 });
      }
      updatePayload.name = name.trim();
    }

    const updatedDoc = {
      ...existing,
      ...updatePayload,
      id: playlistId,
    };

    // Dual-write
    await dualWrite({
      tableName: "UserData",
      dynamoItem: {
        userId: `USER#${userId}`,
        sk: `PLAYLIST#${playlistId}`,
        ...updatedDoc,
      },
      firestoreRef: db.collection("playlists").doc(playlistId),
      firestoreData: updatePayload,
    });

    return NextResponse.json({
      success: true,
      playlist: updatedDoc,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating playlist:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/playlists?playlistId=xxx&userId=yyy
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

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "UserData",
          Key: { userId: `USER#${userId}`, sk: `PLAYLIST#${playlistId}` },
        })
      );
    } catch (e) {
      console.warn("[playlists DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const docRef = db.collection("playlists").doc(playlistId);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.delete();
      }
    }

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