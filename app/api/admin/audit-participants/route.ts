// app/api/admin/audit-participants/route.ts
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const TARGET_WATCHALONG_ID = "73e9b219-3481-4e72-8033-a5d1bb64fe41";
const TARGET_MATCH_ID = "5bdac51d-b21b-4e2a-ba0e-aa81857dbc32";
const TARGET_EVENT_TITLE = "Indian Athletics Final Series";

interface ActivityRecord {
  type: "Chatted in WatchAlong" | "Voted in Predictions" | "Answered Quiz" | "Posted in Roar" | "Joined WatchAlong (Did Nothing)" | "Joined Roar (Did Nothing)" | "Logged In / Session" | "OTP Signup Attempt" | "Registered in Database";
  details?: string;
  roomOrMatch?: string;
  timestamp: number | null;
  timeFormatted: string | null;
}

interface ParticipantReport {
  identifier: string; // primary identifier (email or username)
  email: string | null;
  username: string;
  name: string;
  userId: string;
  activities: ActivityRecord[];
  activitySummary: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  firstSeenTimestamp: number | null;
  lastSeenTimestamp: number | null;
  didNothingExceptJoin: boolean;
  existsInProd: boolean; // Permanent account in PROD IdentityAndAccess
  existsInDev: boolean;  // Permanent account in DEV IdentityAndAccess-dev
  existsInFirestore: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const userMap = new Map<
      string,
      {
        primaryKey: string;
        email: string | null;
        username: string;
        name: string;
        userId: string;
        activities: ActivityRecord[];
        activityTypeSet: Set<string>;
        firstSeenAt: number | null;
        lastSeenAt: number | null;
        inProd: boolean;
        inDev: boolean;
        inFirestore: boolean;
      }
    >();

    // Helper to resolve or create a user entry
    function getOrCreateEntry(rawEmail?: string, rawUsername?: string, rawUserId?: string, rawName?: string) {
      let email = (rawEmail || "").trim().toLowerCase();
      if (!email.includes("@")) email = "";

      // Try recovering email from sanitized userId (e.g., shahaakash2209_gmail_com -> shahaakash2209@gmail.com)
      if (!email && rawUserId && rawUserId.includes("_gmail_com")) {
        email = rawUserId.replace(/_gmail_com$/, "@gmail.com");
      }

      const username = (rawUsername || (email ? email.split("@")[0] : rawUserId || "User")).trim();
      const primaryKey = email || username.toLowerCase() || (rawUserId || "unknown").toLowerCase();

      let entry = userMap.get(primaryKey);

      // Also try looking up by email if primaryKey was username
      if (!entry && email) {
        entry = userMap.get(email);
      }
      if (!entry && username) {
        entry = userMap.get(username.toLowerCase());
      }

      if (!entry) {
        entry = {
          primaryKey,
          email: email || null,
          username,
          name: rawName || username,
          userId: rawUserId || (email ? email.replace(/[^a-zA-Z0-9]/g, "_") : username),
          activities: [],
          activityTypeSet: new Set(),
          firstSeenAt: null,
          lastSeenAt: null,
          inProd: false,
          inDev: false,
          inFirestore: false,
        };
        userMap.set(primaryKey, entry);
        if (email) userMap.set(email, entry);
        if (username) userMap.set(username.toLowerCase(), entry);
      } else {
        if (!entry.email && email) {
          entry.email = email;
          userMap.set(email, entry);
        }
        if (rawName && (!entry.name || entry.name.includes("@"))) {
          entry.name = rawName;
        }
        if (username && !entry.username) {
          entry.username = username;
        }
      }

      return entry;
    }

