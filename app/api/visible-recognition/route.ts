// app/api/visible-recognition/route.ts — Dual-Write Visual Recognition Engine API (Primary Table: MatchMoments)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { cacheService } from "@/lib/cacheService";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export interface VisualRecognitionPayload {
  id?: string;
  recognitionId: string;
  matchId: string;
  momentId: string;
  targetType: "all" | "user";
  targetUserId?: string | null;
  targetUserName?: string | null;
  targetUserAvatar?: string | null;
  archetype: "SHARP_ORACLE" | "FEARLESS_MAVERICK" | "STADIUM_PULSE_MAKER" | "CLUTCH_CALLER" | "MOMENT_MVP" | "CUSTOM";
  badgeIcon: string;
  headline: string;
  message: string;
  themeColor: string;
  mediaUrl?: string | null;
  rewards: {
    accuracySxp: number;
    participationSxp: number;
    streakBonusSxp: number;
    totalSxp: number;
  };
  communityImpact?: {
    stanceCount?: number;
    crowdSharePercent?: number;
    stadiumRoars?: string;
  };
  reengagementHook?: {
    nextMomentPrompt?: string;
    startsInSeconds?: number;
    nextMomentId?: string;
  };
  status?: "active" | "dispatched" | "delivered";
  createdAt?: number;
  updatedAt?: number;
}

