// // app/api/matches/route.ts — Matches CRUD API (MatchMoments Table)
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { validateMatchCreate } from "@/lib/validations/matchValidation";
// import { docClient } from "@/lib/dynamodb";
// import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
// import { TABLES } from "@/lib/tableNames";
// import { ScanCommand, GetCommand, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// export const dynamic = "force-dynamic";

// // ─── GET /api/matches
// // Query params: tournament, gender, format, season, limit (default 50), after (cursor)
// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const tournament = searchParams.get("tournament");
//   const gender = searchParams.get("gender");
//   const format = searchParams.get("format");
//   const season = searchParams.get("season");
//   const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 500);
//   const after = searchParams.get("after");

//   try {
//     let matches: any[] = [];
//     const seenIds = new Set<string>();

// <<<<<<< HEAD
//     // 1. Query DynamoDB MatchMoments (with SportsData fallback)
//     try {
//       let filterExpr = "begins_with(entityId, :mPrefix) AND sk = :metaSk";
//       const exprVals: Record<string, any> = {
//         ":mPrefix": "MATCH#",
//         ":metaSk": "MATCH#META",
//       };
//       const exprNames: Record<string, string> = {};
// =======
//     // 1. Scan ALL candidate tables for MATCH#META records (covers accidental writes to wrong table)
//     const candidateTables = [
//       "SportsData", "SportsData-dev",
//       "MatchMoments", "MatchMoments-dev", "MatchMoments-release",
//     ];
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2

//     for (const tbl of candidateTables) {
//       try {
//         const exprVals: Record<string, any> = {
//           ":mPrefix": "MATCH#",
//           ":metaSk": "MATCH#META",
//         };
//         const exprNames: Record<string, string> = {};
//         let filterExpr = "begins_with(entityId, :mPrefix) AND sk = :metaSk";

// <<<<<<< HEAD
//       const candidateTables = Array.from(
//         new Set([
//           ...getCandidateTableNames(TABLES.MatchMoments),
//           ...getCandidateTableNames(TABLES.SportsData),
//         ])
//       );

//       for (const table of candidateTables) {
//         try {
//           const scanRes = await docClient.send(
//             new ScanCommand({
//               TableName: table,
//               FilterExpression: filterExpr,
//               ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
//               ExpressionAttributeValues: exprVals,
//               Limit: 200,
//             })
//           );

//           if (scanRes.Items && scanRes.Items.length > 0) {
//             matches = (scanRes.Items as any[]).map((item) => ({
//               id: item.match_id || (item.entityId as string)?.replace(/^MATCH#/, ""),
//               ...item,
//             }));
//             break;
//           }
//         } catch (tableErr) {
//           // Continue to next candidate table
//         }
// =======
//         if (tournament) { filterExpr += " AND tournament = :t"; exprVals[":t"] = tournament; }
//         if (gender) { filterExpr += " AND gender = :g"; exprVals[":g"] = gender; }
//         if (format) { filterExpr += " AND #fmt = :f"; exprNames["#fmt"] = "format"; exprVals[":f"] = format; }
//         if (season) { filterExpr += " AND season = :s"; exprVals[":s"] = parseInt(season, 10); }

//         const scanRes = await docClient.send(
//           new ScanCommand({
//             TableName: tbl,
//             FilterExpression: filterExpr,
//             ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
//             ExpressionAttributeValues: exprVals,
//             Limit: 200,
//           })
//         );

//         if (scanRes.Items && scanRes.Items.length > 0) {
//           for (const item of scanRes.Items as any[]) {
//             const matchId: string = item.match_id || (item.entityId as string)?.replace(/^MATCH#/, "");
//             // Only include real match records: must have team1 or team2, and not duplicated
//             if (matchId && !seenIds.has(matchId) && (item.team1 || item.team2)) {
//               seenIds.add(matchId);
//               matches.push({ id: matchId, match_id: matchId, ...item });
//             }
//           }
//         }
//       } catch {
//         // Table doesn't exist — skip silently
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
//       }
//     }

