// app/api/engagements/[id]/resolve/route.ts — Outcome Resolution for Match Moment Predictions & Debates
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { dualWrite, getCandidateTableNames } from "@/lib/dualWrite";
import { GetCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { awardEngagementPoints } from "@/lib/engagementPoints";
import { getUser } from "@/lib/getUser";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const authUser = await getUser(req);

    const { winningChoiceId, outcomeNotes, winningChoiceText } = body;

    if (!winningChoiceId) {
      return NextResponse.json({ error: "winningChoiceId is required to resolve outcome" }, { status: 400 });
    }

    const adminEmail = authUser?.email || body.adminEmail || "admin@sportsfan.com";

    // 1. Fetch existing engagement
    let engagement: any = null;
    const candidateTables = getCandidateTableNames(TABLES.SocialAndContent);
    for (const table of candidateTables) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: table,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
          })
        );
        if (getRes.Item) {
          engagement = getRes.Item;
          break;
        }
      } catch (err: any) {
        console.warn(`[Resolve] DDB fetch notice on "${table}":`, err?.message || err);
      }
    }

    if (!engagement && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
        if (snap.exists) {
          engagement = { id: snap.id, ...snap.data() };
        }
      } catch (fbErr) {
        console.warn("[Resolve] Firestore fallback notice:", fbErr);
      }
    }

    if (!engagement) {
      return NextResponse.json({ error: `Engagement "${id}" not found` }, { status: 404 });
    }

    const now = Date.now();
    const normalizedWinId = String(winningChoiceId).trim().toLowerCase();

    // 2. Query all votes for this engagement from DynamoDB
    let voteItems: any[] = [];
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
          ExpressionAttributeValues: {
            ":cid": `ENGAGEMENT#${id}`,
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
          .where("engagementId", "==", id)
          .get();
        voteItems = snap.docs.map(d => ({ ...d.data(), firestoreDocId: d.id }));
      } catch (fbVoteErr) {
        console.warn("[Resolve] Firestore vote query notice:", fbVoteErr);
      }
    }

    // 3. Award +10 SXPs to voters who selected the winning option
    let votersAwardedCount = 0;
    const bonusPoints = 10;

    for (const vote of voteItems) {
      const selectedId = String(vote.selectedOptionId || vote.choiceId || vote.selectedChoice || "").trim().toLowerCase();
      const selectedText = String(vote.selectedOptionText || vote.choiceText || "").trim().toLowerCase();
      const isWinner =
        selectedId === normalizedWinId ||
        (winningChoiceText && selectedText === String(winningChoiceText).trim().toLowerCase());

      if (isWinner && !vote.accuracyBonusAwarded) {
        const voterUserId = vote.userId || (vote.sk ? String(vote.sk).replace(/^VOTE#/, "") : "");
        const voterEmail = vote.userEmail || "";
        const voterName = vote.userName || "Fan Voter";

        if (voterUserId || voterEmail) {
          try {
            await awardEngagementPoints({
              userId: voterUserId || voterEmail,
              userEmail: voterEmail,
              userName: voterName,
              action: "accuracy_bonus",
              engagementId: id,
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
                  Key: { contentId: `ENGAGEMENT#${id}`, sk: vote.sk },
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
              const docKey = vote.firestoreDocId || `${voterUserId || voterEmail}_${id}`;
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

    // 4. Update the engagement status to "settled" with outcome details
    const updatedEngagement = {
      ...engagement,
      status: "settled",
      winningChoiceId,
      outcomeWinningChoiceId: winningChoiceId,
      outcomeNotes: outcomeNotes || null,
      resolvedAt: now,
      resolvedBy: adminEmail,
      updatedAt: now,
      predictionData: engagement.predictionData
        ? {
            ...engagement.predictionData,
            status: "settled",
            winningChoiceId,
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
    };

    // Clean up undefined properties for DynamoDB
    const dynamoItem: any = {
      contentId: `ENGAGEMENT#${id}`,
      sk: "ENGAGEMENT#META",
      entityId: `ENGAGEMENT#${(updatedEngagement.type || "PREDICTION").toUpperCase()}`,
      ...updatedEngagement,
    };

    // 5. Dual Write to DynamoDB + Firestore
    await dualWrite("engagements", id, TABLES.SocialAndContent, dynamoItem);

    // 6. Record floating in-room notification broadcast in Firestore for live room second screen users
    if (db) {
      try {
        await db.collection("match_room_notifications").add({
          engagementId: id,
          type: "OUTCOME_RESOLVED",
          momentType: engagement.type,
          title: engagement.title,
          winningChoiceId,
          winningChoiceText: winningChoiceText || winningChoiceId,
          outcomeNotes: outcomeNotes || null,
          votersAwardedCount,
          bonusPoints,
          message: `🎯 Outcome Revealed: "${winningChoiceText || winningChoiceId}". Click to view post!`,
          targetPostUrl: `/feed?engagementId=${id}`,
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
      engagementId: id,
      winningChoiceId,
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
