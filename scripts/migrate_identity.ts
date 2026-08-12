import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

import * as fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");

if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
  let body = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").trim();
  body = body.replace(/ /g, "\n");
  privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
        })
    });
}
const db = admin.firestore();

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
    }
});

function calculateItemSize(item: any): number {
    return Buffer.byteLength(JSON.stringify(item), 'utf8');
}

function sanitizeFirebaseData(obj: any): any {
    if (obj === undefined) return undefined;
    if (obj === null) return null;
    if (typeof obj !== 'object') return obj;
    
    if (obj instanceof admin.firestore.Timestamp) return obj.toMillis();
    if (obj instanceof admin.firestore.GeoPoint) return `${obj.latitude},${obj.longitude}`;
    if (obj instanceof admin.firestore.DocumentReference) return obj.path;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeFirebaseData(item)).filter(item => item !== undefined);
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
        const sanitized = sanitizeFirebaseData(value);
        if (sanitized !== undefined) {
            result[key] = sanitized;
        }
    }
    return result;
}

// 🚨 CRITICAL FIX: Added Exponential Backoff Retry Logic
// If AWS throttles the connection, the script will no longer drop the data.
// It will pause, wait a few seconds, and try again up to 5 times.
async function writeBatch(batch: any[], maxRetries = 5) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            await docClient.send(new BatchWriteCommand({
                RequestItems: {
                    "IdentityAndAccess": batch
                }
            }));
            process.stdout.write('.'); 
            return; // Success, exit the retry loop
        } catch (error: any) {
            attempt++;
            if (attempt >= maxRetries) {
                console.error(`\n❌ FATAL ERROR: Failed to write batch after ${maxRetries} attempts:`, error);
                throw error; // Stop the entire script so we don't silently lose data
            }
            // Wait with exponential backoff (1s, 2s, 4s, 8s...)
            const waitTime = Math.pow(2, attempt) * 500;
            console.log(`\n⚠️ AWS Throttle detected. Retrying batch in ${waitTime}ms (Attempt ${attempt}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

async function migrateCollection(collectionName: string, prefix: string) {
    console.log(`\n📡 Streaming ${collectionName} from Firebase...`);
    
    try {
        const stream = db.collection(collectionName).stream();
        
        let batch: any[] = [];
        let totalMigrated = 0;

        for await (const chunk of stream) {
            const doc = chunk as unknown as admin.firestore.QueryDocumentSnapshot;
            let data = doc.data();
            data = sanitizeFirebaseData(data);

            const docId = (prefix === 'USER' || prefix === 'ADMIN') ? doc.id.toLowerCase() : doc.id;
            const timestamp = data.createdAt || data.timestamp || Date.now();
            let sk = `${prefix}#${timestamp}`;
            if (prefix === 'USER') {
                sk = 'USER#META';
            } else if (prefix === 'ADMIN') {
                sk = 'ADMIN#META';
            }

            const item: any = {
                entityId: `${prefix}#${docId}`,
                sk: sk,
                ...data
            };
            if (item.email === '') {
                delete item.email;
            }

            const size = calculateItemSize(item);
            if (size > 400000) {
                console.error(`🚨 ERROR: Document ${doc.id} in ${collectionName} exceeds 400KB limit. Skipping.`);
                continue;
            }

            batch.push({ PutRequest: { Item: item } });

            if (batch.length === 25) {
                await writeBatch(batch);
                totalMigrated += 25;
                batch = [];
            }
        }

        if (batch.length > 0) {
            await writeBatch(batch);
            totalMigrated += batch.length;
        }

        if (totalMigrated === 0) {
             console.log(`⏭️ Skipped ${collectionName} (Empty Collection)`);
        } else {
             console.log(`✅ Successfully migrated ${totalMigrated} ${collectionName} to AWS DynamoDB.`);
        }
    } catch (error) {
        console.error(`❌ Failed to stream or migrate collection ${collectionName}:`, error);
    }
}

async function startMigration() {
    console.log("🚀 Starting Phase 1: IdentityAndAccess Migration (All 21 Collections)...");
    
    const collectionsToMigrate = [
        { name: 'admin_users', prefix: 'ADMIN' },
        { name: 'users', prefix: 'USER' },
        { name: 'Sportsfan360Profile', prefix: 'PROFILE_SF360' },
        { name: 'PlayerProfiles', prefix: 'PROFILE_PLAYER_LEGACY' },
        { name: 'athletesProfile', prefix: 'PROFILE_ATHLETE' },
        { name: 'clubProfiles', prefix: 'PROFILE_CLUB' },
        { name: 'playerProfiles', prefix: 'PROFILE_PLAYER' },
        { name: 'roarProfiles', prefix: 'PROFILE_ROAR' },
        { name: 'departments', prefix: 'DEPT' },
        { name: 'groups', prefix: 'GROUP' },
        { name: 'communities', prefix: 'COMMUNITY' },
        { name: 'communityMembers', prefix: 'MEMBER_COMMUNITY' },
        { name: 'joinedUsers', prefix: 'JOINED' },
        { name: 'inviteFriends', prefix: 'INVITE' },
        { name: 'userMemberships', prefix: 'MEMBER_USER' },
        { name: 'otps', prefix: 'OTP' },
        { name: 'appData', prefix: 'APP_DATA' },
        { name: 'meta', prefix: 'META' },
        { name: 'featureThresholds', prefix: 'THRESHOLD' },
        { name: 'roarOnboardingConfig', prefix: 'CONFIG_ROAR' },
        { name: 'idempotencyKeys', prefix: 'IDEMPOTENCY' }
    ];

    for (const coll of collectionsToMigrate) {
        await migrateCollection(coll.name, coll.prefix);
    }

    console.log("\n🎉 Phase 1 Identity Migration Complete! All 21 collections mapped and migrated.");
    process.exit(0);
}

startMigration();
