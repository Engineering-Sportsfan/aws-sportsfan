import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import * as fs from "fs";
import * as path from "path";

// Parse .env manually
try {
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    envConfig.split("\n").forEach((line) => {
      const parts = line.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join("=").trim();
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
  try {
    console.log("Querying notifications for user USER#u_8841...");
    const res = await docClient.send(new QueryCommand({
      TableName: "sf360-notifications",
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "USER#u_8841"
      }
    }));
    console.log("✅ Query successful!");
    console.log("Items found:", res.Count);
    console.log("Items:", JSON.stringify(res.Items, null, 2));
  } catch (err) {
    console.error("❌ Query failed:", err);
  }
}

main();
