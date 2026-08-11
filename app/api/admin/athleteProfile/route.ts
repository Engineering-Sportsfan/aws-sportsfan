import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Validates if a string is a valid JSON.
 */
function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * GET Handler
 * - If `?id=` is provided, fetches a single athlete profile for edit-mode pre-fill.
 * - Otherwise, fetches all athlete profiles (lighter-weight subset of fields for the list page).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      // Get single document
      const docSnap = await db.collection("athletesProfile").doc(id).get();
      if (!docSnap.exists) {
        return NextResponse.json({ success: false, error: "Athlete profile not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { id: docSnap.id, ...docSnap.data() } }, { status: 200 });
    } else {
      // List all documents (lightweight)
      const snapshot = await db.collection("athletesProfile").get();
      const list = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          country: data.country,
          sport: data.sport,
          image: data.image,
          isVerified: data.isVerified,
          fanImpactScore: data.fanImpactScore,
        };
      });
      return NextResponse.json({ success: true, data: list }, { status: 200 });
    }
  } catch (error: unknown) {
    console.error("Error in GET athleteProfile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST Handler
 * - Creates a new athlete profile document in the `athletesProfile` collection.
 * - Validates required Group A fields.
 * - Parses and validates Group B JSON fields.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name, country, flag, sport, age, image, isVerified, fansCount, height,
      weight, birthplace, dominantHand, coachName, yearsActiveSince,
      badges, fanImpactScore, fanImpactChangePercent, welcomeVideo,
      hubCounts, hubIsNew, currentSeason, medalCabinet, yAxisDomain, unit,
      // Group B (JSON strings)
      highlights, dropsContent, postsContent, cornerPosts, seasonalData,
      medalData, stats, radarData, coachImpactData, consistencyData,
      heatmapData, videosContent
    } = body;

    // Validate required fields
    if (!name || !country || !sport || age === undefined || !image) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, country, sport, age, image)" },
        { status: 400 }
      );
    }

    // Validate and Parse Group B JSON
    const groupBFields = { highlights, dropsContent, postsContent, cornerPosts, seasonalData, medalData, stats, radarData, coachImpactData, consistencyData, heatmapData, videosContent };
    const parsedGroupB: any = {};
    for (const [key, value] of Object.entries(groupBFields)) {
      if (value) {
        if (!isValidJSON(value)) {
          return NextResponse.json({ success: false, error: `Invalid JSON in ${key}` }, { status: 400 });
        }
        parsedGroupB[key] = JSON.parse(value);
      } else {
        parsedGroupB[key] = null;
      }
    }

    const newDoc = {
      name, country, flag: flag || "", sport, age: Number(age), image,
      isVerified: Boolean(isVerified), fansCount: fansCount || "",
      height: height || "", weight: weight || "", birthplace: birthplace || "",
      dominantHand: dominantHand || "", coachName: coachName || "",
      yearsActiveSince: yearsActiveSince || "",
      badges: badges || [],
      fanImpactScore: Number(fanImpactScore) || 0,
      fanImpactChangePercent: fanImpactChangePercent || "",
      welcomeVideo: welcomeVideo || null,
      hubCounts: hubCounts || null,
      hubIsNew: Boolean(hubIsNew),
      currentSeason: currentSeason || null,
      medalCabinet: medalCabinet || [],
      yAxisDomain: yAxisDomain || [0, 0],
      unit: unit || "",
      ...parsedGroupB,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("athletesProfile").add(newDoc);
    return NextResponse.json({ success: true, id: docRef.id }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding athlete profile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * PUT Handler
 * - Updates an existing document in `athletesProfile` by `id`.
 * - Validates inputs similarly to POST.
 * - Preserves `createdAt` but refreshes `updatedAt`.
 */
export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing document ID" }, { status: 400 });
    }

    const body = await req.json();
    const {
      name, country, flag, sport, age, image, isVerified, fansCount, height,
      weight, birthplace, dominantHand, coachName, yearsActiveSince,
      badges, fanImpactScore, fanImpactChangePercent, welcomeVideo,
      hubCounts, hubIsNew, currentSeason, medalCabinet, yAxisDomain, unit,
      // Group B (JSON strings)
      highlights, dropsContent, postsContent, cornerPosts, seasonalData,
      medalData, stats, radarData, coachImpactData, consistencyData,
      heatmapData, videosContent
    } = body;

    // Validate required fields
    if (!name || !country || !sport || age === undefined || !image) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, country, sport, age, image)" },
        { status: 400 }
      );
    }

    // Validate and Parse Group B JSON
    const groupBFields = { highlights, dropsContent, postsContent, cornerPosts, seasonalData, medalData, stats, radarData, coachImpactData, consistencyData, heatmapData, videosContent };
    const parsedGroupB: any = {};
    for (const [key, value] of Object.entries(groupBFields)) {
      if (value) {
        if (!isValidJSON(value)) {
          return NextResponse.json({ success: false, error: `Invalid JSON in ${key}` }, { status: 400 });
        }
        parsedGroupB[key] = JSON.parse(value);
      } else {
        parsedGroupB[key] = null;
      }
    }

    const docRef = db.collection("athletesProfile").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Athlete profile not found" }, { status: 404 });
    }

    const updateData = {
      name, country, flag: flag || "", sport, age: Number(age), image,
      isVerified: Boolean(isVerified), fansCount: fansCount || "",
      height: height || "", weight: weight || "", birthplace: birthplace || "",
      dominantHand: dominantHand || "", coachName: coachName || "",
      yearsActiveSince: yearsActiveSince || "",
      badges: badges || [],
      fanImpactScore: Number(fanImpactScore) || 0,
      fanImpactChangePercent: fanImpactChangePercent || "",
      welcomeVideo: welcomeVideo || null,
      hubCounts: hubCounts || null,
      hubIsNew: Boolean(hubIsNew),
      currentSeason: currentSeason || null,
      medalCabinet: medalCabinet || [],
      yAxisDomain: yAxisDomain || [0, 0],
      unit: unit || "",
      ...parsedGroupB,
      updatedAt: FieldValue.serverTimestamp(),
    };

    await docRef.update(updateData);
    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating athlete profile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE Handler
 * - Deletes an existing athlete profile by `id`.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing document ID" }, { status: 400 });
    }

    const docRef = db.collection("athletesProfile").doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ success: false, error: "Athlete profile not found" }, { status: 404 });
    }

    await docRef.delete();
    return NextResponse.json({ success: true, message: "Deleted successfully" }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting athlete profile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
