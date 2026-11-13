import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export function cleanMatchKey(val?: string | null): string {
  return String(val || "")
    .replace(/^MATCH#/i, "")
    .trim();
}

/**
 * When match status is updated from admin (upcoming -> live -> completed):
 * sync the status to all Follow engagement cards attached to that match.
 * When status is 'completed', the card expires/completes and locks further voting.
 */
export async function syncMatchStatusToFollowEngagements(
  rawMatchId: string,
  matchStatus: string
): Promise<{ updatedCount: number; status: string }> {
  const cleanM = cleanMatchKey(rawMatchId);
  if (!cleanM) return { updatedCount: 0, status: matchStatus };

  const rawSt = String(matchStatus || "").trim().toLowerCase();
  const isCompleted = rawSt === "completed";
  const isLive = rawSt === "live";
  const newStatus = isCompleted ? "completed" : isLive ? "live" : "active";
  const newStatusLabel = isCompleted ? "Completed" : isLive ? "LIVE" : "Upcoming";
  const now = Date.now();
  let updatedCount = 0;

  // 1. Update in MatchMoments table (LOOP# items under MATCH#cleanM)
  const mmTables = getCandidateTableNames(TABLES.MatchMoments);
  for (const tbl of mmTables) {
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: tbl,
          KeyConditionExpression: "entityId = :eId AND begins_with(sk, :skpfx)",
          ExpressionAttributeValues: {
            ":eId": `MATCH#${cleanM}`,
            ":skpfx": "LOOP#",
          },
        })
      );
      for (const it of qRes.Items || []) {
        if (it.type === "follow") {
          await docClient.send(
            new UpdateCommand({
              TableName: tbl,
              Key: { entityId: it.entityId, sk: it.sk },
              UpdateExpression:
                "SET #st = :st, followData.statusLabel = :sl, isCompleted = :comp, isExpired = :comp, matchStatus = :ms, updatedAt = :now",
              ExpressionAttributeNames: { "#st": "status" },
              ExpressionAttributeValues: {
                ":st": newStatus,
                ":sl": newStatusLabel,
                ":comp": isCompleted,
                ":ms": rawSt || "upcoming",
                ":now": now,
              },
            })
          ).catch(() => {});
          updatedCount++;
        }
      }
    } catch (e) {
      // Table scan/query notice
    }
  }

  // 2. Update in SocialAndContent table (ENGAGEMENT# items with type='follow' and matchId=cleanM)
  const scTables = getCandidateTableNames(TABLES.SocialAndContent);
  for (const tbl of scTables) {
    try {
      const sRes = await docClient.send(
        new ScanCommand({
          TableName: tbl,
          FilterExpression: "#tp = :fType AND (matchId = :mId OR matchId = :mPfx)",
          ExpressionAttributeNames: { "#tp": "type", "#st": "status" },
          ExpressionAttributeValues: {
            ":fType": "follow",
            ":mId": cleanM,
            ":mPfx": `MATCH#${cleanM}`,
          },
        })
      );
      for (const it of sRes.Items || []) {
        await docClient.send(
          new UpdateCommand({
            TableName: tbl,
            Key: { contentId: it.contentId, sk: it.sk || "ENGAGEMENT#META" },
            UpdateExpression:
              "SET #st = :st, followData.statusLabel = :sl, isCompleted = :comp, isExpired = :comp, matchStatus = :ms, updatedAt = :now",
            ExpressionAttributeNames: { "#st": "status" },
            ExpressionAttributeValues: {
              ":st": newStatus,
              ":sl": newStatusLabel,
              ":comp": isCompleted,
              ":ms": rawSt || "upcoming",
              ":now": now,
            },
          })
        ).catch(() => {});
      }
    } catch (e) {
      // Scan notice
    }
  }

  // 3. Update in Firestore engagements collection
  if (db) {
    try {
      const snap = await db
        .collection(getFirestoreCollection("engagements"))
        .where("type", "==", "follow")
        .where("matchId", "==", cleanM)
        .get();
      for (const doc of snap.docs) {
        await doc.ref.set(
          {
            status: newStatus,
            "followData.statusLabel": newStatusLabel,
            isCompleted,
            isExpired: isCompleted,
            matchStatus: rawSt || "upcoming",
            updatedAt: now,
          },
          { merge: true }
        ).catch(() => {});
      }
    } catch (e) {
      // Firestore notice
    }
  }

  return { updatedCount, status: newStatus };
}

