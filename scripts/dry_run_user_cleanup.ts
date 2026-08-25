import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// ============================================================================
// 🎯 TARGET USERS TO DELETE (SPECIFY EMAILS OR USER IDs HERE)
//
// Add the email addresses or User IDs you want to DELETE.
// The script will automatically resolve all multi-ID aliases (e.g. raw email,
// sanitized underscore format, google_* format, and USER#* DynamoDB keys)
// for each targeted user, and audit all their dependent data.
// All other users will remain completely untouched.
// ============================================================================
export const TARGET_USERS_TO_DELETE: string[] = [
  // Examples — Paste your target emails or IDs to delete here:
  // "old_user@gmail.com",
  // "test_user_sportsfan360_com",
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

/**
 * Generates all known identity representations and aliases for a single email/ID:
 * 1. Raw lowercase input
 * 2. Sanitized underscore format (e.g. "john_doe_gmail_com")
 * 3. Dotted format (e.g. "john.doe.gmail.com")
 * 4. Google Auth ID pattern (e.g. "google_john_doe_gmail_com")
 * 5. DynamoDB entityId (e.g. "USER#john.doe@gmail.com", "USER#john_doe_gmail_com")
 */
function generateUserAliases(identifier: string): Set<string> {
  const aliases = new Set<string>();
  if (!identifier || typeof identifier !== 'string') return aliases;

  const raw = identifier.trim();
  const lower = raw.toLowerCase();
  const strippedUser = lower.replace(/^user#/, "");

  aliases.add(raw);
  aliases.add(lower);
  aliases.add(strippedUser);

  // Sanitized with underscores
  const sanitized = strippedUser.replace(/[^a-zA-Z0-9]/g, "_");
  aliases.add(sanitized);

  // Variation with @ and . replaced
  const underscore = strippedUser.replace(/@/g, "_").replace(/\./g, "_");
  aliases.add(underscore);

  // Dot format
  const dotted = strippedUser.replace(/@/g, ".");
  aliases.add(dotted);

  // DynamoDB prefixed versions
  aliases.add(`USER#${strippedUser}`);
  aliases.add(`USER#${lower}`);
  aliases.add(`USER#${sanitized}`);

  return aliases;
}

interface UserSummary {
  email: string;
  docIds: string[];
  userIds: string[];
  names: string[];
  totalXP: number;
  isTargetedForDeletion: boolean;
  aliases: Set<string>;
}

async function runDryRun() {
  console.log("======================================================================");
  console.log("🔍 TARGETED USER CLEANUP DRY-RUN SCAN (STRICTLY READ-ONLY)");
  console.log("======================================================================\n");

  if (TARGET_USERS_TO_DELETE.length === 0) {
    console.log("⚠️ TARGET LIST IS EMPTY!");
    console.log("👉 Please add the emails or User IDs to delete into the 'TARGET_USERS_TO_DELETE' array at the top of this script.\n");
    console.log("Example:");
    console.log('const TARGET_USERS_TO_DELETE: string[] = [');
    console.log('  "testuser@gmail.com",');
    console.log('  "duplicate_user@sportsfan360.com"');
    console.log('];\n');
    console.log("======================================================================");
    return;
  }

  // Build target aliases set
  const allTargetAliases = new Set<string>();
  TARGET_USERS_TO_DELETE.forEach(t => {
    const aliases = generateUserAliases(t);
    aliases.forEach(a => allTargetAliases.add(a));
  });

  console.log(`📋 Target Configuration: ${TARGET_USERS_TO_DELETE.length} user(s) explicitly targeted for deletion:`);
  TARGET_USERS_TO_DELETE.forEach(t => console.log(`   🎯 Target: ${t}`));
  console.log(`   🔑 Total Resolved Search Aliases: ${allTargetAliases.size}\n`);

  // 1. Scan Firestore Users
  console.log("📡 Scanning Firestore 'users' collection...");
  const firestoreUsersSnap = await db.collection("users").get();
  console.log(`   Found ${firestoreUsersSnap.docs.length} total documents in Firestore 'users'.\n`);

  // 2. Scan DynamoDB IdentityAndAccess for User entities
  console.log("📡 Scanning DynamoDB 'IdentityAndAccess' table for User entities...");
  let dynamoUsers: any[] = [];
  try {
    const dynamoScan = await docClient.send(new ScanCommand({
      TableName: "IdentityAndAccess",
      FilterExpression: "begins_with(entityId, :prefix) OR begins_with(sk, :skPrefix)",
      ExpressionAttributeValues: {
        ":prefix": "USER#",
        ":skPrefix": "USER#"
      }
    }));
    dynamoUsers = dynamoScan.Items || [];
    console.log(`   Found ${dynamoUsers.length} total user items in DynamoDB 'IdentityAndAccess'.\n`);
  } catch (err: any) {
    console.warn(`   ⚠️ DynamoDB scan notice: ${err.message}\n`);
  }

  // 3. Match Target Users and their Multi-IDs
  const matchedUsers: UserSummary[] = [];
  const targetResolvedAliases = new Set<string>(allTargetAliases);

  // Check Firestore docs
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
      const userAliases = generateUserAliases(email || docId);
      if (userId) userAliases.add(userId.toLowerCase());
      userAliases.add(docId.toLowerCase());
      userAliases.forEach(a => targetResolvedAliases.add(a));

      let existing = matchedUsers.find(u => u.email === (email || docId));
      if (!existing) {
        matchedUsers.push({
          email: email || docId,
          docIds: [docId],
          userIds: userId ? [userId] : [],
          names: data.name || data.firstName ? [`${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name] : [],
          totalXP: data.totalXP || data.totalPoints || 0,
          isTargetedForDeletion: true,
          aliases: userAliases
        });
      } else {
        if (!existing.docIds.includes(docId)) existing.docIds.push(docId);
        if (userId && !existing.userIds.includes(userId)) existing.userIds.push(userId);
        userAliases.forEach(a => existing!.aliases.add(a));
      }
    }
  }

  // Check DynamoDB items
  for (const item of dynamoUsers) {
    const entityId = String(item.entityId || "");
    const cleanEntityId = entityId.replace(/^USER#/, "");
    const email = (item.email || (cleanEntityId.includes("@") ? cleanEntityId : "")).trim().toLowerCase();
    const userId = item.userId ? String(item.userId).trim() : "";

    const isMatch = (
      allTargetAliases.has(entityId.toLowerCase()) ||
      allTargetAliases.has(cleanEntityId.toLowerCase()) ||
      (email && allTargetAliases.has(email)) ||
      (userId && allTargetAliases.has(userId.toLowerCase()))
    );

    if (isMatch) {
      const itemAliases = generateUserAliases(email || cleanEntityId);
      if (userId) itemAliases.add(userId.toLowerCase());
      itemAliases.add(cleanEntityId.toLowerCase());
      itemAliases.forEach(a => targetResolvedAliases.add(a));

      let existing = matchedUsers.find(u => u.email === (email || cleanEntityId));
      if (!existing) {
        matchedUsers.push({
          email: email || cleanEntityId,
          docIds: [cleanEntityId],
          userIds: userId ? [userId] : [],
          names: item.name || item.firstName ? [`${item.firstName || ''} ${item.lastName || ''}`.trim() || item.name] : [],
          totalXP: item.totalXP || item.totalPoints || 0,
          isTargetedForDeletion: true,
          aliases: itemAliases
        });
      } else {
        if (!existing.docIds.includes(cleanEntityId)) existing.docIds.push(cleanEntityId);
        if (userId && !existing.userIds.includes(userId)) existing.userIds.push(userId);
        itemAliases.forEach(a => existing!.aliases.add(a));
      }
    }
  }

  console.log("======================================================================");
  console.log("👥 MATCHED TARGET USERS & MULTI-ID VARIANTS FOUND");
  console.log("======================================================================");
  console.log(`Target Accounts Matched in Database : ${matchedUsers.length}`);
  console.log(`Total Resolved Match Keys/Aliases  : ${targetResolvedAliases.size}\n`);

  if (matchedUsers.length === 0) {
    console.log("⚠️ None of the target emails/IDs were found in the database.");
    console.log("Please double-check the spelling of the target IDs/emails.");
    return;
  }

  matchedUsers.forEach((u, i) => {
    const isMulti = u.docIds.length > 1 || u.userIds.length > 1;
    const tag = isMulti ? `⚠️ MULTI-ID (${u.docIds.length} docs)` : `Single ID`;
    console.log(`  ${i + 1}. 🗑️ [TARGET] ${u.email}`);
    console.log(`     Type    : ${tag}`);
    console.log(`     Doc IDs : [${u.docIds.join(', ')}]`);
    if (u.userIds.length > 0) console.log(`     User IDs: [${u.userIds.join(', ')}]`);
    console.log(`     Total XP: ${u.totalXP}`);
    console.log(`     Aliases : ${Array.from(u.aliases).slice(0, 6).join(', ')}...`);
    console.log("");
  });

  // ============================================================================
  // 4. Scan Dependent Collections & Tables (DRY RUN AUDIT)
  // ============================================================================
  console.log("======================================================================");
  console.log("📊 DEPENDENT DATA AUDIT FOR TARGET USERS ONLY");
  console.log("======================================================================\n");

  async function checkCollection(name: string, fields: string[]) {
    try {
      const snap = await db.collection(name).get();
      let matchCount = 0;
      for (const doc of snap.docs) {
        const data = doc.data();
        let matched = targetResolvedAliases.has(doc.id.toLowerCase());
        if (!matched) {
          for (const field of fields) {
            const val = data[field];
            if (typeof val === 'string' && targetResolvedAliases.has(val.toLowerCase())) {
              matched = true;
              break;
            } else if (Array.isArray(val) && val.some(v => typeof v === 'string' && targetResolvedAliases.has(v.toLowerCase()))) {
              matched = true;
              break;
            }
          }
        }
        if (matched) matchCount++;
      }
      return { total: snap.docs.length, matched: matchCount };
    } catch {
      return { total: 0, matched: 0 };
    }
  }

  const collectionsToCheck = [
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

  console.log("Analyzing dependent records specifically tied to target users...");
  let totalDependentRecords = 0;

  for (const coll of collectionsToCheck) {
    const res = await checkCollection(coll.name, coll.fields);
    if (res.matched > 0) {
      console.log(`   📦 ${coll.name.padEnd(25)} : ${res.matched.toString().padStart(4)} / ${res.total} records tied to target users`);
      totalDependentRecords += res.matched;
    }
  }

  console.log("\n======================================================================");
  console.log("🏁 DRY RUN AUDIT SUMMARY");
  console.log("======================================================================");
  console.log(`Target Accounts Found in 'users'           : ${matchedUsers.length}`);
  console.log(`Total Dependent Records Tied to Targets    : ${totalDependentRecords}`);
  console.log("----------------------------------------------------------------------");
  console.log("✅ STATUS: DRY RUN COMPLETED SUCCESSFULLY. NO DATA WAS MODIFIED OR DELETED.");
  console.log("======================================================================\n");
}

runDryRun().catch(err => {
  console.error("❌ Dry run failed:", err);
  process.exit(1);
});
