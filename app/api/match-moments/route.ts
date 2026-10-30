
// =======
// // app/api/match-moments/route.ts — Match Moments Dual-Write API (Primary Table: MatchMoments)
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { docClient } from "@/lib/dynamodb";
// import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
// <<<<<<< HEAD
// import { TABLES } from "@/lib/tableNames";
// import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
// =======
// import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
// import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2

// export const dynamic = "force-dynamic";

// // ─── Helper: look up an existing moment (DynamoDB candidates first, then Firestore) ───
// // Moment IDs are unique per match: the storage key is MATCH#<matchId> + MOMENT#<momentId>.
// async function findExistingMoment(matchId: string, momentId: string): Promise<any | null> {
//   const candidateTables = Array.from(
//     new Set([
//       ...getCandidateTableNames(TABLES.MatchMoments),
//       ...getCandidateTableNames(TABLES.SportsData),
//     ])
//   );

//   for (const table of candidateTables) {
//     try {
//       const res = await docClient.send(
//         new GetCommand({
//           TableName: table,
//           Key: { entityId: `MATCH#${matchId}`, sk: `MOMENT#${momentId}` },
//           ConsistentRead: true,
//         })
//       );
//       if (res.Item) return res.Item;
//     } catch {
//       // table with a different key schema, or not accessible -> try next
//     }
//   }

//   try {
//     const snap = await db.collection("match_moments").doc(`${matchId}_${momentId}`).get();
//     if (snap.exists) return snap.data() || {};
//   } catch {
//     // ignore Firestore lookup errors
//   }

//   return null;
// }

// // ─── GET /api/match-moments ──────────────────────────────────────────────────
// // Query params: matchId (optional, filters by match)
// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const rawMatchId = searchParams.get("matchId");
//   const matchesOnly = searchParams.get("matchesOnly") === "true";
//   const matchId = rawMatchId ? rawMatchId.trim() : null;
//   const cleanMatchId = matchId ? matchId.replace(/^MATCH#/, "") : null;

//   try {
//     const candidateTables = getCandidateTableNames("MatchMoments");

// <<<<<<< HEAD
//     // 1. Query ALL candidate DynamoDB tables, merge + dedupe by key
//     try {
//       const candidateTables = Array.from(
//         new Set([
//           ...getCandidateTableNames(TABLES.MatchMoments),
//           ...getCandidateTableNames(TABLES.SportsData),
//         ])
//       );

//       const byKey = new Map<string, any>();

//       for (const table of candidateTables) {
//         try {
//           const items: any[] = matchId
//             ? (
//                 await docClient.send(
//                   new QueryCommand({
//                     TableName: table,
//                     KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
//                     ExpressionAttributeValues: {
//                       ":eId": `MATCH#${matchId}`,
//                       ":skPrefix": "MOMENT#",
//                     },
//                     ConsistentRead: true,
//                   })
//                 )
//               ).Items || []
//             : (
//                 await docClient.send(
//                   new ScanCommand({
//                     TableName: table,
//                     FilterExpression: "begins_with(sk, :skPrefix)",
//                     ExpressionAttributeValues: {
//                       ":skPrefix": "MOMENT#",
//                     },
//                     Limit: 200,
//                   })
//                 )
//               ).Items || [];

//           for (const item of items) {
//             const key = `${item.entityId}|${item.sk}`;
//             const prev = byKey.get(key);
//             // If the same moment exists in two tables, keep the most recently updated copy
//             if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
//               byKey.set(key, {
//                 id: item.momentId || item.sk?.replace(/^MOMENT#/, ""),
//                 ...item,
//               });
//             }
//           }
//         } catch (tableErr) {
//           console.warn(`[match-moments GET] table ${table} skipped:`, tableErr);
// =======
//     // 0. Quick helper: Return list of matches that currently have moments in MatchMoments
//     if (matchesOnly) {
//       let allMoments: any[] = [];
//       for (const tbl of candidateTables) {
//         try {
//           const scanRes = await docClient.send(
//             new ScanCommand({
//               TableName: tbl,
//               FilterExpression: "begins_with(sk, :skPrefix)",
//               ExpressionAttributeValues: {
//                 ":skPrefix": "MOMENT#",
//               },
//               Limit: 200,
//             })
//           );
//           if (scanRes.Items && scanRes.Items.length > 0) {
//             allMoments = scanRes.Items;
//             break;
//           }
//         } catch {}
//       }

