const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, ".env");
if (!fs.existsSync(envPath)) {
  console.error("Could not find backend .env file at:", envPath);
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

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY ? env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") : undefined;

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing Firebase env variables in .env.local!");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId,
    clientEmail,
    privateKey,
  }),
});

const db = admin.firestore();
db.settings({ databaseId: "(default)" });

async function run() {
  console.log("=== FIRESTORE USERS INSPECTOR ===");
  const targets = ["yadav962160_gmail_com", "yadav962160@gmail.com", "raghav_guptaraghav1375_gmail_com", "rahul_yadav_sportsfan360_com"];
  for (const t of targets) {
    const docByEmail = await db.collection("users").doc(t).get();
    if (docByEmail.exists) {
      console.log(`User Doc [${t}]:`, JSON.stringify(docByEmail.data(), null, 2));
    } else {
      const q = await db.collection("users").where("userId", "==", t).get();
      if (!q.empty) {
        console.log(`User query by userId [${t}]:`, JSON.stringify(q.docs[0].data(), null, 2));
      } else {
        console.log(`User [${t}] NOT found in users collection by email doc ID or userId field.`);
      }
    }
  }
}

run().catch(console.error);
