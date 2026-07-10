const fs = require('fs');
const path = require('path');

// Basic parser for .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const parts = trimmed.split('=');
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
      process.env[key] = val;
    }
  });
}

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();
db.settings({ databaseId: "(default)" });

async function linkRooms() {
  const roarSnapshot = await db.collection("roarRooms").get();
  const watchAlongSnapshot = await db.collection("watchAlongRooms").get();

  const roarRooms = [];
  roarSnapshot.forEach(doc => {
    roarRooms.push({ id: doc.id, ...doc.data() });
  });

  const watchAlongRooms = [];
  watchAlongSnapshot.forEach(doc => {
    watchAlongRooms.push({ id: doc.id, ...doc.data() });
  });

  console.log("Checking for unlinked matching rooms...");

  for (const roar of roarRooms) {
    if (!roar.watchAlongRoomId) {
      const matched = watchAlongRooms.find(w => w.name === roar.name);
      if (matched) {
        console.log(`Linking ROAR Room "${roar.name}" (${roar.id}) <--> Watchalong Room "${matched.name}" (${matched.id})`);
        
        await db.collection("roarRooms").doc(roar.id).update({
          watchAlongRoomId: matched.id
        });

        await db.collection("watchAlongRooms").doc(matched.id).update({
          roarRoomId: roar.id
        });
      }
    }
  }

  console.log("Done!");
  process.exit(0);
}

linkRooms();
