// // app/api/audio-progress/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { awardUserPoints } from "@/lib/userPoints";

// // ─── Points threshold ─────────────────────────────────────────────────────────
// const LISTEN_POINTS_THRESHOLD = 90; // % listened required to earn points
// const LISTEN_POINTS_REWARD    = 2;  // points awarded

// export async function GET(req: NextRequest) {
//     try {
//         const searchParams = req.nextUrl.searchParams;
//         const userId  = searchParams.get("userId");
//         const audioId = searchParams.get("audioId");

//         if (!userId) {
//             return NextResponse.json(
//                 { success: false, error: "userId is required" },
//                 { status: 400 }
//             );
//         }

//         // Fetch single audio progress
//         if (audioId) {
//             const doc = await db
//                 .collection("audioProgress")
//                 .doc(userId)
//                 .collection("tracks")
//                 .doc(encodeURIComponent(audioId))
//                 .get();

//             if (!doc.exists) {
//                 return NextResponse.json({ success: true, progress: null });
//             }

//             return NextResponse.json({ success: true, progress: doc.data() });
//         }

//         // Fetch all in-progress tracks for user (for Continue Listening)
//         const snapshot = await db
//             .collection("audioProgress")
//             .doc(userId)
//             .collection("tracks")
//             .where("pct", ">", 2)
//             .where("pct", "<", 95)
//             .orderBy("pct")
//             .orderBy("pausedAt", "desc")
//             .limit(10)
//             .get();

//         const progress = snapshot.docs.map((doc) => doc.data());

//         return NextResponse.json({ success: true, progress });
//     } catch (error) {
//         console.error("Error fetching audio progress:", error);
//         return NextResponse.json(
//             {
//                 success: false,
//                 error: "Failed to fetch progress",
//                 details: error instanceof Error ? error.message : "Unknown error",
//             },
//             { status: 500 }
//         );
//     }
// }

// // ─── POST: Save/update progress + award points at threshold ──────────────────
// // Body: { userId, audioId, title, subtitle, elapsed, durationSeconds, pct, url,
// //         userName?, userEmail? }
// export async function POST(req: NextRequest) {
//     try {
//         const body = await req.json();
//         const {
//             userId,
//             audioId,
//             title,
//             subtitle,
//             elapsed,
//             durationSeconds,
//             pct,
//             url,
//             userName,
//             userEmail,
//         } = body;

//         if (!userId || !audioId) {
//             return NextResponse.json(
//                 { success: false, error: "userId and audioId are required" },
//                 { status: 400 }
//             );
//         }

//         // ── If audio is >95% listened — clear progress (treat as finished) ───
//         if (pct >= 95) {
//             await db
//                 .collection("audioProgress")
//                 .doc(userId)
//                 .collection("tracks")
//                 .doc(encodeURIComponent(audioId))
//                 .delete();

//             return NextResponse.json({
//                 success: true,
//                 message: "Progress cleared — audio finished",
//                 pointsAwarded: 0,
//             });
//         }

//         // ── Save / update progress ────────────────────────────────────────────
//         const progressData = {
//             audioId,
//             title,
//             subtitle:        subtitle        || "",
//             elapsed:         elapsed         || 0,
//             durationSeconds: durationSeconds || 0,
//             pct:             pct             || 0,
//             url,
//             pausedAt: Date.now(),
//         };

//         await db
//             .collection("audioProgress")
//             .doc(userId)
//             .collection("tracks")
//             .doc(encodeURIComponent(audioId))
//             .set(progressData, { merge: true });

//         // ── Award +2 points exactly once when the user crosses 90% ───────────
//         // transactionId is deterministic so double-saves never double-award.
//         let pointsAwarded = 0;

//         if (pct >= LISTEN_POINTS_THRESHOLD) {
//             const transactionId = `${userId}_${encodeURIComponent(audioId)}_LISTEN_COMPLETE`;

