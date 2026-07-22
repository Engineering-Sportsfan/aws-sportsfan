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

function parseAmountToPaise(amountStr: string): number {
  if (!amountStr) return 0;
  // Strip currency symbol, commas, and dots/spaces
  const cleanStr = amountStr.replace(/[^\d]/g, '');
  const amount = parseInt(cleanStr, 10);
  // Assume amount is already in Rupees, e.g. 48500 Rs -> 4850000 Paise
  return isNaN(amount) ? 0 : amount * 100;
}

function parseTime(timeStr: string): admin.firestore.Timestamp {
  const now = Date.now();
  if (!timeStr) return admin.firestore.Timestamp.now();
  
  const match = timeStr.toLowerCase().match(/(\d+)\s*(sec|min|hour|day)s?\s*ago/);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = match[2];
    let ms = 0;
    if (unit.startsWith('sec')) ms = val * 1000;
    else if (unit.startsWith('min')) ms = val * 60 * 1000;
    else if (unit.startsWith('hour')) ms = val * 60 * 60 * 1000;
    else if (unit.startsWith('day')) ms = val * 24 * 60 * 60 * 1000;
    return admin.firestore.Timestamp.fromMillis(now - ms);
  }
  return admin.firestore.Timestamp.now();
}

async function runMigration() {
  console.log("🚀 Starting Auctions Schema Migration...");

  // Query category == 'Auctions'
  const snapshot1 = await db.collection("storeProducts").where("category", "==", "Auctions").get();
  // Query category == 'auctions'
  const snapshot2 = await db.collection("storeProducts").where("category", "==", "auctions").get();

  const docs = [...snapshot1.docs, ...snapshot2.docs];
  const seen = new Set<string>();
  const uniqueDocs = docs.filter(doc => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });

  console.log(`Found ${uniqueDocs.length} unique auction products to migrate.`);

  for (const doc of uniqueDocs) {
    const productId = doc.id;
    const data = doc.data();
    console.log(`\nMigrating Product [${productId}]: "${data.title || data.name}"`);

    const currentBidPaise = data.currentBidPaise ?? data.pricePaise ?? 0;
    const minIncrementPaise = data.minIncrementPaise ?? 50000; // ₹500 default
    const status = data.status ?? "active";
    const highestBidderId = data.highestBidderId ?? null;
    const winnerId = data.winnerId ?? null;

    // 1. Update the parent document fields
    await doc.ref.update({
      currentBidPaise,
      highestBidderId,
      minIncrementPaise,
      status,
      winnerId,
      // Note: pricePaise and bidHistory are left untouched/as-is for backward compatibility
    });
    console.log(`  ✓ Updated fields: currentBidPaise=${currentBidPaise}, minIncrementPaise=${minIncrementPaise}, status=${status}`);

    // 2. Migrate bidHistory array into bids subcollection
    if (Array.isArray(data.bidHistory) && data.bidHistory.length > 0) {
      console.log(`  Migrating ${data.bidHistory.length} bid history entries to subcollection...`);
      const bidsCol = doc.ref.collection("bids");
      
      // Parse, sort by amount ascending so we can mark the highest/last as winning
      const parsedBids = data.bidHistory.map((item: any, index: number) => {
        const amountPaise = parseAmountToPaise(item.amount);
        const placedAt = parseTime(item.time);
        return {
          id: `legacy_bid_${index}_${Date.now()}`,
          userId: "legacy",
          displayName: item.user || "Anonymous",
          amountPaise,
          type: "manual" as const,
          placedAt,
          status: "outbid" as const
        };
      });

      // Sort by amount ascending
      parsedBids.sort((a, b) => a.amountPaise - b.amountPaise);
      
      // Set the last (highest) bid to "winning" if the auction is active
      if (parsedBids.length > 0 && status === "active") {
        parsedBids[parsedBids.length - 1].status = "winning";
      }

      const batch = db.batch();
      for (const bid of parsedBids) {
        const bidRef = bidsCol.doc(bid.id);
        batch.set(bidRef, {
          userId: bid.userId,
          displayName: bid.displayName,
          amountPaise: bid.amountPaise,
          type: bid.type,
          placedAt: bid.placedAt,
          status: bid.status
        });
      }
      await batch.commit();
      console.log(`  ✓ Successfully committed ${parsedBids.length} bids to subcollection`);
    } else {
      console.log(`  No legacy bidHistory array found or array is empty.`);
    }
  }

  console.log("\n✅ Migration complete!");
}

runMigration().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
