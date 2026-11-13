// app/api/roar/celebrations/route.ts — Live Inline Celebrations & Outcome Reveals for ROAR Pulse
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getCandidateTableNames } from "@/lib/dualWrite";
import {
  getUserMatchPlayerSummary,
  getMatchSnapshotSummary,
  getFanOfTheMatchSummary,
} from "@/lib/matchPlayerSummary";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawMatchId = searchParams.get("matchId");
  const roomId = searchParams.get("roomId");
  const userId = searchParams.get("userId");
  const username = searchParams.get("username");
  const email = searchParams.get("email");

  const cleanMatchId = rawMatchId ? rawMatchId.trim().replace(/^MATCH#/, "") : "";

  try {
    let effectiveMatchId = cleanMatchId;
    if (!effectiveMatchId) {
      try {
        if (roomId && db) {
          const roomDoc = await db.collection("match_rooms").doc(roomId).get();
          if (roomDoc.exists) {
            const rd = roomDoc.data();
            const rMid = rd?.matchId || rd?.liveMatchId || rd?.match_id;
            if (rMid) {
              effectiveMatchId = String(rMid).replace(/^MATCH#/, "").trim();
            }
          }
        }
        if (!effectiveMatchId && db) {
          const notifSnap = await db
            .collection(getFirestoreCollection("match_room_notifications"))
            .orderBy("createdAt", "desc")
            .limit(10)
            .get();
          for (const doc of notifSnap.docs) {
            const d = doc.data();
            if (d.matchId) {
              effectiveMatchId = String(d.matchId).replace(/^MATCH#/, "").trim();
              if (effectiveMatchId) break;
            }
          }
        }
        if (!effectiveMatchId && db) {
          const completedMatchSnap = await db
            .collection(getFirestoreCollection("matches"))
            .where("status", "==", "completed")
            .limit(5)
            .get();
          if (!completedMatchSnap.empty) {
            effectiveMatchId = completedMatchSnap.docs[0].id.replace(/^MATCH#/, "").trim();
          }
        }
      } catch (e) {
        console.warn("[celebrations] Auto-resolve matchId error:", e);
      }
    }

    const recognitionsList: any[] = [];
    const outcomeRevealsList: any[] = [];

    const upsertOutcomeReveal = (item: any) => {
      const engId = String(
        item.engagementId ||
        (item.id ? String(item.id).replace(/^REVEAL-/, "") : "") ||
        (item.sk ? String(item.sk).replace(/^REVEAL#/, "") : "") ||
        ""
      ).trim();
      if (!engId) return;
      const canonicalId = `REVEAL-${engId}`;
      const rawLikes = Number(item.likes ?? item.likesCount ?? 0);
      const record = { ...item, id: canonicalId, engagementId: engId, likes: rawLikes, likesCount: rawLikes };
      const existingIdx = outcomeRevealsList.findIndex(
        (x) => String(x.engagementId || x.id?.replace(/^REVEAL-/, "")).trim() === engId
      );
      if (existingIdx >= 0) {
        const prevLikes = Number(outcomeRevealsList[existingIdx].likes ?? outcomeRevealsList[existingIdx].likesCount ?? 0);
        const bestLikes = Math.max(prevLikes, rawLikes);
        outcomeRevealsList[existingIdx] = {
          ...outcomeRevealsList[existingIdx],
          ...record,
          likes: bestLikes,
          likesCount: bestLikes,
        };
      } else {
        outcomeRevealsList.push(record);
      }
    };

    const upsertRecognition = (item: any) => {
      const recId = String(
        item.recognitionId ||
        item.id ||
        (item.sk ? String(item.sk).replace(/^RECOGNITION#/, "") : "") ||
        ""
      ).trim();
      if (!recId) return;
      const rawLikes = Number(item.likes ?? item.likesCount ?? 0);
      const record = { ...item, id: recId, recognitionId: recId, likes: rawLikes, likesCount: rawLikes };
      const existingIdx = recognitionsList.findIndex(
        (x) => String(x.recognitionId || x.id).trim() === recId
      );
      if (existingIdx >= 0) {
        const prevLikes = Number(recognitionsList[existingIdx].likes ?? recognitionsList[existingIdx].likesCount ?? 0);
        const bestLikes = Math.max(prevLikes, rawLikes);
        recognitionsList[existingIdx] = {
          ...recognitionsList[existingIdx],
          ...record,
          likes: bestLikes,
          likesCount: bestLikes,
        };
      } else {
        recognitionsList.push(record);
      }
    };

    const candidateTables = getCandidateTableNames("MatchMoments");

    // 1. Fetch Recognitions & Outcome Reveals from MatchMoments table
    if (effectiveMatchId) {
      for (const tbl of candidateTables) {
        try {
          // A. Fetch Recognitions
          const recRes = await docClient.send(
            new QueryCommand({
              TableName: tbl,
              KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":eId": `MATCH#${effectiveMatchId}`,
                ":skpfx": "RECOGNITION#",
              },
              Limit: 50,
            })
          );
          if (recRes.Items) {
            for (const item of recRes.Items) {
              upsertRecognition(item);
            }
          }

          // B. Fetch Outcome Reveals (REVEAL#)
          const revealRes = await docClient.send(
            new QueryCommand({
              TableName: tbl,
              KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":eId": `MATCH#${effectiveMatchId}`,
                ":skpfx": "REVEAL#",
              },
              Limit: 50,
            })
          );
          if (revealRes.Items) {
            for (const item of revealRes.Items) {
              upsertOutcomeReveal(item);
            }
          }
        } catch {}
      }
    }

    // Fallback: If no outcome reveals found yet in DynamoDB, scan candidate tables for recent reveals
    if (outcomeRevealsList.length === 0 && !effectiveMatchId) {
      for (const tbl of candidateTables) {
        try {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: tbl,
              FilterExpression: "begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":skpfx": "REVEAL#",
              },
              Limit: 25,
            })
          );
          if (scanRes.Items) {
            for (const item of scanRes.Items) {
              upsertOutcomeReveal(item);
            }
          }
        } catch {}
      }
    }

    // 2. Fetch from Firestore match_room_notifications collection
    if (db) {
      try {
        // Build list of all matchId candidates to query against
        const matchCandidates = new Set<string>();
        if (effectiveMatchId) {
          matchCandidates.add(effectiveMatchId);
          matchCandidates.add(`MATCH#${effectiveMatchId}`);
        }
        if (roomId) {
          matchCandidates.add(roomId);
          matchCandidates.add(roomId.replace(/^MATCH#/, ""));
        }
        matchCandidates.add("NMryj1w7t8mJpGzEvF9q");

        // Firestore `in` supports max 10 values
        const candidateArr = [...matchCandidates].slice(0, 10);

        let q: any = db.collection(getFirestoreCollection("match_room_notifications"));
        if (candidateArr.length > 0) {
          q = q.where("matchId", "in", candidateArr);
        }
        const snap = await q.orderBy("createdAt", "desc").limit(50).get();
        for (const doc of snap.docs) {
          const data = doc.data();
          const docType = data.type;
          if (docType === "OUTCOME_RESOLVED") {
            upsertOutcomeReveal({ ...data, firestoreId: doc.id });
          } else if (docType === "VISUAL_RECOGNITION") {
            upsertRecognition({ ...data, firestoreId: doc.id });
          }
        }
      } catch (err) {
        // Try without orderBy if composite index not yet created
        try {
          const matchCandidates = new Set<string>();
          if (effectiveMatchId) { matchCandidates.add(effectiveMatchId); matchCandidates.add(`MATCH#${effectiveMatchId}`); }
          if (roomId) { matchCandidates.add(roomId); matchCandidates.add(roomId.replace(/^MATCH#/, "")); }
          const candidateArr = [...matchCandidates].slice(0, 10);

          let q2: any = db.collection(getFirestoreCollection("match_room_notifications"));
          if (candidateArr.length > 0) {
            q2 = q2.where("matchId", "in", candidateArr);
          }
          const snap2 = await q2.limit(50).get();
          for (const doc of snap2.docs) {
            const data = doc.data();
            const docType = data.type;
            if (docType === "OUTCOME_RESOLVED") {
              upsertOutcomeReveal({ ...data, firestoreId: doc.id });
            } else if (docType === "VISUAL_RECOGNITION") {
              upsertRecognition({ ...data, firestoreId: doc.id });
            }
          }
        } catch (fallbackErr) {
          console.warn("[celebrations] Firestore notice:", fallbackErr);
        }
      }

      // Global Firestore fallback: if outcome reveals still 0, query recent notifications
      if (outcomeRevealsList.length === 0) {
        try {
          const recentSnap = await db.collection(getFirestoreCollection("match_room_notifications"))
            .where("type", "==", "OUTCOME_RESOLVED")
            .limit(20)
            .get();
          for (const doc of recentSnap.docs) {
            upsertOutcomeReveal({ ...doc.data(), firestoreId: doc.id });
          }
        } catch {}
      }

      // Also check visible_recognitions collection in Firestore
      try {
        let qRec: any = db.collection(getFirestoreCollection("visible_recognitions"));
        if (effectiveMatchId) {
          qRec = qRec.where("matchId", "in", [effectiveMatchId, `MATCH#${effectiveMatchId}`]);
        }
        const snapRec = await qRec.limit(30).get();
        for (const doc of snapRec.docs) {
          upsertRecognition({ ...doc.data(), firestoreId: doc.id });
        }
      } catch {}
    }

    // All recognitions (both stadium-wide broadcasts and targeted user spotlights) are included in the room stream
    const filteredRecognitions = recognitionsList;

    // Sort newest first
    filteredRecognitions.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    outcomeRevealsList.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    // Fetch personalized Match Player Summary, Match Snapshot, & Fan of the Match Summary (when match is completed)
    let userMatchSummary = null;
    let matchSnapshotSummary = null;
    let fanOfTheMatchSummary = null;

    if (effectiveMatchId) {
      if (userId || username || email) {
        try {
          userMatchSummary = await getUserMatchPlayerSummary({
            matchId: effectiveMatchId,
            userId,
            username,
            email,
          });
        } catch (summaryErr) {
          console.warn("[celebrations] Player summary lookup notice:", summaryErr);
        }
      }

      try {
        matchSnapshotSummary = await getMatchSnapshotSummary(effectiveMatchId);
      } catch (snapshotErr) {
        console.warn("[celebrations] Match snapshot summary lookup notice:", snapshotErr);
      }

      try {
        fanOfTheMatchSummary = await getFanOfTheMatchSummary(effectiveMatchId);
      } catch (fanErr) {
        console.warn("[celebrations] Fan of the match summary lookup notice:", fanErr);
      }
    }

    return NextResponse.json({
      success: true,
      matchId: effectiveMatchId || cleanMatchId,
      recognitionsCount: filteredRecognitions.length,
      outcomeRevealsCount: outcomeRevealsList.length,
      recognitions: filteredRecognitions,
      outcomeReveals: outcomeRevealsList,
      userMatchSummary,
      matchSnapshotSummary,
      fanOfTheMatchSummary,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error: any) {
    console.error("GET /api/roar/celebrations error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch celebrations" },
      { status: 500 }
    );
  }
}

