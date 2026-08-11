// app/api/video-progress/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const videoId = searchParams.get("videoId");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    // Fetch single video progress
    if (videoId) {
      let progress: any = null;

      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "GamificationAndWallet",
            Key: {
              userId: `USER#${userId}`,
              sk: `VIDEO_PROGRESS#${videoId}`,
            },
          })
        );
        if (getRes.Item) progress = getRes.Item;
      } catch (e) {
        console.warn("[video-progress GET single] DynamoDB notice:", e);
      }

      if (!progress && db) {
        const doc = await db
          .collection("videoProgress")
          .doc(userId)
          .collection("videos")
          .doc(encodeURIComponent(videoId))
          .get();

        if (doc.exists) {
          progress = doc.data();
        }
      }

      return NextResponse.json({ success: true, progress });
    }

    // Fetch all in-progress videos for user (for Continue Watching)
    let progressList: any[] = [];

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "GamificationAndWallet",
          KeyConditionExpression: "userId = :uid AND begins_with(sk, :vpPrefix)",
          ExpressionAttributeValues: {
            ":uid": `USER#${userId}`,
            ":vpPrefix": "VIDEO_PROGRESS#",
          },
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        progressList = qRes.Items.filter(
          (item) => (item.pct || 0) > 2 && (item.pct || 0) < 95
        );
      }
    } catch (e) {
      console.warn("[video-progress GET all] DynamoDB notice:", e);
    }

    if (progressList.length === 0 && db) {
      const snapshot = await db
        .collection("videoProgress")
        .doc(userId)
        .collection("videos")
        .where("pct", ">", 2)
        .where("pct", "<", 95)
        .orderBy("pct")
        .orderBy("pausedAt", "desc")
        .limit(10)
        .get();

      progressList = snapshot.docs.map((doc) => doc.data());
    }

    return NextResponse.json({ success: true, progress: progressList });
  } catch (error) {
    console.error("Error fetching video progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch progress",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ─── POST: Save/update progress ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, videoId, title, subtitle, elapsed, durationSeconds, pct, url } = body;

    if (!userId || !videoId) {
      return NextResponse.json(
        { success: false, error: "userId and videoId are required" },
        { status: 400 }
      );
    }

    // If video is >95% watched — clear progress (treat as finished)
    if (pct >= 95) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "GamificationAndWallet",
            Key: {
              userId: `USER#${userId}`,
              sk: `VIDEO_PROGRESS#${videoId}`,
            },
          })
        );
      } catch (e) {
        console.warn("[video-progress clear DynamoDB]:", e);
      }

      if (db) {
        await db
          .collection("videoProgress")
          .doc(userId)
          .collection("videos")
          .doc(encodeURIComponent(videoId))
          .delete();
      }

      return NextResponse.json({ success: true, message: "Progress cleared — video finished" });
    }

    const progressData = {
      videoId,
      userId,
      title,
      subtitle: subtitle || "",
      elapsed: elapsed || 0,
      durationSeconds: durationSeconds || 0,
      pct: pct || 0,
      url,
      pausedAt: Date.now(),
    };

    const dynamoItem = {
      ...progressData,
      userId: `USER#${userId}`,
      sk: `VIDEO_PROGRESS#${videoId}`,
    };

    try {
      await dualWrite(
        "videoProgress",
        `${userId}_${encodeURIComponent(videoId)}`,
        "GamificationAndWallet",
        dynamoItem
      );
    } catch (e) {
      console.warn("[video-progress dualWrite]:", e);
    }

    if (db) {
      await db
        .collection("videoProgress")
        .doc(userId)
        .collection("videos")
        .doc(encodeURIComponent(videoId))
        .set(progressData, { merge: true });
    }

    return NextResponse.json({ success: true, progress: progressData });
  } catch (error) {
    console.error("Error saving video progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save progress",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// ─── DELETE: Clear progress for a specific video ──────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const videoId = searchParams.get("videoId");

    if (!userId || !videoId) {
      return NextResponse.json(
        { success: false, error: "userId and videoId are required" },
        { status: 400 }
      );
    }

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "GamificationAndWallet",
          Key: {
            userId: `USER#${userId}`,
            sk: `VIDEO_PROGRESS#${videoId}`,
          },
        })
      );
    } catch (e) {
      console.warn("[video-progress delete DynamoDB]:", e);
    }

    if (db) {
      await db
        .collection("videoProgress")
        .doc(userId)
        .collection("videos")
        .doc(encodeURIComponent(videoId))
        .delete();
    }

    return NextResponse.json({ success: true, message: "Progress cleared" });
  } catch (error) {
    console.error("Error deleting video progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to clear progress",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}