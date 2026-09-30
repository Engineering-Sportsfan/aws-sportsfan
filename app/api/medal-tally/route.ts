import { NextRequest, NextResponse } from "next/server";
import { getMedalTally, saveMedalTally } from "@/lib/medalTallyService";
import { getEnv, TABLES } from "@/lib/tableNames";

export const dynamic = "force-dynamic";

/**
 * GET /api/medal-tally
 * Fetches the current medal tally for the active environment (SportsData-dev, SportsData-release, or SportsData).
 */
export async function GET() {
  try {
    const data = await getMedalTally();

    return NextResponse.json(
      {
        success: true,
        env: getEnv(),
        tableName: TABLES.SportsData,
        data,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("[GET /api/medal-tally] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to fetch medal tally data",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/medal-tally
 * Updates medal tally in the active environment's table via dualWrite.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const adminEmail = body.adminEmail || "Admin";

    const result = await saveMedalTally(body, adminEmail);

    return NextResponse.json({
      ...result,
      message: `Medal tally successfully updated in [${result.tableName}] (${result.env})`,
    });
  } catch (error: any) {
    console.error("[POST /api/medal-tally] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to save medal tally data",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}
