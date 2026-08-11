import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

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

async function writeBatch(batch: any[], maxRetries = 5) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            await docClient.send(new BatchWriteCommand({
                RequestItems: {
                    "RealTimeChat": batch
                }
            }));
            process.stdout.write('.'); 
            return; 
        } catch (error: any) {
            attempt++;
            if (attempt >= maxRetries) {
                console.error(`\n❌ FATAL ERROR: Failed to write batch after ${maxRetries} attempts:`, error);
                throw error;
            }
            const waitTime = Math.pow(2, attempt) * 500;
            console.log(`\n⚠️ AWS Throttle detected. Retrying batch in ${waitTime}ms...`);
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

            const timestamp = data.createdAt || data.timestamp || Date.now();
            
            // Chat revolves around rooms, sessions, or channels.
            // If the document doesn't explicitly have a roomId, use doc.id as the root room.
            const roomId = data.roomId || data.channelId || data.sessionId || doc.id;
            
            const item = {
                roomId: `ROOM#${roomId}`, 
                sk: `${prefix}#${doc.id}#${timestamp}`, 
                ...data,
                ...(data.isActive !== undefined && { isActive: data.isActive ? "true" : "false" })
            };

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
    console.log("🚀 Starting Phase 1.7: RealTimeChat Migration (18 Collections)...");
    
    const collectionsToMigrate = [
        { name: 'rooms', prefix: 'ROOM_META' },
        { name: 'watchAlongRooms', prefix: 'ROOM_WATCHALONG' },
        { name: 'roarRooms', prefix: 'ROOM_ROAR' },
        { name: 'channels', prefix: 'CHANNEL' },
        { name: 'chats', prefix: 'CHAT' },
        { name: 'messages', prefix: 'MSG' },
        { name: 'audioMessages', prefix: 'MSG_AUDIO' },
        { name: 'videoMessages', prefix: 'MSG_VIDEO' },
        { name: 'notifications', prefix: 'NOTIFICATION' },
        { name: 'activityLog', prefix: 'ACTIVITY' },
        { name: 'presence', prefix: 'PRESENCE' },
        { name: 'askaiConversations', prefix: 'AI_CONVO' },
        { name: 'dollySessions', prefix: 'SESSION_DOLLY' },
        { name: 'sessions', prefix: 'SESSION' },
        { name: 'session_requests', prefix: 'SESSION_REQ' },
        { name: 'slots', prefix: 'SLOT' },
        { name: 'tracks', prefix: 'TRACK' },
        { name: 'library', prefix: 'LIBRARY' }
    ];

    for (const coll of collectionsToMigrate) {
        await migrateCollection(coll.name, coll.prefix);
    }

    console.log("\n🎉 Phase 1.7 RealTimeChat Migration Complete! All 18 collections mapped and migrated.");
    process.exit(0);
}

startMigration();
