import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { getAthletePipelineConfig } from "@/lib/athletePipelineAuth";

export const dynamic = "force-dynamic";


// POST /api/admin/athlete-pipeline/run
// body: { athlete_id: string, athlete_name: string, sport: string }
// Manual re-check of one athlete against its licensed source feed; never
// auto-publishes — only ever populates the review queue.
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = getAthletePipelineConfig();
    if (!config) {
      console.error("[athlete-pipeline/run] ATHLETE_PIPELINE_URL not configured");
      return NextResponse.json({ error: "Athlete pipeline service not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { athlete_id, athlete_name, sport } = body;

    if (!athlete_id || !athlete_name || !sport) {
      return NextResponse.json(
        { error: "athlete_id, athlete_name, and sport are all required" },
        { status: 400 }
      );
    }

    // The Python service takes these as query params, not a JSON body.
    const url = new URL(`${config.baseUrl}/run-athlete-pipeline`);
    url.searchParams.set("athlete_id", athlete_id);
    url.searchParams.set("athlete_name", athlete_name);
    url.searchParams.set("sport", sport);

    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "x-api-key": config.apiKey },
    });
    const data = await res.json();

    if (!res.ok) {
      console.error(`[athlete-pipeline/run] Python service returned ${res.status}:`, data);
      return NextResponse.json(
        { error: data?.error || "Pipeline run failed" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("POST /api/admin/athlete-pipeline/run error:", error);
    return NextResponse.json({ error: "Failed to trigger pipeline run" }, { status: 500 });
  }
}