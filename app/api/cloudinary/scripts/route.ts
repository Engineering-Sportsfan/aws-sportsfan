// app/api/cloudinary/scripts/route.ts
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

interface CloudinaryResource {
    public_id: string;
    secure_url: string;
    created_at: string;
    bytes: number;
    format: string;
    display_name: string;
}

interface ScriptMetadata {
    id: string;
    title: string;
    fileName: string;
    url: string;
    size: number;
    sizeFormatted: string;
    format: string;
    createdAt: string;
    createdAtFormatted: string;
    folder: string;
    matchInfo?: {
        team1?: string;
        team2?: string;
        type?: string;
        speaker?: string;
        date?: string;
    };
}

interface CloudinaryApiParams {
    resource_type: string;
    type: string;
    prefix: string;
    max_results: number;
    next_cursor?: string;
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

function parseFileName(fileName: string): ScriptMetadata["matchInfo"] {
    const nameWithoutExt = fileName.replace(/\.(html|txt|md|docx?)$/i, "");
    const parts = nameWithoutExt.split("_");

    if (parts.length < 4) return undefined;

    const vsIndex = parts.findIndex((p) => p.toLowerCase() === "vs");
    if (vsIndex === -1 || vsIndex + 1 >= parts.length) return undefined;

    const team1 = parts[vsIndex - 1];
    const team2 = parts[vsIndex + 1];
    const remainder = parts.slice(vsIndex + 2);

    const datePattern = /^\d{8}$/;
    const dateIndex = remainder.findIndex((p) => datePattern.test(p));

    const date = dateIndex !== -1 ? remainder[dateIndex] : "";
    const nonDateParts =
        dateIndex !== -1 ? remainder.slice(0, dateIndex) : remainder;

    const typeKeywords = ["post", "pre", "mid", "match", "fan", "highlights"];
    const typeParts: string[] = [];
    const speakerParts: string[] = [];
    let speakerStarted = false;

    for (const part of nonDateParts) {
        if (!speakerStarted && typeKeywords.includes(part.toLowerCase())) {
            typeParts.push(part);
        } else {
            speakerStarted = true;
            speakerParts.push(part);
        }
    }

    return {
        team1,
        team2,
        type: typeParts.join(" ") || "unknown",
        speaker: speakerParts.join(" ") || "unknown",
        date,
    };
}

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 50);
        const nextCursor = searchParams.get("nextCursor");
        const search = searchParams.get("search")?.toLowerCase();

        const params: CloudinaryApiParams = {
            resource_type: "raw",
            type: "upload",
            prefix: "sf360/scripts",
            max_results: limit,
        };

        if (nextCursor) {
            params.next_cursor = nextCursor;
        }

        const result = await cloudinary.api.resources(params);

        let scriptFiles: ScriptMetadata[] = result.resources.map(
            (resource: CloudinaryResource) => {
                const fileName =
                    resource.display_name ||
                    resource.public_id.split("/").pop() ||
                    resource.public_id;
                const title = fileName
                    .replace(/\.(html|txt|md|docx?)$/i, "")
                    .replace(/_/g, " ");
                const matchInfo = parseFileName(resource.display_name || fileName);

                return {
                    id: resource.public_id,
                    title,
                    fileName,
                    url: resource.secure_url,
                    size: resource.bytes,
                    sizeFormatted: formatFileSize(resource.bytes),
                    format: resource.format,
                    createdAt: resource.created_at,
                    createdAtFormatted: formatDate(resource.created_at),
                    folder: "sf360/scripts",
                    matchInfo,
                };
            }
        );

        if (search) {
            scriptFiles = scriptFiles.filter(
                (script) =>
                    script.title.toLowerCase().includes(search) ||
                    script.matchInfo?.team1?.toLowerCase().includes(search) ||
                    script.matchInfo?.team2?.toLowerCase().includes(search) ||
                    script.matchInfo?.speaker?.toLowerCase().includes(search)
            );
        }

        scriptFiles.sort(
            (a, b) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        return NextResponse.json({
            success: true,
            scriptFiles,
            totalCount: scriptFiles.length,
            pagination: {
                hasMore: !!result.next_cursor,
                nextCursor: result.next_cursor || null,
                limit,
            },
            folder: "sf360/scripts",
        });
    } catch (error) {
        console.error("Error fetching scripts from Cloudinary:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to fetch script files",
                details: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}