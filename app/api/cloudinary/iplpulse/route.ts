// // app/api/cloudinary/pulse/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import cloudinary from "@/lib/cloudinary";

// interface CloudinaryResource {
//   public_id: string;
//   secure_url: string;
//   created_at: string;
//   bytes: number;
//   format: string;
//   display_name: string;
// }

// interface PulseFileMeta {
//   id: string;
//   fileName: string;
//   url: string;
//   size: number;
//   sizeFormatted: string;
//   createdAt: string;
//   /** YYYY-MM-DD extracted from filename like ipl_pulse_2026-05-12.json */
//   reportDate: string | null;
//   /** Human-readable label e.g. "May 12, 2026" */
//   reportDateFormatted: string | null;
// }

// interface CloudinaryApiParams {
//   resource_type: string;
//   type: string;
//   prefix: string;
//   max_results: number;
//   next_cursor?: string;
// }

// function formatFileSize(bytes: number): string {
//   if (bytes < 1024) return `${bytes} B`;
//   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
//   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
// }

// /** Extract YYYY-MM-DD from filenames like ipl_pulse_2026-05-12.json or ipl_pulse_latest.json */
// function extractReportDate(fileName: string): string | null {
//   const match = fileName.match(/(\d{4}-\d{2}-\d{2})/);
//   return match ? match[1] : null;
// }

// function formatReportDate(dateStr: string | null): string | null {
//   if (!dateStr) return null;
//   try {
//     return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
//       day: "2-digit",
//       month: "short",
//       year: "numeric",
//     });
//   } catch (e:unknown) {
//     if (e instanceof Error) {
//       console.error("Error formatting report date:", e.message);
//     }
//     return dateStr;
//   }
// }

// export async function GET(req: NextRequest) {
//   try {
//     const searchParams = req.nextUrl.searchParams;
//     const mode = searchParams.get("mode") || "latest"; // "latest" | "list"
//     const nextCursor = searchParams.get("nextCursor");

//     // ── MODE: list — return metadata of all pulse files ──────────────────────
//     if (mode === "list") {
//       const params: CloudinaryApiParams = {
//         resource_type: "raw",
//         type: "upload",
//         prefix: "sf360/pulse",
//         max_results: 50,
//       };
//       if (nextCursor) params.next_cursor = nextCursor;

//       const result = await cloudinary.api.resources(params);

//       const files: PulseFileMeta[] = result.resources
//         .map((r: CloudinaryResource) => {
//           const fileName = r.display_name || r.public_id.split("/").pop() || r.public_id;
//           const reportDate = extractReportDate(fileName);
//           return {
//             id: r.public_id,
//             fileName,
//             url: r.secure_url,
//             size: r.bytes,
//             sizeFormatted: formatFileSize(r.bytes),
//             createdAt: r.created_at,
//             reportDate,
//             reportDateFormatted: formatReportDate(reportDate),
//           };
//         })
//         .sort((a: PulseFileMeta, b: PulseFileMeta) => {
//           if (!a.reportDate && !b.reportDate) return 0;
//           if (!a.reportDate) return 1;
//           if (!b.reportDate) return -1;
//           return b.reportDate.localeCompare(a.reportDate);
//         });

//       return NextResponse.json({
//         success: true,
//         files,
//         totalCount: files.length,
//         pagination: {
//           hasMore: !!result.next_cursor,
//           nextCursor: result.next_cursor || null,
//         },
//       });
//     }

//     // ── MODE: latest — fetch and return the JSON content of the latest pulse ─
//     const latestUrl = "https://res.cloudinary.com/dflnsufit/raw/upload/sf360/pulse/ipl_pulse_latest.json";

//     const res = await fetch(latestUrl, {
//       next: { revalidate: 300 }, // Cache for 5 minutes
//     });

//     if (!res.ok) {
//       throw new Error(`Cloudinary fetch failed: ${res.status} ${res.statusText}`);
//     }

//     const data = await res.json();

//     return NextResponse.json({
//       success: true,
//       data,
//       fetchedAt: new Date().toISOString(),
//     });
//   } catch (error) {
//     console.error("Error in /api/cloudinary/pulse:", error);
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Failed to fetch IPL Pulse data",
//         details: error instanceof Error ? error.message : "Unknown error",
//       },
//       { status: 500 }
//     );
//   }
// }






// app/api/cloudinary/pulse/route.ts
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

interface PulseFileMeta {
  id: string;
  fileName: string;
  url: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
  /** YYYY-MM-DD extracted from filename like ipl_pulse_2026_05_12.json */
  reportDate: string | null;
  /** Human-readable label e.g. "May 12, 2026" */
  reportDateFormatted: string | null;
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

/**
 * Extract YYYY-MM-DD from filenames using underscore format:
 * ipl_pulse_2026_05_14.json → "2026-05-14"
 * Also handles legacy dash format: ipl_pulse_2026-05-12.json → "2026-05-12"
 */
function extractReportDate(fileName: string): string | null {
  // Match underscore format: 2026_05_14
  const underscoreMatch = fileName.match(/(\d{4})_(\d{2})_(\d{2})(?:\.|$)/);
  if (underscoreMatch) {
    return `${underscoreMatch[1]}-${underscoreMatch[2]}-${underscoreMatch[3]}`;
  }
  // Fallback: legacy dash format 2026-05-12
  const dashMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  return dashMatch ? dashMatch[1] : null;
}

function formatReportDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (e: unknown) {
    if (e instanceof Error) {
      console.error("Error formatting report date:", e.message);
    }
    return dateStr;
  }
}

