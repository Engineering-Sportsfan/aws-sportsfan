// api/admin/point-rules/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, ScanCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// GET: Read all rules
export async function GET(req: NextRequest) {
  try {
    let rules: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB Scan first
    try {
      const scanRes = await docClient.send(new ScanCommand({
        TableName: "GamificationAndWallet",
        FilterExpression: "begins_with(sk, :p)",
        ExpressionAttributeValues: { ":p": "RULE_POINT#" }
      }));
      if (scanRes.Items && scanRes.Items.length > 0) {
        rules = scanRes.Items.map(item => ({
          id: (item.sk as string).split("#")[1] || item.userId.replace(/^USER#/, ""),
          ...item
        }));
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[PointRules GET] DynamoDB scan failed, falling back:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || rules.length === 0) {
      try {
        const snapshot = await db.collection("pointRules").get();
        rules = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (fsErr) {
        console.error("[PointRules GET] Firestore fallback failed:", fsErr);
      }
    }

    rules.sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({
      success: true,
      rules,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching point rules:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Create or Update rule (CRUD - Create & Update)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ruleId, points, dailyLimit, status } = body;

    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    const now = Date.now();

    // Try finding existing rule in DynamoDB
    let existingItem: any = null;
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "GamificationAndWallet",
        KeyConditionExpression: "userId = :u AND begins_with(sk, :s)",
        ExpressionAttributeValues: {
          ":u": `USER#${ruleId}`,
          ":s": `RULE_POINT#${ruleId}#`
        },
        Limit: 1
      }));
      existingItem = qRes.Items?.[0];
    } catch (e) {}

    const writeData: Record<string, any> = {
      updatedAt: now
    };

    if (typeof points === "number") writeData.points = points;
    if (typeof dailyLimit === "number") writeData.dailyLimit = dailyLimit;
    if (status && ["active", "inactive", "suspended"].includes(status)) {
      writeData.status = status;
    }

    // 1. Put/Update in DynamoDB first
    try {
      if (!existingItem) {
        // Create new
        const finalItem = {
          userId: `USER#${ruleId}`,
          sk: `RULE_POINT#${ruleId}#${now}`,
          points: writeData.points ?? 10,
          dailyLimit: writeData.dailyLimit ?? 5,
          status: writeData.status ?? "active",
          updatedAt: now
        };
        await docClient.send(new PutCommand({
          TableName: "GamificationAndWallet",
          Item: finalItem
        }));
      } else {
        // Update existing
        await docClient.send(new UpdateCommand({
          TableName: "GamificationAndWallet",
          Key: { userId: `USER#${ruleId}`, sk: existingItem.sk },
          UpdateExpression: "SET points = :p, dailyLimit = :d, #st = :s, updatedAt = :u",
          ExpressionAttributeNames: { "#st": "status" },
          ExpressionAttributeValues: {
            ":p": writeData.points !== undefined ? writeData.points : (existingItem.points ?? 10),
            ":d": writeData.dailyLimit !== undefined ? writeData.dailyLimit : (existingItem.dailyLimit ?? 5),
            ":s": writeData.status !== undefined ? writeData.status : (existingItem.status ?? "active"),
            ":u": now
          }
        }));
      }
    } catch (dynErr) {
      console.warn("[PointRules POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("pointRules").doc(ruleId);
      const doc = await docRef.get();
      if (!doc.exists) {
        const finalItem = {
          points: writeData.points ?? 10,
          dailyLimit: writeData.dailyLimit ?? 5,
          status: writeData.status ?? "active",
          updatedAt: now
        };
        await docRef.set(finalItem);
      } else {
        await docRef.update(writeData);
      }
    } catch (fsErr) {
      console.warn("[PointRules POST] Firestore sync failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: `Rule ${ruleId} saved successfully`,
      rule: { id: ruleId, ...writeData }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error saving point rule:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Delete point rule (CRUD - Delete)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("ruleId");

    if (!ruleId) {
      return NextResponse.json({ error: "ruleId is required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB first
    try {
      const qRes = await docClient.send(new QueryCommand({
        TableName: "GamificationAndWallet",
        KeyConditionExpression: "userId = :u AND begins_with(sk, :s)",
        ExpressionAttributeValues: {
          ":u": `USER#${ruleId}`,
          ":s": `RULE_POINT#${ruleId}#`
        },
        Limit: 1
      }));
      const existingItem = qRes.Items?.[0];
      if (existingItem) {
        await docClient.send(new DeleteCommand({
          TableName: "GamificationAndWallet",
          Key: { userId: `USER#${ruleId}`, sk: existingItem.sk }
        }));
      }
    } catch (dynErr) {
      console.warn("[PointRules DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const docRef = db.collection("pointRules").doc(ruleId);
      await docRef.delete();
    } catch (fsErr) {
      console.warn("[PointRules DELETE] Firestore fallback delete failed:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: `Rule ${ruleId} deleted successfully`
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting point rule:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
