import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/getUser";
import { getAthletePipelineConfig } from "@/lib/athletePipelineAuth";

export const dynamic = "force-dynamic";


// POST /api/admin/athlete-review/:id/resolve
// body: { action: "approve" | "edit" | "reject", fields?: {...edited values...}, reason?: string }
// This is the only path that publishes AI-drafted athlete data to the live profile —
// gated behind admin auth here, then audit-logged again on the Python side.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const config = getAthletePipelineConfig();
    if (!config) {
      console.error("[athlete-review/id/resolve] ATHLETE_PIPELINE_URL not configured");
      return NextResponse.json({ error: "Athlete pipeline service not configured" }, { status: 500 });
    }

    const { id } = await props.params;
    const body = await req.json();

    if (!body?.action || !["approve", "edit", "reject"].includes(body.action)) {
      return NextResponse.json(
        { error: "action must be one of: approve, edit, reject" },
        { status: 400 }
      );
    }

    const res = await fetch(`${config.baseUrl}/athlete-review-queue/${id}/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
      },
      body: JSON.stringify({
        ...body,
        resolvedBy: user.email,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      console.error(`[athlete-review/id/resolve] Python service returned ${res.status}:`, data);
      return NextResponse.json(
        { error: data?.error || "Failed to resolve draft" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("POST /api/admin/athlete-review/[id]/resolve error:", error);
    return NextResponse.json({ error: "Failed to resolve draft" }, { status: 500 });
  }
}