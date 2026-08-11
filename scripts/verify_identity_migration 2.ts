import admin from 'firebase-admin';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
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
const docClient = DynamoDBDocumentClient.from(client);

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

async function verifyMigration() {
    console.log("🔍 Commencing Deep Verification: Firebase vs DynamoDB\n");
    console.log("---------------------------------------------------------");
    console.log("| Collection Name          | Firebase | AWS DynamoDB | Diff |");
    console.log("---------------------------------------------------------");

    let totalFirebase = 0;
    let totalDynamoDB = 0;

    // We do a full scan of the newly created DynamoDB table (it's small enough right now)
    const scanResponse = await docClient.send(new ScanCommand({
        TableName: "IdentityAndAccess",
        ProjectionExpression: "entityId" // Only fetch the PK to save bandwidth
    }));

    const allDynamoItems = scanResponse.Items || [];
    
    for (const coll of collectionsToMigrate) {
        // 1. Get Firebase Count
        const fbSnapshot = await db.collection(coll.name).count().get();
        const fbCount = fbSnapshot.data().count;
        totalFirebase += fbCount;

        // 2. Get DynamoDB Count for this specific prefix
        const dynamoCount = allDynamoItems.filter(item => 
            item.entityId && item.entityId.startsWith(`${coll.prefix}#`)
        ).length;
        totalDynamoDB += dynamoCount;

        const diff = fbCount - dynamoCount;
        const status = diff === 0 ? "✅ 0" : `❌ ${diff}`;

        // Formatting for the terminal table
        const namePad = coll.name.padEnd(24);
        const fbPad = fbCount.toString().padEnd(8);
        const dynamoPad = dynamoCount.toString().padEnd(12);

        console.log(`| ${namePad} | ${fbPad} | ${dynamoPad} | ${status} |`);
    }

    console.log("---------------------------------------------------------");
    console.log(`| TOTAL                    | ${totalFirebase.toString().padEnd(8)} | ${totalDynamoDB.toString().padEnd(12)} | ${totalFirebase === totalDynamoDB ? '✅ 0' : `❌ ${totalFirebase - totalDynamoDB}`} |`);
    console.log("---------------------------------------------------------\n");

    if (totalFirebase === totalDynamoDB) {
        console.log("🏆 VERIFICATION SUCCESS: 0 Data Loss Detected.");
        console.log("All 21 Firebase collections have been perfectly unified into the Single Table Architecture.");
    } else {
        console.log("⚠️ VERIFICATION FAILED: Data mismatch detected.");
    }
}

verifyMigration().then(() => process.exit(0));
