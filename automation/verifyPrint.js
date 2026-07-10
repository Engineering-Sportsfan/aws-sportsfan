const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load Environment Variables
const envPath = path.join(__dirname, "dev-test-db.js"); // place in same folder
const envLocalPath = path.join(__dirname, "../.env.local");
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      process.env[key] = val;
    }
  });
}

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}

const db = admin.firestore();

async function verify() {
  console.log("\n📋 --- SPORTSFAN AUTOMATION DATABASE VERIFICATION REPORT ---\n");

  // 1. Fetch Polls
  console.log("=== 🗳️ RECENT POLLS ===");
  const pollsSnap = await db.collection("polls").orderBy("createdAt", "desc").limit(2).get();
  pollsSnap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`- ID: ${doc.id}`);
    console.log(`  Question: "${d.title}"`);
    console.log(`  Type: ${d.type}`);
    console.log(`  Options: ${d.options.map(o => o.label).join(", ")}`);
    console.log(`  Active: ${d.active}\n`);
  });

  // 2. Fetch Fan Battle Quizzes
  console.log("=== 🧠 RECENT FAN BATTLE QUIZZES ===");
  const quizzesSnap = await db.collection("fanBattleQuizzes").orderBy("createdAt", "desc").limit(3).get();
  quizzesSnap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`- ID: ${doc.id}`);
    console.log(`  Category: ${d.category} | Level: ${d.level}`);
    console.log(`  Total Questions: ${d.totalQuestions} (${d.totalPoints} points)`);
    console.log(`  Questions:`);
    d.questions.forEach(q => {
      console.log(`    * "${q.question}" -> Correct: "${q.correctAnswer}"`);
    });
    console.log();
  });

  // 3. Fetch Fan Battles
  console.log("=== ⚔️ RECENT BATTLES ===");
  const battlesSnap = await db.collection("fanBattles").orderBy("createdAt", "desc").limit(2).get();
  battlesSnap.docs.forEach(doc => {
    const d = doc.data();
    console.log(`- ID: ${doc.id}`);
    console.log(`  Battle: "${d.battleName}"`);
    console.log(`  Type: ${d.battleType}`);
    console.log(`  Players: ${JSON.stringify(d.selectedPlayers)}`);
    console.log(`  Clubs: ${JSON.stringify(d.selectedClubs)}\n`);
  });

  console.log("============================================================\n");
}

verify().catch(console.error);
