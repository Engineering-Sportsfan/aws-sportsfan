import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), ".env.local");
dotenv.config({ path: envPath });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// Event Identifiers from Admin Console
const TARGET_WATCHALONG_ID = "73e9b219-3481-4e72-8033-a5d1bb64fe41";
const TARGET_MATCH_ID = "5bdac51d-b21b-4e2a-ba0e-aa81857dbc32";
const TARGET_EVENT_TITLE = "Indian Athletics Final Series";

interface ActivityRecord {
  type: string;
  details?: string;
  roomOrMatch?: string;
  timestamp: number | null;
  timeFormatted: string | null;
}

interface DiscoveredUser {
  identifier: string;
  email: string | null;
  name?: string;
  username?: string;
  userId?: string;
  activities: ActivityRecord[];
  activityTypes: Set<string>;
  firstSeenAt?: number;
  lastSeenAt?: number;
  inProdDynamo: boolean;
  inDevDynamo: boolean;
  inFirestore: boolean;
  didNothingExceptJoin: boolean;
}

async function runAudit() {
  console.log("================================================================================");
  console.log("🔍 COMPREHENSIVE PARTICIPANT & MISSING USERS AUDIT (PROD & DEV)");
  console.log(`🏟️ Target Event: ${TARGET_EVENT_TITLE}`);
  console.log(`📌 WatchAlong ID: ${TARGET_WATCHALONG_ID}`);
  console.log(`🏏 Match ID:      ${TARGET_MATCH_ID}`);
  console.log("================================================================================\n");

  const userMap = new Map<string, DiscoveredUser>();

  function getOrCreateUser(rawEmail?: string, rawUsername?: string, rawUserId?: string, rawName?: string) {
    let email = (rawEmail || "").trim().toLowerCase();
    if (!email.includes("@")) email = "";

    if (!email && rawUserId && rawUserId.includes("_gmail_com")) {
      email = rawUserId.replace(/_gmail_com$/, "@gmail.com");
    }

    const username = (rawUsername || (email ? email.split("@")[0] : rawUserId || "User")).trim();
    const primaryKey = email || username.toLowerCase() || (rawUserId || "unknown").toLowerCase();

    let entry = userMap.get(primaryKey);
    if (!entry && email) entry = userMap.get(email);
    if (!entry && username) entry = userMap.get(username.toLowerCase());

    if (!entry) {
      entry = {
        identifier: primaryKey,
        email: email || null,
        name: rawName || username,
        username,
        userId: rawUserId || (email ? email.replace(/[^a-zA-Z0-9]/g, "_") : username),
        activities: [],
        activityTypes: new Set(),
        inProdDynamo: false,
        inDevDynamo: false,
        inFirestore: false,
        didNothingExceptJoin: false,
      };
      userMap.set(primaryKey, entry);
      if (email) userMap.set(email, entry);
      if (username) userMap.set(username.toLowerCase(), entry);
    } else {
      if (!entry.email && email) {
        entry.email = email;
        userMap.set(email, entry);
      }
      if (rawName && (!entry.name || entry.name.includes("@"))) {
        entry.name = rawName;
      }
      if (username && !entry.username) {
        entry.username = username;
      }
    }
    return entry;
  }

  function trackActivity(
    user: DiscoveredUser,
    type: string,
    details?: string,
    roomOrMatch?: string,
    timestamp?: number
  ) {
    const ts = timestamp ? Number(timestamp) : Date.now();
    const timeFormatted = ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : null;

    user.activities.push({
      type,
      details,
      roomOrMatch,
      timestamp: ts,
      timeFormatted,
    });
    user.activityTypes.add(type);

    if (ts) {
      if (!user.firstSeenAt || ts < user.firstSeenAt) user.firstSeenAt = ts;
      if (!user.lastSeenAt || ts > user.lastSeenAt) user.lastSeenAt = ts;
    }
  }

  // ── 1. Scan IdentityAndAccess (PROD) ───────────────────────────────────────
  console.log("📦 1. Scanning PROD Table [IdentityAndAccess] for Permanent Accounts...");
  const prodUsers = new Set<string>();
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :u) AND begins_with(sk, :sk)",
          ExpressionAttributeValues: { ":u": "USER#", ":sk": "USER#" },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const email = (item.email || item.entityId.replace(/^USER#/, "")).toLowerCase().trim();
        const username = item.username || email.split("@")[0];
        const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.name || username;

        if (email.includes("@")) {
          prodUsers.add(email);
          prodUsers.add(username.toLowerCase());
        }
        const user = getOrCreateUser(email, username, item.userId, name);
        user.inProdDynamo = true;
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    console.log(`   ✓ Found ${prodUsers.size} permanent users in PROD [IdentityAndAccess].`);
  } catch (err: any) {
    console.warn("   ⚠️ PROD IdentityAndAccess scan notice:", err?.message || err);
  }

  // ── 2. Scan IdentityAndAccess-dev (DEV) ─────────────────────────────────────
  console.log("📦 2. Scanning DEV Table [IdentityAndAccess-dev]...");
  const devUsers = new Set<string>();
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess-dev",
          FilterExpression: "begins_with(entityId, :u) AND begins_with(sk, :sk)",
          ExpressionAttributeValues: { ":u": "USER#", ":sk": "USER#" },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const email = (item.email || item.entityId.replace(/^USER#/, "")).toLowerCase().trim();
        const username = item.username || email.split("@")[0];
        const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.name || username;

        if (email.includes("@")) {
          devUsers.add(email);
          devUsers.add(username.toLowerCase());
        }
        const user = getOrCreateUser(email, username, item.userId, name);
        user.inDevDynamo = true;
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    console.log(`   ✓ Found ${devUsers.size} permanent users in DEV [IdentityAndAccess-dev].`);
  } catch (err: any) {
    console.warn("   ⚠️ DEV IdentityAndAccess-dev scan notice:", err?.message || err);
  }

  // ── 3. Scan Auth Issues Tracker (IdentityAndAccess) ────────────────────────
  console.log("⚠️ 3. Scanning Auth Issues Tracker [AUTH_ISSUE#] in PROD...");
  try {
    let lastKey: any = undefined;
    let authIssuesCount = 0;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :prefix)",
          ExpressionAttributeValues: { ":prefix": "AUTH_ISSUE#" },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const email = (item.email || "").toLowerCase().trim();
        authIssuesCount++;
        const user = getOrCreateUser(email);
        trackActivity(
          user,
          "Auth Issue Recorded",
          `Status: ${item.status || "pending"} | Reason: ${item.reason || "Error"} | Endpoint: ${item.endpoint || ""}`,
          undefined,
          item.timestamp
        );
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
    console.log(`   ✓ Found ${authIssuesCount} auth issues in PROD.`);
  } catch (err: any) {
    console.warn("   ⚠️ Auth issues scan notice:", err?.message || err);
  }

  // ── 4. Scan RealTimeChat (WatchAlong Chats, Roar Posts, Joins, Presence) ─────
  console.log("💬 4. Scanning RealTimeChat (WatchAlong, Roar, Joins, Presence)...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "RealTimeChat",
          FilterExpression: "begins_with(sk, :msg) OR begins_with(sk, :pres) OR begins_with(sk, :post) OR begins_with(sk, :join)",
          ExpressionAttributeValues: {
            ":msg": "MSG#",
            ":pres": "PRESENCE#",
            ":post": "POST#",
            ":join": "JOINED#",
          },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const roomId = item.roomId || "";
        const isTargetWatchAlong =
          roomId.includes(TARGET_WATCHALONG_ID) ||
          roomId.includes(TARGET_MATCH_ID) ||
          roomId.toLowerCase().includes("watchalong");

        const isWatchAlong = isTargetWatchAlong || roomId.toLowerCase().includes("watchalong");
        const sk = item.sk || "";

        const email = (item.authorEmail || item.userEmail || (item.user && item.user.includes("@") ? item.user : "")).toLowerCase().trim();
        const username = item.authorUsername || item.username || (item.user && !item.user.includes("@") ? item.user : "");
        const userId = item.authorUid || item.userId || item.uid;
        const timestamp = item.createdAt || item.lastSeenAt || item.joinedAt || item.firstJoinedAt || item.updatedAt;

        const user = getOrCreateUser(email, username, userId);

        if (sk.startsWith("PRESENCE#") || sk.startsWith("JOINED#")) {
          const label = isWatchAlong ? "Joined WatchAlong (Did Nothing)" : "Joined Roar (Did Nothing)";
          trackActivity(user, label, `Room: ${roomId}`, roomId, timestamp);
        } else if (isWatchAlong) {
          trackActivity(
            user,
            "Chatted in WatchAlong",
            item.text ? `"${item.text}"` : "WatchAlong chat",
            roomId,
            timestamp
          );
        } else {
          trackActivity(
            user,
            "Posted in Roar",
            item.text ? `"${item.text}"` : "Roar post",
            roomId,
            timestamp
          );
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("   ⚠️ RealTimeChat scan notice:", err?.message || err);
  }

  // ── 5. Scan GamificationAndWallet (Predictions & Quizzes) ───────────────────
  console.log("🎯 5. Scanning GamificationAndWallet (Predictions & Quizzes)...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "GamificationAndWallet",
          FilterExpression: "begins_with(sk, :pVote) OR begins_with(sk, :qAns)",
          ExpressionAttributeValues: {
            ":pVote": "PREDICTION_VOTE#",
            ":qAns": "QUIZ_ANSWER#",
          },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const rawUserId = item.userTargetId || item.userId || "";
        let email = "";
        let username = item.displayName || "";
        if (rawUserId.includes("@")) {
          email = rawUserId;
        } else if (rawUserId.includes("_gmail_com")) {
          email = rawUserId.replace(/_gmail_com$/, "@gmail.com");
        }

        const user = getOrCreateUser(email, username, rawUserId, item.displayName);
        const timestamp = item.votedAt || item.answeredAt || item.createdAt;
        const sk = item.sk || "";

        if (sk.startsWith("PREDICTION_VOTE#")) {
          trackActivity(
            user,
            "Voted in Predictions",
            `Option: "${item.option || "Voted"}" (Prediction: ${item.predictionId || "N/A"})`,
            item.userId || "WatchAlong Match",
            timestamp
          );
        } else if (sk.startsWith("QUIZ_ANSWER#")) {
          trackActivity(
            user,
            "Answered Quiz",
            `Answer: "${item.option || "Answered"}" (Correct: ${item.isCorrect ? "Yes" : "No"}, Points: ${item.points || 0})`,
            item.userId || "WatchAlong Match",
            timestamp
          );
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("   ⚠️ Gamification scan notice:", err?.message || err);
  }

  // ── 6. Collate and Display Results ──────────────────────────────────────────
  const uniqueParticipants = new Map<string, DiscoveredUser>();
  for (const user of userMap.values()) {
    if (user.email && prodUsers.has(user.email)) user.inProdDynamo = true;
    if (user.username && prodUsers.has(user.username.toLowerCase())) user.inProdDynamo = true;
    if (user.email && devUsers.has(user.email)) user.inDevDynamo = true;
    if (user.username && devUsers.has(user.username.toLowerCase())) user.inDevDynamo = true;

    const key = (user.email || user.username || user.userId || "").toLowerCase();
    if (key && !uniqueParticipants.has(key)) {
      const activeInteractions = user.activities.filter(
        (a) => a.type === "Chatted in WatchAlong" || a.type === "Voted in Predictions" || a.type === "Answered Quiz" || a.type === "Posted in Roar"
      );
      const hasJoined = user.activities.some((a) => a.type.startsWith("Joined"));
      user.didNothingExceptJoin = hasJoined && activeInteractions.length === 0;
      uniqueParticipants.set(key, user);
    }
  }

  const allParticipants = Array.from(uniqueParticipants.values()).filter(
    (u) => u.activities.length > 0
  );

  const missingFromProd = allParticipants.filter((u) => !u.inProdDynamo);
  const missingFromDev = allParticipants.filter((u) => !u.inDevDynamo);

  console.log("\n================================================================================");
  console.log("📊 AUDIT SUMMARY");
  console.log("================================================================================");
  console.log(`Total Participants with Activity:     ${allParticipants.length}`);
  console.log(`Chatted in WatchAlong:                ${allParticipants.filter((u) => u.activityTypes.has("Chatted in WatchAlong")).length}`);
  console.log(`Voted in Predictions:                 ${allParticipants.filter((u) => u.activityTypes.has("Voted in Predictions")).length}`);
  console.log(`Answered Quiz:                        ${allParticipants.filter((u) => u.activityTypes.has("Answered Quiz")).length}`);
  console.log(`Posted in Roar:                       ${allParticipants.filter((u) => u.activityTypes.has("Posted in Roar")).length}`);
  console.log(`Joined (Did Nothing):                 ${allParticipants.filter((u) => u.didNothingExceptJoin).length}`);
  console.log(`🚨 MISSING from PROD Database:        ${missingFromProd.length}`);
  console.log(`⚠️  Missing from DEV Database:         ${missingFromDev.length}`);
  console.log("================================================================================\n");

  if (missingFromProd.length > 0) {
    console.log("🚨 DETAILED LIST: USERS MISSING FROM PROD [IdentityAndAccess]:");
    console.log("--------------------------------------------------------------------------------");
    missingFromProd.forEach((u, i) => {
      console.log(`\n[${i + 1}] User: ${u.name || "Unknown"} (${u.email || "No email"} | @${u.username || "N/A"})`);
      console.log(`    PROD DB: ❌ MISSING  |  DEV DB: ${u.inDevDynamo ? "✓ Present" : "❌ Missing"}`);
      console.log(`    Joined & Did Nothing: ${u.didNothingExceptJoin ? "YES" : "No"}`);
      console.log(`    First Seen: ${u.firstSeenAt ? new Date(u.firstSeenAt).toLocaleString("en-IN") : "N/A"}`);
      console.log(`    Last Seen:  ${u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString("en-IN") : "N/A"}`);
      console.log("    Activities:");
      u.activities.forEach((act) => {
        console.log(`      • [${act.timeFormatted || "Time N/A"}] ${act.type}: ${act.details || ""}`);
      });
    });
  } else {
    console.log("🎉 No active participants are missing from the PROD database!");
  }

  // Save report to disk
  const outputPath = path.join(process.cwd(), "audit_event_participants_report.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        targetEvent: {
          title: TARGET_EVENT_TITLE,
          watchalongId: TARGET_WATCHALONG_ID,
          matchId: TARGET_MATCH_ID,
        },
        summary: {
          totalParticipants: allParticipants.length,
          missingFromProdCount: missingFromProd.length,
          missingFromDevCount: missingFromDev.length,
        },
        missingFromProd,
        allParticipants,
      },
      null,
      2
    )
  );
  console.log(`\n💾 Full JSON report saved to: ${outputPath}`);
}

runAudit().catch(console.error);
