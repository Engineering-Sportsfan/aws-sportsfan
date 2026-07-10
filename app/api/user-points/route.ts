// //api/user-points/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";

// // Types
// interface PointTransaction {
//   userId: string;
//   userEmail: string;
//   userName: string;
//   points: number;
//   reason: 'CREATE_BATTLE' | 'PLAY_BATTLE' | 'INVITE_ACCEPTED' | 'PREDICTION_CORRECT' | 'FANTASY_WIN' | 'DAILY_LOGIN' | 'SHARE_BATTLE';
//   metadata?: {
//     battleId?: string;
//     predictionId?: string;
//     fantasyGameId?: string;
//     invitedUserId?: string;
//   };
//   createdAt: number;
// }

// // Point values for different actions
// const POINTS_CONFIG = {
//   CREATE_BATTLE: 10,
//   PLAY_BATTLE: 5,
//   INVITE_ACCEPTED: 10,
//   PREDICTION_CORRECT: 20,
//   FANTASY_WIN: 50,
//   DAILY_LOGIN: 2,
//   SHARE_BATTLE: 3,
// } as const;

// // ─── POST — Award points to a user ────────────────────────────────────────────
// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const { userId, userEmail, userName, reason, metadata } = body;

//     // Validation
//     if (!userId || typeof userId !== "string") {
//       return NextResponse.json({ error: "userId is required" }, { status: 400 });
//     }
//     if (!reason || !POINTS_CONFIG[reason as keyof typeof POINTS_CONFIG]) {
//       return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
//     }

//     const pointsToAdd = POINTS_CONFIG[reason as keyof typeof POINTS_CONFIG];
    
//     // Get user reference
//     const userRef = db.collection("users").doc(userId);
//     const userSnap = await userRef.get();

//     // Create transaction record
//     const transactionId = `${userId}_${Date.now()}_${reason}`;
//     const transactionRef = db.collection("userPointTransactions").doc(transactionId);

//     // Check for duplicate transactions (prevent double counting)
//     const existingTransaction = await transactionRef.get();
//     if (existingTransaction.exists) {
//       return NextResponse.json(
//         { error: "Transaction already recorded" },
//         { status: 409 }
//       );
//     }

//     // Prepare transaction data
//     const transaction: PointTransaction = {
//       userId,
//       userEmail: userEmail || "",
//       userName: userName || "Unknown User",
//       points: pointsToAdd,
//       reason,
//       metadata: metadata || {},
//       createdAt: Date.now(),
//     };

//     // Run batch write to ensure consistency
//     const batch = db.batch();

//     // 1. Add transaction record
//     batch.set(transactionRef, transaction);

//     // 2. Update user's total points in the users collection
//     if (!userSnap.exists) {
//       // Create user document if it doesn't exist
//       batch.set(userRef, {
//         userId,
//         email: userEmail,
//         name: userName,
//         totalPoints: pointsToAdd,
//         pointsBreakdown: {
//           [reason]: pointsToAdd,
//         },
//         lastUpdated: Date.now(),
//       });
//     } else {
//       // Update existing user
//       batch.update(userRef, {
//         totalPoints: FieldValue.increment(pointsToAdd),
//         [`pointsBreakdown.${reason}`]: FieldValue.increment(pointsToAdd),
//         lastUpdated: Date.now(),
//       });
//     }

//     // 3. Update global leaderboard
//     const leaderboardRef = db.collection("globalLeaderboard").doc(userId);
//     batch.set(
//       leaderboardRef,
//       {
//         userId,
//         userName: userName || "Unknown User",
//         userEmail: userEmail || "",
//         totalPoints: FieldValue.increment(pointsToAdd),
//         lastUpdated: Date.now(),
//       },
//       { merge: true }
//     );

//     await batch.commit();

//     return NextResponse.json({
//       success: true,
//       pointsAwarded: pointsToAdd,
//       totalPointsAfter: (userSnap.exists ? userSnap.data()?.totalPoints || 0 : 0) + pointsToAdd,
//       reason,
//       message: `+${pointsToAdd} points awarded!`,
//     });

