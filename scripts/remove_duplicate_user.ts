import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { docClient } from "../lib/dynamodb";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";
import { getEnv } from "../lib/tableNames";

/**
 * Remove / Clean Duplicate User From Quiz Leaderboard
 *
 * Usage:
 *   1. Inspect / Search matching records:
 *      npx tsx scripts/remove_duplicate_user.ts --search="srikakulam chandu"
 *
 *   2. Automatically keep the record with the highest points and delete duplicates:
 *      npx tsx scripts/remove_duplicate_user.ts --search="srikakulam chandu" --apply
 *
 *   3. Delete a specific record by exact userId or Sort Key:
 *      npx tsx scripts/remove_duplicate_user.ts --delete-sk="USER#<userId>" --apply
 */

const targetEnv = process.env.APP_ENV || getEnv() || "dev";
const isApply = process.argv.includes("--apply");

const searchArg = process.argv.find((a) => a.startsWith("--search="))?.split("=")[1]?.replace(/"/g, "") || "srikakulam chandu";
const deleteSkArg = process.argv.find((a) => a.startsWith("--delete-sk="))?.split("=")[1]?.replace(/"/g, "");

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
      console.warn("Notice: Firebase initialization notice:", e.message || e);
      return null;
    }
  }
  return admin.firestore();
}

