// app/api/post-preference/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export type PreferenceAction = "suggest_more" | "suggest_less";

interface PreferencePayload {
  postId: string;
  userId: string;
  action: PreferenceAction;
}

// POST /api/post-preference — Record a suggest-more / suggest-less signal
export async function POST(req: NextRequest) {
  try {
    const body: PreferencePayload = await req.json();
    const { postId, userId, action } = body;

    if (!postId || !userId || !action) {
      return NextResponse.json(
        { success: false, error: "postId, userId, and action are required" },
        { status: 400 }
      );
    }

    if (action !== "suggest_more" && action !== "suggest_less") {
      return NextResponse.json(
        { success: false, error: "action must be 'suggest_more' or 'suggest_less'" },
        { status: 400 }
      );
    }

    let postData: Record<string, unknown> | null = null;
    if (db) {
      const postRef = db.collection("socialPosts").doc(postId);
      const postSnap = await postRef.get();
      if (!postSnap.exists) {
        return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
      }
      postData = postSnap.data() as Record<string, unknown>;
    }

    const now = Date.now();
    const docId = `${userId}_${postId}`;

    let existingAction: string | null = null;
    let isNew = true;

    if (db) {
      const prefRef = db.collection("postPreferences").doc(docId);
      const existing = await prefRef.get();
      if (existing.exists) {
        isNew = false;
        existingAction = (existing.data()?.action as string) || null;
      }
    }

    const prefDoc = {
      id: docId,
      postId,
      userId,
      action,
      postAuthorId: postData?.userId ?? null,
      postAuthorName: postData?.userName ?? null,
      updatedAt: now,
      ...(isNew ? { createdAt: now } : {}),
    };

    const dynamoItem = {
      contentId: `PREFERENCE#${userId}#${postId}`,
      sk: `POST#${postId}`,
      ...prefDoc,
    };

    await dualWrite("postPreferences", docId, "SocialAndContent", dynamoItem);

    if (db && postData && existingAction !== action) {
      const postRef = db.collection("socialPosts").doc(postId);
      const updates: Record<string, unknown> = { updatedAt: now };
      if (action === "suggest_more") {
        updates.suggestMoreCount = ((postData.suggestMoreCount as number) ?? 0) + 1;
        if (existingAction === "suggest_less") {
          updates.suggestLessCount = Math.max(0, ((postData.suggestLessCount as number) ?? 0) - 1);
        }
      } else {
        updates.suggestLessCount = ((postData.suggestLessCount as number) ?? 0) + 1;
        if (existingAction === "suggest_more") {
          updates.suggestMoreCount = Math.max(0, ((postData.suggestMoreCount as number) ?? 0) - 1);
        }
      }
      await postRef.update(updates);
    }

    const message =
      action === "suggest_more"
        ? "You'll see more posts like this."
        : "You'll see fewer posts like this.";

    return NextResponse.json(
      { success: true, data: { ...prefDoc, id: docId }, message },
      { status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/post-preference error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// GET /api/post-preference?userId=xxx&postId=yyy
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const postId = searchParams.get("postId");

    if (!userId || !postId) {
      return NextResponse.json(
        { success: false, error: "userId and postId are required" },
        { status: 400 }
      );
    }

    const docId = `${userId}_${postId}`;

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "SocialAndContent",
          Key: {
            contentId: `PREFERENCE#${userId}#${postId}`,
            sk: `POST#${postId}`,
          },
        })
      );
      if (getRes.Item) {
        return NextResponse.json({
          success: true,
          data: { id: docId, ...getRes.Item },
        });
      }
    } catch (e) {
      console.warn("[post-preference GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const snap = await db.collection("postPreferences").doc(docId).get();
      if (snap.exists) {
        return NextResponse.json({ success: true, data: { id: snap.id, ...snap.data() } });
      }
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/post-preference error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}