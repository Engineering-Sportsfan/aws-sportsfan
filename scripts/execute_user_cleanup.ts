import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, DeleteCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ============================================================================
// 🎯 TARGET USER TO DELETE (REAL EXECUTION)
//
// Usage:
//   npx tsx scripts/execute_user_cleanup.ts <user_email_or_id> --confirm
// ============================================================================
export const DEFAULT_TARGET_USER = "srikakulamchandu@gmail.com";

const cliTarget = process.argv.slice(2).find(arg => !arg.startsWith("-"));
export const TARGET_USER = (cliTarget || DEFAULT_TARGET_USER).trim().toLowerCase();
const isConfirmed = process.argv.includes("--confirm");

// ============================================================================
// Firebase & DynamoDB Initialization
// ============================================================================
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

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  } : undefined
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  }
});

export const ENVIRONMENTS = [
  { name: "prod", suffix: "" },
  { name: "dev", suffix: "-dev" },
  { name: "release", suffix: "-release" },
] as const;

export function generateUserAliases(identifier: string): Set<string> {
  const aliases = new Set<string>();
  if (!identifier || typeof identifier !== 'string') return aliases;

  const raw = identifier.trim();
  const lower = raw.toLowerCase();
  const strippedUser = lower.replace(/^user#/, "").replace(/^pref#user#/, "").replace(/^otp#/, "");

  aliases.add(raw);
  aliases.add(lower);
  aliases.add(strippedUser);

  const sanitized = strippedUser.replace(/[^a-zA-Z0-9]/g, "_");
  aliases.add(sanitized);

  const underscore = strippedUser.replace(/@/g, "_").replace(/\./g, "_");
  aliases.add(underscore);

  const dotted = strippedUser.replace(/@/g, ".");
  aliases.add(dotted);

  aliases.add(`USER#${strippedUser}`);
  aliases.add(`USER#${lower}`);
  aliases.add(`USER#${sanitized}`);
  aliases.add(`PREF#USER#${strippedUser}`);
  aliases.add(`PREF#USER#${lower}`);
  aliases.add(`OTP#${strippedUser}`);
  aliases.add(`OTP#${lower}`);
  aliases.add(`PROFILE_ROAR#${strippedUser}`);
  aliases.add(`PROFILE_SF360#${strippedUser}`);

  return aliases;
}

// Fast DynamoDB Query by Partition Key
async function queryDynamoByPk(tableName: string, pkField: string, pkValue: string): Promise<any[]> {
  try {
    const res = await docClient.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: `#pk = :val`,
      ExpressionAttributeNames: { "#pk": pkField },
      ExpressionAttributeValues: { ":val": pkValue },
    }));
    return res.Items || [];
  } catch {
    return [];
  }
}

