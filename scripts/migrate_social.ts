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
                    "SocialAndContent": batch
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

            // Determine a fallback timestamp for the Sort Key (sk) if createdAt doesn't exist
            const timestamp = data.createdAt || data.timestamp || Date.now();

            const item = {
                contentId: `${prefix}#${doc.id}`, 
                sk: `${prefix}#${timestamp}`, // Sort key format: TYPE#TIMESTAMP
                ...data,
                status: "ACTIVE"
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
    console.log("🚀 Starting Phase 1.3: SocialAndContent Migration (33 Collections)...");
    
    const collectionsToMigrate = [
        { name: 'articles', prefix: 'ARTICLE' },
        { name: 'cricketArticles', prefix: 'ARTICLE_CRICKET' },
        { name: 'news', prefix: 'NEWS' },
        { name: 'playbook', prefix: 'PLAYBOOK' },
        { name: 'socialPosts', prefix: 'POST_SOCIAL' },
        { name: 'roarPosts', prefix: 'POST_ROAR' },
        { name: 'players360Posts', prefix: 'POST_PLAYER360' },
        { name: 'team360Posts', prefix: 'POST_TEAM360' },
        { name: 'comments', prefix: 'COMMENT' },
        { name: 'likes', prefix: 'LIKE' },
        { name: 'reactions', prefix: 'REACTION' },
        { name: 'emojiReactions', prefix: 'REACTION_EMOJI' },
        { name: 'polls', prefix: 'POLL' },
        { name: 'pollVotes', prefix: 'VOTE_POLL' },
        { name: 'votes', prefix: 'VOTE' },
        { name: 'battleVotes', prefix: 'VOTE_BATTLE' },
        { name: 'roarVotes', prefix: 'VOTE_ROAR' },
        { name: 'userVotes', prefix: 'VOTE_USER' },
        { name: 'postReports', prefix: 'REPORT' },
        { name: 'postPreferences', prefix: 'PREF_POST' },
        { name: 'feedbackQuestions', prefix: 'FEEDBACK_Q' },
        { name: 'feedbackSubmissions', prefix: 'FEEDBACK_SUB' },
        { name: 'reporterReputation', prefix: 'REP_REPORTER' },
        { name: 'recentlyViewed', prefix: 'VIEW_RECENT' },
        { name: 'seen_drops', prefix: 'SEEN_DROP' },
        { name: 'wishlist', prefix: 'WISHLIST' },
        { name: 'followRequests', prefix: 'REQ_FOLLOW' },
        { name: 'dropRequests', prefix: 'REQ_DROP' },
        { name: 'userPins', prefix: 'PIN_USER' },
        { name: 'userStrikes', prefix: 'STRIKE_USER' },
        { name: 'answers', prefix: 'ANSWER' },
        { name: 'replies', prefix: 'REPLY' },
        { name: 'dollyReplies', prefix: 'REPLY_DOLLY' }
    ];

    for (const coll of collectionsToMigrate) {
        await migrateCollection(coll.name, coll.prefix);
    }

    console.log("\n🎉 Phase 1.3 Social Migration Complete! All 33 collections mapped and migrated.");
    process.exit(0);
}

startMigration();
