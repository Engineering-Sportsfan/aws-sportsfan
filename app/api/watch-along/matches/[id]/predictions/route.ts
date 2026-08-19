// app/api/watch-along/matches/[id]/predictions/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches/[id]/predictions
   Query: ?open=true  →  only open predictions
───────────────────────────────────────────── */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const openOnly = searchParams.get("open") === "true";

    let predictions: any[] = [];

    // 1. Query DynamoDB GamificationAndWallet
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "GamificationAndWallet",
          KeyConditionExpression: "userId = :uId AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":uId": `MATCH#${id}`,
            ":skPrefix": "PREDICTION#",
          },
          Limit: 50,
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        let items = (qRes.Items as any[]).map((item) => ({
          id: (item.sk as string).replace(/^PREDICTION#/, "") || item.id,
          ...item,
        }));

        if (openOnly) {
          items = items.filter((p) => p.isOpen === true);
        }

        items.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        predictions = items;
      }
    } catch (dynErr) {
      console.warn("[predictions GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (predictions.length === 0) {
      const matchRef = db.collection("watchAlongMatches").doc(id);
      let query: FirebaseFirestore.Query = matchRef
        .collection("predictions")
        .orderBy("createdAt", "desc");

      if (openOnly) {
        query = query.where("isOpen", "==", true);
      }

      const snapshot = await query.get();
      predictions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    return NextResponse.json({
      success: true,
      predictions,
    });
  } catch (error) {
    console.error("[predictions GET] Error:", error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch predictions",
      },
      { status: 500 }
    );
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches/[id]/predictions
   action = "create"  (admin)
   action = "vote"    (user)
───────────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const matchRef = db.collection("watchAlongMatches").doc(id);

    // ── CREATE ──
    if (action === "create") {
      const user = await getUserSessionAndRole(req);
      if (!user) {
        return NextResponse.json(
          { success: false, message: "Unauthorized - Authentication required" },
          { status: 401 }
        );
      }

      const isAuth = await isAuthorizedForMatch(user, id);
      if (!isAuth) {
        return NextResponse.json(
          { success: false, message: "Forbidden - Insufficient permissions" },
          { status: 403 }
        );
      }

      const { question, options, closesAt } = body;

      if (!question?.trim() || !Array.isArray(options) || options.length < 2) {
        return NextResponse.json(
          { success: false, message: "question and at least 2 options are required" },
          { status: 400 }
        );
      }

      const votes: Record<string, number> = {};
      options.forEach((opt: string) => { votes[opt] = 0; });

      const predictionId = uuidv4();
      const now = Date.now();
      const predictionData = {
        id: predictionId,
        question: question.trim(),
        options,
        votes,
        totalVotes: 0,
        closesAt: closesAt || null,
        isOpen: true,
        createdAt: now,
        updatedAt: now,
      };

      await dualWrite({
        tableName: "GamificationAndWallet",
        dynamoItem: {
          userId: `MATCH#${id}`,
          sk: `PREDICTION#${predictionId}`,
          ...predictionData,
        },
        firestoreRef: matchRef.collection("predictions").doc(predictionId),
        firestoreData: predictionData,
      });

      return NextResponse.json({ success: true, prediction: predictionData });
    }

    // ── VOTE ──
    if (action === "vote") {
      const { predictionId, option, userId } = body;

      if (!predictionId || !option || !userId) {
        return NextResponse.json(
          { success: false, message: "predictionId, option, and userId are required" },
          { status: 400 }
        );
      }

      let pred: any = null;
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "GamificationAndWallet",
            Key: { userId: `MATCH#${id}`, sk: `PREDICTION#${predictionId}` },
          })
        );
        if (getRes.Item) pred = getRes.Item;
      } catch (e) {
        // fallback
      }

      if (!pred) {
        const predRef = matchRef.collection("predictions").doc(predictionId);
        const predDoc = await predRef.get();
        if (!predDoc.exists) {
          return NextResponse.json({ success: false, message: "Prediction not found" }, { status: 404 });
        }
        pred = predDoc.data();
      }

      if (!pred.isOpen) {
        return NextResponse.json({ success: false, message: "Prediction is closed" }, { status: 400 });
      }
      if (pred.closesAt && Date.now() > pred.closesAt) {
        return NextResponse.json({ success: false, message: "Prediction has expired" }, { status: 400 });
      }
      if (!pred.options.includes(option)) {
        return NextResponse.json({ success: false, message: "Invalid option" }, { status: 400 });
      }

      // Check if user already voted
      let alreadyVoted = false;
      try {
        const vCheck = await docClient.send(
          new GetCommand({
            TableName: "GamificationAndWallet",
            Key: { userId: `MATCH#${id}`, sk: `PREDICTION_VOTE#${predictionId}#${userId}` },
          })
        );
        if (vCheck.Item) alreadyVoted = true;
      } catch (e) {
        // ignore
      }

      if (alreadyVoted) {
        return NextResponse.json({ success: false, message: "Already voted" }, { status: 409 });
      }

      const now = Date.now();
      const userVoteData = {
        option,
        votedAt: now,
      };

      // Record vote in DynamoDB & Firestore
      await dualWrite({
        tableName: "GamificationAndWallet",
        dynamoItem: {
          userId: `MATCH#${id}`,
          sk: `PREDICTION_VOTE#${predictionId}#${userId}`,
          predictionId,
          userTargetId: userId,
          ...userVoteData,
        },
        firestoreRef: matchRef.collection("predictions").doc(predictionId).collection("userVotes").doc(userId),
        firestoreData: userVoteData,
      });

      // Update prediction vote count in DynamoDB
      const updatedVotes = { ...(pred.votes || {}) };
      updatedVotes[option] = (updatedVotes[option] || 0) + 1;
      const totalVotes = Number(pred.totalVotes || 0) + 1;

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "GamificationAndWallet",
            Key: { userId: `MATCH#${id}`, sk: `PREDICTION#${predictionId}` },
            UpdateExpression: "SET votes = :v, totalVotes = :tv, updatedAt = :now",
            ExpressionAttributeValues: {
              ":v": updatedVotes,
              ":tv": totalVotes,
              ":now": now,
            },
          })
        );
      } catch (e) {
        // ignore
      }

      // Mirror to Firestore
      try {
        await matchRef.collection("predictions").doc(predictionId).update({
          [`votes.${option}`]: FieldValue.increment(1),
          totalVotes: FieldValue.increment(1),
          updatedAt: now,
        });
      } catch (e) {
        // ignore
      }

      return NextResponse.json({
        success: true,
        prediction: {
          id: predictionId,
          ...pred,
          votes: updatedVotes,
          totalVotes,
        },
      });
    }

    return NextResponse.json(
      { success: false, message: "Invalid action. Use 'create' or 'vote'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[predictions POST]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   PATCH  /api/watch-along/matches/[id]/predictions
   Admin: open or close a prediction
───────────────────────────────────────────── */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const isAuth = await isAuthorizedForMatch(user, id);
    if (!isAuth) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const { predictionId, isOpen } = await req.json();

    if (!predictionId || typeof isOpen !== "boolean") {
      return NextResponse.json(
        { success: false, message: "predictionId and isOpen (boolean) are required" },
        { status: 400 }
      );
    }

    const now = Date.now();

    // 1. Update in DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "GamificationAndWallet",
          Key: { userId: `MATCH#${id}`, sk: `PREDICTION#${predictionId}` },
          UpdateExpression: "SET isOpen = :op, updatedAt = :now",
          ExpressionAttributeValues: {
            ":op": isOpen,
            ":now": now,
          },
        })
      );
    } catch (e) {
      console.warn("[predictions PATCH] DynamoDB update notice:", e);
    }

    // 2. Mirror in Firestore
    try {
      const matchRef = db.collection("watchAlongMatches").doc(id);
      await matchRef.collection("predictions").doc(predictionId).update({
        isOpen,
        updatedAt: now,
      });
    } catch (e) {
      console.warn("[predictions PATCH] Firestore update notice:", e);
    }

    return NextResponse.json({
      success: true,
      message: `Prediction ${isOpen ? "opened" : "closed"}`,
    });
  } catch (error) {
    console.error("[predictions PATCH]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}