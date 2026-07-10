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

async function check() {
  const roomsSnapshot = await db.collection("roarRooms").get();
  console.log("--- ROAR ROOMS ---");
  roomsSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Room: ${data.name} | ID: ${doc.id} | watchAlongRoomId: ${data.watchAlongRoomId}`);
  });

  const watchAlongSnapshot = await db.collection("watchAlongRooms").get();
  console.log("\n--- WATCHALONG ROOMS ---");
  watchAlongSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Room: ${data.name} | ID: ${doc.id} | roarRoomId: ${data.roarRoomId}`);
  });

  process.exit(0);
}
check();
