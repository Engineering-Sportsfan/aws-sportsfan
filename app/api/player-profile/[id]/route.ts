// app/api/player-profile/[id]/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  return pathParts[pathParts.length - 1] || null;
}

async function fetchPlayerById(id: string): Promise<Record<string, unknown> | null> {
  // 1. Try DynamoDB Query by entityId prefix formats
  const candidates = [
    `PROFILE_PLAYER#${id}`,
    `PROFILE_PLAYER_LEGACY#${id}`,
    id,
  ];

  for (const entityId of candidates) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          KeyConditionExpression: "entityId = :e",
          ExpressionAttributeValues: { ":e": entityId },
          Limit: 1,
        })
      );
      if (res.Items && res.Items.length > 0) {
        return res.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn(`DynamoDB fetch query candidate ${entityId} notice:`, err);
    }
  }

  // 2. Fallback to Firebase during migration period
  try {
    const doc = await db.collection("PlayerProfiles").doc(id).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() } as Record<string, unknown>;
    }
  } catch (err) {
    console.warn("Firebase fetch fallback notice:", err);
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const profile = await fetchPlayerById(id);

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          message: "Profile not found",
          debug: { requestedId: id },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, profile: { id, ...profile } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/player-profile/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Fetch failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const existingData = await fetchPlayerById(id);
    if (!existingData) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    const formData = await req.formData();
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

    const dynamoItem = {
      entityId: (existingData.entityId as string) || `PROFILE_PLAYER#${id}`,
      sk: (existingData.sk as string) || "PROFILE",
      id,
      ...existingData,
      ...updateData,
    };

    await dualWrite("PlayerProfiles", id, "IdentityAndAccess", dynamoItem);

    return NextResponse.json({
      success: true,
      profile: { id, ...existingData, ...updateData },
    });
  } catch (error) {
    console.error("PUT /api/player-profile/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const existing = await fetchPlayerById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: (existing.entityId as string) || `PROFILE_PLAYER#${id}`,
            sk: (existing.sk as string) || "PROFILE",
          },
        })
      );
    } catch (err) {
      console.warn("DynamoDB player delete notice:", err);
    }

    // 2. Dual-Delete Sync to Firebase
    try {
      await db.collection("PlayerProfiles").doc(id).delete();
    } catch (err) {
      console.warn("Firebase player delete sync notice:", err);
    }

    return NextResponse.json({ success: true, message: "Profile deleted" });
  } catch (error) {
    console.error("DELETE /api/player-profile/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}