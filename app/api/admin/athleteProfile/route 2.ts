// api/admin/athleteProfile/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, ScanCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      // Get single document DynamoDB-first
      let athleteData: any = null;
      let fetchedFromDynamo = false;

      try {
        const qRes = await docClient.send(new QueryCommand({
          TableName: "IdentityAndAccess",
          KeyConditionExpression: "entityId = :e",
          ExpressionAttributeValues: { ":e": `PROFILE_ATHLETE#${id}` },
          Limit: 1
        }));
        if (qRes.Items && qRes.Items.length > 0) {
          athleteData = { id, ...qRes.Items[0] };
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AthleteProfile GET] DynamoDB query failed:", dynErr);
      }

      // Fallback: Check Firestore
      if (!fetchedFromDynamo) {
        try {
          const docSnap = await db.collection("athletesProfile").doc(id).get();
          if (docSnap.exists) {
            athleteData = { id: docSnap.id, ...docSnap.data() };
          }
        } catch (fsErr) {
          console.error("[AthleteProfile GET] Firestore fallback failed:", fsErr);
        }
      }

      if (!athleteData) {
        return NextResponse.json({ success: false, error: "Athlete profile not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: athleteData }, { status: 200 });
    } else {
      // List all documents DynamoDB-first
      let list: any[] = [];
      let fetchedFromDynamo = false;

      try {
        const scanRes = await docClient.send(new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :p)",
          ExpressionAttributeValues: { ":p": "PROFILE_ATHLETE#" }
        }));
        if (scanRes.Items && scanRes.Items.length > 0) {
          list = scanRes.Items.map(item => ({
            id: (item.entityId as string).replace(/^PROFILE_ATHLETE#/, ""),
            name: item.name,
            country: item.country,
            sport: item.sport,
            image: item.image,
            isVerified: item.isVerified,
            fanImpactScore: item.fanImpactScore
          }));
          fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[AthleteProfile GET list] DynamoDB scan failed:", dynErr);
      }

      // Fallback: Check Firestore
      if (!fetchedFromDynamo || list.length === 0) {
        try {
          const snapshot = await db.collection("athletesProfile").get();
          list = snapshot.docs.map((doc) => {
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
        } catch (fsErr) {
          console.error("[AthleteProfile GET list] Firestore fallback failed:", fsErr);
        }
      }

      return NextResponse.json({ success: true, data: list }, { status: 200 });
    }
  } catch (error: unknown) {
    console.error("Error in GET athleteProfile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

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

    const id = `ath_${Math.random().toString(36).substring(2, 15)}`;
    const now = Date.now();

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
      createdAt: now,
      updatedAt: now,
    };

    // 1. Put in DynamoDB first
    try {
      await docClient.send(new PutCommand({
        TableName: "IdentityAndAccess",
        Item: {
          entityId: `PROFILE_ATHLETE#${id}`,
          sk: `PROFILE_ATHLETE#${now}`,
          id,
          ...newDoc
        }
      }));
    } catch (dynErr) {
      console.warn("[AthleteProfile POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("athletesProfile").doc(id).set(newDoc);
    } catch (fsErr) {
      console.warn("[AthleteProfile POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error adding athlete profile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

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

    const now = Date.now();
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
      updatedAt: now,
    };

    // 1. Update in DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "IdentityAndAccess",
        KeyConditionExpression: "entityId = :e",
        ExpressionAttributeValues: { ":e": `PROFILE_ATHLETE#${id}` },
        Limit: 1
      }));
      const existingItem = qRes.Items?.[0];
      if (existingItem) {
        await docClient.send(new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...existingItem,
            ...updateData,
            entityId: `PROFILE_ATHLETE#${id}`,
            sk: existingItem.sk
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[AthleteProfile PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("athletesProfile").doc(id);
      await docRef.set(updateData, { merge: true });
    } catch (fsErr) {
      console.warn("[AthleteProfile PUT] Firestore fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true, id }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error updating athlete profile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing document ID" }, { status: 400 });
    }

    // 1. Delete from DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "IdentityAndAccess",
        KeyConditionExpression: "entityId = :e",
        ExpressionAttributeValues: { ":e": `PROFILE_ATHLETE#${id}` },
        Limit: 1
      }));
      const existingItem = qRes.Items?.[0];
      if (existingItem) {
        await docClient.send(new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `PROFILE_ATHLETE#${id}`, sk: existingItem.sk }
        }));
      }
    } catch (dynErr) {
      console.warn("[AthleteProfile DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("athletesProfile").doc(id);
      await docRef.delete();
    } catch (fsErr) {
      console.warn("[AthleteProfile DELETE] Firestore fallback delete failed:", fsErr);
    }

    return NextResponse.json({ success: true, message: "Deleted successfully" }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error deleting athlete profile:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
