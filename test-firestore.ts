import { db } from "./lib/firebaseAdmin";
async function run() {
  const user = await db.collection("users").doc("prisha.dureja@sportsfan360.com").get();
  console.log("EXISTS:", user.exists);
  if (user.exists) {
    console.log("DATA:", user.data());
  }
}
run().catch(console.error);
