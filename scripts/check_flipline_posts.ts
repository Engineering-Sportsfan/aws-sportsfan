import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const credentials = (process.env.CUSTOM_AWS_ACCESS_KEY_ID && process.env.CUSTOM_AWS_SECRET_ACCESS_KEY)
  ? {
      accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.CUSTOM_AWS_SECRET_ACCESS_KEY,
    }
  : (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  : undefined;

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  ...(credentials && { credentials }),
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

async function runMigration() {
  console.log("Starting FlipLine posts author update for Anand Vasu...");
  try {
    const queryRes = await docClient.send(
      new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :roomId AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":roomId": "FLIPLINE#ALL",
          ":skPrefix": "CARD#",
        },
      })
    );

    const cards = queryRes.Items || [];
    console.log(`Found ${cards.length} total posts to process.`);

    let updatedCount = 0;

    for (const card of cards) {
      if (card.author && card.author.toLowerCase() === "anand vasu") {
        console.log(`Updating Card ${card.id} posted by Anand Vasu...`);

        // Check if date needs mock check
        const timeMs = card.timeMs;
        let formattedDate = card.day;
        if (timeMs) {
          const date = (timeMs > 1000000000000) ? new Date(timeMs) : new Date();
          formattedDate = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }

        // Update day, adminPhoto, type, and isVerified in DynamoDB
        await docClient.send(
          new UpdateCommand({
            TableName: "RealTimeChat",
            Key: {
              roomId: "FLIPLINE#ALL",
              sk: card.sk,
            },
            UpdateExpression: "SET #day = :day, adminPhoto = :adminPhoto, #type = :type, isVerified = :isVerified",
            ExpressionAttributeNames: {
              "#day": "day",
              "#type": "type",
            },
            ExpressionAttributeValues: {
              ":day": formattedDate,
              ":adminPhoto": "https://res.cloudinary.com/dflnsufit/image/upload/v1787563074/team360/nsbfhzx83ec3wmfcsdw4.jpg",
              ":type": "Expert",
              ":isVerified": true,
            },
          })
        );

        updatedCount++;
      }
    }

    console.log(`Migration finished. Successfully updated ${updatedCount} posts for Anand Vasu.`);
  } catch (error) {
    console.error("Migration failed:", error);
  }
}

runMigration();
