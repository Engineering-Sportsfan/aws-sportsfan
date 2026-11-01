// app/api/roar/celebrations/route.ts — Live Inline Celebrations & Outcome Reveals for ROAR Pulse
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getCandidateTableNames } from "@/lib/dualWrite";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawMatchId = searchParams.get("matchId");
  const roomId = searchParams.get("roomId");
  const userId = searchParams.get("userId");

  const cleanMatchId = rawMatchId ? rawMatchId.trim().replace(/^MATCH#/, "") : "";

  try {
    const recognitionsList: any[] = [];
    const outcomeRevealsList: any[] = [];
    const seenRecognitionIds = new Set<string>();
    const seenOutcomeIds = new Set<string>();

    const candidateTables = getCandidateTableNames("MatchMoments");

    // 1. Fetch Recognitions & Outcome Reveals from MatchMoments table
    if (cleanMatchId) {
      for (const tbl of candidateTables) {
        try {
          // A. Fetch Recognitions
          const recRes = await docClient.send(
            new QueryCommand({
              TableName: tbl,
              KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":eId": `MATCH#${cleanMatchId}`,
                ":skpfx": "RECOGNITION#",
              },
              Limit: 50,
            })
          );
          if (recRes.Items) {
            for (const item of recRes.Items) {
              const recId = item.recognitionId || item.id || item.sk?.replace(/^RECOGNITION#/, "");
              if (recId && !seenRecognitionIds.has(recId)) {
                seenRecognitionIds.add(recId);
                recognitionsList.push({ id: recId, ...item });
              }
            }
          }

          // B. Fetch Outcome Reveals (REVEAL#)
          const revealRes = await docClient.send(
            new QueryCommand({
              TableName: tbl,
              KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":eId": `MATCH#${cleanMatchId}`,
                ":skpfx": "REVEAL#",
              },
              Limit: 50,
            })
          );
          if (revealRes.Items) {
            for (const item of revealRes.Items) {
              const outId = item.id || item.engagementId || item.sk?.replace(/^REVEAL#/, "");
              if (outId && !seenOutcomeIds.has(outId)) {
                seenOutcomeIds.add(outId);
                outcomeRevealsList.push({ id: outId, ...item });
              }
            }
          }
        } catch {}
      }
    }

    // Fallback: If no outcome reveals found yet in DynamoDB, scan candidate tables for recent reveals
    if (outcomeRevealsList.length === 0) {
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
              const outId = item.id || item.engagementId || item.sk?.replace(/^REVEAL#/, "");
              if (outId && !seenOutcomeIds.has(outId)) {
                seenOutcomeIds.add(outId);
                outcomeRevealsList.push({ id: outId, ...item });
              }
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
        if (cleanMatchId) {
          matchCandidates.add(cleanMatchId);
          matchCandidates.add(`MATCH#${cleanMatchId}`);
        }
        if (roomId) {
          matchCandidates.add(roomId);
          matchCandidates.add(roomId.replace(/^MATCH#/, ""));
        }
        matchCandidates.add("NMryj1w7t8mJpGzEvF9q");

        // Firestore `in` supports max 10 values
        const candidateArr = [...matchCandidates].slice(0, 10);

        let q: FirebaseFirestore.Query = db.collection(getFirestoreCollection("match_room_notifications"));
        if (candidateArr.length > 0) {
          q = q.where("matchId", "in", candidateArr);
        }
        const snap = await q.orderBy("createdAt", "desc").limit(50).get();
        for (const doc of snap.docs) {
          const data = doc.data();
          const docType = data.type;
          if (docType === "OUTCOME_RESOLVED") {
            const outId = doc.id || data.id || data.engagementId;
            if (outId && !seenOutcomeIds.has(outId)) {
              seenOutcomeIds.add(outId);
              outcomeRevealsList.push({ id: outId, firestoreId: doc.id, ...data });
            }
          } else if (docType === "VISUAL_RECOGNITION") {
            const recId = doc.id || data.recognitionId || data.id;
            if (recId && !seenRecognitionIds.has(recId)) {
              seenRecognitionIds.add(recId);
              recognitionsList.push({ id: recId, firestoreId: doc.id, ...data });
            }
          }
        }
      } catch (err) {
        // Try without orderBy if composite index not yet created
        try {
          const matchCandidates = new Set<string>();
          if (cleanMatchId) { matchCandidates.add(cleanMatchId); matchCandidates.add(`MATCH#${cleanMatchId}`); }
          if (roomId) { matchCandidates.add(roomId); matchCandidates.add(roomId.replace(/^MATCH#/, "")); }
          const candidateArr = [...matchCandidates].slice(0, 10);

          let q2: FirebaseFirestore.Query = db.collection(getFirestoreCollection("match_room_notifications"));
          if (candidateArr.length > 0) {
            q2 = q2.where("matchId", "in", candidateArr);
          }
          const snap2 = await q2.limit(50).get();
          for (const doc of snap2.docs) {
            const data = doc.data();
            const docType = data.type;
            if (docType === "OUTCOME_RESOLVED") {
              const outId = doc.id || data.id || data.engagementId;
              if (outId && !seenOutcomeIds.has(outId)) {
                seenOutcomeIds.add(outId);
                outcomeRevealsList.push({ id: outId, firestoreId: doc.id, ...data });
              }
            } else if (docType === "VISUAL_RECOGNITION") {
              const recId = doc.id || data.recognitionId || data.id;
              if (recId && !seenRecognitionIds.has(recId)) {
                seenRecognitionIds.add(recId);
                recognitionsList.push({ id: recId, firestoreId: doc.id, ...data });
              }
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
            const data = doc.data();
            const outId = doc.id || data.id || data.engagementId;
            if (outId && !seenOutcomeIds.has(outId)) {
              seenOutcomeIds.add(outId);
              outcomeRevealsList.push({ id: outId, firestoreId: doc.id, ...data });
            }
          }
        } catch {}
      }

      // Also check visible_recognitions collection in Firestore
      try {
        let qRec: FirebaseFirestore.Query = db.collection(getFirestoreCollection("visible_recognitions"));
        if (cleanMatchId) {
          qRec = qRec.where("matchId", "in", [cleanMatchId, `MATCH#${cleanMatchId}`]);
        }
        const snapRec = await qRec.limit(30).get();
        for (const doc of snapRec.docs) {
          const data = doc.data();
          const recId = data.recognitionId || doc.id;
          if (recId && !seenRecognitionIds.has(recId)) {
            seenRecognitionIds.add(recId);
            recognitionsList.push({ id: recId, ...data });
          }
        }
      } catch {}
    }

    // Sort newest first
    recognitionsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    outcomeRevealsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return NextResponse.json({
      success: true,
      matchId: cleanMatchId,
      recognitionsCount: recognitionsList.length,
      outcomeRevealsCount: outcomeRevealsList.length,
      recognitions: recognitionsList,
      outcomeReveals: outcomeRevealsList,
    });
  } catch (error: any) {
    console.error("GET /api/roar/celebrations error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch celebrations" },
      { status: 500 }
    );
  }
}

