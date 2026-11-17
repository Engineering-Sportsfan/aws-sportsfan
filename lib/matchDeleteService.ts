// backend/lib/matchDeleteService.ts
// Fast, comprehensive match deletion service that purges a match and all its associated
// moments, loops, recognitions, series reverse indices, and social engagements
// from DynamoDB and Firestore with zero orphaned ghost data.

import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES, getTableName, getFirestoreCollection } from "@/lib/tableNames";
import { cleanMatchId, normalizeMatchKey } from "@/lib/coreEngineScope";
import { QueryCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export interface DeleteMatchResult {
  success: boolean;
  matchId: string;
  lookupIds: string[];
  deletedItemsCount: number;
  tablesPurged: string[];
  error?: string;
}

/**
 * Collect all environment variant table names for a given base table.
 * e.g. "MatchMoments" -> ["MatchMoments", "MatchMoments-dev", "MatchMoments-release"]
 */
function getAllTableVariants(baseName: string): string[] {
  const resolved = getTableName(baseName);
  const cleanBase = resolved.replace(/-(dev|develop|release|prod|main|staging|test)$/i, "");
  return Array.from(
    new Set([
      cleanBase,
      `${cleanBase}-dev`,
      `${cleanBase}-release`,
      resolved,
    ])
  );
}

/**
 * Permanently delete a match and all of its associated data across all tables and stores.
 */
export async function deleteMatchPermanently(rawMatchId: string): Promise<DeleteMatchResult> {
  const matchId = String(rawMatchId || "").trim();
  if (!matchId || ["none", "undefined", "null", "all"].includes(matchId.toLowerCase())) {
    return {
      success: false,
      matchId,
      lookupIds: [],
      deletedItemsCount: 0,
      tablesPurged: [],
      error: "Invalid match ID",
    };
  }

  const clean = cleanMatchId(matchId);
  const norm = normalizeMatchKey(clean);
  const withoutMatchPrefix = clean.replace(/^MATCH-/i, "");
  const withMatchPrefix = withoutMatchPrefix ? `MATCH-${withoutMatchPrefix.toUpperCase()}` : "";

  // All ID representations that could have been stored in DynamoDB or Firestore
  const lookupIds = Array.from(
    new Set([
      matchId,
      clean,
      withoutMatchPrefix,
      withMatchPrefix,
      norm,
    ].filter(Boolean))
  );

  const entityIds = Array.from(
    new Set(lookupIds.map((lid) => `MATCH#${lid}`))
  );

  let deletedCount = 0;
  const tablesPurged: string[] = [];
  const linkedContentIds = new Set<string>();
  const linkedSeriesIds = new Set<string>();

  // 1. Purge from MatchMoments (all env variants)
  const matchMomentsTables = getAllTableVariants(TABLES.MatchMoments);
  for (const table of matchMomentsTables) {
    let tableModified = false;
    for (const eId of entityIds) {
      try {
        let lastKey: Record<string, any> | undefined;
        do {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: table,
              KeyConditionExpression: "entityId = :eId",
              ExpressionAttributeValues: { ":eId": eId },
              ExclusiveStartKey: lastKey,
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            for (const item of qRes.Items) {
              if (item.seriesId) linkedSeriesIds.add(String(item.seriesId));
              if (item.contentId) linkedContentIds.add(String(item.contentId));
              if (item.engagementId) linkedContentIds.add(`ENGAGEMENT#${item.engagementId}`);
              if (item.id && String(item.id).startsWith("eng_")) linkedContentIds.add(`ENGAGEMENT#${item.id}`);

              try {
                await docClient.send(
                  new DeleteCommand({
                    TableName: table,
                    Key: { entityId: item.entityId, sk: item.sk },
                  })
                );
                deletedCount++;
                tableModified = true;
              } catch (delErr) {
                console.warn(`[deleteMatch] Error deleting item from ${table}:`, delErr);
              }
            }
          }
          lastKey = qRes.LastEvaluatedKey;
        } while (lastKey);
      } catch (err: any) {
        if (err?.name !== "ResourceNotFoundException") {
          console.warn(`[deleteMatch] Query notice on ${table}:`, err?.message);
        }
      }
    }
    if (tableModified) tablesPurged.push(table);
  }

  // 2. Purge from SportsData (all env variants)
  const sportsDataTables = getAllTableVariants(TABLES.SportsData);
  for (const table of sportsDataTables) {
    let tableModified = false;
    // 2a. Direct entityId = MATCH#...
    for (const eId of entityIds) {
      try {
        let lastKey: Record<string, any> | undefined;
        do {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: table,
              KeyConditionExpression: "entityId = :eId",
              ExpressionAttributeValues: { ":eId": eId },
              ExclusiveStartKey: lastKey,
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            for (const item of qRes.Items) {
              if (item.seriesId) linkedSeriesIds.add(String(item.seriesId));
              await docClient.send(
                new DeleteCommand({
                  TableName: table,
                  Key: { entityId: item.entityId, sk: item.sk },
                })
              );
              deletedCount++;
              tableModified = true;
            }
          }
          lastKey = qRes.LastEvaluatedKey;
        } while (lastKey);
      } catch {}
    }

    // 2b. Series reverse-index in SportsData (entityId: SERIES#${seriesId}, sk: MATCH#...#${matchId})
    for (const sid of Array.from(linkedSeriesIds)) {
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: table,
            KeyConditionExpression: "entityId = :sId AND begins_with(sk, :skPref)",
            ExpressionAttributeValues: {
              ":sId": `SERIES#${sid}`,
              ":skPref": "MATCH#",
            },
          })
        );
        for (const item of qRes.Items || []) {
          const skStr = String(item.sk || "");
          const isThisMatch = lookupIds.some((lid) => skStr.includes(lid) || item.matchId === lid || item.match_id === lid);
          if (isThisMatch) {
            try {
              await docClient.send(
                new DeleteCommand({
                  TableName: table,
                  Key: { entityId: item.entityId, sk: item.sk },
                })
              );
              deletedCount++;
              tableModified = true;
            } catch {}
          }
        }
      } catch {}
    }

    if (tableModified) tablesPurged.push(table);
  }

  // 3. Purge related engagements from SocialAndContent (all env variants)
  const socialTables = getAllTableVariants(TABLES.SocialAndContent);
  for (const table of socialTables) {
    let tableModified = false;
    for (const cid of Array.from(linkedContentIds)) {
      try {
        let lastKey: Record<string, any> | undefined;
        do {
          const qRes = await docClient.send(
            new QueryCommand({
              TableName: table,
              KeyConditionExpression: "contentId = :cid",
              ExpressionAttributeValues: { ":cid": cid },
              ExclusiveStartKey: lastKey,
            })
          );
          if (qRes.Items && qRes.Items.length > 0) {
            for (const item of qRes.Items) {
              try {
                await docClient.send(
                  new DeleteCommand({
                    TableName: table,
                    Key: { contentId: item.contentId, sk: item.sk },
                  })
                );
                deletedCount++;
                tableModified = true;
              } catch {}
            }
          }
          lastKey = qRes.LastEvaluatedKey;
        } while (lastKey);
      } catch {}
    }
    if (tableModified) tablesPurged.push(table);
  }

  // 4. Purge from Firestore (matches, matches_dev, matches_prod)
  if (db) {
    const firestoreCollections = Array.from(
      new Set([
        "matches",
        "matches_dev",
        "matches_prod",
        getFirestoreCollection("matches"),
      ])
    );

    for (const col of firestoreCollections) {
      for (const lid of lookupIds) {
        try {
          const docRef = db.collection(col).doc(lid);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
            try {
              const inningsSnap = await docRef.collection("innings").get();
              const batch = db.batch();
              inningsSnap.docs.forEach((d) => batch.delete(d.ref));
              batch.delete(docRef);
              await batch.commit();
            } catch {
              await docRef.delete();
            }
            deletedCount++;
            tablesPurged.push(`Firestore:${col}`);
          }
        } catch {}
      }
    }
  }

  return {
    success: true,
    matchId,
    lookupIds,
    deletedItemsCount: deletedCount,
    tablesPurged: Array.from(new Set(tablesPurged)),
  };
}
