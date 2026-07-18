const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load .env
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
  console.error("Missing Firebase env variables in .env!");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = admin.firestore();
db.settings({ databaseId: "(default)" });

async function run() {
  console.log("Fetching documents from 'articles' collection...");
  const snap = await db.collection("articles").get();
  console.log(`Found ${snap.docs.length} documents:`);
  snap.docs.forEach((doc) => {
    console.log(`- ${doc.id} (Title: "${doc.data().title}")`);
  });
}

run().catch(console.error);
