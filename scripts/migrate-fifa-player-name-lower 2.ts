// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import admin from 'firebase-admin';

// // ESM-compatible __dirname
// const __filename = fileURLToPath(import.meta.url);
// const __dirname  = path.dirname(__filename);

// // 1. Load .env.local manually
// const envLocalPath = path.resolve(__dirname, '../.env.local');
// console.log("Loading env from:", envLocalPath);
// if (fs.existsSync(envLocalPath)) {
//   const content = fs.readFileSync(envLocalPath, 'utf8');
//   content.split('\n').forEach(line => {
//     line = line.trim();
//     if (!line || line.startsWith('#')) return;
//     const firstEq = line.indexOf('=');
//     if (firstEq === -1) return;
//     const key = line.slice(0, firstEq).trim();
//     let val = line.slice(firstEq + 1).trim();
//     if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
//     else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
//     val = val.replace(/\\n/g, '\n');
//     process.env[key] = val;
//   });
// }

// // 2. Initialize Firebase Admin
// if (!admin.apps.length) {
//   admin.initializeApp({
//     credential: admin.credential.cert({
//       projectId:   process.env.FIREBASE_PROJECT_ID,
//       clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//       privateKey:  process.env.FIREBASE_PRIVATE_KEY,
//     }),
//   });
// }

// const db = admin.firestore();
// db.settings({ ignoreUndefinedProperties: true, databaseId: "(default)" });

// async function main() {
//   console.log("Fetching all fifaPlayerStats documents...");
//   const snapshot = await db.collection("fifaPlayerStats").get();
//   console.log(`Found ${snapshot.size} documents to migrate.`);

//   if (snapshot.size === 0) {
//     console.log("Nothing to migrate.");
//     return;
//   }

//   const BATCH_SIZE = 500;
//   let updated = 0;
//   let skipped = 0;
//   let batchNum = 1;

//   for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
//     const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
//     const batch = db.batch();

//     for (const doc of chunk) {
//       const data     = doc.data();
//       const expected = (data.player_name ?? "").toLowerCase();
//       const existing = data.player_name_lower;

//       if (existing === expected) {
//         skipped++;
//         continue;
//       }

//       batch.update(doc.ref, { player_name_lower: expected });
//       updated++;
//     }

//     await batch.commit();
//     console.log(`Batch ${batchNum} done — ${Math.min(i + BATCH_SIZE, snapshot.size)}/${snapshot.size} processed`);
//     batchNum++;
//   }

//   console.log(`\nMigration complete!`);
//   console.log(`  Updated : ${updated}`);
//   console.log(`  Skipped : ${skipped} (already correct)`);
// }

// main().catch(err => {
//   console.error("Migration failed:", err);
//   process.exit(1);
// });





import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 1. Load .env.local
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
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    val = val.replace(/\\n/g, '\n');
    process.env[key] = val;
  });
}

// 2. Initialize Firebase Admin
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

function toNameWords(playerName: string): string[] {
  return playerName.toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(" ")
    .filter(Boolean);
}

async function main() {
  console.log("Fetching all fifaPlayerStats documents...");
  const snapshot = await db.collection("fifaPlayerStats").get();
  console.log(`Found ${snapshot.size} documents to migrate.`);

  if (snapshot.size === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  const BATCH_SIZE = 500;
  let updated = 0;
  let skipped = 0;
  let batchNum = 1;

  for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
    const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const doc of chunk) {
      const data     = doc.data();
      const name     = (data.player_name ?? "") as string;
      const expected = name.toLowerCase();
      const words    = toNameWords(name);

      const alreadyDone =
        data.player_name_lower === expected &&
        Array.isArray(data.name_words) &&
        data.name_words.length === words.length;

      if (alreadyDone) {
        skipped++;
        continue;
      }

      batch.update(doc.ref, {
        player_name_lower: expected,
        name_words:        words,
      });
      updated++;
    }

    await batch.commit();
    console.log(`Batch ${batchNum} done — ${Math.min(i + BATCH_SIZE, snapshot.size)}/${snapshot.size} processed`);
    batchNum++;
  }

  console.log(`\nMigration complete!`);
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped} (already correct)`);
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});