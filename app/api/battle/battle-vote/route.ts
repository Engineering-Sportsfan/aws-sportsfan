// // api/battle/battle-vote/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";

// interface PointsBreakdown {
//   CREATE_BATTLE: number;
//   PLAY_BATTLE: number;
//   INVITE_ACCEPTED: number;
//   PREDICTION_CORRECT: number;
//   FANTASY_WIN: number;
//   DAILY_LOGIN: number;
//   SHARE_BATTLE: number;
//   [key: string]: number;
// }

// interface UserData {
//   userId?: string;
//   firstName?: string;
//   lastName?: string;
//   name?: string;
//   email?: string;
//   totalPoints?: number;
//   pointsBreakdown?: PointsBreakdown;
//   lastUpdated?: number;
// }

// // ── Single source of truth: fetch user from Firestore
// async function getUserInfo(
//   userId: string,
//   fallbackName?: string,
//   fallbackEmail?: string
// ): Promise<{ userName: string; userEmail: string; exists: boolean; actualUserId: string; userData?: UserData }> {
//   try {
//     // Try exact match first
//     let snap = await db.collection("users").doc(userId).get();
//     let actualUserId = userId;

//     // If not found, try to find by email (for Google auth users)
//     if (!snap.exists && fallbackEmail) {
//       const emailQuery = await db.collection("users")
//         .where("email", "==", fallbackEmail)
//         .limit(1)
//         .get();
      
//       if (!emailQuery.empty) {
//         snap = emailQuery.docs[0];
//         actualUserId = snap.id;
//         console.log(`Found user by email: ${actualUserId} for userId: ${userId}`);
//       }
//     }

//     if (snap.exists) {
//       const d = snap.data()!;
      
//       // Build name from whatever fields were stored at signup
//       const userName =
//         d.firstName
//           ? [d.firstName, d.lastName].filter(Boolean).join(" ")
//           : d.name ||
//             (d.email ? d.email.split("@")[0] : fallbackName) ||
//             "User";

//       const userEmail = d.email || fallbackEmail || "";
//       return { userName, userEmail, exists: true, actualUserId, userData: d };
//     }

//     // Document doesn't exist yet — use fallback values from the auth token
//     return {
//       userName: fallbackName || "User",
//       userEmail: fallbackEmail || "",
//       exists: false,
//       actualUserId: userId,
//     };
//   } catch (err) {
//     console.error("getUserInfo error:", err);
//     return {
//       userName: fallbackName || "User",
//       userEmail: fallbackEmail || "",
//       exists: false,
//       actualUserId: userId,
//     };
//   }
// }

// // ── Ensure points fields exist on an already-existing user document
// async function backfillPointsIfNeeded(actualUserId: string) {
//   const ref = db.collection("users").doc(actualUserId);
//   const snap = await ref.get();
//   if (!snap.exists) return false;

//   const d = snap.data()!;
//   const updates: Record<string, unknown> = {};

//   if (d.totalPoints === undefined) updates.totalPoints = 0;
//   if (d.pointsBreakdown === undefined) {
//     updates.pointsBreakdown = {
//       CREATE_BATTLE: 0,
//       PLAY_BATTLE: 0,
//       INVITE_ACCEPTED: 0,
//       PREDICTION_CORRECT: 0,
//       FANTASY_WIN: 0,
//       DAILY_LOGIN: 0,
//       SHARE_BATTLE: 0,
//     };
//   }
  
//   if (!d.name && d.firstName) {
//     updates.name = [d.firstName, d.lastName].filter(Boolean).join(" ");
//   }

//   if (Object.keys(updates).length > 0) {
//     updates.lastUpdated = Date.now();
//     await ref.update(updates);
//     return true;
//   }
  
//   return false;
// }

// // ── Check if user already has a transaction for this specific battle
// async function hasTransactionForBattle(
//   userId: string,
//   battleId: string
// ): Promise<boolean> {
//   const transactionId = `${userId}_${battleId}_PLAY_BATTLE`;
//   const transactionRef = db.collection("userPointTransactions").doc(transactionId);
//   const snapshot = await transactionRef.get();
//   return snapshot.exists;
// }

