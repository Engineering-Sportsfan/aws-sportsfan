



// // api/fifa-player-stats/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { validateFifaPlayerStatsCreate } from "@/lib/validations/fifaPlayerStatsValidation";
// import { validateFifaPlayerStatsRecord } from "@/lib/ingestion/fifaPlayerStatsRules";

// // ── Search helpers ─────────────────────────────────────────────────────────────

// function normalise(s: string): string {
//     return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
// }

// /**
//  * Fuzzy player-name match. Rules in order:
//  *
//  * 1. Full normalised query is a substring of the normalised name
//  *    "cristiano ronaldo" → "cristiano ronaldo" ✓
//  *
//  * 2. Every query word appears as a substring inside some name word
//  *    "ronaldo"  → name word "ronaldo" contains it ✓
//  *    "alex"     → name word "alexis" contains it  ✓
//  *    "mitro"    → name word "mitrovic" contains it ✓
//  *
//  * 3. Typo tolerance for long words (both ≥5 chars):
//  *    count actual shared prefix characters; require ≥4 match AND
//  *    total edit distance (length diff + mismatch chars) ≤ 2
//  *    "mbape" vs "mbappe" → 5 chars match, diff=1 ✓
//  *
//  * Deliberately rejects short noise words matching inside long query words:
//  *    "al" will NOT match against query word "ronaldo"
//  */
// function fuzzyMatch(playerName: string, rawQuery: string): boolean {
//     const name       = normalise(playerName);
//     const query      = normalise(rawQuery);
//     const queryWords = query.split(" ").filter(Boolean);
//     const nameWords  = name.split(" ").filter(Boolean);

//     // Rule 1: full phrase match
//     if (name.includes(query)) return true;

//     // Rules 2 & 3: every query word must match at least one name word
//     return queryWords.every((qw) =>
//         nameWords.some((nw) => {
//             // Rule 2: name word contains the query word
//             if (nw.includes(qw)) return true;

//             // Rule 3: typo tolerance — both words long enough
//             if (qw.length >= 5 && nw.length >= 5) {
//                 let common = 0;
//                 const maxCheck = Math.min(qw.length, nw.length);
//                 while (common < maxCheck && qw[common] === nw[common]) common++;
//                 const diff = Math.abs(qw.length - nw.length) + (maxCheck - common);
//                 return common >= 4 && diff <= 2;
//             }

//             return false;
//         })
//     );
// }

// // ── GET /api/fifa-player-stats ─────────────────────────────────────────────────
// // Params:
// //   search     – free-text name search
// //   player_id  – exact player_id lookup
// //   tournament – filter
// //   team       – filter
// //   position   – GK | DF | MF | FW
// //   season     – numeric year
// //   limit      – max results (default 50, max 500)
// //   after      – pagination cursor doc ID

// export async function GET(req: NextRequest) {
//     const { searchParams } = new URL(req.url);
//     const search     = searchParams.get("search")?.trim() ?? "";
//     const playerId   = searchParams.get("player_id")?.trim() ?? "";
//     const tournament = searchParams.get("tournament");
//     const team       = searchParams.get("team");
//     const position   = searchParams.get("position");
//     const season     = searchParams.get("season");
//     const limit      = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
//     const after      = searchParams.get("after");

//     try {

//         // ── 1. Exact player_id lookup ─────────────────────────────────────────
//         if (playerId) {
//             let q: FirebaseFirestore.Query = db
//                 .collection("fifaPlayerStats")
//                 .where("player_id", "==", playerId);
//             if (tournament) q = q.where("tournament", "==", tournament);
//             q = q.limit(limit);

//             const snap = await q.get();
//             const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
//             return NextResponse.json({ success: true, data, nextCursor: null, count: data.length });
//         }

//         // ── 2. Free-text name search ──────────────────────────────────────────
//         // Fetch all docs for the tournament (FIFA WC ~600 players) then filter
//         // in memory. Avoids case-sensitive Firestore prefix query limitations.
//         if (search) {
//             let q: FirebaseFirestore.Query = db
//                 .collection("fifaPlayerStats")
//                 .orderBy("player_name")
//                 .limit(1000);

//             if (tournament) q = q.where("tournament", "==", tournament);

//             const snap = await q.get();
//             const all  = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>));

//             const filtered = all
//                 .filter((p) => fuzzyMatch(String(p.player_name ?? ""), search))
//                 .sort((a, b) => String(a.player_name ?? "").localeCompare(String(b.player_name ?? "")))
//                 .slice(0, limit);

//             return NextResponse.json({ success: true, data: filtered, nextCursor: null, count: filtered.length });
//         }

//         // ── 3. Standard paginated list ────────────────────────────────────────
//         let query: FirebaseFirestore.Query = db
//             .collection("fifaPlayerStats")
//             .orderBy("player_name");

//         if (tournament) query = query.where("tournament", "==", tournament);
//         if (team)       query = query.where("team",       "==", team);
//         if (position)   query = query.where("position",   "==", position);
//         if (season)     query = query.where("season",     "==", parseInt(season, 10));

//         if (after) {
//             const cursorDoc = await db.collection("fifaPlayerStats").doc(after).get();
//             if (cursorDoc.exists) query = query.startAfter(cursorDoc);
//         }

//         query = query.limit(limit);

//         let snap: FirebaseFirestore.QuerySnapshot;
//         try {
//             snap = await query.get();
//         } catch (err) {
//             const msg = err instanceof Error ? err.message : String(err);
//             return NextResponse.json({ success: false, error: msg }, { status: 500 });
//         }

