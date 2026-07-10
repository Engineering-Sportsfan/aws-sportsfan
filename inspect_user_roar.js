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
  console.log("--- SEARCHING USERS COLLECTION ---");
  const usersSnap = await db.collection("users").get();
  let found = false;
  usersSnap.docs.forEach((doc) => {
    const data = doc.data();
    const email = data.email || "";
    const userId = data.userId || "";
    const username = data.username || "";
    if (
      email.includes("prisha") ||
      userId.includes("prisha") ||
      email.includes("sportsfan360") ||
      username !== ""
    ) {
      found = true;
      console.log(`Document ID: [${doc.id}]`);
      console.log(`  email: "${email}"`);
      console.log(`  userId: "${userId}"`);
      console.log(`  firstName: "${data.firstName}"`);
      console.log(`  lastName: "${data.lastName}"`);
      console.log(`  username: "${data.username}"`);
      console.log(`  badge: "${data.badge}"`);
      console.log(`  sports: ${JSON.stringify(data.sports)}`);
      console.log(`  teams: ${JSON.stringify(data.teams)}`);
      console.log("------------------------");
    }
  });
  if (!found) {
    console.log("No matching users found.");
  }
}

run().catch(console.error);
