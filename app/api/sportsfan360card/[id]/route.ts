// app/api/sportsfan360card/[id]/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite, dualDelete } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface Drop {
  id: string;
  title: string;
  url: string;
}

function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// ─── GET: Fetch Single Profile by ID ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Profile ID is required" },
        { status: 400 }
      );
    }

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `PROFILE_SF360#${id}`,
            sk: "PROFILE#META",
          },
        })
      );
      if (getRes.Item) {
        const item = getRes.Item;
        return NextResponse.json({
          success: true,
          profile: {
            id: item.id || id,
            ...item,
          },
        });
      }
    } catch (e) {
      console.warn("[sportsfan360card [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const doc = await db.collection("Sportsfan360Profile").doc(id).get();
      if (doc.exists) {
        return NextResponse.json({
          success: true,
          profile: { id: doc.id, ...doc.data() },
        });
      }
    }

    return NextResponse.json(
      { success: false, message: "Profile not found" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Fetch profile error:", error);
    return NextResponse.json(
      { success: false, message: `Fetch failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

// ─── PUT: Update Profile by ID ───────────────────────────────────────────────
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

    let drops: Drop[] = [];
    if (dropsJson) {
      try {
        drops = JSON.parse(dropsJson);
      } catch (e) {
        console.error("Failed to parse drops JSON", e);
      }
    }

    const avatarFile = formData.get("avatar") as File | null;

    if (!name) {
      return NextResponse.json(
        { success: false, message: "name is required" },
        { status: 400 }
      );
    }

    let existingData: Record<string, unknown> = {};

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `PROFILE_SF360#${id}`,
            sk: "PROFILE#META",
          },
        })
      );
      if (getRes.Item) {
        existingData = getRes.Item as Record<string, unknown>;
      }
    } catch (e) {
      console.warn("[sportsfan360card [id] PUT] DynamoDB check:", e);
    }

    if (Object.keys(existingData).length === 0 && db) {
      const doc = await db.collection("Sportsfan360Profile").doc(id).get();
      if (doc.exists) {
        existingData = doc.data() as Record<string, unknown>;
      }
    }

    let avatarUrl = existingAvatar || (existingData.avatar as string) || "";
    if (avatarFile) {
      const bytes = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${avatarFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "club-profiles/avatars",
        public_id: `${Date.now()}-${avatarFile.name.replace(/\s/g, "_")}`,
      });
      avatarUrl = uploadRes.secure_url;

      const oldAvatar = existingData.avatar as string;
      if (oldAvatar && oldAvatar !== existingAvatar) {
        try {
          const publicId = oldAvatar.split("/").pop()?.split(".")[0];
          if (publicId) {
            await cloudinary.uploader.destroy(`club-profiles/avatars/${publicId}`);
          }
        } catch (deleteError) {
          console.error("Failed to delete old avatar:", deleteError);
        }
      }
    }

    const updateData = {
      ...existingData,
      id,
      name,
      nameLower: name.toLowerCase(),
      about: about || "",
      avatar: avatarUrl,
      drops: drops || [],
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      entityId: `PROFILE_SF360#${id}`,
      sk: "PROFILE#META",
      ...updateData,
    };

    await dualWrite("Sportsfan360Profile", id, "IdentityAndAccess", dynamoItem);

    return NextResponse.json({
      success: true,
      profile: { ...updateData, id },
    });
  } catch (error) {
    console.error("Update Sportsfan360 profile error:", error);
    return NextResponse.json(
      { success: false, message: `Update failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete Profile by ID ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json(
        { success: false, message: "Profile ID is required" },
        { status: 400 }
      );
    }

    await dualDelete("Sportsfan360Profile", id, "IdentityAndAccess", {
      entityId: `PROFILE_SF360#${id}`,
      sk: "PROFILE#META",
    });

    return NextResponse.json({
      success: true,
      message: `Profile ${id} deleted successfully`,
    });
  } catch (error) {
    console.error("Delete Sportsfan360 profile error:", error);
    return NextResponse.json(
      { success: false, message: `Delete failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}