//         const data       = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
//         const nextCursor = snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null;

//         return NextResponse.json({ success: true, data, nextCursor, count: data.length });

//     } catch (err) {
//         const msg = err instanceof Error ? err.message : String(err);
//         return NextResponse.json({ success: false, error: msg }, { status: 500 });
//     }
// }

// // ── POST /api/fifa-player-stats ────────────────────────────────────────────────

// export async function POST(req: NextRequest) {
//     let body: Record<string, unknown>;
//     try { body = await req.json(); } catch {
//         return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
//     }

//     const injection = validateFifaPlayerStatsRecord(body);
//     if (!injection.valid) {
//         return NextResponse.json({ success: false, errors: injection.errors }, { status: 422 });
//     }

//     const schema = validateFifaPlayerStatsCreate(body);
//     if (!schema.success) {
//         return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
//     }

//     const stat = schema.data!;

//     const existing = await db
//         .collection("fifaPlayerStats")
//         .where("player_name", "==", stat.player_name)
//         .where("tournament", "==", stat.tournament)
//         .limit(1)
//         .get();

//     if (!existing.empty) {
//         return NextResponse.json(
//             { success: false, error: `${stat.player_name} already exists for ${stat.tournament}` },
//             { status: 409 }
//         );
//     }

//     const docRef = await db.collection("fifaPlayerStats").add({
//         ...stat,
//         created_at: FieldValue.serverTimestamp(),
//         updated_at: FieldValue.serverTimestamp(),
//     });

//     return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
// }








// api/fifa-player-stats/route.ts
//
// QUOTA FIXES:
//  1. Search uses player_name_lower prefix (first word of query).
//     "cristiano ronaldo" → prefix "cristiano" → cheap + accurate.
//  2. For surname-only searches ("ronaldo"), falls back to name_words
//     array-contains query — 1 Firestore query, no full scan.
//  3. POST writes both player_name_lower and name_words on every new doc.
//  4. Cursor pagination uses "fieldValue|docId" — no extra doc fetch.
//
// MIGRATION REQUIRED (one-time):
//   Run: npx tsx scripts/migrate-fifa-player-name-lower.ts
//   (script must also write name_words — see updated script below)
//
// FIRESTORE INDEXES REQUIRED:
//   1. Collection: fifaPlayerStats  Fields: player_name_lower ASC, __name__ ASC
//   2. Collection: fifaPlayerStats  Fields: name_words ASC, player_name_lower ASC, __name__ ASC

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateFifaPlayerStatsCreate } from "@/lib/validations/fifaPlayerStatsValidation";
import { validateFifaPlayerStatsRecord } from "@/lib/ingestion/fifaPlayerStatsRules";

// ── Search helpers ─────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Split a full name into individual lowercase words for array-contains queries */
function nameWords(playerName: string): string[] {
  return normalise(playerName).split(" ").filter(Boolean);
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

    // ── 1. Exact player_id lookup ───────────────────────────────────────────
    if (playerId) {
      let q: FirebaseFirestore.Query = db
        .collection("fifaPlayerStats")
        .where("player_id", "==", playerId);
      if (tournament) q = q.where("tournament", "==", tournament);
      q = q.limit(limit);

      const snap = await q.get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return NextResponse.json(
        { success: true, data, nextCursor: null, count: data.length },
        { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
      );
    }

    // ── 2. Free-text name search ────────────────────────────────────────────
    //
    // TWO-STRATEGY approach, no full collection scans:
    //
    // STRATEGY A — prefix on player_name_lower using firstWord of query.
    //   Works when the user types the first name: "cristiano", "messi", "mbappe".
    //   player_name_lower = "cristiano ronaldo" → prefix "cristiano" → ✓
    //
    // STRATEGY B — array-contains on name_words using firstWord of query.
    //   Works when the user types a surname: "ronaldo", "messi" (same), "benzema".
    //   name_words = ["cristiano","ronaldo"] → array-contains "ronaldo" → ✓
    //   This replaces the old 500-doc blind fallback scan.
    //
    // Flow: run A first (cheap). If 0 results, run B. Both are O(results), not O(collection).

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

      // Strategy A: prefix query (first-name searches)
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

      // Strategy B: array-contains on name_words (surname-only searches)
      // Only fires when Strategy A returns nothing — costs 1 extra query, not 500 reads.
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

      const filtered = all
        .filter((p) => fuzzyMatch(String(p.player_name ?? ""), search))
        .sort((a, b) => String(a.player_name ?? "").localeCompare(String(b.player_name ?? "")))
        .slice(0, limit);

      return NextResponse.json(
        { success: true, data: filtered, nextCursor: null, count: filtered.length },
        { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" } }
      );
    }

    // ── 3. Standard paginated list ──────────────────────────────────────────
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
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const lastDoc    = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.docs.length === limit && lastDoc
      ? `${lastDoc.data().player_name}|${lastDoc.id}`
      : null;

    return NextResponse.json(
      { success: true, data, nextCursor, count: data.length },
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

  const nameLower = stat.player_name.toLowerCase();
  const words     = nameLower.replace(/[^a-z0-9\s]/g, "").split(" ").filter(Boolean);

  const docRef = await db.collection("fifaPlayerStats").add({
    ...stat,
    player_name_lower: nameLower,
    name_words:        words,          // ["cristiano", "ronaldo"]
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
}