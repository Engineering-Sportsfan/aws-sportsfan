import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

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

        if (includeNames) {
            const namesSnapshot = await db.collection("playlists").select("name").get();
            const names = Array.from(
                new Set(
                    namesSnapshot.docs
                        .map((doc) => String(doc.data().name || "").trim())
                        .filter(Boolean)
                )
            ).sort();

            return NextResponse.json({
                success: true,
                playlistNames: names,
            });
        }

        const snapshot = await db.collection("playlists")
            .orderBy("createdAt", "desc")
            .get();

        let playlists = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        })) as Playlist[];

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
            return NextResponse.json(
                { error: "playlistId is required" },
                { status: 400 }
            );
        }

        const docRef = db.collection("playlists").doc(playlistId);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
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