// <<<<<<< HEAD
//     // 2. Fallback to Firestore
//     if (matches.length === 0) {
//       let q: FirebaseFirestore.Query = db.collection("matches");

//       if (tournament) q = q.where("tournament", "==", tournament);
//       if (gender) q = q.where("gender", "==", gender);
//       if (format) q = q.where("format", "==", format);
//       if (season) q = q.where("season", "==", parseInt(season, 10));

//       q = q.orderBy("match_id").limit(limit);

//       if (after) {
//         const afterDoc = await db.collection("matches").doc(after).get();
//         if (afterDoc.exists) {
//           q = q.startAfter(afterDoc);
//         }
//       }

//       const snapshot = await q.get();
//       matches = snapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }));
// =======
//     // 2. Also fetch from Firestore for any matches not in DynamoDB
//     if (db) {
//       try {
//         let query: FirebaseFirestore.Query = db.collection("matches").orderBy("date", "desc");

//         if (tournament) query = query.where("tournament", "==", tournament);
//         if (gender) query = query.where("gender", "==", gender);
//         if (format) query = query.where("format", "==", format);
//         if (season) query = query.where("season", "==", parseInt(season, 10));

//         if (after) {
//           const cursorDoc = await db.collection("matches").doc(after).get();
//           if (cursorDoc.exists) query = query.startAfter(cursorDoc);
//         }

//         query = query.limit(limit);
//         const snap = await query.get();

//         for (const d of snap.docs) {
//           const data = d.data() as any;
//           const matchId: string = data.match_id || d.id;
//           if (!seenIds.has(matchId)) {
//             seenIds.add(matchId);
//             matches.push({ id: matchId, match_id: matchId, ...data });
//           }
//         }
//       } catch (fbErr) {
//         console.warn("[matches GET] Firestore fallback notice:", fbErr);
//       }
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
//     }

//     // 3. Transform & Normalize to complete API Contract
//     const data = matches.map((raw) => {
//       const match = raw as any;
//       const parsedSeason = parseInt(String(match.season ?? ""), 10);
//       const matchId = String(match.match_id || match.id || (match.entityId as string)?.replace(/^MATCH#/, "") || "");
//       const team1 = match.team1 || match.home_team || "";
//       const team2 = match.team2 || match.away_team || "";
//       const date = match.date || match.start_date || "";

//       return {
//         ...match,
//         id: matchId,
//         match_id: matchId,
//         team1,
//         team2,
//         home_team: team1,
//         away_team: team2,
//         team1_short: match.team1_short || (team1 ? team1.slice(0, 3).toUpperCase() : ""),
//         team2_short: match.team2_short || (team2 ? team2.slice(0, 3).toUpperCase() : ""),
//         tournament: String(match.tournament ?? ""),
//         season: isNaN(parsedSeason) ? match.season ?? new Date().getFullYear() : parsedSeason,
//         gender: String(match.gender ?? "male"),
//         format: String(match.format ?? "T20"),
//         stage: String(match.stage ?? ""),
//         venue: String(match.venue ?? ""),
//         city: String(match.city ?? ""),
//         date,
//         start_date: date,
//         time: String(match.time ?? ""),
//         total_overs: Number(match.total_overs) || 20,
//         status: String(match.status ?? "live"),
//         target: match.target != null ? String(match.target) : "",
//         winner: String(match.winner ?? "TBD"),
//         result_margin: match.result_margin != null ? String(match.result_margin) : undefined,
//         current_state: match.current_state,
//         broadcast_channels: Array.isArray(match.broadcast_channels) ? match.broadcast_channels : [],
//         created_at: match.created_at ?? match.createdAt ?? null,
//         updated_at: match.updated_at ?? match.updatedAt ?? null,
//       };
//     });

//     const nextCursor = matches.length === limit ? matches[matches.length - 1].id : null;

