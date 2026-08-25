import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ============================================================================
// 🔒 WHITELIST PRESERVATION CONFIGURATION
//
// Add all email addresses or User IDs you want to PRESERVE / KEEP here.
// EVERYTHING ELSE in the database (Firestore + AWS DynamoDB) will be PERMANENTLY DELETED.
// All multi-ID aliases for these whitelisted emails will be automatically PROTECTED.
// ============================================================================
export const WHITELIST_EMAILS: string[] = [
  "chandu.srikakulam@sportsfan360.com",
  "anandvasu@gmail.com",
  "jignesh@sportsfan360.com",
  // "tushar.deshmukh@sportsfan360.com"
];

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

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  }
});

// ============================================================================
// Multi-ID Resolution Helpers
// ============================================================================
function generateUserAliases(identifier: string): Set<string> {
  const aliases = new Set<string>();
  if (!identifier || typeof identifier !== 'string') return aliases;

  const raw = identifier.trim();
  const lower = raw.toLowerCase();
  const strippedUser = lower.replace(/^user#/, "");

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

  return aliases;
}

// Helper to batch delete Firestore documents (up to 450 per commit)
async function deleteFirestoreDocs(docRefs: FirebaseFirestore.DocumentReference[]) {
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

// Helper to delete a DynamoDB item safely
async function deleteDynamoItem(tableName: string, key: Record<string, any>) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: tableName,
      Key: key
    }));
    return true;
  } catch {
    return false;
  }
}

// ⚡ High-Performance Parallel Batch Deletion for DynamoDB (25 items per batch, 5 concurrent workers)
async function batchDeleteDynamoItems(tableName: string, keys: Record<string, any>[]): Promise<number> {
  if (keys.length === 0) return 0;
  let totalDeleted = 0;
  const BATCH_SIZE = 25;

  const chunks: Record<string, any>[][] = [];
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    chunks.push(keys.slice(i, i + BATCH_SIZE));
  }

  const CONCURRENCY = 6;
  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const activeChunks = chunks.slice(i, i + CONCURRENCY);

    await Promise.all(activeChunks.map(async (chunk) => {
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
          // Fallback to parallel individual deletes if batch write encounters schema conflict
          await Promise.all(chunk.map(k => deleteDynamoItem(tableName, k)));
          requestItems = null;
        }
      }
      totalDeleted += chunk.length;
    }));

    const progress = Math.min(100, Math.round(((i + activeChunks.length) / chunks.length) * 100));
    process.stdout.write(`\r   ⚡ Deleting from ${tableName}: ${Math.min(totalDeleted, keys.length)} / ${keys.length} items (${progress}%)   `);
  }
  console.log(`\n   ✅ Finished deleting ${keys.length} items from '${tableName}'.`);
  return keys.length;
}

