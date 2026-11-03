import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { findRoomMessage, normalizeReaction, reactionCountField } from "@/lib/roarRoomHelpers";
import { QueryCommand, DeleteCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; msgId: string; commentId: string }> }
) {
  try {
    const user = await getUser(req);
    const resolvedParams = await params;
    const { roomId, msgId, commentId } = resolvedParams;
    const body = await req.json().catch(() => ({}));
    const rawReaction = body?.reaction || "heart";

    const reaction = normalizeReaction(rawReaction) || "heart";
    const userId = user?.userId || user?.email || body?.userId || req.headers.get("x-user-id") || "guest_fan";
    const cleanRoomId = roomId.replace(/^ROOM#/, "");

    const found = await findRoomMessage(cleanRoomId, msgId);
    const targetMsgId = found?.rawMsgId || msgId;
    const roomCand = found?.roomIdKey || `ROOM#${cleanRoomId}`;
    const cleanCommentKey = String(commentId || "")
      .replace(/^COMMENT#/, "")
      .replace(new RegExp(`^${targetMsgId}#`), "")
      .replace(/^COMMENT#/, "")
      .trim();

    // 1. Fetch parent comment from DynamoDB first across candidates
    let commentItem: any = null;
    let matchedRoomIdKey = roomCand;
    const roomCandidates = Array.from(new Set([roomCand, `ROOM#${cleanRoomId}`, cleanRoomId]));

    for (const rCand of roomCandidates) {
      try {
        const qRes = await docClient.send(new QueryCommand({
          TableName: TABLES.RealTimeChat,
          KeyConditionExpression: "roomId = :r AND sk = :s",
          ExpressionAttributeValues: { ":r": rCand, ":s": `COMMENT#${targetMsgId}#${cleanCommentKey}` },
          Limit: 1
        }));
        if (qRes.Items && qRes.Items.length > 0) {
          commentItem = qRes.Items[0];
          matchedRoomIdKey = rCand;
          break;
        }
      } catch (dynErr) {
        console.warn("[CommentReact POST] DynamoDB comment fetch notice:", dynErr);
      }
    }

    const commentRef = db
      .collection(getFirestoreCollection("roarRooms")).doc(cleanRoomId)
      .collection("messages").doc(targetMsgId)
      .collection("comments").doc(cleanCommentKey);

    // Fallback: Check Firestore
    let commentExists = !!commentItem;
    let fallbackData: any = null;

    if (!commentExists) {
      try {
        const snap = await commentRef.get();
        if (snap.exists) {
          commentExists = true;
          fallbackData = snap.data();
        }
      } catch (fsErr) {
        console.warn("[CommentReact POST] Firestore comment fetch failed:", fsErr);
      }
    }

    if (!commentExists) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    const data = commentItem || fallbackData || {};
    const reactions = { ...(data.reactions ?? {}) };
    const previousReaction = reactions[userId] ?? null;
    const isSameReaction = previousReaction === reaction;

    if (isSameReaction) {
      delete reactions[userId];
    } else {
      reactions[userId] = reaction;
    }

    // Compute all unique heart reactors
    const heartUsers = Object.entries(reactions)
      .filter(([_, r]) => r === "heart" || r === "like" || r === true)
      .map(([uid]) => uid);

    const existingLikedBy: string[] = Array.isArray(data.likedBy) ? data.likedBy : [];
    const combinedLikedBy = Array.from(new Set([...existingLikedBy, ...heartUsers]));
    const updatedLikedBy = isSameReaction
      ? combinedLikedBy.filter((u: string) => u !== userId && u !== "me")
      : Array.from(new Set([...combinedLikedBy, userId]));

    const newHeartCount = Math.max(0, updatedLikedBy.length);

    if (isSameReaction) {
      // Toggle reaction off
      const prevField = reactionCountField(previousReaction);
      const newPrevFieldCount = Math.max(0, (data[prevField] ?? 1) - 1);

      // Build safe UpdateExpression without attribute overlap
      const removeParts = [
        "reactions = :r",
        "heartCount = :hc",
        "likesCount = :hc",
        "likes = :hc",
        "likedBy = :lb"
      ];
      const removeAttrNames: Record<string, string> = {};
      const removeAttrVals: Record<string, any> = {
        ":r": reactions,
        ":hc": newHeartCount,
        ":lb": updatedLikedBy,
      };

      if (prevField && !["heartCount", "likesCount", "likes"].includes(prevField)) {
        removeParts.push("#pf = :pfc");
        removeAttrNames["#pf"] = prevField;
        removeAttrVals[":pfc"] = newPrevFieldCount;
      }

      // Update DynamoDB
      try {
        await docClient.send(new DeleteCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: matchedRoomIdKey, sk: `LIKE#${cleanCommentKey}#${userId}` }
        }));

        await docClient.send(new UpdateCommand({
          TableName: TABLES.RealTimeChat,
          Key: { roomId: matchedRoomIdKey, sk: `COMMENT#${targetMsgId}#${cleanCommentKey}` },
          UpdateExpression: `SET ${removeParts.join(", ")}`,
          ...(Object.keys(removeAttrNames).length > 0 ? { ExpressionAttributeNames: removeAttrNames } : {}),
          ExpressionAttributeValues: removeAttrVals
        }));
      } catch (dynErr) {
        console.warn("[CommentReact POST] DynamoDB remove notice:", dynErr);
      }

      // Sync/Fallback to Firestore
      try {
        const fsRemoveUpdate: Record<string, any> = {
          [`reactions.${userId}`]: FieldValue.delete(),
          heartCount: newHeartCount,
          likesCount: newHeartCount,
          likes: newHeartCount,
          likedBy: updatedLikedBy,
        };
        if (prevField && !["heartCount", "likesCount", "likes"].includes(prevField)) {
          fsRemoveUpdate[prevField] = FieldValue.increment(-1);
        }
        await commentRef.update(fsRemoveUpdate);
        await commentRef.collection("likes").doc(userId).delete();
      } catch (fsErr) {
        console.warn("[CommentReact POST] Firestore remove failed:", fsErr);
      }

      return NextResponse.json({
        success: true,
        action: "removed",
        reaction: null,
        heartCount: newHeartCount,
        likesCount: newHeartCount,
        likes: newHeartCount,
        liked: false,
        likedBy: updatedLikedBy,
      });
    }

    // Add or Switch reaction
    const field = reactionCountField(reaction);
    const newFieldCount = (data[field] ?? 0) + 1;

    const setParts = [
      "reactions = :r",
      "heartCount = :hc",
      "likesCount = :hc",
      "likes = :hc",
      "likedBy = :lb"
    ];
    const attrNames: Record<string, string> = {};
    const attrVals: Record<string, any> = {
      ":r": reactions,
      ":hc": newHeartCount,
      ":lb": updatedLikedBy,
    };

    if (field && !["heartCount", "likesCount", "likes"].includes(field)) {
      setParts.push("#f = :fc");
      attrNames["#f"] = field;
      attrVals[":fc"] = newFieldCount;
    }

    let prevField = "";
    if (previousReaction) {
      prevField = reactionCountField(previousReaction);
      if (prevField && !["heartCount", "likesCount", "likes"].includes(prevField)) {
        setParts.push("#pf = :pfc");
        attrNames["#pf"] = prevField;
        attrVals[":pfc"] = Math.max(0, (data[prevField] ?? 1) - 1);
      }
    }

    const updateExpr = `SET ${setParts.join(", ")}`;

    // Update DynamoDB
    try {
      // A. Put reaction record
      await docClient.send(new PutCommand({
        TableName: TABLES.RealTimeChat,
        Item: {
          roomId: matchedRoomIdKey,
          sk: `LIKE#${cleanCommentKey}#${userId}`,
          reaction: reaction,
          reactedAt: Date.now()
        }
      }));

      // B. Update Parent Item
      await docClient.send(new UpdateCommand({
        TableName: TABLES.RealTimeChat,
        Key: { roomId: matchedRoomIdKey, sk: `COMMENT#${targetMsgId}#${cleanCommentKey}` },
        UpdateExpression: updateExpr,
        ...(Object.keys(attrNames).length > 0 ? { ExpressionAttributeNames: attrNames } : {}),
        ExpressionAttributeValues: attrVals
      }));
    } catch (dynErr) {
      console.warn("[CommentReact POST] DynamoDB write failed:", dynErr);
    }

    // Sync/Fallback to Firestore
    try {
      const fsUpdate: Record<string, any> = {
        [`reactions.${userId}`]: reaction,
        heartCount: newHeartCount,
        likesCount: newHeartCount,
        likes: newHeartCount,
        likedBy: updatedLikedBy,
      };
      if (field && !["heartCount", "likesCount", "likes"].includes(field)) {
        fsUpdate[field] = FieldValue.increment(1);
      }
      if (prevField && !["heartCount", "likesCount", "likes"].includes(prevField)) {
        fsUpdate[prevField] = FieldValue.increment(-1);
      }
      await commentRef.update(fsUpdate);
      await commentRef.collection("likes").doc(userId).set({ reaction, reactedAt: Date.now(), userId });
    } catch (fsErr) {
      console.warn("[CommentReact POST] Firestore write failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      action: previousReaction ? "switched" : "added",
      reaction,
      heartCount: newHeartCount,
      likesCount: newHeartCount,
      likes: newHeartCount,
      liked: true,
      likedBy: updatedLikedBy,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
