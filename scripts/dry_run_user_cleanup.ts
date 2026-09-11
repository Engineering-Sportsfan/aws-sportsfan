import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ============================================================================
// 🎯 TARGET USER TO AUDIT
// ============================================================================
export const DEFAULT_TARGET_USER = "srikakulamchandu@gmail.com";

const cliTarget = process.argv.slice(2).find(arg => !arg.startsWith("-"));
export const TARGET_USER = (cliTarget || DEFAULT_TARGET_USER).trim().toLowerCase();

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

// 3 Environments
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
  } catch (err: any) {
    if (err.name !== "ResourceNotFoundException") {
      // ignore missing tables/keys
    }
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
  } catch (err: any) {
    if (err.name !== "ResourceNotFoundException") {
      // ignore
    }
  }
  return items;
}

// Fast Firestore Target Query
async function queryFirestoreCollection(collName: string, fields: string[], targetValues: string[]): Promise<{ docId: string; data: any }[]> {
  const matchedDocs = new Map<string, any>();

  // 1. Direct doc lookup for each value
  await Promise.all(targetValues.map(async (val) => {
    try {
      const doc = await db.collection(collName).doc(val).get();
      if (doc.exists) {
        matchedDocs.set(doc.id, doc.data());
      }
    } catch { }
  }));

  // 2. Query fields where value in targetValues (Firestore 'in' supports up to 30 elements)
  const chunks: string[][] = [];
  for (let i = 0; i < targetValues.length; i += 30) {
    chunks.push(targetValues.slice(i, i + 30));
  }

  for (const field of fields) {
    await Promise.all(chunks.map(async (chunk) => {
      try {
        const snap = await db.collection(collName).where(field, "in", chunk).get();
        snap.docs.forEach(doc => {
          matchedDocs.set(doc.id, doc.data());
        });
      } catch {
        // Fallback to equality query if 'in' index is not ready
        await Promise.all(chunk.slice(0, 5).map(async (val) => {
          try {
            const snap = await db.collection(collName).where(field, "==", val).get();
            snap.docs.forEach(doc => {
              matchedDocs.set(doc.id, doc.data());
            });
          } catch { }
        }));
      }
    }));
  }

  return Array.from(matchedDocs.entries()).map(([docId, data]) => ({ docId, data }));
}

