// app/api/roar/rooms/[roomId]/messages/[msgId]/reactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { findRoomMessage, VALID_REACTIONS, normalizeReaction, resolveUserProfiles, formatCleanUsername } from "@/lib/roarRoomHelpers";

export const dynamic = "force-dynamic";

interface Reactor {
  userId: string;
  username: string;
  avatarUrl: string | undefined;
  badge: string;
  reaction: string;
  reactedAt: number;
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
    const effectiveRoomId = roomId || searchParams.get("roomId") || undefined;

    let reactorsData: { userId: string; reaction: string; reactedAt: number }[] = [];
    let parentExists = false;

    if (effectiveRoomId) {
      const found = await findRoomMessage(effectiveRoomId, msgId);
      if (found) {
        parentExists = true;
        const targetMsgId = found.rawMsgId || msgId;

        try {
          const likePrefix = `LIKE#${targetMsgId}#`;
          const reactionsRes = await docClient.send(new QueryCommand({
            TableName: TABLES.RealTimeChat,
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":r": found.roomIdKey, ":p": likePrefix },
            Limit: limit,
          }));

          if (reactionsRes.Items && reactionsRes.Items.length > 0) {
            reactorsData = reactionsRes.Items.map(item => ({
              userId: (item.sk as string).slice(likePrefix.length),
              reaction: normalizeReaction(item.reaction) || "heart",
              reactedAt: item.reactedAt ?? 0,
            }));
          }
        } catch (dynErr) {
          console.warn("[Reactions GET] DynamoDB reactions query notice:", dynErr);
        }

        // Also check Firestore if empty
        if (reactorsData.length === 0) {
          try {
            const cleanRoomId = effectiveRoomId.replace(/^ROOM#/, "");
            const parentRef = db.collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId).collection("messages").doc(targetMsgId);
            const likesSnap = await parentRef.collection("likes").orderBy("reactedAt", "desc").limit(limit).get();
            if (!likesSnap.empty) {
              reactorsData = likesSnap.docs.map(doc => {
                const data = doc.data();
                return {
                  userId: doc.id,
                  reaction: normalizeReaction(data.reaction) || "heart",
                  reactedAt: data.reactedAt ?? 0,
                };
              });
            }
          } catch (fsErr) {
            console.warn("[Reactions GET] Firestore fallback notice:", fsErr);
          }
        }
      }
    } else {
      // Standalone post
      try {
        const postRes = await docClient.send(new QueryCommand({
          TableName: TABLES.SocialAndContent,
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":c": `POST#${msgId}`, ":p": "POST#" },
          Limit: 1,
        }));
        if (postRes.Items && postRes.Items.length > 0) {
          parentExists = true;
          const likePrefix = "LIKE#";
          const reactionsRes = await docClient.send(new QueryCommand({
            TableName: TABLES.SocialAndContent,
            KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
            ExpressionAttributeValues: { ":c": `POST#${msgId}`, ":p": likePrefix },
            Limit: limit,
          }));
          if (reactionsRes.Items) {
            reactorsData = reactionsRes.Items.map(item => ({
              userId: (item.sk as string).slice(likePrefix.length),
              reaction: normalizeReaction(item.reaction) || "heart",
              reactedAt: item.reactedAt ?? 0,
            }));
          }
        }
      } catch (dynErr) {
        console.warn("[Reactions GET] Post reactions query notice:", dynErr);
      }
    }

    if (!parentExists) {
      return NextResponse.json({ error: effectiveRoomId ? "Message not found" : "Post not found" }, { status: 404 });
    }

    const uniqueReactorIds = Array.from(new Set(reactorsData.map(r => r.userId).filter(Boolean)));
    const profileMap = await resolveUserProfiles(uniqueReactorIds);

    const standardTypes = ["heart", "fire", "laugh", "sad", "thumb", "mindblown", "goat", "clap", "nochance"];
    const reactionsByType: Record<string, Reactor[]> = Object.fromEntries(standardTypes.map(t => [t, []]));
    const counts: Record<string, number> = Object.fromEntries(standardTypes.map(t => [t, 0]));

    const reactors: Reactor[] = reactorsData.map(r => {
      const type = normalizeReaction(r.reaction) || "heart";
      const p = profileMap.get(r.userId);
      const entry: Reactor = {
        userId: r.userId,
        username: p?.username || formatCleanUsername(r.userId),
        avatarUrl: p?.avatarUrl,
        badge: p?.badge || "Fan",
        reaction: type,
        reactedAt: r.reactedAt,
      };

      if (!reactionsByType[type]) reactionsByType[type] = [];
      reactionsByType[type].push(entry);
      counts[type] = (counts[type] || 0) + 1;
      return entry;
    });

    return NextResponse.json({
      success: true,
      reactors,
      reactionsByType,
      counts,
      totalCount: reactors.length,
    });
  } catch (error: any) {
    console.error("GET /api/roar/rooms/[roomId]/messages/[msgId]/reactions error:", error);
    return NextResponse.json({ error: error.message || "Failed to load reactions." }, { status: 500 });
  }
}