// // ─── POST — Record a vote ─────────────────────────────────────────────────────
// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const { battleId, playerId, playerName, userId, userEmail, userName, direction } = body;

//     console.log("Received vote request:", { battleId, playerId, userId, direction });

//     // ── Validation ──────────────────────────────────────────────────────────
//     if (!battleId || typeof battleId !== "string")
//       return NextResponse.json({ error: "battleId is required" }, { status: 400 });
//     if (!playerId || typeof playerId !== "string")
//       return NextResponse.json({ error: "playerId is required" }, { status: 400 });
//     if (!userId || typeof userId !== "string")
//       return NextResponse.json({ error: "userId is required" }, { status: 400 });
//     if (!direction || !["left", "right"].includes(direction))
//       return NextResponse.json({ error: "direction must be 'left' or 'right'" }, { status: 400 });

//     const playerPointsAwarded = direction === "right" ? 15 : 0;
//     const userPointsAwarded   = direction === "right" ? 5  : 0;

//     // ── Battle must exist ────────────────────────────────────────────────────
//     const battleSnap = await db.collection("fanBattles").doc(battleId).get();
//     if (!battleSnap.exists)
//       return NextResponse.json({ error: "Battle not found" }, { status: 404 });

//     // ── Prevent duplicate votes per battle per player ────────────────────────
//     const voteId  = `${battleId}_${userId}_${playerId}`;
//     const voteRef = db.collection("battleVotes").doc(voteId);
//     if ((await voteRef.get()).exists) {
//       return NextResponse.json(
//         { error: "You have already voted for this player in this battle", alreadyVoted: true },
//         { status: 409 }
//       );
//     }

//     // ── Resolve user info from Firestore ────────────────────────────────────
//     const { userName: resolvedName, userEmail: resolvedEmail, exists: userExists, actualUserId } =
//       await getUserInfo(userId, userName, userEmail);

//     console.log("User info resolved:", { actualUserId, userExists, resolvedName });

//     // Backfill missing points fields if user exists
//     if (userExists) {
//       await backfillPointsIfNeeded(actualUserId);
//     }

//     // ── Check for duplicate transaction for this battle ──────────────────────
//     const alreadyHasTransaction = await hasTransactionForBattle(actualUserId, battleId);
    
//     if (userPointsAwarded > 0 && alreadyHasTransaction) {
//       console.log(`Transaction already exists for user ${actualUserId} in battle ${battleId}, skipping points`);
//       // Still record the vote, but don't award points again
//       const batch = db.batch();
//       batch.set(voteRef, {
//         battleId,
//         playerId,
//         playerName: playerName || "Unknown",
//         userId: actualUserId,
//         direction,
//         pointsAwarded: playerPointsAwarded,
//         createdAt: Date.now(),
//       });

//       if (playerPointsAwarded > 0) {
//         const leaderboardRef = db
//           .collection("fanBattles")
//           .doc(battleId)
//           .collection("leaderboard")
//           .doc(playerId);
//         batch.set(
//           leaderboardRef,
//           {
//             playerId,
//             playerName: playerName || "Unknown",
//             points: FieldValue.increment(playerPointsAwarded),
//             votes: FieldValue.increment(1),
//             updatedAt: Date.now(),
//           },
//           { merge: true }
//         );
//       }

//       await batch.commit();

//       return NextResponse.json(
//         { 
//           success: true, 
//           playerPointsAwarded,
//           userPointsAwarded: 0,
//           message: "Vote recorded (points already awarded for this battle)",
//           duplicate: true
//         },
//         { status: 200 }
//       );
//     }

//     // ── Build batch ──────────────────────────────────────────────────────────
//     const batch = db.batch();

//     // 1. Vote record
//     batch.set(voteRef, {
//       battleId,
//       playerId,
//       playerName: playerName || "Unknown",
//       userId: actualUserId,
//       direction,
//       pointsAwarded: playerPointsAwarded,
//       createdAt: Date.now(),
//     });