/**
 * Build the Cloudinary raw URL for a given YYYY-MM-DD date string.
 * e.g. "2026-05-14" → ".../ipl_pulse_2026_05_14.json"
 */
function buildPulseUrl(dateStr: string): string {
  const underscoreDate = dateStr.replace(/-/g, "_");
  return `https://res.cloudinary.com/dflnsufit/raw/upload/sf360/pulse/ipl_pulse_${underscoreDate}.json`;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get("mode") || "latest"; // "latest" | "list"
    const nextCursor = searchParams.get("nextCursor");

    // ── MODE: list — return metadata of all pulse files ──────────────────────
    if (mode === "list") {
      const params: CloudinaryApiParams = {
        resource_type: "raw",
        type: "upload",
        prefix: "sf360/pulse",
        max_results: 50,
      };
      if (nextCursor) params.next_cursor = nextCursor;

      const result = await cloudinary.api.resources(params);

      const files: PulseFileMeta[] = result.resources
        .map((r: CloudinaryResource) => {
          const fileName = r.display_name || r.public_id.split("/").pop() || r.public_id;
          const reportDate = extractReportDate(fileName);
          return {
            id: r.public_id,
            fileName,
            url: r.secure_url,
            size: r.bytes,
            sizeFormatted: formatFileSize(r.bytes),
            createdAt: r.created_at,
            reportDate,
            reportDateFormatted: formatReportDate(reportDate),
          };
        })
        .sort((a: PulseFileMeta, b: PulseFileMeta) => {
          if (!a.reportDate && !b.reportDate) return 0;
          if (!a.reportDate) return 1;
          if (!b.reportDate) return -1;
          return b.reportDate.localeCompare(a.reportDate);
        });

      // Separate dated files and expose the latest URL for convenience
      const datedFiles = files.filter(f => !!f.reportDate);
      const latestFile = datedFiles[0] ?? null;

      return NextResponse.json({
        success: true,
        files: datedFiles,
        totalCount: datedFiles.length,
        latestUrl: latestFile?.url ?? null,
        latestDate: latestFile?.reportDate ?? null,
        pagination: {
          hasMore: !!result.next_cursor,
          nextCursor: result.next_cursor || null,
        },
      });
    }

    // ── MODE: latest — determine latest date and fetch that file ─────────────
    //
    // Strategy: list files from Cloudinary, pick the most recent dated one,
    // then fetch its content. This avoids relying on a hardcoded "latest" alias.

    const listParams: CloudinaryApiParams = {
      resource_type: "raw",
      type: "upload",
      prefix: "sf360/pulse",
      max_results: 50,
    };

    const listResult = await cloudinary.api.resources(listParams);

    // Find the most recent dated file
    const sortedFiles: Array<{ url: string; reportDate: string }> = listResult.resources
      .map((r: CloudinaryResource) => {
        const fileName = r.display_name || r.public_id.split("/").pop() || r.public_id;
        const reportDate = extractReportDate(fileName);
        return { url: r.secure_url, reportDate };
      })
      .filter((f: { url: string; reportDate: string | null }): f is { url: string; reportDate: string } => !!f.reportDate)
      .sort((a: { reportDate: string }, b: { reportDate: string }) => b.reportDate.localeCompare(a.reportDate));

    // Fallback: if Cloudinary list fails or is empty, try today's URL directly
    let latestUrl: string;
    let latestReportDate: string | null = null;

    if (sortedFiles.length > 0) {
      latestUrl = sortedFiles[0].url;
      latestReportDate = sortedFiles[0].reportDate;
    } else {
      // Derive today's date in IST (UTC+5:30)
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istDate = new Date(now.getTime() + istOffset);
      const yyyy = istDate.getUTCFullYear();
      const mm = String(istDate.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(istDate.getUTCDate()).padStart(2, "0");
      latestReportDate = `${yyyy}-${mm}-${dd}`;
      latestUrl = buildPulseUrl(latestReportDate);
    }

    const res = await fetch(latestUrl, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      throw new Error(`Cloudinary fetch failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    return NextResponse.json({
      success: true,
      data,
      reportDate: latestReportDate,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/cloudinary/pulse:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch IPL Pulse data",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const publicId = searchParams.get("publicId");

    if (!publicId) {
      return NextResponse.json(
        { success: false, error: "publicId parameter is required" },
        { status: 400 }
      );
    }

    // Delete raw resource from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "raw",
    });

    if (result.result === "ok" || result.result === "not found") {
      return NextResponse.json({
        success: true,
        message: "File deleted successfully",
      });
    } else {
      throw new Error(`Failed to delete from Cloudinary: ${JSON.stringify(result)}`);
    }
  } catch (error) {
    console.error("Error deleting IPL Pulse file:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}