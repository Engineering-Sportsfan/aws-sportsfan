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
export const maxDuration = 60;

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function isCricket(sport: string): boolean {
  return sport?.toLowerCase().trim() === "cricket";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { name, sport: inputSport } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, message: "name is required" },
        { status: 400 }
      );
    }

    const id = slugify(name);
    const resolvedSport = (inputSport || "").trim();
    const cricketExpected = isCricket(resolvedSport);

    // Dedup guard: check relevant table(s) to avoid double-triggering
    if (resolvedSport && cricketExpected) {
      const existing = await ddb.send(
        new GetCommand({ TableName: TABLES.MS_Players, Key: { entityId: `PLAYER#${id}`, sk: "PROFILE#META" } })
      );
      if (existing.Item) {
        if (existing.Item.status === "generating") {
          return NextResponse.json({ success: true, status: "generating", id, isCricket: true });
        }
        return NextResponse.json({ success: true, status: "published", id, isCricket: true, profile: existing.Item });
      }
    } else if (resolvedSport && !cricketExpected) {
      const existing = await ddb.send(
        new GetCommand({ TableName: TABLES.SportsData, Key: { entityId: `ATHLETE#${id}`, sk: "PROFILE#META" } })
      );
      if (existing.Item) {
        if (existing.Item.status === "generating") {
          return NextResponse.json({ success: true, status: "generating", id, isCricket: false });
        }
        return NextResponse.json({ success: true, status: "published", id, isCricket: false, profile: existing.Item });
      }
    } else {
      // Check both tables when sport is not predetermined
      const [cricketCheck, athleteCheck] = await Promise.allSettled([
        ddb.send(new GetCommand({ TableName: TABLES.MS_Players, Key: { entityId: `PLAYER#${id}`, sk: "PROFILE#META" } })),
        ddb.send(new GetCommand({ TableName: TABLES.SportsData, Key: { entityId: `ATHLETE#${id}`, sk: "PROFILE#META" } })),
      ]);

      const cricketItem = cricketCheck.status === "fulfilled" ? cricketCheck.value.Item : null;
      if (cricketItem) {
        if (cricketItem.status === "generating") return NextResponse.json({ success: true, status: "generating", id, isCricket: true });
        return NextResponse.json({ success: true, status: "published", id, isCricket: true, profile: cricketItem });
      }

      const athleteItem = athleteCheck.status === "fulfilled" ? athleteCheck.value.Item : null;
      if (athleteItem) {
        if (athleteItem.status === "generating") return NextResponse.json({ success: true, status: "generating", id, isCricket: false });
        return NextResponse.json({ success: true, status: "published", id, isCricket: false, profile: athleteItem });
      }
    }

    const now = Date.now();
    const tentativeTable = cricketExpected ? TABLES.MS_Players : TABLES.SportsData;
    const tentativeEntityId = cricketExpected ? `PLAYER#${id}` : `ATHLETE#${id}`;

    // Write an immediate stub so the frontend can poll right away
    await ddb.send(
      new PutCommand({
        TableName: tentativeTable,
        Item: { entityId: tentativeEntityId, sk: "PROFILE#META", id, name, sport: resolvedSport || "auto", status: "generating", createdAt: now },
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
    url.searchParams.set("athlete_name", name.trim());
    if (resolvedSport) url.searchParams.set("sport", resolvedSport);

    let data: any = {};
    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "x-api-key": config.apiKey },
      });
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { status: "error", reason: `Pipeline returned non-JSON (${res.status}): ${text.slice(0, 120)}` };
      }
      if (!res.ok) {
        data.status = data.status || "error";
        data.reason = data.reason || data.detail || `Pipeline HTTP ${res.status}`;
      }
    } catch (fetchErr: any) {
      console.error("[generate] Fetch to Python pipeline failed:", fetchErr);
      return NextResponse.json(
        {
          success: false,
          status: "error",
          message: `Could not connect to Python service at ${config.baseUrl}. Make sure Uvicorn is running: ${fetchErr?.message || "Connection failed"}`,
        },
        { status: 502 }
      );
    }

    if (data.status !== "success" && data.status !== "published") {
      await ddb.send(
        new PutCommand({
          TableName: tentativeTable,
          Item: {
            entityId: tentativeEntityId, sk: "PROFILE#META", id, name, sport: resolvedSport || "auto",
            status: "rejected", reason: data.reason || "Pipeline failed", createdAt: now,
          },
        })
      );
      return NextResponse.json(
        { success: false, status: "rejected", message: data.reason || "Could not generate profile" },
        { status: 422 }
      );
    }

    const draft = data.profile || {};
    const finalSport = (draft.sport || resolvedSport || "athletics").toLowerCase().trim();
    const isFinalCricket = isCricket(finalSport);
    const finalTable = isFinalCricket ? TABLES.MS_Players : TABLES.SportsData;
    const finalEntityId = isFinalCricket ? `PLAYER#${id}` : `ATHLETE#${id}`;

    // Clean up tentative stub if the detected sport belongs to the other table
    if (finalTable !== tentativeTable) {
      try {
        const { DeleteCommand } = await import("@aws-sdk/lib-dynamodb");
        await ddb.send(new DeleteCommand({ TableName: tentativeTable, Key: { entityId: tentativeEntityId, sk: "PROFILE#META" } }));
      } catch {}
    }

    const finalItem = isFinalCricket
      ? {
          entityId: finalEntityId,
          sk: "PROFILE#META",
          playerId: id,
          id,
          name: draft.name || name,
          role: draft.role ?? null,
          battingStyle: draft.battingStyle ?? null,
          bowlingStyle: draft.bowlingStyle ?? null,
          currentClubId: draft.team ?? null,
          sportId: "cricket",
          sport: "cricket",
          country: draft.country ?? null,
          dateOfBirth: draft.overview?.dob ?? draft.dob ?? null,
          profileImage: draft.avatar ?? draft.profileImage ?? null,
          bio: draft.about ?? draft.bio ?? null,
          status: "published",
          auditStatus: "pending",
          generatedBy: "ai",
          createdAt: now,
          updatedAt: now,
        }
      : {
          entityId: finalEntityId,
          sk: "PROFILE#META",
          athleteId: id,
          id,
          name: draft.name || name,
          sport: finalSport,
          country: draft.country ?? null,
          profileImage: draft.avatar ?? draft.profileImage ?? null,
          coverImage: draft.coverImage ?? null,
          bio: draft.about ?? draft.bio ?? "",
          welcomeMessage: draft.about ?? draft.welcomeMessage ?? "",
          isVerified: true,
          coachName: draft.overview?.specialization ?? draft.coachName ?? null,
          dob: draft.overview?.dob ?? draft.dob ?? null,
          coreInfo: draft.coreInfo ?? {
            name: draft.name || name,
            country: draft.country ?? null,
            profileImage: draft.avatar ?? draft.profileImage ?? null,
            dob: draft.overview?.dob ?? draft.dob ?? null,
            sport: finalSport,
            role: draft.role ?? draft.discipline ?? "Athlete",
          },
          performance: draft.performance ?? draft.overview ?? {},
          record_highlight: draft.record_highlight ?? draft.records ?? [],
          analytics: draft.analytics ?? {},
          status: "published",
          auditStatus: "pending",
          generatedBy: "ai",
          createdAt: now,
          updatedAt: now,
        };

    await ddb.send(new PutCommand({ TableName: finalTable, Item: finalItem }));

    // Audit trail for admin review UI
    try {
      await db.collection("athleteReviewQueue").doc(id).set({
        athleteId: id,
        athleteName: draft.name || name,
        sport: finalSport,
        status: "auto-published",
        draft: finalItem,
        createdAt: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn("[athleteReviewQueue audit notice]:", auditErr);
    }

    return NextResponse.json({
      success: true,
      status: "published",
      id,
      isCricket: isFinalCricket,
      profile: finalItem,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/player-profile/generate unexpected error:", error);
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}