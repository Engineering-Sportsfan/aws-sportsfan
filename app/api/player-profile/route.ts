// app/api/player-profile/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
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

    // Player Overview
    const iplDebut = formData.get("iplDebut") as string;
    const specialization = formData.get("specialization") as string;
    const dob = formData.get("dob") as string;
    const matches = formData.get("matches") as string;

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

    const docId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

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
        iplDebut: iplDebut || "",
        specialization: specialization || "",
        dob: dob || "",
        matches: matches || "",
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nameLower: name.toLowerCase(),
    };

    // ── Dual-Write to DynamoDB & Firebase ────────────────────────────────────
    const dynamoItem = {
      entityId: `PROFILE_PLAYER#${docId}`,
      sk: "PROFILE",
      id: docId,
      ...profileData,
    };

    await dualWrite("PlayerProfiles", docId, "IdentityAndAccess", dynamoItem);

    return NextResponse.json({
      success: true,
      profile: { id: docId, ...profileData },
    });
  } catch (error) {
    console.error("Create Player profile error:", error);
    const errorMessage = error instanceof Error ? error.message : "Create failed";
    return NextResponse.json(
      { success: false, message: `Create failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";

    // 1. Query DynamoDB IdentityAndAccess for player profiles
    const scanRes = await docClient.send(
      new ScanCommand({
        TableName: "IdentityAndAccess",
        FilterExpression: "begins_with(entityId, :prefix)",
        ExpressionAttributeValues: {
          ":prefix": "PROFILE_PLAYER",
        },
      })
    );

    let profiles: Array<Record<string, unknown>> = [];

    if (scanRes.Items && scanRes.Items.length > 0) {
      profiles = scanRes.Items.map((item) => ({
        id: (item.id as string) || (item.entityId as string)?.replace(/^PROFILE_PLAYER(_LEGACY)?#/, ""),
        ...item,
      }));

      // In-memory filter for search if specified
      if (search) {
        profiles = profiles.filter((p) =>
          ((p.name as string) || "").toLowerCase().includes(search)
        );
      }

      // Sort by createdAt descending
      profiles.sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0));
    } else {
      // Fallback to Firebase
      const snapshot = await db.collection("PlayerProfiles").orderBy("createdAt", "desc").limit(limit).get();
      profiles = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    const paginatedProfiles = profiles.slice(0, limit);
    const hasMore = profiles.length > limit;

    return NextResponse.json({
      success: true,
      profiles: paginatedProfiles,
      pagination: {
        limit,
        hasMore,
        total: profiles.length,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Fetch player profiles error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}