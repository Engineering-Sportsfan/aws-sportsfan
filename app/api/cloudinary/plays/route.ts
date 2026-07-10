// app/api/cloudinary/plays/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// Single Firestore doc: appData/plays
// Stores: { "sf360/audio/some-track": 12, "sf360/video/some-video": 7, ... }
const PLAYS_DOC = db.collection("appData").doc("plays");

// ─── GET: Return all play counts ──────────────────────────────────────────────
export async function GET() {
    try {
        const doc = await PLAYS_DOC.get();
        const plays: Record<string, number> = doc.exists
            ? (doc.data() as Record<string, number>)
            : {};

        return NextResponse.json({ success: true, plays });
    } catch (error) {
        console.error("[plays] GET error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch plays" },
            { status: 500 }
        );
    }
}

// ─── POST: Atomically increment play count ────────────────────────────────────
// Body: { id: string }
export async function POST(req: NextRequest) {
    try {
        const { id } = await req.json();

        if (!id) {
            return NextResponse.json(
                { success: false, error: "id is required" },
                { status: 400 }
            );
        }

        // FieldValue.increment is atomic — safe under concurrent serverless requests
        await PLAYS_DOC.set(
            { [id]: FieldValue.increment(1) },
            { merge: true }
        );

        // Read back updated count for this id only
        const doc = await PLAYS_DOC.get();
        const plays = doc.exists ? (doc.data() as Record<string, number>) : {};

        return NextResponse.json({ success: true, plays: plays[id] ?? 1 });
    } catch (error) {
        console.error("[plays] POST error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to increment plays" },
            { status: 500 }
        );
    }
}