const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// 1. Load env files manually
const envLocalPath = path.resolve(__dirname, './.env.local');
const envPath = path.resolve(__dirname, './.env');

const loadEnvFile = (filePath) => {
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

const newProducts = [
  {
    id: "brand-product-25",
    brand: "ASICS Run",
    category: "brands",
    governance_state: "approved",
    title: "Gel-Nimbus 25 Marathon Edition",
    description: "Premium marathon running shoe with advanced GEL cushioning for maximum comfort and long-distance performance.",
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=300&h=300&fit=crop&auto=format",
    pricePaise: 1449900,
    originalPriceVal: 1699900,
    currency: "INR",
    variants: [
      { id: "uk7", size: "UK 7", stock: 3, available: true },
      { id: "uk8", size: "UK 8", stock: 3, available: true },
      { id: "uk9", size: "UK 9", stock: 2, available: true },
      { id: "uk10", size: "UK 10", stock: 2, available: true }
    ],
    totalStock: 10,
    rating: 4.9,
    reviews: 218,
    rewardCoins: 725,
    tag: { label: "Flash Sale", color: "#CD620E" },
    isFeatured: true,
    isAvailable: true
  },
  {
    id: "brand-product-26",
    brand: "Adidas India",
    category: "brands",
    governance_state: "approved",
    title: "Adizero Distance Running Shoe",
    description: "Lightweight performance running shoe built for speed, comfort, and long-distance runs.",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop&auto=format",
    pricePaise: 899900,
    originalPriceVal: 1299900,
    currency: "INR",
    variants: [
      { id: "uk7", size: "UK 7", stock: 2, available: true },
      { id: "uk8", size: "UK 8", stock: 3, available: true },
      { id: "uk9", size: "UK 9", stock: 2, available: true },
      { id: "uk10", size: "UK 10", stock: 2, available: true },
      { id: "uk11", size: "UK 11", stock: 1, available: true }
    ],
    totalStock: 10,
    rating: 4.7,
    reviews: 342,
    rewardCoins: 450,
    tag: { label: "Sale", color: "#C9115F" },
    isFeatured: true,
    isAvailable: true
  },
  {
    id: "brand-product-27",
    brand: "Decathlon",
    category: "brands",
    governance_state: "approved",
    title: "Kalenji Run Support Compression Tights",
    description: "Comfortable compression running tights designed to provide muscle support and improve performance during workouts and long-distance runs.",
    image: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=300&h=300&fit=crop&auto=format",
    pricePaise: 149900,
    originalPriceVal: 219900,
    currency: "INR",
    variants: [
      { id: "s", size: "S", stock: 3, available: true },
      { id: "m", size: "M", stock: 3, available: true },
      { id: "l", size: "L", stock: 2, available: true },
      { id: "xl", size: "XL", stock: 2, available: true }
    ],
    totalStock: 10,
    rating: 4.4,
    reviews: 891,
    rewardCoins: 75,
    tag: { label: "Popular", color: "#C9115F" },
    isFeatured: true,
    isAvailable: true
  },
  {
    id: "brand-product-28",
    brand: "Puma Sports",
    category: "brands",
    governance_state: "approved",
    title: "EvoStrider Track & Field Spike",
    description: "Professional track and field spikes engineered for speed, grip, and explosive performance during sprint and athletics competitions.",
    image: "https://images.unsplash.com/photo-1584735175097-9ba52c0fc3d7?w=300&h=300&fit=crop&auto=format",
    pricePaise: 629900,
    originalPriceVal: 789900,
    currency: "INR",
    variants: [
      { id: "uk7", size: "UK 7", stock: 2, available: true },
      { id: "uk8", size: "UK 8", stock: 2, available: true },
      { id: "uk9", size: "UK 9", stock: 2, available: true },
      { id: "uk10", size: "UK 10", stock: 2, available: true },
      { id: "uk11", size: "UK 11", stock: 2, available: true }
    ],
    totalStock: 10,
    rating: 4.6,
    reviews: 156,
    rewardCoins: 315,
    tag: { label: "Student Deal", color: "#00c864" },
    isFeatured: true,
    isAvailable: true
  },
  {
    id: "brand-product-29",
    brand: "NikeRun Club",
    category: "brands",
    governance_state: "approved",
    title: "Vaporfly 3 — Competition Road Racing",
    description: "Elite carbon-plated road racing shoe built for maximum speed, energy return, and marathon performance.",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop&auto=format",
    pricePaise: 1999900,
    originalPriceVal: 1999900,
    currency: "INR",
    variants: [
      { id: "uk7", size: "UK 7", stock: 2, available: true },
      { id: "uk8", size: "UK 8", stock: 2, available: true },
      { id: "uk85", size: "UK 8.5", stock: 2, available: true },
      { id: "uk9", size: "UK 9", stock: 2, available: true },
      { id: "uk10", size: "UK 10", stock: 2, available: true }
    ],
    totalStock: 10,
    rating: 4.9,
    reviews: 512,
    rewardCoins: 1000,
    tag: { label: "New", color: "#6b7280" },
    isFeatured: true,
    isAvailable: true
  },
  {
    id: "brand-product-30",
    brand: "Decathlon",
    category: "brands",
    governance_state: "approved",
    title: "Kiprun KS900 Long Distance Running Shoe",
    description: "Premium long-distance running shoe offering exceptional cushioning, stability, and comfort for everyday training and marathon runners.",
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop&auto=format",
    pricePaise: 499900,
    originalPriceVal: 599900,
    currency: "INR",
    variants: [
      { id: "uk6", size: "UK 6", stock: 2, available: true },
      { id: "uk7", size: "UK 7", stock: 2, available: true },
      { id: "uk8", size: "UK 8", stock: 2, available: true },
      { id: "uk9", size: "UK 9", stock: 2, available: true },
      { id: "uk10", size: "UK 10", stock: 1, available: true },
      { id: "uk11", size: "UK 11", stock: 1, available: true }
    ],
    totalStock: 10,
    rating: 4.5,
    reviews: 1245,
    rewardCoins: 250,
    tag: { label: "₹500 off", color: "#c9115f" },
    isFeatured: true,
    isAvailable: true
  }
];

async function seed() {
  console.log("Seeding brand products...");
  const batch = db.batch();
  newProducts.forEach((p) => {
    const ref = db.collection("storeProducts").doc(p.id);
    batch.set(ref, {
      ...p,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
  console.log("Seeding brand products successfully complete!");
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
