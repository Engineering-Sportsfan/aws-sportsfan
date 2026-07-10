// scripts/backfillRoomCounts.ts

import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── 1. Load .env.local ────────────────────────────────────────────────────────
const envLocalPath = path.resolve(__dirname, "../.env.local");
console.log("Loading env from:", envLocalPath);
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, "utf8");
  content.split("\n").forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith("#")) return;
    const firstEq = line.indexOf("=");
    if (firstEq === -1) return;
    const key = line.slice(0, firstEq).trim();
    let val = line.slice(firstEq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    val = val.replace(/\\n/g, "\n");
    process.env[key] = val;
  });
}

// ── 2. Initialize Firebase Admin ──────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY,
    }),
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true, databaseId: "(default)" });

// ── 3. Backfill postCount / debateCount / predictionCount on each room ───────
//
// NOTE: messages with a missing/undefined `type` field are treated as "post"
// (matching the frontend's `p.type === "post" || !p.type` rule and the
// POST-handler's default type of "chat" being bucketed as a post-equivalent).
// Earlier versions of this script only matched strict `type === "post"`,
// which silently skipped untyped legacy messages — causing tracked counts
// to undercount the true number of visible posts (e.g. 32 shown vs 37 actual).
async function main() {
  console.log("Fetching all roarRooms documents...");
  const roomsSnap = await db.collection("roarRooms").get();
  console.log(`Found ${roomsSnap.size} rooms to backfill.`);

  if (roomsSnap.size === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  let updated = 0;
  let skipped = 0;
  let roomNum = 1;

  for (const roomDoc of roomsSnap.docs) {
    const messagesSnap = await roomDoc.ref.collection("messages").get();

    let postCount = 0;
    let debateCount = 0;
    let predictionCount = 0;

    messagesSnap.docs.forEach((msgDoc) => {
      const type = msgDoc.data().type;
      if (type === "post" || !type) postCount++;
      else if (type === "debate") debateCount++;
      else if (type === "prediction") predictionCount++;
    });

    const data = roomDoc.data();
    const alreadyDone =
      data.postCount === postCount &&
      data.debateCount === debateCount &&
      data.predictionCount === predictionCount;

    if (alreadyDone) {
      skipped++;
    } else {
      await roomDoc.ref.update({ postCount, debateCount, predictionCount });
      updated++;
    }

    console.log(
      `[${roomNum}/${roomsSnap.size}] ${roomDoc.id} — post=${postCount} debate=${debateCount} prediction=${predictionCount}${alreadyDone ? " (skipped, already correct)" : ""}`
    );
    roomNum++;
  }

  console.log("\nBackfill complete!");
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped} (already correct)`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});