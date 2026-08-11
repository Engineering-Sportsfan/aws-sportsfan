import admin from "firebase-admin";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from "dotenv";
import * as path from "path";

// Initialize environment variables from .env.local and .env
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

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

const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  }
});

function calculateItemSize(item: any): number {
  return Buffer.byteLength(JSON.stringify(item), "utf8");
}

function sanitizeFirebaseData(obj: any): any {
  if (obj === undefined) return undefined;
  if (obj === null) return null;
  if (typeof obj !== "object") return obj;
  
  if (obj instanceof admin.firestore.Timestamp) return obj.toMillis();
  if (obj instanceof admin.firestore.GeoPoint) return `${obj.latitude},${obj.longitude}`;
  if (obj instanceof admin.firestore.DocumentReference) return obj.path;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeFirebaseData(item)).filter(item => item !== undefined);
  }
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitized = sanitizeFirebaseData(value);
    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }
  return result;
}

// Enforce GSI and key types to avoid DynamoDB ValidationExceptions
function enforceIndexTypes(item: any, tableName: string) {
  if (item.createdAt !== undefined) {
    if (typeof item.createdAt !== "number") {
      item.createdAt = Number(item.createdAt) || Date.now();
    }
  }
  if (item.updatedAt !== undefined) {
    if (typeof item.updatedAt !== "number") {
      item.updatedAt = Number(item.updatedAt) || Date.now();
    }
  }
  if (item.isActive !== undefined) {
    // RealTimeChat GSI requires isActive to be String (S)
    item.isActive = String(item.isActive);
  }
  if (item.order !== undefined) {
    if (typeof item.order !== "number") {
      item.order = Number(item.order) || 0;
    }
  }
  if (item.joinedAt !== undefined) {
    if (typeof item.joinedAt !== "number") {
      item.joinedAt = Number(item.joinedAt) || Date.now();
    }
  }
  if (item.completedAt !== undefined) {
    if (typeof item.completedAt !== "number") {
      item.completedAt = Number(item.completedAt) || Date.now();
    }
  }
  if (item.points !== undefined) {
    if (typeof item.points !== "number") {
      item.points = Number(item.points) || 0;
    }
  }
  if (item.seasonYear !== undefined) {
    item.seasonYear = String(item.seasonYear);
  }
  return item;
}

