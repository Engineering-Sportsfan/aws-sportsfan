// api/roar/rooms/[roomId]/messages/[msgId]/voters/route.ts
//
// Returns who voted for each option on a room message (debate / prediction).
// Visible to every fan in the room — not author-gated, since ROAR room
// activity is inherently public within the room.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface VoterEntry {
  uid: string;
  username: string;
  avatarUrl?: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> | { roomId: string; msgId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId, msgId } = resolvedParams;

    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch parent message from DynamoDB first
    let msgItem: any = null;
    let fetchedMsgFromDynamo = false;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        FilterExpression: "chatId = :m",
        ExpressionAttributeValues: {
          ":r": `ROOM#${roomId}`,
          ":p": `MSG#${roomId}#`,
          ":m": msgId
        },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        msgItem = qRes.Items[0];
        fetchedMsgFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomVoters GET] DynamoDB message fetch failed:", dynErr);
    }

    let roomRef = db.collection("roarRooms").doc(roomId);
    let msgExists = fetchedMsgFromDynamo;
    let fallbackMsgData: any = null;

    if (!msgExists) {
      try {
        let msgSnap = await roomRef.collection("messages").doc(msgId).get();
        if (!msgSnap.exists) {
          const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
          const fallbackSnap = await fallbackRef.collection("messages").doc(msgId).get();
          if (fallbackSnap.exists) {
            roomRef = fallbackRef;
            msgSnap = fallbackSnap;
          }
        }
        if (msgSnap.exists) {
          msgExists = true;
          fallbackMsgData = msgSnap.data();
        }
      } catch (fsErr) {
        console.warn("[RoomVoters GET] Firestore message fetch failed:", fsErr);
      }
    }

    if (!msgExists) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const msgData = msgItem || fallbackMsgData || {};
    const msgType = msgData.type ?? "";

    if (msgType !== "debate" && msgType !== "prediction" && msgType !== "hottake" && msgType !== "hot_take") {
      return NextResponse.json(
        { error: "Voter list is only available for debate/prediction posts" },
        { status: 400 },
      );
    }

    const optionLabels: Record<string, string> = {
      agree: msgData.predictionOptions?.[0] ?? msgData.sideA ?? "Option A",
      disagree: msgData.predictionOptions?.[1] ?? msgData.sideB ?? "Option B",
    };
    if (Array.isArray(msgData.predictionOptions)) {
      msgData.predictionOptions.forEach((label: string, idx: number) => {
        if (idx >= 2) optionLabels[`option_${idx}`] = label;
      });
    }

    // 2. Fetch all votes from DynamoDB first
    let votesData: any[] = [];
    let fetchedVotesFromDynamo = false;
    try {
      const res = await docClient.send(new QueryCommand({
        TableName: "RealTimeChat",
        KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":p": `VOTE#${msgId}#` }
      }));
      if (res.Items) {
        votesData = res.Items;
        fetchedVotesFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[RoomVoters GET] DynamoDB votes fetch failed:", dynErr);
    }

    // Fallback: Check Firestore
    if (!fetchedVotesFromDynamo) {
      try {
        const msgRef = roomRef.collection("messages").doc(msgId);
        const votesSnap = await msgRef.collection("votes").get();
        votesData = votesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } catch (fsErr) {
        console.error("[RoomVoters GET] Firestore votes fetch failed:", fsErr);
      }
    }

    const votersByOption: Record<string, VoterEntry[]> = {};
    const voterUids = votesData.map((d) => d.userId || d.id);
    const userInfoByUid = new Map<string, { username: string; avatarUrl?: string }>();

    if (voterUids.length > 0) {
      let fetchedProfiles = false;
      try {
        const keys = voterUids.map(uid => ({
          entityId: `USER#${uid}`,
          sk: "USER#META"
        }));

        const batchResults = await docClient.send(new BatchGetCommand({
          RequestItems: {
            "IdentityAndAccess": {
              Keys: keys
            }
          }
        }));

        const items = batchResults.Responses?.["IdentityAndAccess"] || [];
        items.forEach(item => {
          const uid = (item.entityId as string).replace(/^USER#/, "");
          userInfoByUid.set(uid, {
            username: item.username || item.userName || uid,
            avatarUrl: item.avatarUrl,
          });
        });
        fetchedProfiles = true;
      } catch (dynErr) {
        console.warn("[RoomVoters GET] DynamoDB batch profile lookup failed:", dynErr);
      }

      // Fallback: Check Firestore
      if (!fetchedProfiles || userInfoByUid.size < voterUids.length) {
        try {
          const missingUserIds = voterUids.filter(uid => !userInfoByUid.has(uid));
          const userRefs = missingUserIds.map((uid) => db.collection("users").doc(uid));
          const userSnaps = userRefs.length > 0 ? await db.getAll(...userRefs) : [];
          userSnaps.forEach((snap) => {
            if (snap.exists) {
              const d = snap.data() as { username?: string; avatarUrl?: string; avatar?: string };
              userInfoByUid.set(snap.id, {
                username: d.username ?? snap.id,
                avatarUrl: d.avatarUrl ?? d.avatar,
              });
            }
          });
        } catch (fsErr) {
          console.error("[RoomVoters GET] Firestore profiles fallback failed:", fsErr);
        }
      }
    }

    votesData.forEach((voteItem) => {
      const vote = voteItem.vote;
      if (!vote) return;
      const uid = voteItem.userId || voteItem.id;
      const info = userInfoByUid.get(uid) ?? { username: uid, avatarUrl: undefined };
      const entry: VoterEntry = { uid, username: info.username, avatarUrl: info.avatarUrl };
      if (!votersByOption[vote]) votersByOption[vote] = [];
      votersByOption[vote].push(entry);
    });

    const optionKeys = Object.keys(optionLabels).sort((a, b) => {
      const order = (k: string) => (k === "agree" ? 0 : k === "disagree" ? 1 : Number(k.replace("option_", "")));
      return order(a) - order(b);
    });

    const options = optionKeys.map((key) => ({
      key,
      label: optionLabels[key],
      voters: votersByOption[key] ?? [],
    }));

    const totalVotes = options.reduce((sum, o) => sum + o.voters.length, 0);

    return NextResponse.json({
      success: true,
      sideA: optionLabels.agree,
      sideB: optionLabels.disagree,
      voters: {
        agree: votersByOption.agree ?? [],
        disagree: votersByOption.disagree ?? [],
      },
      options,
      totalVotes,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET room message voters error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}