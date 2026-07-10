const admin = require("firebase-admin");
const path = require("path");

// Use the existing firebase config from the backend
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkRaghav() {
  const usersSnap = await db.collection("users").where("username", "==", "Raghav").limit(1).get();
  if (usersSnap.empty) {
    console.log("Raghav not found in db");
    return;
  }
  
  const userData = usersSnap.docs[0].data();
  console.log("=== RAGHAV'S USER DOC ===");
  console.log("Username:", userData.username);
  console.log("Reputation Score:", userData.reputationScore);
  console.log("Accuracy:", userData.accuracy || "N/A");
  console.log("Prediction Count:", userData.predictionCount);
  console.log("Hot Take Count:", userData.hotTakeCount);
  console.log("Correct Predictions:", userData.correctPredictions);
  
  const postsSnap = await db.collection("roarPosts").where("authorUid", "==", usersSnap.docs[0].id).get();
  console.log("\n=== POSTS ===");
  console.log("Total roarPosts found for Raghav:", postsSnap.size);
  
  process.exit(0);
}

checkRaghav();