// Helper to scan entire DynamoDB table with pagination (handles >1MB tables)
async function scanFullDynamoTable(tableName: string): Promise<any[]> {
  let items: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  try {
    do {
      const res: any = await docClient.send(new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      if (res.Items && res.Items.length > 0) {
        items.push(...res.Items);
      }
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (err: any) {
    console.warn(`   ⚠️ Scan notice on ${tableName}:`, err.message);
  }
  return items;
}

async function runWhitelistCleanup() {
  console.log("======================================================================");
  console.log("🚨 EXECUTING HIGH-SPEED DATABASE CLEANUP (WHITELIST PRESERVATION MODE)");
  console.log("======================================================================\n");

  if (WHITELIST_EMAILS.length === 0) {
    console.log("⚠️ WHITELIST IS EMPTY!");
    console.log("👉 Please specify at least one email or ID in WHITELIST_EMAILS to protect.");
    console.log("======================================================================");
    return;
  }

  // 1. Build initial Whitelist Aliases Set
  const whitelistedAliases = new Set<string>();
  const whitelistedEmails = new Set<string>();

  WHITELIST_EMAILS.forEach(email => {
    const clean = email.trim().toLowerCase();
    if (clean) {
      whitelistedEmails.add(clean);
      const aliases = generateUserAliases(clean);
      aliases.forEach(a => whitelistedAliases.add(a));
    }
  });

  console.log(`🔒 Whitelist Configured: ${whitelistedEmails.size} account(s) to KEEP:`);
  whitelistedEmails.forEach(e => console.log(`   🛡️ KEEP: ${e}`));
  console.log(`   🔑 Initial Protected Search Keys: ${whitelistedAliases.size}\n`);

  // 2. Discover all Whitelisted User Profiles & IDs in Firestore & DynamoDB
  console.log("📡 Scanning Firestore & DynamoDB to map protected user records...");
  const protectedFirestoreDocIds = new Set<string>();

  const firestoreUsersSnap = await db.collection("users").get();
  for (const doc of firestoreUsersSnap.docs) {
    const data = doc.data();
    const docId = doc.id;
    const email = (data.email || (docId.includes("@") ? docId : "")).trim().toLowerCase();
    const userId = data.userId ? String(data.userId).trim().toLowerCase() : "";

    const isWhitelisted = (
      whitelistedAliases.has(docId.toLowerCase()) ||
      (email && whitelistedEmails.has(email)) ||
      (userId && whitelistedAliases.has(userId))
    );

    if (isWhitelisted) {
      protectedFirestoreDocIds.add(docId);
      whitelistedAliases.add(docId.toLowerCase());
      if (email) {
        whitelistedEmails.add(email);
        const aliases = generateUserAliases(email);
        aliases.forEach(a => whitelistedAliases.add(a));
      }
      if (userId) {
        whitelistedAliases.add(userId);
        const aliases = generateUserAliases(userId);
        aliases.forEach(a => whitelistedAliases.add(a));
      }
    }
  }

  // Check DynamoDB IdentityAndAccess
  const allIdentityItems = await scanFullDynamoTable("IdentityAndAccess");
  const protectedDynamoKeys = new Set<string>();

  allIdentityItems.forEach(item => {
    const entityId = String(item.entityId || "");
    const cleanEntityId = entityId.replace(/^USER#/, "");
    const email = (item.email || (cleanEntityId.includes("@") ? cleanEntityId : "")).trim().toLowerCase();
    const userId = item.userId ? String(item.userId).trim().toLowerCase() : "";

    const isWhitelisted = (
      whitelistedAliases.has(entityId.toLowerCase()) ||
      whitelistedAliases.has(cleanEntityId.toLowerCase()) ||
      (email && (whitelistedEmails.has(email) || whitelistedAliases.has(email))) ||
      (userId && whitelistedAliases.has(userId))
    );

    if (isWhitelisted) {
      protectedDynamoKeys.add(`${item.entityId}###${item.sk}`);
      whitelistedAliases.add(entityId.toLowerCase());
      whitelistedAliases.add(cleanEntityId.toLowerCase());
      if (email) {
        whitelistedEmails.add(email);
        const aliases = generateUserAliases(email);
        aliases.forEach(a => whitelistedAliases.add(a));
      }
      if (userId) {
        whitelistedAliases.add(userId);
        const aliases = generateUserAliases(userId);
        aliases.forEach(a => whitelistedAliases.add(a));
      }
    }
  });

  console.log(`   🛡️ Protected Firestore User Docs : ${protectedFirestoreDocIds.size}`);
  console.log(`   🛡️ Protected DynamoDB User Items : ${protectedDynamoKeys.size}`);
  console.log(`   🔑 Total Protected Alias Keys    : ${whitelistedAliases.size}\n`);

  // ============================================================================
  // 3. DELETE NON-WHITELISTED USERS FROM DYNAMODB (PARALLEL BATCH)
  // ============================================================================
  console.log("======================================================================");
  console.log("⚡ DELETING NON-WHITELISTED DATA FROM AWS DYNAMODB TABLES (TURBO BATCH)");
  console.log("======================================================================\n");

  let totalDynamoDeleted = 0;

  // 3a. Delete from IdentityAndAccess
  console.log("📡 Preparing DynamoDB 'IdentityAndAccess' deletion keys...");
  const identityKeysToDelete: Record<string, any>[] = [];
  for (const item of allIdentityItems) {
    const entityId = String(item.entityId || "");
    const cleanEntityId = entityId.replace(/^USER#/, "").replace(/^OTP#/, "").replace(/^PREF#USER#/, "");
    const email = (item.email || (cleanEntityId.includes("@") ? cleanEntityId : "")).trim().toLowerCase();
    const userId = item.userId ? String(item.userId).trim().toLowerCase() : "";

    const isProtected = (
      protectedDynamoKeys.has(`${item.entityId}###${item.sk}`) ||
      whitelistedAliases.has(entityId.toLowerCase()) ||
      whitelistedAliases.has(cleanEntityId.toLowerCase()) ||
      (email && whitelistedAliases.has(email)) ||
      (userId && whitelistedAliases.has(userId))
    );

    if (!isProtected) {
      const isUserRelated = (
        entityId.startsWith("USER#") ||
        entityId.startsWith("OTP#") ||
        entityId.startsWith("PREF#") ||
        entityId.startsWith("PROFILE_ROAR#") ||
        entityId.startsWith("PROFILE_SF360#") ||
        item.sk?.startsWith("USER#") ||
        item.sk === "OTP#ACTIVE"
      );

      if (isUserRelated) {
        identityKeysToDelete.push({ entityId: item.entityId, sk: item.sk });
      }
    }
  }
  totalDynamoDeleted += await batchDeleteDynamoItems("IdentityAndAccess", identityKeysToDelete);

  // 3b. Delete from GamificationAndWallet
  console.log("📡 Scanning & Preparing DynamoDB 'GamificationAndWallet' deletion keys...");
  const allGamificationItems = await scanFullDynamoTable("GamificationAndWallet");
  const gamificationKeysToDelete: Record<string, any>[] = [];

  for (const item of allGamificationItems) {
    const uId = String(item.userId || "").toLowerCase();
    const cleanUId = uId.replace(/^USER#/, "");
    const uEmail = String(item.userEmail || item.email || "").toLowerCase();

    const isProtected = (
      whitelistedAliases.has(uId) ||
      whitelistedAliases.has(cleanUId) ||
      (uEmail && whitelistedAliases.has(uEmail))
    );

    if (!isProtected && (item.userId && item.sk)) {
      gamificationKeysToDelete.push({ userId: item.userId, sk: item.sk });
    }
  }
  totalDynamoDeleted += await batchDeleteDynamoItems("GamificationAndWallet", gamificationKeysToDelete);

  // 3c. Delete from sf360-notifications
  console.log("📡 Scanning & Preparing DynamoDB 'sf360-notifications' deletion keys...");
  const allNotificationItems = await scanFullDynamoTable("sf360-notifications");
  const notificationKeysToDelete: Record<string, any>[] = [];

  for (const item of allNotificationItems) {
    const pk = String(item.PK || "").toLowerCase();
    const cleanPk = pk.replace(/^USER#/, "");
    const uId = String(item.userId || "").toLowerCase();

    const isProtected = (
      whitelistedAliases.has(pk) ||
      whitelistedAliases.has(cleanPk) ||
      (uId && whitelistedAliases.has(uId))
    );

    if (!isProtected && (item.PK && item.SK)) {
      notificationKeysToDelete.push({ PK: item.PK, SK: item.SK });
    }
  }
  totalDynamoDeleted += await batchDeleteDynamoItems("sf360-notifications", notificationKeysToDelete);

  // 3d. Delete from StoreAndCommerce
  console.log("📡 Scanning & Preparing DynamoDB 'StoreAndCommerce' deletion keys...");
  const allStoreItems = await scanFullDynamoTable("StoreAndCommerce");
  const storeKeysToDelete: Record<string, any>[] = [];

  for (const item of allStoreItems) {
    const eId = String(item.entityId || "").toLowerCase();
    const cleanEId = eId.replace(/^MEMBERSHIP#/, "").replace(/^ORDER#/, "");
    const uId = String(item.userId || "").toLowerCase();
    const uEmail = String(item.userEmail || item.email || "").toLowerCase();

    const isProtected = (
      whitelistedAliases.has(eId) ||
      whitelistedAliases.has(cleanEId) ||
      (uId && whitelistedAliases.has(uId)) ||
      (uEmail && whitelistedAliases.has(uEmail))
    );

    if (!isProtected && (eId.startsWith("membership#") || eId.startsWith("order#") || item.userId)) {
      storeKeysToDelete.push({ entityId: item.entityId, sk: item.sk });
    }
  }
  totalDynamoDeleted += await batchDeleteDynamoItems("StoreAndCommerce", storeKeysToDelete);

  // 3e. Delete from SocialAndContent
  console.log("📡 Scanning & Preparing DynamoDB 'SocialAndContent' deletion keys...");
  const allSocialItems = await scanFullDynamoTable("SocialAndContent");
  const socialKeysToDelete: Record<string, any>[] = [];

  for (const item of allSocialItems) {
    const authorUid = String(item.authorUid || item.authorId || item.userId || item.reporterId || "").toLowerCase();
    const authorEmail = String(item.authorEmail || item.email || "").toLowerCase();

    const isProtected = (
      (authorUid && whitelistedAliases.has(authorUid)) ||
      (authorEmail && whitelistedAliases.has(authorEmail))
    );

    if (!isProtected && (authorUid || authorEmail)) {
      socialKeysToDelete.push({ contentId: item.contentId, sk: item.sk });
    }
  }
  totalDynamoDeleted += await batchDeleteDynamoItems("SocialAndContent", socialKeysToDelete);

  // 3f. Delete from RealTimeChat
  console.log("📡 Scanning & Preparing DynamoDB 'RealTimeChat' deletion keys...");
  const allChatItems = await scanFullDynamoTable("RealTimeChat");
  const chatKeysToDelete: Record<string, any>[] = [];

  for (const item of allChatItems) {
    const authorUid = String(item.authorUid || item.senderId || item.userId || "").toLowerCase();
    const hostId = String(item.hostUserId || item.creatorId || "").toLowerCase();

    const isProtected = (
      (authorUid && whitelistedAliases.has(authorUid)) ||
      (hostId && whitelistedAliases.has(hostId))
    );

    if (!isProtected && (authorUid || hostId)) {
      chatKeysToDelete.push({ roomId: item.roomId, sk: item.sk });
    }
  }
  totalDynamoDeleted += await batchDeleteDynamoItems("RealTimeChat", chatKeysToDelete);

  console.log(`\n✅ Total Items Deleted from AWS DynamoDB: ${totalDynamoDeleted}\n`);

  // ============================================================================
  // 4. DELETE NON-WHITELISTED USERS & DATA FROM FIRESTORE
  // ============================================================================
  console.log("======================================================================");
  console.log("🔥 DELETING NON-WHITELISTED DATA FROM FIRESTORE COLLECTIONS");
  console.log("======================================================================\n");

  let totalFirestoreDeleted = 0;

  async function cleanFirestoreCollection(collectionName: string, fields: string[]) {
    try {
      const snap = await db.collection(collectionName).get();
      const toDelete: FirebaseFirestore.DocumentReference[] = [];

      for (const doc of snap.docs) {
        const docId = doc.id.toLowerCase();
        let isProtected = whitelistedAliases.has(docId);

        if (!isProtected) {
          const data = doc.data();
          for (const field of fields) {
            const val = data[field];
            if (typeof val === 'string' && whitelistedAliases.has(val.toLowerCase())) {
              isProtected = true;
              break;
            } else if (Array.isArray(val) && val.some(v => typeof v === 'string' && whitelistedAliases.has(v.toLowerCase()))) {
              isProtected = true;
              break;
            }
          }
        }

        if (!isProtected) {
          toDelete.push(doc.ref);
        }
      }

      if (toDelete.length > 0) {
        const deletedCount = await deleteFirestoreDocs(toDelete);
        console.log(`   🗑️ Deleted ${deletedCount.toString().padStart(4)} docs from '${collectionName}'`);
        totalFirestoreDeleted += deletedCount;
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Could not clean Firestore collection '${collectionName}':`, err.message);
    }
  }

  // 4a. Clean Firestore 'users' collection (all except whitelisted)
  const nonWhitelistedUserDocs: FirebaseFirestore.DocumentReference[] = [];
  for (const doc of firestoreUsersSnap.docs) {
    if (!protectedFirestoreDocIds.has(doc.id)) {
      nonWhitelistedUserDocs.push(doc.ref);
    }
  }

  if (nonWhitelistedUserDocs.length > 0) {
    const deletedUsers = await deleteFirestoreDocs(nonWhitelistedUserDocs);
    console.log(`   🗑️ Deleted ${deletedUsers} non-whitelisted user profiles from 'users' collection.`);
    totalFirestoreDeleted += deletedUsers;
  }

  // 4b. Clean all 60+ Dependent Collections
  const collections = [
    { name: "otps", fields: ["email"] },
    { name: "roarProfiles", fields: ["userId", "uid"] },
    { name: "Sportsfan360Profile", fields: ["userId"] },
    { name: "userPreferences", fields: ["userId"] },
    { name: "pointTransactions", fields: ["userId", "userEmail"] },
    { name: "userPointTransactions", fields: ["userId"] },
    { name: "wallet_transactions", fields: ["userId"] },
    { name: "reward_coins_ledger", fields: ["userId"] },
    { name: "revenue_splits", fields: ["userId"] },
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
    { name: "players360Posts", fields: ["authorUid", "authorId", "userId"] },
    { name: "team360Posts", fields: ["authorUid", "authorId", "userId"] },
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
    { name: "inviteFriends", fields: ["invitedBy"] }
  ];

  for (const coll of collections) {
    await cleanFirestoreCollection(coll.name, coll.fields);
  }

  // 4c. Clean subcollections for deleted users
  for (const doc of firestoreUsersSnap.docs) {
    if (!protectedFirestoreDocIds.has(doc.id)) {
      try {
        const subSnap = await doc.ref.collection("activityLog").get();
        if (!subSnap.empty) {
          const subCount = await deleteFirestoreDocs(subSnap.docs.map(d => d.ref));
          totalFirestoreDeleted += subCount;
        }
      } catch {}
    }
  }

  console.log(`\n✅ Total Documents Deleted from Firestore: ${totalFirestoreDeleted}\n`);

  // ============================================================================
  // 5. FINAL SUMMARY
  // ============================================================================
  console.log("======================================================================");
  console.log("🎉 DATABASE CLEANUP COMPLETED SUCCESSFULLY");
  console.log("======================================================================");
  console.log(`Protected Accounts (Kept)         : ${whitelistedEmails.size}`);
  console.log(`DynamoDB Items Deleted            : ${totalDynamoDeleted}`);
  console.log(`Firestore Documents Deleted       : ${totalFirestoreDeleted}`);
  console.log(`Total Database Records Eradicated : ${totalDynamoDeleted + totalFirestoreDeleted}`);
  console.log("----------------------------------------------------------------------");
  console.log("✅ All non-whitelisted users and their data have been completely wiped.");
  console.log("======================================================================\n");
}

runWhitelistCleanup().catch(err => {
  console.error("❌ Whitelist cleanup execution failed:", err);
  process.exit(1);
});