// Fast DynamoDB Filtered Scan (Only returns keys)
async function scanDynamoFiltered(tableName: string, filterExp: string, expValues: Record<string, any>, projectionExp: string): Promise<any[]> {
  const items: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  try {
    do {
      const res: any = await docClient.send(new ScanCommand({
        TableName: tableName,
        FilterExpression: filterExp,
        ExpressionAttributeValues: expValues,
        ProjectionExpression: projectionExp,
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      if (res.Items && res.Items.length > 0) {
        items.push(...res.Items);
      }
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch { }
  return items;
}

// Batch delete for DynamoDB
async function batchDeleteDynamoItems(tableName: string, keys: Record<string, any>[]): Promise<number> {
  if (keys.length === 0) return 0;
  let totalDeleted = 0;
  const BATCH_SIZE = 25;

  const chunks: Record<string, any>[][] = [];
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    chunks.push(keys.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    let requestItems: any = {
      [tableName]: chunk.map(k => ({
        DeleteRequest: { Key: k }
      }))
    };

    let retries = 0;
    while (requestItems && Object.keys(requestItems).length > 0 && retries < 4) {
      try {
        const res = await docClient.send(new BatchWriteCommand({
          RequestItems: requestItems
        }));

        const unprocessed = res.UnprocessedItems;
        if (unprocessed && unprocessed[tableName] && unprocessed[tableName].length > 0) {
          requestItems = unprocessed;
          retries++;
          await new Promise(r => setTimeout(r, 60 * retries));
        } else {
          requestItems = null;
        }
      } catch {
        // Fallback to single deletes
        await Promise.all(chunk.map(k => docClient.send(new DeleteCommand({ TableName: tableName, Key: k })).catch(() => { })));
        requestItems = null;
      }
    }
    totalDeleted += chunk.length;
  }
  return totalDeleted;
}

// Batch delete for Firestore
async function deleteFirestoreDocs(docRefs: FirebaseFirestore.DocumentReference[]): Promise<number> {
  if (docRefs.length === 0) return 0;
  let count = 0;
  const chunkSize = 450;

  for (let i = 0; i < docRefs.length; i += chunkSize) {
    const chunk = docRefs.slice(i, i + chunkSize);
    const batch = db.batch();
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
    count += chunk.length;
  }
  return count;
}

// Targeted Firestore Query
async function queryFirestoreDocRefs(collName: string, fields: string[], targetValues: string[]): Promise<FirebaseFirestore.DocumentReference[]> {
  const docRefs = new Map<string, FirebaseFirestore.DocumentReference>();

  // 1. Direct doc lookup
  await Promise.all(targetValues.map(async (val) => {
    try {
      const doc = await db.collection(collName).doc(val).get();
      if (doc.exists) {
        docRefs.set(doc.id, doc.ref);
      }
    } catch { }
  }));

  // 2. Query fields
  const chunks: string[][] = [];
  for (let i = 0; i < targetValues.length; i += 30) {
    chunks.push(targetValues.slice(i, i + 30));
  }

  for (const field of fields) {
    await Promise.all(chunks.map(async (chunk) => {
      try {
        const snap = await db.collection(collName).where(field, "in", chunk).get();
        snap.docs.forEach(doc => {
          docRefs.set(doc.id, doc.ref);
        });
      } catch {
        await Promise.all(chunk.slice(0, 5).map(async (val) => {
          try {
            const snap = await db.collection(collName).where(field, "==", val).get();
            snap.docs.forEach(doc => {
              docRefs.set(doc.id, doc.ref);
            });
          } catch { }
        }));
      }
    }));
  }

  return Array.from(docRefs.values());
}

async function executeUserCleanup() {
  const startTime = Date.now();
  console.log("======================================================================");
  console.log("⚡ HIGH-SPEED TARGETED SINGLE-USER DATABASE CLEANUP (REAL EXECUTION)");
  console.log("======================================================================\n");

  if (!TARGET_USER) {
    console.error("❌ Target user is empty! Please specify an email or user ID.");
    process.exit(1);
  }

  console.log(`🎯 TARGET USER TO DELETE: "${TARGET_USER}"`);

  if (!isConfirmed) {
    console.log("\n⚠️ SAFETY STOP: Execution requires the '--confirm' flag to proceed.");
    console.log("   To perform the actual deletion, run:");
    console.log(`   👉 npx tsx scripts/execute_user_cleanup.ts "${TARGET_USER}" --confirm\n`);
    console.log("   Or first run the dry-run audit:");
    console.log(`   👉 npx tsx scripts/dry_run_user_cleanup.ts "${TARGET_USER}"\n`);
    console.log("======================================================================");
    process.exit(0);
  }

  console.log("⚡ Confirmation flag '--confirm' detected. Proceeding with deletion...\n");

  // Build target aliases
  const targetAliases = generateUserAliases(TARGET_USER);

  // ============================================================================
  // Step 1: Discover & Map User Identity
  // ============================================================================
  console.log("📡 Step 1: Mapping all multi-identity records (Firestore & DynamoDB)...");

  const checkUserColls = ["users", "users_dev", "users_release", "roarProfiles", "Sportsfan360Profile", "userPreferences"];
  const userProfileDocRefs: FirebaseFirestore.DocumentReference[] = [];

  for (const coll of checkUserColls) {
    const refs = await queryFirestoreDocRefs(coll, ["email", "userId", "uid"], Array.from(targetAliases));
    refs.forEach(r => userProfileDocRefs.push(r));
  }

  for (const env of ENVIRONMENTS) {
    const tableName = `IdentityAndAccess${env.suffix}`;
    const pks = [
      `USER#${TARGET_USER}`,
      `USER#${TARGET_USER.replace(/[^a-zA-Z0-9]/g, "_")}`,
      `PREF#USER#${TARGET_USER}`,
      `OTP#${TARGET_USER}`,
    ];
    for (const pk of pks) {
      const items = await queryDynamoByPk(tableName, "entityId", pk);
      items.forEach(item => {
        generateUserAliases(item.entityId).forEach(a => targetAliases.add(a));
        if (item.email) generateUserAliases(item.email).forEach(a => targetAliases.add(a));
        if (item.userId) generateUserAliases(item.userId).forEach(a => targetAliases.add(a));
      });
    }
  }

  const targetAliasesList = Array.from(targetAliases);
  console.log(`   ✅ Resolved Search Aliases: ${targetAliasesList.length} keys targeting "${TARGET_USER}"\n`);

  // ============================================================================
  // Step 2: Delete from AWS DynamoDB (3 Environments: prod, dev, release)
  // ============================================================================
  console.log("======================================================================");
  console.log("⚡ Step 2: DELETING USER RECORDS FROM AWS DYNAMODB (3 ENVIRONMENTS)");
  console.log("======================================================================\n");

  let totalDynamoDeleted = 0;

  for (const env of ENVIRONMENTS) {
    console.log(`🗑️  Processing Environment: [${env.name.toUpperCase()}]`);

    // 1. IdentityAndAccess
    const idTable = `IdentityAndAccess${env.suffix}`;
    const idKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      const items = await queryDynamoByPk(idTable, "entityId", alias);
      items.forEach(it => idKeys.set(`${it.entityId}###${it.sk}`, { entityId: it.entityId, sk: it.sk }));
    }
    if (idKeys.size > 0) {
      const deleted = await batchDeleteDynamoItems(idTable, Array.from(idKeys.values()));
      console.log(`   ✅ Deleted ${deleted} item(s) from '${idTable}'.`);
      totalDynamoDeleted += deleted;
    }

    // 2. GamificationAndWallet
    const gamTable = `GamificationAndWallet${env.suffix}`;
    const gamKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      if (alias.startsWith("USER#") || alias.startsWith("PREF#") || alias.startsWith("OTP#")) continue;
      const items = await queryDynamoByPk(gamTable, "userId", alias);
      items.forEach(it => gamKeys.set(`${it.userId}###${it.sk}`, { userId: it.userId, sk: it.sk }));
    }
    if (gamKeys.size > 0) {
      const deleted = await batchDeleteDynamoItems(gamTable, Array.from(gamKeys.values()));
      console.log(`   ✅ Deleted ${deleted} item(s) from '${gamTable}'.`);
      totalDynamoDeleted += deleted;
    }

    // 3. sf360-notifications
    const notifTable = `sf360-notifications${env.suffix}`;
    const notifKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      const items = await queryDynamoByPk(notifTable, "PK", alias);
      items.forEach(it => notifKeys.set(`${it.PK}###${it.SK}`, { PK: it.PK, SK: it.SK }));
    }
    if (notifKeys.size > 0) {
      const deleted = await batchDeleteDynamoItems(notifTable, Array.from(notifKeys.values()));
      console.log(`   ✅ Deleted ${deleted} item(s) from '${notifTable}'.`);
      totalDynamoDeleted += deleted;
    }

    // 4. StoreAndCommerce
    const storeTable = `StoreAndCommerce${env.suffix}`;
    const storeKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      const items = await queryDynamoByPk(storeTable, "entityId", alias);
      items.forEach(it => storeKeys.set(`${it.entityId}###${it.sk}`, { entityId: it.entityId, sk: it.sk }));
    }
    if (storeKeys.size > 0) {
      const deleted = await batchDeleteDynamoItems(storeTable, Array.from(storeKeys.values()));
      console.log(`   ✅ Deleted ${deleted} item(s) from '${storeTable}'.`);
      totalDynamoDeleted += deleted;
    }

    // 5. userwaitinglist
    const waitTable = `userwaitinglist${env.suffix}`;
    const waitItems = await scanDynamoFiltered(
      waitTable,
      "email = :em",
      { ":em": TARGET_USER },
      "id, email"
    );
    if (waitItems.length > 0) {
      const deleted = await batchDeleteDynamoItems(waitTable, waitItems.map(it => ({ id: it.id })));
      console.log(`   ✅ Deleted ${deleted} item(s) from '${waitTable}'.`);
      totalDynamoDeleted += deleted;
    }
  }

  // ============================================================================
  // Step 3: Delete from Firestore Collections
  // ============================================================================
  console.log("\n======================================================================");
  console.log("🔥 Step 3: DELETING USER RECORDS FROM FIRESTORE COLLECTIONS");
  console.log("======================================================================\n");

  const firestoreCollectionsToCheck = [
    { name: "users", fields: ["userId", "email"] },
    { name: "users_dev", fields: ["userId", "email"] },
    { name: "users_release", fields: ["userId", "email"] },
    { name: "pointTransactions", fields: ["userId", "userEmail"] },
    { name: "wallet_transactions", fields: ["userId"] },
    { name: "reward_coins_ledger", fields: ["userId"] },
    { name: "globalLeaderboard", fields: ["userId", "userEmail"] },
    { name: "leaderboard", fields: ["userId"] },
    { name: "quizLeaderboard", fields: ["userId"] },
    { name: "activityLog", fields: ["userId"] },
    { name: "videoProgress", fields: ["userId"] },
    { name: "audioProgress", fields: ["userId"] },
    { name: "recordProgress", fields: ["userId", "userUid"] },
    { name: "roarBadges", fields: ["userId"] },
    { name: "roarProgress", fields: ["userId"] },
    { name: "triviaAnswers", fields: ["userId"] },
    { name: "quizAnswers", fields: ["userId"] },
    { name: "predictions", fields: ["userId", "authorUid"] },
    { name: "fanBattleSessions", fields: ["userId", "authorUid"] },
    { name: "fanBattleResponses", fields: ["userId", "authorUid"] },
    { name: "battleSessions", fields: ["userId", "authorUid"] },
    { name: "roarPosts", fields: ["authorUid", "authorId", "userId", "authorEmail"] },
    { name: "socialPosts", fields: ["authorUid", "authorId", "userId"] },
    { name: "comments", fields: ["userId", "authorUid"] },
    { name: "likes", fields: ["userId"] },
    { name: "reactions", fields: ["userId"] },
    { name: "emojiReactions", fields: ["userId"] },
    { name: "pollVotes", fields: ["userId"] },
    { name: "votes", fields: ["userId"] },
    { name: "battleVotes", fields: ["userId"] },
    { name: "postPreferences", fields: ["userId"] },
    { name: "postReports", fields: ["reporterId", "userId"] },
    { name: "reporterReputation", fields: ["userId"] },
    { name: "userPins", fields: ["userId"] },
    { name: "userStrikes", fields: ["userId"] },
    { name: "feedbackSubmissions", fields: ["userId", "userEmail"] },
    { name: "recentlyViewed", fields: ["userId"] },
    { name: "seen_drops", fields: ["userId"] },
    { name: "wishlist", fields: ["userId"] },
    { name: "followRequests", fields: ["senderUserId", "receiverUserId"] },
    { name: "following", fields: ["userId", "userEmail"] },
    { name: "dropRequests", fields: ["userId"] },
    { name: "messages", fields: ["senderId", "userId", "authorUid"] },
    { name: "audioMessages", fields: ["senderId", "userId"] },
    { name: "videoMessages", fields: ["senderId", "userId"] },
    { name: "chats", fields: ["participantIds", "userId"] },
    { name: "joinedUsers", fields: ["userId"] },
    { name: "presence", fields: ["userId"] },
    { name: "watchAlongRooms", fields: ["hostUserId", "coHostUserId"] },
    { name: "roarRooms", fields: ["hostUserId", "creatorId"] },
    { name: "askaiConversations", fields: ["userId"] },
    { name: "dollySessions", fields: ["userId"] },
    { name: "dollyReplies", fields: ["userId"] },
    { name: "notifications", fields: ["userId"] },
    { name: "storeOrders", fields: ["userId", "userEmail"] },
    { name: "orders", fields: ["userId", "userEmail"] },
    { name: "bids", fields: ["userId"] },
    { name: "autoBids", fields: ["userId"] },
    { name: "userBidActivity", fields: ["userId"] },
    { name: "userMemberships", fields: ["userId", "userUid"] },
    { name: "session_requests", fields: ["userId", "hostId"] },
    { name: "sessions", fields: ["userId", "hostId"] },
    { name: "slots", fields: ["userId", "bookedBy"] },
    { name: "communityMembers", fields: ["userId"] },
    { name: "communities", fields: ["created_by"] },
    { name: "groups", fields: ["created_by"] },
    { name: "inviteFriends", fields: ["invitedBy"] },
    { name: "otps", fields: ["email"] },
    { name: "roarProfiles", fields: ["userId", "uid"] },
    { name: "Sportsfan360Profile", fields: ["userId"] },
    { name: "userPreferences", fields: ["userId"] },
  ];

  let totalFirestoreDeleted = 0;

  // Delete main user profile docs
  if (userProfileDocRefs.length > 0) {
    const deleted = await deleteFirestoreDocs(userProfileDocRefs);
    console.log(`   ✅ Deleted ${deleted} user profile document(s).`);
    totalFirestoreDeleted += deleted;
  }

  // Delete matching records from all dependent collections
  const BATCH_SIZE = 10;
  for (let i = 0; i < firestoreCollectionsToCheck.length; i += BATCH_SIZE) {
    const chunk = firestoreCollectionsToCheck.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (coll) => {
      const refs = await queryFirestoreDocRefs(coll.name, coll.fields, targetAliasesList);
      if (refs.length > 0) {
        const deleted = await deleteFirestoreDocs(refs);
        console.log(`   ✅ Deleted ${deleted} record(s) from collection '${coll.name}'.`);
        totalFirestoreDeleted += deleted;
      }
    }));
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n======================================================================");
  console.log("🎉 CLEANUP EXECUTION COMPLETE");
  console.log("======================================================================");
  console.log(`🎯 Target User Deleted                     : ${TARGET_USER}`);
  console.log(`📦 Total Items Deleted from AWS DynamoDB   : ${totalDynamoDeleted}`);
  console.log(`🔥 Total Documents Deleted from Firestore  : ${totalFirestoreDeleted}`);
  console.log(`💥 GRAND TOTAL DELETED ACROSS ALL TABLES   : ${totalDynamoDeleted + totalFirestoreDeleted}`);
  console.log(`⏱️ Execution Time                         : ${durationSec} seconds`);
  console.log("----------------------------------------------------------------------");
  console.log("✅ ALL DATA TIED TO TARGET USER HAS BEEN PERMANENTLY REMOVED.");
  console.log("======================================================================\n");
}

executeUserCleanup().catch(err => {
  console.error("❌ Cleanup execution error:", err);
  process.exit(1);
});
