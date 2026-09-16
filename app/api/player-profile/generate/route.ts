// app/api/player-profile/generate/route.ts
// Triggered when global-search finds nothing for a player/athlete name.
// Calls the Python pipeline for a researched draft, then writes it to the
// SAME table the relevant GET route actually reads from:
//   - cricket        -> MS_Players  (entityId: PLAYER#{id})
//   - everyone else  -> SportsData  (entityId: ATHLETE#{id})
// Also drops an audit copy in Firestore so the existing admin review UI
// (backed by the Python /athlete-review-queue) has something to show.

import { NextRequest, NextResponse } from "next/server";
import { docClient as ddb } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { getAthletePipelineConfig } from "@/lib/athletePipelineAuth";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isCricket(sport: string): boolean {
  return sport?.toLowerCase().trim() === "cricket";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, sport } = body;

    if (!name || !sport) {
      return NextResponse.json(
        { success: false, message: "name and sport are required" },
        { status: 400 }
      );
    }

    const id = slugify(name);
    const cricket = isCricket(sport);
    const table = cricket ? TABLES.MS_Players : TABLES.SportsData;
    const entityId = cricket ? `PLAYER#${id}` : `ATHLETE#${id}`;

    // Dedup guard — don't double-trigger if it already exists or is mid-generation.
    const existing = await ddb.send(
      new GetCommand({ TableName: table, Key: { entityId, sk: "PROFILE#META" } })
    );
    if (existing.Item) {
      if (existing.Item.status === "generating") {
        return NextResponse.json({ success: true, status: "generating", id });
      }
      return NextResponse.json({ success: true, status: "published", id, profile: existing.Item });
    }

    const now = Date.now();

    // Write an immediate stub so the frontend can poll right away and so
    // concurrent searches for the same name don't fire the pipeline twice.
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: { entityId, sk: "PROFILE#META", id, name, sport, status: "generating", createdAt: now },
      })
    );

    const config = getAthletePipelineConfig();
    if (!config) {
      return NextResponse.json(
        { success: false, message: "Athlete pipeline service not configured" },
        { status: 500 }
      );
    }

    const url = new URL(`${config.baseUrl}/run-athlete-pipeline`);
    url.searchParams.set("athlete_id", id);
    url.searchParams.set("athlete_name", name);
    url.searchParams.set("sport", sport);

    const res = await fetch(url.toString(), { method: "POST", headers: { "x-api-key": config.apiKey } });
    const data = await res.json();

    if (!res.ok || data.status !== "success") {
      await ddb.send(
        new PutCommand({
          TableName: table,
          Item: {
            entityId, sk: "PROFILE#META", id, name, sport,
            status: "rejected", reason: data.reason || "Pipeline failed", createdAt: now,
          },
        })
      );
      return NextResponse.json(
        { success: false, status: "rejected", message: data.reason || "Could not generate profile" },
        { status: 422 }
      );
    }

    const draft = data.profile; // plain JSON from Gemini, shape matches assemblePlayerDocument's expected fields

    const finalItem = cricket
      ? {
          entityId, sk: "PROFILE#META", playerId: id, name: draft.name,
          role: draft.role ?? null, battingStyle: draft.battingStyle ?? null,
          bowlingStyle: draft.bowlingStyle ?? null, currentClubId: draft.team ?? null,
          sportId: "cricket", country: draft.country ?? null,
          dateOfBirth: draft.overview?.dob ?? null, profileImage: draft.avatar ?? null,
          bio: draft.about ?? null, status: "published", auditStatus: "pending",
          generatedBy: "ai", createdAt: now, updatedAt: now,
        }
      : {
          entityId, sk: "PROFILE#META", athleteId: id, name: draft.name,
          sport: draft.sport ?? sport, country: draft.country ?? null,
          profileImage: draft.avatar ?? null, bio: draft.about ?? null,
          coachName: draft.overview?.specialization ?? null,
          dob: draft.overview?.dob ?? null, status: "published", auditStatus: "pending",
          generatedBy: "ai", createdAt: now, updatedAt: now,
        };

    await ddb.send(new PutCommand({ TableName: table, Item: finalItem }));

    // Audit trail for the existing admin review UI (reads Firestore via the
    // Python service's /athlete-review-queue).
    await db.collection("athleteReviewQueue").doc(id).set({
      athleteId: id, athleteName: draft.name, sport, status: "auto-published",
      draft: finalItem, createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, status: "published", id, isCricket: cricket, profile: finalItem });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}