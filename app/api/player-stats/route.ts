

// // api/player-stats/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { validatePlayerStatsCreate } from "../../../lib/validations/playerStatsValidation";
// import { validatePlayerStatsRecord } from "../../../lib/ingestion/playerStatsRules";

// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);

//   const tournament = searchParams.get("tournament");
//   const gender     = searchParams.get("gender");
//   const format     = searchParams.get("format");
//   const playerId   = searchParams.get("player_id");
//   const search     = searchParams.get("search");
//   const countOnly  = searchParams.get("count") === "true";

//   const limit = Math.min(
//     parseInt(searchParams.get("limit") ?? searchParams.get("pageSize") ?? "20", 10),
//     100
//   );

//   const after = searchParams.get("after") ?? searchParams.get("cursor");

//   try {
//     // ── Global search: fan out across both tournaments ─────────────────────
//     // When `search` is present but no `tournament` is specified, search both
//     // IPL and WPL collections in parallel and merge results.
//     if (search && !tournament) {
//       const term      = search.trim();
//       const termLower = term.toLowerCase();

//       // Normalize for Firestore prefix query:
//       // We store player_name as-is (title case), so we try three variants:
//       // original, lowercase, and title-cased first letter.
//       // Firestore range query only matches the exact case prefix, so we run
//       // three parallel queries and deduplicate by player_id.
//       const titleCased = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();

//       const buildPrefixQuery = (base: string) => {
//         const end = base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + 1);
//         return db
//           .collection("playerStats")
//           .orderBy("player_name")
//           .orderBy("__name__")
//           .where("player_name", ">=", base)
//           .where("player_name", "<", end)
//           .limit(limit);
//       };

//       // Run all 3 case variants × 2 tournaments won't work in Firestore without
//       // composite indexes per tournament. Instead we run 3 prefix queries on the
//       // whole collection (no tournament filter) and filter in-memory afterward.
//       const [snapA, snapB, snapC] = await Promise.all([
//         buildPrefixQuery(titleCased).get(),
//         buildPrefixQuery(term).get(),
//         buildPrefixQuery(termLower).get(),
//       ]);

//       // Merge + deduplicate by document id
//       const seen  = new Set<string>();
//       const merged: Record<string, unknown>[] = [];

//       for (const snap of [snapA, snapB, snapC]) {
//         for (const doc of snap.docs) {
//           if (!seen.has(doc.id)) {
//             seen.add(doc.id);
//             merged.push({ id: doc.id, ...doc.data() });
//           }
//         }
//       }

//       // Also do a fallback: try splitting on space/no-space variants.
//       // e.g. "smritimandana" → Firestore won't match "Smriti Mandana"
//       // So we also run a query with just the first word (up to first space).
//       // If the user typed "smritimandana" (no space), split at reasonable point isn't possible
//       // in Firestore — but we can catch it by also querying the first 5 chars:
//       if (merged.length === 0 && term.length >= 3) {
//         const shortPrefix = titleCased.slice(0, Math.min(5, titleCased.length));
//         const shortEnd    = shortPrefix.slice(0, -1) + String.fromCharCode(shortPrefix.charCodeAt(shortPrefix.length - 1) + 1);
//         const fallbackSnap = await db
//           .collection("playerStats")
//           .orderBy("player_name")
//           .orderBy("__name__")
//           .where("player_name", ">=", shortPrefix)
//           .where("player_name", "<", shortEnd)
//           .limit(20)
//           .get();

//         for (const doc of fallbackSnap.docs) {
//           if (!seen.has(doc.id)) {
//             seen.add(doc.id);
//             merged.push({ id: doc.id, ...doc.data() });
//           }
//         }
//       }

//       // In-memory filter: keep only docs whose player_name contains the search
//       // term (case-insensitive). This handles partial matches and no-space inputs.
//       const termNorm = term.toLowerCase().replace(/\s+/g, "");
//       const filtered = merged.filter((doc) => {
//         const name = ((doc.player_name as string) ?? "").toLowerCase();
//         const nameNorm = name.replace(/\s+/g, "");
//         return (
//           name.includes(termLower) ||
//           nameNorm.includes(termNorm)
//         );
//       });

//       return NextResponse.json(
//         { success: true, data: filtered.slice(0, limit), nextCursor: null, pageSize: filtered.length },
//         { headers: { "Cache-Control": "public, max-age=60" } }
//       );
//     }

//     // ── Standard single-tournament query (existing behaviour) ─────────────
//     let query: FirebaseFirestore.Query = db.collection("playerStats");

//     if (tournament) query = query.where("tournament", "==", tournament);
//     if (gender)     query = query.where("gender",     "==", gender);
//     if (format)     query = query.where("format",     "==", format);
//     if (playerId)   query = query.where("player_id",  "==", playerId);

//     if (countOnly) {
//       const countSnap = await query.count().get();
//       return NextResponse.json(
//         { success: true, total: countSnap.data().count },
//         { headers: { "Cache-Control": "public, max-age=300" } }
//       );
//     }

//     if (search) {
//       const term = search.trim();
//       const end  = term.slice(0, -1) + String.fromCharCode(term.charCodeAt(term.length - 1) + 1);
//       query = query
//         .orderBy("player_name")
//         .orderBy("__name__")
//         .where("player_name", ">=", term)
//         .where("player_name", "<",  end);
//     } else {
//       query = query.orderBy("player_name").orderBy("__name__");
//     }

