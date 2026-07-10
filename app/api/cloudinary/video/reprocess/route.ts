// app/api/cloudinary/video/reprocess/route.ts
// ONE-TIME endpoint — call this once to force Cloudinary to extract
// duration metadata for all existing videos that have durationSeconds = 0
import { NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

export async function POST() {
    try {
        // Fetch all videos in the folder
        const result = await cloudinary.api.resources({
            resource_type: "video",
            type: "upload",
            prefix: "sf360/video",
            max_results: 500,
            video_metadata: true,
        });

        const missing = result.resources.filter(
            (r: { duration?: number }) => !r.duration || r.duration === 0
        );

        if (missing.length === 0) {
            return NextResponse.json({
                success: true,
                message: "All videos already have duration metadata.",
                total: result.resources.length,
            });
        }

        // Call cloudinary.uploader.explicit() on each — this forces Cloudinary
        // to re-read the video file and store its metadata (including duration)
        const updates = await Promise.allSettled(
            missing.map((r: { public_id: string }) =>
                cloudinary.uploader.explicit(r.public_id, {
                    resource_type: "video",
                    type: "upload",
                })
            )
        );

        const succeeded = updates.filter((u) => u.status === "fulfilled").length;
        const failed    = updates.filter((u) => u.status === "rejected").length;

        return NextResponse.json({
            success: true,
            message: `Reprocessed ${succeeded} video(s). ${failed} failed.`,
            total: result.resources.length,
            reprocessed: succeeded,
            failed,
        });
    } catch (error) {
        console.error("[reprocess] error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to reprocess videos",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}