import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { docClient } from "../lib/dynamodb";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";
import { getEnv } from "../lib/tableNames";

/**
 * Delete All User Records in Quiz Leaderboard
 *
 * Usage:
 *   Dry run:
 *     npx tsx scripts/delete_quiz_leaderboard.ts --dry-run
 *
 *   Execute full deletion:
 *     npx tsx scripts/delete_quiz_leaderboard.ts --apply
 */

const isApply = process.argv.includes("--apply");
const targetEnv = process.env.APP_ENV || getEnv() || "dev";

function getFirestoreDb() {
  if (!process.env.FIREBASE_PROJECT_ID) return null;
  if (!admin.apps.length) {
    try {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
      privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");
      if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
        let body = privateKey
          .replace("-----BEGIN PRIVATE KEY-----", "")
          .replace("-----END PRIVATE KEY-----", "")
          .trim();
        body = body.replace(/ /g, "\n");
        privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
      }
      const app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
      return admin.firestore(app);
    } catch (e: any) {
      console.warn("Notice: Optional Firebase initialization skipped:", e.message || e);
      return null;
    }
  }
  return admin.firestore();
}

async function scanAllItems(tableName: string, filterExpr: string, exprVals: Record<string, any>) {
  const items: any[] = [];
  let lastKey: any = undefined;
  do {
    try {
      const res = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          ExclusiveStartKey: lastKey,
        })
      );
      if (res.Items) {
        items.push(...res.Items);
      }
      lastKey = res.LastEvaluatedKey;
    } catch (err: any) {
      console.warn(`[Scan] Notice scanning ${tableName}:`, err.message || err);
      break;
    }
  } while (lastKey);
  return items;
}

async function deleteDynamoQuizLeaderboard() {
  console.log(`\n======================================================`);
  console.log(`QUIZ LEADERBOARD RECORD DELETION SCRIPT`);
  console.log(`Mode: ${isApply ? "EXECUTE (PERMANENT DELETION)" : "DRY RUN (NO CHANGES)"}`);
  console.log(`Environment: ${targetEnv}`);
  console.log(`======================================================\n`);

  const tableSuffixes = targetEnv === "prod" ? [""] : [`-${targetEnv}`, ""];
  const uniqueTables = Array.from(new Set(tableSuffixes.map((s) => `SocialAndContent${s}`)));

  let totalDynamoDeleted = 0;

  for (const tableName of uniqueTables) {
    console.log(`--- Checking DynamoDB Table: ${tableName} ---`);

    // 1. Find all QUIZ_LEADERBOARD# entries (Global + per-quiz)
    const leaderboardItems = await scanAllItems(
      tableName,
      "begins_with(contentId, :pfx)",
      { ":pfx": "QUIZ_LEADERBOARD#" }
    );

    console.log(`Found ${leaderboardItems.length} leaderboard user records in ${tableName}.`);

    for (const item of leaderboardItems) {
      console.log(
        `  -> [LEADERBOARD] User "${item.userName || item.userId}" (PK: ${item.contentId}, SK: ${item.sk}) | Points: ${item.totalPoints ?? 0}`
      );

      if (isApply) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: tableName,
              Key: {
                contentId: item.contentId,
                sk: item.sk,
              },
            })
          );
          totalDynamoDeleted++;
          console.log(`     [DELETED] Deleted ${item.sk} from ${item.contentId}`);
        } catch (err: any) {
          console.error(`     [ERROR] Failed to delete ${item.sk}:`, err.message || err);
        }
      }
    }

    // 2. Find any quiz votes in ENGAGEMENT# that feed into the leaderboard
    const quizVoteItems = await scanAllItems(
      tableName,
      "begins_with(contentId, :engPfx) AND begins_with(sk, :votePfx)",
      {
        ":engPfx": "ENGAGEMENT#",
        ":votePfx": "VOTE#",
      }
    );

    const relevantQuizVotes = quizVoteItems.filter(
      (v) => v.type === "quiz" || Number(v.pointsAwarded || 0) > 0
    );

    console.log(
      `Found ${relevantQuizVotes.length} quiz vote records in ${tableName}.`
    );

    for (const vote of relevantQuizVotes) {
      console.log(
        `  -> [VOTE] PK: ${vote.contentId}, SK: ${vote.sk}, User: ${vote.userId}, pointsAwarded: ${vote.pointsAwarded}`
      );

      if (isApply) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: tableName,
              Key: {
                contentId: vote.contentId,
                sk: vote.sk,
              },
            })
          );
          totalDynamoDeleted++;
          console.log(`     [DELETED] Deleted vote record ${vote.sk}`);
        } catch (err: any) {
          console.error(`     [ERROR] Failed to delete vote ${vote.sk}:`, err.message || err);
        }
      }
    }
  }

  // 3. Delete from Firestore quiz_leaderboard collections
  let totalFirestoreDeleted = 0;
  const firestoreDb = getFirestoreDb();
  if (firestoreDb) {
    console.log(`\n--- Checking Firestore Collections ---`);
    const firestoreCollections = [
      "quiz_leaderboard",
      `quiz_leaderboard_${targetEnv}`,
    ];
    const seenCol = new Set<string>();

    for (const col of firestoreCollections) {
      if (seenCol.has(col)) continue;
      seenCol.add(col);

      try {
        const snap = await firestoreDb.collection(col).get();
        console.log(`Found ${snap.docs.length} docs in Firestore collection "${col}".`);

        for (const doc of snap.docs) {
          const data = doc.data();
          console.log(
            `  -> [FIRESTORE] Doc ID: ${doc.id} | User: ${data.userName || data.userId} | Points: ${data.totalPoints ?? 0}`
          );

          if (isApply) {
            await doc.ref.delete();
            totalFirestoreDeleted++;
            console.log(`     [DELETED] Deleted Firestore doc (${col}/${doc.id})`);
          }
        }
      } catch (fbErr: any) {
        console.warn(`Notice on Firestore collection ${col}:`, fbErr.message || fbErr);
      }
    }
  }

  console.log(`\n======================================================`);
  if (!isApply) {
    console.log(`DRY RUN COMPLETED. No data was deleted.`);
    console.log(`To PERMANENTLY DELETE all user records from the leaderboard in DynamoDB, run:`);
    console.log(`  npx tsx scripts/delete_quiz_leaderboard.ts --apply`);
  } else {
    console.log(`SUCCESS: Deleted ${totalDynamoDeleted} DynamoDB records and ${totalFirestoreDeleted} Firestore records!`);
    console.log(`The leaderboard is now completely empty.`);
  }
  console.log(`======================================================\n`);
}

deleteDynamoQuizLeaderboard().catch((err) => {
  console.error("FATAL ERROR in deletion script:", err);
  process.exit(1);
});
