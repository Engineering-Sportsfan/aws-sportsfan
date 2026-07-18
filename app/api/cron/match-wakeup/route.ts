import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  try {
    // Validate request header to ensure it's triggered by Vercel's Cron scheduler
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowMs = Date.now();
    // Scan for matches starting within 6 minutes (gives buffer for 5-min cron loops)
    const fiveMinutesAgo = nowMs - 5 * 60 * 1000;
    const sixMinutesFromNow = nowMs + 6 * 60 * 1000;

    console.log(`⏰ Cron match-wakeup run at ${new Date().toISOString()}`);

    const matchesSnapshot = await db.collection("matches")
      .where("status", "==", "upcoming")
      .get();

    let triggeredCount = 0;

    for (const doc of matchesSnapshot.docs) {
      const match = doc.data();
      const kickoff = match.kickoff_time || 0;

      // Trigger if kickoff is happening now or within the current cron window
      if (kickoff >= fiveMinutesAgo && kickoff <= sixMinutesFromNow) {
        console.log(`🎯 Kickoff window reached for Match [${doc.id}]: ${match.team_a} vs ${match.team_b}. Waking up Dolly...`);
        
        try {
          const res = await fetch("https://sportsfan360-sentiment.onrender.com/run-dolly", {
            method: "POST"
          });
          if (res.ok) {
            triggeredCount++;
            // Update Firestore status to live immediately
            await db.collection("matches").doc(doc.id).update({
              status: "live",
              updated_at: nowMs
            });
            console.log(`✅ Dolly woken up successfully for Match [${doc.id}].`);
          } else {
            console.error(`⚠️ Failed to wake up Dolly for Match [${doc.id}]: Status ${res.status}`);
          }
        } catch (fetchErr) {
          console.error(`❌ Network error triggering Dolly for Match [${doc.id}]:`, fetchErr);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      scannedCount: matchesSnapshot.docs.length, 
      triggeredCount 
    });
  } catch (error: any) {
    console.error("Cron match-wakeup error:", error);
    return NextResponse.json({ error: error.message || "Failed to process cron wakeup." }, { status: 500 });
  }
}
