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

const collections = [
  'athletesProfile',
  'recordProgress',
  'recordStories',
  'recordTrends',
  'records',
  'storeProducts'
];

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

async function main() {
  for (const collectionName of collections) {
    const dataPath = path.resolve(__dirname, `../data/${collectionName}.json`);
    console.log(`\n----------------------------------------`);
    console.log(`Processing collection: "${collectionName}"`);
    console.log(`Reading data from: ${dataPath}`);
    
    if (!fs.existsSync(dataPath)) {
      console.error(`⚠️ Warning: Data file not found at ${dataPath}. Skipping.`);
      continue;
    }

    const fileContent = fs.readFileSync(dataPath, 'utf-8');
    const collectionData = JSON.parse(fileContent);
    const documentsCount = Object.keys(collectionData).length;

    console.log(`Loaded ${documentsCount} documents from JSON.`);

    console.log(`🗑️ Deleting existing documents from "${collectionName}"...`);
    const deleted = await deleteCollection(db.collection(collectionName));
    console.log(`   ✓ Deleted ${deleted} documents.`);

    if (documentsCount === 0) {
      console.log(`ℹ️ No documents to seed for "${collectionName}".`);
      continue;
    }

    console.log(`📥 Seeding documents into "${collectionName}"...`);
    
    // Split into chunks of 500 for Firestore batch limit
    const batchSize = 500;
    const entries = Object.entries(collectionData);
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const chunk = entries.slice(i, i + batchSize);
      const batch = db.batch();
      
      chunk.forEach(([docId, docData]) => {
        const ref = db.collection(collectionName).doc(docId);
        batch.set(ref, docData as any);
      });
      
      await batch.commit();
      console.log(`   ✓ Seeded chunk ${Math.floor(i / batchSize) + 1} (${chunk.length} docs)`);
    }

    console.log(`✅ Successfully seeded "${collectionName}" collection.`);
  }

  console.log('\n🎉 All seeding completed successfully!');
}

main().catch(err => {
  console.error("Error in main:", err);
  process.exit(1);
});
