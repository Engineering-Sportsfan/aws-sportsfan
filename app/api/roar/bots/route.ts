import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, UpdateCommand, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Base fallback system bots
    const baseBots = [
      { id: "dolly-dolphin-bot", name: "Dolly", role: "neutral", active: true, avatarUrl: "", bio: "", affiliations: {} },
      { id: "krishna-india-bot", name: "Krishna", role: "partisan", active: true, avatarUrl: "", bio: "", affiliations: {} },
      { id: "radha-england-bot", name: "Radha", role: "partisan", active: true, avatarUrl: "", bio: "", affiliations: {} }
    ];

    const dbBots = new Map();
    let fetchedFromDynamo = false;

    // Try fetching from DynamoDB IdentityAndAccess
    try {
      const keys = baseBots.map(bot => ({
        entityId: `USER#${bot.id}`,
        sk: "USER#META"
      }));

      const res = await docClient.send(new BatchGetCommand({
        RequestItems: {
          "IdentityAndAccess": {
            Keys: keys
          }
        }
      }));

      const items = res.Responses?.["IdentityAndAccess"] || [];
      items.forEach(item => {
        const botId = (item.entityId as string).replace(/^USER#/, "");
        dbBots.set(botId, item);
      });
      fetchedFromDynamo = true;
    } catch (dynErr) {
      console.warn("[Bots GET] DynamoDB bots batch get failed:", dynErr);
    }

    // Fallback to Firestore
    if (!fetchedFromDynamo) {
      try {
        const snapshot = await db.collection("users").where("isBot", "==", true).get();
        snapshot.docs.forEach(doc => {
          dbBots.set(doc.id, doc.data());
        });
      } catch (fsErr) {
        console.error("[Bots GET] Firestore fallback failed:", fsErr);
      }
    }

    const bots = baseBots.map(base => {
      const dbData = dbBots.get(base.id);
      if (dbData) {
        return {
          ...base,
          active: dbData.isBotActive !== undefined ? dbData.isBotActive : base.active,
          avatarUrl: dbData.avatarUrl || base.avatarUrl,
          bio: dbData.bio || base.bio,
          affiliations: dbData.affiliations || base.affiliations
        };
      }
      return base;
    });

    return NextResponse.json({ success: true, bots });
  } catch (error: unknown) {
    console.error("GET /api/roar/bots error:", error);
    return NextResponse.json({ error: "Failed to fetch bots" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { botId, active } = await req.json();
    if (!botId) return NextResponse.json({ error: "Missing botId" }, { status: 400 });

    // 1. Update in DynamoDB first
    try {
      await docClient.send(new UpdateCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: `USER#${botId}`, sk: "USER#META" },
        UpdateExpression: "SET isBotActive = :a, isBot = :b",
        ExpressionAttributeValues: { ":a": active, ":b": true }
      }));
    } catch (dynErr) {
      console.warn("[Bots PUT] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("users").doc(botId).set({
        isBotActive: active,
        isBot: true
      }, { merge: true });
    } catch (fsErr) {
      console.warn("[Bots PUT] Firestore fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PUT /api/roar/bots error:", error);
    return NextResponse.json({ error: "Failed to update bot status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { botId, avatarUrl, bio, affiliations } = await req.json();
    if (!botId) return NextResponse.json({ error: "Missing botId" }, { status: 400 });

    const updateData: any = { isBot: true };
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    if (bio !== undefined) updateData.bio = bio;
    if (affiliations !== undefined) updateData.affiliations = affiliations;

    // 1. Update in DynamoDB first
    try {
      let updateExpression = "SET isBot = :isBot";
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = { ":isBot": true };

      Object.keys(updateData).forEach((key, index) => {
        if (key === "isBot") return;
        const valKey = `:val${index}`;
        const nameKey = `#name${index}`;
        updateExpression += `, ${nameKey} = ${valKey}`;
        expressionAttributeNames[nameKey] = key;
        expressionAttributeValues[valKey] = updateData[key];
      });

      await docClient.send(new UpdateCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: `USER#${botId}`, sk: "USER#META" },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ExpressionAttributeValues: expressionAttributeValues
      }));
    } catch (dynErr) {
      console.warn("[Bots POST] DynamoDB update failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      await db.collection("users").doc(botId).set(updateData, { merge: true });
    } catch (fsErr) {
      console.warn("[Bots POST] Firestore fallback failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("POST /api/roar/bots error:", error);
    return NextResponse.json({ error: "Failed to update bot profile" }, { status: 500 });
  }
}