//     return NextResponse.json({
//       success: true,
//       data,
//       count: data.length,
//       next_cursor: nextCursor,
//     });
//   } catch (err: any) {
//     console.error("[matches GET] Error:", err);
//     return NextResponse.json(
//       { success: false, error: err.message || "Failed to fetch matches" },
//       { status: 500 }
//     );
//   }
// }

// // ─── POST /api/matches
// export async function POST(req: NextRequest) {
//   let body: any;
//   try {
//     body = await req.json();
//   } catch {
//     return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
//   }

//   const schema = validateMatchCreate(body);
//   if (!schema.success) {
//     return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
//   }

//   const match = schema.data!;

//   // Check for existing in DynamoDB MatchMoments / SportsData
//   let exists = false;
//   const candidateTables = Array.from(
//     new Set([
//       ...getCandidateTableNames(TABLES.MatchMoments),
//       ...getCandidateTableNames(TABLES.SportsData),
//     ])
//   );

//   for (const table of candidateTables) {
//     try {
//       const getRes = await docClient.send(
//         new GetCommand({
//           TableName: table,
//           Key: {
//             entityId: `MATCH#${match.match_id}`,
//             sk: "MATCH#META",
//           },
//         })
//       );
//       if (getRes.Item) {
//         exists = true;
//         break;
//       }
//     } catch (e) {
//       // Continue checking next candidate table
//     }
//   }

//   if (!exists) {
//     const existing = await db.collection(getFirestoreCollection("matches")).doc(match.match_id).get();
//     if (existing.exists) exists = true;
//   }

//   if (exists) {
//     return NextResponse.json(
//       { success: false, error: `Match ${match.match_id} already exists` },
//       { status: 409 }
//     );
//   }

//   const now = Date.now();
//   const matchPayload = {
//     ...match,
//     createdAt: now,
//     updatedAt: now,
//   };

//   // Primary DynamoDB write to MatchMoments table + Firestore dual-write
//   await dualWrite({
//     tableName: TABLES.MatchMoments,
//     dynamoItem: {
//       entityId: `MATCH#${match.match_id}`,
//       sk: "MATCH#META",
//       ...matchPayload,
//     },
//     firestoreRef: db.collection(getFirestoreCollection("matches")).doc(match.match_id),
//     firestoreData: {
//       ...matchPayload,
//       created_at: FieldValue.serverTimestamp(),
//       updated_at: FieldValue.serverTimestamp(),
//     },
//   });

// <<<<<<< HEAD
//   return NextResponse.json({ success: true, match_id: match.match_id, data: matchPayload }, { status: 201 });
// }

// // ─── DELETE /api/matches (Fallback by query params: ?match_id=... or ?id=...)
// export async function DELETE(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const matchId = searchParams.get("match_id") || searchParams.get("id");

//   if (!matchId) {
//     return NextResponse.json({ success: false, error: "match_id query parameter is required" }, { status: 400 });
//   }

//   const candidateTables = Array.from(
//     new Set([
//       ...getCandidateTableNames(TABLES.MatchMoments),
//       ...getCandidateTableNames(TABLES.SportsData),
//     ])
//   );

//   for (const table of candidateTables) {
//     try {
//       const qRes = await docClient.send(
//         new QueryCommand({
//           TableName: table,
//           KeyConditionExpression: "entityId = :eId",
//           ExpressionAttributeValues: { ":eId": `MATCH#${matchId}` },
//         })
//       );
//       if (qRes.Items && qRes.Items.length > 0) {
//         for (const item of qRes.Items) {
//           await docClient.send(
//             new DeleteCommand({
//               TableName: table,
//               Key: { entityId: item.entityId, sk: item.sk },
//             })
//           );
//         }
//       }
//     } catch (e) {
//       console.warn(`[matches DELETE] Notice on table ${table}:`, e);
//     }
//   }

