import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const serviceAccount = JSON.parse(fs.readFileSync("./secrets/sportsfan360-new-firebase-adminsdk-v80z1-26da68065b.json", "utf-8"));

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

async function check() {
  const snapshot = await db.collection("roarRooms").orderBy("createdAt", "desc").limit(5).get();
  let found = false;
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Room: ${data.name}, ID: ${doc.id}`);
    if (data.botConfig) {
      console.log("  -> botConfig FOUND:", JSON.stringify(data.botConfig, null, 2));
      found = true;
    } else {
      console.log("  -> botConfig NOT FOUND");
    }
  });
  if (!found) console.log("No recent rooms have botConfig. Have you created one from the Admin Panel since the update?");
}

check().catch(console.error);
