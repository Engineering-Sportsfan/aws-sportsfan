// app/api/roar/posts/[postId]/likesection/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { notifyPostReaction, notifyRoomMessageReaction } from "@/lib/roarNotifyHelpers";
import { awardRoarPointsByReason } from "@/lib/roarPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

type ReactionType = "heart" | "fire" | "mindblown" | "goat" | "clap" | "nochance" | string;

function getTargetRef(postId: string, roomId?: string) {
  if (roomId) {
    return db.collection("roarRooms").doc(roomId).collection("messages").doc(postId);
  }
  return db.collection("roarPosts").doc(postId);
}

function reactionCountField(reaction: string): string {
  const map: Record<string, string> = {
    heart: "heartCount",
    fire: "fireCount",
    mindblown: "mindblownCount",
    goat: "goatCount",
    clap: "clapCount",
    nochance: "nochanceCount",
    laugh: "laughCount",
    sad: "sadCount",
    thumb: "thumbCount",
  };
  return map[reaction] ?? `${reaction}Count`;
}

// ─── POST — add or switch reaction ───────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const reaction: ReactionType = body.reaction;
    const roomId: string | undefined = body.roomId;

    if (!reaction) return NextResponse.json({ error: "reaction is required" }, { status: 400 });

    const resolvedParams = await params;
    const { postId } = resolvedParams;

    const info = await getUserInfo(user.userId, undefined, user.email);
    if (!info.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const userId = info.actualUserId;

    // 1. Fetch parent document from DynamoDB first
    let parentItem: any = null;
    try {
      if (roomId) {
        const msgRes = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND sk = :s",
          ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `MSG#${postId}` },
          Limit: 1
        }));
        if (msgRes.Items && msgRes.Items.length > 0) {
          parentItem = msgRes.Items[0];
        }
      } else {
        const postRes = await docClient.send(new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" },
          Limit: 1
        }));
        if (postRes.Items && postRes.Items.length > 0) {
          parentItem = postRes.Items[0];
        }
      }
    } catch (dynErr) {
      console.warn("[LikeSection] DynamoDB parent fetch failed:", dynErr);
    }

    // Fallback parent check
    let parentExists = !!parentItem;
    let fallbackData: any = null;
    const targetRef = getTargetRef(postId, roomId);

    if (!parentExists) {
      try {
        const snap = await targetRef.get();
        if (snap.exists) {
          parentExists = true;
          fallbackData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[LikeSection] Firestore parent fetch failed:", fsErr);
      }
    }

    if (!parentExists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const data = parentItem || fallbackData || {};
    const reactions = { ...(data.reactions ?? {}) };
    const previousReaction = reactions[userId] ?? null;
    const isSameReaction = previousReaction === reaction;
    const postOwnerId: string | undefined = data.authorUid;

    const newLikeCount = Math.max(0, (data.likeCount ?? 0) + (isSameReaction ? -1 : (previousReaction ? 0 : 1)));

    if (isSameReaction) {
      // Toggle reaction off
      delete reactions[userId];
      const prevField = reactionCountField(previousReaction);
      const newPrevFieldCount = Math.max(0, (data[prevField] ?? 1) - 1);

      // Update DynamoDB
      try {
        if (roomId) {
          await docClient.send(new DeleteCommand({
            TableName: "RealTimeChat",
            Key: { roomId: `ROOM#${roomId}`, sk: `LIKE#${postId}#${userId}` }
          }));
        } else {
          await docClient.send(new DeleteCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `POST#${postId}`, sk: `LIKE#${userId}` }
          }));
        }

        if (parentItem) {
          if (roomId) {
            await docClient.send(new UpdateCommand({
              TableName: "RealTimeChat",
              Key: { roomId: `ROOM#${roomId}`, sk: `MSG#${postId}` },
              UpdateExpression: "SET reactions = :r, likeCount = :lc, #pf = :pfc",
              ExpressionAttributeNames: { "#pf": prevField },
              ExpressionAttributeValues: { ":r": reactions, ":lc": newLikeCount, ":pfc": newPrevFieldCount }
            }));
          } else {
            await docClient.send(new UpdateCommand({
              TableName: "SocialAndContent",
              Key: { contentId: `POST#${postId}`, sk: parentItem.sk },
              UpdateExpression: "SET reactions = :r, likeCount = :lc, #pf = :pfc",
              ExpressionAttributeNames: { "#pf": prevField },
              ExpressionAttributeValues: { ":r": reactions, ":lc": newLikeCount, ":pfc": newPrevFieldCount }
            }));
          }
        }
      } catch (dynErr) {
        console.warn("[LikeSection] DynamoDB remove reaction failed:", dynErr);
      }

      // Sync/Fallback to Firestore
      try {
        await targetRef.update({
          [`reactions.${userId}`]: FieldValue.delete(),
          likeCount: newLikeCount,
          [reactionCountField(previousReaction)]: FieldValue.increment(-1),
        });
        if (roomId) await targetRef.collection("likes").doc(userId).delete();
        if (postOwnerId && postOwnerId !== userId) {
          db.collection("users").doc(postOwnerId).set(
            { [`activityCounts.likesReceived`]: FieldValue.increment(-1) },
            { merge: true }
          ).catch(() => { });
        }
      } catch (fsErr) {
        console.warn("[LikeSection] Firestore remove reaction sync failed:", fsErr);
      }

      return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });
    }

    // Add or Switch reaction
    reactions[userId] = reaction;
    const field = reactionCountField(reaction);
    const newFieldCount = (data[field] ?? 0) + 1;

    let updateExpr = "SET reactions = :r, likeCount = :lc, #f = :fc";
    let attrNames: Record<string, string> = { "#f": field };
    let attrVals: Record<string, any> = { ":r": reactions, ":lc": newLikeCount, ":fc": newFieldCount };

    let prevField = "";
    let newPrevFieldCount = 0;
    if (previousReaction) {
      prevField = reactionCountField(previousReaction);
      newPrevFieldCount = Math.max(0, (data[prevField] ?? 1) - 1);
      updateExpr += ", #pf = :pfc";
      attrNames["#pf"] = prevField;
      attrVals[":pfc"] = newPrevFieldCount;
    }

    // Update DynamoDB
    try {
      if (roomId) {
        await docClient.send(new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${roomId}`,
            sk: `LIKE#${postId}#${userId}`,
            reaction: reaction,
            reactedAt: Date.now()
          }
        }));
      } else {
        await docClient.send(new PutCommand({
          TableName: "SocialAndContent",
          Item: {
            contentId: `POST#${postId}`,
            sk: `LIKE#${userId}`,
            reaction: reaction,
            reactedAt: Date.now()
          }
        }));
      }

      if (parentItem) {
        if (roomId) {
          await docClient.send(new UpdateCommand({
            TableName: "RealTimeChat",
            Key: { roomId: `ROOM#${roomId}`, sk: `MSG#${postId}` },
            UpdateExpression: updateExpr,
            ExpressionAttributeNames: attrNames,
            ExpressionAttributeValues: attrVals
          }));
        } else {
          await docClient.send(new UpdateCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `POST#${postId}`, sk: parentItem.sk },
            UpdateExpression: updateExpr,
            ExpressionAttributeNames: attrNames,
            ExpressionAttributeValues: attrVals
          }));
        }
      }
    } catch (dynErr) {
      console.warn("[LikeSection] DynamoDB add/switch reaction failed:", dynErr);
    }

    // Sync/Fallback to Firestore
    try {
      const fsUpdate: Record<string, any> = {
        [`reactions.${userId}`]: reaction,
        [field]: FieldValue.increment(1),
        likeCount: newLikeCount
      };
      if (previousReaction) {
        fsUpdate[prevField] = FieldValue.increment(-1);
      }
      await targetRef.update(fsUpdate);

      if (roomId) {
        await targetRef.collection("likes").doc(userId).set({
          reaction: reaction,
          reactedAt: Date.now(),
          userId,
        });
      }

      if (postOwnerId && postOwnerId !== userId && !previousReaction) {
        db.collection("users").doc(postOwnerId).set(
          { [`activityCounts.likesReceived`]: FieldValue.increment(1) },
          { merge: true }
        ).catch(() => { });
      }
    } catch (fsErr) {
      console.warn("[LikeSection] Firestore add/switch reaction sync failed:", fsErr);
    }

    // Award reactor points
    if (!previousReaction) {
      const info = await getUserInfo(user.userId, undefined, user.email);
      awardRoarPointsByReason({
        actualUserId: userId,
        authUserId: user.userId,
        userName: info.userName,
        userEmail: user.email,
        userExists: info.exists,
        reason: "REACT",
        points: 3,
        transactionId: `react_${postId}_${userId}_${roomId ?? "post"}`,
        metadata: { postId, roomId, reaction },
      }).catch(() => { });
    }

    if (roomId) {
      notifyRoomMessageReaction(roomId, postId, userId, reaction).catch(() => { });
    } else {
      notifyPostReaction(postId, userId, reaction).catch(() => { });
    }

    return NextResponse.json({
      success: true,
      action: previousReaction ? "switched" : "added",
      reaction,
      likeCount: newLikeCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[likesection POST]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE — remove reaction ─────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("roomId") ?? undefined;
    const resolvedParams = await params;
    const { postId } = resolvedParams;

    const info = await getUserInfo(user.userId, undefined, user.email);
    if (!info.exists) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const userId = info.actualUserId;

    let parentItem: any = null;
    try {
      if (roomId) {
        const msgRes = await docClient.send(new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :r AND sk = :s",
          ExpressionAttributeValues: { ":r": `ROOM#${roomId}`, ":s": `MSG#${postId}` },
          Limit: 1
        }));
        if (msgRes.Items && msgRes.Items.length > 0) {
          parentItem = msgRes.Items[0];
        }
      } else {
        const postRes = await docClient.send(new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c AND begins_with(sk, :p)",
          ExpressionAttributeValues: { ":c": `POST#${postId}`, ":p": "POST#" },
          Limit: 1
        }));
        if (postRes.Items && postRes.Items.length > 0) {
          parentItem = postRes.Items[0];
        }
      }
    } catch (dynErr) {
      console.warn("[LikeSection] DynamoDB parent fetch failed:", dynErr);
    }

    let parentExists = !!parentItem;
    let fallbackData: any = null;
    const targetRef = getTargetRef(postId, roomId);

    if (!parentExists) {
      try {
        const snap = await targetRef.get();
        if (snap.exists) {
          parentExists = true;
          fallbackData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[LikeSection] Firestore parent fetch failed:", fsErr);
      }
    }

    if (!parentExists) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    const data = parentItem || fallbackData || {};
    const reactions = { ...(data.reactions ?? {}) };
    const previousReaction = reactions[userId] ?? null;

    if (!previousReaction) {
      return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: data.likeCount ?? 0 });
    }

    const newLikeCount = Math.max(0, (data.likeCount ?? 0) - 1);
    delete reactions[userId];
    const prevField = reactionCountField(previousReaction);
    const newPrevFieldCount = Math.max(0, (data[prevField] ?? 1) - 1);

    // Update DynamoDB
    try {
      if (roomId) {
        await docClient.send(new DeleteCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `LIKE#${postId}#${userId}` }
        }));
      } else {
        await docClient.send(new DeleteCommand({
          TableName: "SocialAndContent",
          Key: { contentId: `POST#${postId}`, sk: `LIKE#${userId}` }
        }));
      }

      if (parentItem) {
        if (roomId) {
          await docClient.send(new UpdateCommand({
            TableName: "RealTimeChat",
            Key: { roomId: `ROOM#${roomId}`, sk: `MSG#${postId}` },
            UpdateExpression: "SET reactions = :r, likeCount = :lc, #pf = :pfc",
            ExpressionAttributeNames: { "#pf": prevField },
            ExpressionAttributeValues: { ":r": reactions, ":lc": newLikeCount, ":pfc": newPrevFieldCount }
          }));
        } else {
          await docClient.send(new UpdateCommand({
            TableName: "SocialAndContent",
            Key: { contentId: `POST#${postId}`, sk: parentItem.sk },
            UpdateExpression: "SET reactions = :r, likeCount = :lc, #pf = :pfc",
            ExpressionAttributeNames: { "#pf": prevField },
            ExpressionAttributeValues: { ":r": reactions, ":lc": newLikeCount, ":pfc": newPrevFieldCount }
          }));
        }
      }
    } catch (dynErr) {
      console.warn("[LikeSection] DynamoDB delete reaction failed:", dynErr);
    }

    // Sync/Fallback to Firestore
    try {
      await targetRef.update({
        [`reactions.${userId}`]: FieldValue.delete(),
        likeCount: newLikeCount,
        [prevField]: FieldValue.increment(-1),
      });
      if (roomId) await targetRef.collection("likes").doc(userId).delete();
      const postOwnerId: string | undefined = data.authorUid;
      if (postOwnerId && postOwnerId !== userId) {
        db.collection("users").doc(postOwnerId).set(
          { [`activityCounts.likesReceived`]: FieldValue.increment(-1) },
          { merge: true }
        ).catch(() => { });
      }
    } catch (fsErr) {
      console.warn("[LikeSection] Firestore delete reaction sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, action: "removed", reaction: null, likeCount: newLikeCount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    console.error("[likesection DELETE]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}