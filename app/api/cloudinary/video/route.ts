// // app/api/cloudinary/video/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import cloudinary from "@/lib/cloudinary";

// interface CloudinaryResource {
//     public_id: string;
//     secure_url: string;
//     duration: number;
//     created_at: string;
//     bytes: number;
//     format: string;
//     display_name: string;
//     width: number;
//     height: number;
// }

// interface VideoMetadata {
//     id: string;
//     title: string;
//     fileName: string;
//     url: string;
//     duration: string;
//     durationSeconds: number;
//     size: number;
//     sizeFormatted: string;
//     format: string;
//     width: number;
//     height: number;
//     createdAt: string;
//     createdAtFormatted: string;
//     folder: string;
//     playerInfo?: {
//         playerName?: string;
//         chapter?: string;
//         chapterNumber?: number;
//     };
// }

// interface CloudinaryApiParams {
//     resource_type: string;
//     type: string;
//     prefix: string;          // ✅ required to filter by folder
//     max_results: number;
//     image_metadata: boolean;
//     next_cursor?: string;
// }

// function formatDuration(seconds: number): string {
//     if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
//     const m = Math.floor(seconds / 60);
//     const s = Math.floor(seconds % 60);
//     return `${m}:${s.toString().padStart(2, "0")}`;
// }

// function formatFileSize(bytes: number): string {
//     if (bytes < 1024) return `${bytes} B`;
//     if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
//     return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
// }

// function formatDate(dateString: string): string {
//     return new Date(dateString).toLocaleDateString("en-IN", {
//         day: "2-digit",
//         month: "short",
//         year: "numeric",
//         hour: "2-digit",
//         minute: "2-digit",
//     });
// }

// // Parses: "bumrah_chapter-1" (strips folder path, no random suffix since uploaded via folder)
// function parsePlayerFileName(fileName: string): VideoMetadata["playerInfo"] {
//     const nameWithoutExt = fileName.replace(/\.(mp4|mov|avi|mkv|webm)$/i, "");

//     const firstUnderscore = nameWithoutExt.indexOf("_");

//     if (firstUnderscore === -1) {
//         return {
//             playerName: nameWithoutExt,
//             chapter: undefined,
//             chapterNumber: undefined,
//         };
//     }

//     const playerName = nameWithoutExt.slice(0, firstUnderscore);       // "bumrah"
//     const chapterRaw = nameWithoutExt.slice(firstUnderscore + 1);      // "chapter-1"

//     const chapterMatch = chapterRaw.match(/chapter[-_]?(\d+)/i);
//     const chapterNumber = chapterMatch ? parseInt(chapterMatch[1]) : undefined;

//     return {
//         playerName,
//         chapter: chapterRaw,
//         chapterNumber,
//     };
// }

// // ─── GET: Fetch only sf360/video files ───────────────────────────────────────
// export async function GET(req: NextRequest) {
//     try {
//         const searchParams = req.nextUrl.searchParams;
//         const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 50);
//         const nextCursor = searchParams.get("nextCursor");
//         const search = searchParams.get("search")?.toLowerCase();
//         const player = searchParams.get("player")?.toLowerCase();

//         const params: CloudinaryApiParams = {
//             resource_type: "video",
//             type: "upload",
//             prefix: "sf360/video",   // ✅ ONLY fetch from sf360/video folder
//             max_results: limit,
//             image_metadata: true,
//         };

//         if (nextCursor) {
//             params.next_cursor = nextCursor;
//         }

//         const result = await cloudinary.api.resources(params);

//         let videoFiles: VideoMetadata[] = result.resources.map(
//             (resource: CloudinaryResource) => {
//                 // Extract filename from public_id: "sf360/video/bumrah_chapter-1"
//                 const rawFileName =
//                     resource.display_name ||
//                     resource.public_id.split("/").pop() ||
//                     resource.public_id;

//                 const playerInfo = parsePlayerFileName(rawFileName);

//                 const title = [
//                     playerInfo?.playerName
//                         ? playerInfo.playerName.charAt(0).toUpperCase() + playerInfo.playerName.slice(1)
//                         : rawFileName,
//                     playerInfo?.chapterNumber !== undefined
//                         ? `Chapter ${playerInfo.chapterNumber}`
//                         : "",
//                 ]
//                     .filter(Boolean)
//                     .join(" ");

