// scripts/runFullTestSuite.js
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'server-only') return {};
  return originalRequire.apply(this, arguments);
};

const admin = require("firebase-admin");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

// Load Environment variables from .env.local
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Missing .env.local file. Run tests in the project directory.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
    env[match[1].trim()] = val;
  }
});

process.env.FIREBASE_PROJECT_ID = env.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = env.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = env.FIREBASE_PRIVATE_KEY;
process.env.JWT_SECRET = env.JWT_SECRET;

// Initialize Firebase
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    })
  });
}
const db = admin.firestore();
const BASE_URL = "http://127.0.0.1:3001";

async function executeTestSuite() {
  console.log("=== RUNNING REWARDS & REPUTATION ENGINE FULL GATEWAY TEST SUITE ===");

  // Find two test users in the database
  const usersSnap = await db.collection("users").limit(2).get();
  if (usersSnap.size < 2) {
    console.error("Ensure at least 2 users exist in Firestore to run tests.");
    process.exit(1);
  }

  const userA = usersSnap.docs[0];
  const userB = usersSnap.docs[1];
  const uidA = userA.id;
  const uidB = userB.id;

  console.log(`Test User A (Referred): ${uidA}`);
  console.log(`Test User B (Referrer): ${uidB}`);

  // Create temporary JWT for User A (Referred User) to authenticate request
  const token = jwt.sign({
    userId: uidA,
    email: "test_a@sportsfan360.com",
    name: "Test User A",
    role: "user"
  }, process.env.JWT_SECRET, { expiresIn: "10m" });

  const authHeaders = {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };

  // Reset User A and User B profile fields
  await db.collection("users").doc(uidA).set({
    name: "Test User A",
    email: "test_a@sportsfan360.com",
    totalXP: 0,
    totalPoints: 0,
    reputationScore: 0,
    currentLoginStreak: 0,
    loginStreakMultiplier: 1.0,
    streakFreezeCount: 0,
    dailyPointsEarned: 0,
    dailyLikeCount: 0,
    dailyActionsList: [],
    featureStats: {},
    featureLevels: {},
    globalTier: "Spark",
    subRank: "I",
    unlockedMilestones: [],
    referredBy: uidB,
    createdAt: Date.now(),
    lastActiveTimestamp: 0
  }, { merge: true });

  await db.collection("users").doc(uidB).set({
    name: "Test User B",
    email: "test_b@sportsfan360.com",
    totalXP: 0,
    totalPoints: 0,
    reputationScore: 0,
    lastActiveTimestamp: Date.now()
  }, { merge: true });

  // Reset global streak rules to 60s minimum
  await db.collection("multipliers").doc("streakSettings").set({
    minSessionSeconds: 60,
    updatedAt: Date.now()
  });

  // Test Case 1: Fetch profile for User A (Service 2 - Inquiry)
  console.log("\n[TC-S2] Verifying Profile Inquiry API...");
  const profRes = await axios.get(`${BASE_URL}/api/roar/profile?userId=${uidA}`, authHeaders);
  if (profRes.status === 200 && profRes.data.success) {
    console.log("  ✓ Profile Inquiry succeeded. Global Tier:", profRes.data.user.globalTier);
  } else {
    throw new Error("Profile Inquiry API failed");
  }

  // Test Case 2: Submit a login action with short session (Service 1 - Points Award)
  console.log("\n[TC-S1] Verifying Points Award API - Short Session block...");
  const tx1 = `test_gate_fail_${Date.now()}`;
  const awardFailRes = await axios.post(`${BASE_URL}/api/roar/award`, {
    userId: uidA,
    reason: "DAILY_LOGIN",
    transactionId: tx1,
    metadata: { sessionDurationSeconds: 15 } // Less than 60s
  }, authHeaders);
  if (awardFailRes.status === 200 && awardFailRes.data.success === false) {
    console.log("  ✓ Short Session blocked successfully (Points skipped).");
  } else {
    throw new Error("Short Session check failed to block points.");
  }

  // Test Case 3: Submit login action with valid session (Service 1 - Success)
  console.log("\n[TC-S1] Verifying Points Award API - Valid Session award...");
  const tx2 = `test_gate_pass_${Date.now()}`;
  const awardPassRes = await axios.post(`${BASE_URL}/api/roar/award`, {
    userId: uidA,
    reason: "DAILY_LOGIN",
    transactionId: tx2,
    metadata: { sessionDurationSeconds: 120 }
  }, authHeaders);
  if (awardPassRes.status === 200 && awardPassRes.data.success === true) {
    console.log("  ✓ Valid Session processed successfully (Points awarded).");
  } else {
    throw new Error("Valid Session failed to process.");
  }

  // Test Case 4: Verify points and streak updated on User A (Service 2)
  const profResUpdate = await axios.get(`${BASE_URL}/api/roar/profile?userId=${uidA}`, authHeaders);
  const updatedPoints = profResUpdate.data.user.totalPoints;
  const updatedStreak = profResUpdate.data.user.currentLoginStreak;
  console.log(`  ✓ Updated points: ${updatedPoints} XP, Streak: ${updatedStreak} days.`);
  if (updatedPoints < 15 || updatedStreak !== 1) {
    throw new Error("Points or streak stats failed to increment correctly.");
  }

  // Test Case 5: Verify Idempotency check on repeat requests (Service 1 - Replay Block)
  console.log("\n[TC-S1] Verifying Points Award API - Idempotency Replay Block...");
  const replayRes = await axios.post(`${BASE_URL}/api/roar/award`, {
    userId: uidA,
    reason: "DAILY_LOGIN",
    transactionId: tx2, // Reusing same transaction ID
    metadata: { sessionDurationSeconds: 120 }
  }, authHeaders);
  if (replayRes.status === 200 && replayRes.data.success === false) {
    console.log("  ✓ Duplicate transaction blocked successfully (Idempotent lock verified).");
  } else {
    throw new Error("Duplicate transaction was not blocked.");
  }

  // Test Case 6: Verify Leaderboard retrieves data (Service 3 - Leaderboard)
  console.log("\n[TC-S3] Verifying Unified Leaderboard API...");
  const leadRes = await axios.get(`${BASE_URL}/api/roar/leaderboard?limit=5`, authHeaders);
  if (leadRes.status === 200 && leadRes.data.success) {
    console.log("  ✓ Leaderboard query succeeded. Found entries:", leadRes.data.leaderboard.length);
  } else {
    throw new Error("Leaderboard API query failed.");
  }

  console.log("\n=== ALL SYSTEM GATEWAY APIS & LOOPHOLE SCENARIOS VERIFIED SUCCESSFULLY ===");
}

executeTestSuite().catch((err) => {
  console.error("Test execution failed:", err.message);
  process.exit(1);
});