//       const matchMap = new Map<string, number>();
//       for (const item of allMoments) {
//         const mId = (item.matchId || item.entityId?.replace(/^MATCH#/, ""))?.trim();
//         if (mId) {
//           matchMap.set(mId, (matchMap.get(mId) || 0) + 1);
//         }
//       }

//       const matchesWithMoments = Array.from(matchMap.entries()).map(([mId, count]) => ({
//         matchId: mId,
//         momentCount: count,
//       }));

//       return NextResponse.json({
//         success: true,
//         matchesWithMoments,
//         count: matchesWithMoments.length,
//         storageTable: "MatchMoments",
//       });
//     }

//     let moments: any[] = [];
//     const momentMap = new Map<string, any>();

//     const addMoment = (item: any) => {
//       const momId = item.momentId || item.sk?.replace(/^MOMENT#/, "");
//       if (momId && !momentMap.has(momId)) {
//         momentMap.set(momId, {
//           id: momId,
//           ...item,
//         });
//       }
//     };

//     // 1. Query DynamoDB Table MatchMoments across candidate tables
//     try {
//       const candidateTables = getCandidateTableNames("MatchMoments");

//       if (cleanMatchId) {
//         for (const tbl of candidateTables) {
//           try {
//             // A. Query by entityId with MATCH# prefix
//             let queryRes = await docClient.send(
//               new QueryCommand({
//                 TableName: tbl,
//                 KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
//                 ExpressionAttributeValues: {
//                   ":eId": `MATCH#${cleanMatchId}`,
//                   ":skPrefix": "MOMENT#",
//                 },
//               })
//             );

//             if (queryRes.Items) {
//               queryRes.Items.forEach(addMoment);
//             }

//             // B. If empty, try without MATCH# prefix
//             try {
//               const queryResNoPrefix = await docClient.send(
//                 new QueryCommand({
//                   TableName: tbl,
//                   KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
//                   ExpressionAttributeValues: {
//                     ":eId": cleanMatchId,
//                     ":skPrefix": "MOMENT#",
//                   },
//                 })
//               );
//               if (queryResNoPrefix.Items) {
//                 queryResNoPrefix.Items.forEach(addMoment);
//               }
//             } catch {}

//             // C. Try pk (standard schema)
//             try {
//               const queryResPk = await docClient.send(
//                 new QueryCommand({
//                   TableName: tbl,
//                   KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
//                   ExpressionAttributeValues: {
//                     ":pk": `MATCH#${cleanMatchId}`,
//                     ":skPrefix": "MOMENT#",
//                   },
//                 })
//               );
//               if (queryResPk.Items) {
//                 queryResPk.Items.forEach(addMoment);
//               }
//             } catch {}
//           } catch (tblErr) {
//             console.warn(`[match-moments GET] Query error on table ${tbl}:`, tblErr);
//             continue;
//           }
//         }
//       } else {
//         // No matchId: Scan for all moments across MatchMoments
//         for (const tbl of candidateTables) {
//           try {
//             const scanRes = await docClient.send(
//               new ScanCommand({
//                 TableName: tbl,
//                 FilterExpression: "begins_with(sk, :skPrefix)",
//                 ExpressionAttributeValues: {
//                   ":skPrefix": "MOMENT#",
//                 },
//                 Limit: 200,
//               })
//             );
//             if (scanRes.Items && scanRes.Items.length > 0) {
//               scanRes.Items.forEach(addMoment);
//             }
//           } catch {
//             continue;
//           }
//         }
//       }
//     } catch (dynErr) {
//       console.warn("[match-moments GET] MatchMoments notice:", dynErr);
//     }

//     // 2. Query DynamoDB SportsData table as well
//     if (cleanMatchId) {
//       try {
//         const queryRes = await docClient.send(
//           new QueryCommand({
//             TableName: "SportsData",
//             KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
//             ExpressionAttributeValues: {
//               ":eId": `MATCH#${cleanMatchId}`,
//               ":skPrefix": "MOMENT#",
//             },
//           })
//         );
//         if (queryRes.Items) {
//           queryRes.Items.forEach(addMoment);
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
//         }
//       } catch (spErr) {
//         console.warn("[match-moments GET] SportsData fallback notice:", spErr);
//       }
// <<<<<<< HEAD

