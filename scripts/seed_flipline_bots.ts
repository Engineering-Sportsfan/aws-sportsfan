// scripts/seed_flipline_bots.ts — Seed the 4 official FlipLine bot profiles into AWS DynamoDB (IdentityAndAccess) and Firestore
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
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

export const FLIPLINE_BOT_PROFILES = [
  {
    id: "bot_kabir_sharma",
    userId: "bot_kabir_sharma",
    name: "Kabir Sharma",
    firstName: "Kabir",
    lastName: "Sharma",
    displayName: "Kabir Sharma (SF360)",
    handle: "@kabir_sf360",
    email: "kabir.sharma@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Senior Analyst",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Verified Analyst",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332913/Kabir_Sharma_kwc0vp.png",
    bio: "Senior Sports Analyst & Commentator at SF360. Breaking down tactical gameplay, match stats, and live insights across all sports.",
    status: "active",
  },
  {
    id: "bot_riya_kapoor",
    userId: "bot_riya_kapoor",
    name: "Riya Kapoor",
    firstName: "Riya",
    lastName: "Kapoor",
    displayName: "Riya Kapoor (SF360)",
    handle: "@riya_sf360",
    email: "riya.kapoor@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Sports Insider",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Verified Insider",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332898/Riya_Kapoor_opgqzn.png",
    bio: "Official SF360 Sports Insider. Bringing you locker room updates, tournament highlights, and live ground reports.",
    status: "active",
  },
  {
    id: "bot_neha_iyer",
    userId: "bot_neha_iyer",
    name: "Neha Iyer",
    firstName: "Neha",
    lastName: "Iyer",
    displayName: "Neha Iyer (SF360)",
    handle: "@neha_sf360",
    email: "neha.iyer@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Community Host",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Community Lead",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332883/Neha_Iyer_vmcvmn.png",
    bio: "Community Host at SF360. Connecting fans across cricket, football, athletics, and general sports discussions.",
    status: "active",
  },
  {
    id: "bot_arjun_mehta",
    userId: "bot_arjun_mehta",
    name: "Arjun Mehta",
    firstName: "Arjun",
    lastName: "Mehta",
    displayName: "Arjun Mehta (SF360)",
    handle: "@arjun_sf360",
    email: "arjun.mehta@sf360.com",
    role: "FlipLineAdmin",
    title: "SF360 Tactical Specialist",
    isBot: true,
    isVerified: true,
    verifiedFlipLineAdmin: true,
    badge: "Tactical Specialist",
    photoUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    avatarUrl: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    adminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    addfliplineAdminPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    authorPhoto: "https://res.cloudinary.com/dflnsufit/image/upload/v1788332866/Arjun_Mehta_qcclss.png",
    bio: "Tactical Specialist & Match Form Analyst. Sharing in-depth player statistics, key matchups, and game breakdowns.",
    status: "active",
  },
];

async function seedFlipLineBots() {
  console.log("==========================================================================");
  console.log("🤖 SEEDING 4 FLIPLINE BOT PROFILES INTO AWS DYNAMODB (IdentityAndAccess)");
  console.log("==========================================================================\n");

  const now = Date.now();
  let seededCount = 0;
  const env = (process.env.APP_ENV || "prod").toLowerCase().trim();
  const tableName = env === "prod" || env === "production" ? "IdentityAndAccess" : `IdentityAndAccess-${env}`;
  console.log(`📌 Targeting Table: ${tableName} (APP_ENV=${env})\n`);

  for (const bot of FLIPLINE_BOT_PROFILES) {
    const itemData = {
      entityId: `USER#${bot.email}`,
      sk: "USER#META",
      ...bot,
      createdAt: now,
      updatedAt: now,
    };

    try {
      // 1. Write to DynamoDB IdentityAndAccess with email key
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: itemData,
        })
      );

      // 2. Also write by userId key for direct ID lookup
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            ...itemData,
            entityId: `USER#${bot.userId}`,
            sk: "USER#META",
          },
        })
      );

      console.log(`✅ [DynamoDB IdentityAndAccess] Seeded Bot: ${bot.name} (${bot.email})`);
      console.log(`   Photo: ${bot.photoUrl}`);
      console.log(`   Handle: ${bot.handle}`);
      console.log(`   Role: ${bot.role} | Verified: ${bot.isVerified}`);

      // 3. Dual-write to Firestore users collection
      if (db) {
        try {
          await db.collection("users").doc(bot.email).set(
            {
              ...bot,
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
          console.log(`✅ [Firestore users] Seeded Bot Doc: ${bot.email}`);
        } catch (fbErr: any) {
          console.warn(`⚠️ [Firestore notice for ${bot.name}]:`, fbErr?.message || fbErr);
        }
      }

      seededCount++;
    } catch (err: any) {
      console.error(`❌ Failed to seed bot ${bot.name}:`, err.message || err);
    }
  }

  console.log("\n==========================================================================");
  console.log(`🎉 COMPLETED: Successfully seeded ${seededCount}/${FLIPLINE_BOT_PROFILES.length} Bot Profiles!`);
  console.log("==========================================================================\n");
}

if (require.main === module) {
  seedFlipLineBots()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seeding script error:", err);
      process.exit(1);
    });
}
