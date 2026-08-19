// app/api/membership/plans/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    let plans: any[] = [];

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "GamificationAndWallet",
          FilterExpression: "begins_with(userId, :pPrefix) AND (category = :c1 OR category = :c2)",
          ExpressionAttributeValues: {
            ":pPrefix": "PRODUCT#",
            ":c1": "Memberships",
            ":c2": "memberships",
          },
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        plans = scanRes.Items
          .map((item) => ({
            id: item.id || (item.userId as string).replace(/^PRODUCT#/, ""),
            ...item,
          }))
          .filter((plan: any) => !plan.governance_state || plan.governance_state === "approved");
      }
    } catch (e) {
      console.warn("[membership/plans GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (plans.length === 0 && db) {
      const snapshot = await db
        .collection("storeProducts")
        .where("category", "in", ["Memberships", "memberships"])
        .get();

      plans = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((plan: any) => !plan.governance_state || plan.governance_state === "approved");
    }

    return NextResponse.json(plans);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch membership plans" },
      { status: 500 }
    );
  }
}
