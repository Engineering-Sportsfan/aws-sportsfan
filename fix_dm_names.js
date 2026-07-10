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
  console.error("Missing Firebase variables in .env!");
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
  console.log("=== FIRESTORE DM CHAT NAME CLEANER ===");
  const snapshot = await db.collection("chats").where("type", "==", "dm").get();
  console.log(`Found ${snapshot.size} DM chat documents.`);

  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.name !== "") {
      console.log(`Chat [${doc.id}] has name "${data.name}". Clearing to ""...`);
      await db.collection("chats").doc(doc.id).update({ name: "" });
      count++;
    }
  }

  console.log(`Successfully cleared name for ${count} DM chat documents.`);
}

run().catch(console.error);
