const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env.local");
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
  console.log("--- ROAR BADGES INSPECTION ---");
  
  const testIds = [
    "prisha.dureja@sportsfan360.com",
    "prisha_dureja_sportsfan360_com",
    "rahul.yadav@sportsfan360.com",
    "rahul_yadav_sportsfan360_com"
  ];
  
  for (const id of testIds) {
    const progressSnap = await db.collection("roarBadges").doc(id).collection("roarProgress").get();
    if (!progressSnap.empty) {
      console.log(`Document [${id}] has ${progressSnap.size} progress entries.`);
      progressSnap.docs.forEach((doc) => {
        const data = doc.data();
        console.log(`  Badge [${doc.id}]: unlocked=${data.unlocked}, progress=${data.progress}`);
      });
    } else {
      console.log(`Document [${id}] has NO progress entries.`);
    }
    console.log("-----------------------------------------");
  }
}

run().catch(console.error);
