// // app/api/match-moments/route.ts — Match Moments Dual-Write API
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { docClient } from "@/lib/dynamodb";
// import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
// import { TABLES } from "@/lib/tableNames";
// import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

// export const dynamic = "force-dynamic";

// // ─── GET /api/match-moments ──────────────────────────────────────────────────
// // Query params: matchId (optional, filters by match)
// export async function GET(req: NextRequest) {
//   const { searchParams } = new URL(req.url);
//   const matchId = searchParams.get("matchId");

//   try {
//     let moments: any[] = [];

//     // 1. Query DynamoDB MatchMoments (with SportsData fallback for backward compatibility)
//     try {
//       const candidateTables = Array.from(
//         new Set([
//           ...getCandidateTableNames(TABLES.MatchMoments),
//           ...getCandidateTableNames(TABLES.SportsData),
//         ])
//       );

//       for (const table of candidateTables) {
//         try {
//           if (matchId) {
//             const queryRes = await docClient.send(
//               new QueryCommand({
//                 TableName: table,
//                 KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
//                 ExpressionAttributeValues: {
//                   ":eId": `MATCH#${matchId}`,
//                   ":skPrefix": "MOMENT#",
//                 },
//               })
//             );
//             if (queryRes.Items && queryRes.Items.length > 0) {
//               moments = queryRes.Items.map((item) => ({
//                 id: item.momentId || item.sk?.replace(/^MOMENT#/, ""),
//                 ...item,
//               }));
//               break;
//             }
//           } else {
//             const scanRes = await docClient.send(
//               new ScanCommand({
//                 TableName: table,
//                 FilterExpression: "begins_with(sk, :skPrefix)",
//                 ExpressionAttributeValues: {
//                   ":skPrefix": "MOMENT#",
//                 },
//                 Limit: 200,
//               })
//             );
//             if (scanRes.Items && scanRes.Items.length > 0) {
//               moments = scanRes.Items.map((item) => ({
//                 id: item.momentId || item.sk?.replace(/^MOMENT#/, ""),
//                 ...item,
//               }));
//               break;
//             }
//           }
//         } catch (tableErr) {
//           // Continue to next candidate table
//         }
//       }
//     } catch (dynErr) {
//       console.warn("[match-moments GET] DynamoDB notice:", dynErr);
//     }

//     // 2. Fallback to Firestore if empty
//     if (moments.length === 0) {
//       let q: FirebaseFirestore.Query = db.collection("match_moments");
//       if (matchId) {
//         q = q.where("matchId", "==", matchId);
//       }
//       const snap = await q.orderBy("createdAt", "desc").limit(200).get();
//       moments = snap.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       }));
//     }

//     // 3. Fallback to sample data for demo if totally empty
//     if (moments.length === 0) {
//       moments = [
//         {
//           id: "MM-IND-SA-1",
//           momentId: "MM-IND-SA-1",
//           matchId: matchId || "cric_ind_sa_2026_01",
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

//     return NextResponse.json({
//       success: true,
//       data: moments,
//       count: moments.length,
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
//       format,
//       stage,
//       venue,
//       score,
//       matchOverTimestamp,
//       event,
//       matchMoment,
//       description,
//       status,
//     } = body;

//     if (!matchId || !event || !matchMoment) {
//       return NextResponse.json(
//         { success: false, error: "matchId, event, and matchMoment are required" },
//         { status: 400 }
//       );
//     }

//     const cleanMatchId = String(matchId).trim();
//     const cleanMomentId =
//       momentId && String(momentId).trim()
//         ? String(momentId).trim()
//         : `MM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

//     const now = Date.now();
//     const payload = {
//       momentId: cleanMomentId,
//       matchId: cleanMatchId,
//       format: String(format || "").trim(),
//       stage: String(stage || "").trim(),
//       venue: String(venue || "").trim(),
//       score: String(score || "").trim(),
//       matchOverTimestamp: String(matchOverTimestamp || "").trim(),
//       event: String(event).trim(),
//       matchMoment: String(matchMoment).trim(),
//       description: String(description || "").trim(),
//       status: status || "active",
//       createdAt: now,
//       updatedAt: now,
//     };

//     // Dual-write to DynamoDB MatchMoments + Firestore match_moments
//     await dualWrite({
//       tableName: TABLES.MatchMoments,
//       dynamoItem: {
//         entityId: `MATCH#${cleanMatchId}`,
//         sk: `MOMENT#${cleanMomentId}`,
//         ...payload,
//       },
//       collectionName: "match_moments",
//       docId: `${cleanMatchId}_${cleanMomentId}`,
//       firestoreData: payload,
//     });

//     return NextResponse.json(
//       {
//         success: true,
//         message: `Match Moment ${cleanMomentId} created successfully`,
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

//   try {
//     await dualDelete({
//       tableName: TABLES.MatchMoments,
//       key: {
//         entityId: `MATCH#${matchId}`,
//         sk: `MOMENT#${momentId}`,
//       },
//       collectionName: "match_moments",
//       docId: `${matchId}_${momentId}`,
//     });

//     return NextResponse.json({ success: true, message: `Moment ${momentId} deleted` });
//   } catch (err: any) {
//     return NextResponse.json(
//       { success: false, error: err.message || "Failed to delete match moment" },
//       { status: 500 }
//     );
//   }
// }


