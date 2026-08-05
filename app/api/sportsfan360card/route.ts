// app/api/sportsfan360card/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface Drop {
  id: string;
  title: string;
  url: string;
}

export async function POST(req: NextRequest) {
  try {
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
    }

    const now = Date.now();
    const id = `sf360_card_${now}_${Math.random().toString(36).substring(2, 9)}`;

    const profileData = {
      id,
      name,
      nameLower: name.toLowerCase(),
      about: about || "",
      avatar: avatarUrl,
      drops: drops || [],
      createdAt: now,
      updatedAt: now,
    };

    const dynamoItem = {
      entityId: `PROFILE_SF360#${id}`,
      sk: "PROFILE#META",
      ...profileData,
    };

    await dualWrite("Sportsfan360Profile", id, "IdentityAndAccess", dynamoItem);

    return NextResponse.json({
      success: true,
      profile: profileData,
    });
  } catch (error) {
    console.error("Create Sportsfan360 profile error:", error);
    return NextResponse.json(
      { success: false, message: `Create failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";

    let profiles: any[] = [];

    // 1. Scan DynamoDB
    try {
      let filterExpr = "begins_with(entityId, :prefix)";
      const exprVals: Record<string, any> = {
        ":prefix": "PROFILE_SF360#",
      };

      if (search) {
        filterExpr += " AND contains(nameLower, :search)";
        exprVals[":search"] = search;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: filterExpr,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        profiles = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^PROFILE_SF360#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[sportsfan360card GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (profiles.length === 0 && db) {
      const collectionRef = db.collection("Sportsfan360Profile");
      let query: FirebaseFirestore.Query = collectionRef;

      if (search) {
        query = query
          .orderBy("nameLower")
          .startAt(search)
          .endAt(search + "\uf8ff");
      } else {
        query = query.orderBy("createdAt", "desc");
      }

      const snapshot = await query.limit(limit + 1).get();
      const docs = snapshot.docs.slice(0, limit);

      profiles = docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    profiles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const paged = profiles.slice(0, limit);
    const lastDoc = paged[paged.length - 1];

    return NextResponse.json({
      success: true,
      profiles: paged,
      pagination: {
        limit,
        hasMore: profiles.length > limit,
        nextCursor: profiles.length > limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocValue: search ? lastDoc?.nameLower : lastDoc?.createdAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Fetch player profiles error:", error);
    return NextResponse.json(
      { success: false, message: "Fetch failed" },
      { status: 500 }
    );
  }
}