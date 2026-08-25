import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ============================================================================
// ⚠️ TARGET USERS TO DELETE PERMANENTLY (FIRESTORE + AWS DYNAMODB)
// ============================================================================
export const TARGET_USERS_TO_DELETE: string[] = [
  "srikakulamchandu@gmail.com"
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

// Helper to batch delete Firestore documents (up to 400 per commit)
async function deleteFirestoreDocs(docRefs: FirebaseFirestore.DocumentReference[]) {
  if (docRefs.length === 0) return 0;
  let count = 0;
  const chunkSize = 400;

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
  } catch (err: any) {
    console.warn(`   ⚠️ Failed to delete item from ${tableName}:`, err.message);
    return false;
  }
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
    console.warn(`   ⚠️ Scan error on ${tableName}:`, err.message);
  }
  return items;
}

async function runPermanentCleanup() {
  console.log("======================================================================");
  console.log("🚨 STARTING COMPLETE DYNAMODB & FIRESTORE USER CLEANUP");
  console.log("======================================================================\n");

  if (TARGET_USERS_TO_DELETE.length === 0) {
    console.log("⚠️ TARGET LIST IS EMPTY. Nothing to delete.");
    return;
  }

  // 1. Build initial target aliases set
  const allTargetAliases = new Set<string>();
  const targetEmails = new Set<string>();

  TARGET_USERS_TO_DELETE.forEach(t => {
    const clean = t.trim().toLowerCase();
    if (clean.includes("@")) {
      targetEmails.add(clean);
    }
    const aliases = generateUserAliases(t);
    aliases.forEach(a => allTargetAliases.add(a));
  });

  console.log(`📋 Target Users Configured: ${TARGET_USERS_TO_DELETE.length}`);
  TARGET_USERS_TO_DELETE.forEach(t => console.log(`   🎯 ${t}`));
  console.log(`   🔑 Initial Search Aliases: ${allTargetAliases.size}\n`);

  // 2. Discover all matching document IDs from Firestore
  console.log("📡 Resolving users from Firestore...");
  const targetResolvedAliases = new Set<string>(allTargetAliases);
  const matchedUsersDocIds: string[] = [];

  const firestoreUsersSnap = await db.collection("users").get();
  for (const doc of firestoreUsersSnap.docs) {
    const data = doc.data();
    const docId = doc.id;
    const email = (data.email || (docId.includes("@") ? docId : "")).trim().toLowerCase();
    const userId = data.userId ? String(data.userId).trim() : "";

    const isMatch = (
      allTargetAliases.has(docId.toLowerCase()) ||
      (email && allTargetAliases.has(email)) ||
      (userId && allTargetAliases.has(userId.toLowerCase()))
    );

    if (isMatch) {
      matchedUsersDocIds.push(docId);
      if (email) targetEmails.add(email);
      const userAliases = generateUserAliases(email || docId);
      if (userId) userAliases.add(userId.toLowerCase());
      userAliases.add(docId.toLowerCase());
      userAliases.forEach(a => targetResolvedAliases.add(a));
    }
  }

  // 3. Query DynamoDB IdentityAndAccess using email-index for EVERY target email
  console.log("📡 Querying DynamoDB 'IdentityAndAccess' via email-index...");
  const dynamoIdentityKeysToDelete: { entityId: string; sk: string; email?: string }[] = [];

  for (const email of targetEmails) {
    try {
      const gRes = await docClient.send(new QueryCommand({
        TableName: "IdentityAndAccess",
        IndexName: "email-index",
        KeyConditionExpression: "email = :email",
        ExpressionAttributeValues: {
          ":email": email
        }
      }));

      (gRes.Items || []).forEach(item => {
        dynamoIdentityKeysToDelete.push({ entityId: item.entityId, sk: item.sk, email: item.email });
        targetResolvedAliases.add(item.entityId);
        targetResolvedAliases.add(item.entityId.toLowerCase());
        targetResolvedAliases.add(item.entityId.replace(/^USER#/, "").toLowerCase());
        if (item.userId) targetResolvedAliases.add(String(item.userId).toLowerCase());
      });
    } catch (gErr: any) {
      console.warn(`   ⚠️ email-index query notice for ${email}:`, gErr.message);
    }
  }

  // Also do full paginated scan on IdentityAndAccess to catch non-indexed items
  console.log("📡 Scanning full DynamoDB 'IdentityAndAccess' table...");
  const fullIdentityItems = await scanFullDynamoTable("IdentityAndAccess");
  fullIdentityItems.forEach(item => {
    const entityId = String(item.entityId || "");
    const cleanEntityId = entityId.replace(/^USER#/, "");
    const email = (item.email || (cleanEntityId.includes("@") ? cleanEntityId : "")).trim().toLowerCase();
    const userId = item.userId ? String(item.userId).trim() : "";

    const isMatch = (
      targetResolvedAliases.has(entityId) ||
      targetResolvedAliases.has(entityId.toLowerCase()) ||
      targetResolvedAliases.has(cleanEntityId.toLowerCase()) ||
      (email && (targetEmails.has(email) || targetResolvedAliases.has(email))) ||
      (userId && targetResolvedAliases.has(userId.toLowerCase()))
    );

    if (isMatch) {
      const alreadyInList = dynamoIdentityKeysToDelete.some(k => k.entityId === item.entityId && k.sk === item.sk);
      if (!alreadyInList) {
        dynamoIdentityKeysToDelete.push({ entityId: item.entityId, sk: item.sk, email: item.email });
      }
      targetResolvedAliases.add(entityId);
      targetResolvedAliases.add(entityId.toLowerCase());
      targetResolvedAliases.add(cleanEntityId.toLowerCase());
      if (email) targetEmails.add(email);
      if (userId) targetResolvedAliases.add(userId.toLowerCase());
    }
  });

  console.log(`   ✅ Matched ${dynamoIdentityKeysToDelete.length} item(s) in DynamoDB IdentityAndAccess:`);
  dynamoIdentityKeysToDelete.forEach((k, i) => {
    console.log(`      ${i + 1}. entityId: [${k.entityId}] | sk: [${k.sk}] | email: [${k.email || 'N/A'}]`);
  });
  console.log(`   🔑 Total Unified Alias Keys to Clean: ${targetResolvedAliases.size}\n`);

  // ============================================================================
  // 4. DELETE FROM AWS DYNAMODB TABLES
  // ============================================================================
  console.log("======================================================================");
  console.log("⚡ DELETING DATA FROM AWS DYNAMODB TABLES");
  console.log("======================================================================\n");

  let totalDynamoDeleted = 0;

  // 4a. Delete matched items from IdentityAndAccess
  console.log("📡 Deleting matched items from DynamoDB 'IdentityAndAccess'...");
  for (const k of dynamoIdentityKeysToDelete) {
    const ok = await deleteDynamoItem("IdentityAndAccess", { entityId: k.entityId, sk: k.sk });
    if (ok) {
      console.log(`   🗑️ Deleted IdentityAndAccess key: entityId=[${k.entityId}], sk=[${k.sk}]`);
      totalDynamoDeleted++;
    }
  }

  // 4b. Delete from GamificationAndWallet (Partition Key: userId, Sort Key: sk)
  console.log("📡 Scanning & Deleting from DynamoDB 'GamificationAndWallet'...");
  const fullGamificationItems = await scanFullDynamoTable("GamificationAndWallet");
  for (const item of fullGamificationItems) {
    const uId = String(item.userId || "");
    const cleanUId = uId.replace(/^USER#/, "");
    const uEmail = String(item.userEmail || item.email || "").toLowerCase();

    const isMatch = (
      targetResolvedAliases.has(uId) ||
      targetResolvedAliases.has(uId.toLowerCase()) ||
      targetResolvedAliases.has(cleanUId.toLowerCase()) ||
      (uEmail && targetEmails.has(uEmail))
    );

    if (isMatch) {
      const ok = await deleteDynamoItem("GamificationAndWallet", { userId: item.userId, sk: item.sk });
      if (ok) {
        console.log(`   🗑️ Deleted GamificationAndWallet item: userId=[${item.userId}], sk=[${item.sk}]`);
        totalDynamoDeleted++;
      }
    }
  }

  // 4c. Delete from sf360-notifications (Partition Key: PK, Sort Key: SK)
  console.log("📡 Scanning & Deleting from DynamoDB 'sf360-notifications'...");
  const fullNotificationItems = await scanFullDynamoTable("sf360-notifications");
  for (const item of fullNotificationItems) {
    const pk = String(item.PK || "");
    const cleanPk = pk.replace(/^USER#/, "");
    const uId = String(item.userId || "").toLowerCase();

    const isMatch = (
      targetResolvedAliases.has(pk) ||
      targetResolvedAliases.has(pk.toLowerCase()) ||
      targetResolvedAliases.has(cleanPk.toLowerCase()) ||
      (uId && targetResolvedAliases.has(uId))
    );

    if (isMatch) {
      const ok = await deleteDynamoItem("sf360-notifications", { PK: item.PK, SK: item.SK });
      if (ok) {
        console.log(`   🗑️ Deleted sf360-notifications item: PK=[${item.PK}], SK=[${item.SK}]`);
        totalDynamoDeleted++;
      }
    }
  }

  // 4d. Delete from StoreAndCommerce (Partition Key: entityId, Sort Key: sk)
  console.log("📡 Scanning & Deleting from DynamoDB 'StoreAndCommerce'...");
  const fullStoreItems = await scanFullDynamoTable("StoreAndCommerce");
  for (const item of fullStoreItems) {
    const eId = String(item.entityId || "");
    const cleanEId = eId.replace(/^MEMBERSHIP#/, "").replace(/^ORDER#/, "");
    const uId = String(item.userId || "").toLowerCase();
    const uEmail = String(item.userEmail || item.email || "").toLowerCase();

    const isMatch = (
      targetResolvedAliases.has(eId) ||
      targetResolvedAliases.has(cleanEId.toLowerCase()) ||
      (uId && targetResolvedAliases.has(uId)) ||
      (uEmail && targetEmails.has(uEmail))
    );

    if (isMatch) {
      const ok = await deleteDynamoItem("StoreAndCommerce", { entityId: item.entityId, sk: item.sk });
      if (ok) {
        console.log(`   🗑️ Deleted StoreAndCommerce item: entityId=[${item.entityId}], sk=[${item.sk}]`);
        totalDynamoDeleted++;
      }
    }
  }

  // 4e. Delete from SocialAndContent (Partition Key: contentId, Sort Key: sk)
  console.log("📡 Scanning & Deleting from DynamoDB 'SocialAndContent'...");
  const fullSocialItems = await scanFullDynamoTable("SocialAndContent");
  for (const item of fullSocialItems) {
    const authorUid = String(item.authorUid || item.authorId || item.userId || item.reporterId || "").toLowerCase();
    const authorEmail = String(item.authorEmail || item.email || "").toLowerCase();
    const contentId = String(item.contentId || "");

    const isMatch = (
      (authorUid && targetResolvedAliases.has(authorUid)) ||
      (authorEmail && targetEmails.has(authorEmail)) ||
      (contentId && targetResolvedAliases.has(contentId.toLowerCase()))
    );

    if (isMatch) {
      const ok = await deleteDynamoItem("SocialAndContent", { contentId: item.contentId, sk: item.sk });
      if (ok) {
        console.log(`   🗑️ Deleted SocialAndContent item: contentId=[${item.contentId}], sk=[${item.sk}]`);
        totalDynamoDeleted++;
      }
    }
  }

  // 4f. Delete from RealTimeChat (Partition Key: roomId, Sort Key: sk)
  console.log("📡 Scanning & Deleting from DynamoDB 'RealTimeChat'...");
  const fullChatItems = await scanFullDynamoTable("RealTimeChat");
  for (const item of fullChatItems) {
    const authorUid = String(item.authorUid || item.senderId || item.userId || "").toLowerCase();
    const hostId = String(item.hostUserId || item.creatorId || "").toLowerCase();

    const isMatch = (
      (authorUid && targetResolvedAliases.has(authorUid)) ||
      (hostId && targetResolvedAliases.has(hostId))
    );

    if (isMatch) {
      const ok = await deleteDynamoItem("RealTimeChat", { roomId: item.roomId, sk: item.sk });
      if (ok) {
        console.log(`   🗑️ Deleted RealTimeChat item: roomId=[${item.roomId}], sk=[${item.sk}]`);
        totalDynamoDeleted++;
      }
    }
  }

  console.log(`\n✅ DynamoDB Total Items Deleted: ${totalDynamoDeleted}\n`);

  // ============================================================================
  // 5. DELETE FROM FIRESTORE COLLECTIONS
  // ============================================================================
  console.log("======================================================================");
  console.log("🔥 DELETING DATA FROM FIRESTORE COLLECTIONS");
  console.log("======================================================================\n");

  let totalFirestoreDeleted = 0;

  async function cleanFirestoreCollection(collectionName: string, fields: string[]) {
    try {
      const snap = await db.collection(collectionName).get();
      const toDelete: FirebaseFirestore.DocumentReference[] = [];

      for (const doc of snap.docs) {
        let matched = targetResolvedAliases.has(doc.id.toLowerCase());
        if (!matched) {
          const data = doc.data();
          for (const field of fields) {
            const val = data[field];
            if (typeof val === 'string' && (targetResolvedAliases.has(val.toLowerCase()) || targetEmails.has(val.toLowerCase()))) {
              matched = true;
              break;
            } else if (Array.isArray(val) && val.some(v => typeof v === 'string' && (targetResolvedAliases.has(v.toLowerCase()) || targetEmails.has(v.toLowerCase())))) {
              matched = true;
              break;
            }
          }
        }

        if (matched) {
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

  const collections = [
    { name: "users", fields: ["email", "userId"] },
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

  // Also clean subcollections under users/{userId} (e.g. activityLog, videoProgress, audioProgress)
  for (const docId of matchedUsersDocIds) {
    try {
      const userRef = db.collection("users").doc(docId);
      const subActivitySnap = await userRef.collection("activityLog").get();
      if (!subActivitySnap.empty) {
        const subRefs = subActivitySnap.docs.map(d => d.ref);
        const delCount = await deleteFirestoreDocs(subRefs);
        console.log(`   🗑️ Deleted ${delCount} docs from subcollection 'users/${docId}/activityLog'`);
        totalFirestoreDeleted += delCount;
      }
    } catch {
      // Subcollection didn't exist or already cleaned
    }
  }

  console.log(`\n✅ Firestore Deletion Complete. Total Documents Deleted: ${totalFirestoreDeleted}\n`);

  // ============================================================================
  // 6. FINAL SUMMARY
  // ============================================================================
  console.log("======================================================================");
  console.log("🎉 PERMANENT CLEANUP PROCESS COMPLETED");
  console.log("======================================================================");
  console.log(`Target Accounts Cleaned         : ${TARGET_USERS_TO_DELETE.length}`);
  console.log(`DynamoDB Items Deleted          : ${totalDynamoDeleted}`);
  console.log(`Firestore Documents Deleted     : ${totalFirestoreDeleted}`);
  console.log(`Total Records Eradicated        : ${totalFirestoreDeleted + totalDynamoDeleted}`);
  console.log("----------------------------------------------------------------------");
  console.log("✅ All targeted user records and dependencies have been 100% removed.");
  console.log("======================================================================\n");
}

runPermanentCleanup().catch(err => {
  console.error("❌ Cleanup execution failed:", err);
  process.exit(1);
});
