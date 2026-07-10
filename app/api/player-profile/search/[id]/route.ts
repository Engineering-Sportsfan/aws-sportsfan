import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";


function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null
}

// ─── GET: Single Season 
export async function GET(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
   
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Player profile id required" },
        { status: 400 }
      );
    }

    const [
      profileSnap,
      homeSnap,
      seasonSnap,
      insightsSnap,
      mediaSnap,
    ] = await Promise.all([
      // 1️ Profile
      db.collection("PlayerProfiles").doc(id).get(),

      // 2️ Home
      db
        .collection("playershome")
        .where("playerProfilesId", "==", id)
        .orderBy("createdAt", "desc")
        .get(),

      // 3️ Season
      db
        .collection("playerSeasons")
        .where("playerProfilesId", "==", id)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get(),

      // 4️ Insights
      db
        .collection("playerInsights")
        .where("playerProfilesId", "==", id)
        .limit(1)
        .get(),

      // 5️ Media
      db
        .collection("playerMedia")
        .where("playerProfileId", "==", id)
        .orderBy("createdAt", "desc")
        .limit(1)
        .get(),
    ]);

    const profile = profileSnap.exists
      ? { id: profileSnap.id, ...profileSnap.data() }
      : null;

    // const home = !homeSnap.empty
    //   ? {
    //       id: homeSnap.docs[0].id,
    //       ...homeSnap.docs[0].data(),
    //     }
    //   : null;
    const home = !homeSnap.empty
  ? homeSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
  : [];

    const season = !seasonSnap.empty
      ? {
          id: seasonSnap.docs[0].id,
          ...seasonSnap.docs[0].data(),
        }
      : null;

    const insights = !insightsSnap.empty
      ? {
          id: insightsSnap.docs[0].id,
          ...insightsSnap.docs[0].data(),
        }
      : null;

    const media = !mediaSnap.empty
      ? {
          id: mediaSnap.docs[0].id,
          ...mediaSnap.docs[0].data(),
        }
      : null;

    return NextResponse.json({
      success: true,
      data: {
        profile,
        home,
        season,
        insights,
        media,
      },
    });
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : "Unexpected error";

    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}



export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Player profile id required" },
        { status: 400 }
      );
    }

    // Check if profile exists
    const profileRef = db.collection("PlayerProfiles").doc(id);
    const profileSnap = await profileRef.get();

    if (!profileSnap.exists) {
      return NextResponse.json(
        { success: false, message: "Player profile not found" },
        { status: 404 }
      );
    }

    // Get all related documents to delete
    const [
      homeSnap,
      seasonSnap,
      insightsSnap,
      mediaSnap,
    ] = await Promise.all([
      db
        .collection("playershome")
        .where("playerProfilesId", "==", id)
        .get(),
      db
        .collection("playerSeasons")
        .where("playerProfilesId", "==", id)
        .get(),
      db
        .collection("playerInsights")
        .where("playerProfilesId", "==", id)
        .get(),
      db
        .collection("playerMedia")
        .where("playerProfileId", "==", id)
        .get(),
    ]);

    // Delete all related documents in batches using Promise.all with proper typing
    const deleteOperations = [
      // Delete home documents
      ...homeSnap.docs.map((doc) => db.collection("playershome").doc(doc.id).delete()),
      // Delete season documents
      ...seasonSnap.docs.map((doc) => db.collection("playerSeasons").doc(doc.id).delete()),
      // Delete insights documents
      ...insightsSnap.docs.map((doc) => db.collection("playerInsights").doc(doc.id).delete()),
      // Delete media documents
      ...mediaSnap.docs.map((doc) => db.collection("playerMedia").doc(doc.id).delete()),
    ];

    // Wait for all related documents to be deleted
    await Promise.all(deleteOperations);

    // Finally, delete the main profile
    await profileRef.delete();

    return NextResponse.json({
      success: true,
      message: "Player profile and all related data deleted successfully",
      deleted: {
        profile: 1,
        home: homeSnap.size,
        seasons: seasonSnap.size,
        insights: insightsSnap.size,
        media: mediaSnap.size,
      },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[DELETE Player Profile Error]:", error);
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}