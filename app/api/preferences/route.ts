// app/api/preferences/route.ts — Migrated to AWS DynamoDB (UserData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const COLLECTION = "userPreferences";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      let preferences: any[] = [];

      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: "UserData",
            FilterExpression: "sk = :prefSk",
            ExpressionAttributeValues: { ":prefSk": "PREFERENCES#META" },
            Limit: 50,
          })
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          preferences = scanRes.Items.map((item) => ({
            id: item.id || (item.userId as string).replace(/^USER#/, ""),
            ...item,
          }));
        }
      } catch (e) {
        console.warn("[preferences GET all] DynamoDB notice:", e);
      }

      if (preferences.length === 0 && db) {
        const snapshot = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
        preferences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      return NextResponse.json({ success: true, preferences });
    }

    let userPref: any = null;

    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "UserData",
          Key: { userId: `USER#${userId}`, sk: "PREFERENCES#META" },
        })
      );
      if (getRes.Item) userPref = { id: userId, ...getRes.Item };
    } catch (e) {
      console.warn("[preferences GET single] DynamoDB notice:", e);
    }

    if (!userPref && db) {
      const docRef = db.collection(COLLECTION).doc(userId);
      const doc = await docRef.get();
      if (doc.exists) {
        userPref = { id: doc.id, ...doc.data() };
      }
    }

    if (!userPref) {
      return NextResponse.json(
        { error: "Preferences not found for this user" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      preferences: userPref,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching user preferences:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, purpose, sports, contentStyle, notifications } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const now = Date.now();
    const prefData = {
      userId,
      purpose,
      sports: sports || [],
      contentStyle,
      notifications: notifications || {},
      createdAt: now,
      updatedAt: now,
    };

    await dualWrite({
      tableName: "UserData",
      dynamoItem: {
        ...prefData,
        userId: `USER#${userId}`,
        sk: "PREFERENCES#META",
      },
      firestoreRef: db.collection(COLLECTION).doc(userId),
      firestoreData: prefData,
    });

    return NextResponse.json({
      success: true,
      preferences: { id: userId, ...prefData },
    }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error saving user preferences:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}