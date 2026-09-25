
const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
    let serviceAccount;
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    } catch (e) {
        // sometimes it's base64 encoded
        serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('ascii'));
    }
    if (Object.keys(serviceAccount).length > 0) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        console.log("No FIREBASE_SERVICE_ACCOUNT_KEY found.");
        process.exit(1);
    }
}

const db = admin.firestore();

async function checkRecentUsers() {
    try {
        console.log("Checking recent users in Firebase...");
        const snapshot = await db.collection('users').orderBy('createdAt', 'desc').limit(20).get();
        if (snapshot.empty) {
            console.log("No users found.");
            return;
        }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`Email: ${doc.id} | Name: ${data.firstName || ''} ${data.lastName || ''} | Provider: ${data.provider}`);
        });
    } catch (e) {
        console.log("Error:", e);
    }
}

checkRecentUsers();
