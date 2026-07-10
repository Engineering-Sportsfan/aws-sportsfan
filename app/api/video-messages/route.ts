import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Add this interface
interface VideoMessage {
    id: string;
    videoId: string;
    videoTitle: string;
    userId: string;
    userName: string;
    message: string;
    rating: number | null;
    createdAt: number;
    isRead: boolean;
    isFlagged: boolean;
}

// POST - User sends message
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { videoId, videoTitle, userId, userName, message, rating } = body;

        const messageData = {
            videoId,
            videoTitle,
            userId,
            userName: userName || "Anonymous",
            message,
            rating: rating || null,
            createdAt: Date.now(),
            isRead: false,
            isFlagged: false,
        };

        const docRef = await db.collection("videoMessages").add(messageData);

        return NextResponse.json({
            success: true,
            message: { id: docRef.id, ...messageData }
        });
    } catch (error: unknown) {
        console.error("video-message POST error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to save message" },
            { status: 500 }
        );
    }
}

// GET - Fetch messages with filters
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const videoId = searchParams.get("videoId");
        const countOnly = searchParams.get("count") === "true";
        const limit = parseInt(searchParams.get("limit") || "100");

        let query: FirebaseFirestore.Query = db.collection("videoMessages");

        if (videoId) {
            query = query.where("videoId", "==", videoId);
        }

        // Remove orderBy temporarily - sort on client side instead
        // query = query.orderBy("createdAt", "desc");
        
        if (!countOnly) {
            query = query.limit(limit);
        }

        const snapshot = await query.get();

        // Type assertion to fix TypeScript errors
        let messages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        })) as VideoMessage[];

        // Sort client-side
        messages.sort((a, b) => b.createdAt - a.createdAt);

        if (status === "unread") {
            messages = messages.filter(m => !m.isRead);
        } else if (status === "flagged") {
            messages = messages.filter(m => m.isFlagged);
        }

        if (countOnly) {
            return NextResponse.json({
                success: true,
                count: messages.length
            });
        }

        const stats = {
            total: messages.length,
            unread: messages.filter(m => !m.isRead).length,
            flagged: messages.filter(m => m.isFlagged).length,
            totalVideos: new Set(messages.map(m => m.videoId)).size
        };

        return NextResponse.json({
            success: true,
            signals: messages,
            messages,
            stats,
            count: messages.length
        });
    } catch (error: unknown) {
        console.error("video-message GET error:", error);
        return NextResponse.json(
            { 
                success: false, 
                message: "Failed to fetch messages",
                error: error instanceof Error ? error.message : "Unknown error"
            },
            { status: 500 }
        );
    }
}

// PATCH - Update message status
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

        const updateData: Partial<Omit<VideoMessage, 'id'>> & { updatedAt?: number } = { updatedAt: Date.now() };
        if (isRead !== undefined) updateData.isRead = isRead;
        if (isFlagged !== undefined) updateData.isFlagged = isFlagged;

        await db.collection("videoMessages").doc(messageId).update(updateData);

        const updatedDoc = await db.collection("videoMessages").doc(messageId).get();
        const updatedMessage = { id: updatedDoc.id, ...updatedDoc.data() } as VideoMessage;

        return NextResponse.json({
            success: true,
            message: "Message updated successfully",
            updatedMessage
        });
    } catch (error: unknown) {
        console.error("video-message PATCH error:", error);
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

        await db.collection("videoMessages").doc(messageId).delete();

        return NextResponse.json({
            success: true,
            message: "Message deleted successfully"
        });
    } catch (error: unknown) {
        console.error("video-message DELETE error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to delete message" },
            { status: 500 }
        );
    }
}