const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Load .env manually
const envPath = path.join(__dirname, ".env");
if (!fs.existsSync(envPath)) {
  console.error("Could not find backend .env file at:", envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
  if (match) {
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    env[match[1].trim()] = val;
  }
});

const projectId = env.FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY ? env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") : undefined;

if (!projectId || !clientEmail || !privateKey) {
  console.error("Missing Firebase env variables in .env.local!");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

const db = admin.firestore();
db.settings({ databaseId: "(default)" });

const mockWeeks = [
  {
    week: 1,
    label: "Week 1",
    startDate: "2026-07-01",
    endDate: "2026-07-07",
    dateRange: "July 1 – July 7",
    theme: "High Jump Technique & Acceleration Mechanics",
    drops: [
      {
        id: "drop-1-1",
        type: "Video",
        title: "Decathlon High Jump Technical Breakdown",
        meta: "12m 45s",
        date: "2026-07-02",
        day: "Thu",
        views: "1.2k",
        color: "#c9115f",
        path: "/MainModules/AtheleteMedia/VideoScreen/decathlon-hj-breakdown"
      },
      {
        id: "drop-1-2",
        type: "Audio",
        title: "High Jump Mindset with Tejaswin Shankar",
        meta: "8m 12s",
        date: "2026-07-04",
        day: "Sat",
        views: "890",
        color: "#0ea5e9",
        path: "/MainModules/AtheleteMedia/AudioPlayerScreen/hj-mindset"
      },
      {
        id: "drop-1-3",
        type: "Article",
        title: "AFI Performance Standards for CWG 2026",
        meta: "4 min read",
        date: "2026-07-06",
        day: "Mon",
        views: "2.4k",
        color: "#cd620e",
        path: "/MainModules/AtheleteArticles/afi-performance-standards"
      }
    ]
  },
  {
    week: 2,
    label: "Week 2",
    startDate: "2026-07-08",
    endDate: "2026-07-14",
    dateRange: "July 8 – July 14",
    theme: "Decathlon Conditioning & Nutrition Guidelines",
    drops: [
      {
        id: "drop-2-1",
        type: "Video",
        title: "Gurindervir's Block Start Acceleration Drills",
        meta: "15m 30s",
        date: "2026-07-09",
        day: "Thu",
        views: "3.1k",
        color: "#c9115f",
        path: "/MainModules/AtheleteMedia/VideoScreen/block-start-drills"
      },
      {
        id: "drop-2-2",
        type: "Audio",
        title: "Decathlete Diet & Loading Phase Strategy",
        meta: "10m 5s",
        date: "2026-07-11",
        day: "Sat",
        views: "1.5k",
        color: "#0ea5e9",
        path: "/MainModules/AtheleteMedia/AudioPlayerScreen/decathlete-diet"
      }
    ]
  }
];

async function run() {
  console.log("Checking playbook collection...");
  const snap = await db.collection("playbook").get();
  
  if (snap.empty) {
    console.log("Playbook collection is empty. Seeding mock data...");
    const batch = db.batch();
    mockWeeks.forEach((week) => {
      const ref = db.collection("playbook").doc(`week-${week.week}`);
      batch.set(ref, week);
    });
    await batch.commit();
    console.log("Seeding complete!");
  } else {
    console.log(`Found ${snap.docs.length} playbook documents:`);
    snap.docs.forEach(doc => {
      console.log(`- Doc ${doc.id}:`, JSON.stringify(doc.data(), null, 2));
    });
  }
}

run().catch(console.error);
