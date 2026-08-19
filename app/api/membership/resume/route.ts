// app/api/membership/resume/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId || "mock-user-123";

    let existingData: Record<string, any> | null = null;

    try {
      const memRes = await docClient.send(
        new GetCommand({
          TableName: "GamificationAndWallet",
          Key: {
            userId: `USER#${userId}`,
            sk: `MEMBERSHIP#${userId}`,
          },
        })
      );
      if (memRes.Item) existingData = memRes.Item;
    } catch (e) {
      console.warn("[membership/resume] DynamoDB lookup notice:", e);
    }

    if (!existingData && db) {
      const membershipRef = db.collection("userMemberships").doc(userId);
      const doc = await membershipRef.get();
      if (doc.exists) {
        existingData = doc.data() as Record<string, any>;
      }
    }

    if (!existingData) {
      return NextResponse.json({ error: "No user membership found" }, { status: 404 });
    }

    if (existingData.status !== "paused") {
      return NextResponse.json(
        { error: `Cannot resume membership with status "${existingData.status}". Membership must be paused.` },
        { status: 400 }
      );
    }

    const updatedMembership = {
      ...existingData,
      status: "active",
      pausedAt: null,
      updatedAt: Date.now(),
    };

    const dynamoItem = {
      userId: `USER#${userId}`,
      sk: `MEMBERSHIP#${userId}`,
      ...updatedMembership,
    };

    await dualWrite("userMemberships", userId, "GamificationAndWallet", dynamoItem);

    return NextResponse.json({ success: true, membership: updatedMembership });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to resume membership" },
      { status: 500 }
    );
  }
}
