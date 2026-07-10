const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load .env.local manually
const envPath = path.join(__dirname, ".env.local");
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

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY ? env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") : undefined;

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
  console.log("Updating existing rooms sport types...");
  const snapshot = await db.collection("rooms").get();
  
  for (const doc of snapshot.docs) {
    const room = doc.data();
    let sportUpdate = null;
    
    if (room.name.toLowerCase().includes("fifa")) {
      sportUpdate = "football";
    } else if (room.name.toLowerCase().includes("wc")) {
      sportUpdate = "cricket";
    }
    
    if (sportUpdate) {
      await db.collection("rooms").doc(doc.id).update({ sport: sportUpdate });
      console.log(`Updated room "${room.name}" to sport: "${sportUpdate}"`);
    }
  }
  console.log("Done!");
}

run().catch(console.error);
