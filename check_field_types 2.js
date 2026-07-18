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
  const email = "chandu.srikakulam@sportsfan360.com";
  const userDoc = await db.collection("users").doc(email).get();
  if (userDoc.exists) {
    const data = userDoc.data();
    console.log(`Checking types for document: [${email}]`);
    console.log(`  username: type=${typeof data.username}, value=${JSON.stringify(data.username)}`);
    console.log(`  badge: type=${typeof data.badge}, value=${JSON.stringify(data.badge)}`);
    console.log(`  has username property in object: ${'username' in data}`);
    console.log(`  has badge property in object: ${'badge' in data}`);
  } else {
    console.log(`Document [${email}] not found.`);
  }
}

run().catch(console.error);
