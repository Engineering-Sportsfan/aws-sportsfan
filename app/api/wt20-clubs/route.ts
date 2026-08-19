// app/api/wt20-clubs/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateWT20ClubCreate } from "../../../lib/validations/wt20ClubValidation";
import { validateWT20ClubRecord } from "../../../lib/ingestion/wt20ClubRules";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function fuzzyMatch(query: string, country: string): boolean {
  const qWords = normalise(query).split(" ").filter(Boolean);
  const cWords = normalise(country).split(" ").filter(Boolean);
  return qWords.every((qw) =>
    cWords.some((cw) => cw.startsWith(qw) || qw.startsWith(cw.slice(0, 4)))
  );
}

// GET /api/wt20-clubs
// Query params: limit, after (cursor), search
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
  const after  = searchParams.get("after");
  const search = searchParams.get("search");

  try {
    let clubs: any[] = [];

    // 1. Query DynamoDB SportsData
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :cPrefix) AND sk = :metaSk",
          ExpressionAttributeValues: {
            ":cPrefix": "WT20_CLUB#",
            ":metaSk": "CLUB#META",
          },
          Limit: 200,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        clubs = (scanRes.Items as any[]).map((item) => ({
          id: item.club_id || (item.entityId as string)?.replace(/^WT20_CLUB#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[wt20-clubs GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore if empty
    if (clubs.length === 0) {
      if (search) {
        const term = normalise(search);
        const firstWord = term.split(" ")[0];

        if (!firstWord) {
          return NextResponse.json({ success: true, data: [], count: 0 });
        }

        const snap = await db
          .collection("wt20Clubs")
          .where("country_words", "array-contains", firstWord)
          .limit(20)
          .get();

        const data = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((club: Record<string, unknown>) =>
            fuzzyMatch(term, String(club.country ?? ""))
          );

        return NextResponse.json({ success: true, data, count: data.length });
      }

      let query: FirebaseFirestore.Query = db
        .collection("wt20Clubs")
        .orderBy("icc_ranking", "asc");

      if (after) {
        const cursorDoc = await db.collection("wt20Clubs").doc(after.toUpperCase()).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }

      query = query.limit(limit);
      const snap = await query.get();
      clubs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    // Filter by search if provided
    if (search) {
      const term = normalise(search);
      clubs = clubs.filter((club: Record<string, unknown>) =>
        fuzzyMatch(term, String(club.country ?? club.name ?? ""))
      );
    }

    clubs.sort((a, b) => Number(a.icc_ranking || 999) - Number(b.icc_ranking || 999));
    const paginated = clubs.slice(0, limit);
    const nextCursor = paginated.length === limit ? paginated[paginated.length - 1].id : null;

    return NextResponse.json({ success: true, data: paginated, nextCursor, count: paginated.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/wt20-clubs — single manual entry
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const injection = validateWT20ClubRecord(body);
  if (!injection.valid) {
    return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
  }

  const schema = validateWT20ClubCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const club = schema.data!;

  // Check for existing
  let exists = false;
  try {
    const getRes = await docClient.send(
      new GetCommand({
        TableName: "SportsData",
        Key: {
          entityId: `WT20_CLUB#${club.club_id.toUpperCase()}`,
          sk: "CLUB#META",
        },
      })
    );
    if (getRes.Item) exists = true;
  } catch (e) {
    // fallback
  }

  if (!exists) {
    const existing = await db.collection("wt20Clubs").doc(club.club_id.toUpperCase()).get();
    if (existing.exists) exists = true;
  }

  if (exists) {
    return NextResponse.json(
      { success: false, error: `Club ${club.club_id} already exists` },
      { status: 409 }
    );
  }

  const now = Date.now();
  const clubData = {
    ...club,
    club_id: club.club_id.toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };

  await dualWrite({
    tableName: "SportsData",
    dynamoItem: {
      entityId: `WT20_CLUB#${clubData.club_id}`,
      sk: "CLUB#META",
      ...clubData,
    },
    firestoreRef: db.collection("wt20Clubs").doc(clubData.club_id),
    firestoreData: {
      ...clubData,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  return NextResponse.json({ success: true, club_id: clubData.club_id }, { status: 201 });
}