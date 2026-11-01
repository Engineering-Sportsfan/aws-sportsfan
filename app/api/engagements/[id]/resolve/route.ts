// app/api/engagements/[id]/resolve/route.ts — Outcome Resolution for Match Moment Predictions & Debates
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { UpdateCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { awardEngagementPoints } from "@/lib/engagementPoints";
import { createNotification } from "@/lib/notifications";
import { getUser } from "@/lib/getUser";
import { findEngagementById, persistEngagementUpdate } from "@/lib/engagementPersistence";
import { getCandidateTableNames } from "@/lib/dualWrite";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const t0 = Date.now();
  console.log('[TIMING-RESOLVE] Start resolution');
  try {
    const { id } = await params;
    const cleanId = String(id || "").replace(/^ENGAGEMENT#/i, "").replace(/^LOOP#/i, "").trim();

    const body = await req.json();
    const authUser = await getUser(req);
  console.log('[TIMING-RESOLVE] Step 0 (getUser):', Date.now() - t0, 'ms');

    const { winningChoiceId, outcomeNotes, winningChoiceText, matchId } = body;

    if (!winningChoiceId) {
      console.log('[TIMING-RESOLVE] Returning JSON at:', Date.now() - t0, 'ms');
  return NextResponse.json({ error: "winningChoiceId is required to resolve outcome" }, { status: 400 });
    }

    const adminEmail = authUser?.email || body.adminEmail || "admin@sportsfan.com";

    // 1. Fetch or use existing engagement snapshot (fast client snapshot bypasses extra table lookups)
    let engagement = body.engagement;
    let matchMomentsRecord: any = undefined;

    if (!engagement) {
      const found = await findEngagementById(cleanId, matchId);
  console.log('[TIMING-RESOLVE] Step 1 (findEngagementById):', Date.now() - t0, 'ms');
      if (!found?.item) {
        return NextResponse.json({ error: `Engagement "${cleanId}" not found` }, { status: 404 });
      }
      engagement = found.item;
      matchMomentsRecord = found.matchMomentsRecord;
    } else {
      const resolvedMatch = String(matchId || engagement.matchId || "").replace(/^MATCH#/i, "").trim();
      const resolvedLoop = String(engagement.loopId || cleanId).replace(/^LOOP#/i, "").trim();
      if (resolvedMatch) {
        matchMomentsRecord = {
          table: TABLES.MatchMoments,
          entityId: `MATCH#${resolvedMatch}`,
          sk: `LOOP#${resolvedLoop}`,
        };
      }
    }

    const now = Date.now();
    const normalizedWinId = String(winningChoiceId).trim().toLowerCase();
    const resolvedMatchId = String(
      matchId ||
      engagement.matchId ||
      engagement.sportsRadarMatchId ||
      matchMomentsRecord?.entityId ||
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

    // Fallback to Firestore if DynamoDB returned no votes
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

    console.log('[TIMING-RESOLVE] Step 2 (getVotes):', Date.now() - t0, 'ms');
  // 3. Process voters and award +10 SXPs to winners
    let votersAwardedCount = 0;
    const bonusPoints = 10;
    const participantUserIds: string[] = [];
    const winningUserIds: string[] = [];

    interface DistinctUser {
      userId: string;
      email?: string | null;
      name?: string;
      vote?: any;
    }

    const distinctWinnersMap = new Map<string, DistinctUser>();
    const distinctParticipantsMap = new Map<string, DistinctUser>();

    for (const vote of voteItems) {
      const rawVoterUserId = vote.userId || (vote.sk ? String(vote.sk).replace(/^VOTE#/, "") : "") || vote.userEmail;
      const voterEmail = vote.userEmail || (rawVoterUserId && String(rawVoterUserId).includes("@") ? String(rawVoterUserId) : "");
      const voterName = vote.userName || vote.displayName || "Fan Voter";
      const cleanPrimaryId = (rawVoterUserId && !rawVoterUserId.includes(" "))
        ? rawVoterUserId
        : (voterEmail || rawVoterUserId || "");

      // Collect all key shapes for ROAR pulse celebrations lookup
      const allIds = [rawVoterUserId, voterEmail, voterName]
        .filter(Boolean)
        .map((x) => String(x).trim().toLowerCase());

      for (const uid of allIds) {
        if (!participantUserIds.includes(uid)) participantUserIds.push(uid);
      }

      const selectedId = String(vote.selectedOptionId || vote.choiceId || vote.selectedChoice || "").trim().toLowerCase();
      const selectedText = String(vote.selectedOptionText || vote.choiceText || "").trim().toLowerCase();
      const isWinner =
        selectedId === normalizedWinId ||
        (winningChoiceText && selectedText === String(winningChoiceText).trim().toLowerCase());

      if (isWinner) {
        for (const uid of allIds) {
          if (!winningUserIds.includes(uid)) winningUserIds.push(uid);
        }

        if (cleanPrimaryId && !distinctWinnersMap.has(cleanPrimaryId)) {
          distinctWinnersMap.set(cleanPrimaryId, {
            userId: cleanPrimaryId,
            email: voterEmail || null,
            name: voterName,
            vote,
          });
        }
      } else {
        if (cleanPrimaryId && !distinctParticipantsMap.has(cleanPrimaryId)) {
          distinctParticipantsMap.set(cleanPrimaryId, {
            userId: cleanPrimaryId,
            email: voterEmail || null,
            name: voterName,
            vote,
          });
        }
      }
    }

    // Concurrently award bonus points to winners
    const winnersList = Array.from(distinctWinnersMap.values());
    if (winnersList.length > 0) {
      const bonusPromises = winnersList.map(async ({ userId, email, name, vote }) => {
        if (vote?.accuracyBonusAwarded) return;
        try {
          await awardEngagementPoints({
            userId,
            userEmail: email || undefined,
            userName: name,
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
          if (vote?.sk) {
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
            const docKey = vote?.firestoreDocId || `${userId}_${cleanId}`;
            await db.collection(getFirestoreCollection("user_engagements")).doc(docKey).set({
              accuracyBonusAwarded: true,
              isCorrect: true,
              wonBonusPoints: bonusPoints,
              resolvedAt: now,
            }, { merge: true }).catch((e) => console.warn("[Resolve] Firestore vote bonus update notice:", e));
          }
        } catch (awardErr) {
          console.warn(`[Resolve] Bonus award notice for user "${userId}":`, awardErr);
        }
      });

      // Wait up to 3s max for bonus awarding
      await Promise.race([
        Promise.allSettled(bonusPromises),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }

    console.log('[TIMING-RESOLVE] Step 3 (awardBonuses):', Date.now() - t0, 'ms');
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
    await persistEngagementUpdate(cleanId, updatedEngagement, matchMomentsRecord);

    // 6. Record reveal record in MatchMoments table for ROAR celebrations (break on first success)
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
          break;
        } catch (e: any) {
          const isTableMissing =
            e?.name === "ResourceNotFoundException" ||
            e?.message?.includes("Cannot do operations on a non-existent table");
          if (isTableMissing) continue;
          console.warn(`[Resolve] Failed to save reveal to ${tbl}:`, e);
          break;
        }
      }
    }

    const targetRoomId = String(body.roomId || "NMryj1w7t8mJpGzEvF9q").replace(/^ROOM#/, "").trim();
    const outcomeLabel = winningChoiceText || winningChoiceId;

    // 7. Record floating in-room notification broadcast in Firestore
    if (db) {
      const firestoreMatchIds = [
        resolvedMatchId,
        resolvedMatchId ? `MATCH#${resolvedMatchId}` : null,
        body.roomId || null,
        "NMryj1w7t8mJpGzEvF9q",
      ].filter(Boolean);

      db.collection(getFirestoreCollection("match_room_notifications"))
        .add({
          engagementId: cleanId,
          type: "OUTCOME_RESOLVED",
          matchId: resolvedMatchId,
          matchIds: firestoreMatchIds,
          roomId: body.roomId || resolvedMatchId,
          momentType: engagement.type,
          momentId: engagement.momentId || null,
          title: engagement.title,
          winningChoiceId,
          winningChoiceText: outcomeLabel,
          outcomeNotes: outcomeNotes || null,
          votersAwardedCount,
          bonusPoints,
          participantUserIds,
          winningUserIds,
          message: `🎯 Outcome Revealed: "${outcomeLabel}". Click to view post!`,
          targetPostUrl: `/feed?engagementId=${cleanId}`,
          createdAt: now,
          expiresAt: now + 300000,
        })
        .catch((e) => console.warn("[Resolve] Match room notification notice:", e));
    }

    // 8. Post Outcome Reveal message directly into ROAR Chat (RealTimeChat Table)
    const chatMsgId = `msg_rev_${now}_${Math.random().toString(36).substring(2, 7)}`;
    const chatMsgText = `🎯 MOMENT OUTCOME REVEALED: "${engagement.title}"\n🏆 Winning Outcome: "${outcomeLabel}"\n⚡ ${votersAwardedCount > 0 ? `${votersAwardedCount} winning fan(s) earned +${bonusPoints} SXPs accuracy bonus!` : "Participation SXPs awarded to all active fans!"}${outcomeNotes ? `\n📝 Notes: ${outcomeNotes}` : ""}`;

    const chatMsgItem: Record<string, any> = {
      roomId: `ROOM#${targetRoomId}`,
      sk: `MSG#${targetRoomId}#${now}#${chatMsgId}`,
      msgId: chatMsgId,
      chatId: chatMsgId,
      authorUid: "sportsfan360_system",
      authorUsername: "SportsFan360 Core Engine",
      authorBadge: "Stadium Engine",
      authorAvatarUrl: "/images/sportsfan360logo.png",
      authorEmail: "admin@sportsfan.com",
      text: chatMsgText,
      type: "post",
      outcomeData: {
        engagementId: cleanId,
        winningChoiceId,
        winningChoiceText: outcomeLabel,
        votersAwardedCount,
        bonusPoints,
      },
      fireCount: 0,
      heartCount: 0,
      agreeCount: 0,
      disagreeCount: 0,
      replyCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    docClient
      .send(
        new PutCommand({
          TableName: TABLES.RealTimeChat,
          Item: chatMsgItem,
        })
      )
      .catch((e) => console.warn("[Resolve] RealTimeChat write notice:", e));

    if (db) {
      db.collection(getFirestoreCollection("roarRooms"))
        .doc(targetRoomId)
        .collection("messages")
        .doc(chatMsgId)
        .set(chatMsgItem, { merge: true })
        .catch((e) => console.warn("[Resolve] Firestore roarRooms message write notice:", e));
    }

    // 9. Dispatch in-app notifications asynchronously in background (doesn't block response)
    const dispatchNotificationsAsync = async () => {
      const notifiedUserIds = new Set<string>();

      // Send to distinct winners
      for (const winUser of winnersList) {
        const uId = winUser.userId;
        if (!uId || notifiedUserIds.has(uId)) continue;
        notifiedUserIds.add(uId);

        try {
          await createNotification({
            userId: uId,
            recipientEmail: winUser.email || (uId.includes("@") ? uId : null),
            category: "roar",
            notification_type: "roar.prediction_won",
            title: `🎉 You predicted correctly! +${bonusPoints} Bonus SXPs`,
            body: `Outcome settled for "${engagement.title}": "${outcomeLabel}".`,
            subtitle: `+${bonusPoints} Bonus SXPs awarded to your sports wallet!`,
            cta_label: "Open ROAR Pulse",
            cta_target: "/MainModules/ROAR",
            priority: "HIGH",
            roomId: targetRoomId,
            metadata: {
              engagementId: cleanId,
              winningChoiceId,
              winningChoiceText: outcomeLabel,
              bonusPoints,
              isWinner: true,
            },
          });
        } catch (winNotifErr) {
          console.warn("[Resolve] Winning notification notice:", winNotifErr);
        }
      }

      // Send to distinct non-winning participants
      const participantsList = Array.from(distinctParticipantsMap.values());
      for (const partUser of participantsList) {
        const uId = partUser.userId;
        if (!uId || notifiedUserIds.has(uId)) continue;
        notifiedUserIds.add(uId);

        try {
          await createNotification({
            userId: uId,
            recipientEmail: partUser.email || (uId.includes("@") ? uId : null),
            category: "roar",
            notification_type: "roar.prediction_resolved",
            title: `🎯 Outcome Revealed: "${outcomeLabel}"`,
            body: `The result for "${engagement.title}" has been revealed: "${outcomeLabel}". Thank you for participating!`,
            subtitle: "See outcome & discussion in ROAR Pulse",
            cta_label: "Open ROAR Pulse",
            cta_target: "/MainModules/ROAR",
            priority: "NORMAL",
            roomId: targetRoomId,
            metadata: {
              engagementId: cleanId,
              winningChoiceId,
              winningChoiceText: outcomeLabel,
              isWinner: false,
            },
          });
        } catch (partNotifErr) {
          console.warn("[Resolve] Participant notification notice:", partNotifErr);
        }
      }
    };

    // Non-blocking background trigger
    dispatchNotificationsAsync().catch((err) => {
      console.warn("[Resolve] Background notifications notice:", err);
    });

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