//                 return {
//                     id: resource.public_id,
//                     title,
//                     fileName: rawFileName,
//                     url: resource.secure_url,
//                     duration: formatDuration(resource.duration),
//                     durationSeconds: resource.duration || 0,
//                     size: resource.bytes,
//                     sizeFormatted: formatFileSize(resource.bytes),
//                     format: resource.format,
//                     width: resource.width || 0,
//                     height: resource.height || 0,
//                     createdAt: resource.created_at,
//                     createdAtFormatted: formatDate(resource.created_at),
//                     folder: "sf360/video",
//                     playerInfo,
//                 };
//             }
//         );

//         if (search) {
//             videoFiles = videoFiles.filter(
//                 (video) =>
//                     video.title.toLowerCase().includes(search) ||
//                     video.playerInfo?.playerName?.toLowerCase().includes(search) ||
//                     video.playerInfo?.chapter?.toLowerCase().includes(search)
//             );
//         }

//         if (player) {
//             videoFiles = videoFiles.filter(
//                 (video) => video.playerInfo?.playerName?.toLowerCase() === player
//             );
//         }

//         // Sort: player A→Z, then chapter 1→N
//         videoFiles.sort((a, b) => {
//             const nameA = a.playerInfo?.playerName || "";
//             const nameB = b.playerInfo?.playerName || "";
//             if (nameA !== nameB) return nameA.localeCompare(nameB);
//             return (a.playerInfo?.chapterNumber || 0) - (b.playerInfo?.chapterNumber || 0);
//         });

//         return NextResponse.json({
//             success: true,
//             videoFiles,
//             totalCount: videoFiles.length,
//             pagination: {
//                 hasMore: !!result.next_cursor,
//                 nextCursor: result.next_cursor || null,
//                 limit,
//             },
//             folder: "sf360/video",
//         });
//     } catch (error) {
//         console.error("Error fetching videos from Cloudinary:", error);
//         return NextResponse.json(
//             {
//                 success: false,
//                 error: "Failed to fetch video files",
//                 details: error instanceof Error ? error.message : "Unknown error",
//             },
//             { status: 500 }
//         );
//     }
// }

// // ─── DELETE: Delete a video by public_id ─────────────────────────────────────
// export async function DELETE(req: NextRequest) {
//     try {
//         const { public_id } = await req.json();

//         if (!public_id) {
//             return NextResponse.json(
//                 { success: false, error: "public_id is required" },
//                 { status: 400 }
//             );
//         }

//         // Safety: only allow deleting from sf360/video folder
//         if (!public_id.startsWith("sf360/video")) {
//             return NextResponse.json(
//                 { success: false, error: "Invalid folder. Only sf360/video files can be deleted." },
//                 { status: 403 }
//             );
//         }

//         const result = await cloudinary.uploader.destroy(public_id, {
//             resource_type: "video",
//         });

//         if (result.result !== "ok") {
//             return NextResponse.json(
//                 { success: false, error: "Failed to delete video", details: result },
//                 { status: 500 }
//             );
//         }

//         return NextResponse.json({
//             success: true,
//             message: "Video deleted successfully",
//             public_id,
//         });
//     } catch (error) {
//         console.error("Error deleting video from Cloudinary:", error);
//         return NextResponse.json(
//             {
//                 success: false,
//                 error: "Failed to delete video",
//                 details: error instanceof Error ? error.message : "Unknown error",
//             },
//             { status: 500 }
//         );
//     }
// }














// app/api/cloudinary/video/route.ts
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

interface CloudinaryResource {
    public_id: string;
    secure_url: string;
    duration: number;
    created_at: string;
    bytes: number;
    format: string;
    display_name: string;
    width: number;
    height: number;
}

interface VideoMetadata {
    id: string;
    title: string;
    fileName: string;
    url: string;
    duration: string;
    durationSeconds: number;
    size: number;
    sizeFormatted: string;
    format: string;
    width: number;
    height: number;
    createdAt: string;
    createdAtFormatted: string;
    folder: string;
    playerInfo?: {
        playerName?: string;
        chapter?: string;
        chapterNumber?: number;
    };
}

interface CloudinaryApiParams {
    resource_type: string;
    type: string;
    prefix: string;
    max_results: number;
    image_metadata: boolean;
    video_metadata: boolean;  // ← required to get duration for video files
    direction: string;        // ← "desc" = newest first
    next_cursor?: string;
}

function formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
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

