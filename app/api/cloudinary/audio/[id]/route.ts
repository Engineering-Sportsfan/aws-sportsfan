// app/api/cloudinary/audio/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";


function getIdFromUrl(req: NextRequest): string | null {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    return pathParts[pathParts.length - 1] || null;
}

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        console.log("Full URL:", req.url);
        console.log("Pathname:", url.pathname);
        const id = getIdFromUrl(req);

        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }


        const publicId = decodeURIComponent(id);


        const result = await cloudinary.api.resource(publicId, {
            resource_type: "video"
        });

        const formatDuration = (seconds: number): string => {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        };

        const audioData = {
            id: result.public_id,
            title: result.public_id.split('/').pop()?.replace(/_/g, ' ').replace(/\.mp3$/, ''),
            url: result.secure_url,
            duration: formatDuration(result.duration || 0),
            durationSeconds: result.duration || 0,
            size: result.bytes,
            format: result.format,
            createdAt: result.created_at,
            folder: result.public_id.split('/').slice(0, -1).join('/')
        };

        return NextResponse.json({
            success: true,
            audio: audioData
        });

    } catch (error) {
        console.error("Error fetching audio:", error);
        return NextResponse.json(
            { success: false, error: "Audio not found" },
            { status: 404 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const id = getIdFromUrl(req);

        if (!id) {
            return NextResponse.json({ error: "ID required" }, { status: 400 });
        }

        const publicId = decodeURIComponent(id);

        // For Cloudinary, audio files are treated as 'video' resource_type
        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: "video"
        });

        if (result.result === 'ok') {
            return NextResponse.json({ success: true, message: "Audio deleted successfully" });
        } else if (result.result === 'not found') {
            return NextResponse.json({ success: false, error: "Audio not found" }, { status: 404 });
        } else {
            return NextResponse.json({ success: false, error: "Failed to delete audio" }, { status: 400 });
        }
    } catch (error) {
        console.error("Error deleting audio:", error);
        return NextResponse.json(
            { success: false, error: "Internal Server Error" },
            { status: 500 }
        );
    }
}