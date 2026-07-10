// // api/wt20-clubs/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { validateWT20ClubCreate } from "../../../lib/validations/wt20ClubValidation";
// import { validateWT20ClubRecord } from "../../../lib/ingestion/wt20ClubRules";

// // GET /api/wt20-clubs
// // Query params: limit, after (cursor)
// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
//   const after = searchParams.get("after");

//   try {
//     let query: FirebaseFirestore.Query = db
//       .collection("wt20Clubs")
//       .orderBy("icc_ranking", "asc");

//     if (after) {
//       const cursorDoc = await db.collection("wt20Clubs").doc(after.toUpperCase()).get();
//       if (cursorDoc.exists) query = query.startAfter(cursorDoc);
//     }

//     query = query.limit(limit);
//     const snap = await query.get();
//     const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
//     const nextCursor =
//       snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

//     return NextResponse.json({ success: true, data, nextCursor, count: data.length });
//   } catch (err) {
//     const msg = err instanceof Error ? err.message : String(err);
//     return NextResponse.json({ success: false, error: msg }, { status: 500 });
//   }
// }

// // POST /api/wt20-clubs — single manual entry
// export async function POST(req: NextRequest) {
//   let body: Record<string, unknown>;
//   try {
//     body = await req.json();
//   } catch {
//     return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
//   }

//   const injection = validateWT20ClubRecord(body);
//   if (!injection.valid) {
//     return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
//   }

//   const schema = validateWT20ClubCreate(body);
//   if (!schema.success) {
//     return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
//   }

//   const club = schema.data!;
//   const existing = await db.collection("wt20Clubs").doc(club.club_id).get();
//   if (existing.exists) {
//     return NextResponse.json(
//       { success: false, error: `Club ${club.club_id} already exists` },
//       { status: 409 }
//     );
//   }

//   await db.collection("wt20Clubs").doc(club.club_id).set({
//     ...club,
//     created_at: FieldValue.serverTimestamp(),
//     updated_at: FieldValue.serverTimestamp(),
//   });

//   return NextResponse.json({ success: true, club_id: club.club_id }, { status: 201 });
// }





// api/wt20-clubs/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateWT20ClubCreate } from "../../../lib/validations/wt20ClubValidation";
import { validateWT20ClubRecord } from "../../../lib/ingestion/wt20ClubRules";

// ── Search helpers ─────────────────────────────────────────────────────────────

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
    // ── Search path: array-contains on country_words ───────────────────────
    // Uses the migrated field — single index, no collection scan.
    if (search) {
      const term = normalise(search);
      const firstWord = term.split(" ")[0]; // query on the first word only

      if (!firstWord) {
        return NextResponse.json({ success: true, data: [], count: 0 });
      }

      // array-contains matches any doc whose country_words includes firstWord.
      // Works for "aus", "australia", "new", "new zealand", "south", etc.
      const snap = await db
        .collection("wt20Clubs")
        .where("country_words", "array-contains", firstWord)
        .limit(20)
        .get();

      // In-memory fuzzy filter handles multi-word queries like "new zealand"
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((club: Record<string, unknown>) =>
          fuzzyMatch(term, String(club.country ?? ""))
        );

      return NextResponse.json({ success: true, data, count: data.length });
    }

    // ── Paginated list path ────────────────────────────────────────────────
    let query: FirebaseFirestore.Query = db
      .collection("wt20Clubs")
      .orderBy("icc_ranking", "asc");

    if (after) {
      const cursorDoc = await db.collection("wt20Clubs").doc(after.toUpperCase()).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    query = query.limit(limit);
    const snap = await query.get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor =
      snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

    return NextResponse.json({ success: true, data, nextCursor, count: data.length });
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
  const existing = await db.collection("wt20Clubs").doc(club.club_id).get();
  if (existing.exists) {
    return NextResponse.json(
      { success: false, error: `Club ${club.club_id} already exists` },
      { status: 409 }
    );
  }

  await db.collection("wt20Clubs").doc(club.club_id).set({
    ...club,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, club_id: club.club_id }, { status: 201 });
}