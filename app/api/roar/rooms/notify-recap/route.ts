// api/cron/notify-recap/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { transporter } from "@/lib/mailer";

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

    // Ended matches are signalled by a `predictions_live` message carrying
    // matchEndAt — same source MatchRoomRecap.tsx uses for its "ended" gate.
    const endedMatchesSnap = await db
      .collectionGroup("messages")
      .where("type", "==", "predictions_live")
      .where("matchEndAt", "<=", now)
      .where("matchEndAt", ">", now - 24 * 60 * 60 * 1000) // don't rescan ancient matches forever
      .limit(MAX_ROOMS_PER_RUN)
      .get();

    // De-dupe: multiple predictions_live docs can point at the same room.
    const roomIds = Array.from(
      new Set(endedMatchesSnap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean) as string[])
    );

    for (const roomId of roomIds) {
      const roomRef = db.collection("roarRooms").doc(roomId);
      const roomSnap = await roomRef.get();
      if (!roomSnap.exists) continue;
      const roomData = roomSnap.data()!;

      if (roomData.recapNotifiedAt) {
        results.push({ roomId, sent: 0, skipped: "already notified" });
        continue;
      }

      // Claim the room first (before sending) so a slow/overlapping cron
      // run can't double-send to the same batch of users.
      await roomRef.set({ recapNotifiedAt: now }, { merge: true });

      const joinedSnap = await roomRef
        .collection("joinedUsers")
        .limit(MAX_RECIPIENTS_PER_ROOM)
        .get();

      if (joinedSnap.empty) {
        results.push({ roomId, sent: 0, skipped: "no joined users" });
        continue;
      }

      const roomName = roomData.name || roomData.title || "Your match room";
      const userIds = joinedSnap.docs.map((d) => d.id);

      // Firestore `in` queries cap at 30 — batch the user lookups.
      const CHUNK = 30;
      const userDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      for (let i = 0; i < userIds.length; i += CHUNK) {
        const chunk = userIds.slice(i, i + CHUNK);
        const snap = await db.collection("users").where("userId", "in", chunk).get();
        userDocs.push(...snap.docs);
      }

      let sent = 0;
      for (const userDoc of userDocs) {
        const u = userDoc.data() as { email?: string; firstName?: string; emailOptOut?: boolean };
        if (!u.email || u.emailOptOut) continue;
        const { subject, html } = buildRecapEmail(roomName, roomId, u.firstName || "");
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
          // keep going — one bad address shouldn't kill the batch
        }
      }

      results.push({ roomId, sent });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}