async function run() {
  console.log(`\n======================================================`);
  console.log(`LEADERBOARD DUPLICATE CLEANUP SCRIPT`);
  console.log(`Mode: ${isApply ? "APPLY (DELETING RECORD)" : "DRY RUN (INSPECT ONLY)"}`);
  console.log(`Target Name/Search: "${searchArg}"`);
  console.log(`Environment: ${targetEnv}`);
  console.log(`======================================================\n`);

  const tableSuffixes = targetEnv === "prod" ? [""] : [`-${targetEnv}`, ""];
  const uniqueTables = Array.from(new Set(tableSuffixes.map((s) => `SocialAndContent${s}`)));

  const term = searchArg.toLowerCase().trim();
  const ddbMatches: Array<{
    tableName: string;
    contentId: string;
    sk: string;
    userId: string;
    userName: string;
    userEmail: string;
    totalPoints: number;
  }> = [];

  for (const tableName of uniqueTables) {
    console.log(`Scanning DynamoDB table "${tableName}"...`);
    let lastKey: any = undefined;

    do {
      try {
        const res = await docClient.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression: "begins_with(contentId, :pfx)",
            ExpressionAttributeValues: {
              ":pfx": "QUIZ_LEADERBOARD#",
            },
            ExclusiveStartKey: lastKey,
          })
        );

        if (res.Items) {
          for (const item of res.Items) {
            const name = String(item.userName || "").toLowerCase();
            const email = String(item.userEmail || "").toLowerCase();
            const uid = String(item.userId || item.sk || "").toLowerCase();

            const isMatch =
              (deleteSkArg && item.sk === deleteSkArg) ||
              (!deleteSkArg && (name.includes(term) || email.includes(term) || uid.includes(term)));

            if (isMatch) {
              ddbMatches.push({
                tableName,
                contentId: item.contentId,
                sk: item.sk,
                userId: item.userId || item.sk?.replace(/^USER#/, ""),
                userName: item.userName || "Fan Quizzer",
                userEmail: item.userEmail || "",
                totalPoints: Number(item.totalPoints ?? item.pointsEarned ?? 0),
              });
            }
          }
        }
        lastKey = res.LastEvaluatedKey;
      } catch (err: any) {
        console.warn(`Notice scanning ${tableName}:`, err.message || err);
        break;
      }
    } while (lastKey);
  }

  console.log(`\nFound ${ddbMatches.length} matching DynamoDB leaderboard record(s):`);
  ddbMatches.forEach((m, idx) => {
    console.log(
      `  [#${idx + 1}] Table: ${m.tableName} | PK: ${m.contentId} | SK: ${m.sk} | Name: "${m.userName}" | Points: ${m.totalPoints} | Email: "${m.userEmail}"`
    );
  });

  // Check Firestore
  const firestoreDb = getFirestoreDb();
  const fbMatches: Array<{
    collection: string;
    docId: string;
    userName: string;
    totalPoints: number;
    ref: any;
  }> = [];

  if (firestoreDb) {
    const firestoreCollections = ["quiz_leaderboard", `quiz_leaderboard_${targetEnv}`];
    const seenCol = new Set<string>();

    for (const col of firestoreCollections) {
      if (seenCol.has(col)) continue;
      seenCol.add(col);

      try {
        const snap = await firestoreDb.collection(col).get();
        for (const doc of snap.docs) {
          const d = doc.data();
          const name = String(d.userName || "").toLowerCase();
          const email = String(d.userEmail || "").toLowerCase();
          const uid = String(d.userId || doc.id).toLowerCase();

          if (name.includes(term) || email.includes(term) || uid.includes(term)) {
            fbMatches.push({
              collection: col,
              docId: doc.id,
              userName: d.userName || "Fan Quizzer",
              totalPoints: Number(d.totalPoints || 0),
              ref: doc.ref,
            });
          }
        }
      } catch (fbErr: any) {
        console.warn(`Firestore collection ${col} check notice:`, fbErr.message || fbErr);
      }
    }

    console.log(`\nFound ${fbMatches.length} matching Firestore doc(s):`);
    fbMatches.forEach((m, idx) => {
      console.log(
        `  [#${idx + 1}] Collection: ${m.collection} | Doc ID: ${m.docId} | Name: "${m.userName}" | Points: ${m.totalPoints}`
      );
    });
  }

  if (ddbMatches.length <= 1 && fbMatches.length <= 1) {
    if (ddbMatches.length === 0 && fbMatches.length === 0) {
      console.log("\nNo matching records found for:", searchArg);
    } else {
      console.log("\nOnly 1 record found. No duplicate detected!");
    }
    return;
  }

  // If more than 1 record found:
  // Sort descending by points so index 0 is the highest score to KEEP
  ddbMatches.sort((a, b) => b.totalPoints - a.totalPoints);
  fbMatches.sort((a, b) => b.totalPoints - a.totalPoints);

  const ddbToKeep = ddbMatches[0];
  const ddbToDelete = ddbMatches.slice(1);

  const fbToKeep = fbMatches[0];
  const fbToDelete = fbMatches.slice(1);

  console.log("\n------------------------------------------------------");
  console.log(`RECOMMENDED ACTION:`);
  if (ddbToKeep) {
    console.log(`  KEEP (Highest Score): PK=${ddbToKeep.contentId}, SK=${ddbToKeep.sk} (${ddbToKeep.totalPoints} pts)`);
  }
  ddbToDelete.forEach((d) => {
    console.log(`  DELETE (Duplicate):   PK=${d.contentId}, SK=${d.sk} (${d.totalPoints} pts)`);
  });
  if (fbToKeep) {
    console.log(`  KEEP Firestore:       Doc=${fbToKeep.collection}/${fbToKeep.docId} (${fbToKeep.totalPoints} pts)`);
  }
  fbToDelete.forEach((d) => {
    console.log(`  DELETE Firestore:     Doc=${d.collection}/${d.docId} (${d.totalPoints} pts)`);
  });
  console.log("------------------------------------------------------\n");

  if (!isApply) {
    console.log("To delete the lower point duplicate records, run:");
    console.log(`  npx tsx scripts/remove_duplicate_user.ts --search="${searchArg}" --apply\n`);
    return;
  }

  // Deleting duplicate items
  console.log("Executing deletion of duplicate records...");
  for (const item of ddbToDelete) {
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: item.tableName,
          Key: {
            contentId: item.contentId,
            sk: item.sk,
          },
        })
      );
      console.log(`[DELETED DynamoDB] Table: ${item.tableName}, PK: ${item.contentId}, SK: ${item.sk}`);
    } catch (err: any) {
      console.error(`[ERROR] Failed to delete ${item.sk}:`, err.message || err);
    }
  }

  for (const item of fbToDelete) {
    try {
      await item.ref.delete();
      console.log(`[DELETED Firestore] ${item.collection}/${item.docId}`);
    } catch (err: any) {
      console.error(`[ERROR] Failed to delete Firestore doc ${item.docId}:`, err.message || err);
    }
  }

  console.log("\nDuplicate cleanup finished successfully!");
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
