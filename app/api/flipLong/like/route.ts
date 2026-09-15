// app/api/flipLong/like/route.ts — Like / Unlike FlipLong Video API
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { QueryCommand, ScanCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { dualWrite } from "@/lib/dualWrite";

export const dynamic = "force-dynamic";

const ROOM_ID = "FLIPLONG#VIDEOS";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));

    const rawId = (
      body.id ||
      body.videoId ||
      searchParams.get("id") ||
      searchParams.get("videoId") ||
      ""
    ).trim();

    if (!rawId) {
      return NextResponse.json({ success: false, error: "Video ID is required" }, { status: 400 });
    }

    const action = body.action || "like"; // "like" | "unlike" | "toggle"
    const userId = (body.userId || body.user?.userId || body.email || "guest").trim();

    const cleanId = rawId.replace(/^(VIDEO|FLIPLONG)#/, "").trim();

    let videoItem: Record<string, any> | null = null;
    let targetSk: string | null = null;

    // 1. Fetch current video from DynamoDB RealTimeChat
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.RealTimeChat,
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":r": ROOM_ID,
            ":skPrefix": "VIDEO#",
          },
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        for (const item of qRes.Items) {
          if (
            item.id === cleanId ||
            item.videoId === cleanId ||
            (item.sk as string)?.includes(cleanId) ||
            item.url === rawId ||
            item.mediaUrl === rawId
          ) {
            videoItem = item;
            targetSk = item.sk;
            break;
          }
        }
      }
    } catch (dynErr) {
      console.warn("DynamoDB flipLong like lookup notice:", dynErr);
    }

    // 1b. Fallback Scan in DynamoDB if not found by query
    if (!videoItem) {
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: TABLES.RealTimeChat,
            FilterExpression:
              "id = :id OR videoId = :id OR contains(sk, :id) OR contains(entityId, :id) OR url = :raw OR mediaUrl = :raw",
            ExpressionAttributeValues: {
              ":id": cleanId,
              ":raw": rawId,
            },
            Limit: 10,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          videoItem = scanRes.Items[0];
          targetSk = videoItem.sk;
        }
      } catch (scanErr) {
        console.warn("DynamoDB flipLong like scan notice:", scanErr);
      }
    }

    // 2. Fallback to Firestore if not found in DynamoDB
    if (!videoItem && db) {
      try {
        const col = getFirestoreCollection("flipLongVideos");
        const doc = await db.collection(col).doc(cleanId).get();
        if (doc.exists) {
          videoItem = { id: doc.id, ...doc.data() };
        }
      } catch (fbErr) {
        console.warn("Firestore flipLong like lookup notice:", fbErr);
      }
    }

    // Calculate updated likes and likedBy
    const now = Date.now();
    let currentLikes = Number(videoItem?.likes ?? videoItem?.likeCount ?? 0);
    let likedBy: string[] = Array.isArray(videoItem?.likedBy)
      ? [...(videoItem.likedBy as string[])]
      : [];

    const isCurrentlyLiked = likedBy.includes(userId);
    let isLiked = isCurrentlyLiked;
    let nextLikes = currentLikes;

    if (action === "unlike") {
      if (isCurrentlyLiked) {
        likedBy = likedBy.filter((u) => u !== userId);
        nextLikes = Math.max(0, currentLikes - 1);
        isLiked = false;
      }
    } else if (action === "toggle") {
      if (isCurrentlyLiked) {
        likedBy = likedBy.filter((u) => u !== userId);
        nextLikes = Math.max(0, currentLikes - 1);
        isLiked = false;
      } else {
        likedBy.push(userId);
        nextLikes = currentLikes + 1;
        isLiked = true;
      }
    } else {
      // action === "like"
      if (!isCurrentlyLiked) {
        likedBy.push(userId);
        nextLikes = currentLikes + 1;
        isLiked = true;
      } else {
        // Already liked: preserve state without duplicate increment
        return NextResponse.json({
          success: true,
          id: cleanId,
          isLiked: true,
          alreadyLiked: true,
          likes: currentLikes,
          likeCount: currentLikes,
          likedBy,
        });
      }
    }

    // 3. Update DynamoDB RealTimeChat
    if (targetSk) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: TABLES.RealTimeChat,
            Key: {
              roomId: ROOM_ID,
              sk: targetSk,
            },
            UpdateExpression: "SET likes = :l, likeCount = :l, likedBy = :lb, updatedAt = :u",
            ExpressionAttributeValues: {
              ":l": nextLikes,
              ":lb": likedBy,
              ":u": now,
            },
          })
        );
      } catch (upErr) {
        console.warn("DynamoDB flipLong like update notice:", upErr);
      }
    }

    // 4. Update Firestore flipLongVideos
    if (db) {
      try {
        const col = getFirestoreCollection("flipLongVideos");
        await db.collection(col).doc(cleanId).set(
          {
            likes: nextLikes,
            likeCount: nextLikes,
            likedBy,
            updatedAt: now,
          },
          { merge: true }
        );
      } catch (fbErr) {
        console.warn("Firestore flipLong like update notice:", fbErr);
      }
    }

    return NextResponse.json({
      success: true,
      id: cleanId,
      isLiked,
      likes: nextLikes,
      likeCount: nextLikes,
      likedBy,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error processing like";
    console.error("Error in flipLong like route:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawId = (searchParams.get("id") || searchParams.get("videoId") || "").trim();
    const userId = (searchParams.get("userId") || "guest").trim();

    if (!rawId) {
      return NextResponse.json({ success: false, error: "Video ID is required" }, { status: 400 });
    }

    const cleanId = rawId.replace(/^(VIDEO|FLIPLONG)#/, "").trim();
    let videoItem: Record<string, any> | null = null;

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: TABLES.RealTimeChat,
          KeyConditionExpression: "roomId = :r AND begins_with(sk, :skPrefix)",
          ExpressionAttributeValues: {
            ":r": ROOM_ID,
            ":skPrefix": "VIDEO#",
          },
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        for (const item of qRes.Items) {
          if (item.id === cleanId || item.videoId === cleanId || (item.sk as string)?.includes(cleanId)) {
            videoItem = item;
            break;
          }
        }
      }
    } catch {}

    if (!videoItem && db) {
      try {
        const col = getFirestoreCollection("flipLongVideos");
        const doc = await db.collection(col).doc(cleanId).get();
        if (doc.exists) {
          videoItem = { id: doc.id, ...doc.data() };
        }
      } catch {}
    }

    const likes = Number(videoItem?.likes ?? videoItem?.likeCount ?? 0);
    const likedBy: string[] = Array.isArray(videoItem?.likedBy) ? videoItem.likedBy : [];
    const isLiked = likedBy.includes(userId);

    return NextResponse.json({
      success: true,
      id: cleanId,
      isLiked,
      likes,
      likeCount: likes,
      likedBy,
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: "Failed to fetch like status" }, { status: 500 });
  }
}
