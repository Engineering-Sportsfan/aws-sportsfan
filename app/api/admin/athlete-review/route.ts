import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { getAthletePipelineConfig } from "@/lib/athletePipelineAuth";

// GET /api/admin/athlete-review — list queued athlete drafts awaiting review
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const config = getAthletePipelineConfig();
    if (!config) {
      console.error("[athlete-review] ATHLETE_PIPELINE_URL not configured");
      return NextResponse.json({ error: "Athlete pipeline service not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // e.g. pending / approved / rejected

    const url = new URL(`${config.baseUrl}/athlete-review-queue`);
    if (status) url.searchParams.set("status", status);

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { "x-api-key": config.apiKey },
    });
    const data = await res.json();

    if (!res.ok) {
      console.error(`[athlete-review] Python service returned ${res.status}:`, data);
      return NextResponse.json(
        { error: data?.error || "Failed to fetch review queue" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("GET /api/admin/athlete-review error:", error);
    return NextResponse.json({ error: "Failed to fetch review queue" }, { status: 500 });
  }
}