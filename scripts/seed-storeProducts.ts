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

async function deleteCollection(collectionRef: admin.firestore.CollectionReference): Promise<number> {
  let totalDeleted = 0;
  let snapshot = await collectionRef.get();

  while (!snapshot.empty) {
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    totalDeleted += snapshot.docs.length;
    snapshot = await collectionRef.get();
  }

  return totalDeleted;
}

function calculateDateString(dateStr: string): { date: string, day: string, num: number } {
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  let targetDate = new Date(now);
  const lower = dateStr.toLowerCase();
  
  if (lower !== 'today') {
    const targetDayIndex = dayNames.findIndex(d => d.toLowerCase() === lower);
    if (targetDayIndex !== -1) {
      const currentDayIndex = now.getDay();
      let diff = targetDayIndex - currentDayIndex;
      if (diff <= 0) {
        diff += 7; // Next week's day
      }
      targetDate.setDate(now.getDate() + diff);
    }
  }
  
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  
  return {
    date: `${yyyy}-${mm}-${dd}`,
    day: dayNames[targetDate.getDay()],
    num: targetDate.getDate()
  };
}

async function main() {
  let dataPath = path.resolve(__dirname, '../data/storeProducts.json');
  if (!fs.existsSync(dataPath)) {
    dataPath = path.resolve(__dirname, '../data/storeProducts copy.json');
  }

  console.log(`Reading storeProducts data from: ${dataPath}`);
  
  if (!fs.existsSync(dataPath)) {
    console.error(`❌ Error: Data file not found at ${dataPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(dataPath, 'utf-8');
  const productsData = JSON.parse(fileContent);
  const productsCount = Object.keys(productsData).length;

  console.log(`Loaded ${productsCount} products from JSON.`);

  console.log('🗑️ Deleting existing storeProducts from backend v1 Firestore...');
  const deleted = await deleteCollection(db.collection('storeProducts'));
  console.log(`   ✓ Deleted ${deleted} documents from "storeProducts"`);

  if (productsCount === 0) {
    console.log('ℹ️ No products to seed.');
    return;
  }

  console.log('\n📥 Seeding storeProducts into backend v1 Firestore...');
  
  for (const [productId, productDataRaw] of Object.entries(productsData)) {
    const productData = { ...(productDataRaw as any) };
    const ref = db.collection('storeProducts').doc(productId);
    
    let slotsList: any[] = [];
    if (Array.isArray(productData.slots)) {
      slotsList = productData.slots;
      delete productData.slots; // Clean from parent document
    }

    // Set parent document
    await ref.set(productData);

    // Seed slots subcollection
    if (slotsList.length > 0) {
      console.log(`   Seeding slots subcollection for ${productId}...`);
      const slotsColRef = ref.collection('slots');
      await deleteCollection(slotsColRef);

      const slotsBatch = db.batch();
      let slotIndex = 1;
      slotsList.forEach(dateItem => {
        const calc = calculateDateString(dateItem.date);
        if (Array.isArray(dateItem.times)) {
          dateItem.times.forEach(timeStr => {
            const slotDocId = `slot_${String(slotIndex++).padStart(3, '0')}`;
            const slotDocRef = slotsColRef.doc(slotDocId);
            slotsBatch.set(slotDocRef, {
              date: calc.date,
              day: calc.day,
              num: calc.num,
              time: timeStr,
              status: 'available',
              lockedBy: null,
              lockExpiresAt: null,
              bookedBy: null,
              orderId: null
            });
          });
        }
      });
      await slotsBatch.commit();
    }
  }

  console.log(`\n✅ Successfully seeded ${productsCount} products and their slots into "storeProducts" collection.`);
  console.log('🎉 Seeding complete!');
}

main().catch(err => {
  console.error("Error in main:", err);
  process.exit(1);
});
