async function run() {
  const db = require("./lib/firebaseAdmin").db;
  const snap = await db.collection("roarPosts").where("authorUsername", "==", "Watermelon Kuku").get();
  console.log("Posts by Watermelon Kuku:", snap.size);
  if (!snap.empty) {
     snap.docs.forEach(d => {
       console.log("Post:", d.data().content, "AuthorUID:", d.data().authorUid, "Type:", d.data().type);
     });
  }
  const malvikaSnap = await db.collection("users").where("username", "==", "Malvika Seh").get();
  if (!malvikaSnap.empty) {
     console.log("Malvika Seh UID:", malvikaSnap.docs[0].id);
  }
  process.exit(0);
}
run();