    function recordActivity(
      entry: ReturnType<typeof getOrCreateEntry>,
      type: ActivityRecord["type"],
      details?: string,
      roomOrMatch?: string,
      timestamp?: number
    ) {
      const ts = timestamp ? Number(timestamp) : Date.now();
      const timeFormatted = ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : null;

      entry.activities.push({
        type,
        details,
        roomOrMatch,
        timestamp: ts,
        timeFormatted,
      });
      entry.activityTypeSet.add(type);

      if (ts) {
        if (!entry.firstSeenAt || ts < entry.firstSeenAt) entry.firstSeenAt = ts;
        if (!entry.lastSeenAt || ts > entry.lastSeenAt) entry.lastSeenAt = ts;
      }
    }

    // ── 1. PROD IdentityAndAccess: Permanent Users ─────────────────────────────
    const prodUsersSet = new Set<string>();
    try {
      let lastKey: any = undefined;
      do {
        const res: any = await docClient.send(
          new ScanCommand({
            TableName: "IdentityAndAccess",
            FilterExpression: "begins_with(entityId, :u) AND begins_with(sk, :sk)",
            ExpressionAttributeValues: { ":u": "USER#", ":sk": "USER#" },
            ExclusiveStartKey: lastKey,
          })
        );
        (res.Items || []).forEach((item: any) => {
          const email = (item.email || item.entityId.replace(/^USER#/, "")).toLowerCase().trim();
          const username = item.username || email.split("@")[0];
          const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.name || username;

          if (email.includes("@")) {
            prodUsersSet.add(email);
            prodUsersSet.add(username.toLowerCase());
          }
          const entry = getOrCreateEntry(email, username, item.userId, name);
          entry.inProd = true;
          recordActivity(entry, "Registered in Database", "Prod IdentityAndAccess", undefined, item.createdAt || item.updatedAt);
        });
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
    } catch (err: any) {
      console.warn("PROD IdentityAndAccess scan warning:", err?.message || err);
    }

    // ── 2. DEV IdentityAndAccess-dev: Permanent Users ───────────────────────────
    const devUsersSet = new Set<string>();
    try {
      let lastKey: any = undefined;
      do {
        const res: any = await docClient.send(
          new ScanCommand({
            TableName: "IdentityAndAccess-dev",
            FilterExpression: "begins_with(entityId, :u) AND begins_with(sk, :sk)",
            ExpressionAttributeValues: { ":u": "USER#", ":sk": "USER#" },
            ExclusiveStartKey: lastKey,
          })
        );
        (res.Items || []).forEach((item: any) => {
          const email = (item.email || item.entityId.replace(/^USER#/, "")).toLowerCase().trim();
          const username = item.username || email.split("@")[0];
          const name = `${item.firstName || ""} ${item.lastName || ""}`.trim() || item.name || username;

          if (email.includes("@")) {
            devUsersSet.add(email);
            devUsersSet.add(username.toLowerCase());
          }
          const entry = getOrCreateEntry(email, username, item.userId, name);
          entry.inDev = true;
          recordActivity(entry, "Registered in Database", "Dev IdentityAndAccess-dev", undefined, item.createdAt || item.updatedAt);
        });
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
    } catch (err: any) {
      console.warn("DEV IdentityAndAccess-dev scan warning:", err?.message || err);
    }

    // ── 3. Scan User Sessions & Activity Log (IdentityAndAccess) ────────────────
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
          const email = (item.email || "").toLowerCase().trim();
          const username = item.userName || (email ? email.split("@")[0] : "User");
          const entry = getOrCreateEntry(email, username, item.userId, item.userName);
          recordActivity(entry, "Logged In / Session", item.action || "Active session", undefined, item.timestamp || item.createdAt);
        });
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
    } catch (err: any) {
      console.warn("Activity scan warning:", err?.message || err);
    }

    // ── 4. Scan OTP Signup Attempts (IdentityAndAccess) ─────────────────────────
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
          const email = (item.email || item.entityId.replace(/^OTP#/, "")).toLowerCase().trim();
          const name = `${item.firstName || ""} ${item.lastName || ""}`.trim();
          const entry = getOrCreateEntry(email, undefined, undefined, name);
          const status = item.isVerified ? "OTP Verified (Pending Password Setup)" : "OTP Sent (Unverified)";
          recordActivity(entry, "OTP Signup Attempt", status, undefined, item.createdAt);
        });
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
    } catch (err: any) {
      console.warn("OTP scan warning:", err?.message || err);
    }

    // ── 4b. Scan Auth Issues Tracker (IdentityAndAccess) ─────────────────────
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
          const email = (item.email || "").toLowerCase().trim();
          const entry = getOrCreateEntry(email);
          recordActivity(
            entry,
            "OTP Signup Attempt", // Or auth issue note
            `Auth Issue: ${item.reason || "Error"} (Status: ${item.status || "pending"})`,
            item.endpoint,
            item.timestamp
          );
        });
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
    } catch (err: any) {
      console.warn("Auth issues scan warning:", err?.message || err);
    }

    // ── 5. Scan RealTimeChat: Roar Posts, WatchAlong Chats, Presence, Joins ──────
    try {
      let lastKey: any = undefined;
      do {
        const res: any = await docClient.send(
          new ScanCommand({
            TableName: "RealTimeChat",
            FilterExpression: "begins_with(sk, :msg) OR begins_with(sk, :pres) OR begins_with(sk, :post) OR begins_with(sk, :join)",
            ExpressionAttributeValues: {
              ":msg": "MSG#",
              ":pres": "PRESENCE#",
              ":post": "POST#",
              ":join": "JOINED#",
            },
            ExclusiveStartKey: lastKey,
          })
        );
        (res.Items || []).forEach((item: any) => {
          const roomId = item.roomId || "";
          const isWatchAlong = roomId.toLowerCase().includes("watchalong");
          const sk = item.sk || "";

          const email = (item.authorEmail || item.userEmail || (item.user && item.user.includes("@") ? item.user : "")).toLowerCase().trim();
          const username = item.authorUsername || item.username || (item.user && !item.user.includes("@") ? item.user : "");
          const userId = item.authorUid || item.userId || item.uid;
          const timestamp = item.createdAt || item.lastSeenAt || item.joinedAt || item.firstJoinedAt || item.updatedAt;

          const entry = getOrCreateEntry(email, username, userId);

          if (sk.startsWith("PRESENCE#") || sk.startsWith("JOINED#")) {
            const joinType = isWatchAlong ? "Joined WatchAlong (Did Nothing)" : "Joined Roar (Did Nothing)";
            recordActivity(entry, joinType, `Room/Session: ${roomId}`, roomId, timestamp);
          } else if (isWatchAlong) {
            recordActivity(
              entry,
              "Chatted in WatchAlong",
              item.text ? `"${item.text}"` : "WatchAlong message",
              roomId,
              timestamp
            );
          } else {
            recordActivity(
              entry,
              "Posted in Roar",
              item.text ? `"${item.text}"` : "Roar post/reply",
              roomId,
              timestamp
            );
          }
        });
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
    } catch (err: any) {
      console.warn("RealTimeChat scan warning:", err?.message || err);
    }

    // ── 6. Scan GamificationAndWallet: Predictions & Quizzes ───────────────────
    try {
      let lastKey: any = undefined;
      do {
        const res: any = await docClient.send(
          new ScanCommand({
            TableName: "GamificationAndWallet",
            FilterExpression: "begins_with(sk, :pVote) OR begins_with(sk, :qAns)",
            ExpressionAttributeValues: {
              ":pVote": "PREDICTION_VOTE#",
              ":qAns": "QUIZ_ANSWER#",
            },
            ExclusiveStartKey: lastKey,
          })
        );
        (res.Items || []).forEach((item: any) => {
          const rawUserId = item.userTargetId || item.userId || "";
          let email = "";
          let username = item.displayName || "";
          if (rawUserId.includes("@")) {
            email = rawUserId;
          } else if (rawUserId.includes("_gmail_com")) {
            email = rawUserId.replace(/_gmail_com$/, "@gmail.com");
          }

          const entry = getOrCreateEntry(email, username, rawUserId, item.displayName);
          const timestamp = item.votedAt || item.answeredAt || item.createdAt;
          const sk = item.sk || "";

          if (sk.startsWith("PREDICTION_VOTE#")) {
            recordActivity(
              entry,
              "Voted in Predictions",
              `Option: "${item.option || "voted"}" (Prediction: ${item.predictionId || "N/A"})`,
              item.userId || "WatchAlong Match",
              timestamp
            );
          } else if (sk.startsWith("QUIZ_ANSWER#")) {
            recordActivity(
              entry,
              "Answered Quiz",
              `Answer: "${item.option || "answered"}" (Correct: ${item.isCorrect ? "Yes" : "No"}, Points: ${item.points || 0})`,
              item.userId || "WatchAlong Match",
              timestamp
            );
          }
        });
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);
    } catch (err: any) {
      console.warn("Gamification scan warning:", err?.message || err);
    }

    // ── 7. Scan Firestore: Users, WatchAlong Matches, Chats, Predictions, Quizzes ─
    try {
      // 7a. Firestore Users
      const fsUsers = await db.collection("users").get();
      fsUsers.docs.forEach((doc: any) => {
        const d = doc.data();
        const email = (d.email || (doc.id.includes("@") ? doc.id : "")).toLowerCase().trim();
        const username = d.username || (email ? email.split("@")[0] : doc.id);
        const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.name || username;

        const entry = getOrCreateEntry(email, username, doc.id, name);
        entry.inFirestore = true;
        recordActivity(entry, "Registered in Database", "Firestore users collection", undefined, d.createdAt || d.updatedAt);
      });

      // 7b. Firestore WatchAlong Matches
      const matchSnaps = await db.collection("watchAlongMatches").get();
      for (const matchDoc of matchSnaps.docs) {
        const matchId = matchDoc.id;
        const matchData = matchDoc.data();
        const matchTitle = matchData.title || matchData.name || `Match ${matchId}`;

        // Subcollection: chats
        try {
          const chatDocs = await matchDoc.ref.collection("chats").get();
          chatDocs.forEach((cDoc: any) => {
            const c = cDoc.data();
            const userStr = (c.user || c.username || "").trim();
            const email = userStr.includes("@") ? userStr : (c.userEmail || "");
            const username = !userStr.includes("@") ? userStr : email.split("@")[0];
            const entry = getOrCreateEntry(email, username, c.userId);
            recordActivity(entry, "Chatted in WatchAlong", `"${c.text}"`, matchTitle, c.createdAt);
          });
        } catch { /* subcollection might not exist */ }

        // Subcollection: predictions -> userVotes
        try {
          const predDocs = await matchDoc.ref.collection("predictions").get();
          for (const pDoc of predDocs.docs) {
            const pData = pDoc.data();
            const voteDocs = await pDoc.ref.collection("userVotes").get();
            voteDocs.forEach((vDoc: any) => {
              const v = vDoc.data();
              const rawUserId = vDoc.id;
              const email = rawUserId.includes("@") ? rawUserId : (rawUserId.includes("_gmail_com") ? rawUserId.replace(/_gmail_com$/, "@gmail.com") : "");
              const entry = getOrCreateEntry(email, undefined, rawUserId);
              recordActivity(
                entry,
                "Voted in Predictions",
                `Option: "${v.option}" on "${pData.question || "Prediction"}"`,
                matchTitle,
                v.votedAt || v.createdAt
              );
            });
          }
        } catch { /* ignore */ }

        // Subcollection: quizQuestions -> answers
        try {
          const quizDocs = await matchDoc.ref.collection("quizQuestions").get();
          for (const qDoc of quizDocs.docs) {
            const qData = qDoc.data();
            const ansDocs = await qDoc.ref.collection("answers").get();
            ansDocs.forEach((aDoc: any) => {
              const a = aDoc.data();
              const rawUserId = aDoc.id;
              const email = rawUserId.includes("@") ? rawUserId : (rawUserId.includes("_gmail_com") ? rawUserId.replace(/_gmail_com$/, "@gmail.com") : "");
              const entry = getOrCreateEntry(email, undefined, rawUserId);
              recordActivity(
                entry,
                "Answered Quiz",
                `Option: "${a.option}" on "${qData.question || "Quiz"}" (Correct: ${a.isCorrect ? "Yes" : "No"})`,
                matchTitle,
                a.answeredAt || a.createdAt
              );
            });
          }
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      console.warn("Firestore audit scan warning:", err?.message || err);
    }

    // ── 8. Consolidate Unique Participants ────────────────────────────────────
    const uniqueParticipants = new Map<string, ParticipantReport>();

    for (const entry of userMap.values()) {
      // Re-verify Prod & Dev membership
      if (entry.email && prodUsersSet.has(entry.email)) entry.inProd = true;
      if (entry.username && prodUsersSet.has(entry.username.toLowerCase())) entry.inProd = true;
      if (entry.email && devUsersSet.has(entry.email)) entry.inDev = true;
      if (entry.username && devUsersSet.has(entry.username.toLowerCase())) entry.inDev = true;

      // Deduplicate by email if available, else by username
      const dedupKey = (entry.email || entry.username || entry.userId).toLowerCase();
      if (uniqueParticipants.has(dedupKey)) {
        continue;
      }

      // Check if user ONLY joined and did nothing else
      const activeInteractions = entry.activities.filter(
        (a) => a.type === "Chatted in WatchAlong" || a.type === "Voted in Predictions" || a.type === "Answered Quiz" || a.type === "Posted in Roar"
      );
      const hasJoined = entry.activities.some((a) => a.type.startsWith("Joined"));
      const didNothingExceptJoin = hasJoined && activeInteractions.length === 0;

      // Activity summary list
      const activitySummary = Array.from(entry.activityTypeSet);

      const report: ParticipantReport = {
        identifier: entry.email || entry.username || entry.userId,
        email: entry.email,
        username: entry.username,
        name: entry.name || entry.username,
        userId: entry.userId,
        activities: entry.activities.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
        activitySummary,
        firstSeen: entry.firstSeenAt ? new Date(entry.firstSeenAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : null,
        lastSeen: entry.lastSeenAt ? new Date(entry.lastSeenAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : null,
        firstSeenTimestamp: entry.firstSeenAt,
        lastSeenTimestamp: entry.lastSeenAt,
        didNothingExceptJoin,
        existsInProd: entry.inProd,
        existsInDev: entry.inDev,
        existsInFirestore: entry.inFirestore,
      };

      uniqueParticipants.set(dedupKey, report);
    }

    const allParticipantsList = Array.from(uniqueParticipants.values()).sort((a, b) => (b.lastSeenTimestamp || 0) - (a.lastSeenTimestamp || 0));

    // Filter categories requested by user
    const participantsWithActivity = allParticipantsList.filter(
      (p) => p.activities.some((a) => a.type !== "Registered in Database")
    );

    const chattedInWatchAlong = allParticipantsList.filter((p) => p.activitySummary.includes("Chatted in WatchAlong"));
    const votedInPredictions = allParticipantsList.filter((p) => p.activitySummary.includes("Voted in Predictions"));
    const answeredQuiz = allParticipantsList.filter((p) => p.activitySummary.includes("Answered Quiz"));
    const postedInRoar = allParticipantsList.filter((p) => p.activitySummary.includes("Posted in Roar"));
    const joinedDidNothing = allParticipantsList.filter((p) => p.didNothingExceptJoin);

    const missingFromProd = participantsWithActivity.filter((p) => !p.existsInProd);
    const missingFromDev = participantsWithActivity.filter((p) => !p.existsInDev);

    const responsePayload = {
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalParticipantsWithActivity: participantsWithActivity.length,
        chattedInWatchAlongCount: chattedInWatchAlong.length,
        votedInPredictionsCount: votedInPredictions.length,
        answeredQuizCount: answeredQuiz.length,
        postedInRoarCount: postedInRoar.length,
        joinedDidNothingCount: joinedDidNothing.length,
        missingFromProdDatabaseCount: missingFromProd.length,
        missingFromDevDatabaseCount: missingFromDev.length,
        registeredInProdDatabaseCount: prodUsersSet.size,
        registeredInDevDatabaseCount: devUsersSet.size,
      },
      missingFromProd,
      missingFromDev,
      breakdown: {
        chattedInWatchAlong,
        votedInPredictions,
        answeredQuiz,
        postedInRoar,
        joinedDidNothing,
      },
      allParticipants: participantsWithActivity,
    };

    // Save to local disk for audit permanence & immediate viewing
    try {
      const reportPath = path.join(process.cwd(), "audit_event_participants_report.json");
      fs.writeFileSync(reportPath, JSON.stringify(responsePayload, null, 2), "utf-8");
      console.log("✅ Audit report successfully written to:", reportPath);
    } catch (fsWriteErr) {
      console.warn("Could not write local report file:", fsWriteErr);
    }

    // If request accepts HTML, render a dashboard!
    const acceptHeader = req.headers.get("accept") || "";
    const formatParam = req.nextUrl.searchParams.get("format");

    if (acceptHeader.includes("text/html") && formatParam !== "json") {
      return new NextResponse(renderHtmlDashboard(responsePayload), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Audit participants error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function renderHtmlDashboard(data: any) {
  const summary = data.summary;
  const missing = data.missingFromProd;
  const all = data.allParticipants;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WatchAlong & Event Participants Audit</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .header { margin-bottom: 24px; border-bottom: 1px solid #334155; padding-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    h1 { margin: 0; font-size: 24px; color: #38bdf8; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; text-align: center; }
    .card.alert { border-color: #ef4444; background: #450a0a; }
    .card.success { border-color: #22c55e; }
    .card .val { font-size: 28px; font-weight: bold; margin-top: 6px; }
    .card .lbl { font-size: 13px; color: #94a3b8; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; background: #1e293b; border-radius: 8px; overflow: hidden; font-size: 14px; }
    th { background: #0f172a; color: #94a3b8; text-align: left; padding: 12px 16px; border-bottom: 1px solid #334155; }
    td { padding: 12px 16px; border-bottom: 1px solid #334155; vertical-align: top; }
    tr:hover td { background: #243248; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; margin: 2px 4px 2px 0; }
    .badge-missing { background: #ef4444; color: #fff; }
    .badge-present { background: #22c55e; color: #fff; }
    .badge-chat { background: #3b82f6; color: #fff; }
    .badge-vote { background: #a855f7; color: #fff; }
    .badge-quiz { background: #eab308; color: #000; }
    .badge-roar { background: #f97316; color: #fff; }
    .badge-nothing { background: #64748b; color: #fff; }
    .activity-item { font-size: 12px; color: #cbd5e1; margin-bottom: 4px; }
    .time-lbl { color: #94a3b8; font-size: 11px; }
    .btn-json { background: #38bdf8; color: #0f172a; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Event Participants & Database Audit</h1>
      <p style="color: #94a3b8; margin: 4px 0 0 0; font-size: 13px;">Checked PROD table <code>IdentityAndAccess</code>, DEV table <code>IdentityAndAccess-dev</code>, WatchAlong & Roar</p>
    </div>
    <a href="?format=json" class="btn-json">View Raw JSON (Postman)</a>
  </div>

  <div class="summary-grid">
    <div class="card alert">
      <div class="lbl">Missing from PROD DB</div>
      <div class="val" style="color: #f87171;">${summary.missingFromProdDatabaseCount}</div>
    </div>
    <div class="card">
      <div class="lbl">Total Active Participants</div>
      <div class="val">${summary.totalParticipantsWithActivity}</div>
    </div>
    <div class="card">
      <div class="lbl">Chatted in WatchAlong</div>
      <div class="val" style="color: #60a5fa;">${summary.chattedInWatchAlongCount}</div>
    </div>
    <div class="card">
      <div class="lbl">Voted in Predictions</div>
      <div class="val" style="color: #c084fc;">${summary.votedInPredictionsCount}</div>
    </div>
    <div class="card">
      <div class="lbl">Answered Quiz</div>
      <div class="val" style="color: #facc15;">${summary.answeredQuizCount}</div>
    </div>
    <div class="card">
      <div class="lbl">Posted in Roar</div>
      <div class="val" style="color: #fb923c;">${summary.postedInRoarCount}</div>
    </div>
    <div class="card">
      <div class="lbl">Joined (Did Nothing)</div>
      <div class="val" style="color: #94a3b8;">${summary.joinedDidNothingCount}</div>
    </div>
  </div>

  <h2>🚨 Users Missing from PROD IdentityAndAccess (${missing.length})</h2>
  ${missing.length === 0 ? '<p style="color: #22c55e;">🎉 No active participants are missing from the PROD database!</p>' : renderTable(missing)}

  <h2 style="margin-top: 40px;">📋 All Event Participants (${all.length})</h2>
  ${renderTable(all)}
</body>
</html>`;
}

function renderTable(list: any[]) {
  if (list.length === 0) return '<p style="color: #94a3b8;">No records found.</p>';
  return `<table>
    <thead>
      <tr>
        <th>User Details</th>
        <th>PROD DB Status</th>
        <th>DEV DB Status</th>
        <th>What They Did (Activities)</th>
        <th>Time of Activity</th>
      </tr>
    </thead>
    <tbody>
      ${list
        .map(
          (u) => `<tr>
        <td>
          <strong style="font-size: 15px;">${u.name}</strong><br>
          <span style="color: #38bdf8;">${u.email || "No Email"}</span><br>
          <span style="color: #94a3b8; font-size: 12px;">@${u.username} (ID: ${u.userId})</span>
        </td>
        <td>
          ${
            u.existsInProd
              ? '<span class="badge badge-present">✓ In Prod DB</span>'
              : '<span class="badge badge-missing">✗ MISSING FROM PROD</span>'
          }
        </td>
        <td>
          ${
            u.existsInDev
              ? '<span class="badge badge-present">✓ In Dev DB</span>'
              : '<span class="badge badge-missing">✗ Missing from Dev</span>'
          }
        </td>
        <td>
          ${u.didNothingExceptJoin ? '<span class="badge badge-nothing">Joined (Did Nothing)</span><br>' : ""}
          ${u.activitySummary
            .filter((act: string) => act !== "Registered in Database")
            .map((act: string) => {
              let cls = "badge-chat";
              if (act.includes("Prediction")) cls = "badge-vote";
              else if (act.includes("Quiz")) cls = "badge-quiz";
              else if (act.includes("Roar")) cls = "badge-roar";
              else if (act.includes("Joined")) cls = "badge-nothing";
              return `<span class="badge ${cls}">${act}</span>`;
            })
            .join(" ")}
          <div style="margin-top: 8px;">
            ${u.activities
              .slice(0, 5)
              .map(
                (a: any) =>
                  `<div class="activity-item">• <strong>${a.type}:</strong> ${a.details || ""} <span class="time-lbl">(${a.timeFormatted || ""})</span></div>`
              )
              .join("")}
            ${u.activities.length > 5 ? `<span style="font-size: 11px; color: #94a3b8;">+ ${u.activities.length - 5} more activities</span>` : ""}
          </div>
        </td>
        <td>
          <span class="time-lbl">First Seen:</span><br>
          <strong>${u.firstSeen || "N/A"}</strong><br><br>
          <span class="time-lbl">Last Seen:</span><br>
          <strong>${u.lastSeen || "N/A"}</strong>
        </td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}
