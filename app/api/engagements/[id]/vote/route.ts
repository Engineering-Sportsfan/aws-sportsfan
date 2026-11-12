// app/api/engagements/[id]/vote/route.ts — Interactive Voting, Quiz Validation & Prediction Staking with Single-Vote Enforcement
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { GetCommand, UpdateCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { awardEngagementPoints } from "@/lib/engagementPoints";
import { dispatchFlipArenaNotification } from "@/lib/notifications";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { applyEngagementStats, getEngagementStats, primaryOptions } from "@/lib/engagementSocial";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

// ─── GET /api/engagements/[id]/vote — Check if user has already voted ─────────
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const authUser = await getUser(req);
    const userId = authUser?.userId || searchParams.get("userId") || authUser?.email;
    const userEmail = authUser?.email || searchParams.get("userEmail");

    if (!userId && !userEmail) {
      return NextResponse.json({ hasVoted: false });
    }

    let voteItem: any = null;
    const candidateIds = Array.from(new Set([userId, userEmail, searchParams.get("userId")].filter(Boolean))) as string[];

    // 1. Check standardized DynamoDB key shape for each candidate ID
    for (const uid of candidateIds) {
      if (voteItem) break;
      try {
        // Per-question votes (VOTE#{uid}#...); the "#" keeps uid "abc" from matching "abcd"
        const queryVote = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
            ExpressionAttributeValues: {
              ":cid": `ENGAGEMENT#${id}`,
              ":skpfx": `VOTE#${uid}#`,
            },
            Limit: 1,
          })
        );
        if (queryVote.Items && queryVote.Items.length > 0) {
          voteItem = queryVote.Items[0];
          break;
        }

        // Also direct GetCommand for exact match
        const getVote = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${uid}` },
          })
        );
        if (getVote.Item) {
          voteItem = getVote.Item;
          break;
        }
      } catch (dynErr) {
        console.warn("DynamoDB vote status check notice:", dynErr);
      }
    }

    // 2. Fallback: Check legacy DynamoDB key shape: contentId = USER_VOTE#{userId}, sk begins_with ENGAGEMENT#{id}
    if (!voteItem) {
      for (const uid of candidateIds) {
        if (voteItem) break;
        try {
          const legacyQuery = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":cid": `USER_VOTE#${uid}`,
                ":skpfx": `ENGAGEMENT#${id}`,
              },
              Limit: 1,
            })
          );
          if (legacyQuery.Items && legacyQuery.Items.length > 0) {
            voteItem = legacyQuery.Items[0];
            break;
          }
        } catch { }
      }
    }

    // 3. Fallback: Check Firestore user_engagements collection
    if (!voteItem && db) {
      for (const uid of candidateIds) {
        if (voteItem) break;
        try {
          const snap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${uid}_${id}`).get();
          if (snap.exists) {
            voteItem = snap.data();
            break;
          }
          // Also check doc ID query
          const qSnap = await db
            .collection(getFirestoreCollection("user_engagements"))
            .where("userId", "==", uid)
            .where("engagementId", "==", id)
            .limit(1)
            .get();
          if (!qSnap.empty) {
            voteItem = qSnap.docs[0].data();
            break;
          }
        } catch { }
      }
    }

    // 4. Fetch Engagement Metadata for Timer Expiry & Correct Answer Check
    let engagementItem: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) engagementItem = getRes.Item;
    } catch { }

    if (!engagementItem && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
        if (snap.exists) engagementItem = { id: snap.id, ...snap.data() };
      } catch { }
    }

    const now = Date.now();
    const startTime = Number(
      engagementItem?.pollData?.startTime ||
      engagementItem?.predictionData?.startTime ||
      engagementItem?.startTime ||
      engagementItem?.createdAt ||
      0
    );
    const durationMins = Number(
      engagementItem?.pollData?.durationMinutes ||
      engagementItem?.pollData?.timerMinutes ||
      engagementItem?.predictionData?.durationMinutes ||
      engagementItem?.predictionData?.timerMinutes ||
      (engagementItem?.type === "poll" ? 10 : engagementItem?.type === "prediction" ? 30 : 0)
    );
    const computedExpiresAt =
      engagementItem?.expiresAt ||
      engagementItem?.pollData?.expiresAt ||
      engagementItem?.predictionData?.expiresAt ||
      (startTime > 0 && durationMins > 0 ? startTime + durationMins * 60 * 1000 : null);
    const isExpired = Boolean(computedExpiresAt && now >= Number(computedExpiresAt));

    let correctAnswer = "";
    let winningChoiceId = "";
    if (engagementItem?.type === "poll") {
      correctAnswer =
        engagementItem.pollData?.correctAnswer ||
        engagementItem.pollData?.answer ||
        engagementItem.correctAnswer ||
        "";
    } else if (engagementItem?.type === "prediction") {
      correctAnswer =
        engagementItem.predictionData?.correctAnswer ||
        engagementItem.predictionData?.answer ||
        engagementItem.correctAnswer ||
        "";
      winningChoiceId =
        engagementItem.predictionData?.winningChoiceId ||
        engagementItem.winningChoiceId ||
        correctAnswer ||
        "";
    }

    if (!voteItem && (searchParams.get("selectedOptionId") || searchParams.get("choice"))) {
      const clientOpt = searchParams.get("selectedOptionId") || searchParams.get("choice");
      voteItem = {
        userId,
        selectedOptionId: clientOpt,
        votedAt: now,
      };
    }

    let isCorrect: boolean | null = null;
    let wonBonusPoints = 0;
    let newlyAwarded = false;

    if (voteItem && (engagementItem?.type === "poll" || engagementItem?.type === "prediction")) {
      const userChoice = String(voteItem.selectedOptionId || "").trim().toLowerCase();
      const leftText = String(engagementItem.predictionData?.leftChoice?.text || "").trim().toLowerCase();
      const leftCode = String(engagementItem.predictionData?.leftChoice?.code || "").trim().toLowerCase();
      const rightText = String(engagementItem.predictionData?.rightChoice?.text || "").trim().toLowerCase();
      const rightCode = String(engagementItem.predictionData?.rightChoice?.code || "").trim().toLowerCase();
      const winTarget = String(winningChoiceId || correctAnswer).trim().toLowerCase();

      if (engagementItem.type === "prediction") {
        const isLeftWinning =
          winTarget === "left" ||
          (!!leftText && winTarget === leftText) ||
          (!!leftCode && winTarget === leftCode) ||
          (!!leftText && leftText.includes(winTarget) && winTarget.length > 2);

        const isRightWinning =
          winTarget === "right" ||
          (!!rightText && winTarget === rightText) ||
          (!!rightCode && winTarget === rightCode) ||
          (!!rightText && rightText.includes(winTarget) && winTarget.length > 2);

        const isUserLeft =
          userChoice === "left" ||
          (!!leftText && userChoice === leftText) ||
          (!!leftCode && userChoice === leftCode);

        const isUserRight =
          userChoice === "right" ||
          (!!rightText && userChoice === rightText) ||
          (!!rightCode && userChoice === rightCode);

        if (isLeftWinning && isUserLeft) {
          isCorrect = true;
        } else if (isRightWinning && isUserRight) {
          isCorrect = true;
        } else if (winTarget && userChoice === winTarget) {
          isCorrect = true;
        } else if (winTarget) {
          isCorrect = false;
        }
      } else if (engagementItem.type === "poll") {
        if (correctAnswer) {
          const correctLower = String(correctAnswer).trim().toLowerCase();
          if (userChoice === correctLower) {
            isCorrect = true;
          } else if (engagementItem.pollData?.options) {
            const chosenOpt = engagementItem.pollData.options.find(
              (o: any) =>
                String(o.id).trim().toLowerCase() === userChoice ||
                String(o.text || o.label || "").trim().toLowerCase() === userChoice
            );
            const targetOpt = engagementItem.pollData.options.find(
              (o: any) =>
                String(o.id).trim().toLowerCase() === correctLower ||
                String(o.text || o.label || "").trim().toLowerCase() === correctLower ||
                (o.text && correctLower && (
                  String(o.text).toLowerCase().includes(correctLower) ||
                  correctLower.includes(String(o.text).toLowerCase())
                ))
            );

            if (chosenOpt && targetOpt && chosenOpt.id === targetOpt.id) {
              isCorrect = true;
            } else if (chosenOpt && (
              String(chosenOpt.id).toLowerCase() === correctLower ||
              String(chosenOpt.text || chosenOpt.label || "").trim().toLowerCase() === correctLower
            )) {
              isCorrect = true;
            } else if (chosenOpt?.isCorrect === true) {
              isCorrect = true;
            } else {
              isCorrect = false;
            }
          } else {
            isCorrect = false;
          }
        }
      }

      // If timer is expired and outcome was correct, award +10 points if not already awarded
      if (isExpired && isCorrect && !voteItem.accuracyBonusAwarded) {
        try {
          const awardUid = voteItem.userId || userId;
          const awardEmail = authUser?.email || (awardUid && awardUid.includes("@") ? awardUid : "");
          const awardName = authUser?.name || "";

          const ptsRes = await awardEngagementPoints({
            userId: awardUid,
            userEmail: awardEmail,
            userName: awardName,
            action: "accuracy_bonus",
            engagementId: id,
            engagementType: engagementItem.type,
            engagementTitle: engagementItem.title,
            pointsBonus: 10,
            metadata: {
              reason: "CORRECT_PREDICTION_BONUS",
              bonusPoints: 10,
              type: engagementItem.type,
            },
          });

          if (ptsRes.success) {
            newlyAwarded = true;
          }

          // Mark accuracyBonusAwarded = true in DynamoDB
          await docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${id}`, sk: voteItem.sk || `VOTE#${awardUid}` },
              UpdateExpression: "SET accuracyBonusAwarded = :t, isCorrect = :t, wonBonusPoints = :pts, resolvedAt = :now",
              ExpressionAttributeValues: {
                ":t": true,
                ":pts": 10,
                ":now": now,
              },
            })
          ).catch((e) => console.warn("DDB accuracy bonus flag update notice:", e));

          // Mark in Firestore
          if (db) {
            await db.collection(getFirestoreCollection("user_engagements")).doc(`${awardUid}_${id}`).set({
              accuracyBonusAwarded: true,
              isCorrect: true,
              wonBonusPoints: 10,
              resolvedAt: now,
            }, { merge: true }).catch((e) => console.warn("Firestore accuracy bonus flag notice:", e));
          }

          voteItem.accuracyBonusAwarded = true;
          voteItem.isCorrect = true;
          voteItem.wonBonusPoints = 10;
          wonBonusPoints = 10;
        } catch (awardErr) {
          console.warn("Failed to award accuracy bonus points:", awardErr);
        }
      } else if (voteItem.accuracyBonusAwarded) {
        wonBonusPoints = voteItem.wonBonusPoints || 10;
      }
    }

    return NextResponse.json({
      hasVoted: !!voteItem,
      selectedOptionId: voteItem?.selectedOptionId || null,
      vote: voteItem,
      isExpired,
      expiresAt: computedExpiresAt || null,
      isCorrect,
      accuracyBonusAwarded: Boolean(voteItem?.accuracyBonusAwarded),
      wonBonusPoints,
      newlyAwarded,
      correctAnswer: correctAnswer || winningChoiceId || null,
      winningChoiceId: winningChoiceId || null,
    });
  } catch (error: unknown) {
    console.error("GET /api/engagements/[id]/vote error:", error);
    return NextResponse.json({ hasVoted: false });
  }
}

