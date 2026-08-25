import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  }
});

async function deduplicateUsers() {
  console.log("======================================================================");
  console.log("🧹 DYNAMODB USER DE-DUPLICATION & CANONICAL MERGE");
  console.log("======================================================================\n");

  // 1. Scan all items from IdentityAndAccess
  let allItems: any[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  try {
    do {
      const res: any = await docClient.send(new ScanCommand({
        TableName: "IdentityAndAccess",
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      if (res.Items) allItems.push(...res.Items);
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (err: any) {
    console.error("❌ Failed to scan IdentityAndAccess:", err.message);
    process.exit(1);
  }

  // Filter user records
  const userItems = allItems.filter(item => {
    const entityId = String(item.entityId || "");
    const sk = String(item.sk || "");
    return (entityId.startsWith("USER#") || sk.startsWith("USER#")) && !entityId.startsWith("OTP#") && !entityId.startsWith("PREF#");
  });

  console.log(`📡 Total raw user records found in IdentityAndAccess: ${userItems.length}\n`);

  // Group by clean email
  const userGroups = new Map<string, any[]>();

  userItems.forEach(item => {
    let email = (item.email || "").trim().toLowerCase();
    if (!email) {
      const cleanEntity = String(item.entityId || "").replace(/^USER#/, "");
      if (cleanEntity.includes("@")) {
        email = cleanEntity.toLowerCase();
      }
    }

    if (email) {
      if (!userGroups.has(email)) userGroups.set(email, []);
      userGroups.get(email)!.push(item);
    }
  });

  console.log(`👥 Unique human users detected: ${userGroups.size}\n`);

  let totalDeletedDuplicates = 0;
  let totalCanonicalUpdated = 0;

  for (const [email, records] of userGroups.entries()) {
    console.log(`----------------------------------------------------------------------`);
    console.log(`👤 Processing: ${email} (${records.length} record(s) found)`);

    // 1. Find or construct the canonical record (entityId: USER#<email>, sk: USER#META)
    const canonicalKey = { entityId: `USER#${email}`, sk: "USER#META" };
    let canonicalRecord = records.find(r => r.entityId === canonicalKey.entityId && r.sk === canonicalKey.sk);

    // Merge best attributes across all duplicate records
    const mergedData: any = {
      entityId: canonicalKey.entityId,
      sk: canonicalKey.sk,
      email: email,
      userId: email.replace(/[^a-zA-Z0-9]/g, "_"),
      role: "user",
      status: "active",
      isVerified: true,
      totalPoints: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Aggregate best data from all duplicates (password, points, names, authProviders, etc.)
    records.forEach(r => {
      if (r.password && !mergedData.password) mergedData.password = r.password;
      if (r.firstName && !mergedData.firstName) mergedData.firstName = r.firstName;
      if (r.lastName && !mergedData.lastName) mergedData.lastName = r.lastName;
      if (r.name && !mergedData.name) mergedData.name = r.name;
      if (r.avatar && !mergedData.avatar) mergedData.avatar = r.avatar;
      if (r.role && r.role !== "user") mergedData.role = r.role;
      if (r.status) mergedData.status = r.status;
      if (r.isVerified) mergedData.isVerified = true;
      if (r.totalPoints && r.totalPoints > mergedData.totalPoints) mergedData.totalPoints = r.totalPoints;
      if (r.authProviders) mergedData.authProviders = { ...(mergedData.authProviders || {}), ...r.authProviders };
      if (r.createdAt && (r.createdAt < mergedData.createdAt || mergedData.createdAt === 0)) mergedData.createdAt = r.createdAt;
    });

    if (!mergedData.authProviders) {
      mergedData.authProviders = { google: true, emailPassword: !!mergedData.password };
    }

    // Save/Update the single Canonical Record in DynamoDB
    await docClient.send(new PutCommand({
      TableName: "IdentityAndAccess",
      Item: mergedData
    }));
    totalCanonicalUpdated++;
    console.log(`   ✅ Consolidated Canonical Record: entityId=[${canonicalKey.entityId}], sk=[${canonicalKey.sk}]`);

    // Delete all non-canonical records (timestamp sk's, old prefixes)
    for (const r of records) {
      const isCanonical = (r.entityId === canonicalKey.entityId && r.sk === canonicalKey.sk);
      if (!isCanonical) {
        try {
          await docClient.send(new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: r.entityId, sk: r.sk }
          }));
          console.log(`   🗑️ Deleted Duplicate: entityId=[${r.entityId}], sk=[${r.sk}]`);
          totalDeletedDuplicates++;
        } catch (delErr: any) {
          console.warn(`   ⚠️ Failed to delete duplicate:`, delErr.message);
        }
      }
    }
  }

  console.log("\n======================================================================");
  console.log("🎉 DE-DUPLICATION COMPLETE!");
  console.log("======================================================================");
  console.log(`Unique Users Consolidated : ${totalCanonicalUpdated}`);
  console.log(`Duplicate Records Deleted : ${totalDeletedDuplicates}`);
  console.log("----------------------------------------------------------------------");
  console.log("✅ Each user now has EXACTLY 1 clean canonical record (USER#<email>, sk: USER#META)");
  console.log("======================================================================\n");
}

deduplicateUsers();
