// scripts/seed_sportsfan360_all_envs.ts — Seed SportsFan360 profile across dev, release, and prod tables
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");
if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
  const body = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .trim()
    .replace(/ /g, "\n");
  privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } catch (e) {
    console.warn("Firebase init notice:", e);
  }
}
const db = admin.apps.length ? admin.firestore() : null;

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
});

export const SPORTSFAN360_PROFILE = {
  id: "bot_sportsfan360",
  userId: "bot_sportsfan360",
  name: "SportsFan360",
  firstName: "SportsFan360",
  lastName: "",
  displayName: "SportsFan360",
  handle: "@sportsfan360",
  email: "official@sportsfan360.com",
  role: "FlipLineAdmin",
  title: "Official SportsFan360 Account",
  isBot: true,
  isVerified: true,
  verifiedFlipLineAdmin: true,
  badge: "",
  photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1789120850/Logo_onlo7v.png",
  avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1789120850/Logo_onlo7v.png",
  adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1789120850/Logo_onlo7v.png",
  addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1789120850/Logo_onlo7v.png",
  authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1789120850/Logo_onlo7v.png",
  bio: "The official pulse of SportsFan360. Live scores, breaking sports news, match polls, and community banter.",
  status: "active",
};

const ENVIRONMENTS = [
  { envName: "dev", dynamoTable: "IdentityAndAccess-dev", firestoreCol: "users_dev" },
  { envName: "release", dynamoTable: "IdentityAndAccess-release", firestoreCol: "users_release" },
  { envName: "prod", dynamoTable: "IdentityAndAccess", firestoreCol: "users" },
];

async function seedProfileAllEnvironments() {
  console.log("==========================================================================");
  console.log("🚀 SEEDING SPORTSFAN360 PROFILE ACROSS ALL 3 ENVIRONMENTS (dev, release, prod)");
  console.log("==========================================================================\n");

  const now = Date.now();
  const itemData = {
    entityId: `USER#${SPORTSFAN360_PROFILE.email}`,
    sk: "USER#META",
    ...SPORTSFAN360_PROFILE,
    createdAt: now,
    updatedAt: now,
  };

  for (const env of ENVIRONMENTS) {
    console.log(`\n📌 Target Environment: [${env.envName.toUpperCase()}]`);
    console.log(`   DynamoDB Table: ${env.dynamoTable}`);
    console.log(`   Firestore Col:  ${env.firestoreCol}`);

    // 1. DynamoDB: Put by email
    try {
      await docClient.send(
        new PutCommand({
          TableName: env.dynamoTable,
          Item: itemData,
        })
      );
      console.log(`   ✅ DynamoDB [${env.dynamoTable}]: Seeded USER#${SPORTSFAN360_PROFILE.email}`);
    } catch (err: any) {
      console.error(`   ❌ DynamoDB [${env.dynamoTable}] error:`, err?.message || err);
    }

    // 2. DynamoDB: Put by userId
    try {
      await docClient.send(
        new PutCommand({
          TableName: env.dynamoTable,
          Item: {
            ...itemData,
            entityId: `USER#${SPORTSFAN360_PROFILE.userId}`,
            sk: "USER#META",
          },
        })
      );
      console.log(`   ✅ DynamoDB [${env.dynamoTable}]: Seeded USER#${SPORTSFAN360_PROFILE.userId}`);
    } catch (err: any) {
      console.error(`   ❌ DynamoDB [${env.dynamoTable}] error:`, err?.message || err);
    }

    // 3. Firestore: Set user doc
    if (db) {
      try {
        await db.collection(env.firestoreCol).doc(SPORTSFAN360_PROFILE.email).set(
          {
            ...SPORTSFAN360_PROFILE,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
        console.log(`   ✅ Firestore [${env.firestoreCol}]: Seeded doc ${SPORTSFAN360_PROFILE.email}`);
      } catch (fbErr: any) {
        console.warn(`   ⚠️ Firestore [${env.firestoreCol}] error:`, fbErr?.message || fbErr);
      }
    }
  }

  console.log("\n==========================================================================");
  console.log("🎉 ALL DONE: SportsFan360 profile successfully seeded across all 3 environments!");
  console.log("==========================================================================\n");
}

if (require.main === module) {
  seedProfileAllEnvironments()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seeding error:", err);
      process.exit(1);
    });
}