//     // 2. Player leaderboard (subcollection under the battle)
//     if (playerPointsAwarded > 0) {
//       const leaderboardRef = db
//         .collection("fanBattles")
//         .doc(battleId)
//         .collection("leaderboard")
//         .doc(playerId);

//       batch.set(
//         leaderboardRef,
//         {
//           playerId,
//           playerName: playerName || "Unknown",
//           points: FieldValue.increment(playerPointsAwarded),
//           votes: FieldValue.increment(1),
//           updatedAt: Date.now(),
//         },
//         { merge: true }
//       );
//     }

//     // 3. User points transaction - use consistent ID pattern to prevent duplicates
//     if (userPointsAwarded > 0) {
//       const transactionId = `${actualUserId}_${battleId}_PLAY_BATTLE`;
//       const transactionRef = db.collection("userPointTransactions").doc(transactionId);
      
//       batch.set(transactionRef, {
//         userId: actualUserId,
//         userEmail: resolvedEmail,
//         userName: resolvedName,
//         points: userPointsAwarded,
//         reason: "PLAY_BATTLE",
//         metadata: { battleId, playerId, playerName },
//         createdAt: Date.now(),
//       });

//       if (userExists) {
//         const userDocRef = db.collection("users").doc(actualUserId);
//         batch.update(userDocRef, {
//           totalPoints: FieldValue.increment(userPointsAwarded),
//           "pointsBreakdown.PLAY_BATTLE": FieldValue.increment(userPointsAwarded),
//           lastUpdated: Date.now(),
//         });
//       }
//     }

//     // 4. Global leaderboard
//     const globalLeaderboardRef = db.collection("globalLeaderboard").doc(actualUserId);
//     batch.set(
//       globalLeaderboardRef,
//       {
//         userId: actualUserId,
//         userName: resolvedName,
//         userEmail: resolvedEmail,
//         totalPoints: FieldValue.increment(userPointsAwarded),
//         lastUpdated: Date.now(),
//       },
//       { merge: true }
//     );

//     await batch.commit();

//     console.log("Vote recorded successfully for user:", actualUserId);

//     return NextResponse.json(
//       {
//         success: true,
//         playerPointsAwarded,
//         userPointsAwarded,
//         message:
//           direction === "right"
//             ? `+${playerPointsAwarded} for player, +${userPointsAwarded} for you!`
//             : "Skipped",
//       },
//       { status: 201 }
//     );
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/battle-vote error:", error);
//     return NextResponse.json({ error: msg, details: error instanceof Error ? error.stack : undefined }, { status: 500 });
//   }
// }

// // ─── GET — Fetch leaderboard for a battle 
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const battleId = searchParams.get("battleId");
//     const userId   = searchParams.get("userId");

//     // ── Bulk "which battles has this user touched?" check ─────────────────
//     // Called once on load: ?userId=xxx&checkPlayed=true
//     // if (searchParams.get("checkPlayed") === "true") {
//     //   if (!userId) {
//     //     return NextResponse.json({ interactedBattleIds: [] });
//     //   }
//     //   const votesSnap = await db
//     //     .collection("battleVotes")
//     //     .where("userId", "==", userId)
//     //     .get();

//     //   const interactedBattleIds = [
//     //     ...new Set(votesSnap.docs.map((doc) => doc.data().battleId as string)),
//     //   ];

//     //   return NextResponse.json({ success: true, interactedBattleIds });
//     // }

//     // Add to your existing GET function in battle-vote/route.ts
// if (searchParams.get("checkPlayed") === "true") {
//   if (!userId) {
//     return NextResponse.json({ interactedBattleIds: [] });
//   }
  
//   // Get completed battle sessions
//   const sessionsSnap = await db
//     .collection("battleSessions")
//     .where("userId", "==", userId)
//     .where("status", "==", "completed")
//     .get();

//   const completedBattleIds = sessionsSnap.docs.map((doc) => doc.data().battleId);

//   return NextResponse.json({ success: true, interactedBattleIds: completedBattleIds });
// }

//     // ── Normal leaderboard fetch: ?battleId=xxx&userId=xxx ─────────────────
//     if (!battleId) {
//       return NextResponse.json({ error: "battleId is required" }, { status: 400 });
//     }

