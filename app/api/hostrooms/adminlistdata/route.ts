import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";


interface FirestoreError extends Error {
  message: string;
  code?: string;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("id");
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const lastDocId = searchParams.get("lastDocId");

    // Case 1: Fetch single room by ID
    if (roomId) {
      const docRef = db.collection("rooms").doc(roomId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return NextResponse.json(
          { success: false, error: "Room not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        room: { id: doc.id, ...doc.data() },
      });
    }

    // Case 2: Fetch rooms for a specific user (for host dashboard)
    if (userId) {
      try {
        let query = db
          .collection("rooms")
          .where("userId", "==", userId);
        
        query = query.orderBy("updatedAt", "desc");
        
        const snapshot = await query.get();

        const rooms = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        return NextResponse.json({
          success: true,
          rooms,
          total: rooms.length,
        });
      } catch (queryError: unknown) {
        const error = queryError as FirestoreError;
        // Handle missing index error
        if (error.message?.includes("index")) {
          const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
          const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null;
          return NextResponse.json({
            success: false,
            error: "Please create the required Firestore index",
            indexUrl: indexUrl,
            message: error.message
          }, { status: 400 });
        }
        throw queryError;
      }
    }

    // Case 3: Admin Panel - Fetch ALL rooms (no userId filter)
    let query: FirebaseFirestore.Query = db.collection("rooms");

    // Add filters
    if (status && status !== "all") {
      query = query.where("status", "==", status);
    }

    // Add ordering - this may require an index if combined with where
    query = query.orderBy("updatedAt", "desc");

    // Pagination
    if (lastDocId) {
      const lastDocRef = db.collection("rooms").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.limit(limit).get();

    const rooms = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      rooms,
      pagination: {
        limit,
        hasMore: rooms.length === limit,
        nextCursor: rooms.length === limit ? lastDoc?.id : null,
      },
      total: rooms.length,
    });

  } catch (error: unknown) {
    console.error("[rooms GET] Error:", error);
    
    const firestoreError = error as FirestoreError;
    
    // Handle specific Firestore errors
    if (firestoreError.message?.includes("index")) {
      const indexUrlMatch = firestoreError.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
      const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null;
      return NextResponse.json({
        success: false,
        error: "Firestore index required. Please create the following index:",
        message: firestoreError.message,
        indexUrl: indexUrl
      }, { status: 400 });
    }
    
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}