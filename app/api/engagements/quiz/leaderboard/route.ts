// app/api/engagements/quiz/leaderboard/route.ts — Live Quiz Leaderboard API
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import {
  ScanCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import type { QuizLeaderboardEntry } from "@/types/engagements";

export const dynamic = "force-dynamic";

// ─── GET /api/engagements/quiz/leaderboard ────────────────────────────────────
// Returns top quiz users ranked by total points, correct answers, and accuracy
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const quizId = searchParams.get("quizId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const authUser = await getUser(req);
    const requestingUserId =
      authUser?.userId || authUser?.email || searchParams.get("userId");

    const entriesMap = new Map<string, QuizLeaderboardEntry>();

    // Helper to merge entry records cleanly
    const mergeEntry = (item: {
      userId: string;
      userName?: string;
      userAvatar?: string;
      userEmail?: string;
      totalPoints?: number;
      pointsEarned?: number;
      correctCount?: number;
      incorrectCount?: number;
      totalAnswered?: number;
      lastAnsweredAt?: number;
      updatedAt?: number;
    }) => {
      const uid = item.userId;
      if (!uid) return;

      const pts = Number(item.totalPoints ?? item.pointsEarned ?? 0);
      const corr = Number(item.correctCount ?? 0);
      const incorr = Number(item.incorrectCount ?? 0);
      const answered = Number(item.totalAnswered ?? (corr + incorr));
      const activityTime = Number(item.lastAnsweredAt ?? item.updatedAt ?? Date.now());

      const existing = entriesMap.get(uid);
      if (!existing) {
        entriesMap.set(uid, {
          rank: 0,
          userId: uid,
          userName: item.userName || "Fan Quizzer",
          userAvatar:
            item.userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
          userEmail: item.userEmail || "",
          totalPoints: pts,
          correctCount: corr,
          incorrectCount: incorr,
          totalAnswered: answered,
          lastAnsweredAt: activityTime,
        });
      } else {
        existing.totalPoints = Math.max(existing.totalPoints, pts);
        existing.correctCount = Math.max(existing.correctCount, corr);
        existing.incorrectCount = Math.max(existing.incorrectCount, incorr);
        existing.totalAnswered = Math.max(existing.totalAnswered, answered);
        existing.lastAnsweredAt = Math.max(existing.lastAnsweredAt || 0, activityTime);
        if (item.userName && existing.userName === "Fan Quizzer") {
          existing.userName = item.userName;
        }
        if (item.userAvatar && existing.userAvatar?.includes("dicebear")) {
          existing.userAvatar = item.userAvatar;
        }
      }
    };

    // 1. Fetch from DynamoDB SocialAndContent table
    try {
      if (quizId) {
        // A. Direct Query on quiz-specific partition
        const queryQuiz = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid",
            ExpressionAttributeValues: {
              ":cid": `QUIZ_LEADERBOARD#${quizId}`,
            },
          })
        );
        if (queryQuiz.Items) {
          for (const it of queryQuiz.Items) {
            const uid = (it.sk as string)?.replace(/^USER#/, "") || it.userId;
            mergeEntry({ ...it, userId: uid });
          }
        }

        // B. Query direct votes on this quiz engagement: contentId = ENGAGEMENT#{quizId}, sk begins_with VOTE#
        const queryVotes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
            ExpressionAttributeValues: {
              ":cid": `ENGAGEMENT#${quizId}`,
              ":skpfx": "VOTE#",
            },
          })
        );
        if (queryVotes.Items) {
          const userVotesMap = new Map<
            string,
            {
              pts: number;
              corr: number;
              incorr: number;
              answered: number;
              name: string;
              avatar: string;
              last: number;
            }
          >();
          for (const v of queryVotes.Items) {
            const uid = v.userId || (v.sk as string)?.replace(/^VOTE#/, "").split("#")[0];
            if (!uid) continue;
            const isCorr = v.isCorrect ?? (Number(v.pointsAwarded || 0) > 0);
            const pts = Number(v.pointsAwarded || 0);
            const rec = userVotesMap.get(uid) || {
              pts: 0,
              corr: 0,
              incorr: 0,
              answered: 0,
              name: v.userName || v.displayName || "Fan Quizzer",
              avatar: v.userAvatar || "",
              last: Number(v.votedAt || v.timestamp || Date.now()),
            };
            rec.pts += pts;
            rec.corr += isCorr ? 1 : 0;
            rec.incorr += isCorr ? 0 : 1;
            rec.answered += 1;
            rec.last = Math.max(rec.last, Number(v.votedAt || v.timestamp || Date.now()));
            userVotesMap.set(uid, rec);
          }
          for (const [uid, stats] of userVotesMap.entries()) {
            mergeEntry({
              userId: uid,
              userName: stats.name,
              userAvatar: stats.avatar,
              totalPoints: stats.pts,
              correctCount: stats.corr,
              incorrectCount: stats.incorr,
              totalAnswered: stats.answered,
              lastAnsweredAt: stats.last,
            });
          }
        }
      } else {
        // Global Leaderboard: Direct Query on QUIZ_LEADERBOARD#GLOBAL partition
        const queryGlobal = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid",
            ExpressionAttributeValues: {
              ":cid": "QUIZ_LEADERBOARD#GLOBAL",
            },
          })
        );
        if (queryGlobal.Items) {
          for (const it of queryGlobal.Items) {
            const uid = (it.sk as string)?.replace(/^USER#/, "") || it.userId;
            mergeEntry({ ...it, userId: uid });
          }
        }

        // If Global has few entries, also scan with pagination for any QUIZ_LEADERBOARD# items
        let lastKey: any = undefined;
        let scannedCount = 0;
        do {
          const scanRes = await docClient.send(
            new ScanCommand({
              TableName: TABLES.SocialAndContent,
              FilterExpression: "begins_with(contentId, :pfx)",
              ExpressionAttributeValues: {
                ":pfx": "QUIZ_LEADERBOARD#",
              },
              ExclusiveStartKey: lastKey,
            })
          );
          if (scanRes.Items) {
            for (const it of scanRes.Items) {
              const uid = (it.sk as string)?.replace(/^USER#/, "") || it.userId;
              mergeEntry({ ...it, userId: uid });
            }
          }
          lastKey = scanRes.LastEvaluatedKey;
          scannedCount += scanRes.ScannedCount || 0;
        } while (lastKey && scannedCount < 1500 && entriesMap.size < limit);
      }
    } catch (dynErr) {
      console.warn("[Quiz Leaderboard] DynamoDB fetch notice:", dynErr);
    }

    // 2. Firestore integration
    if (db) {
      try {
        const collectionsToTry = [
          getFirestoreCollection("quiz_leaderboard"),
          "quiz_leaderboard",
        ];
        const seenCol = new Set<string>();

        for (const colName of collectionsToTry) {
          if (seenCol.has(colName)) continue;
          seenCol.add(colName);

          const snap = await db.collection(colName).limit(100).get();
          for (const doc of snap.docs) {
            const it = doc.data();
            if (quizId && it.quizId && it.quizId !== quizId) continue;
            const uid = it.userId || doc.id.split("_")[0];
            mergeEntry({ ...it, userId: uid });
          }
        }

        // If quizId is provided, also check user_engagements collection for any quiz votes
        if (quizId) {
          const engCols = [
            getFirestoreCollection("user_engagements"),
            "user_engagements",
          ];
          const seenEngCol = new Set<string>();
          for (const col of engCols) {
            if (seenEngCol.has(col)) continue;
            seenEngCol.add(col);

            const vSnap = await db
              .collection(col)
              .where("engagementId", "==", quizId)
              .where("type", "==", "quiz")
              .limit(100)
              .get();

            for (const doc of vSnap.docs) {
              const v = doc.data();
              const uid = v.userId;
              if (!uid) continue;
              const isCorr = v.isCorrect ?? (Number(v.pointsAwarded || 0) > 0);
              mergeEntry({
                userId: uid,
                userName: v.userName || "Fan Quizzer",
                userAvatar: v.userAvatar,
                totalPoints: Number(v.pointsAwarded || 0),
                correctCount: isCorr ? 1 : 0,
                incorrectCount: isCorr ? 0 : 1,
                totalAnswered: 1,
                lastAnsweredAt: Number(v.votedAt || v.timestamp || Date.now()),
              });
            }
          }
        }
      } catch (fbErr) {
        console.warn("[Quiz Leaderboard] Firestore fetch notice:", fbErr);
      }
    }

    // Sort entries by points (descending), then correct count (descending)
    let allEntries = Array.from(entriesMap.values());
    allEntries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.totalAnswered - b.totalAnswered;
    });

    allEntries = allEntries.map((e, idx) => {
      const accuracy =
        e.totalAnswered > 0 ? `${Math.round((e.correctCount / e.totalAnswered) * 100)}%` : "0%";
      return {
        ...e,
        rank: idx + 1,
        accuracy,
      };
    });

    const pagedLeaderboard = allEntries.slice(0, limit);
    let currentUser: QuizLeaderboardEntry | null = null;

    if (requestingUserId) {
      currentUser =
        allEntries.find(
          e => e.userId === requestingUserId || e.userEmail === requestingUserId
        ) || null;
    }

    return NextResponse.json({
      success: true,
      leaderboard: pagedLeaderboard,
      totalParticipants: allEntries.length,
      currentUser,
    });
  } catch (error: unknown) {
    console.error("GET /api/engagements/quiz/leaderboard error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch quiz leaderboard";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST /api/engagements/quiz/leaderboard ───────────────────────────────────
// Updates or records user's quiz score, points, correct and incorrect answers atomically
export async function POST(req: NextRequest) {
  try {
    const authUser = await getUser(req);
    const body = await req.json();
    const {
      userId: inputUserId,
      userName,
      userAvatar,
      quizId,
      questionId,
      isCorrect,
      pointsEarned = 50,
    } = body;

    const userId =
      authUser?.userId ||
      authUser?.email ||
      inputUserId ||
      `anon_${req.headers.get("x-forwarded-for") || Date.now()}`;

    const displayName = userName || authUser?.name || "Fan Quizzer";
    const avatar =
      userAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`;
    const pts = isCorrect ? Number(pointsEarned) : 0;
    const now = Date.now();

    // 1. Atomic DynamoDB Updates for Global + Quiz Specific Leaderboard
    let updatedGlobalAttrs: any = null;
    try {
      const updateGlobalPromise = docClient.send(
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
            ":pts": pts,
            ":corr": isCorrect ? 1 : 0,
            ":incorr": isCorrect ? 0 : 1,
            ":one": 1,
            ":uname": displayName,
            ":uavatar": avatar,
            ":uemail": authUser?.email || "",
            ":now": now,
            ":entity": "QUIZ_LEADERBOARD",
            ":uid": userId,
          },
          ReturnValues: "ALL_NEW",
        })
      );

      const updateQuizPromise = quizId
        ? docClient.send(
            new UpdateCommand({
              TableName: TABLES.SocialAndContent,
              Key: { contentId: `QUIZ_LEADERBOARD#${quizId}`, sk: `USER#${userId}` },
              UpdateExpression:
                "SET totalPoints = if_not_exists(totalPoints, :zero) + :pts, " +
                "correctCount = if_not_exists(correctCount, :zero) + :corr, " +
                "incorrectCount = if_not_exists(incorrectCount, :zero) + :incorr, " +
                "totalAnswered = if_not_exists(totalAnswered, :zero) + :one, " +
                "userName = :uname, userAvatar = :uavatar, userEmail = :uemail, " +
                "lastAnsweredAt = :now, updatedAt = :now, entityId = :entity, userId = :uid, quizId = :qid",
              ExpressionAttributeValues: {
                ":zero": 0,
                ":pts": pts,
                ":corr": isCorrect ? 1 : 0,
                ":incorr": isCorrect ? 0 : 1,
                ":one": 1,
                ":uname": displayName,
                ":uavatar": avatar,
                ":uemail": authUser?.email || "",
                ":now": now,
                ":entity": "QUIZ_LEADERBOARD",
                ":uid": userId,
                ":qid": quizId,
              },
            })
          )
        : Promise.resolve();

      const [resGlobal] = await Promise.all([updateGlobalPromise, updateQuizPromise]);
      updatedGlobalAttrs = (resGlobal as any)?.Attributes;
    } catch (dynErr) {
      console.warn("[Quiz Leaderboard POST] DynamoDB update notice:", dynErr);
    }

    // 2. Atomic Firestore Updates
    if (db) {
      try {
        const colName = getFirestoreCollection("quiz_leaderboard");
        const incData = {
          userId,
          userName: displayName,
          userAvatar: avatar,
          userEmail: authUser?.email || "",
          totalPoints: FieldValue.increment(pts),
          correctCount: FieldValue.increment(isCorrect ? 1 : 0),
          incorrectCount: FieldValue.increment(isCorrect ? 0 : 1),
          totalAnswered: FieldValue.increment(1),
          lastAnsweredAt: now,
          updatedAt: now,
        };

        await Promise.all([
          db.collection(colName).doc(userId).set(incData, { merge: true }),
          quizId
            ? db
                .collection(colName)
                .doc(`${userId}_${quizId}`)
                .set({ ...incData, quizId }, { merge: true })
            : Promise.resolve(),
          colName !== "quiz_leaderboard"
            ? db.collection("quiz_leaderboard").doc(userId).set(incData, { merge: true })
            : Promise.resolve(),
        ]);
      } catch (fbErr) {
        console.warn("[Quiz Leaderboard POST] Firestore write notice:", fbErr);
      }
    }

    const totalPts = Number(updatedGlobalAttrs?.totalPoints || pts);
    const corrCount = Number(updatedGlobalAttrs?.correctCount || (isCorrect ? 1 : 0));
    const incorrCount = Number(updatedGlobalAttrs?.incorrectCount || (isCorrect ? 0 : 1));
    const totAnswered = Number(updatedGlobalAttrs?.totalAnswered || 1);
    const accuracy =
      totAnswered > 0 ? `${Math.round((corrCount / totAnswered) * 100)}%` : "0%";

    return NextResponse.json({
      success: true,
      stats: {
        userId,
        userName: displayName,
        userAvatar: avatar,
        totalPoints: totalPts,
        correctCount: corrCount,
        incorrectCount: incorrCount,
        totalAnswered: totAnswered,
        accuracy,
        pointsAwarded: pts,
        isCorrect: Boolean(isCorrect),
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/engagements/quiz/leaderboard error:", error);
    const msg = error instanceof Error ? error.message : "Failed to record quiz answer";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/engagements/quiz/leaderboard ─────────────────────────────────
// Deletes all user records in quiz leaderboard from DynamoDB and Firestore
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const quizId = searchParams.get("quizId");

    let deletedCount = 0;

    // 1. Delete Global and Quiz-specific leaderboard records in DynamoDB
    const partitions = quizId
      ? [`QUIZ_LEADERBOARD#${quizId}`, "QUIZ_LEADERBOARD#GLOBAL"]
      : ["QUIZ_LEADERBOARD#GLOBAL"];

    for (const partitionKey of partitions) {
      try {
        const queryRes = await docClient.send(
          new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :cid",
            ExpressionAttributeValues: { ":cid": partitionKey },
          })
        );
        if (queryRes.Items) {
          for (const it of queryRes.Items) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: it.contentId, sk: it.sk },
              })
            );
            deletedCount++;
          }
        }
      } catch (err) {
        console.warn(`[Delete Leaderboard] Query failed for ${partitionKey}:`, err);
      }
    }

    // 2. If global deletion, scan and delete all QUIZ_LEADERBOARD# items
    if (!quizId) {
      let lastKey: any = undefined;
      do {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLES.SocialAndContent,
            FilterExpression: "begins_with(contentId, :pfx)",
            ExpressionAttributeValues: { ":pfx": "QUIZ_LEADERBOARD#" },
            ExclusiveStartKey: lastKey,
          })
        );
        if (scanRes.Items) {
          for (const it of scanRes.Items) {
            await docClient.send(
              new DeleteCommand({
                TableName: TABLES.SocialAndContent,
                Key: { contentId: it.contentId, sk: it.sk },
              })
            );
            deletedCount++;
          }
        }
        lastKey = scanRes.LastEvaluatedKey;
      } while (lastKey);

      // Also delete any quiz votes so past answers don't repopulate the leaderboard
      let voteKey: any = undefined;
      do {
        const voteRes = await docClient.send(
          new ScanCommand({
            TableName: TABLES.SocialAndContent,
            FilterExpression: "begins_with(contentId, :engPfx) AND begins_with(sk, :votePfx)",
            ExpressionAttributeValues: { ":engPfx": "ENGAGEMENT#", ":votePfx": "VOTE#" },
            ExclusiveStartKey: voteKey,
          })
        );
        if (voteRes.Items) {
          for (const v of voteRes.Items) {
            if (v.type === "quiz" || Number(v.pointsAwarded || 0) > 0) {
              await docClient.send(
                new DeleteCommand({
                  TableName: TABLES.SocialAndContent,
                  Key: { contentId: v.contentId, sk: v.sk },
                })
              );
              deletedCount++;
            }
          }
        }
        voteKey = voteRes.LastEvaluatedKey;
      } while (voteKey);
    }

    // 3. Delete Firestore quiz_leaderboard collection documents
    if (db) {
      try {
        const collections = [getFirestoreCollection("quiz_leaderboard"), "quiz_leaderboard"];
        const seenCol = new Set<string>();
        for (const col of collections) {
          if (seenCol.has(col)) continue;
          seenCol.add(col);
          const snap = await db.collection(col).get();
          for (const doc of snap.docs) {
            await doc.ref.delete();
          }
        }
      } catch (fbErr) {
        console.warn("[Delete Leaderboard] Firestore delete notice:", fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Successfully deleted all user records from quiz leaderboard in DynamoDB and Firestore",
      deletedCount,
    });
  } catch (error: unknown) {
    console.error("DELETE /api/engagements/quiz/leaderboard error:", error);
    const msg = error instanceof Error ? error.message : "Failed to delete leaderboard records";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

