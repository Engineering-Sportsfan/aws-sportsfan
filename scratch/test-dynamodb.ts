import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import * as fs from "fs";
import * as path from "path";

// Manually parse .env to avoid dotenv dependency issues
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    envConfig.split("\n").forEach((line) => {
      const parts = line.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join("=").trim();
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.warn("Could not read .env file:", e);
}

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  }
});
const docClient = DynamoDBDocumentClient.from(client);

async function main() {
  console.log("AWS Region:", process.env.AWS_REGION);
  console.log("AWS Access Key ID:", process.env.AWS_ACCESS_KEY_ID ? "PRESENT" : "MISSING");
  
  const mockItem = {
    PK: "USER#u_8841",
    SK: "NOTIF#2026-08-11T14:32:05Z#ntf_9f3a1c",
    entity_type: "NOTIFICATION",
    notification_type: "live_center.wicket_followed_player",
    title: "GONE! Kohli's out for 42",
    body: "Costly loss or India still favourites? 3,200 fans voting now",
    cta_label: "Cast your verdict",
    cta_target: "sf360://live-center/match_2291/ball/187",
    priority: "HIGH",
    channels_sent: ["in_app", "web_push"],
    sent_at: "2026-08-11T14:32:05Z",
    read: false,
    response_given: false,
    cta_clicked: false,
    expires_at: 1755013925,
    GSI1PK: "TYPE#live_center.wicket_followed_player",
    GSI1SK: "SENTAT#2026-08-11T14:32:05Z#ntf_9f3a1c",
    GSI2PK: "USER#u_8841#UNREAD",
    GSI2SK: "SENTAT#2026-08-11T14:32:05Z#ntf_9f3a1c"
  };

  try {
    const res = await docClient.send(new PutCommand({
      TableName: "sf360-notifications",
      Item: mockItem
    }));
    console.log("✅ Mock item successfully inserted into sf360-notifications table!");
    console.log("Response:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("❌ Failed to insert mock item:", err);
  }
}

main();
