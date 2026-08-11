// app/api/club-profile/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const name = formData.get("name") as string;
    const team = formData.get("team") as string;
    const battingStyle = formData.get("battingStyle") as string;
    const bowlingStyle = formData.get("bowlingStyle") as string;
    const about = formData.get("about") as string;

    // Stats
    const statsRuns = formData.get("statsRuns") as string;
    const statsSr = formData.get("statsSr") as string;
    const statsAvg = formData.get("statsAvg") as string;

    // Overview
    const overviewCaptain = formData.get("overviewCaptain") as string;
    const overviewCoach = formData.get("overviewCoach") as string;
    const overviewOwner = formData.get("overviewOwner") as string;
    const overviewVenue = formData.get("overviewVenue") as string;

    // Files
    const avatarFile = formData.get("avatar") as File | null;
    const avatarUrl = formData.get("avatarUrl") as string;

    if (!name || !team) {
      return NextResponse.json(
        { success: false, message: "name and team are required" },
        { status: 400 }
      );
    }

    // Upload avatar
    let resolvedAvatarUrl = "";
    if (avatarUrl) {
      resolvedAvatarUrl = avatarUrl;
    } else if (avatarFile) {
      const bytes = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${avatarFile.type};base64,${buffer.toString("base64")}`;
      const uploadRes = await cloudinary.uploader.upload(base64, {
        folder: "club-profiles/avatars",
        public_id: `${Date.now()}-${avatarFile.name.replace(/\s/g, "_")}`,
      });
      resolvedAvatarUrl = uploadRes.secure_url;
    }

    const docId = `club_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const profileData = {
      name,
      team,
      battingStyle: battingStyle || "",
      bowlingStyle: bowlingStyle || "",
      about: about || "",
      avatar: resolvedAvatarUrl,
      stats: {
        runs: statsRuns || "0",
        sr: statsSr || "0",
        avg: statsAvg || "0",
      },
      overview: {
        captain: overviewCaptain || "",
        coach: overviewCoach || "",
        owner: overviewOwner || "",
        venue: overviewVenue || "",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nameLower: name.toLowerCase(),
    };

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const dynamoItem = {
      entityId: `PROFILE_CLUB#${docId}`,
      sk: "PROFILE",
      id: docId,
      ...profileData,
    };

    await dualWrite("clubProfiles", docId, "SportsData", dynamoItem);

    return NextResponse.json({
      success: true,
      profile: { id: docId, ...profileData },
    });
  } catch (error) {
    console.error("Create club profile error:", error);
    const msg = error instanceof Error ? error.message : "Create failed";
    return NextResponse.json(
      { success: false, message: `Create failed: ${msg}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20");

    // 1. Scan DynamoDB SportsData for club profiles
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: "SportsData",
        FilterExpression: "begins_with(entityId, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": "PROFILE_CLUB",
        },
      })
    );

    let profiles: Array<Record<string, unknown>> = [];

    if (scanRes.Items && scanRes.Items.length > 0) {
      profiles = scanRes.Items.map((item) => ({
        id: (item.id as string) || (item.entityId as string)?.replace(/^PROFILE_CLUB#/, ""),
        ...item,
      }));
      profiles.sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0));
    } else {
      // Fallback to Firebase
      try {
        const snapshot = await db.collection("clubProfiles").orderBy("createdAt", "desc").limit(limit).get();
        profiles = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (err) {
        console.warn("Firebase clubProfiles fallback notice:", err);
      }
    }

    const paginated = profiles.slice(0, limit);
    const lastDoc = paginated[paginated.length - 1];

    return NextResponse.json({
      success: true,
      profiles: paginated,
      pagination: {
        limit,
        hasMore: profiles.length > limit,
        nextCursor: profiles.length > limit ? {
          lastDocId: lastDoc?.id,
          lastDocCreatedAt: lastDoc?.createdAt,
        } : null,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Fetch club profiles error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}