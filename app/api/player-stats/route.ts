// api/player-stats/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { FieldValue } from "firebase-admin/firestore";
import { validatePlayerStatsCreate } from "../../../lib/validations/playerStatsValidation";
import { validatePlayerStatsRecord } from "../../../lib/ingestion/playerStatsRules";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const tournament = searchParams.get("tournament");
  const gender     = searchParams.get("gender");
  const format     = searchParams.get("format");
  const playerId   = searchParams.get("player_id");
  const search     = searchParams.get("search");
  const countOnly  = searchParams.get("count") === "true";

  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? searchParams.get("pageSize") ?? "20", 10),
    100
  );

  const after = searchParams.get("after") ?? searchParams.get("cursor");

  try {
    let data: any[] = [];

    // 1. Try DynamoDB SportsData
    try {
      let filterExpr = "begins_with(entityId, :pPrefix) AND sk = :metaSk";
      const exprVals: Record<string, any> = {
        ":pPrefix": "PLAYER_STAT#",
        ":metaSk": "PLAYER_STAT#META",
      };

      if (tournament) {
        filterExpr += " AND tournament = :t";
        exprVals[":t"] = tournament;
      }
      if (gender) {
        filterExpr += " AND gender = :g";
        exprVals[":g"] = gender;
      }
      if (format) {
        filterExpr += " AND format = :f";
        exprVals[":f"] = format;
      }
      if (playerId) {
        filterExpr += " AND player_id = :pid";
        exprVals[":pid"] = playerId;
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
          id: item.id || (item.entityId as string).replace(/^PLAYER_STAT#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[player-stats GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (data.length === 0 && db) {
      if (search) {
        const termLower = search.trim().toLowerCase().replace(/\s+/g, " ");
        const firstWord = termLower.split(" ")[0];

        if (!firstWord) {
          return NextResponse.json(
            { success: true, data: [], nextCursor: null, pageSize: 0 },
            { headers: { "Cache-Control": "public, max-age=300" } }
          );
        }

        const termEnd = firstWord.slice(0, -1) +
                        String.fromCharCode(firstWord.charCodeAt(firstWord.length - 1) + 1);

        let qA: FirebaseFirestore.Query = db.collection("playerStats")
          .orderBy("player_name_lower")
          .orderBy("__name__")
          .where("player_name_lower", ">=", firstWord)
          .where("player_name_lower", "<",  termEnd);

        if (tournament) qA = qA.where("tournament", "==", tournament);
        if (gender)     qA = qA.where("gender",     "==", gender);
        if (format)     qA = qA.where("format",     "==", format);
        qA = qA.limit(limit);

        const snapA = await qA.get();
        data = snapA.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (data.length === 0) {
          let qB: FirebaseFirestore.Query = db.collection("playerStats")
            .where("name_words", "array-contains", firstWord)
            .orderBy("player_name_lower")
            .orderBy("__name__");

          if (tournament) qB = qB.where("tournament", "==", tournament);
          if (gender)     qB = qB.where("gender",     "==", gender);
          if (format)     qB = qB.where("format",     "==", format);
          qB = qB.limit(limit);

          const snapB = await qB.get();
          data = snapB.docs.map((d) => ({ id: d.id, ...d.data() }));
        }

        const lastDoc = data[data.length - 1] as Record<string, unknown> | undefined;
        const nextCursor = data.length === limit && lastDoc
          ? `${(lastDoc as Record<string, unknown>).player_name_lower}|${(lastDoc as Record<string, unknown>).id}`
          : null;

        return NextResponse.json(
          { success: true, data, nextCursor, pageSize: data.length },
          { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
        );
      }

      let query: FirebaseFirestore.Query = db.collection("playerStats");

      if (tournament) query = query.where("tournament", "==", tournament);
      if (gender)     query = query.where("gender",     "==", gender);
      if (format)     query = query.where("format",     "==", format);
      if (playerId)   query = query.where("player_id",  "==", playerId);

      if (countOnly) {
        const countSnap = await query.count().get();
        return NextResponse.json(
          { success: true, total: countSnap.data().count },
          { headers: { "Cache-Control": "public, max-age=300" } }
        );
      }

      query = query.orderBy("player_name").orderBy("__name__");

      if (after) {
        const [nameValue, docId] = after.split("|");
        if (nameValue && docId) {
          query = query.startAfter(nameValue, docId);
        } else {
          const cursorDoc = await db.collection("playerStats").doc(after).get();
          if (cursorDoc.exists) query = query.startAfter(cursorDoc);
        }
      }

      query = query.limit(limit);

      const snap = await query.get();
      data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    if (search && data.length > 0) {
      const qLower = search.toLowerCase();
      data = data.filter((p) =>
        (p.player_name && p.player_name.toLowerCase().includes(qLower)) ||
        (p.player_name_lower && p.player_name_lower.includes(qLower))
      );
    }

    if (countOnly) {
      return NextResponse.json(
        { success: true, total: data.length },
        { headers: { "Cache-Control": "public, max-age=300" } }
      );
    }

    data.sort((a, b) => String(a.player_name || "").localeCompare(String(b.player_name || "")));
    const paginated = data.slice(0, limit);
    const lastDoc = paginated[paginated.length - 1];
    const nextCursor = paginated.length === limit && lastDoc
      ? `${lastDoc.player_name}|${lastDoc.id}`
      : null;

    return NextResponse.json(
      { success: true, data: paginated, nextCursor, pageSize: paginated.length },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validatePlayerStatsRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validatePlayerStatsCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const stat = schema.data!;

  if (db) {
    const existing = await db
      .collection("playerStats")
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
  const id = `pstat_${now}_${Math.random().toString(36).substring(2, 9)}`;

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
      entityId: `PLAYER_STAT#${id}`,
      sk: "PLAYER_STAT#META",
      ...statDoc,
    },
    firestoreRef: db.collection("playerStats").doc(id),
    firestoreData: {
      ...statDoc,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, id }, { status: 201 });
}