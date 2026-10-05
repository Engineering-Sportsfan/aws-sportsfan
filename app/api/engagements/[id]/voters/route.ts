// app/api/engagements/[id]/voters/route.ts — Fetch list of voters grouped by option for an engagement
import { NextRequest, NextResponse } from "next/server";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export interface VoterUser {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  selectedOptionId: string;
  votedAt?: number;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Engagement ID is required" }, { status: 400 });
    }

    // 1. Fetch Engagement Metadata
    let engagement: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.SocialAndContent,
          Key: { contentId: `ENGAGEMENT#${id}`, sk: "ENGAGEMENT#META" },
        })
      );
      if (getRes.Item) engagement = getRes.Item;
    } catch { }

    if (!engagement && db) {
      try {
        const snap = await db.collection(getFirestoreCollection("engagements")).doc(id).get();
        if (snap.exists) engagement = { id: snap.id, ...snap.data() };
      } catch { }
    }

    // 1.5 Extract searchParams for question-level isolation
    const { searchParams } = new URL(req.url);
    const targetQuestionId = searchParams.get("questionId")?.trim() || "";

    // 2. Fetch all votes for this engagement from DynamoDB
    const rawVotesList: any[] = [];

    function isValidVoterUid(uid: string): boolean {
      if (!uid) return false;
      const clean = uid.trim().toLowerCase();
      if (clean.startsWith("anon") || clean === "anonymous" || clean.includes(":") || clean.includes(",")) return false;
      return true;
    }

    try {
      const voteQuery = await docClient.send(
        new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :cid AND begins_with(sk, :skpfx)",
          ExpressionAttributeValues: {
            ":cid": `ENGAGEMENT#${id}`,
            ":skpfx": "VOTE#",
          },
          Limit: 300,
        })
      );

      if (voteQuery.Items) {
        for (const item of voteQuery.Items) {
          const skParts = String(item.sk || "").replace(/^VOTE#/, "").split("#");
          const uid = item.userId || skParts[0];
          const itemQuestionId = item.questionId || (skParts.length > 1 ? skParts[1] : "");

          if (uid && isValidVoterUid(uid)) {
            rawVotesList.push({
              userId: uid,
              userName: item.userName || item.name || item.displayName,
              userAvatar: item.userAvatar || item.avatarUrl || item.avatar || item.photoURL,
              selectedOptionId: item.selectedOptionId || item.choice || item.reaction || "A",
              questionId: itemQuestionId,
              votedAt: item.votedAt || item.timestamp,
            });
          }
        }
      }
    } catch (dynErr) {
      console.warn("[GET /api/engagements/[id]/voters] DynamoDB query notice:", dynErr);
    }

    // 3. Fallback: Query Firestore user_engagements collection
    if (db && rawVotesList.length === 0) {
      try {
        const snap = await db.collection("user_engagements").where("engagementId", "==", id).get();
        for (const doc of snap.docs) {
          const item = doc.data();
          if (!item.selectedOptionId) continue; 
          const uid = item.userId || doc.id.split("_")[0];
          const itemQuestionId = item.questionId || (doc.id.split("_").length > 2 ? doc.id.split("_")[2] : "");
          if (uid && isValidVoterUid(uid)) {
            rawVotesList.push({
              userId: uid,
              userName: item.userName || item.name || item.displayName,
              userAvatar: item.userAvatar || item.avatarUrl || item.avatar || item.photoURL,
              selectedOptionId: item.selectedOptionId || item.choice || item.reaction || "A",
              questionId: itemQuestionId,
              votedAt: item.votedAt || item.timestamp,
            });
          }
        }
      } catch (fbErr) {
        console.warn("[GET /api/engagements/[id]/voters] Firestore query notice:", fbErr);
      }
    }

    const rawVotes = rawVotesList;

    // 4. Quick user profile name fallback without slow sequential network calls
    const allEnrichedVoters: (VoterUser & { questionId?: string })[] = rawVotes.map((v) => {
      const cleanName =
        v.userName ||
        (v.userId.includes("@") ? v.userId.split("@")[0] : v.userId.replace(/^USER#/i, "Fan_"));
      const cleanAvatar = v.userAvatar || null;

      return {
        userId: v.userId,
        userName: cleanName,
        userAvatar: cleanAvatar,
        selectedOptionId: String(v.selectedOptionId || "").trim(),
        questionId: v.questionId,
        votedAt: v.votedAt,
      };
    });

    // 6. Structure options list according to engagement type
    let optionsList: { id: string; text: string; count: number; voters: VoterUser[]; questionId?: string }[] = [];
    let questionsList: Array<{ questionId: string; options: typeof optionsList }> = [];

    const type = (engagement?.type || "poll").toLowerCase();

    if (type === "poll" && engagement?.pollData?.options) {
      optionsList = engagement.pollData.options.map((opt: any) => {
        const optId = String(opt.id || "").trim();
        const optText = String(opt.text || opt.label || "").trim();
        const optVoters = allEnrichedVoters.filter(
          (v) =>
            v.selectedOptionId === optId ||
            v.selectedOptionId === optText ||
            (v.selectedOptionId && optText.toLowerCase() === v.selectedOptionId.toLowerCase())
        );
        return {
          id: optId,
          text: optText || `Option ${optId}`,
          count: optVoters.length,
          voters: optVoters,
        };
      });
    } else if (type === "fan_battle" && engagement?.fanBattleData) {
      const left = engagement.fanBattleData.leftCompetitor;
      const right = engagement.fanBattleData.rightCompetitor;
      const leftVoters = allEnrichedVoters.filter(
        (v) =>
          v.selectedOptionId === "left" ||
          v.selectedOptionId === left?.name ||
          v.selectedOptionId === left?.code
      );
      const rightVoters = allEnrichedVoters.filter(
        (v) =>
          v.selectedOptionId === "right" ||
          v.selectedOptionId === right?.name ||
          v.selectedOptionId === right?.code
      );
      optionsList = [
        {
          id: "left",
          text: `${left?.code || ""} ${left?.name || "Left Competitor"}`,
          count: leftVoters.length,
          voters: leftVoters,
        },
        {
          id: "right",
          text: `${right?.code || ""} ${right?.name || "Right Competitor"}`,
          count: rightVoters.length,
          voters: rightVoters,
        },
      ];
    } else if (type === "prediction" && engagement?.predictionData) {
      const left = engagement.predictionData.leftChoice;
      const right = engagement.predictionData.rightChoice;
      const leftVoters = allEnrichedVoters.filter(
        (v) =>
          v.selectedOptionId === "left" ||
          v.selectedOptionId === left?.text ||
          v.selectedOptionId === left?.id
      );
      const rightVoters = allEnrichedVoters.filter(
        (v) =>
          v.selectedOptionId === "right" ||
          v.selectedOptionId === right?.text ||
          v.selectedOptionId === right?.id
      );
      optionsList = [
        {
          id: "left",
          text: left?.text || "Option A",
          count: leftVoters.length,
          voters: leftVoters,
        },
        {
          id: "right",
          text: right?.text || "Option B",
          count: rightVoters.length,
          voters: rightVoters,
        },
      ];
    } else if (type === "quiz") {
      const questions = engagement?.quizData?.questions || [engagement?.quizData];

      questionsList = questions.map((q: any, idx: number) => {
        const qId = String(q?.id || `q_${idx + 1}`);
        const opts = q?.options || [
          { id: "A", text: "Option A" },
          { id: "B", text: "Option B" },
          { id: "C", text: "Option C" },
          { id: "D", text: "Option D" },
        ];

        // Match voters strictly for this question
        const qVoters = allEnrichedVoters.filter((v) => {
          if (!v.questionId) return idx === 0; // Legacy unindexed votes map to question 1
          return v.questionId === qId || v.questionId === `q_${idx + 1}`;
        });

        const qOptions = opts.map((opt: any) => {
          const optId = String(opt.id || "").trim();
          const optText = String(opt.text || opt.label || "").trim();
          const optVoters = qVoters.filter(
            (v) =>
              v.selectedOptionId.toUpperCase() === optId.toUpperCase() ||
              v.selectedOptionId.toLowerCase() === optText.toLowerCase()
          );
          return {
            id: optId,
            text: `${optId}. ${optText}`,
            questionId: qId,
            count: optVoters.length,
            voters: optVoters,
          };
        });

        return {
          questionId: qId,
          options: qOptions,
        };
      });

      // Target question options for flat optionsList
      // const matchedQ = targetQuestionId
      //   ? questionsList.find((ql) => ql.questionId === targetQuestionId) || questionsList[0]
      //   : questionsList[0];
      const questionIndexParam = parseInt(searchParams.get("questionIndex") ?? "-1", 10);

      let matchedQ = targetQuestionId
        ? questionsList.find((ql) => ql.questionId === targetQuestionId)
        : undefined;

      if (!matchedQ && questionIndexParam >= 0) {
        matchedQ = questionsList[questionIndexParam];
      }
      // Only default to Q1 when no targeting info was given at all
      if (!matchedQ && !targetQuestionId && questionIndexParam < 0) {
        matchedQ = questionsList[0];
      }
      optionsList = matchedQ?.options ?? [];
      optionsList = matchedQ?.options || [];
    } else if (type === "meme") {
      const reactionTypes = ["mild", "funny", "hot", "fire", "nuclear"];
      const reactionLabels: Record<string, string> = {
        mild: "Mild 🥱",
        funny: "Funny 😂",
        hot: "Hot 🔥",
        fire: "Fire 💥",
        nuclear: "Nuclear 🚀",
      };

      optionsList = reactionTypes.map((r) => {
        const rVoters = allEnrichedVoters.filter((v) => v.selectedOptionId.toLowerCase() === r);
        return {
          id: r,
          text: reactionLabels[r] || r,
          count: rVoters.length,
          voters: rVoters,
        };
      });
    }

    // const filteredVoters = targetQuestionId && type === "quiz"
    //   ? allEnrichedVoters.filter((v) => v.questionId === targetQuestionId)
    //   : allEnrichedVoters;

        const qIdx = questionsList.findIndex((q) => q.questionId === targetQuestionId);
    const filteredVoters =
      targetQuestionId && type === "quiz"
        ? allEnrichedVoters.filter((v) =>
            v.questionId
              ? v.questionId === targetQuestionId || v.questionId === `q_${qIdx + 1}`
              : qIdx === 0
          )
        : allEnrichedVoters;

    return NextResponse.json({
      success: true,
      engagementId: id,
      type,
      totalVoters: new Set(filteredVoters.map((v) => String(v.userId).toLowerCase())).size,
      voters: filteredVoters,
      options: optionsList,
      questions: questionsList.length > 0 ? questionsList : undefined,
    });
  } catch (error: any) {
    console.error("[GET /api/engagements/[id]/voters] error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch voters" },
      { status: 500 }
    );
  }
}

