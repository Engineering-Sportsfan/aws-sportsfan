// app/api/match-moments/route.ts — Match Moments Dual-Write API (Primary Table: MatchMoments)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// ─── GET /api/match-moments ──────────────────────────────────────────────────
// Query params: matchId (optional, filters by match)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawMatchId = searchParams.get("matchId");
  const matchesOnly = searchParams.get("matchesOnly") === "true";
  const matchId = rawMatchId ? rawMatchId.trim() : null;
  const cleanMatchId = matchId ? matchId.replace(/^MATCH#/, "") : null;

  try {
    const candidateTables = getCandidateTableNames("MatchMoments");

    // 0. Quick helper: Return list of matches that currently have moments in MatchMoments
    if (matchesOnly) {
      let allMoments: any[] = [];
      for (const tbl of candidateTables) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: tbl,
              FilterExpression: "begins_with(sk, :skPrefix)",
              ExpressionAttributeValues: {
                ":skPrefix": "MOMENT#",
              },
              Limit: 200,
            })
          );
          if (scanRes.Items && scanRes.Items.length > 0) {
            allMoments = scanRes.Items;
            break;
          }
        } catch {}
      }

      const matchMap = new Map<string, number>();
      for (const item of allMoments) {
        const mId = (item.matchId || item.entityId?.replace(/^MATCH#/, ""))?.trim();
        if (mId) {
          matchMap.set(mId, (matchMap.get(mId) || 0) + 1);
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

    let moments: any[] = [];
    const momentMap = new Map<string, any>();

    const addMoment = (item: any) => {
      const momId = item.momentId || item.sk?.replace(/^MOMENT#/, "");
      if (momId && !momentMap.has(momId)) {
        momentMap.set(momId, {
          id: momId,
          ...item,
        });
      }
    };

    // 1. Query DynamoDB Table MatchMoments across candidate tables
    try {
      const candidateTables = getCandidateTableNames("MatchMoments");

      if (cleanMatchId) {
        for (const tbl of candidateTables) {
          try {
            // A. Query by entityId with MATCH# prefix
            let queryRes = await docClient.send(
              new QueryCommand({
                TableName: tbl,
                KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":eId": `MATCH#${cleanMatchId}`,
                  ":skPrefix": "MOMENT#",
                },
              })
            );

            if (queryRes.Items) {
              queryRes.Items.forEach(addMoment);
            }

            // B. If empty, try without MATCH# prefix
            try {
              const queryResNoPrefix = await docClient.send(
                new QueryCommand({
                  TableName: tbl,
                  KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                  ExpressionAttributeValues: {
                    ":eId": cleanMatchId,
                    ":skPrefix": "MOMENT#",
                  },
                })
              );
              if (queryResNoPrefix.Items) {
                queryResNoPrefix.Items.forEach(addMoment);
              }
            } catch {}

            // C. Try pk (standard schema)
            try {
              const queryResPk = await docClient.send(
                new QueryCommand({
                  TableName: tbl,
                  KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
                  ExpressionAttributeValues: {
                    ":pk": `MATCH#${cleanMatchId}`,
                    ":skPrefix": "MOMENT#",
                  },
                })
              );
              if (queryResPk.Items) {
                queryResPk.Items.forEach(addMoment);
              }
            } catch {}
          } catch (tblErr) {
            console.warn(`[match-moments GET] Query error on table ${tbl}:`, tblErr);
            continue;
          }
        }
      } else {
        // No matchId: Scan for all moments across MatchMoments
        for (const tbl of candidateTables) {
          try {
            const scanRes = await docClient.send(
              new ScanCommand({
                TableName: tbl,
                FilterExpression: "begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":skPrefix": "MOMENT#",
                },
                Limit: 200,
              })
            );
            if (scanRes.Items && scanRes.Items.length > 0) {
              scanRes.Items.forEach(addMoment);
            }
          } catch {
            continue;
          }
        }
      }
    } catch (dynErr) {
      console.warn("[match-moments GET] MatchMoments notice:", dynErr);
    }

    // 2. Query DynamoDB SportsData table as well
    if (cleanMatchId) {
      try {
        const queryRes = await docClient.send(
          new QueryCommand({
            TableName: "SportsData",
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${cleanMatchId}`,
              ":skPrefix": "MOMENT#",
            },
          })
        );
        if (queryRes.Items) {
          queryRes.Items.forEach(addMoment);
        }
      } catch (spErr) {
        console.warn("[match-moments GET] SportsData fallback notice:", spErr);
      }
    }

    // 3. Check Firestore
    if (db) {
      try {
        let q: FirebaseFirestore.Query = db.collection(getFirestoreCollection("match_moments"));
        if (cleanMatchId) {
          q = q.where("matchId", "in", [cleanMatchId, `MATCH#${cleanMatchId}`]);
        }
        const snap = await q.get();
        snap.docs.forEach((d) => addMoment({ id: d.id, ...d.data() }));
      } catch (fbErr) {
        console.warn("[match-moments GET] Firestore fallback notice:", fbErr);
      }
    }

    moments = Array.from(momentMap.values());

    // Sort by createdAt / over if available
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
      innings = 1,
      overs = "0.1",
      score = "",
      matchOverTimestamp = "",
      event = "Moment",
      matchMoment = "",
      description = "",
      status = "active",
    } = body;

    if (!momentId || !matchId) {
      return NextResponse.json(
        { success: false, error: "momentId and matchId are required fields" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const cleanMomentId = String(momentId).trim();
    const cleanMatchId = String(matchId).trim().replace(/^MATCH#/, "");

    const payload = {
      momentId: cleanMomentId,
      matchId: cleanMatchId,
      innings: Number(innings) || 1,
      overs: String(overs).trim(),
      score: String(score).trim(),
      matchOverTimestamp: String(matchOverTimestamp).trim(),
      event: String(event).trim(),
      matchMoment: String(matchMoment).trim(),
      description: String(description).trim(),
      status: status || "active",
      createdAt: now,
      updatedAt: now,
    };

    // Primary write to DynamoDB MatchMoments table (Dual keys: entityId + pk for 100% schema resilience)
    await dualWrite({
      tableName: "MatchMoments",
      dynamoItem: {
        entityId: `MATCH#${cleanMatchId}`,
        pk: `MATCH#${cleanMatchId}`,
        sk: `MOMENT#${cleanMomentId}`,
        matchId: cleanMatchId,
        momentId: cleanMomentId,
        ...payload,
      },
      collectionName: getFirestoreCollection("match_moments"),
      docId: `${cleanMatchId}_${cleanMomentId}`,
      firestoreData: payload,
    });

    // Secondary sync write to SportsData table so legacy readers also stay in sync
    try {
      await dualWrite({
        tableName: "SportsData",
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
        message: `Match Moment ${cleanMomentId} created successfully in MatchMoments table`,
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

  const cleanMatchId = matchId.replace(/^MATCH#/, "");

  try {
    // Delete from MatchMoments table
    await dualDelete({
      tableName: "MatchMoments",
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
        tableName: "SportsData",
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
