import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
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

async function scanTable(tableName: string) {
  try {
    console.log(`Scanning table: ${tableName}...`);
    const res = await docClient.send(new ScanCommand({ TableName: tableName }));
    const items = res.Items || [];
    console.log(`Found ${items.length} items.`);
    
    // Filter items that look like notifications (begins with NOTIF# in sk/SK or entity_type = NOTIFICATION)
    const notifs = items.filter((item: any) => {
      const skVal = item.sk?.S || item.SK?.S || "";
      const entityType = item.entity_type?.S || "";
      return skVal.startsWith("NOTIF#") || entityType === "NOTIFICATION";
    });
    
    console.log(`Found ${notifs.length} notifications:`);
    notifs.forEach((n: any, idx: number) => {
      console.log(`\n--- Notif ${idx + 1} ---`);
      console.log("PK/entityId:", n.PK?.S || n.entityId?.S);
      console.log("SK/sk:", n.SK?.S || n.sk?.S);
      console.log("title:", n.title?.S);
      console.log("body:", n.body?.S);
      console.log("notification_type:", n.notification_type?.S);
      console.log("user_id/email:", n.user_id?.S || n.email?.S);
    });
  } catch (err: any) {
    console.error(`Failed to scan ${tableName}:`, err.message);
  }
}

async function main() {
  await scanTable("sf360-notifications");
  await scanTable("IdentityAndAccess");
}

main();
