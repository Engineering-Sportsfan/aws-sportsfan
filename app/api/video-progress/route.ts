// app/api/video-progress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";


export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const userId = searchParams.get("userId");
        const videoId = searchParams.get("videoId");

        if (!userId) {
            return NextResponse.json(
                { success: false, error: "userId is required" },
                { status: 400 }
            );
        }

        // Fetch single video progress
        if (videoId) {
            const doc = await db
                .collection("videoProgress")
                .doc(userId)
                .collection("videos")
                .doc(encodeURIComponent(videoId))
                .get();

            if (!doc.exists) {
                return NextResponse.json({ success: true, progress: null });
            }

            return NextResponse.json({ success: true, progress: doc.data() });
        }

        // Fetch all in-progress videos for user (for Continue Watching)
        const snapshot = await db
            .collection("videoProgress")
            .doc(userId)
            .collection("videos")
            .where("pct", ">", 2)
            .where("pct", "<", 95)
            .orderBy("pct")
            .orderBy("pausedAt", "desc")
            .limit(10)
            .get();

        const progress = snapshot.docs.map((doc) => doc.data());

        return NextResponse.json({ success: true, progress });
    } catch (error) {
        console.error("Error fetching video progress:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to fetch progress",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

// ─── POST: Save/update progress ───────────────────────────────────────────────
// Body: { userId, videoId, title, subtitle, elapsed, durationSeconds, pct, url }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, videoId, title, subtitle, elapsed, durationSeconds, pct, url } = body;

        if (!userId || !videoId) {
            return NextResponse.json(
                { success: false, error: "userId and videoId are required" },
                { status: 400 }
            );
        }

        // If video is >95% watched — clear progress (treat as finished)
        if (pct >= 95) {
            await db
                .collection("videoProgress")
                .doc(userId)
                .collection("videos")
                .doc(encodeURIComponent(videoId))
                .delete();

            return NextResponse.json({ success: true, message: "Progress cleared — video finished" });
        }

        const progressData = {
            videoId,
            title,
            subtitle: subtitle || "",
            elapsed: elapsed || 0,
            durationSeconds: durationSeconds || 0,
            pct: pct || 0,
            url,
            pausedAt: Date.now(),
        };

        await db
            .collection("videoProgress")
            .doc(userId)
            .collection("videos")
            .doc(encodeURIComponent(videoId))
            .set(progressData, { merge: true });

        return NextResponse.json({ success: true, progress: progressData });
    } catch (error) {
        console.error("Error saving video progress:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to save progress",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

// ─── DELETE: Clear progress for a specific video ─────────────────────────────
// DELETE /api/cloudinary/video-progress?userId=xxx&videoId=sf360/video/bumrah_chapter-1
export async function DELETE(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const userId = searchParams.get("userId");
        const videoId = searchParams.get("videoId");

        if (!userId || !videoId) {
            return NextResponse.json(
                { success: false, error: "userId and videoId are required" },
                { status: 400 }
            );
        }

        await db
            .collection("videoProgress")
            .doc(userId)
            .collection("videos")
            .doc(encodeURIComponent(videoId))
            .delete();

        return NextResponse.json({ success: true, message: "Progress cleared" });
    } catch (error) {
        console.error("Error clearing video progress:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to clear progress",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}