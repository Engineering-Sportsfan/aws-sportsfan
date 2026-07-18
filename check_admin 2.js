const admin = require("firebase-admin");
const path = require("path");

// Set env variable to point to service account if needed
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080"; // Firestore emulator is running locally

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "sportsfan360-new"
  });
}

const db = admin.firestore();

async function check() {
  const snap = await db.collection("users").get();
  console.log("USERS COUNT:", snap.size);
  snap.forEach(doc => {
    console.log("USER:", doc.id, doc.data());
  });
}

check().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