//   try {
//     const docRef = db.collection("matches").doc(matchId);
//     const inningsSnap = await docRef.collection("innings").get();
//     const batch = db.batch();
//     inningsSnap.docs.forEach((d) => batch.delete(d.ref));
//     batch.delete(docRef);
//     await batch.commit();
//   } catch (e) {
//     console.warn("[matches DELETE] Firestore notice:", e);
//   }

//   return NextResponse.json({ success: true, deleted: matchId, message: `Match ${matchId} deleted successfully` });
// =======
//   return NextResponse.json({ success: true, match_id: match.match_id }, { status: 201 });
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
// }




// app/api/matches/route.ts — Matches CRUD API (MatchMoments Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { validateMatchCreate } from "@/lib/validations/matchValidation";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { getCoreEngineReferencedMatchIds, cleanMatchId, hasValidMatchTeams, normalizeMatchKey } from "@/lib/coreEngineScope";
import { ScanCommand, GetCommand, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET /api/matches
// Query params: tournament, gender, format, season, limit (default 50), after (cursor)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
    const tournament = searchParams.get("tournament");
    const gender = searchParams.get("gender");
    const format = searchParams.get("format");
    const season = searchParams.get("season");
    const seriesIdFilter = searchParams.get("seriesId");
    const coreOnly = searchParams.get("coreOnly") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 1000);
    const after = searchParams.get("after");

  try {
    let matches: any[] = [];
    const seenIds = new Set<string>();

    // 1. Scan ALL candidate tables (MatchMoments + SportsData, incl. env variants)
    //    for MATCH#META records with full pagination (avoiding pre-filter Limit truncation).
    const candidateTables = Array.from(
      new Set([
        ...getCandidateTableNames(TABLES.MatchMoments),
        ...getCandidateTableNames(TABLES.SportsData),
      ])
    );

    for (const table of candidateTables) {
      try {
        const exprVals: Record<string, any> = {
          ":mPrefix": "MATCH#",
          ":metaSk": "MATCH#META",
        };
        const exprNames: Record<string, string> = {};
        let filterExpr = "begins_with(entityId, :mPrefix) AND sk = :metaSk";

        if (tournament) { filterExpr += " AND tournament = :t"; exprVals[":t"] = tournament; }
        if (gender) { filterExpr += " AND gender = :g"; exprVals[":g"] = gender; }
        if (format) { filterExpr += " AND #fmt = :f"; exprNames["#fmt"] = "format"; exprVals[":f"] = format; }
        if (season) { filterExpr += " AND season = :s"; exprVals[":s"] = parseInt(season, 10); }
        if (seriesIdFilter) { filterExpr += " AND seriesId = :sid"; exprVals[":sid"] = seriesIdFilter; }

        let lastKey: Record<string, any> | undefined;
        do {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: table,
              FilterExpression: filterExpr,
              ExpressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
              ExpressionAttributeValues: exprVals,
              ExclusiveStartKey: lastKey,
            })
          );

          for (const item of (scanRes.Items || []) as any[]) {
            const matchId: string = item.match_id || (item.entityId as string)?.replace(/^MATCH#/, "");
            // Only include real match records: must have team1 or team2, and not duplicated
            if (matchId && !seenIds.has(matchId) && (item.team1 || item.team2)) {
              seenIds.add(matchId);
              matches.push({
                id: matchId,
                match_id: matchId,
                ...item,
                isCoreEngineMatch: table.startsWith("MatchMoments"),
                sourceTable: table,
              });
            }
          }
          lastKey = scanRes.LastEvaluatedKey;
        } while (lastKey);
      } catch {
        // Table doesn't exist — skip silently
      }
    }

    // 2. Also fetch from Firestore for any matches not in DynamoDB
    if (db) {
      try {
        const matchesCol = getFirestoreCollection("matches");
        let query: FirebaseFirestore.Query = db.collection(matchesCol).orderBy("date", "desc");

        if (tournament) query = query.where("tournament", "==", tournament);
        if (gender) query = query.where("gender", "==", gender);
        if (format) query = query.where("format", "==", format);
        if (season) query = query.where("season", "==", parseInt(season, 10));

        if (after) {
          const cursorDoc = await db.collection(matchesCol).doc(after).get();
          if (cursorDoc.exists) query = query.startAfter(cursorDoc);
        }

        query = query.limit(limit);
        const snap = await query.get();

        for (const d of snap.docs) {
          const data = d.data() as any;
          const matchId: string = data.match_id || d.id;
          if (!seenIds.has(matchId)) {
            seenIds.add(matchId);
            matches.push({ id: matchId, match_id: matchId, ...data });
          }
        }
      } catch (fbErr) {
        console.warn("[matches GET] Firestore fallback notice:", fbErr);
      }
    }

    matches = matches.filter((m: any) => hasValidMatchTeams(m));

    // Optional Core Engine filter + prioritize Core Engine matches before historical archives
    if (coreOnly) {
      const { matchMetaById, referencedHintsById, coreMatchIds } = await getCoreEngineReferencedMatchIds(docClient);
      const matchesCol = getFirestoreCollection("matches");

      const coreRefKeys = new Set(Array.from(coreMatchIds).map((id) => normalizeMatchKey(id)));
      const metaByKey = new Map<string, any>();
      for (const [cid, mmMeta] of matchMetaById.entries()) {
        const k = normalizeMatchKey(cid);
        if (k && !metaByKey.has(k)) metaByKey.set(k, mmMeta);
      }

      const coreByKey = new Map<string, any>();
      for (const m of matches) {
        const cid = cleanMatchId(m.match_id || m.id);
        const k = normalizeMatchKey(cid);
        if (!cid || !k) continue;
        const isCore =
          Boolean(m.isCoreEngineMatch) ||
          cid.toUpperCase().startsWith("MATCH-") ||
          metaByKey.has(k) ||
          coreRefKeys.has(k);
        if (isCore) {
          const mmMeta = metaByKey.get(k);
          const mergedId = mmMeta?.match_id || cid;
          const prev = coreByKey.get(k);
          const candidate = mmMeta
            ? { ...m, ...mmMeta, id: mergedId, match_id: mergedId, isCoreEngineMatch: true }
            : { ...m, id: mergedId, match_id: mergedId };
          if (!prev || String(candidate.match_id).toUpperCase().startsWith("MATCH-")) {
            coreByKey.set(k, candidate);
          }
        }
      }

      for (const [k, mmMeta] of metaByKey.entries()) {
        if (!coreByKey.has(k) && hasValidMatchTeams(mmMeta)) {
          coreByKey.set(k, mmMeta);
        }
      }

      const missingCoreIds = Array.from(coreMatchIds).filter((cid) => !coreByKey.has(normalizeMatchKey(cid)));
      if (missingCoreIds.length > 0) {
        await Promise.all(
          missingCoreIds.map(async (cid) => {
            const k = normalizeMatchKey(cid);
            const lookupIds = Array.from(
              new Set([cid, cid.toUpperCase().startsWith("MATCH-") ? cid.slice(6) : `MATCH-${cid}`])
            );
            let hydrated: any = null;
            for (const lid of lookupIds) {
              if (hydrated) break;
              try {
                const mmRes = await docClient.send(
                  new GetCommand({
                    TableName: TABLES.MatchMoments,
                    Key: { entityId: `MATCH#${lid}`, sk: "MATCH#META" },
                  })
                );
                if (mmRes.Item) hydrated = mmRes.Item;
              } catch {}
            }

            for (const lid of lookupIds) {
              if (hydrated) break;
              try {
                const sdRes = await docClient.send(
                  new GetCommand({
                    TableName: TABLES.SportsData,
                    Key: { entityId: `MATCH#${lid}`, sk: "MATCH#META" },
                  })
                );
                if (sdRes.Item) hydrated = sdRes.Item;
              } catch {}
            }

            if (!hydrated && db) {
              for (const lid of lookupIds) {
                if (hydrated) break;
                try {
                  const fsDoc = await db.collection(matchesCol).doc(lid).get();
                  if (fsDoc.exists) hydrated = fsDoc.data();
                } catch {}
              }
            }

            const hint = referencedHintsById.get(cid);
            const canonicalCid = hydrated?.match_id || cid;
            if (hydrated && hasValidMatchTeams({ ...hydrated, isCoreEngineMatch: true })) {
              coreByKey.set(k, {
                ...hydrated,
                id: canonicalCid,
                match_id: canonicalCid,
                isCoreEngineMatch: true,
              });
            } else {
              coreByKey.set(k, {
                id: canonicalCid,
                match_id: canonicalCid,
                title: hint?.title || canonicalCid,
                sport: hint?.sport || "cricket",
                tournament: hint?.tournament || hint?.seriesId || undefined,
                home_team: hint?.home_team || hint?.teamA,
                away_team: hint?.away_team || hint?.teamB,
                status: hint?.status || "live",
                matchDate: hint?.matchDate,
                isCoreEngineMatch: true,
                synthesizedFromRef: true,
              });
            }
          })
        );
      }

      matches = Array.from(coreByKey.values()).filter((m: any) => hasValidMatchTeams(m));
    }

    matches.sort((a: any, b: any) => {
      const aCore = a.isCoreEngineMatch || String(a.match_id || "").toUpperCase().startsWith("MATCH-") ? 1 : 0;
      const bCore = b.isCoreEngineMatch || String(b.match_id || "").toUpperCase().startsWith("MATCH-") ? 1 : 0;
      if (aCore !== bCore) return bCore - aCore;
      return String(b.date || b.start_date || "").localeCompare(String(a.date || a.start_date || ""));
    });

    const extractTeamName = (val: any): string => {
      if (!val) return "";
      if (typeof val === "string") return val.trim();
      if (typeof val === "object") {
        return String(val.name || val.team || val.title || val.shortName || val.short_name || "").trim();
      }
      return String(val).trim();
    };

    // 3. Transform & Normalize to complete API Contract
    const data = matches.map((raw) => {
      const match = raw as any;
      const parsedSeason = parseInt(String(match.season ?? ""), 10);
      const matchId = String(match.match_id || match.id || (match.entityId as string)?.replace(/^MATCH#/, "") || "");
      const team1 = extractTeamName(match.team1 || match.home_team);
      const team2 = extractTeamName(match.team2 || match.away_team);
      const date = String(match.date || match.start_date || "");

      return {
        ...match,
        id: matchId,
        match_id: matchId,
        team1,
        team2,
        home_team: team1,
        away_team: team2,
        team1_short: match.team1_short || (team1 ? team1.slice(0, 3).toUpperCase() : ""),
        team2_short: match.team2_short || (team2 ? team2.slice(0, 3).toUpperCase() : ""),
        tournament: String(match.tournament ?? ""),
        season: isNaN(parsedSeason) ? match.season ?? new Date().getFullYear() : parsedSeason,
        gender: String(match.gender ?? "male"),
        format: String(match.format ?? "T20"),
        stage: String(match.stage ?? ""),
        venue: String(match.venue ?? ""),
        city: String(match.city ?? ""),
        date,
        start_date: date,
        time: String(match.time ?? ""),
        total_overs: Number(match.total_overs) || 20,
        status: String(match.status ?? "live"),
        target: match.target != null ? String(match.target) : "",
        winner: String(match.winner ?? "TBD"),
        result_margin: match.result_margin != null ? String(match.result_margin) : undefined,
        current_state: match.current_state,
        broadcast_channels: Array.isArray(match.broadcast_channels) ? match.broadcast_channels : [],
        created_at: match.created_at ?? match.createdAt ?? null,
        updated_at: match.updated_at ?? match.updatedAt ?? null,
      };
    });

    const nextCursor = matches.length === limit ? matches[matches.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
      next_cursor: nextCursor,
    });
  } catch (err: any) {
    console.error("[matches GET] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch matches" },
      { status: 500 }
    );
  }
}

