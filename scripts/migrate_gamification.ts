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
                    "GamificationAndWallet": batch
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

            // In Gamification, records are heavily tied to the user.
            // If the document doesn't have a userId, we fall back to the document ID.
            const userId = data.userId || data.uid || doc.id;
            const timestamp = data.createdAt || data.timestamp || Date.now();

            const item = {
                userId: `USER#${userId}`, 
                sk: `${prefix}#${doc.id}#${timestamp}`, 
                ...data
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
    console.log("🚀 Starting Phase 1.4: GamificationAndWallet Migration (28 Collections)...");
    
    const collectionsToMigrate = [
        { name: 'wallet_transactions', prefix: 'TX_WALLET' },
        { name: 'pointTransactions', prefix: 'TX_POINT' },
        { name: 'userPointTransactions', prefix: 'TX_USER_POINT' },
        { name: 'reward_coins_ledger', prefix: 'LEDGER_REWARD' },
        { name: 'revenue_splits', prefix: 'REVENUE_SPLIT' },
        { name: 'pointRules', prefix: 'RULE_POINT' },
        { name: 'multipliers', prefix: 'MULTIPLIER' },
        { name: 'roarBadges', prefix: 'BADGE_ROAR' },
        { name: 'roarProgress', prefix: 'PROG_ROAR' },
        { name: 'recordProgress', prefix: 'PROG_RECORD' },
        { name: 'audioProgress', prefix: 'PROG_AUDIO' },
        { name: 'videoProgress', prefix: 'PROG_VIDEO' },
        { name: 'leaderboard', prefix: 'LEADERBOARD' },
        { name: 'globalLeaderboard', prefix: 'LEADERBOARD_GLOBAL' },
        { name: 'quizLeaderboard', prefix: 'LEADERBOARD_QUIZ' },
        { name: 'globalLevels', prefix: 'LEVEL_GLOBAL' },
        { name: 'records', prefix: 'RECORD' },
        { name: 'recordStories', prefix: 'RECORD_STORY' },
        { name: 'recordTrends', prefix: 'RECORD_TREND' },
        { name: 'triviaAnswers', prefix: 'TRIVIA_ANSWER' },
        { name: 'quizAnswers', prefix: 'QUIZ_ANSWER' },
        { name: 'quizQuestions', prefix: 'QUIZ_QUESTION' },
        { name: 'predictions', prefix: 'PREDICTION' },
        { name: 'fanBattles', prefix: 'BATTLE_FAN' },
        { name: 'fanBattleQuizzes', prefix: 'BATTLE_QUIZ' },
        { name: 'fanBattleResponses', prefix: 'BATTLE_RESP' },
        { name: 'fanBattleSessions', prefix: 'BATTLE_SESS' },
        { name: 'battleSessions', prefix: 'SESS_BATTLE' }
    ];

    for (const coll of collectionsToMigrate) {
        await migrateCollection(coll.name, coll.prefix);
    }

    console.log("\n🎉 Phase 1.4 Gamification Migration Complete! All 28 collections mapped and migrated.");
    process.exit(0);
}

startMigration();
