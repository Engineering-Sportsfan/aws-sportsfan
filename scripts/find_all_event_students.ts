import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");
if (privateKey.startsWith("-----BEGIN PRIVATE KEY-----") && !privateKey.includes("\n")) {
  let body = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").trim();
  body = body.replace(/ /g, "\n");
  privateKey = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  } catch (e) {}
}
const db = admin.apps.length ? admin.firestore() : null;

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function findAllEventStudents() {
  console.log("================================================================================");
  console.log("🎓 SCANNING FOR ALL EVENT PARTICIPANTS & SSSS STUDENTS");
  console.log("================================================================================\n");

  const studentMap = new Map<string, any>();

  function add(email: string, source: string, name?: string, details?: string, ts?: number) {
    if (!email || !email.includes("@")) return;
    const clean = email.toLowerCase().trim();
    if (!studentMap.has(clean)) {
      studentMap.set(clean, {
        email: clean,
        name: name || clean.split("@")[0],
        sources: [source],
        details: details ? [details] : [],
        timestamp: ts || null,
        timeFormatted: ts ? new Date(ts).toLocaleString("en-IN") : null,
      });
    } else {
      const s = studentMap.get(clean);
      if (!s.sources.includes(source)) s.sources.push(source);
      if (details && !s.details.includes(details)) s.details.push(details);
      if (name && (!s.name || s.name.includes("@"))) s.name = name;
      if (ts && (!s.timestamp || ts < s.timestamp)) {
        s.timestamp = ts;
        s.timeFormatted = new Date(ts).toLocaleString("en-IN");
      }
    }
  }

  // 1. Scan PROD IdentityAndAccess
  console.log("🔍 1. Scanning PROD IdentityAndAccess...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const email = item.email || (item.entityId?.startsWith("USER#") ? item.entityId.replace(/^USER#/, "") : "");
        const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.name || item.username;
        const ts = item.createdAt || item.timestamp;

        // Check if ssss.edu.in OR created around event (between 9/9/2026 and 11/9/2026)
        const isSsss = (email || "").includes("ssss.edu.in");
        const isEventTime = ts && ts >= 1788900000000 && ts <= 1789100000000;

        if (isSsss || isEventTime) {
          add(email, "PROD IdentityAndAccess", name, `Created: ${item.entityId}`, ts);
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("PROD scan notice:", err);
  }

  // 2. Scan DEV IdentityAndAccess-dev
  console.log("🔍 2. Scanning DEV IdentityAndAccess-dev...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess-dev",
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const email = item.email || (item.entityId?.startsWith("USER#") ? item.entityId.replace(/^USER#/, "") : "");
        const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.name || item.username;
        const ts = item.createdAt || item.timestamp;

        const isSsss = (email || "").includes("ssss.edu.in");
        const isEventTime = ts && ts >= 1788900000000 && ts <= 1789100000000;

        if (isSsss || isEventTime) {
          add(email, "DEV IdentityAndAccess-dev", name, `Created: ${item.entityId}`, ts);
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("DEV scan notice:", err);
  }

  // 3. Scan Firestore Waitlist
  console.log("🔍 3. Scanning Firestore Waitlist / RSVPs...");
  if (db) {
    try {
      const waitlist = await db.collection("waitlist").get();
      console.log(`   ✓ Found ${waitlist.size} total waitlist docs in Firestore.`);
      waitlist.docs.forEach((d: any) => {
        const data = d.data();
        add(data.email || d.id, "Firestore Waitlist/RSVP", data.name, data.eventName || data.event, data.createdAt || data.timestamp);
      });
    } catch (e: any) {
      console.warn("Waitlist notice:", e?.message || e);
    }
  }

  // 4. Scan Firestore Users
  console.log("🔍 4. Scanning Firestore Users...");
  if (db) {
    try {
      const usersSnap = await db.collection("users").get();
      usersSnap.docs.forEach((d: any) => {
        const data = d.data();
        const email = data.email || d.id;
        const isSsss = (email || "").includes("ssss.edu.in");
        const ts = data.createdAt;
        const isEventTime = ts && ts >= 1788900000000 && ts <= 1789100000000;

        if (isSsss || isEventTime) {
          add(email, "Firestore Users Collection", `${data.firstName || ""} ${data.lastName || ""}`.trim(), "User Profile", ts);
        }
      });
    } catch (e: any) {
      console.warn("Firestore users notice:", e?.message || e);
    }
  }

  console.log("\n================================================================================");
  console.log(`🎯 TOTAL EVENT PARTICIPANTS DISCOVERED: ${studentMap.size}`);
  console.log("================================================================================\n");

  const list = Array.from(studentMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  list.forEach((s, idx) => {
    console.log(`[${idx + 1}] ${s.name} (${s.email})`);
    console.log(`    Sources:   ${s.sources.join(", ")}`);
    console.log(`    Timestamp: ${s.timeFormatted || "N/A"}`);
    if (s.details.length > 0) console.log(`    Details:   ${s.details.join("; ")}`);
    console.log("");
  });

  const outPath = path.join(process.cwd(), "event_all_discovered_participants.json");
  fs.writeFileSync(outPath, JSON.stringify(list, null, 2), "utf-8");
  console.log(`💾 Full list saved to: ${outPath}`);
}

findAllEventStudents().catch(console.error);
