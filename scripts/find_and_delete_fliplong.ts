import dotenv from "dotenv";
dotenv.config();

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure DynamoDB
const accessKeyId = process.env.CUSTOM_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.CUSTOM_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const credentials = accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  ...(credentials && { credentials }),
});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});

// Configure Firebase Admin
let db: FirebaseFirestore.Firestore | null = null;
try {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");
  if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
    let body = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").trim();
    body = body.replace(/ /g, "\n");
    privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
  }

  if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
    db = admin.firestore(app);
  }
} catch (e: any) {
  console.warn("Firebase initialization skipped:", e.message);
}

const TARGET_ID_FRAGMENT = "1788952787635";
const TARGET_FILENAME = "new_video_1788952787635";

async function main() {
  console.log(`\n🎯 TARGETING ONLY VIDEO: ${TARGET_FILENAME} (matching "${TARGET_ID_FRAGMENT}")\n`);

  // 1. Search & Delete from DynamoDB
  const tablesToCheck = ["RealTimeChat", "RealTimeChat-dev", "RealTimeChat-prod"];
  for (const table of tablesToCheck) {
    try {
      console.log(`🔍 Checking DynamoDB Table: ${table}...`);
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: table,
          FilterExpression: "contains(#u, :p) OR contains(#id, :p) OR contains(#sk, :p)",
          ExpressionAttributeNames: {
            "#u": "url",
            "#id": "id",
            "#sk": "sk",
          },
          ExpressionAttributeValues: {
            ":p": TARGET_ID_FRAGMENT,
          },
        })
      );

      const items = scanRes.Items || [];
      if (items.length === 0) {
        console.log(`  No matching record in DynamoDB table [${table}].`);
      } else {
        for (const item of items) {
          console.log(`  Found record in DynamoDB [${table}]:`, {
            roomId: item.roomId,
            sk: item.sk,
            id: item.id,
            title: item.title,
            url: item.url,
          });

          console.log(`  Deleting from DynamoDB [${table}]...`);
          await docClient.send(
            new DeleteCommand({
              TableName: table,
              Key: {
                roomId: item.roomId,
                sk: item.sk,
              },
            })
          );
          console.log(`  ✅ Deleted successfully from DynamoDB [${table}]!`);
        }
      }
    } catch (e: any) {
      console.log(`  Notice for DynamoDB [${table}]:`, e.message);
    }
  }

  // 2. Search & Delete from Firebase Firestore
  if (db) {
    const collectionsToCheck = ["flipLongVideos", "flipLongVideos_dev", "flipLongVideos_prod"];
    for (const col of collectionsToCheck) {
      try {
        console.log(`\n🔍 Checking Firestore Collection: ${col}...`);
        const snap = await db.collection(col).get();
        let found = false;
        for (const doc of snap.docs) {
          const data = doc.data();
          const docUrl = data.url || data.mediaUrl || data.videoUrl || "";
          if (docUrl.includes(TARGET_ID_FRAGMENT) || doc.id.includes(TARGET_ID_FRAGMENT)) {
            found = true;
            console.log(`  Found document ${doc.id} in Firestore [${col}] with title: "${data.title}"`);
            await db.collection(col).doc(doc.id).delete();
            console.log(`  ✅ Deleted document ${doc.id} from Firestore [${col}]!`);
          }
        }
        if (!found) {
          console.log(`  No matching document in Firestore [${col}].`);
        }
      } catch (e: any) {
        console.log(`  Notice for Firestore [${col}]:`, e.message);
      }
    }
  }

  // 3. Search & Delete from Cloudinary
  try {
    console.log(`\n🔍 Checking Cloudinary folder IndvsSl for ${TARGET_FILENAME}...`);
    const allVideos = await cloudinary.search
      .expression(`asset_folder:"IndvsSl" AND resource_type:video`)
      .max_results(100)
      .execute();

    const matchedResources = (allVideos.resources || []).filter(
      (r: any) =>
        r.public_id.includes(TARGET_ID_FRAGMENT) ||
        r.secure_url.includes(TARGET_ID_FRAGMENT) ||
        (r.display_name && r.display_name.includes(TARGET_ID_FRAGMENT))
    );

    if (matchedResources.length === 0) {
      console.log(`  No matching video found in Cloudinary folder IndvsSl.`);
    } else {
      for (const r of matchedResources) {
        console.log(`  Found in Cloudinary: public_id=${r.public_id}, url=${r.secure_url}`);
        console.log(`  Deleting ${r.public_id} from Cloudinary...`);
        const delRes = await cloudinary.uploader.destroy(r.public_id, {
          resource_type: "video",
        });
        console.log(`  ✅ Cloudinary deletion result for ${r.public_id}:`, delRes.result);
      }
    }
  } catch (e: any) {
    console.log(`  Notice for Cloudinary:`, e.message);
  }

  console.log(`\n✨ Deletion process complete for ${TARGET_FILENAME}.\n`);
}

main().catch(console.error);
