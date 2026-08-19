// api/admin/streak-settings/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET: Read active session settings
export async function GET(req: NextRequest) {
  try {
    let minSessionSeconds = 60; // Default fallback
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "GamificationAndWallet",
        KeyConditionExpression: "userId = :u AND begins_with(sk, :s)",
        ExpressionAttributeValues: {
          ":u": "USER#streakSettings",
          ":s": "MULTIPLIER#streakSettings#"
        },
        Limit: 1
      }));
      if (qRes.Items && qRes.Items.length > 0) {
        minSessionSeconds = qRes.Items[0].minSessionSeconds ?? minSessionSeconds;
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[StreakSettings GET] DynamoDB query failed, trying Firestore:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const docRef = db.collection("multipliers").doc("streakSettings");
        const doc = await docRef.get();

        if (doc.exists) {
          minSessionSeconds = doc.data()!.minSessionSeconds ?? minSessionSeconds;
          fetchedFromDynamo = true;

          // Backfill DynamoDB
          try {
            await docClient.send(new PutCommand({
              TableName: "GamificationAndWallet",
              Item: {
                userId: "USER#streakSettings",
                sk: `MULTIPLIER#streakSettings#${Date.now()}`,
                minSessionSeconds,
                updatedAt: Date.now()
              }
            }));
          } catch (e) {}
        }
      } catch (fsErr) {
        console.error("[StreakSettings GET] Firestore fallback failed:", fsErr);
      }
    }

    // 3. Initialize in both databases if still missing
    if (!fetchedFromDynamo) {
      const now = Date.now();
      try {
        await docClient.send(new PutCommand({
          TableName: "GamificationAndWallet",
          Item: {
            userId: "USER#streakSettings",
            sk: `MULTIPLIER#streakSettings#${now}`,
            minSessionSeconds,
            updatedAt: now
          }
        }));
      } catch (e) {}

      try {
        await db.collection("multipliers").doc("streakSettings").set({
          minSessionSeconds,
          updatedAt: now
        });
      } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      minSessionSeconds,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching streak settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Update active session settings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { minSessionSeconds } = body;

    if (typeof minSessionSeconds !== "number" || minSessionSeconds < 0) {
      return NextResponse.json(
        { error: "minSessionSeconds must be a non-negative number" },
        { status: 400 }
      );
    }

    const now = Date.now();

    // 1. Update/Put in DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "GamificationAndWallet",
        KeyConditionExpression: "userId = :u AND begins_with(sk, :s)",
        ExpressionAttributeValues: {
          ":u": "USER#streakSettings",
          ":s": "MULTIPLIER#streakSettings#"
        },
        Limit: 1
      }));
      const existingItem = qRes.Items?.[0];
      if (existingItem) {
        await docClient.send(new UpdateCommand({
          TableName: "GamificationAndWallet",
          Key: { userId: "USER#streakSettings", sk: existingItem.sk },
          UpdateExpression: "SET minSessionSeconds = :m, updatedAt = :u",
          ExpressionAttributeValues: {
            ":m": minSessionSeconds,
            ":u": now
          }
        }));
      } else {
        await docClient.send(new PutCommand({
          TableName: "GamificationAndWallet",
          Item: {
            userId: "USER#streakSettings",
            sk: `MULTIPLIER#streakSettings#${now}`,
            minSessionSeconds,
            updatedAt: now
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[StreakSettings POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("multipliers").doc("streakSettings");
      await docRef.set({
        minSessionSeconds,
        updatedAt: now
      }, { merge: true });
    } catch (fsErr) {
      console.warn("[StreakSettings POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Streak session settings updated successfully",
      minSessionSeconds
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error updating streak settings:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
