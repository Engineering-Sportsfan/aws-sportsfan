// // api/roar/rooms/[roomId]/messages/[msgId]/comments/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from "firebase-admin/firestore";
// import { getUser } from "@/lib/getUser";
// import { notifyRoomMessageComment } from "@/lib/roarNotifyHelpers";

// // ─── GET ──────────────────────────────────────────────────────────────────────
// export async function GET(
//     req: NextRequest,
//     { params }: { params: { roomId: string; msgId: string } }
// ) {
//     try {
//         const { roomId, msgId } = params;
//         const { searchParams } = new URL(req.url);
//         const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

//         const snap = await db
//             .collection("roarRooms")
//             .doc(roomId)
//             .collection("messages")
//             .doc(msgId)
//             .collection("comments")
//             .orderBy("createdAt", "desc")
//             .limit(limit)
//             .get();

//         const comments = snap.docs.map((doc) => ({
//             id: doc.id,
//             commentId: doc.id,
//             ...doc.data(),
//         }));

//         return NextResponse.json({ success: true, comments });
//     } catch (err) {
//         const msg = err instanceof Error ? err.message : "Unexpected error";
//         return NextResponse.json({ error: msg }, { status: 500 });
//     }
// }

// // ─── POST ─────────────────────────────────────────────────────────────────────
// export async function POST(
//     req: NextRequest,
//     { params }: { params: { roomId: string; msgId: string } }
// ) {
//     try {
//         const user = await getUser(req);
//         if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

//         const { roomId, msgId } = params;
//         const body = await req.json();
//         const text: string = (body.text ?? "").trim();
//         if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

//         const { username, avatarUrl, badge } = await resolveUserInfo(user.userId, user.name, user.email);
//         const now = Date.now();

//         const commentRef = db
//             .collection("roarRooms")
//             .doc(roomId)
//             .collection("messages")
//             .doc(msgId)
//             .collection("comments")
//             .doc();

//         await commentRef.set({
//             commentId: commentRef.id,
//             text,
//             authorUid: user.userId,
//             authorEmail: user.email,
//             authorUsername: username,
//             authorAvatarUrl: avatarUrl,
//             authorBadge: badge,
//             createdAt: now,
//             roomId,
//         });

//         // Increment replyCount on the message
//         db.collection("roarRooms")
//             .doc(roomId)
//             .collection("messages")
//             .doc(msgId)
//             .update({ replyCount: FieldValue.increment(1) })
//             .catch(() => { });

//         // Notify post author
//         notifyRoomMessageComment(roomId, msgId, user.userId, user.email, username, text.slice(0, 80)).catch(() => { });

//         return NextResponse.json({
//             success: true,
//             commentId: commentRef.id,
//             comment: {
//                 id: commentRef.id,
//                 commentId: commentRef.id,
//                 text,
//                 authorUid: user.userId,
//                 authorUsername: username,
//                 authorAvatarUrl: avatarUrl,  
//                 authorBadge: badge,
//                 roomId,
//                 createdAt: now,
//             },
//         });
//     } catch (err) {
//         const msg = err instanceof Error ? err.message : "Unexpected error";
//         return NextResponse.json({ error: msg }, { status: 500 });
//     }
// }

// async function resolveUserInfo(userId: string, name: string, email: string): Promise<{
//     username: string;
//     avatarUrl: string | null;
//     badge: string | null;
// }> {
//     try {
//         const snap = await db.collection("users").doc(userId).get();
//         if (snap.exists) {
//             const d = snap.data()!;
//             return {
//                 username: (d.username as string) || name || email.split("@")[0],
//                 avatarUrl: (d.avatarUrl as string) ?? null,
//                 badge: (d.badge as string) ?? null,
//             };
//         }
//     } catch { }
//     return { username: name || email.split("@")[0], avatarUrl: null, badge: null };
// }




// api/roar/rooms/[roomId]/messages/[msgId]/comments/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { notifyRoomMessageComment } from "@/lib/roarNotifyHelpers";
import { awardRoarPointsByReason } from "@/lib/roarPoints";

