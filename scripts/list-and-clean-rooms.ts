import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

// 1. Load .env.local manually
const envLocalPath = path.resolve(__dirname, '../.env.local');
console.log("Loading env from:", envLocalPath);
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const firstEq = line.indexOf('=');
    if (firstEq === -1) return;
    const key = line.slice(0, firstEq).trim();
    let val = line.slice(firstEq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    } else if (val.startsWith("'") && val.endsWith("'")) {
      val = val.slice(1, -1);
    }
    val = val.replace(/\\n/g, '\n');
    process.env[key] = val;
  });
}

// 2. Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
}

const db = admin.firestore();
db.settings({
  ignoreUndefinedProperties: true,
  databaseId: "(default)",
});

async function main() {
  console.log("Fetching all watchAlongRooms from Firestore...");
  const snapshot = await db.collection("watchAlongRooms").get();
  
  console.log(`Found ${snapshot.size} rooms total.`);
  
  const testIds = ["dasf", "nkn", "m bn", "prisha", "test", "standup@11am", "wdf", "m nmn"];
  // We also check if the slug or ID matches (with spaces replaced or lowercase)
  const isTestRoom = (docId: string, name: string) => {
    const normId = docId.toLowerCase().trim();
    const normName = name.toLowerCase().trim();
    return testIds.includes(normId) || 
           testIds.includes(normName) ||
           normId.includes("dasf") || normName.includes("dasf") ||
           normId.includes("nkn") || normName.includes("nkn") ||
           normId.includes("test") || normName.includes("test") ||
           normId.includes("standup") || normName.includes("standup") ||
           normId.includes("wdf") || normName.includes("wdf") ||
           normId === "m-bn" || normName === "m bn" || normName === "m-mn" || normName === "m nmn" || normName === "m-bn" ||
           normId === "prisha" || normName === "prisha";
  };

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const name = data.name || "";
    const hostName = data.hostName || "";
    console.log(`- Room ID: "${doc.id}", Name: "${name}", Host: "${hostName}"`);
    
    if (isTestRoom(doc.id, name)) {
      console.log(`  => Match found! Deleting room "${doc.id}" ("${name}")...`);
      
      // Delete sub-collection chats first
      const chatsSnap = await doc.ref.collection("chats").get();
      if (chatsSnap.size > 0) {
        console.log(`     Deleting ${chatsSnap.size} chats...`);
        const batch = db.batch();
        chatsSnap.docs.forEach(chatDoc => batch.delete(chatDoc.ref));
        await batch.commit();
      }
      
      // Delete room doc
      await doc.ref.delete();
      console.log(`     Successfully deleted room "${doc.id}".`);
    }
  }
  
  console.log("Cleanup complete!");
}

main().catch(err => {
  console.error("Error in main:", err);
  process.exit(1);
});