// ─── POST /api/matches
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const schema = validateMatchCreate(body);
  if (!schema.success) {
    return NextResponse.json({ success: false, errors: schema.errors }, { status: 422 });
  }

  const match = schema.data!;

  // Check for existing in DynamoDB MatchMoments / SportsData
  let exists = false;
  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const table of candidateTables) {
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: {
            entityId: `MATCH#${match.match_id}`,
            sk: "MATCH#META",
          },
        })
      );
      if (getRes.Item) {
        exists = true;
        break;
      }
    } catch (e) {
      // Continue checking next candidate table
    }
  }

  if (!exists) {
    const existing = await db.collection(getFirestoreCollection("matches")).doc(match.match_id).get();
    if (existing.exists) exists = true;
  }

  if (exists) {
    return NextResponse.json(
      { success: false, error: `Match ${match.match_id} already exists` },
      { status: 409 }
    );
  }

  const now = Date.now();
  const seriesId = String(body?.seriesId || body?.series_id || (match as any)?.seriesId || "").trim() || undefined;
  const seriesName = String(body?.seriesName || body?.series_name || (match as any)?.seriesName || "").trim() || undefined;
  const matchPayload = {
    ...match,
    ...(seriesId ? { seriesId } : {}),
    ...(seriesName ? { seriesName } : {}),
    createdAt: now,
    updatedAt: now,
  };

  // Primary DynamoDB write to MatchMoments table + Firestore dual-write
  await dualWrite({
    tableName: TABLES.MatchMoments,
    dynamoItem: {
      entityId: `MATCH#${match.match_id}`,
      sk: "MATCH#META",
      ...matchPayload,
    },
    firestoreRef: db.collection(getFirestoreCollection("matches")).doc(match.match_id),
    firestoreData: {
      ...matchPayload,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    },
  });

  // 1:N relational reverse index in SportsData (Series -> Matches)
  if (seriesId) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SportsData,
          Item: {
            entityId: `SERIES#${seriesId}`,
            sk: `MATCH#${match.date || "0000-00-00"}#${match.match_id}`,
            seriesId,
            ...(seriesName ? { seriesName } : {}),
            matchId: match.match_id,
            match_id: match.match_id,
            team1: match.team1,
            team2: match.team2,
            date: match.date,
            format: match.format,
            venue: match.venue,
            status: match.status,
            createdAt: now,
            updatedAt: now,
          },
        })
      );
    } catch (seriesIdxErr) {
      console.warn("[matches POST] Series->Match SportsData index write notice:", seriesIdxErr);
    }
  }

  return NextResponse.json({ success: true, match_id: match.match_id, data: matchPayload }, { status: 201 });
}

// ─── DELETE /api/matches (Fallback by query params: ?match_id=... or ?id=...)
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("match_id") || searchParams.get("id");

  if (!matchId) {
    return NextResponse.json({ success: false, error: "match_id query parameter is required" }, { status: 400 });
  }

  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const table of candidateTables) {
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "entityId = :eId",
          ExpressionAttributeValues: { ":eId": `MATCH#${matchId}` },
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        for (const item of qRes.Items) {
          await docClient.send(
            new DeleteCommand({
              TableName: table,
              Key: { entityId: item.entityId, sk: item.sk },
            })
          );
        }
      }
    } catch (e) {
      console.warn(`[matches DELETE] Notice on table ${table}:`, e);
    }
  }

  try {
    const docRef = db.collection(getFirestoreCollection("matches")).doc(matchId);
    const inningsSnap = await docRef.collection("innings").get();
    const batch = db.batch();
    inningsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(docRef);
    await batch.commit();
  } catch (e) {
    console.warn("[matches DELETE] Firestore notice:", e);
  }

  return NextResponse.json({ success: true, deleted: matchId, message: `Match ${matchId} deleted successfully` });
}