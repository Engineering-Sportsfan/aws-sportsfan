// app/api/visible-recognition/route.ts — Dual-Write Visual Recognition Engine API (Primary Table: MatchMoments)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete, getCandidateTableNames } from "@/lib/dualWrite";
import { cacheService } from "@/lib/cacheService";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, ScanCommand, DeleteCommand, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { createNotification } from "@/lib/notifications";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { awardUserPoints } from "@/lib/userPoints";

export const dynamic = "force-dynamic";

export interface VisualRecognitionPayload {
  id?: string;
  recognitionId: string;
  seriesId?: string;
  matchId: string;
  momentId: string;
  engagementId?: string;
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
  const rawEngagementId = searchParams.get("engagementId");
  const targetUserId = searchParams.get("targetUserId");

  const cleanMatchId = rawMatchId ? rawMatchId.trim().replace(/^MATCH[#-]/i, "") : null;
  const cleanMomentId = rawMomentId ? rawMomentId.trim().replace(/^MOMENT[#-]/i, "") : null;
  const cleanEngagementIdFilter = rawEngagementId
    ? rawEngagementId.trim().replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "")
    : null;

  const matchKeyCandidates = cleanMatchId
    ? Array.from(
        new Set(
          [
            `MATCH#${cleanMatchId}`,
            cleanMatchId,
            rawMatchId ? rawMatchId.trim() : null,
            `MATCH-${cleanMatchId}`,
          ].filter(Boolean) as string[]
        )
      )
    : [];

  try {
    const recMap = new Map<string, any>();

    // 1. Query DynamoDB MatchMoments table
    try {
      let skPrefix = "RECOGNITION#";
      if (cleanMomentId) {
        skPrefix = `RECOGNITION#${cleanMomentId}#`;
      }

      const candidateTables = getCandidateTableNames("MatchMoments");

      if (cleanMatchId && matchKeyCandidates.length > 0) {
        for (const tbl of candidateTables) {
          for (const mKey of matchKeyCandidates) {
            try {
              // A. Query by entityId
              const queryRes = await docClient.send(
                new QueryCommand({
                  TableName: tbl,
                  KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                  ExpressionAttributeValues: {
                    ":eId": mKey,
                    ":skPrefix": skPrefix,
                  },
                })
              );

              if (queryRes.Items && queryRes.Items.length > 0) {
                for (const item of queryRes.Items) {
                  const key = String(item.recognitionId || item.id || item.sk || Math.random());
                  if (!recMap.has(key)) {
                    recMap.set(key, {
                      id: item.recognitionId || item.sk?.replace(/^RECOGNITION#/, ""),
                      ...item,
                    });
                  }
                }
              }
            } catch (tblErr) {
              // Try pk if entityId fails
              try {
                const pkRes = await docClient.send(
                  new QueryCommand({
                    TableName: tbl,
                    KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
                    ExpressionAttributeValues: {
                      ":pk": mKey,
                      ":skPrefix": skPrefix,
                    },
                  })
                );
                if (pkRes.Items && pkRes.Items.length > 0) {
                  for (const item of pkRes.Items) {
                    const key = String(item.recognitionId || item.id || item.sk || Math.random());
                    if (!recMap.has(key)) {
                      recMap.set(key, {
                        id: item.recognitionId || item.sk?.replace(/^RECOGNITION#/, ""),
                        ...item,
                      });
                    }
                  }
                }
              } catch {}
            }
          }
        }
      } else {
        // No matchId: Scan for all recognitions across active MatchMoments table with full pagination
        for (const tbl of candidateTables) {
          try {
            let lastKey: Record<string, any> | undefined;
            do {
              const scanRes = await docClient.send(
                new ScanCommand({
                  TableName: tbl,
                  FilterExpression: "begins_with(sk, :skPrefix)",
                  ExpressionAttributeValues: {
                    ":skPrefix": "RECOGNITION#",
                  },
                  ExclusiveStartKey: lastKey,
                })
              );
              if (scanRes.Items && scanRes.Items.length > 0) {
                for (const item of scanRes.Items) {
                  const key = String(item.recognitionId || item.id || item.sk || Math.random());
                  if (!recMap.has(key)) {
                    recMap.set(key, {
                      id: item.recognitionId || item.sk?.replace(/^RECOGNITION#/, ""),
                      ...item,
                    });
                  }
                }
              }
              lastKey = scanRes.LastEvaluatedKey;
            } while (lastKey);
          } catch {
            continue;
          }
        }
      }
    } catch (dynErr) {
      console.warn("[visible-recognition GET] MatchMoments notice:", dynErr);
    }

    // 2. Query active environment SportsData table
    if (cleanMatchId && matchKeyCandidates.length > 0) {
      try {
        let skPrefix = "RECOGNITION#";
        if (cleanMomentId) {
          skPrefix = `RECOGNITION#${cleanMomentId}#`;
        }

        for (const mKey of matchKeyCandidates) {
          try {
            const queryRes = await docClient.send(
              new QueryCommand({
                TableName: TABLES.SportsData,
                KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPrefix)",
                ExpressionAttributeValues: {
                  ":eId": mKey,
                  ":skPrefix": skPrefix,
                },
              })
            );

            if (queryRes.Items && queryRes.Items.length > 0) {
              for (const item of queryRes.Items) {
                const key = String(item.recognitionId || item.id || item.sk || Math.random());
                if (!recMap.has(key)) {
                  recMap.set(key, {
                    id: item.recognitionId || item.sk?.replace(/^RECOGNITION#/, ""),
                    ...item,
                  });
                }
              }
            }
          } catch {}
        }
      } catch (spErr) {
        console.warn("[visible-recognition GET] SportsData notice:", spErr);
      }
    }

    // 3. Fallback / Merge with Firestore
    if (db) {
      try {
        let q: any = db.collection(getFirestoreCollection("visible_recognitions"));
        if (matchKeyCandidates.length > 0) {
          q = q.where("matchId", "in", matchKeyCandidates.slice(0, 10));
        }
        if (cleanMomentId) {
          q = q.where("momentId", "in", [cleanMomentId, `MOMENT#${cleanMomentId}`]);
        }
        const snap = await q.get();
        if (snap && snap.docs) {
          for (const d of snap.docs) {
            const data = d.data();
            const key = String(data.recognitionId || d.id);
            if (!recMap.has(key)) {
              recMap.set(key, { id: d.id, ...data });
            }
          }
        }
      } catch (fbErr) {
        console.warn("[visible-recognition GET] Firestore notice:", fbErr);
      }
    }

    let recognitions: any[] = Array.from(recMap.values());

    if (cleanEngagementIdFilter) {
      recognitions = recognitions.filter(
        (r) => String(r.engagementId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim() === cleanEngagementIdFilter
      );
    }

    // Filter by targetUserId if requested
    if (targetUserId) {
      recognitions = recognitions.filter(
        (r) => r.targetType === "all" || r.targetUserId === targetUserId
      );
    }

    // Sort newest first
    recognitions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return new NextResponse(
      JSON.stringify({
        success: true,
        data: recognitions,
        count: recognitions.length,
        storageTable: "MatchMoments",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch visible recognitions" },
      { status: 500 }
    );
  }
}

// ─── POST /api/visible-recognition ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  return handleSaveRecognition(req, false);
}

// ─── PUT /api/visible-recognition ───────────────────────────────────────────
export async function PUT(req: NextRequest) {
  return handleSaveRecognition(req, true);
}

async function handleSaveRecognition(req: NextRequest, isExplicitEdit: boolean) {
  try {
    const body: VisualRecognitionPayload & { originalSk?: string; isEdit?: boolean } = await req.json();

    const isEdit = isExplicitEdit || Boolean(body.isEdit) || Boolean(body.recognitionId);

    const {
      seriesId = "",
      matchId,
      momentId,
      engagementId = "",
      targetType = "all",
      targetUserId = null,
      targetUserName = null,
      targetUserAvatar = null,
      archetype = "SHARP_ORACLE",
      badgeIcon = "🔮",
      headline = "",
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
    // canonicalMatchId preserves "MATCH-..." (used by MATCH_SXP# leaderboard & engagements),
    // while cleanMatchId strips both "MATCH#" and "MATCH-" (used by MatchMoments entityId keys).
    const canonicalMatchId = String(matchId).trim().replace(/^MATCH#/i, "");
    const cleanMatchId = canonicalMatchId.replace(/^MATCH-/i, "");
    const cleanMomentId = String(momentId).trim().replace(/^MOMENT#/, "");
    const cleanEngagementId = engagementId
      ? String(engagementId).trim().replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "")
      : "";
    const cleanTargetUserId = targetUserId ? String(targetUserId).trim().replace(/^USER#/, "") : null;
    const toCanonicalLeaderboardUid = (raw: string) => {
      const c = String(raw || "").trim().replace(/^USER#/i, "");
      return c.includes("@") ? c.toLowerCase().replace(/[@.]/g, "_") : c;
    };
    const targetKey = targetType === "user" && cleanTargetUserId ? `USER#${cleanTargetUserId}` : "GLOBAL";
    const recognitionId =
      body.recognitionId ||
      `VR_${cleanEngagementId || cleanMomentId}_${Date.now()}_${targetType === "user" ? cleanTargetUserId : "ALL"}`;

    // Resolve parent Engagement (1:1 link) & seriesId if omitted
    const parentEng = cleanEngagementId
      ? await findEngagementById(cleanEngagementId, cleanMatchId).catch(() => null)
      : null;
    const parentEngType = String(parentEng?.item?.type || (body as any).engagementType || "").trim().toLowerCase();
    let resolvedSeriesId = String(seriesId || parentEng?.item?.seriesId || "").trim();
    if (!resolvedSeriesId) {
      for (const tbl of Array.from(new Set([TABLES.MatchMoments, TABLES.SportsData]))) {
        try {
          const matchRes = await docClient.send(
            new GetCommand({
              TableName: tbl,
              Key: { entityId: `MATCH#${cleanMatchId}`, sk: "MATCH#META" },
            })
          );
          if (matchRes.Item?.seriesId) {
            resolvedSeriesId = String(matchRes.Item.seriesId).trim();
            break;
          }
        } catch {}
      }
    }

    const payload: Record<string, any> = {
      recognitionId,
      ...(resolvedSeriesId ? { seriesId: resolvedSeriesId } : {}),
      matchId: cleanMatchId,
      momentId: cleanMomentId,
      ...(cleanEngagementId ? { engagementId: cleanEngagementId } : {}),
      ...(parentEngType ? { engagementType: parentEngType } : {}),
      targetType,
      targetUserId: cleanTargetUserId,
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

    // Enforce 1:1 Engagement <-> Recognition (keyed per engagementId when provided; moment fallback otherwise)
    const newSk = cleanEngagementId
      ? `RECOGNITION#ENG#${cleanEngagementId}#${targetKey}`
      : `RECOGNITION#${cleanMomentId}#${targetKey}`;

    const candidateTables = getCandidateTableNames("MatchMoments");
    const cleanupPrefix = cleanEngagementId ? "RECOGNITION#" : `RECOGNITION#${cleanMomentId}#`;
    const shouldReplaceItem = (item: Record<string, any>): boolean => {
      const itemSk = String(item?.sk || "");
      if (!itemSk || itemSk === newSk) return false;
      const itemEngId = String(item?.engagementId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
      if (cleanEngagementId) {
        return itemEngId === cleanEngagementId || itemSk.startsWith(`RECOGNITION#ENG#${cleanEngagementId}#`);
      }
      // Legacy moment-level call without engagementId: do not wipe recognitions linked to specific engagements
      return !itemEngId;
    };

    for (const tbl of candidateTables) {
      try {
        const existingQuery = await docClient.send(
          new QueryCommand({
            TableName: tbl,
            KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPfx)",
            ExpressionAttributeValues: {
              ":eId": `MATCH#${cleanMatchId}`,
              ":skPfx": cleanupPrefix,
            },
          })
        );
        if (existingQuery.Items) {
          for (const item of existingQuery.Items) {
            if (!shouldReplaceItem(item)) continue;
            const itemSk = item.sk;
            const itemRecId = item.recognitionId || item.id;
            await docClient.send(
              new DeleteCommand({
                TableName: tbl,
                Key: {
                  entityId: `MATCH#${cleanMatchId}`,
                  sk: itemSk,
                },
              })
            ).catch(() => {});
            if (itemRecId && itemRecId !== recognitionId) {
              if (db) {
                db.collection(getFirestoreCollection("visible_recognitions")).doc(itemRecId).delete().catch(() => {});
                db.collection(getFirestoreCollection("match_room_notifications")).doc(`rec_inline_${itemRecId}`).delete().catch(() => {});
              }
            }
          }
        }
      } catch {}
    }

    // Also check and clean from SportsData
    try {
      const spExistingQuery = await docClient.send(
        new QueryCommand({
          TableName: "SportsData",
          KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skPfx)",
          ExpressionAttributeValues: {
            ":eId": `MATCH#${cleanMatchId}`,
            ":skPfx": cleanupPrefix,
          },
        })
      );
      if (spExistingQuery.Items) {
        for (const item of spExistingQuery.Items) {
          if (shouldReplaceItem(item)) {
            await docClient.send(
              new DeleteCommand({
                TableName: "SportsData",
                Key: {
                  entityId: `MATCH#${cleanMatchId}`,
                  sk: item.sk,
                },
              })
            ).catch(() => {});
          }
        }
      }
    } catch {}

    // Also check Firestore visible_recognitions for any replaced duplicate under the same 1:1 scope
    if (db) {
      try {
        const snap = await db.collection(getFirestoreCollection("visible_recognitions"))
          .where("matchId", "in", [cleanMatchId, `MATCH#${cleanMatchId}`])
          .where("momentId", "in", [cleanMomentId, `MOMENT#${cleanMomentId}`, `MM-${cleanMomentId}`])
          .get();
        for (const doc of snap.docs) {
          const d = doc.data() || {};
          const docEngId = String(d.engagementId || "").trim();
          const sameScope = cleanEngagementId ? docEngId === cleanEngagementId : !docEngId;
          if (doc.id !== recognitionId && sameScope) {
            doc.ref.delete().catch(() => {});
            db.collection(getFirestoreCollection("match_room_notifications")).doc(`rec_inline_${doc.id}`).delete().catch(() => {});
          }
        }
      } catch {}
    }

    // Clean up old sk if changing key during an edit
    if (isEdit && body.originalSk && body.originalSk !== newSk) {
      for (const tbl of candidateTables) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: tbl,
              Key: {
                entityId: `MATCH#${cleanMatchId}`,
                sk: body.originalSk,
              },
            })
          );
        } catch {}
      }
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "SportsData",
            Key: {
              entityId: `MATCH#${cleanMatchId}`,
              sk: body.originalSk,
            },
          })
        );
      } catch {}
    }

    // 1. Dual-Write to DynamoDB MatchMoments table (Dual keys: entityId + pk for 100% schema resilience)
    await dualWrite({
      tableName: "MatchMoments",
      dynamoItem: {
        entityId: `MATCH#${cleanMatchId}`,
        pk: `MATCH#${cleanMatchId}`,
        sk: newSk,
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
          sk: newSk,
          ...payload,
        },
        collectionName: getFirestoreCollection("visible_recognitions"),
        docId: recognitionId,
        firestoreData: payload,
      });
    } catch {}

    // 1b. Bidirectional 1:1 link on the parent Engagement record
    if (cleanEngagementId && parentEng?.item) {
      try {
        parentEng.item.recognitionId = recognitionId;
        parentEng.item.hasRecognition = true;
        if (resolvedSeriesId && !parentEng.item.seriesId) parentEng.item.seriesId = resolvedSeriesId;
        parentEng.item.updatedAt = now;
        await persistEngagementUpdate(cleanEngagementId, parentEng.item, parentEng.matchMomentsRecord);
      } catch (engSyncErr) {
        console.warn("[visible-recognition] Engagement 1:1 link sync notice:", engSyncErr);
      }
    }

    // 1c. Dual-Write to GamificationAndWallet for user ledger & award SXPs
    try {
      const gamificationTable = TABLES.GamificationAndWallet;
      const totalSxp = Number(payload.rewards?.totalSxp) || 0;

      if (targetType === "user" && cleanTargetUserId) {
        const canonicalUid = toCanonicalLeaderboardUid(cleanTargetUserId);
        // Record in user's recognition ledger
        await docClient.send(
          new PutCommand({
            TableName: gamificationTable,
            Item: {
              userId: `USER#${canonicalUid}`,
              sk: `RECOGNITION#MATCH#${canonicalMatchId}#${recognitionId}`,
              rawUserId: canonicalUid,
              recognitionId,
              matchId: canonicalMatchId,
              momentId: cleanMomentId,
              engagementId: cleanEngagementId || undefined,
              ...(parentEngType ? { engagementType: parentEngType } : {}),
              archetype,
              headline,
              message,
              badgeIcon,
              themeColor,
              rewards: payload.rewards,
              awardedAt: now,
              createdAt: payload.createdAt,
            },
          })
        ).catch(() => {});

        // Record in user's activity stream
        await docClient.send(
          new PutCommand({
            TableName: gamificationTable,
            Item: {
              userId: `USER#${canonicalUid}`,
              sk: `ACTIVITY#${now}#RECOGNITION#${canonicalMatchId}`,
              type: "RECOGNITION",
              points: totalSxp,
              reason: "VISUAL_RECOGNITION_AWARD",
              matchId: canonicalMatchId,
              momentId: cleanMomentId,
              engagementId: cleanEngagementId || undefined,
              ...(parentEngType ? { engagementType: parentEngType } : {}),
              recognitionId,
              headline,
              timestamp: now,
            },
          })
        ).catch(() => {});

        // Award total SXP to user account and leaderboard under canonical matchId & userId
        if (totalSxp > 0) {
          const targetUserEmail = (body as any).targetUserEmail || (cleanTargetUserId.includes("@") ? cleanTargetUserId : "");
          await awardUserPoints({
            actualUserId: canonicalUid,
            authUserId: canonicalUid,
            userName: payload.targetUserName || canonicalUid,
            userEmail: targetUserEmail,
            userExists: true,
            points: totalSxp,
            reason: "RECOGNITION_AWARD",
            transactionId: `tx_rec_${recognitionId}_${canonicalUid}`,
            metadata: {
              matchId: canonicalMatchId,
              momentId: cleanMomentId,
              ...(cleanEngagementId ? { engagementId: cleanEngagementId } : {}),
              ...(parentEngType ? { engagementType: parentEngType } : {}),
              recognitionId,
              archetype,
            },
          }).catch((ptsErr) => console.warn("[visible-recognition] User points award notice:", ptsErr));
        }
      }
    } catch (gamErr) {
      console.warn("[visible-recognition] GamificationAndWallet sync notice:", gamErr);
    }

    // 2. Real-time Cache in Redis for instant WebSocket / In-App Retrieval
    try {
      const cacheKey = targetType === "user"
        ? `recognition:${cleanTargetUserId}:latest`
        : `match:${cleanMatchId}:moment:${cleanMomentId}:recognition:latest`;
      
      await cacheService.set(cacheKey, payload, 300); // 5-minute cache
    } catch (cacheErr) {
      console.warn("[visible-recognition] Cache notice:", cacheErr);
    }

    // 3. Dispatch In-App Notifications via central notifications engine (only for new dispatch, or if target changed)
    const targetRoomId = String((body as any).roomId || "NMryj1w7t8mJpGzEvF9q").replace(/^ROOM#/, "").trim();
    const targetUserEmail = (body as any).targetUserEmail || null;

    if (!isEdit) {
      if (targetType === "user" && cleanTargetUserId) {
        try {
          await createNotification({
            userId: cleanTargetUserId,
            recipientEmail: targetUserEmail || (cleanTargetUserId.includes("@") ? cleanTargetUserId : null),
            category: "roar",
            notification_type: "roar.visual_recognition",
            title: `🏆 Visual Recognition: ${headline}`,
            body: message,
            subtitle: `+${payload.rewards.totalSxp} SXPs bonus awarded!`,
            cta_label: "Open ROAR Pulse",
            cta_target: "/MainModules/ROAR",
            priority: "HIGH",
            roomId: targetRoomId,
            metadata: {
              recognitionId,
              matchId: cleanMatchId,
              momentId: cleanMomentId,
              archetype,
              rewards: payload.rewards,
            },
          });
        } catch (notifErr) {
          console.warn("[visible-recognition] User notification notice:", notifErr);
        }
      } else if (targetType === "all") {
        // Broadcast to ALL actual participants of this engagement / match
        try {
          const participantMap = new Map<string, string>(); // canonicalUid -> rawUid (email if available)
          const addParticipant = (rawUid?: string | null) => {
            const raw = String(rawUid || "").trim().replace(/^USER#/i, "");
            if (!raw || raw.toLowerCase().startsWith("anon") || raw.toLowerCase() === "guest") return;
            const canon = toCanonicalLeaderboardUid(raw);
            if (!participantMap.has(canon) || (raw.includes("@") && !participantMap.get(canon)?.includes("@"))) {
              participantMap.set(canon, raw);
            }
          };

          // 1) Collect target engagement IDs (either the specific engagementId or all engagements of this match)
          const targetEngIds = new Set<string>();
          if (cleanEngagementId) {
            targetEngIds.add(cleanEngagementId);
          } else {
            const matchEntityCandidates = Array.from(
              new Set([`MATCH#${canonicalMatchId}`, `MATCH#${cleanMatchId}`, `MATCH#MATCH-${cleanMatchId}`])
            );
            for (const tbl of candidateTables) {
              for (const mEntity of matchEntityCandidates) {
                try {
                  let lastKey: Record<string, any> | undefined;
                  do {
                    const qEng = await docClient.send(
                      new QueryCommand({
                        TableName: tbl,
                        KeyConditionExpression: "entityId = :eId",
                        ExpressionAttributeValues: { ":eId": mEntity },
                        ExclusiveStartKey: lastKey,
                      })
                    );
                    for (const it of qEng.Items || []) {
                      const sk = String(it.sk || "");
                      if (sk.startsWith("LOOP#") || sk.startsWith("ENGAGEMENT#")) {
                        const eid = String(it.id || it.engagementId || sk.replace(/^(LOOP|ENGAGEMENT)#/, "")).trim();
                        if (eid) targetEngIds.add(eid);
                      }
                    }
                    lastKey = qEng.LastEvaluatedKey;
                  } while (lastKey);
                } catch {}
              }
            }
          }

          // 2) Query every engagement's actual voters/likers/commenters in SocialAndContent
          for (const eid of Array.from(targetEngIds)) {
            try {
              let lastKey: Record<string, any> | undefined;
              do {
                const engRes = await docClient.send(
                  new QueryCommand({
                    TableName: TABLES.SocialAndContent,
                    KeyConditionExpression: "contentId = :cid",
                    ExpressionAttributeValues: { ":cid": `ENGAGEMENT#${eid}` },
                    ExclusiveStartKey: lastKey,
                  })
                );
                for (const it of engRes.Items || []) {
                  const sk = String(it.sk || "");
                  if (sk.startsWith("VOTE#")) {
                    addParticipant(it.userId || sk.replace(/^VOTE#/, "").split("#")[0]);
                  } else if (sk.startsWith("LIKE#")) {
                    addParticipant(it.userId || sk.slice(5));
                  } else if (sk.startsWith("SHARE#")) {
                    addParticipant(it.userId || sk.slice(6));
                  } else if (sk.startsWith("COMMENT#")) {
                    addParticipant(it.authorUid || it.userId);
                  }
                }
                lastKey = engRes.LastEvaluatedKey;
              } while (lastKey);
            } catch {}
          }

          // 3) Also include participants already on this match's MATCH_SXP# leaderboard (for moment-level broadcasts)
          if (!cleanEngagementId) {
            try {
              const lbRes = await docClient.send(
                new QueryCommand({
                  TableName: TABLES.GamificationAndWallet,
                  IndexName: "leaderboardType-points-index",
                  KeyConditionExpression: "leaderboardType = :lt",
                  ExpressionAttributeValues: { ":lt": `MATCH_SXP#${canonicalMatchId}` },
                  Limit: 300,
                })
              );
              for (const it of lbRes.Items || []) {
                addParticipant(it.rawUserId || it.userId);
              }
            } catch {}
          }

          const allTotalSxp = Number(payload.rewards?.totalSxp) || 0;
          for (const [canonicalP, rawP] of participantMap.entries()) {
            await createNotification({
              userId: canonicalP,
              recipientEmail: rawP.includes("@") ? rawP : null,
              category: "roar",
              notification_type: "roar.visual_recognition",
              title: `📢 Stadium Recognition: ${headline}`,
              body: message,
              subtitle: payload.communityImpact?.stadiumRoars || "+120 Roars",
              cta_label: "Open ROAR Pulse",
              cta_target: "/MainModules/ROAR",
              priority: "NORMAL",
              roomId: targetRoomId,
              metadata: {
                recognitionId,
                matchId: canonicalMatchId,
                momentId: cleanMomentId,
                archetype,
              },
            }).catch(() => {});

            // Record in participant's recognition ledger under canonical userId & matchId
            await docClient.send(
              new PutCommand({
                TableName: TABLES.GamificationAndWallet,
                Item: {
                  userId: `USER#${canonicalP}`,
                  sk: `RECOGNITION#MATCH#${canonicalMatchId}#${recognitionId}`,
                  rawUserId: canonicalP,
                  recognitionId,
                  matchId: canonicalMatchId,
                  momentId: cleanMomentId,
                  engagementId: cleanEngagementId || undefined,
                  ...(parentEngType ? { engagementType: parentEngType } : {}),
                  archetype,
                  headline,
                  message,
                  badgeIcon,
                  themeColor,
                  rewards: payload.rewards,
                  awardedAt: now,
                  createdAt: payload.createdAt,
                },
              })
            ).catch(() => {});

            if (allTotalSxp > 0) {
              await awardUserPoints({
                actualUserId: canonicalP,
                authUserId: canonicalP,
                userName: canonicalP,
                userEmail: rawP.includes("@") ? rawP : "",
                userExists: true,
                points: allTotalSxp,
                reason: "RECOGNITION_AWARD",
                transactionId: `tx_rec_${recognitionId}_${canonicalP}`,
                metadata: {
                  matchId: canonicalMatchId,
                  momentId: cleanMomentId,
                  ...(cleanEngagementId ? { engagementId: cleanEngagementId } : {}),
                  ...(parentEngType ? { engagementType: parentEngType } : {}),
                  recognitionId,
                  archetype,
                },
              }).catch(() => {});
            }
          }
        } catch (allNotifErr) {
          console.warn("[visible-recognition] Broadcast notification notice:", allNotifErr);
        }
      }
    }

    // 4. ROAR Chat: Post recognition celebration into the room chat for all users
    try {
      const chatMsgId = `msg_rec_${recognitionId}`;
      const targetUserDisplay = payload.targetUserName || "Valued Fan";
      const archetypeClean = String(archetype || "CUSTOM").replace(/_/g, " ");
      const chatMsgText = targetType === "user"
        ? `🏆 [FAN RECOGNITION] @${targetUserDisplay} has been awarded ${archetypeClean}: "${headline}" — ${message} | ⚡ +${payload.rewards.totalSxp} Total SXPs!`
        : `📢 [STADIUM RECOGNITION] "${headline}" — ${message} | ${payload.communityImpact?.stadiumRoars || "+120 Roars"}`;

      const chatMsgItem: Record<string, any> = {
        roomId: `ROOM#${targetRoomId}`,
        sk: `MSG#${targetRoomId}#${now}#${chatMsgId}`,
        msgId: chatMsgId,
        chatId: chatMsgId,
        authorUid: "sportsfan360_system",
        authorUsername: "SportsFan360 Core Engine",
        authorBadge: "Stadium Engine",
        authorAvatarUrl: "/images/sportsfan360logo.png",
        authorEmail: "admin@sportsfan.com",
        text: chatMsgText,
        type: "post",
        fireCount: 0,
        heartCount: 0,
        agreeCount: 0,
        disagreeCount: 0,
        replyCount: 0,
        shareCount: 0,
        createdAt: payload.createdAt,
        updatedAt: now,
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLES.RealTimeChat,
          Item: chatMsgItem,
        })
      );

      if (db) {
        await db
          .collection(getFirestoreCollection("roarRooms"))
          .doc(targetRoomId)
          .collection("messages")
          .doc(chatMsgId)
          .set(chatMsgItem, { merge: true });
      }
    } catch (chatErr) {
      console.warn("[visible-recognition] RealTimeChat write notice:", chatErr);
    }

    // 5. Record inline room broadcast for ROAR Pulse celebrations stream with deterministic doc ID
    if (db) {
      try {
        const firestoreMatchIds = [
          cleanMatchId,
          `MATCH#${cleanMatchId}`,
          targetRoomId,
          "NMryj1w7t8mJpGzEvF9q",
        ].filter(Boolean);

        const roomBroadcastData = {
          id: `rec_inline_${recognitionId}`,
          recognitionId,
          matchId: cleanMatchId,
          matchIds: firestoreMatchIds,
          roomId: targetRoomId,
          type: "VISUAL_RECOGNITION",
          targetType,
          targetUserId: cleanTargetUserId,
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
          createdAt: payload.createdAt,
          updatedAt: now,
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
        message: isEdit
          ? `Visual Recognition ${recognitionId} updated successfully!`
          : targetType === "all"
          ? "General Visual Recognition successfully created and dispatched to all moment participants in MatchMoments table"
          : `Targeted Visual Recognition successfully sent to user ${payload.targetUserName || cleanTargetUserId} in MatchMoments table`,
        storageTable: "MatchMoments",
        data: payload,
      },
      { status: isEdit ? 200 : 201 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process visible recognition" },
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
      try {
        await db.collection(getFirestoreCollection("match_room_notifications")).doc(`rec_inline_${recognitionId}`).delete();
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