// Same resolution used by /rooms/[roomId]/messages — resolves the raw auth
// uid/email down to the canonical `users/{actualUserId}` doc id. Comments
// previously stored the raw `user.userId` as authorUid, which can diverge
// from that resolved doc id (e.g. sanitized-email ids like
// "henrique_henriqueccbneves_gmail_com"), so profile lookups from the reply
// section 404'd for some users while post-level profile lookups (which
// already went through this resolution) worked fine.
async function resolveCommentAuthorId(userId: string, email: string): Promise<string> {
    const info = await getUserInfo(userId, undefined, email);
    return info.exists ? info.actualUserId : userId;
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(
    req: NextRequest,
    { params }: { params: { roomId: string; msgId: string } }
) {
    try {
        const { roomId, msgId } = params;
        const { searchParams } = new URL(req.url);
        const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

        const snap = await db
            .collection("roarRooms")
            .doc(roomId)
            .collection("messages")
            .doc(msgId)
            .collection("comments")
            .orderBy("createdAt", "desc")
            .limit(limit)
            .get();

        // ── Batch-fetch live avatarUrl/badge per unique author, same pattern
        // as GET /rooms/[roomId]/messages — comment docs store a snapshot of
        // authorAvatarUrl at post time, which goes stale/missing if the user
        // didn't have an avatar yet when they commented.
        const authorMap = new Map<string, { avatarUrl: string | null; badge: string | null }>();
        const uniqueAuthorUids = Array.from(
            new Set(snap.docs.map((d) => (d.data() as any).authorUid).filter(Boolean))
        );
        const authorSnaps = await Promise.all(
            uniqueAuthorUids.map((uid) => db.collection("users").doc(uid).get())
        );
        uniqueAuthorUids.forEach((uid, i) => {
            const s = authorSnaps[i];
            const data = s.exists ? (s.data() as any) : null;
            authorMap.set(uid, {
                avatarUrl: data?.avatarUrl ?? null,
                badge: data?.badge ?? null,
            });
        });

        const comments = snap.docs.map((doc) => {
            const data = doc.data() as any;
            const author = authorMap.get(data.authorUid);
            return {
                id: doc.id,
                commentId: doc.id,
                ...data,
                authorAvatarUrl: author?.avatarUrl ?? data.authorAvatarUrl ?? null,
                authorBadge: author?.badge ?? data.authorBadge ?? null,
            };
        });

        return NextResponse.json({ success: true, comments });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

// ─── POST ─────────────────────────────────────────────────────────────────────
export async function POST(
    req: NextRequest,
    { params }: { params: { roomId: string; msgId: string } }
) {
    try {
        const user = await getUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { roomId, msgId } = params;
        const body = await req.json();
        const text: string = (body.text ?? "").trim();
        if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

        // const resolvedAuthorId = await resolveCommentAuthorId(user.userId, user.email);
        // const { username, avatarUrl, badge } = await resolveUserInfo(resolvedAuthorId, user.name, user.email);
        const info = await getUserInfo(user.userId, undefined, user.email);
        const resolvedAuthorId = info.exists ? info.actualUserId : user.userId;
        const { username, avatarUrl, badge } = await resolveUserInfo(resolvedAuthorId, user.name, user.email);
        const now = Date.now();

        let roomRef = db.collection("roarRooms").doc(roomId);
        let isWatchalongFallback = false;

        const msgSnap = await roomRef.collection("messages").doc(msgId).get();
        if (!msgSnap.exists) {
            const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
            const fallbackSnap = await fallbackRef.collection("messages").doc(msgId).get();
            if (fallbackSnap.exists) {
                roomRef = fallbackRef;
                isWatchalongFallback = true;
            } else {
                return NextResponse.json({ error: "Message not found" }, { status: 404 });
            }
        }

        const commentRef = roomRef
            .collection("messages")
            .doc(msgId)
            .collection("comments")
            .doc();

        await commentRef.set({
            commentId: commentRef.id,
            text,
            authorUid: resolvedAuthorId,
            authorEmail: user.email,
            authorUsername: username,
            authorAvatarUrl: avatarUrl,
            authorBadge: badge,
            createdAt: now,
            roomId,
        });

        let watchAlongRoomId = null;
        let roarRoomId = null;

        if (isWatchalongFallback) {
            watchAlongRoomId = roomId;
            const roarRoomSnap = await db.collection("roarRooms")
                .where("watchAlongRoomId", "==", roomId)
                .limit(1)
                .get();
            if (!roarRoomSnap.empty) {
                roarRoomId = roarRoomSnap.docs[0].id;
            }
        } else {
            roarRoomId = roomId;
            const roarRoomDoc = await db.collection("roarRooms").doc(roomId).get();
            if (roarRoomDoc.exists) {
                watchAlongRoomId = roarRoomDoc.data()?.watchAlongRoomId ?? null;
            }
        }

        awardRoarPointsByReason({
            actualUserId: resolvedAuthorId,
            authUserId: user.userId,
            userName: username,
            userEmail: user.email,
            userExists: info.exists,
            reason: "ROAR_COMMENT",
            points: 8, // §3 updated Comment value
            transactionId: `comment_${commentRef.id}`,
            metadata: {
                roomId,
                msgId,
                commentId: commentRef.id,
                watchAlongRoomId,
                roarRoomId
            },
        }).catch(() => { });

        // Increment replyCount on the message
        roomRef
            .collection("messages")
            .doc(msgId)
            .update({ replyCount: FieldValue.increment(1) })
            .catch(() => { });

        // Notify post author
        notifyRoomMessageComment(roomId, msgId, resolvedAuthorId, user.email, username, text.slice(0, 80)).catch(() => { });

        return NextResponse.json({
            success: true,
            commentId: commentRef.id,
            comment: {
                id: commentRef.id,
                commentId: commentRef.id,
                text,
                authorUid: resolvedAuthorId,
                authorUsername: username,
                authorAvatarUrl: avatarUrl,
                authorBadge: badge,
                roomId,
                createdAt: now,
            },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Unexpected error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

async function resolveUserInfo(userId: string, name: string, email: string): Promise<{
    username: string;
    avatarUrl: string | null;
    badge: string | null;
}> {
    try {
        const snap = await db.collection("users").doc(userId).get();
        if (snap.exists) {
            const d = snap.data()!;
            return {
                username: (d.username as string) || name || email.split("@")[0],
                avatarUrl: (d.avatarUrl as string) ?? null,
                badge: (d.badge as string) ?? null,
            };
        }
    } catch { }
    return { username: name || email.split("@")[0], avatarUrl: null, badge: null };
}