async function runDryRun() {
  const startTime = Date.now();
  console.log("======================================================================");
  console.log("⚡ HIGH-SPEED TARGETED SINGLE-USER CLEANUP DRY-RUN AUDIT (READ-ONLY)");
  console.log("======================================================================\n");

  if (!TARGET_USER) {
    console.error("❌ Target user is empty! Please specify an email or user ID.");
    process.exit(1);
  }

  console.log(`🎯 TARGET USER TO AUDIT: "${TARGET_USER}"\n`);

  // Build initial target aliases
  const targetAliases = generateUserAliases(TARGET_USER);

  // ============================================================================
  // Step 1: Discover & Map User Identity (Firestore & DynamoDB)
  // ============================================================================
  console.log("📡 Step 1: Resolving user identity and aliases...");

  // Check Firestore users directly by docId and email query
  const checkUserColls = ["users", "users_dev", "users_release", "roarProfiles", "Sportsfan360Profile", "userPreferences"];
  const matchedUserProfiles: any[] = [];

  for (const coll of checkUserColls) {
    const results = await queryFirestoreCollection(coll, ["email", "userId", "uid"], Array.from(targetAliases));
    for (const r of results) {
      matchedUserProfiles.push({ source: `Firestore [${coll}]`, id: r.docId, email: r.data.email, userId: r.data.userId });
      generateUserAliases(r.docId).forEach(a => targetAliases.add(a));
      if (r.data.email) generateUserAliases(r.data.email).forEach(a => targetAliases.add(a));
      if (r.data.userId) generateUserAliases(r.data.userId).forEach(a => targetAliases.add(a));
      if (r.data.uid) generateUserAliases(r.data.uid).forEach(a => targetAliases.add(a));
    }
  }

  // Check DynamoDB IdentityAndAccess directly using PK queries
  for (const env of ENVIRONMENTS) {
    const tableName = `IdentityAndAccess${env.suffix}`;
    const pksToQuery = [
      `USER#${TARGET_USER}`,
      `USER#${TARGET_USER.replace(/[^a-zA-Z0-9]/g, "_")}`,
      `PREF#USER#${TARGET_USER}`,
      `OTP#${TARGET_USER}`,
    ];

    for (const pk of pksToQuery) {
      const items = await queryDynamoByPk(tableName, "entityId", pk);
      for (const item of items) {
        matchedUserProfiles.push({ source: `DynamoDB [${tableName}]`, id: item.entityId, sk: item.sk, email: item.email, userId: item.userId });
        generateUserAliases(item.entityId).forEach(a => targetAliases.add(a));
        if (item.email) generateUserAliases(item.email).forEach(a => targetAliases.add(a));
        if (item.userId) generateUserAliases(item.userId).forEach(a => targetAliases.add(a));
      }
    }
  }

  console.log(`   ✅ Resolved Search Aliases (${targetAliases.size} keys generated):`);
  console.log(`      ${Array.from(targetAliases).slice(0, 8).join(', ')}...\n`);

  console.log("   📋 Discovered User Accounts:");
  if (matchedUserProfiles.length === 0) {
    console.log("      ⚠️ No existing profile found with this ID yet (will still search all tables for any orphan records).");
  } else {
    matchedUserProfiles.forEach(u => console.log(`      - ${u.source}: id="${u.id}", email="${u.email || ''}", userId="${u.userId || ''}"`));
  }

  // ============================================================================
  // Step 2: Audit DynamoDB Tables (3 Environments: prod, dev, release)
  // ============================================================================
  console.log("\n======================================================================");
  console.log("📊 Step 2: AUDITING AWS DYNAMODB TABLES (3 ENVIRONMENTS: prod, dev, release)");
  console.log("======================================================================\n");

  const targetAliasesList = Array.from(targetAliases);
  const dynamoFoundItems: { env: string; table: string; count: number; keys: any[] }[] = [];
  let totalDynamoMatched = 0;

  for (const env of ENVIRONMENTS) {
    console.log(`🔍 Auditing Environment: [${env.name.toUpperCase()}]`);

    // 1. IdentityAndAccess: Query all entityId PK variants
    const idTable = `IdentityAndAccess${env.suffix}`;
    const idKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      const items = await queryDynamoByPk(idTable, "entityId", alias);
      items.forEach(it => idKeys.set(`${it.entityId}###${it.sk}`, { entityId: it.entityId, sk: it.sk }));
    }
    if (idKeys.size > 0) {
      console.log(`   📦 ${idTable.padEnd(32)}: Found ${idKeys.size} item(s)`);
      dynamoFoundItems.push({ env: env.name, table: idTable, count: idKeys.size, keys: Array.from(idKeys.values()) });
      totalDynamoMatched += idKeys.size;
    }

    // 2. GamificationAndWallet: Query by userId PK
    const gamTable = `GamificationAndWallet${env.suffix}`;
    const gamKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      if (alias.startsWith("USER#") || alias.startsWith("PREF#") || alias.startsWith("OTP#")) continue;
      const items = await queryDynamoByPk(gamTable, "userId", alias);
      items.forEach(it => gamKeys.set(`${it.userId}###${it.sk}`, { userId: it.userId, sk: it.sk }));
    }
    if (gamKeys.size > 0) {
      console.log(`   📦 ${gamTable.padEnd(32)}: Found ${gamKeys.size} item(s)`);
      dynamoFoundItems.push({ env: env.name, table: gamTable, count: gamKeys.size, keys: Array.from(gamKeys.values()) });
      totalDynamoMatched += gamKeys.size;
    }

    // 3. sf360-notifications: Query by PK
    const notifTable = `sf360-notifications${env.suffix}`;
    const notifKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      const items = await queryDynamoByPk(notifTable, "PK", alias);
      items.forEach(it => notifKeys.set(`${it.PK}###${it.SK}`, { PK: it.PK, SK: it.SK }));
    }
    if (notifKeys.size > 0) {
      console.log(`   📦 ${notifTable.padEnd(32)}: Found ${notifKeys.size} item(s)`);
      dynamoFoundItems.push({ env: env.name, table: notifTable, count: notifKeys.size, keys: Array.from(notifKeys.values()) });
      totalDynamoMatched += notifKeys.size;
    }

    // 4. StoreAndCommerce: Query by entityId PK
    const storeTable = `StoreAndCommerce${env.suffix}`;
    const storeKeys = new Map<string, any>();
    for (const alias of targetAliasesList) {
      const items = await queryDynamoByPk(storeTable, "entityId", alias);
      items.forEach(it => storeKeys.set(`${it.entityId}###${it.sk}`, { entityId: it.entityId, sk: it.sk }));
    }
    if (storeKeys.size > 0) {
      console.log(`   📦 ${storeTable.padEnd(32)}: Found ${storeKeys.size} item(s)`);
      dynamoFoundItems.push({ env: env.name, table: storeTable, count: storeKeys.size, keys: Array.from(storeKeys.values()) });
      totalDynamoMatched += storeKeys.size;
    }

    // 5. userwaitinglist: Fast filtered scan on email
    const waitTable = `userwaitinglist${env.suffix}`;
    const waitItems = await scanDynamoFiltered(
      waitTable,
      "email = :em",
      { ":em": TARGET_USER },
      "id, email"
    );
    if (waitItems.length > 0) {
      console.log(`   📦 ${waitTable.padEnd(32)}: Found ${waitItems.length} item(s)`);
      dynamoFoundItems.push({ env: env.name, table: waitTable, count: waitItems.length, keys: waitItems.map(it => ({ id: it.id })) });
      totalDynamoMatched += waitItems.length;
    }
  }

  // ============================================================================
  // Step 3: Fast Parallel Query on Firestore Collections
  // ============================================================================
  console.log("\n======================================================================");
  console.log("🔥 Step 3: AUDITING FIRESTORE COLLECTIONS (TARGETED INDEXED QUERIES)");
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

  let totalFirestoreMatched = 0;

  // Run collection queries in parallel batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < firestoreCollectionsToCheck.length; i += BATCH_SIZE) {
    const chunk = firestoreCollectionsToCheck.slice(i, i + BATCH_SIZE);
    await Promise.all(chunk.map(async (coll) => {
      const results = await queryFirestoreCollection(coll.name, coll.fields, targetAliasesList);
      if (results.length > 0) {
        console.log(`   📂 ${coll.name.padEnd(25)}: Found ${results.length} record(s)`);
        totalFirestoreMatched += results.length;
      }
    }));
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);

  // ============================================================================
  // Summary Report
  // ============================================================================
  console.log("\n======================================================================");
  console.log("🏁 DRY RUN AUDIT SUMMARY REPORT");
  console.log("======================================================================");
  console.log(`🎯 Target User Audited                     : ${TARGET_USER}`);
  console.log(`🔑 Identity Aliases Resolved               : ${targetAliases.size}`);
  console.log(`📦 AWS DynamoDB Total Items Found          : ${totalDynamoMatched}`);
  ENVIRONMENTS.forEach(env => {
    const envMatched = dynamoFoundItems
      .filter(r => r.env === env.name)
      .reduce((sum, r) => sum + r.count, 0);
    console.log(`   - Environment [${env.name.toUpperCase()}]: ${envMatched} item(s)`);
  });
  console.log(`🔥 Firestore Total Records Found           : ${totalFirestoreMatched}`);
  console.log(`🚨 TOTAL RECORDS TIED TO USER ACROSS ALL DBs: ${totalDynamoMatched + totalFirestoreMatched}`);
  console.log(`⏱️ Audit Duration                          : ${durationSec} seconds`);
  console.log("----------------------------------------------------------------------");
  console.log("✅ STATUS: DRY RUN AUDIT COMPLETED. STRICTLY ZERO DATA MODIFIED OR DELETED.");
  console.log("======================================================================\n");
}

runDryRun().catch(err => {
  console.error("❌ Dry run audit failed:", err);
  process.exit(1);
});
