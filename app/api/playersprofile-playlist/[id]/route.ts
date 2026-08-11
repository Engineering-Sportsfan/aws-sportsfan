// app/api/playersprofile-playlist/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import cloudinary from "@/lib/cloudinary";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let playlist: any = null;

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `PLAYER_PLAYLIST#${id}`, sk: "PLAYLIST#META" },
        })
      );
      if (getRes.Item) playlist = { id, ...getRes.Item };
    } catch (e) {
      console.warn("[playersprofile-playlist [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!playlist && db) {
      const doc = await db.collection("playerProfilePlaylists").doc(id).get();
      if (doc.exists) {
        playlist = { id: doc.id, ...doc.data() };
      }
    }

    if (!playlist) {
      return NextResponse.json(
        { success: false, message: "Playlist not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      playlist,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch playlist: " + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `PLAYER_PLAYLIST#${id}`, sk: "PLAYLIST#META" },
        })
      );
      if (getRes.Item) existing = getRes.Item;
    } catch {}

    if (!existing && db) {
      const doc = await db.collection("playerProfilePlaylists").doc(id).get();
      if (doc.exists) existing = doc.data();
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Playlist not found" },
        { status: 404 }
      );
    }

    const formData = await req.formData();
    // Parse update fields if needed or handle simple updates
    const updateData: Record<string, any> = {
      updatedAt: Date.now(),
    };

    const updatedDoc = {
      ...existing,
      ...updateData,
      id,
    };

    // Dual-write
    await dualWrite({
      tableName: "SocialAndContent",
      dynamoItem: {
        contentId: `PLAYER_PLAYLIST#${id}`,
        sk: "PLAYLIST#META",
        ...updatedDoc,
      },
      firestoreRef: db.collection("playerProfilePlaylists").doc(id),
      firestoreData: updateData,
    });

    return NextResponse.json({
      success: true,
      playlist: updatedDoc,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Failed to update playlist: " + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `PLAYER_PLAYLIST#${id}`, sk: "PLAYLIST#META" },
        })
      );
    } catch (e) {
      console.warn("[playersprofile-playlist [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const docRef = db.collection("playerProfilePlaylists").doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.delete();
      }
    }

    return NextResponse.json({
      success: true,
      message: "Playlist deleted successfully",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Failed to delete playlist: " + (error as Error).message },
      { status: 500 }
    );
  }
}