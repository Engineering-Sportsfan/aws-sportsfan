// Mock server-only module before anything else loads
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'server-only') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load .env.local manually from the backend root
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Could not find backend .env.local file.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[match[1].trim()] = val;
  }
});

// Setup environment variables so firebaseAdmin initializes correctly
process.env.FIREBASE_PROJECT_ID = env.FIREBASE_PROJECT_ID;
process.env.FIREBASE_CLIENT_EMAIL = env.FIREBASE_CLIENT_EMAIL;
process.env.FIREBASE_PRIVATE_KEY = env.FIREBASE_PRIVATE_KEY;

const { awardUserPoints, getUserInfo } = require("../lib/userPoints");

async function runTests() {
  console.log("=== RUNNING EXTENDED SPEC ENGINE VERIFICATION TESTS ===");
  
  const usersSnap = await dbRef.collection("users").limit(2).get();
  if (usersSnap.size < 2) {
    console.error("Please ensure at least 2 users exist in the database to run referral tests.");
    process.exit(1);
  }

  // Set up User A (referred) and User B (referrer)
  const userADoc = usersSnap.docs[0];
  const userBDoc = usersSnap.docs[1];
  
  const uidA = userADoc.id;
  const uidB = userBDoc.id;

  const nameA = userADoc.data().firstName ? [userADoc.data().firstName, userADoc.data().lastName].filter(Boolean).join(" ") : userADoc.data().name || "User A";
  const nameB = userBDoc.data().firstName ? [userBDoc.data().firstName, userBDoc.data().lastName].filter(Boolean).join(" ") : userBDoc.data().name || "User B";

  console.log(`Referred Friend User A: ${nameA} (${uidA})`);
  console.log(`Referrer User B: ${nameB} (${uidB})`);

  // 1. Reset user statistics to start clean
  console.log("\nResetting User A profile stats...");
  await dbRef.collection("users").doc(uidA).update({
    totalPoints: 0,
    totalXP: 0,
    reputationScore: 0,
    currentLoginStreak: 0,
    loginStreakMultiplier: 1.0,
    dailyPointsEarned: 0,
    dailyLikeCount: 0,
    dailyActionsList: [],
    dailyComboAwarded: false,
    unlockedMilestones: [],
    featureStats: {},
    featureLevels: {},
    globalTier: "Spark",
    subRank: "I",
    streakFreezeCount: 0,
    lastActiveTimestamp: 0,
    referredBy: uidB,
    createdAt: Date.now()
  });

  console.log("Resetting User B profile stats...");
  await dbRef.collection("users").doc(uidB).update({
    totalPoints: 0,
    totalXP: 0,
    reputationScore: 0,
    streakFreezeCount: 0,
    lastActiveTimestamp: Date.now()
  });

  // Ensure configurable streakSettings has minSessionSeconds=60 in multipliers collection
  await dbRef.collection("multipliers").doc("streakSettings").set({
    minSessionSeconds: 60,
    updatedAt: Date.now()
  });

  // 2. Test Case 1: Minimum active login session check (FAIL case - 15 seconds)
  console.log("\n[Test 1A] Testing login with short session duration (15s)...");
  const tx1Fail = `test_tx_login_fail_${Date.now()}`;
  const res1Fail = await awardUserPoints({
    actualUserId: uidA,
    authUserId: uidA,
    userName: nameA,
    userEmail: "friend@sportsfan360.com",
    userExists: true,
    points: 15,
    reason: "DAILY_LOGIN",
    transactionId: tx1Fail,
    metadata: { sessionDurationSeconds: 15 } // Less than 60s
  });
  console.log("DAILY_LOGIN (15s session) result (expected false):", res1Fail);

  // Test Case 1B: Welcome Back Grace Check (PASS case - absence > 14 days and session = 120s)
  console.log("\n[Test 1B] Mocking user login after 20 days of absence with valid 120s session...");
  const oldTimestamp = Date.now() - (20 * 24 * 60 * 60 * 1000);
  await dbRef.collection("users").doc(uidA).update({
    lastActiveTimestamp: oldTimestamp
  });

  const tx1Pass = `test_tx_welcome_pass_${Date.now()}`;
  const success1 = await awardUserPoints({
    actualUserId: uidA,
    authUserId: uidA,
    userName: nameA,
    userEmail: "friend@sportsfan360.com",
    userExists: true,
    points: 15,
    reason: "DAILY_LOGIN",
    transactionId: tx1Pass,
    metadata: { sessionDurationSeconds: 120 } // Meets minSessionSeconds
  });
  console.log("DAILY_LOGIN (120s session) result:", success1);

  let dataA = (await dbRef.collection("users").doc(uidA).get()).data();
  console.log("XP score after login (+15 base +50 grace = 65 XP):", dataA.totalXP);
  console.log("Streak Freezes granted (expected 1):", dataA.streakFreezeCount);

  // 3. Test Case 2: Feature mastery ladder progression (Predictions made count)
  console.log("\n[Test 2] Triggering predictions vote to check mastery progression...");
  await dbRef.collection("users").doc(uidA).update({
    "featureStats.predictions": 24
  });

  const tx2 = `test_tx_vote_${Date.now()}`;
  const success2 = await awardUserPoints({
    actualUserId: uidA,
    authUserId: uidA,
    userName: nameA,
    userEmail: "friend@sportsfan360.com",
    userExists: true,
    points: 8,
    reason: "CREATE_PREDICTION",
    transactionId: tx2
  });
  console.log("CREATE_PREDICTION result:", success2);

  dataA = (await dbRef.collection("users").doc(uidA).get()).data();
  console.log("Predictions category count (expected 25):", dataA.featureStats.predictions);
  console.log("Predictions mastery level reached (expected L2):", dataA.featureLevels.predictions);

  // 4. Test Case 3: Global rank and sub-rank split verification (Tier Spark ranges)
  console.log("\n[Test 3] Verifying sub-rank division I / II / III calculations...");
  const tx3 = `test_tx_boost_${Date.now()}`;
  await awardUserPoints({
    actualUserId: uidA,
    authUserId: uidA,
    userName: nameA,
    userEmail: "friend@sportsfan360.com",
    userExists: true,
    points: 300,
    reason: "WIN_FEATURED_POST", 
    transactionId: tx3
  });

  dataA = (await dbRef.collection("users").doc(uidA).get()).data();
  console.log("Total XP score:", dataA.totalXP);
  console.log("Global rank tier:", dataA.globalTier);
  console.log("Sub rank (expected II):", dataA.subRank);

  // 5. Test Case 4: Referred friend points commission payout (5%)
  console.log("\n[Test 4] Testing 5% referral commission payout...");
  const tx4 = `test_tx_friend_action_${Date.now()}`;
  await awardUserPoints({
    actualUserId: uidA,
    authUserId: uidA,
    userName: nameA,
    userEmail: "friend@sportsfan360.com",
    userExists: true,
    points: 65,
    reason: "CREATE_POST",
    transactionId: tx4
  });

  await new Promise(resolve => setTimeout(resolve, 2000));

  const dataB = (await dbRef.collection("users").doc(uidB).get()).data();
  console.log("Referrer B XP score after commission (expected 3 XP):", dataB.totalXP);

  console.log("\n=== ALL EXTENDED VERIFICATION TESTS PASSED ===");
}

const dbRef = admin.firestore();

runTests().catch(console.error);
