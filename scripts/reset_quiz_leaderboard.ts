import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { docClient } from "../lib/dynamodb";
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";
import { getEnv } from "../lib/tableNames";

/**
 * Reset Quiz Leaderboard Scores in DynamoDB and Firestore
 *
 * Usage:
 *   Dry run:
 *     npx tsx scripts/reset_quiz_leaderboard.ts --dry-run
 *
 *   Execute reset (set points to 0):
 *     npx tsx scripts/reset_quiz_leaderboard.ts --apply
 *
 *   Execute full reset (points + answers count to 0):
 *     npx tsx scripts/reset_quiz_leaderboard.ts --apply --reset-all-stats
 */

const isApply = process.argv.includes("--apply");
const isResetAllStats = process.argv.includes("--reset-all-stats");
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

async function resetDynamoQuizLeaderboard() {
  console.log(`\n======================================================`);
  console.log(`QUIZ LEADERBOARD RESET SCRIPT`);
  console.log(`Mode: ${isApply ? "EXECUTE (APPLYING CHANGES)" : "DRY RUN (NO CHANGES)"}`);
  console.log(`Environment: ${targetEnv}`);
  console.log(`Reset All Stats: ${isResetAllStats}`);
  console.log(`======================================================\n`);

  // Target tables for current environment and base
  const tableSuffixes = targetEnv === "prod" ? [""] : [`-${targetEnv}`, ""];
  const uniqueTables = Array.from(new Set(tableSuffixes.map((s) => `SocialAndContent${s}`)));

  for (const tableName of uniqueTables) {
    console.log(`--- Checking DynamoDB Table: ${tableName} ---`);

    // 1. Find all QUIZ_LEADERBOARD# entries (Global + per-quiz)
    const leaderboardItems = await scanAllItems(
      tableName,
      "begins_with(contentId, :pfx)",
      { ":pfx": "QUIZ_LEADERBOARD#" }
    );

    console.log(`Found ${leaderboardItems.length} leaderboard participant records in ${tableName}.`);

    for (const item of leaderboardItems) {
      console.log(
        `  -> Participant: User "${item.userName || item.userId}" (PK: ${item.contentId}, SK: ${item.sk}) | Current Total Points: ${item.totalPoints ?? 0} | Points Earned: ${item.pointsEarned ?? 0}`
      );

      if (isApply) {
        try {
          let updateExpr = "SET totalPoints = :zero, pointsEarned = :zero, updatedAt = :now";
          const exprVals: Record<string, any> = {
            ":zero": 0,
            ":now": Date.now(),
          };

          if (isResetAllStats) {
            updateExpr += ", correctCount = :zero, incorrectCount = :zero, totalAnswered = :zero";
          }

          await docClient.send(
            new UpdateCommand({
              TableName: tableName,
              Key: {
                contentId: item.contentId,
                sk: item.sk,
              },
              UpdateExpression: updateExpr,
              ExpressionAttributeValues: exprVals,
            })
          );
          console.log(`     [UPDATED] Set points to 0 for ${item.sk}`);
        } catch (err: any) {
          console.error(`     [ERROR] Failed to update ${item.sk}:`, err.message || err);
        }
      }
    }

    // 2. Find any quiz votes in ENGAGEMENT# that carry pointsAwarded
    const quizVoteItems = await scanAllItems(
      tableName,
      "begins_with(contentId, :engPfx) AND begins_with(sk, :votePfx)",
      {
        ":engPfx": "ENGAGEMENT#",
        ":votePfx": "VOTE#",
      }
    );

    const relevantQuizVotes = quizVoteItems.filter(
      (v) => (v.type === "quiz" || v.pointsAwarded !== undefined) && Number(v.pointsAwarded || 0) > 0
    );

    console.log(
      `Found ${relevantQuizVotes.length} quiz vote records with awarded points > 0 in ${tableName}.`
    );

    for (const vote of relevantQuizVotes) {
      console.log(
        `  -> Quiz Vote: PK: ${vote.contentId}, SK: ${vote.sk}, User: ${vote.userId}, pointsAwarded: ${vote.pointsAwarded}`
      );

      if (isApply) {
        try {
          await docClient.send(
            new UpdateCommand({
              TableName: tableName,
              Key: {
                contentId: vote.contentId,
                sk: vote.sk,
              },
              UpdateExpression: "SET pointsAwarded = :zero, updatedAt = :now",
              ExpressionAttributeValues: {
                ":zero": 0,
                ":now": Date.now(),
              },
            })
          );
          console.log(`     [UPDATED] Set pointsAwarded to 0 for vote ${vote.sk}`);
        } catch (err: any) {
          console.error(`     [ERROR] Failed to update vote ${vote.sk}:`, err.message || err);
        }
      }
    }
  }

  // 3. Update Firestore quiz_leaderboard collection if configured
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
            `  -> Firestore Doc ID: ${doc.id} | totalPoints: ${data.totalPoints ?? 0} | userName: ${data.userName || data.userId}`
          );

          if (isApply) {
            const updatePayload: Record<string, any> = {
              totalPoints: 0,
              pointsEarned: 0,
              updatedAt: Date.now(),
            };
            if (isResetAllStats) {
              updatePayload.correctCount = 0;
              updatePayload.incorrectCount = 0;
              updatePayload.totalAnswered = 0;
            }
            await doc.ref.set(updatePayload, { merge: true });
            console.log(`     [UPDATED] Set totalPoints to 0 in Firestore (${col}/${doc.id})`);
          }
        }
      } catch (fbErr: any) {
        console.warn(`Notice on Firestore collection ${col}:`, fbErr.message || fbErr);
      }
    }
  }

  console.log(`\n======================================================`);
  if (!isApply) {
    console.log(`DRY RUN COMPLETED. No data was modified.`);
    console.log(`To apply these changes and set all scores to 0 in DynamoDB, run:`);
    console.log(`  npx tsx scripts/reset_quiz_leaderboard.ts --apply`);
    console.log(`  (Add --reset-all-stats if you also want correct/incorrect counts set to 0)`);
  } else {
    console.log(`SUCCESS: All participant scores have been set to 0 in DynamoDB!`);
  }
  console.log(`======================================================\n`);
}

resetDynamoQuizLeaderboard().catch((err) => {
  console.error("FATAL ERROR in reset script:", err);
  process.exit(1);
});
