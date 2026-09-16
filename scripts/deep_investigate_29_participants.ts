import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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
  } catch (e) {
    console.warn("Firebase cert init note:", e);
  }
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

const WATCHALONG_ID = "73e9b219-3481-4e72-8033-a5d1bb64fe41";
const MATCH_ID = "5bdac51d-b21b-4e2a-ba0e-aa81857dbc32";

// Event Window: 10 September 2026, 3:30 PM to 6:30 PM IST
const EVENT_START = 1789034400000 - 3600000; // ~2:30 PM IST
const EVENT_END = 1789045200000 + 3600000;   // ~7:30 PM IST

interface Participant {
  source: string;
  id: string;
  name?: string;
  email?: string;
  username?: string;
  action: string;
  details?: string;
  timestamp: number | null;
  timeFormatted: string | null;
}

async function investigate() {
  console.log("================================================================================");
  console.log("🔍 DEEP SCAN: FINDING ALL 29 PARTICIPANTS ACROSS ALL SOURCES");
  console.log(`WatchAlong ID: ${WATCHALONG_ID}`);
  console.log(`Match ID:      ${MATCH_ID}`);
  console.log("================================================================================\n");

  const participants = new Map<string, Participant>();

  function addParticipant(source: string, rawUser: string, action: string, details?: string, timestamp?: number) {
    if (!rawUser || rawUser === "System") return;
    const clean = rawUser.trim().toLowerCase();
    const key = clean;

    const ts = timestamp ? Number(timestamp) : null;
    const timeFormatted = ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : null;

    if (!participants.has(key)) {
      participants.set(key, {
        source,
        id: rawUser,
        email: rawUser.includes("@") ? rawUser : undefined,
        username: !rawUser.includes("@") ? rawUser : rawUser.split("@")[0],
        action,
        details,
        timestamp: ts,
        timeFormatted,
      });
    } else {
      const existing = participants.get(key)!;
      if (!existing.action.includes(action)) {
        existing.action += ` | ${action}`;
      }
      if (details && (!existing.details || !existing.details.includes(details))) {
        existing.details = (existing.details ? existing.details + "; " : "") + details;
      }
      if (ts && (!existing.timestamp || ts < existing.timestamp)) {
        existing.timestamp = ts;
        existing.timeFormatted = timeFormatted;
      }
    }
  }

  // ── 1. Check Firestore watchAlongMatches / watchAlongRooms ───────────────────
  console.log("📡 1. Checking Firestore Collections...");
  if (db) {
    try {
      const matchRef = db.collection("watchAlongMatches").doc(MATCH_ID);
      const matchSnap = await matchRef.get();
      if (matchSnap.exists) {
        console.log("   ✓ Found match document in Firestore:", matchSnap.data()?.title || matchSnap.id);
      }

      const subcollections = ["chats", "presence", "participants", "viewers", "predictions", "quizQuestions"];
      for (const sub of subcollections) {
        try {
          const subSnap = await matchRef.collection(sub).get();
          if (!subSnap.empty) {
            console.log(`   ✓ Found ${subSnap.size} docs in watchAlongMatches/${MATCH_ID}/${sub}`);
            subSnap.docs.forEach((d: any) => {
              const data = d.data();
              const u = data.user || data.email || data.userId || d.id;
              addParticipant(`Firestore match/${sub}`, u, `Interacted in ${sub}`, data.text || data.option || JSON.stringify(data), data.createdAt || data.timestamp);
            });
          }
        } catch {}
      }

      const roomRef = db.collection("watchAlongRooms").doc(WATCHALONG_ID);
      const roomSnap = await roomRef.get();
      if (roomSnap.exists) {
        console.log("   ✓ Found watchAlongRooms document in Firestore:", roomSnap.data()?.name || roomSnap.id);
        const roomSubs = ["presence", "joined", "participants", "messages"];
        for (const sub of roomSubs) {
          try {
            const sSnap = await roomRef.collection(sub).get();
            if (!sSnap.empty) {
              console.log(`   ✓ Found ${sSnap.size} docs in watchAlongRooms/${WATCHALONG_ID}/${sub}`);
              sSnap.docs.forEach((d: any) => {
                const data = d.data();
                const u = data.user || data.email || data.username || data.uid || d.id;
                addParticipant(`Firestore room/${sub}`, u, `Room ${sub}`, data.text || "", data.joinedAt || data.createdAt || data.timestamp);
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      console.warn("   ⚠️ Firestore check notice:", err?.message || err);
    }
  } else {
    console.log("   ℹ️ Firestore admin skipped (no credentials).");
  }

  // ── 2. Check RealTimeChat DynamoDB: All records with this Match / Room ───────
  console.log("\n📦 2. Scanning DynamoDB RealTimeChat for Room & Event Window...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "RealTimeChat",
          ExclusiveStartKey: lastKey,
        })
      );

      (res.Items || []).forEach((item: any) => {
        const roomId = item.roomId || "";
        const ts = item.createdAt || item.timestamp || item.joinedAt || item.lastSeenAt || item.firstJoinedAt;

        const isExactMatchOrRoom =
          roomId.includes(WATCHALONG_ID) ||
          roomId.includes(MATCH_ID);

        const isDuringEvent =
          ts && ts >= EVENT_START && ts <= EVENT_END;

        if (isExactMatchOrRoom || isDuringEvent) {
          const userIdentifier =
            item.authorEmail ||
            item.userEmail ||
            (item.user && item.user.includes("@") ? item.user : null) ||
            item.authorUsername ||
            item.username ||
            item.authorUid ||
            item.userId ||
            item.uid ||
            item.user;

          if (userIdentifier && userIdentifier !== "System") {
            const reason = isExactMatchOrRoom
              ? `RealTimeChat: Joined/Chatted in WatchAlong (${roomId})`
              : `Active in chat during Event Window (${roomId})`;

            addParticipant("DynamoDB RealTimeChat", userIdentifier, reason, item.text || item.sk, ts);
          }
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("   ⚠️ RealTimeChat scan error:", err?.message || err);
  }

  // ── 3. Check Auth Issues Tracker during Event Window ────────────────────────
  console.log("\n⚠️ 3. Scanning Auth Issues during Event Window...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :prefix)",
          ExpressionAttributeValues: { ":prefix": "AUTH_ISSUE#" },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const ts = item.timestamp || item.createdAt;
        if (ts && ts >= EVENT_START && ts <= EVENT_END) {
          const email = item.email || item.entityId.replace(/^AUTH_ISSUE#/, "");
          addParticipant(
            "Auth Issues (Blocked at Login)",
            email,
            `Hit Auth Error: ${item.reason || "Login Error"}`,
            item.endpoint,
            ts
          );
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("   ⚠️ Auth issues error:", err?.message || err);
  }

  // ── 4. Check User Activity / Logins during Event Window ─────────────────────
  console.log("\n👤 4. Scanning User Logins / Activity during Event Window...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :act)",
          ExpressionAttributeValues: { ":act": "USER_ACTIVITY#" },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const ts = item.timestamp || item.createdAt;
        if (ts && ts >= EVENT_START && ts <= EVENT_END) {
          const email = item.email || item.userId;
          addParticipant(
            "User Activity Log",
            email,
            `Logged In / Active: ${item.action || "session"}`,
            item.userName,
            ts
          );
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("   ⚠️ User activity error:", err?.message || err);
  }

  // ── 5. Check OTP Signups during Event Window ────────────────────────────────
  console.log("\n📨 5. Scanning OTP Signups during Event Window...");
  try {
    let lastKey: any = undefined;
    do {
      const res: any = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :otp)",
          ExpressionAttributeValues: { ":otp": "OTP#" },
          ExclusiveStartKey: lastKey,
        })
      );
      (res.Items || []).forEach((item: any) => {
        const ts = item.createdAt;
        if (ts && ts >= EVENT_START && ts <= EVENT_END) {
          const email = item.email || item.entityId.replace(/^OTP#/, "");
          addParticipant(
            "OTP Signup Attempt",
            email,
            `Attempted OTP Registration (Verified: ${item.isVerified ? "Yes" : "No"})`,
            `${item.firstName || ""} ${item.lastName || ""}`,
            ts
          );
        }
      });
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);
  } catch (err: any) {
    console.warn("   ⚠️ OTP scan error:", err?.message || err);
  }

  // ── 6. Collate results and check against PROD IdentityAndAccess ─────────────
  console.log("\n================================================================================");
  console.log(`🎯 TOTAL UNIQUE PARTICIPANTS FOUND: ${participants.size}`);
  console.log("================================================================================\n");

  const results = Array.from(participants.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  results.forEach((p, idx) => {
    console.log(`[${idx + 1}] ${p.id} (${p.email || "No Email"})`);
    console.log(`    Source:    ${p.source}`);
    console.log(`    Action:    ${p.action}`);
    if (p.details) console.log(`    Details:   ${p.details}`);
    console.log(`    Timestamp: ${p.timeFormatted || "N/A"}`);
    console.log("");
  });

  const outPath = path.join(process.cwd(), "all_29_participants_investigation.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`💾 Saved deep investigation report to: ${outPath}`);
}

investigate().catch(console.error);