//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("POST /api/user-points error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── GET — Fetch global leaderboard ───────────────────────────────────────────
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const userId = searchParams.get("userId");
//     const limit = parseInt(searchParams.get("limit") || "50");
//     const timeFrame = searchParams.get("timeFrame") || "all-time";

//     const leaderboardQuery = db.collection("globalLeaderboard")
//       .orderBy("totalPoints", "desc")
//       .limit(limit);

//     const leaderboardSnap = await leaderboardQuery.get();
    
//     const leaderboard = leaderboardSnap.docs.map((doc, index) => ({
//       rank: index + 1,
//       ...doc.data(),
//     }));

//     // Get current user's rank and points
//     let currentUserRank = null;
//     let currentUserPoints = null;
    
//     if (userId && userId !== "null" && userId !== "undefined") {
//       const userLeaderboardRef = db.collection("globalLeaderboard").doc(userId);
//       const userLeaderboardSnap = await userLeaderboardRef.get();
      
//       if (userLeaderboardSnap.exists) {
//         currentUserPoints = userLeaderboardSnap.data()?.totalPoints || 0;
        
//         // Find user's rank (consider using a more efficient method in production)
//         const allUsers = await db.collection("globalLeaderboard")
//           .orderBy("totalPoints", "desc")
//           .get();
        
//         currentUserRank = allUsers.docs.findIndex(doc => doc.id === userId) + 1;
//         if (currentUserRank === 0) currentUserRank = null;
//       }
//     }

//     return NextResponse.json({
//       success: true,
//       leaderboard,
//       currentUser: {
//         userId: userId || null,
//         rank: currentUserRank,
//         points: currentUserPoints,
//       },
//       total: leaderboard.length,
//       timeFrame,
//     });

//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/user-points error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }



// // // ─── GET /transactions — Fetch user's point history 
// // export async function PATCH(req: NextRequest) {
// //   try {
// //     const { searchParams } = new URL(req.url);
// //     const userId = searchParams.get("userId");
// //     const limit = parseInt(searchParams.get("limit") || "20");

// //     if (!userId) {
// //       return NextResponse.json({ error: "userId is required" }, { status: 400 });
// //     }

// //     const transactionsSnap = await db
// //       .collection("userPointTransactions")
// //       .where("userId", "==", userId)
// //       .orderBy("createdAt", "desc")
// //       .limit(limit)
// //       .get();

// //     const transactions = transactionsSnap.docs.map(doc => ({
// //       id: doc.id,
// //       ...doc.data(),
// //     }));

// //     return NextResponse.json({
// //       success: true,
// //       transactions,
// //       total: transactions.length,
// //     });

// //   } catch (error: unknown) {
// //     const msg = error instanceof Error ? error.message : "Unexpected error";
// //     console.error("GET /api/user-points/transactions error:", error);
// //     return NextResponse.json({ error: msg }, { status: 500 });
// //   }
// // }











// api/user-points/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { awardUserPoints, getUserInfo } from "@/lib/userPoints";

