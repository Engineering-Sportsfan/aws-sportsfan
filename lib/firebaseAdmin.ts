


// import "server-only";

// import admin from "firebase-admin";

// let db: FirebaseFirestore.Firestore;

// if (!admin.apps.length) {
//   console.log("Initializing Firebase Admin...");

//   const app = admin.initializeApp({
//     credential: admin.credential.cert({
//       projectId: process.env.FIREBASE_PROJECT_ID,
//       clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//       privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
//     }),
//   });

//   db = admin.firestore(app);
//   db.settings({
//     ignoreUndefinedProperties: true,
//     databaseId: "(default)", // ✅ fix: parentheses required
//   });

//   console.log("Firebase initialized, project:", process.env.FIREBASE_PROJECT_ID);
// } else {
//   console.log("Reusing existing Firebase app");
//   db = admin.firestore(admin.apps[0]!); // ✅ fix: reuse the specific app, not a new instance
// }

// export { db };



import "server-only";

import admin from "firebase-admin";

let db: FirebaseFirestore.Firestore;
let auth: admin.auth.Auth;

if (!admin.apps.length) {
  console.log("Initializing Firebase Admin...");

  const app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });

  db = admin.firestore(app);
  db.settings({
    ignoreUndefinedProperties: true,
    databaseId: "(default)",
  });

  auth = admin.auth(app);

  console.log("Firebase initialized, project:", process.env.FIREBASE_PROJECT_ID);
} else {
  console.log("Reusing existing Firebase app");
  const app = admin.apps[0]!;
  db = admin.firestore(app);
  auth = admin.auth(app);
}

export { db, auth };