function parsePlayerFileName(fileName: string): VideoMetadata["playerInfo"] {
    const nameWithoutExt = fileName.replace(/\.(mp4|mov|avi|mkv|webm)$/i, "");
    const firstUnderscore = nameWithoutExt.indexOf("_");

    if (firstUnderscore === -1) {
        return { playerName: nameWithoutExt, chapter: undefined, chapterNumber: undefined };
    }

    const playerName = nameWithoutExt.slice(0, firstUnderscore);
    const chapterRaw = nameWithoutExt.slice(firstUnderscore + 1);
    const chapterMatch = chapterRaw.match(/chapter[-_]?(\d+)/i);
    const chapterNumber = chapterMatch ? parseInt(chapterMatch[1]) : undefined;

    return { playerName, chapter: chapterRaw, chapterNumber };
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);
        const type = searchParams.get("type") || "ipl";
        const nextCursor = searchParams.get("nextCursor");
        const search = searchParams.get("search")?.toLowerCase();
        const player = searchParams.get("player")?.toLowerCase();

        const params: CloudinaryApiParams = {
            resource_type: "video",
            type: "upload",
            prefix: `sf360/video/${type}`,
            max_results: limit,
            image_metadata: true,
            video_metadata: true,  // ← THIS is what returns duration
            direction: "desc",     // ← newest first
        };

        if (nextCursor) params.next_cursor = nextCursor;

        const result = await cloudinary.api.resources(params);

        let videoFiles: VideoMetadata[] = result.resources.map(
            (resource: CloudinaryResource) => {
                const rawFileName =
                    resource.display_name ||
                    resource.public_id.split("/").pop() ||
                    resource.public_id;

                const playerInfo = parsePlayerFileName(rawFileName);

                const title = [
                    playerInfo?.playerName
                        ? playerInfo.playerName.charAt(0).toUpperCase() + playerInfo.playerName.slice(1)
                        : rawFileName,
                    playerInfo?.chapterNumber !== undefined
                        ? `Chapter ${playerInfo.chapterNumber}`
                        : "",
                ]
                    .filter(Boolean)
                    .join(" ");

                return {
                    id: resource.public_id,
                    title,
                    fileName: rawFileName,
                    url: resource.secure_url,
                    duration: formatDuration(resource.duration),
                    durationSeconds: resource.duration || 0,
                    size: resource.bytes,
                    sizeFormatted: formatFileSize(resource.bytes),
                    format: resource.format,
                    width: resource.width || 0,
                    height: resource.height || 0,
                    createdAt: resource.created_at,
                    createdAtFormatted: formatDate(resource.created_at),
                    folder: `sf360/video/${type}`,
                    playerInfo,
                };
            }
        );

        if (search) {
            videoFiles = videoFiles.filter(
                (video) =>
                    video.title.toLowerCase().includes(search) ||
                    video.playerInfo?.playerName?.toLowerCase().includes(search) ||
                    video.playerInfo?.chapter?.toLowerCase().includes(search)
            );
        }

        if (player) {
            videoFiles = videoFiles.filter(
                (video) => video.playerInfo?.playerName?.toLowerCase() === player
            );
        }

        // Sort: player A→Z, then chapter 1→N
        videoFiles.sort((a, b) => {
            const nameA = a.playerInfo?.playerName || "";
            const nameB = b.playerInfo?.playerName || "";
            if (nameA !== nameB) return nameA.localeCompare(nameB);
            return (a.playerInfo?.chapterNumber || 0) - (b.playerInfo?.chapterNumber || 0);
        });

        return NextResponse.json({
            success: true,
            videoFiles,
            totalCount: videoFiles.length,
            pagination: {
                hasMore: !!result.next_cursor,
                nextCursor: result.next_cursor || null,
                limit,
            },
            folder: `sf360/video/${type}`,
        });
    } catch (error) {
        console.error("Error fetching videos from Cloudinary:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to fetch video files",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { public_id } = await req.json();

        if (!public_id) {
            return NextResponse.json(
                { success: false, error: "public_id is required" },
                { status: 400 }
            );
        }

        if (!public_id.startsWith("sf360/video")) {
            return NextResponse.json(
                { success: false, error: "Invalid folder. Only sf360/video files can be deleted." },
                { status: 403 }
            );
        }

        const result = await cloudinary.uploader.destroy(public_id, { resource_type: "video" });

        if (result.result !== "ok") {
            return NextResponse.json(
                { success: false, error: "Failed to delete video", details: result },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, message: "Video deleted successfully", public_id });
    } catch (error) {
        console.error("Error deleting video from Cloudinary:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to delete video",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