//       moments = Array.from(byKey.values()).sort(
//         (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
//       );
//     } catch (dynErr) {
//       console.warn("[match-moments GET] DynamoDB notice:", dynErr);
//     }

//     // 2. Fallback to Firestore if empty (no orderBy -> no composite index needed)
//     if (moments.length === 0) {
//       let q: FirebaseFirestore.Query = db.collection("match_moments");
//       if (matchId) {
//         q = q.where("matchId", "==", matchId);
// =======
//     }

//     // 3. Check Firestore
//     if (db) {
//       try {
//         let q: FirebaseFirestore.Query = db.collection(getFirestoreCollection("match_moments"));
//         if (cleanMatchId) {
//           q = q.where("matchId", "in", [cleanMatchId, `MATCH#${cleanMatchId}`]);
//         }
//         const snap = await q.get();
//         snap.docs.forEach((d) => addMoment({ id: d.id, ...d.data() }));
//       } catch (fbErr) {
//         console.warn("[match-moments GET] Firestore fallback notice:", fbErr);
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
//       }
//       const snap = await q.limit(200).get();
//       moments = snap.docs
//         .map((doc) => ({
//           id: doc.id,
//           ...doc.data(),
//         }))
//         .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
//     }

// <<<<<<< HEAD
//     // 3. Fallback to sample data for demo if totally empty (non-production only)
//     if (moments.length === 0 && process.env.NODE_ENV !== "production") {
//       moments = [
//         {
//           id: "MM-IND-SA-1",
//           momentId: "MM-IND-SA-1",
//           matchId: matchId || "cric_ind_sa_2026_01",
//           innings: 1,
//           overs: "19.5",
//           format: "T20",
//           stage: "Super 8",
//           venue: "Kensington Oval, Barbados",
//           score: "IND 176/7 (20) vs SA 169/8 (20)",
//           matchOverTimestamp: "19.5 Overs",
//           event: "Wicket",
//           matchMoment: "Suryakumar Yadav catches Miller on the boundary rope",
//           description: "Unbelievable athleticism at long-off under immense World Cup final pressure.",
//           status: "active",
//           createdAt: Date.now() - 3600000,
//         },
//         {
//           id: "MM-IND-SA-2",
//           momentId: "MM-IND-SA-2",
//           matchId: matchId || "cric_ind_sa_2026_01",
//           innings: 2,
//           overs: "15.1",
//           format: "T20",
//           stage: "Super 8",
//           venue: "Kensington Oval, Barbados",
//           score: "IND 176/7 (20) vs SA 151/4 (15)",
//           matchOverTimestamp: "15.1 Overs",
//           event: "Milestone",
//           matchMoment: "Heinrich Klaasen smashes 24 runs in the 15th over",
//           description: "Explosive hitting turned the momentum squarely into South Africa's favor.",
//           status: "active",
//           createdAt: Date.now() - 7200000,
//         },
//       ];
//     }
// =======
//     moments = Array.from(momentMap.values());

//     // Sort by createdAt / over if available
//     moments.sort((a, b) => {
//       if (a.innings !== b.innings) return (a.innings || 1) - (b.innings || 1);
//       const ovA = parseFloat(a.overs || "0");
//       const ovB = parseFloat(b.overs || "0");
//       if (ovA !== ovB) return ovA - ovB;
//       return (b.createdAt || 0) - (a.createdAt || 0);
//     });
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2

//     return NextResponse.json({
//       success: true,
//       data: moments,
//       count: moments.length,
//       storageTable: "MatchMoments",
//     });
//   } catch (err: any) {
//     console.error("[match-moments GET] Error:", err);
//     return NextResponse.json(
//       { success: false, error: err.message || "Failed to fetch match moments" },
//       { status: 500 }
//     );
//   }
// }

// // ─── POST /api/match-moments ─────────────────────────────────────────────────
// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const {
//       momentId,
//       matchId,
//       innings,
//       overs,
//       format,
//       stage,
//       venue,
//       score,
//       matchOverTimestamp,
//       event,
//       matchMoment,
//       description,
//       status,
//       isEdit,
//     } = body;

