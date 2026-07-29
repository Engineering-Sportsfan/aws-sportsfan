import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { getAthletePipelineConfig } from "@/lib/athletePipelineAuth";

// GET /api/admin/athlete-review/:id — full draft detail (proposed vs current values, source URLs, trigger reason)
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const config = getAthletePipelineConfig();
    if (!config) {
      console.error("[athlete-review/id] ATHLETE_PIPELINE_URL not configured");
      return NextResponse.json({ error: "Athlete pipeline service not configured" }, { status: 500 });
    }

    const { id } = await props.params;

    const res = await fetch(`${config.baseUrl}/athlete-review-queue/${id}`, {
      cache: "no-store",
      headers: { "x-api-key": config.apiKey },
    });
    const data = await res.json();

    if (!res.ok) {
      console.error(`[athlete-review/id] Python service returned ${res.status}:`, data);
      return NextResponse.json(
        { error: data?.error || "Failed to fetch draft" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("GET /api/admin/athlete-review/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch draft" }, { status: 500 });
  }
}