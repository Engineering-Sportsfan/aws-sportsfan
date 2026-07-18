// Mock server-only module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'server-only') return {};
  return originalRequire.apply(this, arguments);
};

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

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

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
db.settings({ databaseId: "(default)" });

async function inspect() {
  console.log("=== FIRESTORE REWARDS DATABASE STATUS ===");

  // 1. Check pointRules count
  const rulesSnap = await db.collection("pointRules").get();
  console.log(`\n1. Point Rules initialized: ${rulesSnap.size} rules active.`);
  
  // Show a few sample rules
  console.log("   Sample rules values:");
  const sampleRules = ["DAILY_LOGIN", "LIKE", "COMMENT", "CREATE_POST"];
  for (const rId of sampleRules) {
    const doc = await db.collection("pointRules").doc(rId).get();
    if (doc.exists) {
      console.log(`   - [${doc.id}] Points: ${doc.data().points}, Limit: ${doc.data().dailyLimit}, Status: ${doc.data().status}`);
    }
  }

  // 2. Check users profiles structure
  const usersSnap = await db.collection("users").limit(1).get();
  if (!usersSnap.empty) {
    const userDoc = usersSnap.docs[0];
    const data = userDoc.data();
    console.log(`\n2. Sample User Document Reset Status (${userDoc.id}):`);
    console.log(`   - totalPoints: ${data.totalPoints}`);
    console.log(`   - totalXP: ${data.totalXP}`);
    console.log(`   - reputationScore: ${data.reputationScore}`);
    console.log(`   - currentLoginStreak: ${data.currentLoginStreak}`);
    console.log(`   - loginStreakMultiplier: ${data.loginStreakMultiplier}`);
    console.log(`   - dailyPointsEarned: ${data.dailyPointsEarned}`);
    console.log(`   - dailyLikeCount: ${data.dailyLikeCount}`);
    console.log(`   - dailyActionsList:`, data.dailyActionsList);
  }

  // 3. Check pointTransactions log count
  const txSnap = await db.collection("pointTransactions").limit(5).get();
  console.log(`\n3. Recent Point Transactions Logged (total ${txSnap.size} showing):`);
  txSnap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`   - Tx: ${doc.id} | User: ${d.userName} | Action: ${d.reason} | Earned: ${d.points} XP`);
  });
}

inspect().catch(console.error);
