// app/api/admin/backfill-comment-counts/route.ts
//
// ⚠️  ONE-TIME migration — run once, then delete this file (or add auth guard).
//
// Call it with:
//   GET /api/admin/backfill-comment-counts
//   GET /api/admin/backfill-comment-counts?contentType=article   (articles only)
//   GET /api/admin/backfill-comment-counts?dryRun=true           (preview, no writes)
//
// What it does:
//   1. Fetches all top-level comments grouped by contentId
//   2. For each post/article doc, sets commentCount = real count
//   3. Uses batched writes (max 500/batch) — safe for quota

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const contentType = searchParams.get("contentType") || "post"; // "post" | "article"
        const dryRun = searchParams.get("dryRun") === "true";
        const contentCollection = contentType === "post" ? "posts" : "articles";

        // Step 1: count all top-level comments grouped by contentId
        // We do a single collection scan — no per-document reads
        const commentsSnapshot = await db.collection("comments")
            .where("contentType", "==", contentType)
            .where("parentCommentId", "==", null)
            .select("contentId") // only fetch contentId field — reduces bandwidth
            .get();

        // Build a map: contentId → count
        const countMap = new Map<string, number>();
        for (const doc of commentsSnapshot.docs) {
            const id = doc.data().contentId as string;
            if (id) countMap.set(id, (countMap.get(id) || 0) + 1);
        }

        const updates: { id: string; count: number }[] = [];
        for (const [id, count] of countMap.entries()) {
            updates.push({ id, count });
        }

        if (dryRun) {
            return NextResponse.json({
                success: true,
                dryRun: true,
                contentType,
                totalContentIds: updates.length,
                totalComments: commentsSnapshot.size,
                preview: updates.slice(0, 20), // show first 20
            });
        }

        // Step 2: verify each contentId actually exists before writing
        // This filters out orphaned comments whose post was deleted
        const existingIds = new Set<string>();
        const CHECK_BATCH = 30; // getAll supports up to 500 but keep it modest
        for (let i = 0; i < updates.length; i += CHECK_BATCH) {
            const chunk = updates.slice(i, i + CHECK_BATCH);
            const refs = chunk.map(({ id }) => db.collection(contentCollection).doc(id));
            const docs = await db.getAll(...refs);
            for (const doc of docs) {
                if (doc.exists) existingIds.add(doc.id);
            }
        }

        const validUpdates = updates.filter(({ id }) => existingIds.has(id));
        const skipped = updates.length - validUpdates.length;

        // Step 3: write in batches of 499 (Firestore limit is 500)
        // Use set+merge so it works even if commentCount field never existed
        const BATCH_SIZE = 499;
        let written = 0;

        for (let i = 0; i < validUpdates.length; i += BATCH_SIZE) {
            const chunk = validUpdates.slice(i, i + BATCH_SIZE);
            const batch = db.batch();

            for (const { id, count } of chunk) {
                const ref = db.collection(contentCollection).doc(id);
                // ✅ set+merge never throws NOT_FOUND — safe for all existing docs
                batch.set(ref, { commentCount: count, updatedAt: Date.now() }, { merge: true });
            }

            await batch.commit();
            written += chunk.length;
        }

        return NextResponse.json({
            success: true,
            contentType,
            totalContentIds: updates.length,
            totalComments: commentsSnapshot.size,
            written,
            skipped,
            skippedReason: skipped > 0
                ? `${skipped} contentId(s) had no matching ${contentCollection} document (deleted posts with orphaned comments)`
                : undefined,
            message: `Done — updated ${written} ${contentType} documents. ${skipped} orphaned skipped.`,
        });

    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        console.error("[backfill-comment-counts]", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}