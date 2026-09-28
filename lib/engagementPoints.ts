// lib/engagementPoints.ts — Points handler for Fan Battles, Quizzes, Polls, and Predictions
import { awardUserPoints, getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";

export const ENGAGEMENT_CREATION_POINTS = 2;
export const ENGAGEMENT_PARTICIPATION_POINTS = 2;

export interface AwardEngagementPointsParams {
  userId: string;
  userEmail?: string;
  userName?: string;
  action: "create" | "participate" | "accuracy_bonus";
  engagementId: string;
  engagementType: string; // "quiz" | "poll" | "prediction" | "fan_battle"
  engagementTitle?: string;
  questionId?: string;
  quizPointsBonus?: number; // Additional points if quiz answer was correct
  pointsBonus?: number; // Additional points for accuracy bonus (+10 points)
  metadata?: Record<string, any>;
    syncQuizLeaderboard?: boolean;
}

/**
 * Awards points to a user for either creating an Arena Engagement or participating in one.
 * Base reward: +2 points for creating any engagement, +2 points for participating in any engagement.
 * Correct poll/prediction outcomes reward +10 accuracy bonus points after the timer ends.
 * Quiz participation can include additional reward points if the answer was correct.
 */
export async function awardEngagementPoints({
  userId,
  userEmail,
  userName,
  action,
  engagementId,
  engagementType,
  engagementTitle,
  questionId,
  quizPointsBonus = 0,
  pointsBonus = 0,
  syncQuizLeaderboard = true,
  metadata = {},
}: AwardEngagementPointsParams): Promise<{ success: boolean; pointsAwarded: number }> {
  if (!userId) {
    return { success: false, pointsAwarded: 0 };
  }

  const isAccuracyBonus = action === "accuracy_bonus" || metadata?.reason === "CORRECT_PREDICTION_BONUS";
  const basePoints = action === "create" ? ENGAGEMENT_CREATION_POINTS : isAccuracyBonus ? 10 : ENGAGEMENT_PARTICIPATION_POINTS;
  const totalPointsToAward = isAccuracyBonus ? (pointsBonus > 0 ? pointsBonus : 10) : basePoints + (quizPointsBonus > 0 ? quizPointsBonus : 0);
  const now = Date.now();

  const cleanType = String(engagementType || "engagement").toLowerCase();
  const formattedType = cleanType.replace(/_/g, " ");

  const reason =
    action === "create"
      ? `ENGAGEMENT_CREATE_${cleanType.toUpperCase()}`
      : isAccuracyBonus
      ? `ENGAGEMENT_ACCURACY_BONUS_${cleanType.toUpperCase()}`
      : `ENGAGEMENT_PARTICIPATE_${cleanType.toUpperCase()}`;

  const cleanUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const transactionId =
    action === "create"
      ? `eng_create_${engagementId}_${cleanUserId}`
      : isAccuracyBonus
      ? `eng_accuracy_bonus_${engagementId}_${cleanUserId}`
      : `eng_vote_${engagementId}_${cleanUserId}${questionId ? `_${questionId}` : ""}`;

  const statement =
    action === "create"
      ? `Created ${formattedType}: "${engagementTitle || 'Arena Event'}" (+${basePoints} pts)`
      : isAccuracyBonus
      ? `Picked correct ${formattedType} outcome: "${engagementTitle || 'Arena Event'}" (+${totalPointsToAward} pts)`
      : quizPointsBonus > 0
      ? `Answered ${formattedType} correctly: "${engagementTitle || 'Arena Event'}" (+${totalPointsToAward} pts)`
      : `Participated in ${formattedType}: "${engagementTitle || 'Arena Event'}" (+${basePoints} pts)`;

  try {
    // 1. Resolve full user profile details
    const userProfile = await getUserInfo(userId, userName, userEmail);
    const resolvedUserId = userProfile.actualUserId || userId;
    const resolvedEmail = (userProfile.userEmail || userEmail || "").trim().toLowerCase();
    const resolvedName = userProfile.userName || userName || "Sports Fan";

    // 2. Award via central gamification engine
    let awarded = false;
    let engineThrewError = false;
    try {
      awarded = await awardUserPoints({
        actualUserId: resolvedUserId,
        authUserId: userProfile.authUserId || resolvedUserId,
        userName: resolvedName,
        userEmail: resolvedEmail,
        userExists: userProfile.exists,
        points: totalPointsToAward,
        reason,
        transactionId,
        metadata: {
          engagementId,
          engagementType: cleanType,
          engagementTitle: engagementTitle || "",
          questionId: questionId || null,
          action,
          statement,
          ...metadata,
        },
      });
    } catch (engineErr) {
      engineThrewError = true;
      console.warn("[awardEngagementPoints] userPoints engine notice:", engineErr);
    }

    // If awardUserPoints returned false without throwing (e.g., transaction already exists / daily cap),
    // do not award duplicate points.
    if (!awarded && !engineThrewError) {
      console.log(`[awardEngagementPoints] Transaction ${transactionId} already processed or capped. Skipping points award.`);
      return { success: true, pointsAwarded: 0 };
    }

    const ddbPromises: Promise<any>[] = [];
    const safeEmail = resolvedEmail || `${resolvedUserId}@sportsfan360.com`;
    const safeName = resolvedName || "Sports Fan";

    // 3. Fallback direct dual-write ONLY if central points engine threw an unexpected error
    if (!awarded && engineThrewError) {
      // A. DynamoDB: Update IdentityAndAccess table for email key if available
      if (resolvedEmail) {
        ddbPromises.push(
          docClient.send(
            new UpdateCommand({
              TableName: TABLES.IdentityAndAccess,
              Key: { entityId: `USER#${resolvedEmail}`, sk: "USER#META" },
              UpdateExpression:
                "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
                "totalXP = if_not_exists(totalXP, :zero) + :pts, " +
                "userName = if_not_exists(userName, :uname), " +
                "email = if_not_exists(email, :uemail), " +
                "name = if_not_exists(name, :uname), " +
                "lastActiveTimestamp = :now, updatedAt = :now",
              ExpressionAttributeValues: {
                ":zero": 0,
                ":pts": totalPointsToAward,
                ":now": now,
                ":uname": safeName,
                ":uemail": safeEmail,
              },
            })
          ).catch((err) => console.warn("[awardEngagementPoints] DDB Identity email notice:", err))
        );
      }

      // B. DynamoDB: Update IdentityAndAccess table for userId key if different from email
      if (resolvedUserId && resolvedUserId !== resolvedEmail) {
        ddbPromises.push(
          docClient.send(
            new UpdateCommand({
              TableName: TABLES.IdentityAndAccess,
              Key: { entityId: `USER#${resolvedUserId}`, sk: "USER#META" },
              UpdateExpression:
                "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
                "totalXP = if_not_exists(totalXP, :zero) + :pts, " +
                "userName = if_not_exists(userName, :uname), " +
                "email = if_not_exists(email, :uemail), " +
                "name = if_not_exists(name, :uname), " +
                "lastActiveTimestamp = :now, updatedAt = :now",
              ExpressionAttributeValues: {
                ":zero": 0,
                ":pts": totalPointsToAward,
                ":now": now,
                ":uname": safeName,
                ":uemail": safeEmail,
              },
            })
          ).catch((err) => console.warn("[awardEngagementPoints] DDB Identity userId notice:", err))
        );
      }

      // C. DynamoDB: Global Leaderboard entry in GamificationAndWallet
      ddbPromises.push(
        docClient.send(
          new UpdateCommand({
            TableName: TABLES.GamificationAndWallet,
            Key: { userId: `USER#${resolvedUserId}`, sk: "LEADERBOARD#GLOBAL" },
            UpdateExpression:
              "SET points = if_not_exists(points, :zero) + :pts, " +
              "totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
              "userName = :uname, userEmail = :uemail, lastUpdated = :now, leaderboardType = :ltype",
            ExpressionAttributeValues: {
              ":zero": 0,
              ":pts": totalPointsToAward,
              ":uname": safeName,
              ":uemail": safeEmail,
              ":now": now,
              ":ltype": "GLOBAL",
            },
          })
        ).catch((err) => console.warn("[awardEngagementPoints] DDB Global Leaderboard notice:", err))
      );

      // D. Firestore: Update master user document and globalLeaderboard
      if (db) {
        try {
          const fsUserUpdate: any = {
            totalPoints: FieldValue.increment(totalPointsToAward),
            totalXP: FieldValue.increment(totalPointsToAward),
            reputationScore: FieldValue.increment(totalPointsToAward),
            lastActiveTimestamp: now,
            updatedAt: now,
          };

          const fsPromises: Promise<any>[] = [
            db.collection("users").doc(resolvedUserId).set(fsUserUpdate, { merge: true }),
            db.collection("globalLeaderboard").doc(resolvedUserId).set({
              userId: resolvedUserId,
              userName: resolvedName,
              userEmail: resolvedEmail,
              totalPoints: FieldValue.increment(totalPointsToAward),
              lastUpdated: now,
            }, { merge: true }),
          ];

          if (resolvedEmail && resolvedEmail !== resolvedUserId) {
            fsPromises.push(
              db.collection("users").doc(resolvedEmail).set(fsUserUpdate, { merge: true })
            );
          }
          await Promise.all(fsPromises);
        } catch (fsErr) {
          console.warn("[awardEngagementPoints] Firestore fallback sync notice:", fsErr);
        }
      }
    }

    // 4. Update QUIZ_LEADERBOARD ONLY when explicitly requested for quiz engagements
    if (syncQuizLeaderboard && (awarded || engineThrewError)) {
      if (db) {
        try {
          await db.collection("quiz_leaderboard").doc(resolvedUserId).set({
            userId: resolvedUserId,
            userName: resolvedName,
            userEmail: safeEmail,
            totalPoints: FieldValue.increment(totalPointsToAward),
            correctCount: FieldValue.increment(isAccuracyBonus ? 1 : 0),
            lastAnsweredAt: now,
            updatedAt: now,
          }, { merge: true });
        } catch (fsErr) {
          console.warn("[awardEngagementPoints] Firestore quiz_leaderboard sync notice:", fsErr);
        }
      }

      ddbPromises.push(
        docClient.send(
          new UpdateCommand({
            TableName: TABLES.SocialAndContent,
            Key: { contentId: "QUIZ_LEADERBOARD#GLOBAL", sk: `USER#${resolvedUserId}` },
            UpdateExpression:
              "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
              "correctCount = if_not_exists(correctCount, :zero) + :corr, " +
              "userName = :uname, userEmail = :uemail, " +
              "lastAnsweredAt = :now, updatedAt = :now, entityId = :entity, userId = :uid",
            ExpressionAttributeValues: {
              ":zero": 0,
              ":pts": totalPointsToAward,
              ":corr": isAccuracyBonus ? 1 : 0,
              ":uname": safeName,
              ":uemail": safeEmail,
              ":now": now,
              ":entity": "QUIZ_LEADERBOARD",
              ":uid": resolvedUserId,
            },
          })
        ).catch((err) => console.warn("[awardEngagementPoints] DDB QUIZ_LEADERBOARD#GLOBAL notice:", err))
      );
    }

    await Promise.all(ddbPromises);

    return { success: true, pointsAwarded: totalPointsToAward };
  } catch (error) {
    console.error("[awardEngagementPoints] Unexpected error:", error);
    return { success: false, pointsAwarded: 0 };
  }
}
