// api/post-preference/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

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

        // Verify the post exists and get its author/tags for feed tuning
        const postRef = db.collection("socialPosts").doc(postId);
        const postSnap = await postRef.get();
        if (!postSnap.exists) {
            return NextResponse.json(
                { success: false, error: "Post not found" },
                { status: 404 }
            );
        }

        const postData = postSnap.data();
        const now = Date.now();

        // Upsert: one preference record per (userId, postId) pair
        // Use a deterministic doc ID so repeated calls just update, not duplicate
        const docId = `${userId}_${postId}`;
        const prefRef = db.collection("postPreferences").doc(docId);
        const existing = await prefRef.get();

        const prefDoc = {
            postId,
            userId,
            action,
            // Capture post metadata for feed algorithm use
            postAuthorId: postData?.userId ?? null,
            postAuthorName: postData?.userName ?? null,
            updatedAt: now,
            ...(existing.exists ? {} : { createdAt: now }),
        };

        await prefRef.set(prefDoc, { merge: true });

        // Update aggregate counters on the post document
        const previousAction = existing.exists ? existing.data()?.action : null;
        if (previousAction !== action) {
            const updates: Record<string, unknown> = { updatedAt: now };
            if (action === "suggest_more") {
                updates.suggestMoreCount = (postData?.suggestMoreCount ?? 0) + 1;
                if (previousAction === "suggest_less") {
                    updates.suggestLessCount = Math.max(0, (postData?.suggestLessCount ?? 0) - 1);
                }
            } else {
                updates.suggestLessCount = (postData?.suggestLessCount ?? 0) + 1;
                if (previousAction === "suggest_more") {
                    updates.suggestMoreCount = Math.max(0, (postData?.suggestMoreCount ?? 0) - 1);
                }
            }
            await postRef.update(updates);
        }

        const message =
            action === "suggest_more"
                ? "You'll see more posts like this."
                : "You'll see fewer posts like this.";

        return NextResponse.json(
            { success: true, data: { id: docId, ...prefDoc }, message },
            { status: 200 }
        );
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("POST /api/post-preference error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

// GET /api/post-preference?userId=xxx&postId=yyy  — Check user's preference for a post
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
        const snap = await db.collection("postPreferences").doc(docId).get();

        if (!snap.exists) {
            return NextResponse.json({ success: true, data: null });
        }

        return NextResponse.json({ success: true, data: { id: snap.id, ...snap.data() } });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("GET /api/post-preference error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}