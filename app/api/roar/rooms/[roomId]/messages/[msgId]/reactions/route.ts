// app/api/roar/rooms/[roomId]/messages/[msgId]/reactions/route.ts
//
// Returns:
//   reactors        — flat list of everyone who reacted, each with which
//                      emoji they picked (existing shape, unchanged)
//   reactionsByType  — same people, grouped by emoji: { heart: [...], fire: [...], ... }
//                      so the frontend can render "who reacted with what"
//                      without re-grouping client-side
//   counts           — quick per-emoji totals: { heart: 3, fire: 1, ... }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type Reaction = "heart" | "fire" | "laugh" | "sad" | "thumb";
const REACTION_TYPES: Reaction[] = ["heart", "fire", "laugh", "sad", "thumb"];

interface Reactor {
  userId: string;
  username: string;
  avatarUrl: string | undefined;
  badge: string;
  reaction: Reaction;
  reactedAt: number;
}

function isReaction(value: unknown): value is Reaction {
  return typeof value === "string" && (REACTION_TYPES as string[]).includes(value);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { roomId, msgId } = await params;
    if (!msgId) return NextResponse.json({ error: "msgId is required" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 200);
    // roomId is a path param here, but keep supporting an explicit override
    // via query string too, in case a caller wants to pass it that way.
    const effectiveRoomId = roomId || searchParams.get("roomId") || undefined;

    // 1. Existence check & fetch likes from DynamoDB first
    let reactorsData: { userId: string; reaction: Reaction; reactedAt: number }[] = [];
    let parentExists = false;
    let fetchedFromDynamo = false;

    try {
      if (effectiveRoomId) {
        // Query parent room message in RealTimeChat.
        // sk format is MSG#{roomId}#{msgId} (see react/route.ts POST
        // handler) — must prefix-match the same way; an exact "MSG#{msgId}"
        // match never hits, which was causing false "Message not found".
        const msgPrefix = `MSG#${effectiveRoomId}#${msgId}`;
        const msgRes = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :s)",
          ExpressionAttributeValues: { ":r": `ROOM#${effectiveRoomId}`, ":s": msgPrefix },
          Limit: 1
        }));
        if (msgRes.Items && msgRes.Items.length > 0) {
          parentExists = true;
          // Fetch reactions for this message in RealTimeChat.
          // Key shape is LIKE#{msgId}#{userId} — one row per user, holding
          // whichever reaction type they currently have set (see the
          // react/route.ts POST handler).
          const likePrefix = `LIKE#${msgId}#`;
          const reactionsRes = await docClient.send(new QueryCommand({
            TableName: "RealTimeChat",
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":r": `ROOM#${effectiveRoomId}`, ":p": likePrefix },
            Limit: limit
          }));
          if (reactionsRes.Items) {
            reactorsData = reactionsRes.Items.map(item => ({
              // Slice off the known prefix instead of splitting on "#" by
              // index, so a userId containing "#" can't corrupt this.
              userId: (item.sk as string).slice(likePrefix.length),
              reaction: isReaction(item.reaction) ? item.reaction : "heart",
              reactedAt: item.reactedAt ?? 0
            }));
            fetchedFromDynamo = true;
          }
        }
      } else {
        // Query parent post in SocialAndContent
        const postRes = await docClient.send(new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":c": `POST#${msgId}`, ":p": "POST#" },
          Limit: 1
        }));
        if (postRes.Items && postRes.Items.length > 0) {
          parentExists = true;
          // Fetch likes for this post in SocialAndContent
          const likePrefix = "LIKE#";
          const reactionsRes = await docClient.send(new QueryCommand({
            TableName: "SocialAndContent",
            KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":c": `POST#${msgId}`, ":p": likePrefix },
            Limit: limit
          }));
          if (reactionsRes.Items) {
            reactorsData = reactionsRes.Items.map(item => ({
              userId: (item.sk as string).slice(likePrefix.length),
              reaction: isReaction(item.reaction) ? item.reaction : "heart",
              reactedAt: item.reactedAt ?? 0
            }));
            fetchedFromDynamo = true;
          }
        }
      }
    } catch (dynErr) {
      console.warn("[Reactions] DynamoDB fetch failed, trying Firestore:", dynErr);
    }

    // Fallback: Check Firestore
    if (!fetchedFromDynamo) {
      try {
        const parentRef = effectiveRoomId
          ? db.collection("roarRooms").doc(effectiveRoomId).collection("messages").doc(msgId)
          : db.collection("roarPosts").doc(msgId);

        const parentSnap = await parentRef.get();
        if (parentSnap.exists) {
          parentExists = true;
          const likesSnap = await parentRef
              .collection("likes")
              .orderBy("reactedAt", "desc")
              .limit(limit)
              .get();

          reactorsData = likesSnap.docs.map(doc => {
            const data = doc.data();
            return {
              userId: doc.id,
              reaction: isReaction(data.reaction) ? data.reaction : "heart",
              reactedAt: data.reactedAt ?? 0
            };
          });
        }
      } catch (fsErr) {
        console.warn("[Reactions] Firestore fetch failed:", fsErr);
      }
    }

    if (!parentExists) {
      return NextResponse.json({ error: effectiveRoomId ? "Message not found" : "Post not found" }, { status: 404 });
    }

    if (reactorsData.length === 0) {
      return NextResponse.json({
        success: true,
        reactors: [],
        reactionsByType: Object.fromEntries(REACTION_TYPES.map(t => [t, []])),
        counts: Object.fromEntries(REACTION_TYPES.map(t => [t, 0])),
        total: 0
      });
    }

    // 2. Fetch User Profiles in parallel
    const userIds = reactorsData.map(r => r.userId);
    const profileMap = new Map<string, any>();

    // Try DynamoDB batch get first
    let fetchedProfiles = false;
    try {
      const keys = userIds.map(uid => ({
        entityId: `USER#${uid}`,
        sk: "USER#META"
      }));

      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < keys.length; i += chunkSize) {
        chunks.push(keys.slice(i, i + chunkSize));
      }

      const batchResults = await Promise.all(chunks.map(chunk =>
        docClient.send(new BatchGetCommand({
          RequestItems: {
            "IdentityAndAccess": {
              Keys: chunk
            }
          }
        }))
      ));

      batchResults.forEach(res => {
        const items = res.Responses?.["IdentityAndAccess"] || [];
        items.forEach(item => {
          const uid = (item.entityId as string).replace(/^USER#/, "");
          profileMap.set(uid, item);
        });
      });
      fetchedProfiles = true;
    } catch (dynErr) {
      console.warn("[Reactions] DynamoDB batch get profiles failed, trying Firestore:", dynErr);
    }

    // Fallback: Fetch user profiles from Firestore
    if (!fetchedProfiles || profileMap.size < userIds.length) {
      try {
        const missingUserIds = userIds.filter(uid => !profileMap.has(uid));
        const profileSnaps = await Promise.all(
          missingUserIds.map((uid) => db.collection("users").doc(uid).get())
        );
        profileSnaps.forEach((snap, idx) => {
          const uid = missingUserIds[idx];
          if (snap.exists) {
            profileMap.set(uid, snap.data());
          }
        });
      } catch (fsErr) {
        console.warn("[Reactions] Firestore batch profiles fallback failed:", fsErr);
      }
    }

    const reactors: Reactor[] = reactorsData.map(r => {
      const profile = profileMap.get(r.userId);
      return {
        userId: r.userId,
        username: profile?.username || profile?.userName || r.userId,
        avatarUrl: profile?.avatarUrl || undefined,
        badge: profile?.badge || "RISING_FAN",
        reaction: r.reaction,
        reactedAt: r.reactedAt
      };
    });

    // Sort by reactedAt desc
    reactors.sort((a, b) => b.reactedAt - a.reactedAt);

    // Group the same reactors by which emoji they picked, so the frontend
    // can render "who reacted with 🔥" / "who reacted with ❤️" tabs/lists
    // without re-grouping the flat array itself.
    const reactionsByType: Record<Reaction, Reactor[]> = {
      heart: [], fire: [], laugh: [], sad: [], thumb: [],
    };
    for (const r of reactors) {
      reactionsByType[r.reaction].push(r);
    }

    const counts: Record<Reaction, number> = {
      heart: reactionsByType.heart.length,
      fire: reactionsByType.fire.length,
      laugh: reactionsByType.laugh.length,
      sad: reactionsByType.sad.length,
      thumb: reactionsByType.thumb.length,
    };

    return NextResponse.json({
      success: true,
      reactors,
      reactionsByType,
      counts,
      total: reactors.length
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error(`GET /api/roar/rooms/messages/reactions error:`, error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}