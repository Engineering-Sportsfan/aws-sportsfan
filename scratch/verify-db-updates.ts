import fs from 'fs';
import path from 'path';

// 1. Load env files manually
const envLocalPath = path.resolve(__dirname, '../.env.local');
const envPath = path.resolve(__dirname, '../.env');

const loadEnvFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const firstEq = line.indexOf('=');
      if (firstEq === -1) return;
      const key = line.slice(0, firstEq).trim();
      let val = line.slice(firstEq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\n/g, '\n');
      process.env[key] = val;
    });
  }
};

loadEnvFile(envPath);
loadEnvFile(envLocalPath);

import { docClient } from '../lib/dynamodb';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = "sf360-notifications";

async function verify() {
  console.log("Checking seeded template usage count...");
  const tplRes = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: "TYPE#store.order_confirmed",
      SK: "MSG#msg_order_confirmed_hype_01"
    }
  }));
  console.log("Template:", JSON.stringify(tplRes.Item, null, 2));

  console.log("\nChecking created notification for user u_8841...");
  const notifRes = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": "USER#u_8841",
      ":sk": "NOTIF#"
    }
  }));
  console.log("Notifications count:", notifRes.Items?.length);
  if (notifRes.Items && notifRes.Items.length > 0) {
    console.log("Latest notification:", JSON.stringify(notifRes.Items[notifRes.Items.length - 1], null, 2));
  }
}

verify().catch(console.error);
