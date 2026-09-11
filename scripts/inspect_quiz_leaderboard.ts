import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { docClient } from "../lib/dynamodb";
import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

async function inspectTable(tableName: string) {
  console.log(`\n========================================`);
  console.log(`Inspecting Table: ${tableName}`);
  console.log(`========================================`);

  try {
    // 1. Scan for contentId starting with QUIZ_LEADERBOARD
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "begins_with(contentId, :pfx)",
        ExpressionAttributeValues: {
          ":pfx": "QUIZ_LEADERBOARD",
        },
      })
    );

    console.log(`Found ${scanRes.Items?.length || 0} items with contentId starting with QUIZ_LEADERBOARD:`);
    if (scanRes.Items && scanRes.Items.length > 0) {
      for (const item of scanRes.Items) {
        console.log({
          contentId: item.contentId,
          sk: item.sk,
          userId: item.userId,
          userName: item.userName,
          userEmail: item.userEmail,
          totalPoints: item.totalPoints,
          correctCount: item.correctCount,
          incorrectCount: item.incorrectCount,
          totalAnswered: item.totalAnswered,
          pointsEarned: item.pointsEarned,
        });
      }
    }

    // 2. Also scan for sk starting with QUIZ_LEADERBOARD (in case of GamificationAndWallet)
    const scanSk = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "begins_with(sk, :pfx)",
        ExpressionAttributeValues: {
          ":pfx": "QUIZ_LEADERBOARD",
        },
      })
    );
    if (scanSk.Items && scanSk.Items.length > 0) {
      console.log(`Found ${scanSk.Items.length} items with sk starting with QUIZ_LEADERBOARD:`);
      for (const item of scanSk.Items) {
        console.log(item);
      }
    }
  } catch (err: any) {
    console.error(`Error inspecting ${tableName}:`, err.message || err);
  }
}

async function main() {
  const envs = ["-dev", "-release", ""];
  for (const env of envs) {
    await inspectTable(`SocialAndContent${env}`);
    await inspectTable(`GamificationAndWallet${env}`);
  }
}

main().catch(console.error);
