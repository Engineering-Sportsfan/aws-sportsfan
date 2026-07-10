import admin from "firebase-admin"
import { createRequire } from "module"

// Load the service account JSON safely using createRequire
// (JSON imports via ESM require an assertion in some Node versions)
const require = createRequire(import.meta.url)
const serviceAccount = require("../firebase-service-account.json")

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const db = admin.firestore()

export default db