// Write to DynamoDB in batches of 25 with deduplication & retry logic
async function writeBatch(tableName: string, batch: any[], maxRetries = 5) {
  let pkField = "entityId";
  if (tableName === "GamificationAndWallet") pkField = "userId";
  else if (tableName === "RealTimeChat") pkField = "roomId";
  else if (tableName === "SocialAndContent") pkField = "contentId";
  const skField = "sk";

  const seenKeys = new Set<string>();
  const uniqueBatch: any[] = [];

  for (const op of batch) {
    const item = op.PutRequest.Item;
    const pkVal = item[pkField];
    const skVal = item[skField];
    const key = `${pkVal}###${skVal}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueBatch.push(op);
    } else {
      console.warn(`\n⚠️ Skipping duplicate batch item in ${tableName} for key: ${key}`);
    }
  }

  if (uniqueBatch.length === 0) return;

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: uniqueBatch
        }
      }));
      process.stdout.write("."); 
      return;
    } catch (error: any) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`\n❌ FATAL ERROR: Failed to write batch to ${tableName} after ${maxRetries} attempts:`, error);
        throw error;
      }
      const waitTime = Math.pow(2, attempt) * 500;
      console.log(`\n⚠️ AWS Throttle detected for ${tableName}. Retrying in ${waitTime}ms (Attempt ${attempt}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Ingest root level Firestore collections
async function migrateRootCollection(config: {
  collectionName: string;
  tableName: string;
  pkField: string;
  skField: string;
  pkGenerator: (docId: string, data: any) => string;
  skGenerator: (docId: string, data: any) => string;
}) {
  console.log(`\n📡 Ingesting root collection: ${config.collectionName} -> ${config.tableName}...`);
  try {
    const snapshot = await db.collection(config.collectionName).get();
    if (snapshot.empty) {
      console.log(`⏭️ Skipped ${config.collectionName} (No documents found)`);
      return;
    }

    let batch: any[] = [];
    let migratedCount = 0;

    for (const doc of snapshot.docs) {
      let data = sanitizeFirebaseData(doc.data());
      const pk = config.pkGenerator(doc.id, data);
      const sk = config.skGenerator(doc.id, data);

      let item = {
        [config.pkField]: pk,
        [config.skField]: sk,
        ...data,
      };

      item = enforceIndexTypes(item, config.tableName);

      if (calculateItemSize(item) > 400000) {
        console.error(`\n🚨 docId ${doc.id} in ${config.collectionName} exceeds 400KB limit. Skipping.`);
        continue;
      }

      batch.push({ PutRequest: { Item: item } });

      if (batch.length === 25) {
        await writeBatch(config.tableName, batch);
        migratedCount += batch.length; // Count actually written unique items
        batch = [];
      }
    }

    if (batch.length > 0) {
      await writeBatch(config.tableName, batch);
      migratedCount += batch.length;
    }

    console.log(`\n✅ Migrated ${migratedCount} documents from root collection ${config.collectionName}.`);
  } catch (err) {
    console.error(`❌ Failed to migrate root collection ${config.collectionName}:`, err);
  }
}

// Ingest nested subcollections using Firestore collectionGroup
async function migrateSubcollection(config: {
  subcollectionName: string;
  tableName: string;
  pkField: string;
  skField: string;
  pkGenerator: (docId: string, parentId: string, parentCollection: string, data: any) => string;
  skGenerator: (docId: string, parentId: string, parentCollection: string, data: any) => string;
}) {
  console.log(`\n📡 Ingesting subcollection: collectionGroup("${config.subcollectionName}") -> ${config.tableName}...`);
  try {
    const snapshot = await db.collectionGroup(config.subcollectionName).get();
    if (snapshot.empty) {
      console.log(`⏭️ Skipped subcollection Group ${config.subcollectionName} (No documents found)`);
      return;
    }

    let batch: any[] = [];
    let migratedCount = 0;

    for (const doc of snapshot.docs) {
      const parentDocRef = doc.ref.parent.parent;
      if (!parentDocRef) {
        continue; // Orphaned subcollection doc with no parent, skip
      }
      const parentId = parentDocRef.id;
      const parentCollection = parentDocRef.parent.id; // e.g. "roarRooms" or "storeProducts"

      let data = sanitizeFirebaseData(doc.data());
      const pk = config.pkGenerator(doc.id, parentId, parentCollection, data);
      const sk = config.skGenerator(doc.id, parentId, parentCollection, data);

      let item = {
        [config.pkField]: pk,
        [config.skField]: sk,
        parentEntityId: `${parentCollection}#${parentId}`,
        ...data,
      };

      item = enforceIndexTypes(item, config.tableName);

      if (calculateItemSize(item) > 400000) {
        console.error(`\n🚨 docId ${doc.id} under parent ${parentId} exceeds 400KB limit. Skipping.`);
        continue;
      }

      batch.push({ PutRequest: { Item: item } });

      if (batch.length === 25) {
        await writeBatch(config.tableName, batch);
        migratedCount += batch.length;
        batch = [];
      }
    }

    if (batch.length > 0) {
      await writeBatch(config.tableName, batch);
      migratedCount += batch.length;
    }

    console.log(`\n✅ Migrated ${migratedCount} documents from subcollection Group ${config.subcollectionName}.`);
  } catch (err) {
    console.error(`❌ Failed to migrate subcollection Group ${config.subcollectionName}:`, err);
  }
}

async function runPhasedMigration() {
  console.log("🚀 Starting Phased Data Ingestion for Missing Root & Nested Subcollections...\n");

  // 1. Root Configuration Collections -> GamificationAndWallet
  await migrateRootCollection({
    collectionName: "pointRules",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: () => "CONFIG#RULES",
    skGenerator: (docId) => `RULE#${docId}`
  });

  await migrateRootCollection({
    collectionName: "multipliers",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: () => "CONFIG#MULTIPLIERS",
    skGenerator: (docId) => `MULTIPLIER#${docId}`
  });

  await migrateRootCollection({
    collectionName: "globalLevels",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: () => "CONFIG#LEVELS",
    skGenerator: (docId) => `LEVEL#${docId}`
  });

  await migrateRootCollection({
    collectionName: "featureThresholds",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: () => "CONFIG#THRESHOLDS",
    skGenerator: (docId) => `THRESHOLD#${docId}`
  });

  // 2. Root Fan Battles & Sessions -> GamificationAndWallet
  await migrateRootCollection({
    collectionName: "fanBattles",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (docId) => `BATTLE#${docId}`,
    skGenerator: () => "BATTLE#META"
  });

  await migrateRootCollection({
    collectionName: "fanBattleQuizzes",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (_, data) => `BATTLE#${data.battleId || "UNKNOWN"}`,
    skGenerator: (docId) => `QUIZ#${docId}`
  });

  await migrateRootCollection({
    collectionName: "fanBattleSessions",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (_, data) => data.userId || data.authorUid || "UNKNOWN",
    skGenerator: (docId) => `SESS_BATTLE#${docId}`
  });

  await migrateRootCollection({
    collectionName: "battleSessions",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (_, data) => data.userId || data.authorUid || "UNKNOWN",
    skGenerator: (docId) => `BATTLE_SESS#${docId}`
  });

  await migrateRootCollection({
    collectionName: "fanBattleResponses",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (_, data) => data.userId || data.authorUid || "UNKNOWN",
    skGenerator: (docId) => `BATTLE_RESP#${docId}`
  });

  // 3. Root Catalogs & Records -> SocialAndContent
  await migrateRootCollection({
    collectionName: "records",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `RECORD#${docId}`,
    skGenerator: () => "RECORD#META"
  });

  await migrateRootCollection({
    collectionName: "recordTrends",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `RECORD_TREND#${docId}`,
    skGenerator: (_, data) => `TREND#${data.createdAt || Date.now()}`
  });

  await migrateRootCollection({
    collectionName: "recordStories",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `RECORD_STORY#${docId}`,
    skGenerator: (_, data) => `STORY#${data.createdAt || Date.now()}`
  });

  await migrateRootCollection({
    collectionName: "playbook",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `PLAYBOOK#${docId}`,
    skGenerator: () => "PLAYBOOK#META"
  });

  // 4. Record Progress -> GamificationAndWallet
  await migrateRootCollection({
    collectionName: "recordProgress",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (_, data) => data.userId || data.userUid || "UNKNOWN",
    skGenerator: (docId) => `PROGRESS_RECORD#${docId}`
  });

  // 5. Root Athletes & Reviews -> SportsData
  await migrateRootCollection({
    collectionName: "athletesProfile",
    tableName: "SportsData",
    pkField: "entityId",
    skField: "sk",
    pkGenerator: (docId) => `ATHLETE#${docId}`,
    skGenerator: () => "PROFILE#ATHLETE"
  });

  await migrateRootCollection({
    collectionName: "athleteReviewQueue",
    tableName: "SportsData",
    pkField: "entityId",
    skField: "sk",
    pkGenerator: (_, data) => `ATHLETE#${data.athleteId || "UNKNOWN"}`,
    skGenerator: (docId) => `REVIEW#${docId}`
  });

  // 6. Commerce & Requests -> StoreAndCommerce & SocialAndContent
  await migrateRootCollection({
    collectionName: "dropRequests",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `REQ_DROP#${docId}`,
    skGenerator: (_, data) => `REQ_DROP#${data.createdAt || Date.now()}`
  });

  await migrateRootCollection({
    collectionName: "userMemberships",
    tableName: "StoreAndCommerce",
    pkField: "entityId",
    skField: "sk",
    pkGenerator: (_, data) => `MEMBERSHIP#${data.userId || data.userUid || "UNKNOWN"}`,
    skGenerator: (docId) => `MEMBERSHIP#${docId}`
  });

  // 7. System Locks & Sentiment Logs -> RealTimeChat & SocialAndContent
  await migrateRootCollection({
    collectionName: "dollyPhaseLocks",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: () => "SYSTEM#DOLLY_LOCKS",
    skGenerator: (docId) => `LOCK#${docId}`
  });

  await migrateRootCollection({
    collectionName: "partisanLocks",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: () => "SYSTEM#PARTISAN_LOCKS",
    skGenerator: (docId) => `LOCK#${docId}`
  });

  await migrateRootCollection({
    collectionName: "fifaSentiments",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: () => "SENTIMENT#FIFA",
    skGenerator: (docId) => `SENTIMENT#${docId}`
  });

  await migrateRootCollection({
    collectionName: "wt20wSentiments",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: () => "SENTIMENT#WT20W",
    skGenerator: (docId) => `SENTIMENT#${docId}`
  });

  // 8. Root Community & Social Prefs -> SocialAndContent / IdentityAndAccess
  await migrateRootCollection({
    collectionName: "communities",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `COMMUNITY#${docId}`,
    skGenerator: () => "COMMUNITY#META"
  });

  await migrateRootCollection({
    collectionName: "groups",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `GROUP#${docId}`,
    skGenerator: () => "GROUP#META"
  });

  await migrateRootCollection({
    collectionName: "departments",
    tableName: "IdentityAndAccess",
    pkField: "entityId",
    skField: "sk",
    pkGenerator: (docId) => `DEPT#${docId}`,
    skGenerator: () => "DEPT#META"
  });

  await migrateRootCollection({
    collectionName: "userPreferences",
    tableName: "IdentityAndAccess",
    pkField: "entityId",
    skField: "sk",
    pkGenerator: (docId) => `PREF#USER#${docId}`,
    skGenerator: () => "PREF#META"
  });

  await migrateRootCollection({
    collectionName: "postPreferences",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `PREF_POST#${docId}`,
    skGenerator: () => "PREF_POST#META"
  });

  await migrateRootCollection({
    collectionName: "postReports",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `REPORT#${docId}`,
    skGenerator: () => "REPORT#META"
  });

  await migrateRootCollection({
    collectionName: "following",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `FOLLOW#${docId}`,
    skGenerator: () => "FOLLOW#META"
  });

  await migrateRootCollection({
    collectionName: "appData",
    tableName: "SocialAndContent",
    pkField: "contentId",
    skField: "sk",
    pkGenerator: (docId) => `APPDATA#${docId}`,
    skGenerator: () => "APPDATA#META"
  });

  // 9. NESTED SUBCOLLECTIONS Group Ingestion
  await migrateSubcollection({
    subcollectionName: "messages",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: (_, parentId) => `ROOM#${parentId}`,
    skGenerator: (docId, parentId, _, data) => `MSG#${parentId}#${data.createdAt || Date.now()}#${docId}`
  });

  await migrateSubcollection({
    subcollectionName: "joinedUsers",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: (_, parentId) => `ROOM#${parentId}`,
    skGenerator: (docId) => `MEMBER#${docId}`
  });

  await migrateSubcollection({
    subcollectionName: "presence",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: (_, parentId) => `ROOM#${parentId}`,
    skGenerator: (docId) => `PRESENCE#${docId}`
  });

  await migrateSubcollection({
    subcollectionName: "dollySessions",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: (_, parentId) => `ROOM#${parentId}`,
    skGenerator: (docId) => `SESSION_DOLLY#${docId}`
  });

  await migrateSubcollection({
    subcollectionName: "dollyReplies",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: (_, parentId) => `ROOM#${parentId}`,
    skGenerator: (docId) => `REPLY_DOLLY#${docId}`
  });

  await migrateSubcollection({
    subcollectionName: "channels",
    tableName: "RealTimeChat",
    pkField: "roomId",
    skField: "sk",
    pkGenerator: (_, parentId) => `ROOM#${parentId}`,
    skGenerator: (docId) => `CHANNEL#${docId}`
  });

  await migrateSubcollection({
    subcollectionName: "slots",
    tableName: "StoreAndCommerce",
    pkField: "entityId",
    skField: "sk",
    pkGenerator: (_, parentId) => `PRODUCT#${parentId}`,
    skGenerator: (docId) => `SLOT#${docId}`
  });

  await migrateSubcollection({
    subcollectionName: "leaderboard",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (docId) => docId,
    skGenerator: (_, parentId) => `BATTLE_LEADERBOARD#${parentId}`
  });

  await migrateSubcollection({
    subcollectionName: "activityLog",
    tableName: "GamificationAndWallet",
    pkField: "userId",
    skField: "sk",
    pkGenerator: (_, parentId) => parentId,
    skGenerator: (docId) => `ACTIVITY#${docId}`
  });

  console.log("\n🎉 Phase 1 Complete! All root and nested subcollections migrated safely.");
  process.exit(0);
}

runPhasedMigration();
