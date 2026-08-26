#!/usr/bin/env ts-node
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// 1. Load Environment Variables
const backendDir = path.resolve(__dirname, "../..");
const envPath = path.join(backendDir, ".env");
const envLocalPath = path.join(backendDir, ".env.local");

if (fs.existsSync(envPath)) {
  console.log(`Loading env from ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.warn(`Warning: .env not found at ${envPath}`);
}
if (fs.existsSync(envLocalPath)) {
  console.log(`Loading env from ${envLocalPath}`);
  dotenv.config({ path: envLocalPath });
}

import { docClient } from "../../lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";

async function fetchFromSportsData() {
  console.log("\n--- Scanning DynamoDB 'SportsData' (sk = 'PROFILE#META' and entityId starts with 'ATHLETE#') ---");
  try {
    const players: any[] = [];
    let LastEvaluatedKey: any = undefined;
    do {
      const command: any = new ScanCommand({
        TableName: "SportsData",
        FilterExpression: "sk = :sk AND begins_with(entityId, :entityPrefix)",
        ExpressionAttributeValues: {
          ":sk": "PROFILE#META",
          ":entityPrefix": "ATHLETE#",
        },
        ExclusiveStartKey: LastEvaluatedKey,
      });
      const response = await docClient.send(command);
      if (response.Items) {
        players.push(...response.Items);
      }
      LastEvaluatedKey = response.LastEvaluatedKey;
    } while (LastEvaluatedKey);

    console.log(`Found ${players.length} players in 'SportsData':`);
    players.forEach((item, index) => {
      const slug = item.entityId.replace(/^ATHLETE#/, "");
      const name = item.name || item.coreInfo?.name || item.displayName || "Unknown Name";
      const sport = item.sport || item.coreInfo?.discipline || "N/A";
      console.log(`  ${index + 1}. [Slug: ${slug}] Name: ${name} (Sport: ${sport})`);
    });
  } catch (error: any) {
    console.error("Failed to fetch from 'SportsData' table:", error.message || error);
  }
}

async function fetchFromIdentityAndAccess() {
  console.log("\n--- Scanning DynamoDB 'IdentityAndAccess' (entityId starts with 'PROFILE_ATHLETE#') ---");
  try {
    const players: any[] = [];
    let LastEvaluatedKey: any = undefined;
    do {
      const command: any = new ScanCommand({
        TableName: "IdentityAndAccess",
        FilterExpression: "begins_with(entityId, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": "PROFILE_ATHLETE#",
        },
        ExclusiveStartKey: LastEvaluatedKey,
      });
      const response = await docClient.send(command);
      if (response.Items) {
        players.push(...response.Items);
      }
      LastEvaluatedKey = response.LastEvaluatedKey;
    } while (LastEvaluatedKey);

    console.log(`Found ${players.length} players in 'IdentityAndAccess':`);
    players.forEach((item, index) => {
      const id = item.entityId.replace(/^PROFILE_ATHLETE#/, "");
      const name = item.name || "Unknown Name";
      const sport = item.sport || "N/A";
      console.log(`  ${index + 1}. [ID: ${id}] Name: ${name} (Sport: ${sport})`);
    });
  } catch (error: any) {
    console.error("Failed to fetch from 'IdentityAndAccess' table:", error.message || error);
  }
}

async function fetchFromMSPlayers() {
  console.log("\n--- Scanning DynamoDB 'MS_Players' (sk = 'PROFILE#META') ---");
  try {
    const players: any[] = [];
    let LastEvaluatedKey: any = undefined;
    do {
      const command: any = new ScanCommand({
        TableName: "MS_Players",
        FilterExpression: "sk = :sk",
        ExpressionAttributeValues: {
          ":sk": "PROFILE#META",
        },
        ExclusiveStartKey: LastEvaluatedKey,
      });
      const response = await docClient.send(command);
      if (response.Items) {
        players.push(...response.Items);
      }
      LastEvaluatedKey = response.LastEvaluatedKey;
    } while (LastEvaluatedKey);

    console.log(`Found ${players.length} players in 'MS_Players':`);
    players.forEach((item, index) => {
      const id = item.playerId || item.entityId || "N/A";
      const name = item.name || "Unknown Name";
      const sport = item.sportId || "N/A";
      console.log(`  ${index + 1}. [ID: ${id}] Name: ${name} (Sport: ${sport})`);
    });
  } catch (error: any) {
    console.error("Failed to fetch from 'MS_Players' table:", error.message || error);
  }
}

async function fetchFromFirestoreAthletes() {
  console.log("\n--- Fetching from Firestore 'athletesProfile' collection ---");
  try {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").replace(/"/g, "");
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      console.warn("Skipping Firestore 'athletesProfile' because Firebase env variables are not fully set.");
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    }
    const db = admin.firestore();
    const snapshot = await db.collection("athletesProfile").get();
    console.log(`Found ${snapshot.size} players in Firestore 'athletesProfile':`);
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const name = data.name || "Unknown Name";
      const sport = data.sport || "N/A";
      console.log(`  ${index + 1}. [DocId: ${doc.id}] Name: ${name} (Sport: ${sport})`);
    });
  } catch (error: any) {
    console.error("Failed to fetch from Firestore 'athletesProfile':", error.message || error);
  }
}

async function fetchFromFirestorePlayerStats() {
  console.log("\n--- Fetching from Firestore 'playerStats' collection ---");
  try {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").replace(/"/g, "");
    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      console.warn("Skipping Firestore 'playerStats' because Firebase env variables are not fully set.");
      return;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    }
    const db = admin.firestore();
    const snapshot = await db.collection("playerStats").get();
    
    // Deduplicate names since there might be multiple stats documents per player
    const uniquePlayers = new Map<string, string>();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.player_name) {
        uniquePlayers.set(data.player_name, data.tournament || "N/A");
      }
    });

    console.log(`Found ${uniquePlayers.size} unique players in Firestore 'playerStats' (out of ${snapshot.size} stats documents):`);
    let index = 1;
    uniquePlayers.forEach((tournament, name) => {
      console.log(`  ${index}. Name: ${name} (Tournament: ${tournament})`);
      index++;
    });
  } catch (error: any) {
    console.error("Failed to fetch from Firestore 'playerStats':", error.message || error);
  }
}

async function main() {
  console.log("Starting player name fetcher...");
  await fetchFromSportsData();
  await fetchFromIdentityAndAccess();
  await fetchFromMSPlayers();
  await fetchFromFirestoreAthletes();
  await fetchFromFirestorePlayerStats();
  console.log("\nFetch complete!");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
