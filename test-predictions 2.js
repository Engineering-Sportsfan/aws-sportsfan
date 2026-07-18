const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local
const envPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach(line => {
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
db.settings({
  ignoreUndefinedProperties: true,
  databaseId: "(default)",
});

async function main() {
  const matchId = "Hc9iZWMyaM6NLfRa2cim";
  console.log("Fetching predictions for match:", matchId);
  const snapshot = await db.collection("watchAlongMatches").doc(matchId).collection("predictions").get();
  console.log("Total predictions found:", snapshot.docs.length);
  snapshot.docs.forEach(doc => {
    console.log(`Prediction ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
