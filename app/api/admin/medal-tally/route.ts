import { NextRequest, NextResponse } from "next/server";
import { getMedalTally, saveMedalTally } from "@/lib/medalTallyService";
import { getEnv, TABLES } from "@/lib/tableNames";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/medal-tally
 * Admin endpoint to fetch current medal tally for the active environment table.
 */
export async function GET() {
  try {
    const data = await getMedalTally();
    const currentEnv = getEnv();

    return NextResponse.json(
      {
        success: true,
        env: currentEnv,
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
    console.error("[GET /api/admin/medal-tally] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to load medal tally admin data",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/medal-tally
 * Admin updates medal tally in the active environment table via dualWrite.
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
    console.error("[POST /api/admin/medal-tally] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to update medal tally in admin console",
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}
