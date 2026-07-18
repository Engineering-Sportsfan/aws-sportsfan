require("dotenv").config({ path: ".env.local" });
const admin = require("firebase-admin");

const app = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = admin.firestore(app);

async function run() {
  try {
    const user = await db.collection("users").doc("prisha.dureja@sportsfan360.com").get();
    console.log("EXISTS:", user.exists);
    if (user.exists) {
      console.log("STATUS:", user.data().status);
      console.log("ROLE:", user.data().role);
    } else {
      console.log("User does not exist in sportsfan360-new!");
    }
  } catch(e) {
    console.error("Firestore error:", e);
  }
}
run();
