// app/api/membership/my/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId") || "mock-user-123";

    let membershipData: Record<string, any> | null = null;

    // 1. Try DynamoDB
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
      if (memRes.Item) {
        membershipData = memRes.Item;
      }
    } catch (e) {
      console.warn("[membership/my GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!membershipData && db) {
      const membershipDoc = await db.collection("userMemberships").doc(userId).get();
      if (membershipDoc.exists) {
        membershipData = { id: membershipDoc.id, ...membershipDoc.data() };
      }
    }

    if (!membershipData) {
      return NextResponse.json({
        hasMembership: false,
        membership: null,
        plan: null,
      });
    }

    let planData = null;
    if (membershipData.currentPlanId) {
      try {
        const planRes = await docClient.send(
          new GetCommand({
            TableName: "GamificationAndWallet",
            Key: {
              userId: `PRODUCT#${membershipData.currentPlanId}`,
              sk: "PRODUCT#META",
            },
          })
        );
        if (planRes.Item) {
          planData = { id: membershipData.currentPlanId, ...planRes.Item };
        }
      } catch (e) {
        console.warn("[membership/my GET plan] DynamoDB notice:", e);
      }

      if (!planData && db) {
        const planDoc = await db.collection("storeProducts").doc(membershipData.currentPlanId).get();
        if (planDoc.exists) {
          planData = { id: planDoc.id, ...planDoc.data() };
        }
      }
    }

    return NextResponse.json({
      hasMembership: true,
      membership: { id: userId, ...membershipData },
      plan: planData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch user membership" },
      { status: 500 }
    );
  }
}
