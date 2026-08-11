// app/api/club-profile/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
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

async function fetchClubById(id: string): Promise<Record<string, unknown> | null> {
  const candidates = [
    `PROFILE_CLUB#${id}`,
    `CLUB#${id}`,
    id,
  ];

  for (const entityId of candidates) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: "SportsData",
          KeyConditionExpression: "entityId = :e",
          ExpressionAttributeValues: { ":e": entityId },
          Limit: 1,
        })
      );
      if (res.Items && res.Items.length > 0) {
        return res.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn(`DynamoDB fetch club ${entityId} notice:`, err);
    }
  }

  // Fallback to Firebase
  try {
    const doc = await db.collection("clubProfiles").doc(id).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() } as Record<string, unknown>;
    }
  } catch (err) {
    console.warn("Firebase fetch club fallback notice:", err);
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const profile = await fetchClubById(id);

    if (!profile) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, profile: { id, ...profile } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/club-profile/[id] error:", error);
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

    const existingData = await fetchClubById(id);
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
    const overviewCaptain = formData.get("overviewCaptain") as string;
    const overviewCoach = formData.get("overviewCoach") as string;
    const overviewOwner = formData.get("overviewOwner") as string;
    const overviewVenue = formData.get("overviewVenue") as string;
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
        captain: overviewCaptain || (existingData.overview as Record<string, string>)?.captain || "",
        coach: overviewCoach || (existingData.overview as Record<string, string>)?.coach || "",
        owner: overviewOwner || (existingData.overview as Record<string, string>)?.owner || "",
        venue: overviewVenue || (existingData.overview as Record<string, string>)?.venue || "",
      },
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      entityId: (existingData.entityId as string) || `PROFILE_CLUB#${id}`,
      sk: (existingData.sk as string) || "PROFILE",
      id,
      ...existingData,
      ...updateData,
    };

    await dualWrite("clubProfiles", id, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      profile: { id, ...existingData, ...updateData },
    });
  } catch (error) {
    console.error("PUT /api/club-profile/[id] error:", error);
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

    const existing = await fetchClubById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Profile not found" },
        { status: 404 }
      );
    }

    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "SportsData",
          Key: {
            entityId: (existing.entityId as string) || `PROFILE_CLUB#${id}`,
            sk: (existing.sk as string) || "PROFILE",
          },
        })
      );
    } catch (err) {
      console.warn("DynamoDB club delete notice:", err);
    }

    try {
      await db.collection("clubProfiles").doc(id).delete();
    } catch (err) {
      console.warn("Firebase club delete sync notice:", err);
    }

    return NextResponse.json({ success: true, message: "Profile deleted" });
  } catch (error) {
    console.error("DELETE /api/club-profile/[id] error:", error);
    const msg = error instanceof Error ? error.message : "Delete failed";
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}