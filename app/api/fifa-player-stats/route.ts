// api/fifa-player-stats/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaPlayerStatsCreate } from "@/lib/validations/fifaPlayerStatsValidation";
import { validateFifaPlayerStatsRecord } from "@/lib/ingestion/fifaPlayerStatsRules";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function fuzzyMatch(playerName: string, rawQuery: string): boolean {
  const name       = normalise(playerName);
  const query      = normalise(rawQuery);
  const queryWords = query.split(" ").filter(Boolean);
  const nameWords  = name.split(" ").filter(Boolean);

  if (name.includes(query)) return true;

  return queryWords.every((qw) =>
    nameWords.some((nw) => {
      if (nw.includes(qw)) return true;
      if (qw.length >= 5 && nw.length >= 5) {
        let common = 0;
        const maxCheck = Math.min(qw.length, nw.length);
        while (common < maxCheck && qw[common] === nw[common]) common++;
        const diff = Math.abs(qw.length - nw.length) + (maxCheck - common);
        return common >= 4 && diff <= 2;
      }
      return false;
    })
  );
}

// ── GET /api/fifa-player-stats ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search     = searchParams.get("search")?.trim() ?? "";
  const playerId   = searchParams.get("player_id")?.trim() ?? "";
  const tournament = searchParams.get("tournament");
  const team       = searchParams.get("team");
  const position   = searchParams.get("position");
  const season     = searchParams.get("season");
  const limit      = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after      = searchParams.get("after");

  try {
    let data: any[] = [];

    // 1. Try DynamoDB SportsData
    try {
      let filterExpr = "begins_with(entityId, :fPrefix) AND sk = :metaSk";
      const exprVals: Record<string, any> = {
        ":fPrefix": "FIFA_PLAYER_STAT#",
        ":metaSk": "FIFA_PLAYER_STAT#META",
      };

      if (playerId) {
        filterExpr += " AND player_id = :pid";
        exprVals[":pid"] = playerId;
      }
      if (tournament) {
        filterExpr += " AND tournament = :t";
        exprVals[":t"] = tournament;
      }
      if (team) {
        filterExpr += " AND team = :tm";
        exprVals[":tm"] = team;
      }
      if (position) {
        filterExpr += " AND position = :pos";
        exprVals[":pos"] = position;
      }
      if (season) {
        filterExpr += " AND season = :season";
        exprVals[":season"] = parseInt(season, 10);
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 300,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        data = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^FIFA_PLAYER_STAT#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[fifa-player-stats GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (data.length === 0 && db) {
      if (playerId) {
        let q: FirebaseFirestore.Query = db
          .collection("fifaPlayerStats")
          .where("player_id", "==", playerId);
        if (tournament) q = q.where("tournament", "==", tournament);
        q = q.limit(limit);

        const snap = await q.get();
        data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        return NextResponse.json(
          { success: true, data, nextCursor: null, count: data.length },
          { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
        );
      }

      if (search) {
        const normQuery = normalise(search);
        const firstWord = normQuery.split(" ")[0];

        if (!firstWord) {
          return NextResponse.json(
            { success: true, data: [], nextCursor: null, count: 0 },
            { headers: { "Cache-Control": "public, max-age=300" } }
          );
        }

        const prefixEnd = firstWord.slice(0, -1) +
                          String.fromCharCode(firstWord.charCodeAt(firstWord.length - 1) + 1);

        let qA: FirebaseFirestore.Query = db
          .collection("fifaPlayerStats")
          .orderBy("player_name_lower")
          .orderBy("__name__")
          .where("player_name_lower", ">=", firstWord)
          .where("player_name_lower", "<",  prefixEnd);

        if (tournament) qA = qA.where("tournament", "==", tournament);
        qA = qA.limit(200);

        const snapA = await qA.get();
        let all = snapA.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));

        if (all.length === 0) {
          let qB: FirebaseFirestore.Query = db
            .collection("fifaPlayerStats")
            .where("name_words", "array-contains", firstWord)
            .orderBy("player_name_lower")
            .orderBy("__name__");

          if (tournament) qB = qB.where("tournament", "==", tournament);
          qB = qB.limit(200);

          const snapB = await qB.get();
          all = snapB.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));
        }

        data = all;
      } else {
        let query: FirebaseFirestore.Query = db
          .collection("fifaPlayerStats")
          .orderBy("player_name")
          .orderBy("__name__");

        if (tournament) query = query.where("tournament", "==", tournament);
        if (team)       query = query.where("team",       "==", team);
        if (position)   query = query.where("position",   "==", position);
        if (season)     query = query.where("season",     "==", parseInt(season, 10));

        if (after) {
          const [nameValue, docId] = after.split("|");
          if (nameValue && docId) {
            query = query.startAfter(nameValue, docId);
          } else {
            const cursorDoc = await db.collection("fifaPlayerStats").doc(after).get();
            if (cursorDoc.exists) query = query.startAfter(cursorDoc);
          }
        }

        query = query.limit(limit);

        const snap = await query.get();
        data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    }

    if (search && data.length > 0) {
      data = data
        .filter((p) => fuzzyMatch(String(p.player_name ?? ""), search))
        .sort((a, b) => String(a.player_name ?? "").localeCompare(String(b.player_name ?? "")));
    }

    data.sort((a, b) => String(a.player_name || "").localeCompare(String(b.player_name || "")));
    const paginated = data.slice(0, limit);
    const lastDoc = paginated[paginated.length - 1];
    const nextCursor = paginated.length === limit && lastDoc
      ? `${lastDoc.player_name}|${lastDoc.id}`
      : null;

    return NextResponse.json(
      { success: true, data: paginated, nextCursor, count: paginated.length },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ── POST /api/fifa-player-stats ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validateFifaPlayerStatsRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validateFifaPlayerStatsCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const stat = schema.data!;

  if (db) {
    const existing = await db
      .collection("fifaPlayerStats")
      .where("player_name", "==", stat.player_name)
      .where("tournament",  "==", stat.tournament)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { success: false, error: `${stat.player_name} already exists for ${stat.tournament}` },
        { status: 409 }
      );
    }
  }

  const nameLower = stat.player_name.toLowerCase();
  const words     = nameLower.replace(/[^a-z0-9\s]/g, "").split(" ").filter(Boolean);
  const now = Date.now();
  const id = `fifastat_${now}_${Math.random().toString(36).substring(2, 9)}`;

  const statDoc = {
    id,
    ...stat,
    player_name_lower: nameLower,
    name_words: words,
    created_at: now,
    updated_at: now,
  };

  // Dual-write
  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `FIFA_PLAYER_STAT#${id}`,
      sk: "FIFA_PLAYER_STAT#META",
      ...statDoc,
    },
    firestoreRef: db.collection("fifaPlayerStats").doc(id),
    firestoreData: {
      ...statDoc,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, id }, { status: 201 });
}