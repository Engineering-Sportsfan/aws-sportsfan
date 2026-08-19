// app/api/auth/set-password/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import bcrypt from "bcryptjs";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email & password required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Fetch user from DynamoDB IdentityAndAccess
    let user: Record<string, unknown> | null = null;

    try {
      const emailQuery = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          IndexName: "email-index",
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": cleanEmail },
          Limit: 1,
        })
      );
      if (emailQuery.Items && emailQuery.Items.length > 0) {
        user = emailQuery.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("DynamoDB set-password user query notice:", err);
    }

    if (!user) {
      try {
        const directGet = await docClient.send(
          new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
          })
        );
        if (directGet.Item) user = directGet.Item as Record<string, unknown>;
      } catch (err) {
        console.warn("DynamoDB direct get notice:", err);
      }
    }

    // Fallback to Firebase
    if (!user) {
      try {
        const userDoc = await db.collection("users").doc(cleanEmail).get();
        if (userDoc.exists) {
          user = userDoc.data() as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("Firebase set-password fallback notice:", err);
      }
    }

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.isVerified) {
      return NextResponse.json({ error: "Verify OTP first" }, { status: 403 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = Date.now();

    // 2. Update password in DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: (user.entityId as string) || `USER#${cleanEmail}`,
            sk: (user.sk as string) || "USER#META",
          },
          UpdateExpression: "SET password = :p, updatedAt = :u",
          ExpressionAttributeValues: {
            ":p": hashedPassword,
            ":u": now,
          },
        })
      );
    } catch (err) {
      console.warn("DynamoDB update password notice:", err);
    }

    // 3. Sync to Firebase
    try {
      await db.collection("users").doc(cleanEmail).update({
        password: hashedPassword,
        updatedAt: now,
      });
    } catch (err) {
      console.warn("Firebase update password sync notice:", err);
    }

    return NextResponse.json({ success: true, message: "Password set successfully" });
  } catch (error: unknown) {
    console.error("POST /api/auth/set-password error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
