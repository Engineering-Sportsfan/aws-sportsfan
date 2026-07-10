// Admin Panel: app/api/audio-messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// POST - User sends message
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { audioId, audioTitle, userId, userName, message, rating } = body;

        const messageData = {
            audioId,
            audioTitle,
            userId,
            userName: userName || "Anonymous",
            message,
            rating: rating || null,
            createdAt: Date.now(),
            isRead: false,
            isFlagged: false,
        };

        const docRef = await db.collection("audioMessages").add(messageData);

        return NextResponse.json({
            success: true,
            message: { id: docRef.id, ...messageData }
        });
    } catch (error: unknown) {
        console.log("audio-message POST error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to save message" },
            { status: 500 }
        );
    }
}

// // GET - Fetch messages with filters
// export async function GET(req: NextRequest) {
//     try {
//         const { searchParams } = new URL(req.url);
//         const status = searchParams.get("status"); // 'unread', 'flagged', or null for all
//         const limit = parseInt(searchParams.get("limit") || "100");

//         // Always fetch all messages ordered by createdAt
//         // Then filter in JS to avoid Firestore composite index requirement
//         const snapshot = await db
//             .collection("audioMessages")
//             .orderBy("createdAt", "desc")
//             .limit(limit)
//             .get();

//         let messages = snapshot.docs.map(doc => ({
//             id: doc.id,
//             ...doc.data()
//         })) as Array<{
//             id: string;
//             isRead: boolean;
//             isFlagged: boolean;
//             audioId: string;
//             [key: string]: unknown;
//         }>;

//         // Compute stats BEFORE filtering
//         const stats = {
//             total: messages.length,
//             unread: messages.filter(m => !m.isRead).length,
//             flagged: messages.filter(m => m.isFlagged).length,
//             totalAudios: new Set(messages.map(m => m.audioId)).size
//         };

//         // Apply filter AFTER computing stats
//         if (status === "unread") {
//             messages = messages.filter(m => !m.isRead);
//         } else if (status === "flagged") {
//             messages = messages.filter(m => m.isFlagged);
//         }

//         return NextResponse.json({
//             success: true,
//             messages,
//             stats,
//             count: messages.length
//         });
//     } catch (error: unknown) {
//         console.log("audio-message GET error:", error);
//         return NextResponse.json(
//             { success: false, message: "Failed to fetch messages" },
//             { status: 500 }
//         );
//     }
// }




// GET - Fetch messages with filters
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const audioId = searchParams.get("audioId");        // ← ADD THIS
        const countOnly = searchParams.get("count") === "true"; // ← ADD THIS
        const limit = parseInt(searchParams.get("limit") || "100");

       let query: FirebaseFirestore.Query = db.collection("audioMessages");

        if (audioId) {
            query = query.where("audioId", "==", audioId) as typeof query;
        }

       query = query.orderBy("createdAt", "desc").limit(limit);


        const snapshot = await query.limit(limit).get();

        let messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as Array<{
            id: string;
            isRead: boolean;
            isFlagged: boolean;
            audioId: string;
            [key: string]: unknown;
        }>;

        const stats = {
            total: messages.length,
            unread: messages.filter(m => !m.isRead).length,
            flagged: messages.filter(m => m.isFlagged).length,
            totalAudios: new Set(messages.map(m => m.audioId)).size
        };

        if (status === "unread") {
            messages = messages.filter(m => !m.isRead);
        } else if (status === "flagged") {
            messages = messages.filter(m => m.isFlagged);
        }

        // ← ADD THIS: return just the count when count=true is passed
        if (countOnly) {
            return NextResponse.json({
                success: true,
                count: messages.length
            });
        }

        return NextResponse.json({
            success: true,
            signals: messages, // ← also expose as "signals" for AudioDrop.tsx
            messages,
            stats,
            count: messages.length
        });
    } catch (error: unknown) {
        console.log("audio-message GET error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch messages" },
            { status: 500 }
        );
    }
}

// PATCH - Update message status (mark as read/unread, flag/unflag)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { messageId, isRead, isFlagged } = body;

        console.log("PATCH request:", { messageId, isRead, isFlagged });

        if (!messageId) {
            return NextResponse.json(
                { success: false, message: "messageId is required" },
                { status: 400 }
            );
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = { updatedAt: Date.now() };
        if (isRead !== undefined) updateData.isRead = isRead;
        if (isFlagged !== undefined) updateData.isFlagged = isFlagged;

        await db.collection("audioMessages").doc(messageId).update(updateData);

        // Return the updated document so frontend can sync state
        const updatedDoc = await db.collection("audioMessages").doc(messageId).get();
        const updatedMessage = { id: updatedDoc.id, ...updatedDoc.data() };

        return NextResponse.json({
            success: true,
            message: "Message updated successfully",
            updatedMessage
        });
    } catch (error: unknown) {
        console.log("audio-message PATCH error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to update message" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a message
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const messageId = searchParams.get("messageId");

        if (!messageId) {
            return NextResponse.json(
                { success: false, message: "messageId is required" },
                { status: 400 }
            );
        }

        await db.collection("audioMessages").doc(messageId).delete();

        return NextResponse.json({
            success: true,
            message: "Message deleted successfully"
        });
    } catch (error: unknown) {
        console.log("audio-message DELETE error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to delete message" },
            { status: 500 }
        );
    }
}