// app/api/match-moments/route.ts — Match Moments Dual-Write API
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { TABLES } from "@/lib/tableNames";
import { GetCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── Helper: look up an existing moment (DynamoDB candidates first, then Firestore) ───
// Moment IDs are unique per match: the storage key is MATCH#<matchId> + MOMENT#<momentId>.
async function findExistingMoment(matchId: string, momentId: string): Promise<any | null> {
  const candidateTables = Array.from(
    new Set([
      ...getCandidateTableNames(TABLES.MatchMoments),
      ...getCandidateTableNames(TABLES.SportsData),
    ])
  );

  for (const table of candidateTables) {
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
    const snap = await db.collection("match_moments").doc(`${matchId}_${momentId}`).get();
    if (snap.exists) return snap.data() || {};
  } catch {
    // ignore Firestore lookup errors
  }

  return null;
}

// ─── GET /api/match-moments ──────────────────────────────────────────────────
// Query params: matchId (optional, filters by match)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get("matchId");

  try {
    let moments: any[] = [];

    // 1. Query ALL candidate DynamoDB tables, merge + dedupe by key
    try {
      const candidateTables = Array.from(
        new Set([
          ...getCandidateTableNames(TABLES.MatchMoments),
          ...getCandidateTableNames(TABLES.SportsData),
        ])
      );

      const byKey = new Map<string, any>();

      for (const table of candidateTables) {
        try {
          const items: any[] = matchId
            ? (
                await docClient.send(
                  new QueryCommand({
                    TableName: table,
                    KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                    ExpressionAttributeValues: {
                      ":eId": `MATCH#${matchId}`,
                      ":skPrefix": "MOMENT#",
                    },
                    ConsistentRead: true,
                  })
                )
              ).Items || []
            : (
                await docClient.send(
                  new ScanCommand({
                    TableName: table,
                    FilterExpression: "begins_with(sk, :skPrefix)",
                    ExpressionAttributeValues: {
                      ":skPrefix": "MOMENT#",
                    },
                    Limit: 200,
                  })
                )
              ).Items || [];

          for (const item of items) {
            const key = `${item.entityId}|${item.sk}`;
            const prev = byKey.get(key);
            // If the same moment exists in two tables, keep the most recently updated copy
            if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
              byKey.set(key, {
                id: item.momentId || item.sk?.replace(/^MOMENT#/, ""),
                ...item,
              });
            }
          }
        } catch (tableErr) {
          console.warn(`[match-moments GET] table ${table} skipped:`, tableErr);
        }
      }

      moments = Array.from(byKey.values()).sort(
        (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
      );
    } catch (dynErr) {
      console.warn("[match-moments GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore if empty (no orderBy -> no composite index needed)
    if (moments.length === 0) {
      let q: FirebaseFirestore.Query = db.collection("match_moments");
      if (matchId) {
        q = q.where("matchId", "==", matchId);
      }
      const snap = await q.limit(200).get();
      moments = snap.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    // 3. Fallback to sample data for demo if totally empty (non-production only)
    if (moments.length === 0 && process.env.NODE_ENV !== "production") {
      moments = [
        {
          id: "MM-IND-SA-1",
          momentId: "MM-IND-SA-1",
          matchId: matchId || "cric_ind_sa_2026_01",
          innings: 1,
          overs: "19.5",
          format: "T20",
          stage: "Super 8",
          venue: "Kensington Oval, Barbados",
          score: "IND 176/7 (20) vs SA 169/8 (20)",
          matchOverTimestamp: "19.5 Overs",
          event: "Wicket",
          matchMoment: "Suryakumar Yadav catches Miller on the boundary rope",
          description: "Unbelievable athleticism at long-off under immense World Cup final pressure.",
          status: "active",
          createdAt: Date.now() - 3600000,
        },
        {
          id: "MM-IND-SA-2",
          momentId: "MM-IND-SA-2",
          matchId: matchId || "cric_ind_sa_2026_01",
          innings: 2,
          overs: "15.1",
          format: "T20",
          stage: "Super 8",
          venue: "Kensington Oval, Barbados",
          score: "IND 176/7 (20) vs SA 151/4 (15)",
          matchOverTimestamp: "15.1 Overs",
          event: "Milestone",
          matchMoment: "Heinrich Klaasen smashes 24 runs in the 15th over",
          description: "Explosive hitting turned the momentum squarely into South Africa's favor.",
          status: "active",
          createdAt: Date.now() - 7200000,
        },
      ];
    }

    return NextResponse.json({
      success: true,
      data: moments,
      count: moments.length,
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

    const cleanMatchId = String(matchId).trim();
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

    // Dual-write to DynamoDB MatchMoments + Firestore match_moments
    await dualWrite({
      tableName: TABLES.MatchMoments,
      dynamoItem: {
        entityId: `MATCH#${cleanMatchId}`,
        sk: `MOMENT#${cleanMomentId}`,
        ...payload,
      },
      collectionName: "match_moments",
      docId: `${cleanMatchId}_${cleanMomentId}`,
      firestoreData: payload,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Match Moment ${cleanMomentId} ${isUpdate ? "updated" : "created"} successfully`,
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

  try {
    await dualDelete({
      tableName: TABLES.MatchMoments,
      key: {
        entityId: `MATCH#${matchId}`,
        sk: `MOMENT#${momentId}`,
      },
      collectionName: "match_moments",
      docId: `${matchId}_${momentId}`,
    });

    return NextResponse.json({ success: true, message: `Moment ${momentId} deleted` });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete match moment" },
      { status: 500 }
    );
  }
}