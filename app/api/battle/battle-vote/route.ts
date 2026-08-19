// app/api/battle/battle-vote/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet & SocialAndContent Tables)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { getUserInfo, awardUserPoints } from "@/lib/userPoints";
import { QueryCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

async function hasTransactionForBattle(
  userId: string,
  battleId: string
): Promise<boolean> {
  // Check DynamoDB GamificationAndWallet first
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: "GamificationAndWallet",
        Key: {
          userId: `USER#${userId}`,
          sk: `TX#${userId}_${battleId}_PLAY_BATTLE`,
        },
      })
    );
    if (res.Item) return true;
  } catch (_) {}

  try {
    const transactionId = `${userId}_${battleId}_PLAY_BATTLE`;
    const snapshot = await db.collection("userPointTransactions").doc(transactionId).get();
    return snapshot.exists;
  } catch (_) {
    return false;
  }
}

// ─── POST — Record a vote ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { battleId, playerId, playerName, userId, userEmail, userName, direction } = body;

    if (!battleId || typeof battleId !== "string")
      return NextResponse.json({ error: "battleId is required" }, { status: 400 });
    if (!playerId || typeof playerId !== "string")
      return NextResponse.json({ error: "playerId is required" }, { status: 400 });
    if (!userId || typeof userId !== "string")
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    if (!direction || !["left", "right"].includes(direction))
      return NextResponse.json({ error: "direction must be 'left' or 'right'" }, { status: 400 });

    const playerPointsAwarded = direction === "right" ? 15 : 0;
    const userPointsAwarded = direction === "right" ? 5 : 0;

    // Check duplicate vote in DynamoDB
    const voteKey = `${battleId}_${userId}_${playerId}`;
    let alreadyVoted = false;
    try {
      const vGet = await docClient.send(
        new GetCommand({
          TableName: "GamificationAndWallet",
          Key: {
            userId: `USER#${userId}`,
            sk: `VOTE#${voteKey}`,
          },
        })
      );
      if (vGet.Item) alreadyVoted = true;
    } catch (_) {}

    if (!alreadyVoted) {
      const voteSnap = await db.collection("battleVotes").doc(voteKey).get();
      if (voteSnap.exists) alreadyVoted = true;
    }

    if (alreadyVoted) {
      return NextResponse.json(
        { error: "You have already voted for this player in this battle", alreadyVoted: true },
        { status: 409 }
      );
    }

    const { userName: resolvedName, userEmail: resolvedEmail, exists: userExists, actualUserId } =
      await getUserInfo(userId, userName, userEmail);

    const now = Date.now();

    // ── Dual-Write Vote to DynamoDB & Firebase ────────────────────────────────
    const voteItem = {
      battleId,
      playerId,
      playerName: playerName || "Unknown",
      userId: actualUserId,
      direction,
      pointsAwarded: playerPointsAwarded,
      createdAt: now,
    };

    const dynamoVote = {
      ...voteItem,
      userId: `USER#${actualUserId}`,
      sk: `VOTE#${voteKey}`,
    };

    await dualWrite("battleVotes", voteKey, "GamificationAndWallet", dynamoVote);

    // Update Firebase player leaderboard subcollection
    if (playerPointsAwarded > 0) {
      try {
        await db
          .collection("fanBattles")
          .doc(battleId)
          .collection("leaderboard")
          .doc(playerId)
          .set(
            {
              playerId,
              playerName: playerName || "Unknown",
              points: FieldValue.increment(playerPointsAwarded),
              votes: FieldValue.increment(1),
              updatedAt: now,
            },
            { merge: true }
          );
      } catch (fbErr) {
        console.warn("Firebase player leaderboard update notice:", fbErr);
      }
    }

    // Award Points
    const alreadyHasTransaction = await hasTransactionForBattle(actualUserId, battleId);
    if (userPointsAwarded > 0 && !alreadyHasTransaction) {
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

    return NextResponse.json(
      {
        success: true,
        playerPointsAwarded,
        userPointsAwarded: alreadyHasTransaction ? 0 : userPointsAwarded,
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── GET — Fetch leaderboard for a battle ────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const battleId = searchParams.get("battleId");
    const userId = searchParams.get("userId");

    if (searchParams.get("checkPlayed") === "true") {
      if (!userId) {
        return NextResponse.json({ interactedBattleIds: [] });
      }

      let completedBattleIds: string[] = [];
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "GamificationAndWallet",
            KeyConditionExpression: "userId = :u AND begins_with(sk, :bsPrefix)",
            ExpressionAttributeValues: {
              ":u": `USER#${userId}`,
              ":bsPrefix": "BATTLE_SESSION#",
            },
          })
        );
        if (qRes.Items && qRes.Items.length > 0) {
          completedBattleIds = qRes.Items.map((item) => item.battleId as string).filter(Boolean);
        }
      } catch (err) {
        console.warn("DynamoDB checkPlayed query notice:", err);
      }

      if (completedBattleIds.length === 0) {
        try {
          const sessionsSnap = await db
            .collection("battleSessions")
            .where("userId", "==", userId)
            .where("status", "==", "completed")
            .get();

          completedBattleIds = sessionsSnap.docs.map((doc) => doc.data().battleId);
        } catch (fbErr) {
          console.warn("Firebase checkPlayed fallback notice:", fbErr);
        }
      }

      return NextResponse.json({ success: true, interactedBattleIds: completedBattleIds });
    }

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
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/battle-vote error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}