//             // Check whether points have already been given for this track
//             const txRef = db.collection("userPointTransactions").doc(transactionId);
//             const txSnap = await txRef.get();

//             if (!txSnap.exists) {
//                 // Resolve user info (name / email) from Firestore if not supplied
//                 let resolvedName  = userName  || "User";
//                 let resolvedEmail = userEmail || "";
//                 let userExists    = false;

//                 try {
//                     const userSnap = await db.collection("users").doc(userId).get();
//                     userExists = userSnap.exists;

//                     if (userSnap.exists) {
//                         const data = userSnap.data()!;
//                         if (!userName || userName === "User") {
//                             resolvedName =
//                                 data.firstName
//                                     ? [data.firstName, data.lastName].filter(Boolean).join(" ")
//                                     : data.name || data.email?.split("@")[0] || "User";
//                         }
//                         resolvedEmail = resolvedEmail || data.email || "";
//                     }
//                 } catch (lookupErr) {
//                     console.error("[audio-progress] user lookup error:", lookupErr);
//                 }

//                 await awardUserPoints({
//                     actualUserId:  userId,
//                     userName:      resolvedName,
//                     userEmail:     resolvedEmail,
//                     userExists,
//                     points:        LISTEN_POINTS_REWARD,
//                     reason:        "LISTEN_COMPLETE",
//                     transactionId,
//                     metadata: {
//                         audioId,
//                         title: title || "",
//                         pct,
//                     },
//                 });

//                 pointsAwarded = LISTEN_POINTS_REWARD;
//                 console.log(
//                     `[audio-progress] +${LISTEN_POINTS_REWARD} pts awarded to ${userId} for listening to "${title}" (${pct}%)`
//                 );
//             }
//         }

//         return NextResponse.json({
//             success: true,
//             progress:      progressData,
//             pointsAwarded,
//         });
//     } catch (error) {
//         console.error("Error saving audio progress:", error);
//         return NextResponse.json(
//             {
//                 success: false,
//                 error: "Failed to save progress",
//                 details: error instanceof Error ? error.message : "Unknown error",
//             },
//             { status: 500 }
//         );
//     }
// }

// // ─── DELETE: Clear progress for a specific track ──────────────────────────────
// // DELETE /api/audio-progress?userId=xxx&audioId=sf360/audio/bumrah_pregame
// export async function DELETE(req: NextRequest) {
//     try {
//         const searchParams = req.nextUrl.searchParams;
//         const userId  = searchParams.get("userId");
//         const audioId = searchParams.get("audioId");

//         if (!userId || !audioId) {
//             return NextResponse.json(
//                 { success: false, error: "userId and audioId are required" },
//                 { status: 400 }
//             );
//         }

//         await db
//             .collection("audioProgress")
//             .doc(userId)
//             .collection("tracks")
//             .doc(encodeURIComponent(audioId))
//             .delete();

//         return NextResponse.json({ success: true, message: "Progress cleared" });
//     } catch (error) {
//         console.error("Error clearing audio progress:", error);
//         return NextResponse.json(
//             {
//                 success: false,
//                 error: "Failed to clear progress",
//                 details: error instanceof Error ? error.message : "Unknown error",
//             },
//             { status: 500 }
//         );
//     }
// }






// src/app/api/audio-progress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { awardUserPoints } from "@/lib/userPoints";
import { AudioProgressModel, validateAudioProgressInput } from "@/app/models/AudioProgress";

// ─── Constants ────────────────────────────────────────────────────────────────
const LISTEN_POINTS_THRESHOLD = 90; // % listened required to earn points
const LISTEN_POINTS_REWARD = 2;     // points awarded
const LISTEN_COMPLETE_THRESHOLD = 95; // % to consider completed

