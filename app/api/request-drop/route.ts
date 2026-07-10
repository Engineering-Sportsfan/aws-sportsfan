// Admin Panel: app/api/request-drop/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// Define types
type RequestStatus = "pending" | "approved" | "rejected" | "completed";

interface RequestData {
    userName: string;
    message: string;
    audioTitle: string | null;
    userId: string | null;
    status: RequestStatus;
    createdAt: number;
    updatedAt: number;
    isRead: boolean;
    isFlagged: boolean;
}

// POST - User submits a drop request
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userName, message, audioTitle, userId } = body;

        if (!userName || !message) {
            return NextResponse.json(
                { success: false, message: "UserName and message are required" },
                { status: 400 }
            );
        }

        const requestData: RequestData = {
            userName: userName.trim(),
            message: message.trim(),
            audioTitle: audioTitle || null,
            userId: userId || null,
            status: "pending",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isRead: false,
            isFlagged: false,
        };

        const docRef = await db.collection("dropRequests").add(requestData);

        return NextResponse.json({
            success: true,
            request: { id: docRef.id, ...requestData }
        });
    } catch (error: unknown) {
        console.error("Request drop POST error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to submit request" },
            { status: 500 }
        );
    }
}

// GET - Fetch drop requests (with filters)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const limit = parseInt(searchParams.get("limit") || "50");
        
        let query: FirebaseFirestore.Query = db.collection("dropRequests")
            .orderBy("createdAt", "desc");

        if (status && status !== "all") {
            query = query.where("status", "==", status);
        }

        const snapshot = await query.limit(limit).get();
        
        const requests = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        const allRequestsSnapshot = await db.collection("dropRequests").get();
        const allRequests = allRequestsSnapshot.docs;
        
        const stats = {
            total: allRequests.length,
            pending: allRequests.filter(doc => doc.data().status === "pending").length,
            approved: allRequests.filter(doc => doc.data().status === "approved").length,
            rejected: allRequests.filter(doc => doc.data().status === "rejected").length,
            completed: allRequests.filter(doc => doc.data().status === "completed").length,
        };

        return NextResponse.json({ 
            success: true, 
            requests,
            stats,
            count: requests.length
        });
    } catch (error: unknown) {
        console.error("Request drop GET error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch requests" },
            { status: 500 }
        );
    }
}

// PATCH - Update request status (admin only)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { requestId, status, adminNote } = body;

        // Validate requestId
        if (!requestId || typeof requestId !== 'string') {
            return NextResponse.json(
                { success: false, message: "Valid requestId is required" },
                { status: 400 }
            );
        }

        // Validate status if provided
        const validStatuses: RequestStatus[] = ["pending", "approved", "rejected", "completed"];
        if (status && !validStatuses.includes(status as RequestStatus)) {
            return NextResponse.json(
                { success: false, message: "Invalid status. Must be one of: pending, approved, rejected, completed" },
                { status: 400 }
            );
        }

        // Check if document exists before updating
        const docRef = db.collection("dropRequests").doc(requestId);
        const docSnapshot = await docRef.get();
        
        if (!docSnapshot.exists) {
            return NextResponse.json(
                { success: false, message: "Request not found" },
                { status: 404 }
            );
        }

        // Build update data - use a simple object literal instead of interface
        const updateData: {
            updatedAt: number;
            status?: RequestStatus;
            adminNote?: string;
        } = { 
            updatedAt: Date.now()
        };
        
        if (status) {
            updateData.status = status as RequestStatus;
        }
        
        if (adminNote !== undefined && adminNote !== null) {
            updateData.adminNote = adminNote;
        }

        // Perform update - convert to Firestore-compatible format
       await docRef.update(updateData as FirebaseFirestore.UpdateData<typeof updateData>);

        // Get updated document
        const updatedDoc = await docRef.get();
        const updatedRequest = { 
            id: updatedDoc.id, 
            ...updatedDoc.data() 
        };

        return NextResponse.json({
            success: true,
            message: `Request ${status ? `marked as ${status}` : 'updated'} successfully`,
            request: updatedRequest
        });

    } catch (error: unknown) {
        console.error("Request drop PATCH error:", error);
        
        const errorMessage = error instanceof Error ? error.message : "Failed to update request";
        
        return NextResponse.json(
            { 
                success: false, 
                message: errorMessage
            },
            { status: 500 }
        );
    }
}

// DELETE - Delete a request
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const requestId = searchParams.get("requestId");

        if (!requestId) {
            return NextResponse.json(
                { success: false, message: "requestId is required" },
                { status: 400 }
            );
        }

        // Check if document exists
        const docRef = db.collection("dropRequests").doc(requestId);
        const docSnapshot = await docRef.get();
        
        if (!docSnapshot.exists) {
            return NextResponse.json(
                { success: false, message: "Request not found" },
                { status: 404 }
            );
        }

        await docRef.delete();

        return NextResponse.json({
            success: true,
            message: "Request deleted successfully"
        });
    } catch (error: unknown) {
        console.error("Request drop DELETE error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to delete request" },
            { status: 500 }
        );
    }
}