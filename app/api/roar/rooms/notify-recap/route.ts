// api/cron/notify-recap/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { transporter } from "@/lib/mailer";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, UpdateCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const APP_URL = "https://release.d3fimczy65ok18.amplifyapp.com";
// Cap per-run batch size and per-room recipient batch so a single cron tick
// can't blow past mail-provider rate limits or run indefinitely.
const MAX_ROOMS_PER_RUN = 25;
const MAX_RECIPIENTS_PER_ROOM = 500;

function buildRecapEmail(roomName: string, roomId: string, recipientFirstName: string) {
  const recapUrl = `${APP_URL}/MainModules/ROAR?room=${encodeURIComponent(roomId)}&recap=1`;
  return {
    subject: `📊 Recap: ${roomName} has ended`,
    html: `
      <h2>Hey ${recipientFirstName || "there"} 👋</h2>
      <p>The match room <strong>${roomName}</strong> you joined has wrapped up.</p>
      <p>Catch the highlights, top predictions, MVP, and more in the recap:</p>
      <p>
        <a href="${recapUrl}" style="display:inline-block;padding:10px 20px;background:#E91E8C;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
          View Match Recap
        </a>
      </p>
      <p style="color:#888;font-size:12px;">
        Don't have the app yet? Get it here: <a href="${APP_URL}">${APP_URL}</a>
      </p>
    `,
  };
}

// Verifies this is a legitimate cron invocation (Vercel Cron sends this
// header; also allow a shared-secret query param for manual/other triggers).
function isAuthorizedCronCall(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get("secret") === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronCall(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();
    const results: { roomId: string; sent: number; skipped?: string }[] = [];

    // 1. Ended matches are searched in Firestore since DynamoDB has no collectionGroup index for matchEndAt
    const endedMatchesSnap = await db
      .collectionGroup("messages")
      .where("type", "==", "predictions_live")
      .where("matchEndAt", "<=", now)
      .where("matchEndAt", ">", now - 24 * 60 * 60 * 1000)
      .limit(MAX_ROOMS_PER_RUN)
      .get();

    const roomIds = Array.from(
      new Set(endedMatchesSnap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean) as string[])
    );

    for (const roomId of roomIds) {
      // 2. Fetch room data DynamoDB-first
      let roomData: any = null;
      let fetchedRoomFromDynamo = false;
      try {
        const candidates = [`ROOM#${roomId}`, roomId];
        for (const cand of candidates) {
          const getRes = await docClient.send(new GetCommand({
            TableName: "RealTimeChat",
            Key: { roomId: cand, sk: `META#${roomId}` }
          }));
          if (getRes.Item) {
            roomData = getRes.Item;
            fetchedRoomFromDynamo = true;
            break;
          }
        }
      } catch (dynErr) {
        console.warn("[NotifyRecap] DynamoDB room fetch failed:", dynErr);
      }

      const roomRef = db.collection("roarRooms").doc(roomId);

      if (!fetchedRoomFromDynamo) {
        try {
          const snap = await roomRef.get();
          if (snap.exists) {
            roomData = snap.data();
          }
        } catch (fsErr) {
          console.warn("[NotifyRecap] Firestore room fetch failed:", fsErr);
        }
      }

      if (!roomData) continue;

      if (roomData.recapNotifiedAt) {
        results.push({ roomId, sent: 0, skipped: "already notified" });
        continue;
      }

      // Claim the room first (write recapNotifiedAt)
      try {
        const candidates = [`ROOM#${roomId}`, roomId];
        for (const cand of candidates) {
          await docClient.send(new UpdateCommand({
            TableName: "RealTimeChat",
            Key: { roomId: cand, sk: `META#${roomId}` },
            UpdateExpression: "SET recapNotifiedAt = :r",
            ExpressionAttributeValues: { ":r": now }
          })).catch(() => {});
        }
      } catch (dynErr) {
        console.warn("[NotifyRecap] DynamoDB claim room failed:", dynErr);
      }

      try {
        await roomRef.set({ recapNotifiedAt: now }, { merge: true });
      } catch (fsErr) {
        console.warn("[NotifyRecap] Firestore claim room failed:", fsErr);
      }

      // 3. Fetch joined users DynamoDB-first
      let joinedUids: string[] = [];
      let fetchedJoinedFromDynamo = false;
      try {
        const res = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": "JOINED#" },
          Limit: MAX_RECIPIENTS_PER_ROOM
        }));
        if (res.Items) {
          joinedUids = res.Items.map(item => (item.sk as string).replace(/^JOINED#/, ""));
          fetchedJoinedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[NotifyRecap] DynamoDB joined query failed:", dynErr);
      }

      // Fallback: Check Firestore
      if (!fetchedJoinedFromDynamo) {
        try {
          const joinedSnap = await roomRef
            .collection("joinedUsers")
            .limit(MAX_RECIPIENTS_PER_ROOM)
            .get();
          joinedUids = joinedSnap.docs.map(doc => doc.id);
        } catch (fsErr) {
          console.error("[NotifyRecap] Firestore joined fallback query failed:", fsErr);
        }
      }

      if (joinedUids.length === 0) {
        results.push({ roomId, sent: 0, skipped: "no joined users" });
        continue;
      }

      const roomName = roomData.name || roomData.title || "Your match room";

      // 4. Batch fetch user profiles
      const userProfiles: any[] = [];
      let fetchedProfiles = false;
      try {
        const keys = joinedUids.map(uid => ({
          entityId: `USER#${uid}`,
          sk: "USER#META"
        }));

        const batchResults = await docClient.send(new BatchGetCommand({
          RequestItems: {
            "IdentityAndAccess": {
              Keys: keys
            }
          }
        }));

        const items = batchResults.Responses?.["IdentityAndAccess"] || [];
        userProfiles.push(...items);
        fetchedProfiles = true;
      } catch (dynErr) {
        console.warn("[NotifyRecap] DynamoDB batch users fetch failed:", dynErr);
      }

      // Fallback: Check Firestore
      if (!fetchedProfiles || userProfiles.length < joinedUids.length) {
        try {
          const missingUserIds = joinedUids.filter(uid => !userProfiles.some(p => p.entityId === `USER#${uid}`));
          const CHUNK = 30;
          for (let i = 0; i < missingUserIds.length; i += CHUNK) {
            const chunk = missingUserIds.slice(i, i + CHUNK);
            const snap = await db.collection("users").where("userId", "in", chunk).get();
            snap.docs.forEach(doc => {
              userProfiles.push({
                entityId: `USER#${doc.id}`,
                ...doc.data()
              });
            });
          }
        } catch (fsErr) {
          console.error("[NotifyRecap] Firestore user profiles lookup failed:", fsErr);
        }
      }

      let sent = 0;
      for (const uItem of userProfiles) {
        const u = uItem as { email?: string; firstName?: string; userName?: string; emailOptOut?: boolean };
        if (!u.email || u.emailOptOut) continue;
        const { subject, html } = buildRecapEmail(roomName, roomId, u.firstName || u.userName || "");
        try {
          await transporter.sendMail({
            from: `"SportsFan360" <${process.env.EMAIL}>`,
            to: u.email,
            subject,
            html,
          });
          sent++;
        } catch (err) {
          console.error(`Failed to send recap email to ${u.email}:`, err);
        }
      }

      results.push({ roomId, sent });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET recap notification error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}