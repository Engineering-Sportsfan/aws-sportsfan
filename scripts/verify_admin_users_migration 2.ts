import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

import admin from 'firebase-admin';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ScanCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// 1. Initialize Firebase Admin
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

// 2. Initialize AWS DynamoDB
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const DYNAMO_TABLE_NAME = 'AdminUsers';

async function generateCSV(filename: string, records: any[]) {
    if (records.length === 0) return;
    
    // Extract headers dynamically from the first record
    const headers = Object.keys(records[0]).map(key => ({ id: key, title: key }));
    
    const csvWriter = createObjectCsvWriter({
        path: filename,
        header: headers
    });

    await csvWriter.writeRecords(records);
    console.log(`✅ CSV Written: ${filename}`);
}

async function verifyMigration() {
  console.log(`🔍 Starting CSV Export and Verification...`);
  
  try {
    // ------------------------------------------------------------------------
    // Step 1: Export Firebase to CSV
    // ------------------------------------------------------------------------
    console.log('\n📡 Fetching Firebase records...');
    const snapshot = await db.collection('admin_users').get();
    
    const firebaseRecords: any[] = [];
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      let createdAt = data.createdAt;
      if (createdAt && typeof createdAt.toDate === 'function') {
        createdAt = createdAt.toDate().toISOString();
      }
      firebaseRecords.push({ email: doc.id, ...data, createdAt });
    });

    // Sort by email for consistent comparison
    firebaseRecords.sort((a, b) => a.email.localeCompare(b.email));
    await generateCSV('firebase_admin_users.csv', firebaseRecords);

    // ------------------------------------------------------------------------
    // Step 2: Export DynamoDB to CSV
    // ------------------------------------------------------------------------
    console.log('\n📡 Fetching DynamoDB records...');
    const scanCommand = new ScanCommand({ TableName: DYNAMO_TABLE_NAME });
    const dynamoData = await docClient.send(scanCommand);
    
    const dynamoRecords = dynamoData.Items || [];
    // Sort by email for consistent comparison
    dynamoRecords.sort((a, b) => a.email.localeCompare(b.email));
    await generateCSV('dynamo_admin_users.csv', dynamoRecords);

    // ------------------------------------------------------------------------
    // Step 3: Mathematical Comparison
    // ------------------------------------------------------------------------
    console.log('\n⚖️ Comparing Datasets...');
    if (firebaseRecords.length !== dynamoRecords.length) {
        console.error(`❌ Mismatch in total records! Firebase: ${firebaseRecords.length} vs DynamoDB: ${dynamoRecords.length}`);
        return;
    }

    const sortObjectKeys = (obj: any) => Object.keys(obj).sort().reduce((res: any, key) => { res[key] = obj[key]; return res; }, {});

    let diffCount = 0;
    for (let i = 0; i < firebaseRecords.length; i++) {
        const fbStr = JSON.stringify(sortObjectKeys(firebaseRecords[i]));
        const dynStr = JSON.stringify(sortObjectKeys(dynamoRecords[i]));
        if (fbStr !== dynStr) {
            console.error(`❌ Mismatch on row ${i} (${firebaseRecords[i].email})`);
            console.error(`   Firebase: ${fbStr}`);
            console.error(`   DynamoDB: ${dynStr}`);
            diffCount++;
        }
    }

    if (diffCount === 0) {
        console.log('\n🎉 TEST PASSED! 0 differences found.');
        console.log('Mathematical proof established: Data migrated from Firebase to DynamoDB perfectly.');
    } else {
        console.log(`\n⚠️ Failed with ${diffCount} mismatches. Check the logs.`);
    }

  } catch (error) {
    console.error('💥 Fatal error during verification:', error);
  }
}

verifyMigration();
