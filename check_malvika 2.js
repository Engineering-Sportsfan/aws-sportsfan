const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function check() {
  const q1 = await db.collection("users").where("username", "==", "Malvika Seh").get();
  console.log("Malvika Seh users found:", q1.size);
  if (!q1.empty) {
     console.log("ID:", q1.docs[0].id);
     const posts = await db.collection("roarPosts").where("authorUid", "==", q1.docs[0].id).get();
     console.log("Posts for Malvika:", posts.size);
  }

  const q2 = await db.collection("users").where("username", "==", "Watermelon Kuku").get();
  console.log("Watermelon Kuku users found:", q2.size);
  
  process.exit(0);
}
check();
