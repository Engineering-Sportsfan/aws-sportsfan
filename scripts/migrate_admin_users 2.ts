import * as dotenv from 'dotenv';
import * as path from 'path';
// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import admin from 'firebase-admin';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// 1. Initialize Firebase Admin (Read-Only Source)
if (!admin.apps.length) {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");
  
  if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
    let body = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").trim();
    body = body.replace(/ /g, "\n");
    privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true, databaseId: "(default)" });

// 2. Initialize AWS DynamoDB (Write Destination)
// Ensure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION are in your .env
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const DYNAMO_TABLE_NAME = 'AdminUsers';

async function migrateAdminUsers() {
  console.log(`🚀 Starting migration of admin_users from Firebase to DynamoDB table: ${DYNAMO_TABLE_NAME}`);
  
  try {
    // Read from Firebase
    console.log('📡 Fetching records from Firebase...');
    const snapshot = await db.collection('admin_users').get();
    
    if (snapshot.empty) {
      console.log('⚠️ No admin users found in Firebase.');
      return;
    }

    console.log(`✅ Found ${snapshot.size} admin users. Starting DynamoDB inserts...`);

    let successCount = 0;
    let errorCount = 0;

    // Iterate and map fields
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // MAPPING ENGINE: Translate Firebase specific fields to standard formats
      // Convert Firestore Timestamp to ISO String
      let createdAt = data.createdAt;
      if (createdAt && typeof createdAt.toDate === 'function') {
        createdAt = createdAt.toDate().toISOString();
      }

      // Construct the DynamoDB Item
      // In Firebase, the document ID is the email for admin_users
      const email = doc.id; 
      
      const dynamoItem = {
        email: email, 
        ...data,
        createdAt: createdAt
      };

      // Write to DynamoDB
      try {
        const command = new PutCommand({
          TableName: DYNAMO_TABLE_NAME,
          Item: dynamoItem,
        });
        await docClient.send(command);
        console.log(`✅ Successfully migrated: ${email}`);
        successCount++;
      } catch (err) {
        console.error(`❌ Failed to migrate: ${email}`, err);
        errorCount++;
      }
    }

    console.log('\n🎉 Migration Complete!');
    console.log(`Total Success: ${successCount}`);
    console.log(`Total Failed: ${errorCount}`);

  } catch (error) {
    console.error('💥 Fatal error during migration:', error);
  }
}

migrateAdminUsers();
