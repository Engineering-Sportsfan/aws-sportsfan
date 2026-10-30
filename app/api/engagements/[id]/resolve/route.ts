// app/api/engagements/[id]/resolve/route.ts — Outcome Resolution for Match Moment Predictions & Debates
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { UpdateCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { awardEngagementPoints } from "@/lib/engagementPoints";
import { getUser } from "@/lib/getUser";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { getCandidateTableNames } from "@/lib/dualWrite";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

    const body = await req.json();
    const authUser = await getUser(req);

    const { winningChoiceId, outcomeNotes, winningChoiceText, matchId } = body;

    if (!winningChoiceId) {
      return NextResponse.json({ error: "winningChoiceId is required to resolve outcome" }, { status: 400 });
    }

    const adminEmail = authUser?.email || body.adminEmail || "admin@sportsfan.com";

    // 1. Fetch existing engagement across SocialAndContent, MatchMoments, and Firestore
    const found = await findEngagementById(cleanId, matchId);
    if (!found?.item) {
      return NextResponse.json({ error: `Engagement "${cleanId}" not found` }, { status: 404 });
    }

    const engagement = found.item;
    const now = Date.now();
    const normalizedWinId = String(winningChoiceId).trim().toLowerCase();
    const resolvedMatchId = String(
      matchId ||
      engagement.matchId ||
      engagement.sportsRadarMatchId ||
      found?.matchMomentsRecord?.entityId ||
      ""
    ).replace(/^MATCH#/i, "").trim();

    // 2. Query all votes for this engagement from DynamoDB
    let voteItems: any[] = [];
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
          ExpressionAttributeValues: {
            ":cid": `ENGAGEMENT#${cleanId}`,
            ":skpfx": "VOTE#",
          },
        })
      );
      if (qRes.Items) {
        voteItems = qRes.Items;
      }
    } catch (qErr: any) {
      console.warn("[Resolve] DynamoDB vote query notice:", qErr?.message || qErr);
    }

    // Also fallback to Firestore if DynamoDB returned no votes
    if (voteItems.length === 0 && db) {
      try {
        const snap = await db
          .collection(getFirestoreCollection("user_engagements"))
          .where("engagementId", "==", cleanId)
          .get();
        voteItems = snap.docs.map(d => ({ ...d.data(), firestoreDocId: d.id }));
      } catch (fbVoteErr) {
        console.warn("[Resolve] Firestore vote query notice:", fbVoteErr);
      }
    }

    // 3. Award +10 SXPs to voters who selected the winning option
    let votersAwardedCount = 0;
    const bonusPoints = 10;
    const participantUserIds: string[] = [];
    const winningUserIds: string[] = [];

    for (const vote of voteItems) {
      const voterUserId = vote.userId || (vote.sk ? String(vote.sk).replace(/^VOTE#/, "") : "") || vote.userEmail;
      if (voterUserId && !participantUserIds.includes(voterUserId)) {
        participantUserIds.push(voterUserId);
      }

      const selectedId = String(vote.selectedOptionId || vote.choiceId || vote.selectedChoice || "").trim().toLowerCase();
      const selectedText = String(vote.selectedOptionText || vote.choiceText || "").trim().toLowerCase();
      const isWinner =
        selectedId === normalizedWinId ||
        (winningChoiceText && selectedText === String(winningChoiceText).trim().toLowerCase());

      if (isWinner) {
        if (voterUserId && !winningUserIds.includes(voterUserId)) {
          winningUserIds.push(voterUserId);
        }

        if (!vote.accuracyBonusAwarded) {
          const voterEmail = vote.userEmail || "";
          const voterName = vote.userName || "Fan Voter";

          if (voterUserId || voterEmail) {
            try {
              await awardEngagementPoints({
                userId: voterUserId || voterEmail,
                userEmail: voterEmail,
                userName: voterName,
                action: "accuracy_bonus",
                engagementId: cleanId,
                engagementType: engagement.type,
                engagementTitle: engagement.title,
                pointsBonus: bonusPoints,
                syncQuizLeaderboard: true,
                metadata: { reason: "CORRECT_PREDICTION_BONUS" },
              });

              votersAwardedCount++;

              // Update DynamoDB vote record
              if (vote.sk) {
                await docClient.send(
                  new UpdateCommand({
                    TableName: TABLES.SocialAndContent,
                    Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: vote.sk },
                    UpdateExpression: "SET accuracyBonusAwarded = :t, isCorrect = :t, wonBonusPoints = :pts, resolvedAt = :now",
                    ExpressionAttributeValues: {
                      ":t": true,
                      ":pts": bonusPoints,
                      ":now": now,
                    },
                  })
                ).catch((e) => console.warn("[Resolve] DDB vote bonus update notice:", e));
              }

              // Update Firestore user_engagements record
              if (db) {
                const docKey = vote.firestoreDocId || `${voterUserId || voterEmail}_${cleanId}`;
                await db.collection(getFirestoreCollection("user_engagements")).doc(docKey).set({
                  accuracyBonusAwarded: true,
                  isCorrect: true,
                  wonBonusPoints: bonusPoints,
                  resolvedAt: now,
                }, { merge: true }).catch((e) => console.warn("[Resolve] Firestore vote bonus update notice:", e));
              }
            } catch (awardErr) {
              console.warn(`[Resolve] Failed to award bonus to user "${voterUserId}":`, awardErr);
            }
          }
        }
      }
    }

    // 4. Update the engagement status to "settled" with outcome details
    const existingOptions = Array.isArray(engagement.options) ? engagement.options : [];
    const updatedOptions = existingOptions.map((o: any) => {
      const isWinner =
        String(o.id).trim().toLowerCase() === normalizedWinId ||
        (winningChoiceText && String(o.text).trim().toLowerCase() === String(winningChoiceText).trim().toLowerCase());
      return {
        ...o,
        isWinner,
      };
    });

    const updatedEngagement: any = {
      ...engagement,
      id: cleanId,
      status: "settled",
      winningChoiceId,
      outcomeWinningChoiceId: winningChoiceId,
      outcomeNotes: outcomeNotes || null,
      resolvedAt: now,
      resolvedBy: adminEmail,
      updatedAt: now,
      options: updatedOptions.length > 0 ? updatedOptions : engagement.options,
      predictionData: engagement.predictionData
        ? {
            ...engagement.predictionData,
            status: "settled",
            winningChoiceId,
            outcomeWinningChoiceId: winningChoiceId,
            correctAnswer: winningChoiceId,
            answer: winningChoiceId,
            resolvedAt: now,
          }
        : undefined,
      debateData: engagement.debateData
        ? {
            ...engagement.debateData,
            status: "settled",
            winningChoiceId,
            outcomeWinningChoiceId: winningChoiceId,
            verdict: winningChoiceId,
            resolvedAt: now,
          }
        : undefined,
      questionData: engagement.questionData
        ? {
            ...engagement.questionData,
            correctOptionId: winningChoiceId,
            resolvedAt: now,
          }
        : undefined,
      pollData: engagement.pollData
        ? {
            ...engagement.pollData,
            status: "settled",
            winningChoiceId,
            correctAnswer: winningChoiceId,
            resolvedAt: now,
          }
        : undefined,
    };

    // 5. Dual-persist update to SocialAndContent AND MatchMoments
    await persistEngagementUpdate(cleanId, updatedEngagement, found.matchMomentsRecord);

    // 6. Record reveal record in MatchMoments table for ROAR celebrations
    if (resolvedMatchId) {
      const candidateTables = getCandidateTableNames("MatchMoments");
      for (const tbl of candidateTables) {
        try {
          await docClient.send(
            new PutCommand({
              TableName: tbl,
              Item: {
                entityId: `MATCH#${resolvedMatchId}`,
                sk: `REVEAL#${cleanId}`,
                id: `REVEAL-${cleanId}`,
                type: "OUTCOME_RESOLVED",
                engagementId: cleanId,
                matchId: resolvedMatchId,
                momentType: engagement.type,
                title: engagement.title,
                winningChoiceId,
                winningChoiceText: winningChoiceText || winningChoiceId,
                outcomeNotes: outcomeNotes || null,
                votersAwardedCount,
                bonusPoints,
                participantUserIds,
                winningUserIds,
                createdAt: now,
              },
            })
          );
        } catch (e) {
          console.warn(`[Resolve] Failed to save reveal to ${tbl}:`, e);
        }
      }
    }

    // 7. Record floating in-room notification broadcast in Firestore for live room second screen users
    if (db) {
      try {
        await db.collection(getFirestoreCollection("match_room_notifications")).add({
          engagementId: cleanId,
          type: "OUTCOME_RESOLVED",
          matchId: resolvedMatchId,
          roomId: resolvedMatchId,
          momentType: engagement.type,
          title: engagement.title,
          winningChoiceId,
          winningChoiceText: winningChoiceText || winningChoiceId,
          outcomeNotes: outcomeNotes || null,
          votersAwardedCount,
          bonusPoints,
          participantUserIds,
          winningUserIds,
          message: `🎯 Outcome Revealed: "${winningChoiceText || winningChoiceId}". Click to view post!`,
          targetPostUrl: `/feed?engagementId=${cleanId}`,
          createdAt: now,
          expiresAt: now + 300000, // 5 min toast lifespan
        });
      } catch (notifErr) {
        console.warn("[Resolve] Match room notification notice:", notifErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Outcome resolved successfully! ${votersAwardedCount} winning voter(s) awarded +${bonusPoints} SXPs bonus.`,
      engagementId: cleanId,
      winningChoiceId,
      status: "settled",
      votersAwardedCount,
      resolvedAt: now,
      engagement: updatedEngagement,
    });
  } catch (error: any) {
    console.error("POST /api/engagements/[id]/resolve error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to resolve outcome" },
      { status: 500 }
    );
  }
}
