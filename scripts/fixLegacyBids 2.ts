import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

// 1. Load env files manually
const envLocalPath = path.resolve(__dirname, '../.env.local');
const envPath = path.resolve(__dirname, '../.env');

const loadEnvFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    console.log("Loading env from:", filePath);
    const content = fs.readFileSync(filePath, 'utf8');
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
};

loadEnvFile(envPath);
loadEnvFile(envLocalPath);

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

async function runCleanup() {
  console.log("🚀 Starting Auctions Legacy Bid Cleanup...");

  const snapshot1 = await db.collection("storeProducts").where("category", "==", "Auctions").get();
  const snapshot2 = await db.collection("storeProducts").where("category", "==", "auctions").get();

  const docs = [...snapshot1.docs, ...snapshot2.docs];
  const seen = new Set<string>();
  const uniqueDocs = docs.filter(doc => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });

  console.log(`Found ${uniqueDocs.length} unique auction products to clean up.`);

  for (const doc of uniqueDocs) {
    const productId = doc.id;
    const data = doc.data();
    console.log(`\nChecking Product [${productId}]: "${data.title || data.name}"`);

    const bidsSnapshot = await doc.ref.collection("bids").get();
    if (bidsSnapshot.empty) {
      console.log("  No bids found in subcollection for this product.");
      continue;
    }

    const bids = bidsSnapshot.docs.map(bDoc => ({ id: bDoc.id, ref: bDoc.ref, ...bDoc.data() } as any));
    
    // Find the doc with the highest amountPaise
    bids.sort((a, b) => b.amountPaise - a.amountPaise);
    const topBid = bids[0];

    console.log(`  Highest bid found: amountPaise=${topBid.amountPaise}, user=${topBid.displayName}, currentUserId=${topBid.userId}`);

    // Update the top bid doc
    await topBid.ref.update({
      userId: "legacy_unclaimed",
      status: "winning"
    });

    // Update the other bids to outbid
    for (let i = 1; i < bids.length; i++) {
      await bids[i].ref.update({
        status: "outbid"
      });
    }

    // Update parent doc
    await doc.ref.update({
      highestBidderId: "legacy_unclaimed"
    });

    console.log(`  ✓ Updated top bid doc and set highestBidderId to "legacy_unclaimed" on parent doc.`);
  }

  console.log("\n✅ Cleanup complete!");
}

runCleanup().catch(err => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