//     if (!matchId || !event || !matchMoment) {
//       return NextResponse.json(
//         { success: false, error: "matchId, event, and matchMoment are required" },
//         { status: 400 }
//       );
//     }

// <<<<<<< HEAD
//     const cleanMatchId = String(matchId).trim();
//     const cleanMomentId =
//       momentId && String(momentId).trim()
//         ? String(momentId).trim()
//         : `MM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
// =======
//     const now = Date.now();
//     const cleanMomentId = String(momentId).trim();
//     const cleanMatchId = String(matchId).trim().replace(/^MATCH#/, "");
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2

//     // Moment IDs must be unique within a match.
//     // Creating with an ID that already exists is rejected; editing updates the existing one.
//     const isUpdate = Boolean(isEdit);
//     const hasClientId = Boolean(momentId && String(momentId).trim());
//     const existing = hasClientId ? await findExistingMoment(cleanMatchId, cleanMomentId) : null;

//     if (existing && !isUpdate) {
//       return NextResponse.json(
//         {
//           success: false,
//           error: `Moment ID ${cleanMomentId} already exists for match ${cleanMatchId}. Use Edit to update it, or refresh to get the next free ID.`,
//         },
//         { status: 409 }
//       );
//     }

//     const now = Date.now();
//     const payload = {
//       momentId: cleanMomentId,
//       matchId: cleanMatchId,
//       innings: Number(innings) || 1,
//       overs: String(overs || "").trim(),
//       format: String(format || "").trim(),
//       stage: String(stage || "").trim(),
//       venue: String(venue || "").trim(),
//       score: String(score || "").trim(),
//       matchOverTimestamp: String(matchOverTimestamp || "").trim(),
//       event: String(event).trim(),
//       matchMoment: String(matchMoment).trim(),
//       description: String(description || "").trim(),
//       status: status || "active",
//       createdAt: isUpdate && existing?.createdAt ? existing.createdAt : now,
//       updatedAt: now,
//     };

// <<<<<<< HEAD
//     // Dual-write to DynamoDB MatchMoments + Firestore match_moments
//     await dualWrite({
//       tableName: TABLES.MatchMoments,
// =======
//     // Primary write to DynamoDB MatchMoments table (Dual keys: entityId + pk for 100% schema resilience)
//     await dualWrite({
//       tableName: "MatchMoments",
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
//       dynamoItem: {
//         entityId: `MATCH#${cleanMatchId}`,
//         pk: `MATCH#${cleanMatchId}`,
//         sk: `MOMENT#${cleanMomentId}`,
//         matchId: cleanMatchId,
//         momentId: cleanMomentId,
//         ...payload,
//       },
//       collectionName: getFirestoreCollection("match_moments"),
//       docId: `${cleanMatchId}_${cleanMomentId}`,
//       firestoreData: payload,
//     });

//     // Secondary sync write to SportsData table so legacy readers also stay in sync
//     try {
//       await dualWrite({
//         tableName: "SportsData",
//         dynamoItem: {
//           entityId: `MATCH#${cleanMatchId}`,
//           pk: `MATCH#${cleanMatchId}`,
//           sk: `MOMENT#${cleanMomentId}`,
//           ...payload,
//         },
//         collectionName: getFirestoreCollection("match_moments"),
//         docId: `${cleanMatchId}_${cleanMomentId}`,
//         firestoreData: payload,
//       });
//     } catch (secErr) {
//       console.warn("[match-moments POST] Secondary SportsData sync notice:", secErr);
//     }

//     return NextResponse.json(
//       {
//         success: true,
// <<<<<<< HEAD
//         message: `Match Moment ${cleanMomentId} ${isUpdate ? "updated" : "created"} successfully`,
// =======
//         message: `Match Moment ${cleanMomentId} created successfully in MatchMoments table`,
//         storageTable: "MatchMoments",
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
//         data: payload,
//       },
//       { status: 201 }
//     );
//   } catch (err: any) {
//     console.error("[match-moments POST] Error:", err);
//     return NextResponse.json(
//       { success: false, error: err.message || "Failed to create match moment" },
//       { status: 500 }
//     );
//   }
// }

