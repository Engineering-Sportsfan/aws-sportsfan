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
  console.log("=== FIRESTORE DB INSPECTOR ===");
  console.log("Project:", projectId);

  // 1. Rooms
  console.log("\n--- ROOMS ---");
  const roomsSnap = await db.collection("rooms").get();
  if (roomsSnap.empty) {
    console.log("No rooms found.");
  } else {
    for (const doc of roomsSnap.docs) {
      const room = doc.data();
      console.log(`Room: [${doc.id}] "${room.name}" (Sport: ${room.sport || "N/A"}, Fans: ${room.fanCount || 0})`);
      
      // Messages inside this room
      const msgsSnap = await db.collection("rooms").doc(doc.id).collection("messages").orderBy("createdAt", "desc").limit(5).get();
      if (!msgsSnap.empty) {
        console.log("  Latest 5 Messages:");
        msgsSnap.docs.forEach((mDoc) => {
          const m = mDoc.data();
          const time = new Date(m.createdAt).toLocaleTimeString();
          console.log(`    [${m.type || "chat"}] ${m.authorUsername} (${time}): "${m.text}"`);
        });
      } else {
        console.log("  No messages in this room.");
      }
    }
  }

  // 2. Users
  console.log("\n--- USERS ---");
  const usersSnap = await db.collection("users").limit(10).get();
  if (usersSnap.empty) {
    console.log("No users found.");
  } else {
    usersSnap.docs.forEach((doc) => {
      const user = doc.data();
      console.log(`User: [${doc.id}] Username: ${user.username}, Badge: ${user.badge}`);
    });
  }
}

run().catch(console.error);
