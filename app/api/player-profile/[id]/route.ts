import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";

// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

// export async function GET(req: NextRequest) {
//   try {
//     const id   = getIdFromUrl(req);
// console.log("id",id)
//     if (!id) {
//       return NextResponse.json({ error: "ID required" }, { status: 400 });
//     }

//     const doc = await db.collection("playerProfiles").doc(id).get();
//     if (!doc.exists) {
//       return NextResponse.json(
//         { success: false, message: "Profile not found" },
//         { status: 404 }
//       );
//     }
//     return NextResponse.json({ success: true, profile: { id: doc.id, ...doc.data() } });
//   } catch (error) {
//     return NextResponse.json(
//       { success: false, message: "Fetch failed: " + (error as Error).message },
//       { status: 500 }
//     );
//   }
// }

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    console.log("Full URL:", req.url);
    console.log("Pathname:", url.pathname);

    const id = getIdFromUrl(req);
    console.log("Extracted ID:", id);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    //  FIX: Use "PlayerProfiles" (capital P) instead of "playerProfiles"
    console.log("Checking collection: PlayerProfiles");
    const doc = await db.collection("PlayerProfiles").doc(id).get();
    console.log("Document exists:", doc.exists);
    console.log("Document data:", doc.data());

    if (!doc.exists) {
      return NextResponse.json(
        {
          success: false,
          message: "Profile not found",
          debug: {
            requestedId: id,
          }
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, profile: { id: doc.id, ...doc.data() } });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const formData = await req.formData();

    const existing = await db.collection("PlayerProfiles").doc(id).get();
    if (!existing.exists) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    const existingData = existing.data() as Record<string, unknown>;

    const name = formData.get("name") as string;
    const team = formData.get("team") as string;
    const battingStyle = formData.get("battingStyle") as string;
    const bowlingStyle = formData.get("bowlingStyle") as string;
    const about = formData.get("about") as string;
    const statsRuns = formData.get("statsRuns") as string;
    const statsSr = formData.get("statsSr") as string;
    const statsAvg = formData.get("statsAvg") as string;
    const iplDebut = formData.get("iplDebut") as string;
    const specialization = formData.get("specialization") as string;
    const dob = formData.get("dob") as string;
    const matches = formData.get("matches") as string;
    const avatarFile = formData.get("avatar") as File | null;
    const avatarUrl = formData.get("avatarUrl") as string;

    // Upload new avatar only if provided
    let resolvedAvatarUrl = (existingData.avatar as string) || "";
    if (avatarUrl) {
      resolvedAvatarUrl = avatarUrl;
    } else if (avatarFile && avatarFile.size > 0) {
      const bytes = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${avatarFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "club-profiles/avatars",
        public_id: `${Date.now()}-${avatarFile.name.replace(/\s/g, "_")}`,
      });
      resolvedAvatarUrl = uploadRes.secure_url;
    }

    const updateData = {
      name: name || existingData.name,
      team: team || existingData.team,
      battingStyle: battingStyle ?? existingData.battingStyle,
      bowlingStyle: bowlingStyle ?? existingData.bowlingStyle,
      about: about ?? existingData.about,
      avatar: resolvedAvatarUrl,
      stats: {
        runs: statsRuns || (existingData.stats as Record<string, string>)?.runs || "0",
        sr: statsSr || (existingData.stats as Record<string, string>)?.sr || "0",
        avg: statsAvg || (existingData.stats as Record<string, string>)?.avg || "0",
      },
      overview: {
        iplDebut: iplDebut || (existingData.overview as Record<string, string>)?.iplDebut || "",
        specialization: specialization || (existingData.overview as Record<string, string>)?.specialization || "",
        dob: dob || (existingData.overview as Record<string, string>)?.dob || "",
        matches: matches || (existingData.overview as Record<string, string>)?.matches || "",
      },
      updatedAt: Date.now(),
    };

    await db.collection("PlayerProfiles").doc(id).update(updateData);

    return NextResponse.json({
      success: true,
      profile: { id: id, ...existingData, ...updateData },
    });
  } catch (error) {
    console.error("Update player profile error:", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}

//  DELETE: Remove Club Profile 
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    const doc = await db.collection("PlayerProfiles").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }
    await db.collection("PlayerProfiles").doc(id).delete();
    return NextResponse.json({ success: true, message: "Profile deleted" });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}