//     const leaderboardSnap = await db
//       .collection("fanBattles")
//       .doc(battleId)
//       .collection("leaderboard")
//       .orderBy("points", "desc")
//       .get();

//     const leaderboard = leaderboardSnap.docs.map((doc, i) => ({
//       rank: i + 1,
//       ...doc.data(),
//     }));

//     let votedPlayerIds: string[] = [];
//     let interactedPlayerIds: string[] = [];

//     if (userId) {
//       const votesSnap = await db
//         .collection("battleVotes")
//         .where("battleId", "==", battleId)
//         .where("userId", "==", userId)
//         .get();

//       // All interactions (left + right) — for "already played" detection
//       interactedPlayerIds = votesSnap.docs.map((doc) => doc.data().playerId as string);

//       // Right swipes only — for "✓ Voted" badges
//       votedPlayerIds = votesSnap.docs
//         .filter((doc) => doc.data().direction === "right")
//         .map((doc) => doc.data().playerId as string);
//     }

//     return NextResponse.json({
//       success: true,
//       battleId,
//       leaderboard,
//       votedPlayerIds,
//       interactedPlayerIds,
//       total: leaderboard.length,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/battle-vote error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }








// api/battle/battle-vote/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserInfo, awardUserPoints } from "@/lib/userPoints";

// ── Check if user already has a transaction for this specific battle
async function hasTransactionForBattle(
  userId: string,
  battleId: string
): Promise<boolean> {
  const transactionId = `${userId}_${battleId}_PLAY_BATTLE`;
  const transactionRef = db.collection("userPointTransactions").doc(transactionId);
  const snapshot = await transactionRef.get();
  return snapshot.exists;
}

