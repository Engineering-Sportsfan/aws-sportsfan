// scripts/migrate_onboarding_config.ts
import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");

if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
  let body = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").trim();
  body = body.replace(/ /g, "\n");
  privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        })
    });
}
const db = admin.firestore();

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
    }
});

const CONFIG_TYPES = ["sports", "engagement", "followEntities"] as const;

async function migrate() {
  console.log("Starting onboarding config migration from Firestore to DynamoDB...");

  for (const type of CONFIG_TYPES) {
    try {
      console.log(`Fetching items for type: ${type} from Firestore...`);
      const snap = await db.collection("roarOnboardingConfig").doc(type).collection("items").get();
      console.log(`Found ${snap.docs.length} items in Firestore for ${type}`);

      for (const doc of snap.docs) {
        const itemData = doc.data();
        const itemId = doc.id;
        
        const dynamoItem = {
          ...itemData,
          entityId: "roarOnboardingConfig",
          sk: `ONBOARDING_CONFIG#${type}#${itemId}`,
          active: itemData.active ?? true,
          order: typeof itemData.order === "number" ? itemData.order : Date.now(),
        };

        console.log(`Writing item ${itemId} (${itemData.label || itemData.name || "unnamed"}) to DynamoDB...`);
        await docClient.send(new PutCommand({
          TableName: "IdentityAndAccess",
          Item: dynamoItem
        }));
      }
      console.log(`Completed migration for type: ${type}\n`);
    } catch (err) {
      console.error(`Error migrating type ${type}:`, err);
    }
  }

  console.log("Migration complete!");
}

migrate().catch(console.error);