// // ─── DELETE /api/match-moments ───────────────────────────────────────────────
// export async function DELETE(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const momentId = searchParams.get("momentId");
//   const matchId = searchParams.get("matchId");

//   if (!momentId || !matchId) {
//     return NextResponse.json(
//       { success: false, error: "momentId and matchId are required for deletion" },
//       { status: 400 }
//     );
//   }

//   const cleanMatchId = matchId.replace(/^MATCH#/, "");

//   try {
//     // Delete from MatchMoments table
//     await dualDelete({
// <<<<<<< HEAD
//       tableName: TABLES.MatchMoments,
// =======
//       tableName: "MatchMoments",
// >>>>>>> 5d7e38d5e9a822548fc44e6790875bdf8e2f64a2
//       key: {
//         entityId: `MATCH#${cleanMatchId}`,
//         sk: `MOMENT#${momentId}`,
//       },
//       collectionName: getFirestoreCollection("match_moments"),
//       docId: `${cleanMatchId}_${momentId}`,
//     });

//     // Delete from SportsData table if present
//     try {
//       await dualDelete({
//         tableName: "SportsData",
//         key: {
//           entityId: `MATCH#${cleanMatchId}`,
//           sk: `MOMENT#${momentId}`,
//         },
//         collectionName: getFirestoreCollection("match_moments"),
//         docId: `${cleanMatchId}_${momentId}`,
//       });
//     } catch {}

//     return NextResponse.json({
//       success: true,
//       message: `Moment ${momentId} deleted from MatchMoments table`,
//       storageTable: "MatchMoments",
//     });
//   } catch (err: any) {
//     return NextResponse.json(
//       { success: false, error: err.message || "Failed to delete match moment" },
//       { status: 500 }
//     );
//   }
// }





// app/api/match-moments/route.ts — Match Moments Dual-Write API (Primary Table: MatchMoments)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getAllCandidateTables(): string[] {
  return Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );
}

