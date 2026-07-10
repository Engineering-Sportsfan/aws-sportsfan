// \api\roar\rooms\[roomId]\messages\[msgId]\comments\[commentId]\reactions\route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

export async function GET(
    req: NextRequest,
    { params }: { params: { roomId: string; msgId: string; commentId: string } }
) {
    try {
        const user = await getUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { roomId, msgId, commentId } = params;
        const commentRef = db
            .collection("roarRooms").doc(roomId)
            .collection("messages").doc(msgId)
            .collection("comments").doc(commentId);

        const snap = await commentRef.get();
        if (!snap.exists) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

        const likesSnap = await commentRef.collection("likes").orderBy("reactedAt", "desc").limit(100).get();
        if (likesSnap.empty) return NextResponse.json({ success: true, reactors: [], total: 0 });

        const userIds = likesSnap.docs.map(d => d.id);
        const profileSnaps = await Promise.all(userIds.map(uid => db.collection("users").doc(uid).get()));

        const reactors = likesSnap.docs.map((d, idx) => {
            const likeData = d.data() as { reaction?: string; reactedAt?: number };
            const profile = profileSnaps[idx].data() as { username?: string; avatarUrl?: string; badge?: string } | undefined;
            return {
                userId: d.id,
                username: profile?.username ?? d.id,
                avatarUrl: profile?.avatarUrl ?? undefined,
                badge: profile?.badge ?? "RISING_FAN",
                reaction: likeData.reaction ?? "heart",
                reactedAt: likeData.reactedAt ?? 0,
            };
        });

        return NextResponse.json({ success: true, reactors, total: reactors.length });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}