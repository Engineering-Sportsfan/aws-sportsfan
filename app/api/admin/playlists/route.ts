// api/admin/playlists/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface Playlist {
  id: string;
  userId: string;
  name: string;
  audioIds?: string[];
  createdAt: number;
  updatedAt: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const searchQuery = searchParams.get("search")?.trim().toLowerCase() || "";
    const userId = searchParams.get("userId")?.trim().toLowerCase() || "";
    const playlistName = searchParams.get("playlistName")?.trim().toLowerCase() || "";
    const includeNames = searchParams.get("includeNames") === "true";

    let playlists: Playlist[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan first
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "UserData",
        FilterExpression: "begins_with(sk, :p)",
        ExpressionAttributeValues: { ":p": "PLAYLIST#" }
      }));

      if (scanRes.Items && scanRes.Items.length > 0) {
        playlists = scanRes.Items.map(item => ({
          id: item.id || (item.sk as string).replace(/^PLAYLIST#/, ""),
          userId: (item.userId as string).replace(/^USER#/, ""),
          name: item.name || "",
          audioIds: item.audioIds || [],
          createdAt: item.createdAt || Date.now(),
          updatedAt: item.updatedAt || Date.now()
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[AdminPlaylists GET] DynamoDB scan failed, falling back:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || playlists.length === 0) {
      try {
        const snapshot = await db.collection("playlists").orderBy("createdAt", "desc").get();
        playlists = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        }));
      } catch (fsErr) {
        console.error("[AdminPlaylists GET] Firestore fallback failed:", fsErr);
      }
    }

    if (includeNames) {
      const names = Array.from(
        new Set(
          playlists
            .map((p) => String(p.name || "").trim())
            .filter(Boolean)
        )
      ).sort();

      return NextResponse.json({
        success: true,
        playlistNames: names,
      });
    }

    if (searchQuery) {
      playlists = playlists.filter((playlist) => {
        const name = String(playlist.name || "").toLowerCase();
        const owner = String(playlist.userId || "").toLowerCase();
        const audioCount = String(playlist.audioIds?.length || 0);
        return (
          name.includes(searchQuery) ||
          owner.includes(searchQuery) ||
          audioCount.includes(searchQuery)
        );
      });
    }

    if (userId) {
      playlists = playlists.filter((playlist) =>
        String(playlist.userId || "").trim().toLowerCase().includes(userId)
      );
    }

    if (playlistName) {
      playlists = playlists.filter((playlist) =>
        String(playlist.name || "").trim().toLowerCase().includes(playlistName)
      );
    }

    // Sort by createdAt desc
    playlists.sort((a, b) => b.createdAt - a.createdAt);

    const pagedPlaylists = playlists.slice(0, limit);

    return NextResponse.json({
      success: true,
      playlists: pagedPlaylists,
      pagination: {
        limit,
        hasMore: playlists.length > limit,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching playlists:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playlistId = searchParams.get("playlistId");

    if (!playlistId) {
      return NextResponse.json({ error: "playlistId is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB first
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "UserData",
        FilterExpression: "sk = :sk OR id = :pid",
        ExpressionAttributeValues: {
          ":sk": `PLAYLIST#${playlistId}`,
          ":pid": playlistId
        }
      }));

      const playlistItem = scanRes.Items?.[0];
      if (playlistItem) {
        await docClient.send(new DeleteCommand({
          TableName: "UserData",
          Key: { userId: playlistItem.userId, sk: playlistItem.sk }
        }));
      }
    } catch (dynErr) {
      console.warn("[AdminPlaylists DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("playlists").doc(playlistId);
      await docRef.delete();
    } catch (fsErr) {
      console.warn("[AdminPlaylists DELETE] Firestore fallback delete failed:", fsErr);
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