const stripMatchPrefix = (v: any): string => String(v ?? "").trim().replace(/^MATCH#/, "");

const getMomentId = (item: any): string =>
  String(item.momentId || String(item.sk ?? "").replace(/^MOMENT#/, "") || "").trim();

// Moment IDs are unique per match, so the dedupe key is <matchId>|<momentId>
const getMomentKey = (item: any): string | null => {
  const momId = getMomentId(item);
  if (!momId) return null;
  const mId = stripMatchPrefix(item.matchId || item.entityId || item.pk);
  return `${mId}|${momId}`;
};

// ─── Helper: look up an existing moment (DynamoDB candidates first, then Firestore) ───
// Moment IDs are unique per match: the storage key is MATCH#<matchId> + MOMENT#<momentId>.
async function findExistingMoment(matchId: string, momentId: string): Promise<any | null> {
  for (const table of getAllCandidateTables()) {
    try {
      const res = await docClient.send(
        new GetCommand({
          TableName: table,
          Key: { entityId: `MATCH#${matchId}`, sk: `MOMENT#${momentId}` },
          ConsistentRead: true,
        })
      );
      if (res.Item) return res.Item;
    } catch {
      // table with a different key schema, or not accessible -> try next
    }
  }

  try {
    const snap = await db
      .collection(getFirestoreCollection("match_moments"))
      .doc(`${matchId}_${momentId}`)
      .get();
    if (snap.exists) return snap.data() || {};
  } catch {
    // ignore Firestore lookup errors
  }

  return null;
}

// ─── GET /api/match-moments ──────────────────────────────────────────────────
// Query params: matchId (optional, filters by match), matchesOnly=true (list matches that have moments)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawMatchId = searchParams.get("matchId");
  const matchesOnly = searchParams.get("matchesOnly") === "true";
  const cleanMatchId = rawMatchId ? stripMatchPrefix(rawMatchId) : null;

  try {
    const candidateTables = getAllCandidateTables();

    // 0. Quick helper: return list of matches that currently have moments
    if (matchesOnly) {
      const seen = new Set<string>();
      const matchMap = new Map<string, number>();

      for (const tbl of candidateTables) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: tbl,
              FilterExpression: "begins_with(sk, :skPrefix)",
              ExpressionAttributeValues: { ":skPrefix": "MOMENT#" },
              Limit: 200,
            })
          );
          for (const item of scanRes.Items || []) {
            const key = getMomentKey(item);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const mId = stripMatchPrefix(item.matchId || item.entityId || item.pk);
            if (mId) matchMap.set(mId, (matchMap.get(mId) || 0) + 1);
          }
        } catch {
          continue;
        }
      }

      const matchesWithMoments = Array.from(matchMap.entries()).map(([mId, count]) => ({
        matchId: mId,
        momentCount: count,
      }));

      return NextResponse.json({
        success: true,
        matchesWithMoments,
        count: matchesWithMoments.length,
        storageTable: "MatchMoments",
      });
    }

    // Merge + dedupe by <matchId>|<momentId>; if a moment exists in several
    // places, keep the most recently updated copy (ties keep the first seen).
    const momentMap = new Map<string, any>();

    const addMoment = (item: any) => {
      const key = getMomentKey(item);
      if (!key) return;
      const prev = momentMap.get(key);
      if (!prev || (item.updatedAt || 0) > (prev.updatedAt || 0)) {
        momentMap.set(key, { ...item, id: getMomentId(item) });
      }
    };

    // 1. Query ALL candidate DynamoDB tables (MatchMoments + SportsData, incl. env variants)
    for (const tbl of candidateTables) {
      try {
        if (cleanMatchId) {
          // A. entityId with MATCH# prefix (primary schema)
          try {
            const res = await docClient.send(
              new QueryCommand({
                TableName: tbl,
                KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":eId": `MATCH#${cleanMatchId}`,
                  ":skPrefix": "MOMENT#",
                },
                ConsistentRead: true,
              })
            );
            (res.Items || []).forEach(addMoment);
          } catch {}

          // B. entityId without MATCH# prefix
          try {
            const res = await docClient.send(
              new QueryCommand({
                TableName: tbl,
                KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":eId": cleanMatchId,
                  ":skPrefix": "MOMENT#",
                },
              })
            );
            (res.Items || []).forEach(addMoment);
          } catch {}

          // C. pk (standard schema)
          try {
            const res = await docClient.send(
              new QueryCommand({
                TableName: tbl,
                KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":pk": `MATCH#${cleanMatchId}`,
                  ":skPrefix": "MOMENT#",
                },
              })
            );
            (res.Items || []).forEach(addMoment);
          } catch {}
        } else {
          // No matchId: scan for all moments
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: tbl,
              FilterExpression: "begins_with(sk, :skPrefix)",
              ExpressionAttributeValues: { ":skPrefix": "MOMENT#" },
              Limit: 200,
            })
          );
          (scanRes.Items || []).forEach(addMoment);
        }
      } catch (tblErr) {
        console.warn(`[match-moments GET] table ${tbl} skipped:`, tblErr);
        continue;
      }
    }

    // 2. Also check Firestore (no orderBy -> no composite index needed)
    if (db) {
      try {
        let q: FirebaseFirestore.Query = db.collection(getFirestoreCollection("match_moments"));
        if (cleanMatchId) {
          q = q.where("matchId", "in", [cleanMatchId, `MATCH#${cleanMatchId}`]);
        }
        const snap = await q.limit(200).get();
        snap.docs.forEach((d) => addMoment({ ...d.data() }));
      } catch (fbErr) {
        console.warn("[match-moments GET] Firestore fallback notice:", fbErr);
      }
    }

    const moments = Array.from(momentMap.values());

    // Sort by innings, then over, then newest first
    moments.sort((a, b) => {
      if (a.innings !== b.innings) return (a.innings || 1) - (b.innings || 1);
      const ovA = parseFloat(a.overs || "0");
      const ovB = parseFloat(b.overs || "0");
      if (ovA !== ovB) return ovA - ovB;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    return NextResponse.json({
      success: true,
      data: moments,
      count: moments.length,
      storageTable: "MatchMoments",
    });
  } catch (err: any) {
    console.error("[match-moments GET] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch match moments" },
      { status: 500 }
    );
  }
}