// ─── POST — Award points to a user ────────────────────────────────────────────
// Body: { userId, userEmail, userName, reason, transactionId, metadata? }
//
// `reason`        — any string e.g. "DAILY_LOGIN", "SHARE_BATTLE", "INVITE_ACCEPTED"
//                   No hardcoded list — just pass what the feature needs.
//
// `transactionId` — caller must supply a deterministic ID so duplicate calls
//                   are idempotent. Examples:
//                     DAILY_LOGIN   → `${userId}_${todayDateString}_DAILY_LOGIN`
//                     SHARE_BATTLE  → `${userId}_${battleId}_SHARE_BATTLE`
//                     INVITE_ACCEPTED → `${userId}_${invitedUserId}_INVITE_ACCEPTED`
//                   Using Date.now() here would break idempotency — don't do it.

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actualUserId, userId: requestedUserId, userEmail, userName, reason, transactionId, points, metadata } = body;
    const userId = requestedUserId || actualUserId;

    // ── Validation ────────────────────────────────────────────────────────────
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }
    if (!reason || typeof reason !== "string") {
      return NextResponse.json({ error: "reason is required" }, { status: 400 });
    }
    if (!transactionId || typeof transactionId !== "string") {
      return NextResponse.json(
        { error: "transactionId is required — supply a deterministic ID to ensure idempotency" },
        { status: 400 }
      );
    }
    if (!points || typeof points !== "number" || points <= 0) {
      return NextResponse.json(
        { error: "points must be a positive number" },
        { status: 400 }
      );
    }

    // ── Resolve canonical user info from Firestore ────────────────────────────
    const {
      userName: resolvedName,
      userEmail: resolvedEmail,
      exists: userExists,
    } = await getUserInfo(userId, userName, userEmail);

    // ── Award points (idempotent — no-ops if transactionId already exists) ────
    const awarded = await awardUserPoints({
      actualUserId,
      userName: resolvedName,
      userEmail: resolvedEmail,
      userExists,
      points,
      reason,
      transactionId,
      metadata,
    });

    if (!awarded) {
      return NextResponse.json(
        { error: "Transaction already recorded", alreadyAwarded: true },
        { status: 409 }
      );
    }

    // Return updated total from Firestore for an accurate "after" value
    const userSnap = await db.collection("users").doc(actualUserId).get();
    const totalPointsAfter = userSnap.data()?.totalPoints ?? points;

    return NextResponse.json({
      success: true,
      pointsAwarded: points,
      totalPointsAfter,
      reason,
      message: `+${points} points awarded!`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/user-points error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// // ─── GET — Fetch global leaderboard 
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const userId = searchParams.get("userId");
//     const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
//     const timeFrame = searchParams.get("timeFrame") || "all-time";

//     const leaderboardSnap = await db
//       .collection("globalLeaderboard")
//       .orderBy("totalPoints", "desc")
//       .limit(limit)
//       .get();

//     const leaderboard = leaderboardSnap.docs.map((doc, index) => ({
//       rank: index + 1,
//       ...doc.data(),
//     }));

//     // ── Current user rank + points ────────────────────────────────────────────
//     let currentUserRank: number | null = null;
//     let currentUserPoints: number | null = null;

//     if (userId && userId !== "null" && userId !== "undefined") {
//       const userLeaderboardSnap = await db
//         .collection("globalLeaderboard")
//         .doc(userId)
//         .get();

//       if (userLeaderboardSnap.exists) {
//         currentUserPoints = userLeaderboardSnap.data()?.totalPoints ?? 0;

//         const allUsers = await db
//           .collection("globalLeaderboard")
//           .orderBy("totalPoints", "desc")
//           .get();

//         const idx = allUsers.docs.findIndex((doc) => doc.id === userId);
//         currentUserRank = idx >= 0 ? idx + 1 : null;
//       }
//     }

//     return NextResponse.json({
//       success: true,
//       leaderboard,
//       currentUser: {
//         userId: userId || null,
//         rank: currentUserRank,
//         points: currentUserPoints,
//       },
//       total: leaderboard.length,
//       timeFrame,
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/user-points error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// api/user-points/route.ts - Keep it simple
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    // Get leaderboard
    const leaderboardSnap = await db
      .collection("globalLeaderboard")
      .orderBy("totalPoints", "desc")
      .limit(limit)
      .get();

    const leaderboard = leaderboardSnap.docs.map((doc) => ({
      userId: doc.id,
      ...doc.data(),
    }));

    let currentUser = null;

    // Get specific user if requested
    if (userId && userId !== "null" && userId !== "undefined") {
      const decodedUserId = decodeURIComponent(userId);
      const userDoc = await db
        .collection("globalLeaderboard")
        .doc(decodedUserId)
        .get();

      if (userDoc.exists) {
        currentUser = {
          userId: userDoc.id,
          ...userDoc.data(),
        };
      }
    }

    return NextResponse.json({
      success: true,
      leaderboard,
      currentUser,
      total: leaderboard.length,
    });
  } catch (error: unknown) {
    // error handling
    if (error instanceof Error) {
      console.error("GET /api/user-points error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
}