//     if (after) {
//       const cursorDoc = await db.collection("playerStats").doc(after).get();
//       if (cursorDoc.exists) query = query.startAfter(cursorDoc);
//     }

//     query = query.limit(limit);

//     const snap = await query.get();
//     const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
//     const nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

//     return NextResponse.json(
//       { success: true, data, nextCursor, pageSize: data.length },
//       { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
//     );

//   } catch (err) {
//     const msg = err instanceof Error ? err.message : String(err);
//     return NextResponse.json({ success: false, error: msg }, { status: 500 });
//   }
// }


// export async function POST(req: NextRequest) {
//   let body: Record<string, unknown>;
//   try {
//     body = await req.json();
//   } catch {
//     return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
//   }

//   const injection = validatePlayerStatsRecord(body);
//   if (!injection.valid) {
//     return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
//   }

//   const schema = validatePlayerStatsCreate(body);
//   if (!schema.success) {
//     return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
//   }

//   const stat = schema.data!;

//   const existing = await db
//     .collection("playerStats")
//     .where("player_name", "==", stat.player_name)
//     .where("tournament",  "==", stat.tournament)
//     .limit(1)
//     .get();

//   if (!existing.empty) {
//     return NextResponse.json(
//       { success: false, error: `${stat.player_name} already exists for ${stat.tournament}` },
//       { status: 409 }
//     );
//   }

//   const docRef = await db.collection("playerStats").add({
//     ...stat,
//     created_at: FieldValue.serverTimestamp(),
//     updated_at: FieldValue.serverTimestamp(),
//   });

//   return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
// }








// api/player-stats/route.ts
//
// QUOTA FIXES applied:
//  1. Search uses player_name_lower prefix query (Strategy A: first-name searches).
//     Falls back to name_words array-contains (Strategy B: surname-only searches).
//     e.g. "mandhana" → A returns 0 → B: array-contains "mandhana" → finds "Smriti Mandhana"
//  2. Cursor pagination uses "fieldValue|docId" — no extra document fetch.
//  3. Cache-Control for search raised to 300s.
//  4. POST writes both player_name_lower and name_words on every new doc.
//
// MIGRATION REQUIRED (one-time):
//   Run: npx tsx scripts/migrate-player-name-lower.ts
//   (updated script now also writes name_words)
//
// FIRESTORE INDEXES REQUIRED:
//   1. Collection: playerStats  Fields: player_name_lower ASC, __name__ ASC
//   2. Collection: playerStats  Fields: name_words ASC, player_name_lower ASC, __name__ ASC

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validatePlayerStatsCreate } from "../../../lib/validations/playerStatsValidation";
import { validatePlayerStatsRecord } from "../../../lib/ingestion/playerStatsRules";

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

  // Cursor is "player_name_lower_value|docId" — no extra document fetch needed.
  const after = searchParams.get("after") ?? searchParams.get("cursor");

  try {

    // ── Search path ───────────────────────────────────────────────────────────
    //
    // TWO-STRATEGY approach — no full collection scans:
    //
    // STRATEGY A — prefix on player_name_lower using the full search term.
    //   Works when the user types the first name: "smriti", "harman", "shafali".
    //   player_name_lower = "smriti mandhana" → prefix "smriti" → ✓
    //
    // STRATEGY B — array-contains on name_words using the search term.
    //   Works when the user types a surname: "mandhana", "gill", "verma".
    //   name_words = ["smriti","mandhana"] → array-contains "mandhana" → ✓
    //   Only fires when Strategy A returns 0 results — costs 1 extra query, not a full scan.

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

      // Strategy A: prefix query on player_name_lower
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
      let data = snapA.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Strategy B: array-contains on name_words (surname-only searches)
      // Only fires when Strategy A returns nothing.
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

      const lastDoc    = data[data.length - 1] as Record<string, unknown> | undefined;
      const nextCursor = data.length === limit && lastDoc
        ? `${(lastDoc as Record<string, unknown>).player_name_lower}|${(lastDoc as Record<string, unknown>).id}`
        : null;

      return NextResponse.json(
        { success: true, data, nextCursor, pageSize: data.length },
        { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
      );
    }

    // ── Standard query path ───────────────────────────────────────────────────
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

    // Cursor: "player_name_value|docId" — no extra document fetch.
    if (after) {
      const [nameValue, docId] = after.split("|");
      if (nameValue && docId) {
        query = query.startAfter(nameValue, docId);
      } else {
        // Fallback for old-format cursors. Remove after clients migrate.
        const cursorDoc = await db.collection("playerStats").doc(after).get();
        if (cursorDoc.exists) query = query.startAfter(cursorDoc);
      }
    }

    query = query.limit(limit);

    const snap = await query.get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const lastDoc    = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.docs.length === limit && lastDoc
      ? `${lastDoc.data().player_name}|${lastDoc.id}`
      : null;

    return NextResponse.json(
      { success: true, data, nextCursor, pageSize: data.length },
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

  const nameLower = stat.player_name.toLowerCase();
  const words     = nameLower.replace(/[^a-z0-9\s]/g, "").split(" ").filter(Boolean);

  const docRef = await db.collection("playerStats").add({
    ...stat,
    player_name_lower: nameLower,
    name_words:        words,       // ["smriti", "mandhana"]
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
}