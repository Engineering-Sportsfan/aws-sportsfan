import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { GetCommand, ScanCommand, QueryCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export interface FoundEngagement {
  item: any;
  table: string;
  isMatchMoment: boolean;
  matchMomentsRecord?: {
    table: string;
    entityId: string;
    sk: string;
  };
}

/**
 * Searches for an engagement item across:
 * 1. SocialAndContent (contentId = ENGAGEMENT#{cleanId}, sk = ENGAGEMENT#META)
 * 2. Firestore engagements collection
 * 3. MatchMoments candidate tables (sk begins_with LOOP#{cleanId} or id = cleanId)
 */
export async function findEngagementById(rawId: string, rawMatchId?: string): Promise<FoundEngagement | null> {
  const cleanId = String(rawId || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
  const cleanMatchId = rawMatchId ? String(rawMatchId).replace(/^MATCH#/i, "").trim() : "";

  let foundItem: any = null;
  let foundTable: string = TABLES.SocialAndContent;
  let matchMomentsRecord: { table: string; entityId: string; sk: string } | undefined = undefined;

  // 1. Check SocialAndContent candidate tables
  const socialTables = getCandidateTableNames(TABLES.SocialAndContent);
  for (const table of socialTables) {
    if (foundItem) break;
    for (const cid of [`ENGAGEMENT#${cleanId}`, cleanId]) {
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: table,
            Key: { contentId: cid, sk: "ENGAGEMENT#META" },
          })
        );
        if (res.Item) {
          foundItem = { ...res.Item, id: cleanId };
          foundTable = table;
          break;
        }
      } catch {}
    }
  }

  // 2. Check MatchMoments candidate tables
  const mmTables = getCandidateTableNames(TABLES.MatchMoments);
  for (const table of mmTables) {
    try {
      // If matchId known, check direct key
      if (cleanMatchId) {
        try {
          const directRes = await docClient.send(
            new GetCommand({
              TableName: table,
              Key: { entityId: `MATCH#${cleanMatchId}`, sk: `LOOP#${cleanId}` },
            })
          );
          if (directRes.Item) {
            matchMomentsRecord = { table, entityId: `MATCH#${cleanMatchId}`, sk: `LOOP#${cleanId}` };
            if (!foundItem) {
              foundItem = { ...directRes.Item, id: cleanId };
              foundTable = table;
            }
            break;
          }
        } catch {}
      }

      // Query or Scan by loopId/cleanId
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: table,
          FilterExpression: "sk = :loopSk OR begins_with(sk, :loopPfx) OR id = :cid OR loopId = :cid OR contentId = :engCid",
          ExpressionAttributeValues: {
            ":loopSk": `LOOP#${cleanId}`,
            ":loopPfx": `LOOP#${cleanId}`,
            ":cid": cleanId,
            ":engCid": `ENGAGEMENT#${cleanId}`,
          },
          Limit: 10,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        const mmItem = scanRes.Items[0];
        matchMomentsRecord = {
          table,
          entityId: mmItem.entityId,
          sk: mmItem.sk,
        };
        if (!foundItem) {
          foundItem = { ...mmItem, id: cleanId };
          foundTable = table;
        }
        break;
      }
    } catch {}
  }

  // 3. Fallback to Firestore
  if (!foundItem && db) {
    try {
      const snap = await db.collection(getFirestoreCollection("engagements")).doc(cleanId).get();
      if (snap.exists) {
        foundItem = { id: snap.id, ...snap.data() };
      } else {
        const qSnap = await db.collection("match_moments_engagements").doc(cleanId).get();
        if (qSnap.exists) {
          foundItem = { id: qSnap.id, ...qSnap.data() };
        }
      }
    } catch {}
  }

  if (!foundItem) return null;

  const isMatchMoment = Boolean(
    foundItem.isMatchMoment ||
    foundItem.source === "match_moment" ||
    foundItem.matchId ||
    matchMomentsRecord
  );

  return {
    item: foundItem,
    table: foundTable,
    isMatchMoment,
    matchMomentsRecord,
  };
}

/**
 * Dual-writes engagement updates across SocialAndContent, Firestore, and MatchMoments tables.
 */
export async function persistEngagementUpdate(
  id: string,
  updatedItem: any,
  matchMomentsRecord?: { table: string; entityId: string; sk: string }
) {
  const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
  const now = Date.now();
  const fullItem = {
    ...updatedItem,
    id: cleanId,
    updatedAt: now,
  };

  // 1. Dual-write to SocialAndContent
  const dynamoItem = {
    contentId: `ENGAGEMENT#${cleanId}`,
    sk: "ENGAGEMENT#META",
    entityId: `ENGAGEMENT#${String(fullItem.type || "POLL").toUpperCase()}`,
    ...fullItem,
  };

  await dualWrite("engagements", cleanId, TABLES.SocialAndContent, dynamoItem);

  // 2. If it's a match moment, write to MatchMoments table(s)
  const isMatchMoment = Boolean(
    fullItem.isMatchMoment ||
    fullItem.source === "match_moment" ||
    fullItem.matchId ||
    matchMomentsRecord
  );

  if (isMatchMoment) {
    const rawMatchId = fullItem.matchId || (matchMomentsRecord?.entityId ? matchMomentsRecord.entityId.replace(/^MATCH#/, "") : "GLOBAL");
    const cleanMatchId = String(rawMatchId).replace(/^MATCH#/, "").trim();
    const loopSk = matchMomentsRecord?.sk || `LOOP#${fullItem.loopId || cleanId}`;

    const mmDynamoItem = {
      entityId: `MATCH#${cleanMatchId}`,
      sk: loopSk,
      contentId: `ENGAGEMENT#${cleanId}`,
      ...fullItem,
    };

    const mmTables = getCandidateTableNames(TABLES.MatchMoments);
    for (const table of mmTables) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: table,
            Item: mmDynamoItem,
          })
        );
        break;
      } catch (err: any) {
        const isTableMissing =
          err?.name === "ResourceNotFoundException" ||
          err?.message?.includes("Cannot do operations on a non-existent table");
        if (isTableMissing) continue;
        console.warn(`[persistEngagementUpdate] MatchMoments write notice on "${table}":`, err?.message || err);
        break;
      }
    }

    if (db) {
      try {
        await db.collection("match_moments_engagements").doc(`${cleanMatchId}_${fullItem.loopId || cleanId}`).set(fullItem, { merge: true });
      } catch {}
    }
  }

  return fullItem;
}
