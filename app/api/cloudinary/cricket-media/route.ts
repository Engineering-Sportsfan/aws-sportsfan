import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

const FOLDER = "IndvsSl"; // fixed folder under Home (Dynamic Folders mode)

interface CloudinaryResource {
    public_id: string;
    secure_url: string;
    duration?: number;
    width?: number;
    height?: number;
    created_at: string;
    bytes: number;
    format: string;
    display_name?: string;
    resource_type: string;
    context?: { custom?: Record<string, string> };
}

interface MediaItem {
    id: string;
    title: string;
    fileName: string;
    url: string;
    thumbnailUrl: string;
    resourceType: "image" | "video";
    width?: number;
    height?: number;
    duration?: string;
    durationSeconds?: number;
    size: number;
    sizeFormatted: string;
    format: string;
    createdAt: string;
    createdAtFormatted: string;
}

function formatDuration(seconds?: number): string | undefined {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return undefined;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function mapResource(resource: CloudinaryResource): MediaItem {
    const fileName =
        resource.display_name || resource.public_id.split("/").pop() || resource.public_id;

    const isVideo = resource.resource_type === "video";

    const thumbnailUrl = isVideo
        ? cloudinary.url(resource.public_id, {
              resource_type: "video",
              format: "jpg",
              transformation: [{ width: 400, height: 300, crop: "fill" }],
          })
        : cloudinary.url(resource.public_id, {
              resource_type: "image",
              transformation: [{ width: 400, height: 300, crop: "fill" }],
          });

    // Force browser-playable mp4 for video delivery; images use secure_url as-is
    const deliveryUrl = isVideo
        ? cloudinary.url(resource.public_id, {
              resource_type: "video",
              format: "mp4",
              transformation: [{ quality: "auto" }],
          })
        : resource.secure_url;

    return {
        id: resource.public_id,
        title: fileName.replace(/_/g, " "),
        fileName,
        url: deliveryUrl,
        thumbnailUrl,
        resourceType: resource.resource_type as "image" | "video",
        width: resource.width,
        height: resource.height,
        duration: formatDuration(resource.duration),
        durationSeconds: resource.duration,
        size: resource.bytes,
        sizeFormatted: formatFileSize(resource.bytes),
        format: resource.format,
        createdAt: resource.created_at,
        createdAtFormatted: formatDate(resource.created_at),
    };
}

// ---------- GET: list all media (images + videos) in IndvsSl ----------
// Uses the Search API (not resources+prefix) because this account uses
// Cloudinary Dynamic Folders, where assets live under `asset_folder`
// rather than a folder-prefixed public_id.
export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const search = searchParams.get("search")?.toLowerCase();
        const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

        const [images, videos] = await Promise.all([
            cloudinary.search
                .expression(`asset_folder:"${FOLDER}" AND resource_type:image`)
                .max_results(limit)
                .with_field("context")
                .execute(),
            cloudinary.search
                .expression(`asset_folder:"${FOLDER}" AND resource_type:video`)
                .max_results(limit)
                .with_field("context")
                .execute(),
        ]);

        let mediaFiles: MediaItem[] = [
            ...images.resources.map((r: CloudinaryResource) => mapResource(r)),
            ...videos.resources.map((r: CloudinaryResource) => mapResource(r)),
        ];

        if (search) {
            mediaFiles = mediaFiles.filter((m) => m.title.toLowerCase().includes(search));
        }

        mediaFiles.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return NextResponse.json({
            success: true,
            mediaFiles,
            totalCount: mediaFiles.length,
            folder: FOLDER,
        });
    } catch (error) {
        console.error("Error fetching cricket media:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to fetch media",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

// ---------- POST: upload new media ----------
// multipart/form-data: file, fileName?
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const fileName = formData.get("fileName") as string | null;

        if (!file) {
            return NextResponse.json(
                { success: false, error: "`file` is required" },
                { status: 400 }
            );
        }

        const isVideo = file.type.startsWith("video/");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

        const uploadResult = await cloudinary.uploader.upload(base64, {
            resource_type: isVideo ? "video" : "image",
            asset_folder: FOLDER, // Dynamic Folders field (replaces `folder`)
            display_name: fileName || file.name,
            use_filename: true,
            unique_filename: true,
            overwrite: false,
        });

        return NextResponse.json({
            success: true,
            media: mapResource(uploadResult as unknown as CloudinaryResource),
        });
    } catch (error) {
        console.error("Error uploading cricket media:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to upload media",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

// ---------- PUT: rename media ----------
// JSON: { publicId, resourceType, newFileName }
export async function PUT(req: NextRequest) {
    try {
        const { publicId, resourceType = "image", newFileName } = await req.json();

        if (!publicId || !newFileName) {
            return NextResponse.json(
                { success: false, error: "`publicId` and `newFileName` are required" },
                { status: 400 }
            );
        }

        const renameResult = await cloudinary.uploader.rename(publicId, newFileName, {
            resource_type: resourceType,
        });

        const resource = await cloudinary.api.resource(renameResult.public_id, {
            resource_type: resourceType,
            context: true,
        });

        return NextResponse.json({
            success: true,
            media: mapResource(resource as unknown as CloudinaryResource),
        });
    } catch (error) {
        console.error("Error updating cricket media:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to update media",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

// ---------- DELETE: remove media ----------
// query: ?publicId=...&resourceType=image
export async function DELETE(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const publicId = searchParams.get("publicId");
        const resourceType = searchParams.get("resourceType") || "image";

        if (!publicId) {
            return NextResponse.json(
                { success: false, error: "`publicId` query param is required" },
                { status: 400 }
            );
        }

        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
        });

        if (result.result !== "ok" && result.result !== "not found") {
            return NextResponse.json(
                { success: false, error: "Failed to delete", details: result.result },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, publicId, result: result.result });
    } catch (error) {
        console.error("Error deleting cricket media:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to delete media",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}