import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import type { UpdatePostPayload } from "@/types/createposts";
import { FieldValue } from "firebase-admin/firestore";


// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    return pathParts[pathParts.length - 1] || null;
}


// GET  /api/createpost/[id]

export async function GET(req: NextRequest) {

    const id = getIdFromUrl(req);

    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    try {
        const doc = await db.collection("socialPosts").doc(id).get();
        if (!doc.exists) {
            return NextResponse.json(
                { success: false, error: "Post not found" },
                { status: 404 }
            );
        }
        return NextResponse.json({ success: true, data: { id: doc.id, ...doc.data() } });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

// PATCH  /api/posts/[id]  — Update content / media

export async function PATCH(req: NextRequest) {

    const id = getIdFromUrl(req);
    console.log("Extracted ID:", id);

    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    try {
        const body: UpdatePostPayload = await req.json();
        const ref = db.collection("socialPosts").doc(id);
        const existing = await ref.get();

        if (!existing.exists) {
            return NextResponse.json(
                { success: false, error: "Post not found" },
                { status: 404 }
            );
        }


        // if ("likeAction" in body && body.likeAction && "userId" in body && body.userId) {
        //     const { likeAction, userId } = body as { likeAction: "like" | "unlike"; userId: string };
        //     await ref.update({
        //         likes: FieldValue.increment(likeAction === "like" ? 1 : -1),
        //         likedBy: likeAction === "like"
        //             ? FieldValue.arrayUnion(userId)
        //             : FieldValue.arrayRemove(userId),
        //         updatedAt: Date.now(),
        //     });
        //     const updated = await ref.get();
        //     return NextResponse.json({ success: true, data: { id: updated.id, ...updated.data() } });
        // }
        // AFTER — destructure reaction and write it via dot-notation
        if ("likeAction" in body && body.likeAction && "userId" in body && body.userId) {
            const { likeAction, userId, reaction } = body as {
                likeAction: "like" | "unlike";
                userId: string;
                reaction?: string;
            };

            await ref.update({
                likes: FieldValue.increment(likeAction === "like" ? 1 : -1),
                likedBy: likeAction === "like"
                    ? FieldValue.arrayUnion(userId)
                    : FieldValue.arrayRemove(userId),
                // dot-notation writes/deletes a single key inside the reactions map
                [`reactions.${userId}`]: likeAction === "like" && reaction
                    ? reaction
                    : FieldValue.delete(),
                updatedAt: Date.now(),
            });

            const updated = await ref.get();
            return NextResponse.json({ success: true, data: { id: updated.id, ...updated.data() } });
        }
        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        if (body.content !== undefined) updates.content = body.content;
        if (body.media !== undefined) updates.media = body.media;
        if (body.poll !== undefined) updates.poll = body.poll;

        await ref.update(updates);
        const updated = await ref.get();

        return NextResponse.json({ success: true, data: { id: updated.id, ...updated.data() } });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}


// DELETE  /api/posts/[id]
export async function DELETE(req: NextRequest) {
    const url = new URL(req.url);
    console.log("Full URL:", req.url);
    console.log("Pathname:", url.pathname);

    const id = getIdFromUrl(req);
    console.log("Extracted ID:", id);

    if (!id) {
        return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    try {
        const ref = db.collection("socialPosts").doc(id);
        const existing = await ref.get();

        if (!existing.exists) {
            return NextResponse.json(
                { success: false, error: "Post not found" },
                { status: 404 }
            );
        }

        await ref.delete();
        return NextResponse.json({ success: true, message: "Post deleted successfully" });
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unexpected error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}