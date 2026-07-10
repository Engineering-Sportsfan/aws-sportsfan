// api/wt20-clubs/deltas/route.ts
// GET /api/wt20-clubs/deltas
// Query params: match_day, club_id, limit

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchDay = searchParams.get("match_day");
  const clubId   = searchParams.get("club_id")?.toUpperCase();
  const limit    = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  try {
    let query: FirebaseFirestore.Query = db
      .collection("wt20DeltaLogs")
      .orderBy("match_day", "desc")
      .orderBy("ingested_at", "desc");

    if (matchDay) query = query.where("match_day", "==", parseInt(matchDay, 10));
    if (clubId)   query = query.where("club_id", "==", clubId);

    query = query.limit(limit);
    const snap = await query.get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ success: true, data, count: data.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}