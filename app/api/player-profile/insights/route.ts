import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// ─── POST: Create Insights & Strengths 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerProfilesId, insights, strengths } = body;

    if (!playerProfilesId) {
      return NextResponse.json(
        { success: false, message: "PlayerProfileId is required" },
        { status: 400 }
      );
    }

    // Validate insights array
    const sanitizedInsights = (insights || []).map(
      (item: { title: string; description: string }) => ({
        title: item.title || "",
        description: item.description || "",
      })
    );

    // Validate strengths array (array of strings)
    const sanitizedStrengths = (strengths || []).filter(
      (s: unknown) => typeof s === "string" && s.trim().length > 0
    );

    const insightsData = {
      playerProfilesId,
      insights: sanitizedInsights,
      strengths: sanitizedStrengths,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection("playerInsights").add(insightsData);

    return NextResponse.json({
      success: true,
      insightsDoc: { id: docRef.id, ...insightsData },
    });
  } catch (error) {
    console.error("Create insights error:", error);
    return NextResponse.json(
      { success: false, message: "Create failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}









export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerProfileId = searchParams.get("playerProfileId");
    const limit = parseInt(searchParams.get("limit") || "20");
    const lastDocId = searchParams.get("lastDocId");
    const lastDocCreatedAt = searchParams.get("lastDocCreatedAt");

    let query: FirebaseFirestore.Query = db.collection("playerInsights");

    if (playerProfileId) {
      query = query.where("playerProfileId", "==", playerProfileId);
    }

    query = query.orderBy("createdAt", "desc").limit(limit);

    // Use cursor-based pagination instead of offset
    if (lastDocId && lastDocCreatedAt) {
      const lastDocRef = db.collection("playerInsights").doc(lastDocId);
      const lastDoc = await lastDocRef.get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }

    const snapshot = await query.get();

    const insightsDocs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get last document for next page cursor
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      insightsDocs,
      pagination: {
        limit,
        hasMore: insightsDocs.length === limit,
        nextCursor: insightsDocs.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocCreatedAt: lastDoc?.data()?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Fetch insights error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}