const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load .env.local manually from the backend root
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Could not find backend .env.local file at:", envPath);
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
  console.log("=== RESETTING AND INITIALIZING USER PROFILES ===");
  
  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} user documents to process.`);

  let batch = db.batch();
  let count = 0;
  let totalBatches = 0;

  for (const doc of usersSnap.docs) {
    const docRef = db.collection("users").doc(doc.id);
    
    // Partially update user fields to start fresh with zero points and clean streaks
    batch.update(docRef, {
      totalXP: 0,
      totalPoints: 0,
      reputationScore: 0,
      prestigePoints: 0,
      currentLoginStreak: 0,
      loginStreakMultiplier: 1.0,
      currentCreatorStreak: 0,
      lastActiveTimestamp: 0,
      streakFreezeCount: 0,
      unlockedMilestones: [],
      dailyPointsEarned: 0,
      dailyLikeCount: 0,
      dailyActionsList: [],
      referredBy: doc.data().referredBy || "",
      referralList: doc.data().referralList || [],
      featureStats: {},
      updatedAt: Date.now()
    });

    count++;

    // Commit batch every 400 operations (Firestore batch limit is 500)
    if (count % 400 === 0) {
      await batch.commit();
      totalBatches++;
      console.log(`Committed batch ${totalBatches} (${count} users reset)`);
      batch = db.batch();
    }
  }

  // Commit any remaining writes
  if (count % 400 !== 0) {
    await batch.commit();
    totalBatches++;
    console.log(`Committed final batch ${totalBatches} (total ${count} users reset)`);
  }

  console.log("=== USER PROFILES RESET COMPLETED SUCCESSFULLY ===");
}

run().catch(console.error);
