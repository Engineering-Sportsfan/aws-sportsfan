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

async function main() {
  const dataPath = path.resolve(__dirname, '../data/articles.json');
  console.log(`Reading articles data from: ${dataPath}`);
  
  if (!fs.existsSync(dataPath)) {
    console.error(`❌ Error: Data file not found at ${dataPath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(dataPath, 'utf-8');
  const articlesData = JSON.parse(fileContent);
  const articlesCount = Object.keys(articlesData).length;

  console.log(`Loaded ${articlesCount} articles from JSON.`);

  console.log('🗑️ Deleting existing articles from backend v1 Firestore...');
  const deleted = await deleteCollection(db.collection('articles'));
  console.log(`   ✓ Deleted ${deleted} documents from "articles"`);

  console.log('\n📥 Seeding articles into backend v1 Firestore...');
  const batch = db.batch();

  Object.entries(articlesData).forEach(([slug, article]) => {
    const ref = db.collection('articles').doc(slug);
    batch.set(ref, article as any);
  });

  await batch.commit();
  console.log(`   ✅ Seeded ${articlesCount} articles into "articles" collection.`);
  console.log('\n🎉 Seeding complete!');
}

main().catch(err => {
  console.error("Error in main:", err);
  process.exit(1);
});
