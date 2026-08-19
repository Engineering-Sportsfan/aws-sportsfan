// app/api/membership/subscribe/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { StoreService } from "@/app/api/v2/store/store.service";
import { randomUUID } from "crypto";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const storeService = new StoreService(db);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { planId, userId = "mock-user-123", paymentMethod = "card" } = body;

    if (!planId) {
      return NextResponse.json({ error: "planId is required" }, { status: 400 });
    }

    let planData: Record<string, any> | null = null;

    // 1. Try DynamoDB
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "GamificationAndWallet",
          Key: {
            userId: `PRODUCT#${planId}`,
            sk: "PRODUCT#META",
          },
        })
      );
      if (getRes.Item) planData = getRes.Item;
    } catch (e) {
      console.warn("[membership/subscribe] DynamoDB plan lookup notice:", e);
    }

    // 2. Fallback to Firestore
    if (!planData && db) {
      const planDoc = await db.collection("storeProducts").doc(planId).get();
      if (planDoc.exists) planData = planDoc.data() as Record<string, any>;
    }

    const planCategory = (planData?.category || "").toLowerCase();
    if (!planData || planCategory !== "memberships") {
      return NextResponse.json({ error: "Valid membership plan not found" }, { status: 404 });
    }

    let hasExisting = false;
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
      if (memRes.Item) hasExisting = true;
    } catch (e) {
      console.warn("[membership/subscribe] DynamoDB membership check:", e);
    }

    if (!hasExisting && db) {
      const existingMembership = await db.collection("userMemberships").doc(userId).get();
      hasExisting = existingMembership.exists;
    }

    const orderType = hasExisting ? "upgrade" : "new";

    const result = await storeService.checkout({
      productId: planId,
      userId,
      paymentMethod,
      pricePaise: planData?.pricePaise || 0,
      idempotencyKey: randomUUID(),
      orderCategory: "Memberships",
      orderType: orderType,
    } as any);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to process subscription" },
      { status: error.status || 500 }
    );
  }
}