// ─── GET /api/visible-recognition ───────────────────────────────────────────
// Query params: matchId (optional), momentId (optional), targetUserId (optional)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawMatchId = searchParams.get("matchId");
  const rawMomentId = searchParams.get("momentId");
  const targetUserId = searchParams.get("targetUserId");

  const cleanMatchId = rawMatchId ? rawMatchId.trim().replace(/^MATCH#/, "") : null;
  const cleanMomentId = rawMomentId ? rawMomentId.trim().replace(/^MOMENT#/, "") : null;

  try {
    let recognitions: any[] = [];

    // 1. Query DynamoDB MatchMoments table first
    try {
      let skPrefix = "RECOGNITION#";
      if (cleanMomentId) {
        skPrefix = `RECOGNITION#${cleanMomentId}#`;
      }

      const candidateTables = getCandidateTableNames("MatchMoments");

      if (cleanMatchId) {
        for (const tbl of candidateTables) {
          try {
            // A. Query by entityId with MATCH# prefix (Actual AWS schema for MatchMoments)
            let queryRes = await docClient.send(
              new QueryCommand({
                TableName: tbl,
                KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":eId": `MATCH#${cleanMatchId}`,
                  ":skPrefix": skPrefix,
                },
              })
            );

            // B. If empty, try without MATCH# prefix
            if (!queryRes.Items || queryRes.Items.length === 0) {
              try {
                queryRes = await docClient.send(
                  new QueryCommand({
                    TableName: tbl,
                    KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                    ExpressionAttributeValues: {
                      ":eId": cleanMatchId,
                      ":skPrefix": skPrefix,
                    },
                  })
                );
              } catch {}
            }

            // C. If still empty, try pk
            if (!queryRes.Items || queryRes.Items.length === 0) {
              try {
                queryRes = await docClient.send(
                  new QueryCommand({
                    TableName: tbl,
                    KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
                    ExpressionAttributeValues: {
                      ":pk": `MATCH#${cleanMatchId}`,
                      ":skPrefix": skPrefix,
                    },
                  })
                );
              } catch {}
            }

            if (queryRes.Items && queryRes.Items.length > 0) {
              recognitions = queryRes.Items.map((item) => ({
                id: item.recognitionId || item.sk?.replace(/^RECOGNITION#/, ""),
                ...item,
              }));
              break;
            }
          } catch (tblErr) {
            console.warn(`[visible-recognition GET] Query error on table ${tbl}:`, tblErr);
            continue;
          }
        }
      } else {
        // No matchId: Scan for all recognitions across MatchMoments
        for (const tbl of candidateTables) {
          try {
            const scanRes = await docClient.send(
              new ScanCommand({
                TableName: tbl,
                FilterExpression: "begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":skPrefix": "RECOGNITION#",
                },
                Limit: 200,
              })
            );
            if (scanRes.Items && scanRes.Items.length > 0) {
              recognitions = scanRes.Items.map((item) => ({
                id: item.recognitionId || item.sk?.replace(/^RECOGNITION#/, ""),
                ...item,
              }));
              break;
            }
          } catch {
            continue;
          }
        }
      }
    } catch (dynErr) {
      console.warn("[visible-recognition GET] MatchMoments notice:", dynErr);
    }

    // 2. Fallback to SportsData table if MatchMoments was empty
    if (recognitions.length === 0 && cleanMatchId) {
      try {
        let skPrefix = "RECOGNITION#";
        if (cleanMomentId) {
          skPrefix = `RECOGNITION#${cleanMomentId}#`;
        }

        const queryRes = await docClient.send(
          new QueryCommand({
            TableName: "SportsData",
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${cleanMatchId}`,
              ":skPrefix": skPrefix,
            },
          })
        );

        if (queryRes.Items && queryRes.Items.length > 0) {
          recognitions = queryRes.Items.map((item) => ({
            id: item.recognitionId || item.sk?.replace(/^RECOGNITION#/, ""),
            ...item,
          }));
        }
      } catch (spErr) {
        console.warn("[visible-recognition GET] SportsData fallback notice:", spErr);
      }
    }

    // 3. Fallback to Firestore if empty
    if (recognitions.length === 0 && db) {
      try {
        let q: FirebaseFirestore.Query = db.collection(getFirestoreCollection("visible_recognitions"));
        if (cleanMatchId) {
          q = q.where("matchId", "in", [cleanMatchId, `MATCH#${cleanMatchId}`]);
        }
        if (cleanMomentId) {
          q = q.where("momentId", "in", [cleanMomentId, `MOMENT#${cleanMomentId}`]);
        }
        const snap = await q.get();
        recognitions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (fbErr) {
        console.warn("[visible-recognition GET] Firestore fallback notice:", fbErr);
      }
    }

    // Filter by targetUserId if requested
    if (targetUserId) {
      recognitions = recognitions.filter(
        (r) => r.targetType === "all" || r.targetUserId === targetUserId
      );
    }

    // Sort newest first
    recognitions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({
      success: true,
      data: recognitions,
      count: recognitions.length,
      storageTable: "MatchMoments",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch visible recognitions" },
      { status: 500 }
    );
  }
}

// ─── POST /api/visible-recognition ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: VisualRecognitionPayload = await req.json();

    const {
      matchId,
      momentId,
      targetType = "all",
      targetUserId = null,
      targetUserName = null,
      targetUserAvatar = null,
      archetype = "SHARP_ORACLE",
      badgeIcon = "🔮",
      headline = "Tactical Visionary!",
      message = "",
      themeColor = "#f59e0b",
      mediaUrl = null,
      rewards = { accuracySxp: 10, participationSxp: 2, streakBonusSxp: 0, totalSxp: 12 },
      communityImpact = { stanceCount: 0, crowdSharePercent: 0, stadiumRoars: "+100 Roars" },
      reengagementHook = { nextMomentPrompt: "", startsInSeconds: 30 },
      status = "dispatched",
    } = body;

    if (!matchId || !momentId || !headline || !message) {
      return NextResponse.json(
        { success: false, error: "matchId, momentId, headline, and message are required" },
        { status: 400 }
      );
    }

    if (targetType === "user" && !targetUserId) {
      return NextResponse.json(
        { success: false, error: "targetUserId is required when targetType is 'user'" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const cleanMatchId = String(matchId).trim().replace(/^MATCH#/, "");
    const cleanMomentId = String(momentId).trim().replace(/^MOMENT#/, "");
    const targetKey = targetType === "user" ? `USER#${String(targetUserId).trim()}` : "GLOBAL";
    const recognitionId = body.recognitionId || `VR_${cleanMomentId}_${Date.now()}_${targetType === "user" ? String(targetUserId).trim() : "ALL"}`;

    const payload = {
      recognitionId,
      matchId: cleanMatchId,
      momentId: cleanMomentId,
      targetType,
      targetUserId: targetUserId ? String(targetUserId).trim() : null,
      targetUserName: targetUserName ? String(targetUserName).trim() : (targetType === "all" ? "All Participants" : "Valued Fan"),
      targetUserAvatar: targetUserAvatar || null,
      archetype,
      badgeIcon,
      headline,
      message,
      themeColor,
      mediaUrl: mediaUrl || null,
      rewards: {
        accuracySxp: Number(rewards?.accuracySxp) || 0,
        participationSxp: Number(rewards?.participationSxp) || 0,
        streakBonusSxp: Number(rewards?.streakBonusSxp) || 0,
        totalSxp: (Number(rewards?.accuracySxp) || 0) + (Number(rewards?.participationSxp) || 0) + (Number(rewards?.streakBonusSxp) || 0),
      },
      communityImpact: {
        stanceCount: Number(communityImpact?.stanceCount) || 0,
        crowdSharePercent: Number(communityImpact?.crowdSharePercent) || 0,
        stadiumRoars: communityImpact?.stadiumRoars || "+120 Roars",
      },
      reengagementHook: {
        nextMomentPrompt: reengagementHook?.nextMomentPrompt || "",
        startsInSeconds: Number(reengagementHook?.startsInSeconds) || 30,
        nextMomentId: reengagementHook?.nextMomentId || "",
      },
      status: status || "dispatched",
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    // 1. Dual-Write to DynamoDB MatchMoments table (Dual keys: entityId + pk for 100% schema resilience)
    await dualWrite({
      tableName: "MatchMoments",
      dynamoItem: {
        entityId: `MATCH#${cleanMatchId}`,
        pk: `MATCH#${cleanMatchId}`,
        sk: `RECOGNITION#${cleanMomentId}#${targetKey}`,
        ...payload,
      },
      collectionName: getFirestoreCollection("visible_recognitions"),
      docId: recognitionId,
      firestoreData: payload,
    });

    // Also write to SportsData table so legacy readers stay in sync
    try {
      await dualWrite({
        tableName: "SportsData",
        dynamoItem: {
          entityId: `MATCH#${cleanMatchId}`,
          pk: `MATCH#${cleanMatchId}`,
          sk: `RECOGNITION#${cleanMomentId}#${targetKey}`,
          ...payload,
        },
        collectionName: getFirestoreCollection("visible_recognitions"),
        docId: recognitionId,
        firestoreData: payload,
      });
    } catch {}

    // 2. Real-time Cache in Redis for instant WebSocket / In-App Retrieval
    try {
      const cacheKey = targetType === "user"
        ? `recognition:${targetUserId}:latest`
        : `match:${cleanMatchId}:moment:${cleanMomentId}:recognition:latest`;
      
      await cacheService.set(cacheKey, payload, 300); // 5-minute cache
    } catch (cacheErr) {
      console.warn("[visible-recognition] Cache notice:", cacheErr);
    }

    // 3. Optional: Write to sf360-notifications table if targeting a specific user
    if (targetType === "user" && targetUserId) {
      try {
        const notifId = `ntf_${recognitionId}`;
        const notifPayload = {
          notificationId: notifId,
          userId: targetUserId,
          type: "MATCH_MOMENT_RECOGNITION",
          title: headline,
          message: message,
          data: {
            recognitionId,
            matchId: cleanMatchId,
            momentId: cleanMomentId,
            archetype,
            sxpReward: payload.rewards.totalSxp,
          },
          read: false,
          createdAt: now,
        };

        await dualWrite({
          tableName: "sf360-notifications",
          dynamoItem: {
            entityId: `USER#${targetUserId}`,
            sk: `NOTIF#${now}#${notifId}`,
            ...notifPayload,
          },
          collectionName: getFirestoreCollection("notifications"),
          docId: notifId,
          firestoreData: notifPayload,
        });
      } catch (notifErr) {
        console.warn("[visible-recognition] User notification notice:", notifErr);
      }
    }

    // 4. Record inline room broadcast for ROAR Pulse stream
    if (db) {
      try {
        const roomBroadcastData = {
          id: `rec_inline_${recognitionId}`,
          recognitionId,
          matchId: cleanMatchId,
          momentId: cleanMomentId,
          type: "VISUAL_RECOGNITION",
          targetType,
          targetUserId: targetUserId ? String(targetUserId).trim() : null,
          targetUserName: payload.targetUserName,
          targetUserAvatar: payload.targetUserAvatar,
          archetype,
          badgeIcon,
          headline,
          message,
          themeColor,
          rewards: payload.rewards,
          communityImpact: payload.communityImpact,
          reengagementHook: payload.reengagementHook,
          createdAt: now,
          expiresAt: now + 86400000,
        };

        await db.collection(getFirestoreCollection("match_room_notifications"))
          .doc(`rec_inline_${recognitionId}`)
          .set(roomBroadcastData, { merge: true });
      } catch (brErr) {
        console.warn("[visible-recognition] Room broadcast notice:", brErr);
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: targetType === "all"
          ? "General Visual Recognition successfully created and dispatched to all moment participants in MatchMoments table"
          : `Targeted Visual Recognition successfully sent to user ${payload.targetUserName || targetUserId} in MatchMoments table`,
        storageTable: "MatchMoments",
        data: payload,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create visible recognition" },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/visible-recognition ────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const recognitionId = searchParams.get("id") || searchParams.get("recognitionId");
  const matchId = searchParams.get("matchId");
  const momentId = searchParams.get("momentId");
  const targetType = searchParams.get("targetType") || "all";
  const targetUserId = searchParams.get("targetUserId");

  if (!recognitionId) {
    return NextResponse.json(
      { success: false, error: "recognitionId is required" },
      { status: 400 }
    );
  }

  try {
    const cleanMatchId = matchId ? matchId.replace(/^MATCH#/, "") : "";
    const cleanMomentId = momentId ? momentId.replace(/^MOMENT#/, "") : "";
    const targetKey = targetType === "user" && targetUserId ? `USER#${targetUserId}` : "GLOBAL";

    if (cleanMatchId && cleanMomentId) {
      const candidateTables = getCandidateTableNames("MatchMoments");
      for (const tbl of candidateTables) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: tbl,
              Key: {
                entityId: `MATCH#${cleanMatchId}`,
                sk: `RECOGNITION#${cleanMomentId}#${targetKey}`,
              },
            })
          );
        } catch {}
      }

      // Also clean from SportsData
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "SportsData",
            Key: {
              entityId: `MATCH#${cleanMatchId}`,
              sk: `RECOGNITION#${cleanMomentId}#${targetKey}`,
            },
          })
        );
      } catch {}
    }

    // Delete from Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("visible_recognitions")).doc(recognitionId).delete();
      } catch {}
    }

    return NextResponse.json({
      success: true,
      message: `Visual Recognition ${recognitionId} deleted successfully from MatchMoments table`,
      storageTable: "MatchMoments",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete visible recognition" },
      { status: 500 }
    );
  }
}