// ─── POST /api/match-moments ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      momentId,
      matchId,
      innings,
      overs,
      format,
      stage,
      venue,
      score,
      matchOverTimestamp,
      event,
      matchMoment,
      description,
      status,
      isEdit,
    } = body;

    if (!matchId || !event || !matchMoment) {
      return NextResponse.json(
        { success: false, error: "matchId, event, and matchMoment are required" },
        { status: 400 }
      );
    }

    const cleanMatchId = stripMatchPrefix(matchId);
    const cleanMomentId =
      momentId && String(momentId).trim()
        ? String(momentId).trim()
        : `MM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Moment IDs must be unique within a match.
    // Creating with an ID that already exists is rejected; editing updates the existing one.
    const isUpdate = Boolean(isEdit);
    const hasClientId = Boolean(momentId && String(momentId).trim());
    const existing = hasClientId ? await findExistingMoment(cleanMatchId, cleanMomentId) : null;

    if (existing && !isUpdate) {
      return NextResponse.json(
        {
          success: false,
          error: `Moment ID ${cleanMomentId} already exists for match ${cleanMatchId}. Use Edit to update it, or refresh to get the next free ID.`,
        },
        { status: 409 }
      );
    }

    const now = Date.now();
    const payload = {
      momentId: cleanMomentId,
      matchId: cleanMatchId,
      innings: Number(innings) || 1,
      overs: String(overs || "").trim(),
      format: String(format || "").trim(),
      stage: String(stage || "").trim(),
      venue: String(venue || "").trim(),
      score: String(score || "").trim(),
      matchOverTimestamp: String(matchOverTimestamp || "").trim(),
      event: String(event).trim(),
      matchMoment: String(matchMoment).trim(),
      description: String(description || "").trim(),
      status: status || "active",
      createdAt: isUpdate && existing?.createdAt ? existing.createdAt : now,
      updatedAt: now,
    };

    // Primary write to DynamoDB MatchMoments table + Firestore match_moments
    // (dual keys: entityId + pk for schema resilience)
    await dualWrite({
      tableName: TABLES.MatchMoments,
      dynamoItem: {
        entityId: `MATCH#${cleanMatchId}`,
        pk: `MATCH#${cleanMatchId}`,
        sk: `MOMENT#${cleanMomentId}`,
        ...payload, // already includes matchId and momentId
      },
      collectionName: getFirestoreCollection("match_moments"),
      docId: `${cleanMatchId}_${cleanMomentId}`,
      firestoreData: payload,
    });

    // Secondary sync write to SportsData table so legacy readers also stay in sync
    try {
      await dualWrite({
        tableName: TABLES.SportsData,
        dynamoItem: {
          entityId: `MATCH#${cleanMatchId}`,
          pk: `MATCH#${cleanMatchId}`,
          sk: `MOMENT#${cleanMomentId}`,
          ...payload,
        },
        collectionName: getFirestoreCollection("match_moments"),
        docId: `${cleanMatchId}_${cleanMomentId}`,
        firestoreData: payload,
      });
    } catch (secErr) {
      console.warn("[match-moments POST] Secondary SportsData sync notice:", secErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Match Moment ${cleanMomentId} ${isUpdate ? "updated" : "created"} successfully`,
        storageTable: "MatchMoments",
        data: payload,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[match-moments POST] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create match moment" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/match-moments ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const momentId = searchParams.get("momentId");
  const matchId = searchParams.get("matchId");

  if (!momentId || !matchId) {
    return NextResponse.json(
      { success: false, error: "momentId and matchId are required for deletion" },
      { status: 400 }
    );
  }

  const cleanMatchId = stripMatchPrefix(matchId);

  try {
    // Delete from MatchMoments table
    await dualDelete({
      tableName: TABLES.MatchMoments,
      key: {
        entityId: `MATCH#${cleanMatchId}`,
        sk: `MOMENT#${momentId}`,
      },
      collectionName: getFirestoreCollection("match_moments"),
      docId: `${cleanMatchId}_${momentId}`,
    });

    // Delete from SportsData table if present
    try {
      await dualDelete({
        tableName: TABLES.SportsData,
        key: {
          entityId: `MATCH#${cleanMatchId}`,
          sk: `MOMENT#${momentId}`,
        },
        collectionName: getFirestoreCollection("match_moments"),
        docId: `${cleanMatchId}_${momentId}`,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Moment ${momentId} deleted from MatchMoments table`,
      storageTable: "MatchMoments",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete match moment" },
      { status: 500 }
    );
  }
}