import admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

const serviceAccountPath = path.resolve("C:/Users/HP/Downloads/sportsfan360-new-firebase-adminsdk-fbsvc-d2cb901c35.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

function generateNameTokens(fullName: string): string[] {
    const lower = fullName.toLowerCase().trim();
    const parts = lower.split(/\s+/);
    const tokens = new Set<string>();

    tokens.add(lower);

    for (const part of parts) {
        for (let i = 1; i <= part.length; i++) {
            tokens.add(part.slice(0, i));
        }
    }

    return Array.from(tokens);
}

async function backfill() {
    console.log("Starting backfill...");

    const snapshot = await db.collection("playershome").get();
    console.log(`Found ${snapshot.docs.length} documents`);

    const BATCH_SIZE = 500;
    let batch = db.batch();
    let count = 0;
    let batchCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const playerName = data.playerName as string;

        if (!playerName) {
            console.warn(`Skipping doc ${doc.id} — no playerName`);
            continue;
        }

        const tokens = generateNameTokens(playerName);

        batch.update(doc.ref, {
            playerNameTokens: tokens,
            playerNameLower: playerName.toLowerCase().trim(),
        });

        count++;
        batchCount++;

        console.log(`Queued: ${playerName} → [${tokens.join(", ")}]`);

        if (batchCount === BATCH_SIZE) {
            await batch.commit();
            console.log(` Committed batch of ${BATCH_SIZE}`);
            batch = db.batch();
            batchCount = 0;
        }
    }

    if (batchCount > 0) {
        await batch.commit();
        console.log(`Committed final batch of ${batchCount}`);
    }

    console.log(`\n Backfill complete! Updated ${count} documents.`);
}

backfill().catch(console.error);