// ─── POST — Record a vote ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { battleId, playerId, playerName, userId, userEmail, userName, direction } = body;

    console.log("Received vote request:", { battleId, playerId, userId, direction });

    // ── Validation ──────────────────────────────────────────────────────────
    if (!battleId || typeof battleId !== "string")
      return NextResponse.json({ error: "battleId is required" }, { status: 400 });
    if (!playerId || typeof playerId !== "string")
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    if (!userId || typeof userId !== "string")
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (!direction || !["left", "right"].includes(direction))
      return NextResponse.json({ error: "direction must be 'left' or 'right'" }, { status: 400 });

    const playerPointsAwarded = direction === "right" ? 15 : 0;
    const userPointsAwarded   = direction === "right" ? 5  : 0;

    // ── Battle must exist ────────────────────────────────────────────────────
    const battleSnap = await db.collection("fanBattles").doc(battleId).get();
    if (!battleSnap.exists)
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });

    // ── Prevent duplicate votes per battle per player ────────────────────────
    const voteId  = `${battleId}_${userId}_${playerId}`;
    const voteRef = db.collection("battleVotes").doc(voteId);
    if ((await voteRef.get()).exists) {
      return NextResponse.json(
        { error: "You have already voted for this player in this battle", alreadyVoted: true },
        { status: 409 }
      );
    }

    // ── Resolve user info from Firestore ────────────────────────────────────
    const { userName: resolvedName, userEmail: resolvedEmail, exists: userExists, actualUserId } =
      await getUserInfo(userId, userName, userEmail);

    console.log("User info resolved:", { actualUserId, userExists, resolvedName });

    // ── Check for duplicate transaction for this battle ──────────────────────
    const alreadyHasTransaction = await hasTransactionForBattle(actualUserId, battleId);

    if (userPointsAwarded > 0 && alreadyHasTransaction) {
      console.log(`Transaction already exists for user ${actualUserId} in battle ${battleId}, skipping points`);

      // Still record the vote and update player leaderboard — just skip user points
      const batch = db.batch();

      batch.set(voteRef, {
        battleId,
        playerId,
        playerName: playerName || "Unknown",
        userId: actualUserId,
        direction,
        pointsAwarded: playerPointsAwarded,
        createdAt: Date.now(),
      });

      if (playerPointsAwarded > 0) {
        const leaderboardRef = db
          .collection("fanBattles")
          .doc(battleId)
          .collection("leaderboard")
          .doc(playerId);
        batch.set(
          leaderboardRef,
          {
            playerId,
            playerName: playerName || "Unknown",
            points: FieldValue.increment(playerPointsAwarded),
            votes: FieldValue.increment(1),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }

      await batch.commit();

      return NextResponse.json(
        {
          success: true,
          playerPointsAwarded,
          userPointsAwarded: 0,
          message: "Vote recorded (points already awarded for this battle)",
          duplicate: true,
        },
        { status: 200 }
      );
    }

    // ── Vote record + player leaderboard (batch) ─────────────────────────────
    const batch = db.batch();

    // 1. Vote record
    batch.set(voteRef, {
      battleId,
      playerId,
      playerName: playerName || "Unknown",
      userId: actualUserId,
      direction,
      pointsAwarded: playerPointsAwarded,
      createdAt: Date.now(),
    });

    // 2. Player leaderboard (subcollection under the battle)
    if (playerPointsAwarded > 0) {
      const leaderboardRef = db
        .collection("fanBattles")
        .doc(battleId)
        .collection("leaderboard")
        .doc(playerId);

      batch.set(
        leaderboardRef,
        {
          playerId,
          playerName: playerName || "Unknown",
          points: FieldValue.increment(playerPointsAwarded),
          votes: FieldValue.increment(1),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }

    await batch.commit();

    // 3. Award user points via shared utility (handles transaction + user doc + global leaderboard)
    if (userPointsAwarded > 0) {
      await awardUserPoints({
        actualUserId,
        userName: resolvedName,
        userEmail: resolvedEmail,
        userExists,
        points: userPointsAwarded,
        reason: "PLAY_BATTLE",
        transactionId: `${actualUserId}_${battleId}_PLAY_BATTLE`,
        metadata: { battleId, playerId, playerName },
      });
    }

    console.log("Vote recorded successfully for user:", actualUserId);

    return NextResponse.json(
      {
        success: true,
        playerPointsAwarded,
        userPointsAwarded,
        message:
          direction === "right"
            ? `+${playerPointsAwarded} for player, +${userPointsAwarded} for you!`
            : "Skipped",
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/battle-vote error:", error);
    return NextResponse.json({ error: msg, details: error instanceof Error ? error.stack : undefined }, { status: 500 });
  }
}

// ─── GET — Fetch leaderboard for a battle ────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const battleId = searchParams.get("battleId");
    const userId   = searchParams.get("userId");

    if (searchParams.get("checkPlayed") === "true") {
      if (!userId) {
        return NextResponse.json({ interactedBattleIds: [] });
      }

      const sessionsSnap = await db
        .collection("battleSessions")
        .where("userId", "==", userId)
        .where("status", "==", "completed")
        .get();

      const completedBattleIds = sessionsSnap.docs.map((doc) => doc.data().battleId);

      return NextResponse.json({ success: true, interactedBattleIds: completedBattleIds });
    }

    // ── Normal leaderboard fetch: ?battleId=xxx&userId=xxx ──────────────────
    if (!battleId) {
      return NextResponse.json({ error: "battleId is required" }, { status: 400 });
    }

    const leaderboardSnap = await db
      .collection("fanBattles")
      .doc(battleId)
      .collection("leaderboard")
      .orderBy("points", "desc")
      .get();

    const leaderboard = leaderboardSnap.docs.map((doc, i) => ({
      rank: i + 1,
      ...doc.data(),
    }));

    let votedPlayerIds: string[] = [];
    let interactedPlayerIds: string[] = [];

    if (userId) {
      const votesSnap = await db
        .collection("battleVotes")
        .where("battleId", "==", battleId)
        .where("userId", "==", userId)
        .get();

      interactedPlayerIds = votesSnap.docs.map((doc) => doc.data().playerId as string);

      votedPlayerIds = votesSnap.docs
        .filter((doc) => doc.data().direction === "right")
        .map((doc) => doc.data().playerId as string);
    }

    return NextResponse.json({
      success: true,
      battleId,
      leaderboard,
      votedPlayerIds,
      interactedPlayerIds,
      total: leaderboard.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/battle-vote error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}