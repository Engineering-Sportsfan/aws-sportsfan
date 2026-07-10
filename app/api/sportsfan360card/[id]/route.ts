// app/api/sportsfan360card/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";

// Define the Drop type
interface Drop {
  id: string;
  title: string;
  url: string;
}

// Helper: extract ID from URL
function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET - Fetch single profile by ID
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Profile ID is required" },
        { status: 400 }
      );
    }

    const docRef = db.collection("Sportsfan360Profile").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    const profile = {
      id: doc.id,
      ...doc.data(),
    };

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error("Fetch profile error:", error);
    
    let errorMessage = "Fetch failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { success: false, message: `Fetch failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// PUT - Update profile by ID
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Profile ID is required" },
        { status: 400 }
      );
    }

    const formData = await req.formData();

    const name = formData.get("name") as string;
    const about = formData.get("about") as string;
    const dropsJson = formData.get("drops") as string;
    const existingAvatar = formData.get("existingAvatar") as string;

    // Parse drops from JSON string
    let drops: Drop[] = [];
    if (dropsJson) {
      try {
        drops = JSON.parse(dropsJson);
      } catch (e) {
        console.error("Failed to parse drops JSON", e);
      }
    }

    // Files
    const avatarFile = formData.get("avatar") as File | null;

    if (!name) {
      return NextResponse.json(
        { success: false, message: "name is required" },
        { status: 400 }
      );
    }

    // Check if profile exists
    const docRef = db.collection("Sportsfan360Profile").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    // Upload avatar or use existing
    let avatarUrl = existingAvatar || "";
    if (avatarFile) {
      const bytes = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${avatarFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "club-profiles/avatars",
        public_id: `${Date.now()}-${avatarFile.name.replace(/\s/g, "_")}`,
      });
      avatarUrl = uploadRes.secure_url;
      
      // If there's an old avatar and it's not the default, delete it from Cloudinary
      const oldData = doc.data();
      if (oldData?.avatar && oldData.avatar !== existingAvatar) {
        try {
          const publicId = oldData.avatar.split("/").pop()?.split(".")[0];
          if (publicId) {
            await cloudinary.uploader.destroy(`club-profiles/avatars/${publicId}`);
          }
        } catch (deleteError) {
          console.error("Failed to delete old avatar:", deleteError);
        }
      }
    }

    const updateData = {
      name,
      nameLower: name.toLowerCase(), // For case-insensitive search
      about: about || "",
      avatar: avatarUrl,
      drops: drops || [],
      updatedAt: Date.now(),
    };

    await docRef.update(updateData);

    return NextResponse.json({
      success: true,
      profile: { id: docRef.id, ...updateData },
    });
  } catch (error) {
    console.error("Update Sportsfan360 profile error:", error);
    
    let errorMessage = "Update failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { success: false, message: `Update failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

// DELETE - Delete profile by ID
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Profile ID is required" },
        { status: 400 }
      );
    }

    const docRef = db.collection("Sportsfan360Profile").doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    // Delete avatar from Cloudinary if it exists
    const data = doc.data();
    if (data?.avatar) {
      try {
        // Extract public ID from URL
        const urlParts = data.avatar.split("/");
        const filename = urlParts[urlParts.length - 1];
        const publicId = `club-profiles/avatars/${filename.split(".")[0]}`;
        await cloudinary.uploader.destroy(publicId);
      } catch (deleteError) {
        console.error("Failed to delete avatar from Cloudinary:", deleteError);
        // Continue with profile deletion even if avatar deletion fails
      }
    }

    // Delete the profile document
    await docRef.delete();

    return NextResponse.json({
      success: true,
      message: `Profile ${id} deleted successfully`,
    });
  } catch (error) {
    console.error("Delete Sportsfan360 profile error:", error);
    
    let errorMessage = "Delete failed";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { success: false, message: `Delete failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}