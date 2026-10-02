// api/roar/rooms/[roomId]/messages/[msgId]/voters/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { findRoomMessage, resolveUserProfiles, formatCleanUsername } from "@/lib/roarRoomHelpers";

export const dynamic = "force-dynamic";

interface VoterEntry {
  uid: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  badge?: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const { roomId, msgId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch parent message
    const found = await findRoomMessage(roomId, msgId);
    if (!found) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const { msgItem, roomIdKey, rawMsgId } = found;
    const targetMsgId = rawMsgId || msgId;
    const msgType = msgItem.type || "";
    const isDebate = msgType === "debate" || msgType === "hottake" || msgType === "hot_take";
    const predictionOptions: string[] = Array.isArray(msgItem.predictionOptions) && msgItem.predictionOptions.length >= 2
      ? msgItem.predictionOptions
      : [msgItem.sideA || "Option 1", msgItem.sideB || "Option 2"];

    let rawVotes: { userId: string; vote: string; createdAt: number }[] = [];

    // Query DynamoDB votes: VOTE#{msgId}#
    try {
      const votePrefix = `VOTE#${targetMsgId}#`;
      const qRes = await docClient.send(new QueryCommand({
        TableName: TABLES.RealTimeChat,
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":r": roomIdKey,
          ":p": votePrefix,
        },
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        rawVotes = qRes.Items.map(item => ({
          userId: item.userId || (item.sk as string).slice(votePrefix.length),
          vote: item.vote,
          createdAt: item.createdAt || 0,
        }));
      }
    } catch (dynErr) {
      console.warn("[RoomVoters GET] DynamoDB query notice:", dynErr);
    }

    // Fallback to Firestore
    if (rawVotes.length === 0) {
      try {
        const cleanRoomId = roomId.replace(/^ROOM#/, "");
        const votesSnap = await db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId).collection("votes").get();
        if (!votesSnap.empty) {
          rawVotes = votesSnap.docs.map(doc => {
            const data = doc.data();
            return {
              userId: data.userId || doc.id,
              vote: data.vote,
              createdAt: data.createdAt || 0,
            };
          });
        }
      } catch (fsErr) {
        console.warn("[RoomVoters GET] Firestore fallback notice:", fsErr);
      }
    }

    const sideA = msgItem.sideA || predictionOptions[0] || "Side A";
    const sideB = msgItem.sideB || predictionOptions[1] || "Side B";

    if (rawVotes.length === 0) {
      return NextResponse.json({
        success: true,
        mode: isDebate ? "debate" : "prediction",
        totalVotes: 0,
        totalVoters: 0,
        sideA,
        sideB,
        agree: [],
        disagree: [],
        voters: {
          agree: [],
          disagree: [],
          [sideA]: [],
          [sideB]: [],
        },
        options: predictionOptions.map((opt, i) => ({
          id: i === 0 ? "agree" : i === 1 ? "disagree" : `option_${i}`,
          label: opt,
          text: opt,
          voteValue: i === 0 ? "agree" : i === 1 ? "disagree" : `option_${i}`,
          count: 0,
          users: [],
          voters: [],
        })),
      });
    }

    // Fetch rich user profiles for all voters
    const uniqueUids = Array.from(new Set(rawVotes.map(v => v.userId).filter(Boolean)));
    const profileMap = await resolveUserProfiles(uniqueUids);

    const enrichVoter = (v: { userId: string }): VoterEntry => {
      const p = profileMap.get(v.userId);
      return {
        uid: v.userId,
        userId: v.userId,
        username: p?.username || formatCleanUsername(v.userId),
        avatarUrl: p?.avatarUrl,
        badge: p?.badge || "Fan",
      };
    };

    if (isDebate) {
      const agreeUsers = rawVotes.filter(v => v.vote === "agree").map(enrichVoter);
      const disagreeUsers = rawVotes.filter(v => v.vote === "disagree").map(enrichVoter);

      return NextResponse.json({
        success: true,
        mode: "debate",
        totalVotes: rawVotes.length,
        totalVoters: rawVotes.length,
        sideA,
        sideB,
        agree: agreeUsers,
        disagree: disagreeUsers,
        voters: {
          agree: agreeUsers,
          disagree: disagreeUsers,
          [sideA]: agreeUsers,
          [sideB]: disagreeUsers,
        },
        options: [
          { label: sideA, text: sideA, voteValue: "agree", count: agreeUsers.length, users: agreeUsers, voters: agreeUsers },
          { label: sideB, text: sideB, voteValue: "disagree", count: disagreeUsers.length, users: disagreeUsers, voters: disagreeUsers },
        ],
      });
    } else {
      const optionMap: Record<string, VoterEntry[]> = {};
      const options = predictionOptions.map((opt, i) => {
        const voteValue = i === 0 ? "agree" : i === 1 ? "disagree" : `option_${i}`;
        const users = rawVotes.filter(v => v.vote === voteValue || v.vote === opt).map(enrichVoter);
        optionMap[voteValue] = users;
        optionMap[opt] = users;
        return {
          id: voteValue,
          label: opt,
          text: opt,
          voteValue,
          count: users.length,
          users,
          voters: users,
        };
      });

      const agreeUsers = optionMap["agree"] || [];
      const disagreeUsers = optionMap["disagree"] || [];

      return NextResponse.json({
        success: true,
        mode: "prediction",
        totalVotes: rawVotes.length,
        totalVoters: rawVotes.length,
        sideA,
        sideB,
        agree: agreeUsers,
        disagree: disagreeUsers,
        options,
        voters: {
          ...optionMap,
          agree: agreeUsers,
          disagree: disagreeUsers,
        },
      });
    }
  } catch (error: any) {
    console.error("GET /api/roar/rooms/[roomId]/messages/[msgId]/voters error:", error);
    return NextResponse.json({ error: error.message || "Failed to load voters" }, { status: 500 });
  }
}