// ─── GET: Fetch audio progress ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const audioId = searchParams.get("audioId");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    // Fetch single audio progress
    if (audioId) {
      const progress = await AudioProgressModel.getTrack(userId, audioId);
      return NextResponse.json({ success: true, progress });
    }

    // Fetch all in-progress tracks for user (Continue Listening)
    const progress = await AudioProgressModel.getUserInProgressTracks(userId);

    return NextResponse.json({ success: true, progress });
  } catch (error) {
    console.error("Error fetching audio progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch progress",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ─── POST: Save/update progress + award points ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      audioId,
      title,
      subtitle,
      elapsed,
      durationSeconds,
      pct,
      url,
      userName,
      userEmail,
    } = body;

    // Validation
    if (!userId || !audioId) {
      return NextResponse.json(
        { success: false, error: "userId and audioId are required" },
        { status: 400 }
      );
    }

    const validation = validateAudioProgressInput({ audioId, title, elapsed, durationSeconds, pct });
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.errors.join(", ") },
        { status: 400 }
      );
    }

    // -- Save / update progress ────────────────────────────────────────────
    const progress = await AudioProgressModel.saveProgress(userId, {
      audioId,
      title,
      subtitle,
      elapsed: elapsed || 0,
      durationSeconds: durationSeconds || 0,
      pct: pct || 0,
      url,
    });

    // -- Award points when user crosses threshold (exactly once) -----------
    let pointsAwarded = 0;

    if (pct >= LISTEN_POINTS_THRESHOLD) {
      const transactionId = `${userId}_${encodeURIComponent(audioId)}_LISTEN_AUDIO_DROP`;

      let resolvedName = userName || "User";
      let resolvedEmail = userEmail || "";
      let userExists = false;

      try {
        const userSnap = await db.collection("users").doc(userId).get();
        userExists = userSnap.exists;

        if (userSnap.exists) {
          const data = userSnap.data()!;
          if (!userName || userName === "User") {
            resolvedName =
              data.firstName
                ? [data.firstName, data.lastName].filter(Boolean).join(" ")
                : data.name || data.email?.split("@")[0] || "User";
          }
          resolvedEmail = resolvedEmail || data.email || "";
        }
      } catch (lookupErr) {
        console.error("[audio-progress] user lookup error:", lookupErr);
      }

      const awarded = await awardUserPoints({
        actualUserId: userId,
        userName: resolvedName,
        userEmail: resolvedEmail,
        userExists,
        points: LISTEN_POINTS_REWARD,
        reason: "LISTEN_AUDIO_DROP",
        transactionId,
        metadata: {
          audioId,
          audioTitle: title || "",
          title: title || "",
          subtitle: subtitle || "Audio Drop",
          url: url || "",
          pct,
          activityType: "LISTEN_AUDIO_DROP",
          activityLabel: "Listen Audio Drops",
          transactionId,
        },
      });

      if (awarded) {
        await AudioProgressModel.markPointsAwarded(userId, audioId);
        pointsAwarded = LISTEN_POINTS_REWARD;

        console.log(
          `[audio-progress] +${LISTEN_POINTS_REWARD} pts awarded to ${userId} for listening to "${title}" (${pct}%)`
        );
      }
    }

    if (pct >= LISTEN_COMPLETE_THRESHOLD) {
      await AudioProgressModel.markCompleted(userId, audioId);
      return NextResponse.json({
        success: true,
        message: "Progress cleared - audio finished",
        progress,
        pointsAwarded,
      });
    }

    return NextResponse.json({
      success: true,
      progress,
      pointsAwarded,
    });
  } catch (error) {
    console.error("Error saving audio progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save progress",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ─── DELETE: Clear progress for a specific track ──────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const audioId = searchParams.get("audioId");

    if (!userId || !audioId) {
      return NextResponse.json(
        { success: false, error: "userId and audioId are required" },
        { status: 400 }
      );
    }

    await AudioProgressModel.deleteProgress(userId, audioId);

    return NextResponse.json({ success: true, message: "Progress cleared" });
  } catch (error) {
    console.error("Error clearing audio progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to clear progress",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
