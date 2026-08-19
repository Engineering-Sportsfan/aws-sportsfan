// app/api/cron/match-wakeup/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowMs = Date.now();
    const fiveMinutesAgo = nowMs - 5 * 60 * 1000;
    const sixMinutesFromNow = nowMs + 6 * 60 * 1000;

    console.log(`⏰ Cron match-wakeup run at ${new Date().toISOString()}`);

    let matches: any[] = [];

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :mPrefix) AND #st = :status",
          ExpressionAttributeNames: {
            "#st": "status",
          },
          ExpressionAttributeValues: {
            ":mPrefix": "MATCH#",
            ":status": "upcoming",
          },
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        matches = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^MATCH#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[match-wakeup] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (matches.length === 0 && db) {
      const matchesSnapshot = await db
        .collection("matches")
        .where("status", "==", "upcoming")
        .get();

      matches = matchesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    let triggeredCount = 0;

    for (const match of matches) {
      const kickoff = match.kickoff_time || 0;

      if (kickoff >= fiveMinutesAgo && kickoff <= sixMinutesFromNow) {
        console.log(`🎯 Kickoff window reached for Match [${match.id}]: ${match.team_a} vs ${match.team_b}. Waking up Dolly...`);

        try {
          const res = await fetch("https://dod32kcwyjmdp4ulzbnhm4xgdu0ydqni.lambda-url.us-east-1.on.aws/run-dolly", {
            method: "POST",
          });
          if (res.ok) {
            triggeredCount++;
            const updated = {
              ...match,
              status: "live",
              updated_at: nowMs,
            };
            const dynamoItem = {
              entityId: `MATCH#${match.id}`,
              sk: `MATCH#${match.id}`,
              ...updated,
            };
            await dualWrite("matches", match.id, "SportsData", dynamoItem);
            console.log(`✅ Dolly woken up successfully for Match [${match.id}].`);
          } else {
            console.error(`⚠️ Failed to wake up Dolly for Match [${match.id}]: Status ${res.status}`);
          }
        } catch (fetchErr) {
          console.error(`❌ Network error triggering Dolly for Match [${match.id}]:`, fetchErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      scannedCount: matches.length,
      triggeredCount,
    });
  } catch (error: any) {
    console.error("Cron match-wakeup error:", error);
    return NextResponse.json({ error: error.message || "Failed to process cron wakeup." }, { status: 500 });
  }
}
