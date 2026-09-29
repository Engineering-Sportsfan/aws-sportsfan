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

    // 2. Fetch all votes for this engagement from DynamoDB
    const rawVotesMap = new Map<string, any>();

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
          const uid = item.userId || String(item.sk || "").replace(/^VOTE#/, "").split("#")[0];
          if (uid && !rawVotesMap.has(uid)) {
            rawVotesMap.set(uid, {
              userId: uid,
              userName: item.userName || item.name || item.displayName,
              userAvatar: item.userAvatar || item.avatarUrl || item.avatar || item.photoURL,
              selectedOptionId: item.selectedOptionId || item.choice || item.reaction || "A",
              votedAt: item.votedAt || item.timestamp,
            });
          }
        }
      }
    } catch (dynErr) {
      console.warn("[GET /api/engagements/[id]/voters] DynamoDB query notice:", dynErr);
    }

    // 3. Fallback: Query Firestore user_engagements collection
    if (db && rawVotesMap.size === 0) {
      try {
        const snap = await db.collection("user_engagements").where("engagementId", "==", id).get();
        for (const doc of snap.docs) {
          const item = doc.data();
          const uid = item.userId || doc.id.split("_")[0];
          if (uid && !rawVotesMap.has(uid)) {
            rawVotesMap.set(uid, {
              userId: uid,
              userName: item.userName || item.name || item.displayName,
              userAvatar: item.userAvatar || item.avatarUrl || item.avatar || item.photoURL,
              selectedOptionId: item.selectedOptionId || item.choice || item.reaction || "A",
              votedAt: item.votedAt || item.timestamp,
            });
          }
        }
      } catch (fbErr) {
        console.warn("[GET /api/engagements/[id]/voters] Firestore query notice:", fbErr);
      }
    }

    const rawVotes = Array.from(rawVotesMap.values());

    // 4. Enrich missing user profile names and avatars
    const userIdsToLookup = rawVotes
      .filter((v) => !v.userName || !v.userAvatar)
      .map((v) => v.userId);

    const userProfileMap = new Map<string, { name: string; avatar: string | null }>();

    if (userIdsToLookup.length > 0) {
      // Look up in Firestore users or DynamoDB Users table
      if (db) {
        try {
          const userSnapPromises = userIdsToLookup.slice(0, 50).map(async (uid) => {
            try {
              const uDoc = await db!.collection("users").doc(uid).get();
              if (uDoc.exists) {
                const ud = uDoc.data();
                return {
                  uid,
                  name: ud?.displayName || ud?.name || ud?.username || ud?.email?.split("@")[0],
                  avatar: ud?.avatarUrl || ud?.photoURL || ud?.avatar || null,
                };
              }
            } catch { }
            return null;
          });
          const resolved = await Promise.all(userSnapPromises);
          for (const r of resolved) {
            if (r) userProfileMap.set(r.uid, { name: r.name, avatar: r.avatar });
          }
        } catch { }
      }
    }

    // 5. Build enriched voters list
    const voters: VoterUser[] = rawVotes.map((v) => {
      const profile = userProfileMap.get(v.userId);
      const cleanName =
        v.userName ||
        profile?.name ||
        (v.userId.includes("@") ? v.userId.split("@")[0] : v.userId.replace(/^USER#/i, "Fan_"));
      const cleanAvatar = v.userAvatar || profile?.avatar || null;

      return {
        userId: v.userId,
        userName: cleanName,
        userAvatar: cleanAvatar,
        selectedOptionId: String(v.selectedOptionId || "").trim(),
        votedAt: v.votedAt,
      };
    });

    // 6. Structure options list according to engagement type
    let optionsList: { id: string; text: string; count: number; voters: VoterUser[] }[] = [];

    const type = (engagement?.type || "poll").toLowerCase();

    if (type === "poll" && engagement?.pollData?.options) {
      optionsList = engagement.pollData.options.map((opt: any) => {
        const optId = String(opt.id || "").trim();
        const optText = String(opt.text || opt.label || "").trim();
        const optVoters = voters.filter(
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
      const leftVoters = voters.filter(
        (v) =>
          v.selectedOptionId === "left" ||
          v.selectedOptionId === left?.name ||
          v.selectedOptionId === left?.code
      );
      const rightVoters = voters.filter(
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
      const leftVoters = voters.filter(
        (v) =>
          v.selectedOptionId === "left" ||
          v.selectedOptionId === left?.text ||
          v.selectedOptionId === left?.id
      );
      const rightVoters = voters.filter(
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
      const q = questions[0] || {};
      const opts = q.options || [
        { id: "A", text: "Option A" },
        { id: "B", text: "Option B" },
        { id: "C", text: "Option C" },
        { id: "D", text: "Option D" },
      ];

      optionsList = opts.map((opt: any) => {
        const optId = String(opt.id || "").trim();
        const optText = String(opt.text || opt.label || "").trim();
        const optVoters = voters.filter(
          (v) =>
            v.selectedOptionId.toUpperCase() === optId.toUpperCase() ||
            v.selectedOptionId.toLowerCase() === optText.toLowerCase()
        );
        return {
          id: optId,
          text: `${optId}. ${optText}`,
          count: optVoters.length,
          voters: optVoters,
        };
      });
    } else if (type === "meme") {
      // For meme, provide reactions tabs or flat list
      const reactionTypes = ["mild", "funny", "hot", "fire", "nuclear"];
      const reactionLabels: Record<string, string> = {
        mild: "Mild 🥱",
        funny: "Funny 😂",
        hot: "Hot 🔥",
        fire: "Fire 💥",
        nuclear: "Nuclear 🚀",
      };

      optionsList = reactionTypes.map((r) => {
        const rVoters = voters.filter((v) => v.selectedOptionId.toLowerCase() === r);
        return {
          id: r,
          text: reactionLabels[r] || r,
          count: rVoters.length,
          voters: rVoters,
        };
      });
    }

    return NextResponse.json({
      success: true,
      engagementId: id,
      type,
      totalVoters: voters.length,
      voters,
      options: optionsList,
    });
  } catch (error: any) {
    console.error("[GET /api/engagements/[id]/voters] error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to fetch voters" },
      { status: 500 }
    );
  }
}
