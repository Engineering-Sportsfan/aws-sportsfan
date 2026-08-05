// app/api/fanbattle/session/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface FanBattleResponse {
  id: string;
  quizId: string;
  questionNumber: number;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  selectedAnswer: string;
  isCorrect: boolean;
  pointsEarned: number;
  answeredAt: number;
  correctAnswer: string;
}

// ─── GET /api/fanbattle/session ──────────────────────────────────────────────
// Query params:
//   quizId + userId → returns session for that user/quiz combo
//   sessionId       → returns single session by ID
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const quizId = searchParams.get("quizId");
    const userId = searchParams.get("userId");

    // ── Single session lookup by ID ──────────────────────────────────────────
    if (sessionId) {
      let sessionData: any = null;

      // 1. Try DynamoDB
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "SportsData",
            Key: {
              entityId: `QUIZ_SESSION#${sessionId}`,
              sk: "SESSION#META",
            },
          })
        );
        if (getRes.Item) {
          sessionData = { id: sessionId, ...getRes.Item };
        }
      } catch (e) {
        console.warn("[fanbattle session GET] DynamoDB notice:", e);
      }

      // 2. Fallback to Firestore
      if (!sessionData && db) {
        const doc = await db.collection("fanBattleSessions").doc(sessionId).get();
        if (doc.exists) {
          sessionData = { id: doc.id, ...doc.data() };
        }
      }

      if (!sessionData) {
        return NextResponse.json(
          { error: `Session "${sessionId}" not found` },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: true, data: sessionData },
        { status: 200 }
      );
    }

    // ── Find session by quizId and userId ────────────────────────────────────
    if (!quizId || !userId) {
      return NextResponse.json(
        { error: "Both quizId and userId are required when sessionId is not provided" },
        { status: 400 }
      );
    }

    let foundSession: any = null;

    // 1. Try DynamoDB Scan or Key
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :sPrefix) AND sk = :metaSk AND quizId = :qId AND userId = :uId",
          ExpressionAttributeValues: {
            ":sPrefix": "QUIZ_SESSION#",
            ":metaSk": "SESSION#META",
            ":qId": quizId,
            ":uId": userId,
          },
          Limit: 1,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        const item = scanRes.Items[0];
        const sId = item.id || (item.entityId as string).replace(/^QUIZ_SESSION#/, "");

        // Fetch detailed responses
        const responseIds = (item.responseIds as string[]) || [];
        const responses: FanBattleResponse[] = [];

        for (const respId of responseIds) {
          try {
            const rGet = await docClient.send(
              new GetCommand({
                TableName: "SportsData",
                Key: { entityId: `QUIZ_RESPONSE#${respId}`, sk: "RESPONSE#META" },
              })
            );
            if (rGet.Item) {
              responses.push({ id: respId, ...rGet.Item } as FanBattleResponse);
            }
          } catch {
            // fallback per item
          }
        }

        foundSession = {
          id: sId,
          ...item,
          responses,
        };
      }
    } catch (e) {
      console.warn("[fanbattle session query] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!foundSession && db) {
      const sessionsRef = db.collection("fanBattleSessions");
      const query = sessionsRef
        .where("quizId", "==", quizId)
        .where("userId", "==", userId)
        .limit(1);

      const snapshot = await query.get();

      if (!snapshot.empty) {
        const sessionDoc = snapshot.docs[0];
        const sessionData = sessionDoc.data();

        const responseIds = (sessionData.responseIds as string[]) || [];
        const responses: FanBattleResponse[] = [];

        for (const responseId of responseIds) {
          const responseDoc = await db.collection("fanBattleResponses").doc(responseId).get();
          if (responseDoc.exists) {
            responses.push({ id: responseDoc.id, ...responseDoc.data() } as FanBattleResponse);
          }
        }

        foundSession = {
          id: sessionDoc.id,
          ...sessionData,
          responses,
        };
      }
    }

    if (!foundSession) {
      return NextResponse.json(
        { success: true, data: null, message: "No session found" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: foundSession,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching session:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}