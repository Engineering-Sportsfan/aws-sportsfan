import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// 1. Load Environment Variables
const backendDir = path.resolve(__dirname, "..");
const envPath = path.join(backendDir, ".env");
const envLocalPath = path.join(backendDir, ".env.local");

if (fs.existsSync(envPath)) {
  console.log(`Loading env from ${envPath}`);
  dotenv.config({ path: envPath });
}
if (fs.existsSync(envLocalPath)) {
  console.log(`Loading env from ${envLocalPath}`);
  dotenv.config({ path: envLocalPath });
}

import { docClient } from "../lib/dynamodb";
import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const MS_PLAYERS_TABLE = process.env.MS_PLAYERS_TABLE || "MS_Players";

async function main() {
  console.log(`Starting gender migration for table ${MS_PLAYERS_TABLE}...`);

  // Scan all players
  const scanCommand = new ScanCommand({
    TableName: MS_PLAYERS_TABLE,
    FilterExpression: "sk = :sk",
    ExpressionAttributeValues: {
      ":sk": "PROFILE#META"
    }
  });

  const scanResult = await docClient.send(scanCommand);
  const players = scanResult.Items || [];
  console.log(`Found ${players.length} players in ${MS_PLAYERS_TABLE}.`);

  let updatedCount = 0;
  for (const player of players) {
    if (!player.gender) {
      console.log(`Updating ${player.name} (${player.entityId}) with gender: male`);
      
      const updateCommand = new UpdateCommand({
        TableName: MS_PLAYERS_TABLE,
        Key: {
          entityId: player.entityId,
          sk: player.sk
        },
        UpdateExpression: "SET gender = :gender",
        ExpressionAttributeValues: {
          ":gender": "male"
        }
      });
      
      await docClient.send(updateCommand);
      updatedCount++;
    } else {
      console.log(`Skipping ${player.name} (${player.entityId}) - already has gender: ${player.gender}`);
    }
  }

  console.log(`Migration complete! Updated ${updatedCount} players.`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