// ─── POST /api/engagements/[id]/vote — Cast Vote (Enforces 1 vote per user) ───
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { selectedOptionId, questionId, userId: inputUserId, userName, userAvatar, changeVote, previousOptionId } = body;

    if (!selectedOptionId) {
      return NextResponse.json({ error: "selectedOptionId is required" }, { status: 400 });
    }

    // Try to get authenticated user or fallback to input ID / client identifier
    const authUser = await getUser(req);
    const userId =
      authUser?.userId ||
      authUser?.email ||
      inputUserId ||
      req.headers.get("x-user-id") ||
      `anon_${req.headers.get("x-forwarded-for") || "client"}`;

    const voteSk = questionId ? `VOTE#${userId}#${questionId}` : `VOTE#${userId}`;
    const firestoreVoteDocId = questionId ? `${userId}_${id}_${questionId}` : `${userId}_${id}`;

    // ─── Step 1: Enforce Single-Vote Pre-check ────────────────────────────────
    let existingVote: any = null;
    const candidateIds = Array.from(
      new Set([userId, inputUserId, authUser?.userId, authUser?.email].filter(Boolean))
    ) as string[];

    for (const uid of candidateIds) {
      if (existingVote) break;
      if (questionId) {
        try {
          const r = await docClient.send(new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${uid}#${questionId}` },
          }));
          if (r.Item) { existingVote = r.Item; break; }
        } catch { }
        continue; // skip the begins_with check below
      }
      // 1. Exact key check, then this user's per-question votes (VOTE#{uid}#...).
      // The "#" keeps uid "abc" from matching another user "abcd".
      try {
        const voteRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${uid}` },
          })
        );
        if (voteRes.Item) {
          existingVote = voteRes.Item;
          break;
        }

        const queryVote = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
            ExpressionAttributeValues: {
              ":cid": `ENGAGEMENT#${id}`,
              ":skpfx": `VOTE#${uid}#`,
            },
            Limit: 1,
          })
        );
        if (queryVote.Items && queryVote.Items.length > 0) {
          existingVote = queryVote.Items[0];
          break;
        }
      } catch (dynCheckErr) {
        console.warn("DynamoDB existing vote check notice:", dynCheckErr);
      }

      // 2. Check legacy DynamoDB key format: contentId = USER_VOTE#{uid}, sk begins_with ENGAGEMENT#{id}
      if (!existingVote) {
        try {
          const legacyVoteRes = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":cid": `USER_VOTE#${uid}`,
                ":skpfx": `ENGAGEMENT#${id}`,
              },
              Limit: 1,
            })
          );
          if (legacyVoteRes.Items && legacyVoteRes.Items.length > 0) {
            existingVote = legacyVoteRes.Items[0];
            break;
          }
        } catch { }
      }

      // 3. Firestore fallback check
      if (!existingVote && db) {
        try {
          const snap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${uid}_${id}`).get();
          if (snap.exists) {
            existingVote = snap.data();
            break;
          }
          if (questionId) {
            const qSnap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${uid}_${id}_${questionId}`).get();
            if (qSnap.exists) {
              existingVote = qSnap.data();
              break;
            }
          }
        } catch { }
      }
    }

    if (existingVote) {
      // If client is claiming accuracy bonus on an expired event
      if (body.action === "claim_bonus" || body.claimBonus === true) {
        let engagementItem: any = null;
        try {
          const getRes = await docClient.send(
            new GetCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
            })
          );
          if (getRes.Item) engagementItem = getRes.Item;
        } catch { }
        if (!engagementItem && db) {
          const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
          if (snap.exists) engagementItem = { id: snap.id, ...snap.data() };
        }

        const now = Date.now();
        const startTime = Number(
          engagementItem?.pollData?.startTime ||
          engagementItem?.predictionData?.startTime ||
          engagementItem?.startTime ||
          engagementItem?.createdAt ||
          0
        );
        const durationMins = Number(
          engagementItem?.pollData?.durationMinutes ||
          engagementItem?.pollData?.timerMinutes ||
          engagementItem?.predictionData?.durationMinutes ||
          engagementItem?.predictionData?.timerMinutes ||
          (engagementItem?.type === "poll" ? 10 : engagementItem?.type === "prediction" ? 30 : 0)
        );
        const computedExpiresAt =
          engagementItem?.expiresAt ||
          engagementItem?.pollData?.expiresAt ||
          engagementItem?.predictionData?.expiresAt ||
          (startTime > 0 && durationMins > 0 ? startTime + durationMins * 60 * 1000 : null);
        const isExpired = Boolean(computedExpiresAt && now >= Number(computedExpiresAt));

        let isCorrect = false;
        const correctAnswer =
          engagementItem?.pollData?.correctAnswer ||
          engagementItem?.pollData?.answer ||
          engagementItem?.correctAnswer ||
          "";
        const winningChoiceId =
          engagementItem?.predictionData?.winningChoiceId ||
          engagementItem?.winningChoiceId ||
          correctAnswer ||
          "";

        const userChoice = String(existingVote.selectedOptionId || selectedOptionId || "").trim().toLowerCase();

        if (engagementItem?.type === "prediction") {
          const winTarget = String(winningChoiceId || correctAnswer).trim().toLowerCase();
          const leftText = String(engagementItem.predictionData?.leftChoice?.text || "").trim().toLowerCase();
          const leftCode = String(engagementItem.predictionData?.leftChoice?.code || "").trim().toLowerCase();
          const rightText = String(engagementItem.predictionData?.rightChoice?.text || "").trim().toLowerCase();
          const rightCode = String(engagementItem.predictionData?.rightChoice?.code || "").trim().toLowerCase();

          const isLeftWinning = winTarget === "left" || (!!leftText && winTarget === leftText) || (!!leftCode && winTarget === leftCode) || (!!leftText && leftText.includes(winTarget) && winTarget.length > 2);
          const isRightWinning = winTarget === "right" || (!!rightText && winTarget === rightText) || (!!rightCode && winTarget === rightCode) || (!!rightText && rightText.includes(winTarget) && winTarget.length > 2);
          const isUserLeft = userChoice === "left" || (!!leftText && userChoice === leftText) || (!!leftCode && userChoice === leftCode);
          const isUserRight = userChoice === "right" || (!!rightText && userChoice === rightText) || (!!rightCode && userChoice === rightCode);

          if (isLeftWinning && isUserLeft) isCorrect = true;
          else if (isRightWinning && isUserRight) isCorrect = true;
          else if (winTarget && userChoice === winTarget) isCorrect = true;
        } else if (engagementItem?.type === "poll") {
          const correctLower = String(correctAnswer).trim().toLowerCase();
          if (userChoice === correctLower) {
            isCorrect = true;
          } else if (engagementItem.pollData?.options) {
            const chosenOpt = engagementItem.pollData.options.find(
              (o: any) => String(o.id).trim().toLowerCase() === userChoice || String(o.text || o.label || "").trim().toLowerCase() === userChoice
            );
            const targetOpt = engagementItem.pollData.options.find(
              (o: any) => String(o.id).trim().toLowerCase() === correctLower || String(o.text || o.label || "").trim().toLowerCase() === correctLower || (o.text && correctLower && (String(o.text).toLowerCase().includes(correctLower) || correctLower.includes(String(o.text).toLowerCase())))
            );
            if (chosenOpt && targetOpt && chosenOpt.id === targetOpt.id) isCorrect = true;
            else if (chosenOpt && (String(chosenOpt.id).toLowerCase() === correctLower || String(chosenOpt.text || chosenOpt.label || "").trim().toLowerCase() === correctLower)) isCorrect = true;
            else if (chosenOpt?.isCorrect === true) isCorrect = true;
          }
        }

        let newlyAwarded = false;
        if (isExpired && isCorrect && !existingVote.accuracyBonusAwarded) {
          try {
            const awardUid = existingVote.userId || userId;
            const awardEmail = authUser?.email || (awardUid && awardUid.includes("@") ? awardUid : "");
            const ptsRes = await awardEngagementPoints({
              userId: awardUid,
              userEmail: awardEmail,
              userName: authUser?.name || userName || "",
              action: "accuracy_bonus",
              engagementId: id,
              engagementType: engagementItem.type,
              engagementTitle: engagementItem.title,
              pointsBonus: 10,
              metadata: {
                reason: "CORRECT_PREDICTION_BONUS",
                bonusPoints: 10,
                type: engagementItem.type,
              },
            });
            if (ptsRes.success) newlyAwarded = true;

            await docClient.send(
              new UpdateCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: `ENGAGEMENT#${id}`, sk: existingVote.sk || `VOTE#${awardUid}` },
                UpdateExpression: "SET accuracyBonusAwarded = :t, isCorrect = :t, wonBonusPoints = :pts, resolvedAt = :now",
                ExpressionAttributeValues: { ":t": true, ":pts": 10, ":now": now },
              })
            ).catch(() => {});

            if (db) {
              await db.collection(getFirestoreCollection("user_engagements")).doc(`${awardUid}_${id}`).set({
                accuracyBonusAwarded: true,
                isCorrect: true,
                wonBonusPoints: 10,
                resolvedAt: now,
              }, { merge: true }).catch(() => {});
            }

            existingVote.accuracyBonusAwarded = true;
            existingVote.wonBonusPoints = 10;

            // Dispatch notification to user for winning accuracy bonus
            dispatchFlipArenaNotification({
              type: "fliparena.prediction_won",
              actorId: "system",
              actorName: "SportsFan360",
              recipientId: awardUid,
              engagementId: id,
              engagementType: engagementItem.type || "prediction",
              engagementTitle: engagementItem.title || "Prediction",
              bonusPoints: 10,
              priority: "HIGH",
            }).catch((err) => console.warn("[FlipArena prediction_won notice]:", err));
          } catch (e) {
            console.warn("POST claim bonus error:", e);
          }
        }

        return NextResponse.json({
          success: true,
          alreadyVoted: true,
          isExpired,
          isCorrect,
          accuracyBonusAwarded: Boolean(existingVote.accuracyBonusAwarded),
          wonBonusPoints: existingVote.wonBonusPoints || (isCorrect ? 10 : 0),
          newlyAwarded,
          selectedOptionId: existingVote.selectedOptionId,
        });
      }

      // ─── Change an existing vote (edit, not a second vote) ───────────────────
      if (changeVote === true) {
        // Exact key match on the user's own VOTE# record, never begins_with
        let ownVoteSk: string | null = null;
        for (const uid of candidateIds) {
          const sk = questionId ? `VOTE#${uid}#${questionId}` : `VOTE#${uid}`;
          try {
            const r = await docClient.send(new GetCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${id}`, sk },
            }));
            if (r.Item) { ownVoteSk = sk; break; }
          } catch { }
        }

        if (ownVoteSk) {
          const changeCleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
          const changeFound = await findEngagementById(changeCleanId, body.matchId || req.nextUrl.searchParams.get("matchId") || undefined);
          const changeItem: any = changeFound?.item;
          if (!changeItem) {
            return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
          }

          if (!["poll", "debate", "express", "question", "prediction"].includes(String(changeItem.type))) {
            return NextResponse.json({ error: "Votes cannot be changed on this engagement type" }, { status: 400 });
          }

          const changeNow = Date.now();
          const changeExpiresAt = Number(
            changeItem.expiresAt ||
            changeItem.pollData?.expiresAt ||
            changeItem.predictionData?.expiresAt ||
            changeItem.debateData?.expiresAt ||
            changeItem.expressData?.expiresAt ||
            changeItem.questionData?.expiresAt ||
            0
          );
          if (changeExpiresAt && changeNow > changeExpiresAt) {
            return NextResponse.json(
              { success: false, error: "Voting is closed. The timer has expired.", isExpired: true },
              { status: 400 }
            );
          }
          const changeStatus = String(changeItem.status || "").toLowerCase();
          if (
            changeStatus === "settled" ||
            changeStatus === "resolved" ||
            changeItem.winningChoiceId ||
            changeItem.predictionData?.winningChoiceId
          ) {
            return NextResponse.json(
              { success: false, error: "This engagement is already settled. Votes can no longer be changed." },
              { status: 400 }
            );
          }

          // The new choice must be one of this engagement's options
          const changePd = changeItem.predictionData;
          const optList: any[] =
            primaryOptions(changeItem) ||
            (changePd ? [changePd.leftChoice, changePd.rightChoice].filter(Boolean) : []);
          const wanted = String(selectedOptionId).trim().toLowerCase();
          const optionExists = optList.some((o: any, i: number) =>
            [o?.id, o?.text, o?.label, o?.code, i === 0 ? "left" : i === 1 ? "right" : null]
              .filter((v) => v != null && v !== "")
              .map((v) => String(v).trim().toLowerCase())
              .includes(wanted)
          );
          if (optList.length && !optionExists) {
            return NextResponse.json({ error: "Invalid option" }, { status: 400 });
          }

          // UPDATE the existing record in place (no second record, no second vote)
          let updated = false;
          try {
            await docClient.send(new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${id}`, sk: ownVoteSk },
              UpdateExpression: "SET selectedOptionId = :opt, previousOptionId = :prev, voteChangedAt = :now, updatedAt = :now",
              ConditionExpression: "attribute_exists(contentId)",
              ExpressionAttributeValues: {
                ":opt": selectedOptionId,
                ":prev": previousOptionId ?? existingVote.selectedOptionId ?? null,
                ":now": changeNow,
              },
            }));
            updated = true;
          } catch (updErr) {
            console.warn("DynamoDB vote change update notice:", updErr);
          }

          if (updated) {
            // Keep the mirrored copies of the vote record in step (best effort)
            const ownUid = ownVoteSk.slice("VOTE#".length).split("#")[0];
            await docClient.send(new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: {
                contentId: `USER_VOTE#${ownUid}`,
                sk: questionId ? `ENGAGEMENT#${id}#${questionId}` : `ENGAGEMENT#${id}`,
              },
              UpdateExpression: "SET selectedOptionId = :opt, voteChangedAt = :now, updatedAt = :now",
              ConditionExpression: "attribute_exists(contentId)",
              ExpressionAttributeValues: { ":opt": selectedOptionId, ":now": changeNow },
            })).catch(() => { });
            if (db) {
              await db.collection(getFirestoreCollection("user_engagements"))
                .doc(questionId ? `${ownUid}_${id}_${questionId}` : `${ownUid}_${id}`)
                .set({ selectedOptionId, voteChangedAt: changeNow, updatedAt: changeNow }, { merge: true })
                .catch(() => { });
            }

            // SET the counts from the VOTE# records (one per user); never increment/decrement
            applyEngagementStats(changeItem, await getEngagementStats(changeCleanId, { consistent: true }), { exactVotes: true });
            await persistEngagementUpdate(changeCleanId, changeItem, changeFound?.matchMomentsRecord);

            return NextResponse.json({
              success: true,
              type: changeItem.type,
              changedVote: true,
              selectedOptionId,
              options: primaryOptions(changeItem),
              totalVotes: Number(changeItem.totalVotes) || 0,
              totalEngaged: Number(changeItem.totalEngaged) || 0,
              isFirstEngagement: false,
              participationPointsAwarded: 0,
              pointsAwarded: 0,
              ...(changeItem.type === "prediction" ? { coinsLocked: changePd?.coinStake || 10 } : {}),
            });
          }
        }
      }

      return NextResponse.json(
        {
          success: false,
          alreadyVoted: true,
          error: "You have already voted on this question",
          selectedOptionId: existingVote.selectedOptionId,
          previousVote: existingVote,
        },
        { status: 400 }
      );
    }

    // ─── Step 1.5: Determine Unique User Engagement (Prevent duplicate totalEngaged increment) ───
    let isNewUserEngagement = true;

    // Check frontend payload hint (Option B)
    if (typeof body.isFirstQuizEngagement === "boolean") {
      isNewUserEngagement = body.isFirstQuizEngagement;
    } else if (typeof body.questionIndex === "number" && body.questionIndex > 0) {
      isNewUserEngagement = false;
    }

    // Check existing engagement records in DB if not already false (Option A: authoritative verification)
    if (isNewUserEngagement && questionId) {
      for (const uid of candidateIds) {
        if (!isNewUserEngagement) break;

        // 1. Direct O(1) check for user participant marker on this engagement
        try {
          const userMarker = await docClient.send(
            new GetCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${id}`, sk: `USER#${uid}` },
            })
          );
          if (userMarker.Item) {
            isNewUserEngagement = false;
            break;
          }
        } catch {}

        // 2. Query any previous question votes for this user on this engagement (sk starts with VOTE#{uid}#)
        try {
          const priorVotes = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":cid": `ENGAGEMENT#${id}`,
                ":skpfx": `VOTE#${uid}#`,
              },
              Limit: 1,
            })
          );
          if (priorVotes.Items && priorVotes.Items.length > 0) {
            isNewUserEngagement = false;
            break;
          }
        } catch {}

        // 3. Direct check for single vote VOTE#{uid}
        try {
          const singleVote = await docClient.send(
            new GetCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `ENGAGEMENT#${id}`, sk: `VOTE#${uid}` },
            })
          );
          if (singleVote.Item) {
            isNewUserEngagement = false;
            break;
          }
        } catch {}

        // 4. Query legacy DynamoDB shape USER_VOTE#{uid}
        try {
          const legacyPrior = await docClient.send(
            new QueryCommand({
              TableName: TABLES.SocialAndContent,
              KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
              ExpressionAttributeValues: {
                ":cid": `USER_VOTE#${uid}`,
                ":skpfx": `ENGAGEMENT#${id}`,
              },
              Limit: 1,
            })
          );
          if (legacyPrior.Items && legacyPrior.Items.length > 0) {
            isNewUserEngagement = false;
            break;
          }
        } catch {}

        // 5. Check Firestore user_engagements record
        if (db) {
          try {
            const userEngSnap = await db.collection(getFirestoreCollection("user_engagements")).doc(`${uid}_${id}`).get();
            if (userEngSnap.exists) {
              isNewUserEngagement = false;
              break;
            }
          } catch {}
        }
      }
    }

    // ─── Step 2: Fetch Current Engagement Item ───────────────────────────────
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();
    const matchIdParam = body.matchId || req.nextUrl.searchParams.get("matchId") || undefined;
    const foundEngagement = await findEngagementById(cleanId, matchIdParam);

    let item: any = foundEngagement?.item || null;
    if (!item) {
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: `ENGAGEMENT#${cleanId}`, sk: "ENGAGEMENT#META" },
          })
        );
        if (getRes.Item) item = getRes.Item;
      } catch { }

      if (!item && db) {
        const snap = await db.collection(getFirestoreCollection("engagements")).doc(cleanId).get();
        if (snap.exists) item = { id: snap.id, ...snap.data() };
      }
    }

    if (!item) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }

    if (item.expiresAt && Date.now() >= Number(item.expiresAt)) {
      return NextResponse.json(
        {
          success: false,
          error: "Voting is closed. This event's timer has expired.",
          isExpired: true,
        },
        { status: 400 }
      );
    }

    let responseData: Record<string, any> = { success: true };
    const now = Date.now();

    // ─── Step 3: Vote Calculation by Type ─────────────────────────────────────

    // 3.0 Prediction Vote Handling — MUST run BEFORE the generic "options" branch below,
    // otherwise a prediction that has `item.options` is counted as a poll and the
    // left/right choices never update.
    if (item.type === "prediction") {
      const pd = (item.predictionData = item.predictionData || {});
      const sel = String(selectedOptionId).trim().toLowerCase();

      const current: any[] =
        (Array.isArray(pd.options) && pd.options.length ? pd.options : null) ||
        (Array.isArray(item.options) && item.options.length ? item.options : null) ||
        [
          { id: pd.leftChoice?.id ?? "left", text: pd.leftChoice?.text ?? "Option A", code: pd.leftChoice?.code, votes: pd.leftChoice?.votes ?? 0 },
          { id: pd.rightChoice?.id ?? "right", text: pd.rightChoice?.text ?? "Option B", code: pd.rightChoice?.code, votes: pd.rightChoice?.votes ?? 0 },
        ];

      let hit = -1;
      current.forEach((o, i) => {
        if (hit !== -1) return;
        const keys = [o.id, o.text, o.label, o.code, i === 0 ? "left" : i === 1 ? "right" : null]
          .filter((v) => v != null)
          .map((v) => String(v).trim().toLowerCase());
        if (keys.includes(sel)) hit = i;
      });

      if (hit === -1) {
        return NextResponse.json({ error: "Invalid option" }, { status: 400 });
      }

      const counted = current.map((o, i) => ({ ...o, votes: (Number(o.votes) || 0) + (i === hit ? 1 : 0) }));
      const totalVotes = counted.reduce((s, o) => s + o.votes, 0);
      const options = counted.map((o) => ({
        ...o,
        percentage: totalVotes ? Math.round((o.votes / totalVotes) * 100) : 0,
      }));

      pd.options = options;
      pd.totalVotes = totalVotes;
      item.options = options;
      item.totalVotes = totalVotes;
      if (pd.leftChoice) pd.leftChoice = { ...pd.leftChoice, votes: options[0].votes, percentage: options[0].percentage };
      if (pd.rightChoice) pd.rightChoice = { ...pd.rightChoice, votes: options[1]?.votes ?? 0, percentage: options[1]?.percentage ?? 0 };
      if (isNewUserEngagement) {
        item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
      }

      responseData = {
        success: true,
        type: "prediction",
        selectedOptionId,
        options,
        totalVotes,
        coinsLocked: pd.coinStake || 10,
        totalEngaged: Number(item.totalEngaged) || 0,
        isFirstEngagement: isNewUserEngagement,
        participationPointsAwarded: 2,
        pointsAwarded: 2,
      };
    }

    // 3.1 Fan Battle Vote Handling
    else if (item.type === "fan_battle" && item.fanBattleData) {
      const left = { ...item.fanBattleData.leftCompetitor };
      const right = { ...item.fanBattleData.rightCompetitor };

      if (selectedOptionId === "left" || selectedOptionId === left.name || selectedOptionId === left.code) {
        left.votes = (Number(left.votes) || 0) + 1;
      } else {
        right.votes = (Number(right.votes) || 0) + 1;
      }

      const total = (left.votes || 0) + (right.votes || 0);
      const leftPct = total > 0 ? Math.round((left.votes / total) * 100) : 50;
      const rightPct = 100 - leftPct;

      item.fanBattleData.leftCompetitor = left;
      item.fanBattleData.rightCompetitor = right;
      item.fanBattleData.totalVotes = total;
      if (isNewUserEngagement) {
        item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
      }

      left.percentage = leftPct;
      right.percentage = rightPct;
      responseData = {
        success: true,
        type: "fan_battle",
        selectedOptionId,
        leftPercentage: leftPct,
        rightPercentage: rightPct,
        leftVotes: left.votes,
        rightVotes: right.votes,
        leftCompetitor: left,
        rightCompetitor: right,
        totalVotes: total,
        totalEngaged: Number(item.totalEngaged) || 0,
        isFirstEngagement: isNewUserEngagement,
        participationPointsAwarded: 2,
        pointsAwarded: 2,
      };
    }

    // 3.2 Quiz Answer Handling
    else if (item.type === "quiz" && item.quizData) {
      // Find matching question if questions array is present
      const targetQ =
        item.quizData.questions?.find((q: any) => q.id === questionId) ||
        item.quizData.questions?.[0] ||
        item.quizData;

      const correctOptId = targetQ.correctOptionId || "B";
      // Enforce +10 PTS bonus for correct quiz answer (+2 participation points = 12 total)
      const ptsReward = 10;
      const isCorrect = String(selectedOptionId).trim().toUpperCase() === String(correctOptId).trim().toUpperCase();
      const pointsAwarded = isCorrect ? ptsReward : 0;

      // ONLY increment totalEngaged if this is the user's first time interacting with this quiz
      if (isNewUserEngagement) {
        item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
      }

      responseData = {
        success: true,
        type: "quiz",
        questionId: targetQ.id || questionId,
        isCorrect,
        correctOptionId: correctOptId,
        quizPointsAwarded: pointsAwarded,
        participationPointsAwarded: 2,
        pointsAwarded: pointsAwarded + 2,
        explanation: targetQ.explanation || item.quizData.explanation || `Correct: ${correctOptId}`,
        totalEngaged: Number(item.totalEngaged) || 0,
        isFirstQuizEngagement: isNewUserEngagement,
        isFirstEngagement: isNewUserEngagement,
      };
    }

    // 3.3 Poll / Debate / Express / Question Vote Handling
    else if (
      item.type === "poll" ||
      item.type === "debate" ||
      item.type === "express" ||
      item.type === "question" ||
      item.pollData ||
      item.debateData ||
      item.expressData ||
      Array.isArray(item.options)
    ) {
      const rawOptions =
        item.pollData?.options ||
        item.debateData?.options ||
        item.expressData?.options ||
        item.questionData?.options ||
        item.options ||
        [];

      const options = (rawOptions.length > 0 ? rawOptions : [
        { id: "opt_1", text: "Option A", votes: 0 },
        { id: "opt_2", text: "Option B", votes: 0 }
      ]).map((opt: any) => {
        const isMatch =
          String(opt.id).toLowerCase() === String(selectedOptionId).toLowerCase() ||
          String(opt.text || opt.label || "").trim().toLowerCase() === String(selectedOptionId).trim().toLowerCase();
        if (isMatch) {
          return { ...opt, votes: (Number(opt.votes) || 0) + 1 };
        }
        return { ...opt, votes: Number(opt.votes) || 0 };
      });

      const totalVotes = options.reduce((sum: number, o: any) => sum + (o.votes || 0), 0);
      const optionsWithPercentages = options.map((opt: any) => ({
        ...opt,
        percentage: totalVotes > 0 ? Math.round((Number(opt.votes) / totalVotes) * 100) : 0,
      }));

      if (item.pollData) {
        item.pollData.options = optionsWithPercentages;
        item.pollData.totalVotes = totalVotes;
      }
      if (item.debateData) {
        item.debateData.options = optionsWithPercentages;
        item.debateData.totalVotes = totalVotes;
      }
      if (item.expressData) {
        item.expressData.options = optionsWithPercentages;
        item.expressData.totalVotes = totalVotes;
      }
      item.options = optionsWithPercentages;
      item.totalVotes = totalVotes;

      if (isNewUserEngagement) {
        item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
      }

      responseData = {
        success: true,
        type: item.type || "poll",
        selectedOptionId,
        options: optionsWithPercentages,
        totalVotes,
        totalEngaged: Number(item.totalEngaged) || 0,
        isFirstEngagement: isNewUserEngagement,
        participationPointsAwarded: 2,
        pointsAwarded: 2,
      };
    }

    // 3.5 Meme Arena Reaction & Dual Meme Vote Handling
    else if (item.type === "meme" && item.memeData) {
      if (item.memeData.memeMode === "dual" || (item.memeData.memeA && item.memeData.memeB) || (Array.isArray(item.memeData.options) && item.memeData.options.length >= 2)) {
        // Dual Meme Battle Voting (Meme A vs Meme B)
        const currentOptions = Array.isArray(item.memeData.options) && item.memeData.options.length >= 2
          ? item.memeData.options
          : [
              {
                id: "A",
                text: item.memeData.memeA?.title || "Meme A",
                label: item.memeData.memeA?.title || "Meme A",
                imageUrl: item.memeData.memeA?.imageUrl || "",
                votes: item.memeData.memeA?.votes || 0,
              },
              {
                id: "B",
                text: item.memeData.memeB?.title || "Meme B",
                label: item.memeData.memeB?.title || "Meme B",
                imageUrl: item.memeData.memeB?.imageUrl || "",
                votes: item.memeData.memeB?.votes || 0,
              },
            ];

        const optA = { ...currentOptions[0] };
        const optB = { ...currentOptions[1] };

        const isA =
          selectedOptionId === "A" ||
          selectedOptionId === "memeA" ||
          selectedOptionId === "left" ||
          selectedOptionId === "1" ||
          selectedOptionId === optA.id ||
          selectedOptionId === optA.text;

        if (isA) {
          optA.votes = (Number(optA.votes) || 0) + 1;
        } else {
          optB.votes = (Number(optB.votes) || 0) + 1;
        }

        const totalVotes = (Number(optA.votes) || 0) + (Number(optB.votes) || 0);
        const pctA = totalVotes > 0 ? Math.round((optA.votes / totalVotes) * 100) : 50;
        const pctB = 100 - pctA;

        optA.percentage = pctA;
        optB.percentage = pctB;

        if (item.memeData.memeA) item.memeData.memeA.votes = optA.votes;
        if (item.memeData.memeB) item.memeData.memeB.votes = optB.votes;

        const updatedOptions = [optA, optB];
        item.memeData.options = updatedOptions;
        item.memeData.totalVotes = totalVotes;
        if (isNewUserEngagement) {
          item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
        }

        responseData = {
          success: true,
          type: "meme",
          memeMode: "dual",
          selectedOptionId: isA ? "A" : "B",
          options: updatedOptions,
          totalVotes,
          totalEngaged: Number(item.totalEngaged) || 0,
          isFirstEngagement: isNewUserEngagement,
          participationPointsAwarded: 2,
          pointsAwarded: 2,
        };
      } else {
        const reactions = {
          mild: Number(item.memeData.reactions?.mild || 0),
          funny: Number(item.memeData.reactions?.funny || 0),
          hot: Number(item.memeData.reactions?.hot || 0),
          fire: Number(item.memeData.reactions?.fire || 0),
          nuclear: Number(item.memeData.reactions?.nuclear || 0),
        };

        const reactionType = (selectedOptionId || "hot").toLowerCase() as keyof typeof reactions;
        if (reactions[reactionType] !== undefined) {
          reactions[reactionType] = (reactions[reactionType] || 0) + 1;
        }

        const totalVotes =
          reactions.mild + reactions.funny + reactions.hot + reactions.fire + reactions.nuclear;

        // Calculate weighted heat percentage: mild (20%), funny (40%), hot (60%), fire (80%), nuclear (100%)
        const weightedScore =
          reactions.mild * 20 +
          reactions.funny * 40 +
          reactions.hot * 60 +
          reactions.fire * 80 +
          reactions.nuclear * 100;
        const heatPercentage =
          totalVotes > 0 ? Math.min(100, Math.max(10, Math.round(weightedScore / totalVotes))) : 78;

        item.memeData.reactions = reactions;
        item.memeData.totalVotes = totalVotes;
        item.memeData.heatPercentage = heatPercentage;
        if (isNewUserEngagement) {
          item.totalEngaged = (Number(item.totalEngaged) || 0) + 1;
        }

        responseData = {
          success: true,
          type: "meme",
          memeMode: "single",
          selectedOptionId: reactionType,
          heatPercentage,
          totalVotes,
          totalEngaged: Number(item.totalEngaged) || 0,
          isFirstEngagement: isNewUserEngagement,
          reactions,
          participationPointsAwarded: 2,
          pointsAwarded: 2,
        };
      }
    }

    // ─── Step 4.5: Award Participation Points (+2 points for quiz, polls, predictions, battles) ─
    const quizBonus = item.type === "quiz" && responseData?.isCorrect ? Number(responseData.quizPointsAwarded || 0) : 0;
    try {
      const awardRes = await awardEngagementPoints({
        userId,
        userEmail: authUser?.email || body.userEmail || (userId.includes("@") ? userId : ""),
        userName: userName || authUser?.name || body.userName || "",
        action: "participate",
        engagementId: id,
        engagementType: item.type,
        engagementTitle: item.title,
        questionId: questionId || undefined,
        quizPointsBonus: quizBonus,
        syncQuizLeaderboard: false,
      });
      if (awardRes.success) {
        responseData.pointsAwarded = awardRes.pointsAwarded;
        responseData.participationPointsAwarded = awardRes.pointsAwarded;
      }
    } catch (ptsErr) {
      console.warn("[POST /api/engagements/[id]/vote] Failed to award participation points:", ptsErr);
    }

    // ─── Step 5: Save User Vote Record ────────────────────────────────────────
    const userDisplayName =
      userName ||
      authUser?.name ||
      (authUser as any)?.displayName ||
      body.userDisplayName ||
      (userId && userId.includes("@") ? userId.split("@")[0] : userId ? userId.replace(/^USER#/i, "") : "Fan");

    const userProfileAvatar =
      userAvatar ||
      (authUser as any)?.avatar ||
      (authUser as any)?.photoURL ||
      body.userAvatar ||
      null;

    const userRecord = {
      userId,
      userName: userDisplayName,
      userAvatar: userProfileAvatar,
      engagementId: id,
      ...(item.matchId ? { matchId: String(item.matchId) } : {}),
      ...(item.momentId ? { momentId: String(item.momentId) } : {}),
      ...(item.seriesId ? { seriesId: String(item.seriesId) } : {}),
      type: item.type,
      selectedOptionId,
      votedAt: now,
      timestamp: now,
      ...responseData,
    };

    // A. Standardized DynamoDB Key: contentId = ENGAGEMENT#{id}, sk = voteSk
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `ENGAGEMENT#${id}`,
            sk: voteSk,
            entityId: `VOTE#${String(item.type).toUpperCase()}`,
            ...userRecord,
          },
        })
      );
    } catch (dynVoteErr) {
      console.warn("DynamoDB standard vote record notice:", dynVoteErr);
    }

    // ─── Step 5.1: Update Parent Engagement Item ──────────────────────────────
    // Recount from the vote records (now including this one) instead of trusting the in-memory +1,
    // so two votes landing at the same time can't overwrite each other's count.
    try {
      applyEngagementStats(item, await getEngagementStats(cleanId, { consistent: true }));
      const recounted = primaryOptions(item);
      if (Array.isArray(responseData.options) && recounted) {
        responseData.options = recounted;
        responseData.totalVotes = Number(item.totalVotes) || 0;
      }
    } catch (statsErr) {
      console.warn("Vote recount notice:", statsErr);
    }
    await persistEngagementUpdate(cleanId, item, foundEngagement?.matchMomentsRecord);

    // A2. Standardized DynamoDB Participant Marker: contentId = ENGAGEMENT#{id}, sk = USER#{userId}
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `ENGAGEMENT#${id}`,
            sk: `USER#${userId}`,
            entityId: `USER_ENGAGEMENT#${String(item.type).toUpperCase()}`,
            userId,
            engagementId: id,
            type: item.type,
            firstEngagedAt: now,
            updatedAt: now,
          },
        })
      );
    } catch (dynUserEngErr) {
      console.warn("DynamoDB user engagement marker notice:", dynUserEngErr);
    }

    // B. Legacy DynamoDB Key: contentId = USER_VOTE#{userId}, sk = ENGAGEMENT#{id} (Backwards compatibility)
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLES.SocialAndContent,
          Item: {
            contentId: `USER_VOTE#${userId}`,
            sk: questionId ? `ENGAGEMENT#${id}#${questionId}` : `ENGAGEMENT#${id}`,
            entityId: `VOTE#${String(item.type).toUpperCase()}`,
            ...userRecord,
          },
        })
      );
    } catch { }

    // C. Save user vote record to Firestore
    if (db) {
      try {
        await db.collection(getFirestoreCollection("user_engagements")).doc(firestoreVoteDocId).set(userRecord);
        if (questionId) {
          await db.collection(getFirestoreCollection("user_engagements")).doc(`${userId}_${id}`).set({
            userId,
            engagementId: id,
            type: item.type,
            firstEngagedAt: now,
            updatedAt: now,
          }, { merge: true });
        }
      } catch (fbVoteErr) {
        console.warn("Firestore user vote record notice:", fbVoteErr);
      }
    }

    // ─── Step 6: Update FlipARENA Leaderboard (Quizzes, Polls, Predictions, Battles) ─
    const isQuiz = item.type === "quiz";
    const isCorrect = isQuiz ? Boolean(responseData?.isCorrect) : false;
    const earnedPts = Number(responseData?.pointsAwarded ?? (isQuiz && isCorrect ? 12 : 2));
    const displayName = userName || authUser?.name || "Fan Quizzer";
    const rawAvatar =
      userAvatar ||
      (authUser as any)?.avatarUrl ||
      (authUser as any)?.photoURL ||
      (authUser as any)?.picture ||
      (authUser as any)?.image ||
      (authUser as any)?.avatar ||
      "";
    const avatar = typeof rawAvatar === "string" && !rawAvatar.includes("dicebear") ? rawAvatar.trim() : "";

    const userEmailVal = (authUser?.email || body.userEmail || "").trim() || `${userId}@sportsfan360.com`;

    // 1. DynamoDB: Update QUIZ_LEADERBOARD#GLOBAL and QUIZ_LEADERBOARD#{id}
    try {
      const updateGlobal = docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: "QUIZ_LEADERBOARD#GLOBAL", sk: `USER#${userId}` },
          UpdateExpression:
            "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
            "correctCount = if_not_exists(correctCount, :zero) + :corr, " +
            "incorrectCount = if_not_exists(incorrectCount, :zero) + :incorr, " +
            "totalAnswered = if_not_exists(totalAnswered, :zero) + :one, " +
            "userName = :uname, userAvatar = :uavatar, userEmail = :uemail, " +
            "lastAnsweredAt = :now, updatedAt = :now, entityId = :entity, userId = :uid",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":pts": earnedPts,
            ":corr": isCorrect ? 1 : 0,
            ":incorr": isQuiz && !isCorrect ? 1 : 0,
            ":one": 1,
            ":uname": displayName,
            ":uavatar": avatar,
            ":uemail": userEmailVal,
            ":now": now,
            ":entity": "QUIZ_LEADERBOARD",
            ":uid": userId,
          },
        })
      );

      const updateQuiz = docClient.send(
        new UpdateCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `QUIZ_LEADERBOARD#${id}`, sk: `USER#${userId}` },
          UpdateExpression:
            "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
            "correctCount = if_not_exists(correctCount, :zero) + :corr, " +
            "incorrectCount = if_not_exists(incorrectCount, :zero) + :incorr, " +
            "totalAnswered = if_not_exists(totalAnswered, :zero) + :one, " +
            "userName = :uname, userAvatar = :uavatar, userEmail = :uemail, " +
            "lastAnsweredAt = :now, updatedAt = :now, entityId = :entity, userId = :uid, quizId = :qid",
          ExpressionAttributeValues: {
            ":zero": 0,
            ":pts": earnedPts,
            ":corr": isCorrect ? 1 : 0,
            ":incorr": isQuiz && !isCorrect ? 1 : 0,
            ":one": 1,
            ":uname": displayName,
            ":uavatar": avatar,
            ":uemail": userEmailVal,
            ":now": now,
            ":entity": "QUIZ_LEADERBOARD",
            ":uid": userId,
            ":qid": id,
          },
        })
      );

      await Promise.all([updateGlobal, updateQuiz]);
    } catch (lbDynErr) {
      console.warn("DynamoDB quiz leaderboard update notice:", lbDynErr);
    }

    // 2. Firestore: Update quiz_leaderboard collection
    if (db) {
      try {
        const colName = getFirestoreCollection("quiz_leaderboard");
        const incData = {
          userId,
          userName: displayName,
          userAvatar: avatar,
          userEmail: authUser?.email || "",
          totalPoints: FieldValue.increment(earnedPts),
          correctCount: FieldValue.increment(isCorrect ? 1 : 0),
          incorrectCount: FieldValue.increment(isQuiz && !isCorrect ? 1 : 0),
          totalAnswered: FieldValue.increment(1),
          lastAnsweredAt: now,
          updatedAt: now,
        };
        await Promise.all([
          db.collection(colName).doc(userId).set(incData, { merge: true }),
          db.collection(colName).doc(`${userId}_${id}`).set({ ...incData, quizId: id }, { merge: true }),
        ]);
      } catch (lbFbErr) {
        console.warn("Firestore quiz leaderboard update notice:", lbFbErr);
      }
    }

    // ─── Step 7: Dispatch FlipArena Notifications (Async / Non-blocking) ──────
    // 1. Notify Creator of Vote / Meme Reaction / Quiz Play
    const recipientId =
      item.creatorId ||
      item.creatorEmail ||
      item.userId ||
      item.authorId ||
      item.createdBy;

    if (recipientId && String(recipientId) !== String(userId)) {
      const actorName =
        displayName ||
        (userId.includes("@") ? userId.split("@")[0] : "A sports fan");
      const actorAvatar =
        avatar ||
        `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`;

      dispatchFlipArenaNotification({
        type: item.type === "meme" ? "fliparena.meme_reaction" : "fliparena.post_voted",
        actorId: userId,
        actorName,
        actorAvatar,
        recipientId: String(recipientId),
        engagementId: id,
        engagementType: item.type || "quiz",
        engagementTitle: item.title || item.memeData?.title || item.subtitle || "Engagement",
        reactionEmoji: item.type === "meme" ? selectedOptionId : undefined,
      }).catch((notifErr) => {
        console.warn("[POST /api/engagements/[id]/vote] Creator notification dispatch notice:", notifErr);
      });
    }

    // 2. Notify Quiz Player if they answered correctly and won +10 SXPs
    if (isQuiz && isCorrect) {
      dispatchFlipArenaNotification({
        type: "fliparena.prediction_won",
        actorId: "system",
        actorName: "SportsFan360",
        recipientId: userId,
        engagementId: id,
        engagementType: "quiz",
        engagementTitle: item.title || "Quiz",
        bonusPoints: 10,
        priority: "HIGH",
      }).catch((notifErr) => {
        console.warn("[POST /api/engagements/[id]/vote] Quiz win notification dispatch notice:", notifErr);
      });
    }

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    console.error("POST /api/engagements/[id]/vote error:", error);
    const msg = error instanceof Error ? error.message : "Voting failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}