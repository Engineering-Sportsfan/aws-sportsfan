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

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
db.settings({ databaseId: "(default)" });

async function run() {
  console.log("=== POPULATING EXTRA CONFIGURATION TABLES FROM EXCEL SHEET ===");
  const batch = db.batch();

  // 1. Populate multipliers collection (from 'Multipliers' sheet tab)
  const multipliers = [
    {
      id: "streakCurve",
      curve: [
        { minDay: 1, multiplier: 1.0 },
        { minDay: 3, multiplier: 1.1 },
        { minDay: 7, multiplier: 1.25 },
        { minDay: 14, multiplier: 1.5 },
        { minDay: 30, multiplier: 1.75 },
        { minDay: 60, multiplier: 2.0 }
      ]
    },
    {
      id: "matchDay",
      value: 1.2
    },
    {
      id: "powerFanCombo",
      value: 25
    },
    {
      id: "viralCascade",
      curve: [
        { minShares: 0, bonus: 0 },
        { minShares: 50, bonus: 50 },
        { minShares: 200, bonus: 150 },
        { minShares: 1000, bonus: 500 }
      ]
    }
  ];

  multipliers.forEach(m => {
    const docRef = db.collection("multipliers").doc(m.id);
    batch.set(docRef, { ...m, updatedAt: Date.now() });
    console.log(`Prepared multiplier document: ${m.id}`);
  });

  // 2. Populate globalLevels collection (from 'Global_Levels' sheet tab)
  const globalLevels = [
    { id: "Spark", minXP: 0, maxXP: 999 },
    { id: "Chant", minXP: 1000, maxXP: 3999 },
    { id: "Roar", minXP: 4000, maxXP: 11999 },
    { id: "Storm", minXP: 12000, maxXP: 29999 },
    { id: "Legend", minXP: 30000, maxXP: 74999 },
    { id: "Icon", minXP: 75000, maxXP: 149999 },
    { id: "GOAT", minXP: 150000, maxXP: 999999999 }
  ];

  globalLevels.forEach(level => {
    const docRef = db.collection("globalLevels").doc(level.id);
    batch.set(docRef, { ...level, updatedAt: Date.now() });
    console.log(`Prepared globalLevel document: ${level.id}`);
  });

  // 3. Populate featureThresholds collection (from 'Feature_Thresholds' sheet tab)
  const featureThresholds = [
    { id: "post", thresholds: [1, 10, 30, 75, 150], label: "Post Creator" },
    { id: "debate", thresholds: [1, 10, 25, 60, 120], label: "Debate Challenger" },
    { id: "predictions", thresholds: [5, 25, 75, 150, 300], label: "Predictions Predictor" },
    { id: "trivia", thresholds: [5, 25, 75, 150, 300], label: "Trivia Rookie" },
    { id: "battles", thresholds: [3, 15, 40, 80, 150], label: "Fan Battles Contender" },
    { id: "community", thresholds: [10, 50, 150, 400, 1000], label: "Community Appreciated" },
    { id: "shares", thresholds: [5, 20, 60, 150, 300], label: "Shares Messenger" },
    { id: "comments", thresholds: [10, 40, 120, 300, 600], label: "Comments Participant" },
    { id: "media", thresholds: [3, 15, 40, 80, 150], label: "Media Photographer" },
    { id: "watch_along", thresholds: [3, 15, 40, 80, 150], label: "Watch Along Viewer" },
    { id: "fantasy", thresholds: [2, 10, 25, 50, 100], label: "Fantasy Rookie Manager" },
    { id: "news", thresholds: [10, 50, 150, 400, 800], label: "News Reader" },
    { id: "invites", thresholds: [1, 5, 15, 30, 60], label: "Invite Friends Inviter" },
    { id: "store", thresholds: [1, 5, 15, 30, 60], label: "Store Shopper" },
    { id: "auctions", thresholds: [1, 3, 8, 15, 30], label: "Auctions Bidder" },
    { id: "ama", thresholds: [1, 5, 15, 30, 60], label: "AMA Sessions Listener" },
    { id: "player_sessions", thresholds: [1, 5, 15, 30, 60], label: "Player Sessions Attendee" },
    { id: "drops", thresholds: [5, 20, 60, 150, 300], label: "Audio/Video Drops Listener" }
  ];

  featureThresholds.forEach(ft => {
    const docRef = db.collection("featureThresholds").doc(ft.id);
    batch.set(docRef, { ...ft, updatedAt: Date.now() });
    console.log(`Prepared featureThreshold document: ${ft.id}`);
  });

  await batch.commit();
  console.log("=== FIRESTORE CONFIGURATION TABLES POPULATED SUCCESSFULLY ===");
}

run().catch(console.error);
