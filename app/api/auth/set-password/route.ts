// app/api/auth/set-password/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import bcrypt from "bcryptjs";
import { GetCommand, QueryCommand, UpdateCommand, DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email & password required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Fetch OTP record to check if OTP was verified
    let otpData: Record<string, unknown> | null = null;
    try {
      const otpRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
        })
      );
      if (otpRes.Item) {
        otpData = otpRes.Item as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("DynamoDB OTP lookup notice:", err);
    }

    // Fallback to Firebase for OTP
    if (!otpData) {
      try {
        const fbOtpDoc = await db.collection("otps").doc(cleanEmail).get();
        if (fbOtpDoc.exists) {
          otpData = fbOtpDoc.data() as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("Firebase OTP lookup notice:", err);
      }
    }

    // 2. Fetch existing user from DynamoDB IdentityAndAccess (if already created)
    let existingUser: Record<string, unknown> | null = null;

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
        existingUser = emailQuery.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("DynamoDB set-password user query notice:", err);
    }

    if (!existingUser) {
      try {
        const directGet = await docClient.send(
          new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
          })
        );
        if (directGet.Item) existingUser = directGet.Item as Record<string, unknown>;
      } catch (err) {
        console.warn("DynamoDB direct get notice:", err);
      }
    }

    // Fallback to Firebase for existing user
    if (!existingUser) {
      try {
        const userDoc = await db.collection("users").doc(cleanEmail).get();
        if (userDoc.exists) {
          existingUser = userDoc.data() as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("Firebase set-password fallback notice:", err);
      }
    }

    // Check verification status (either from OTP or from existing user)
    const isVerified = otpData?.isVerified === true || existingUser?.isVerified === true;
    if (!isVerified) {
      return NextResponse.json({ error: "Please verify your OTP code first before setting a password." }, { status: 403 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = Date.now();
    const userId = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");

    // 3. CREATE or UPDATE the official User Document in DynamoDB & Firebase
    const firstName = (existingUser?.firstName as string) || (otpData?.firstName as string) || "";
    const lastName = (existingUser?.lastName as string) || (otpData?.lastName as string) || "";

    const finalUserData = {
      ...existingUser,
      firstName,
      lastName,
      email: cleanEmail,
      userId: (existingUser?.userId as string) || userId,
      password: hashedPassword,
      isVerified: true,
      status: (existingUser?.status as string) || "active",
      role: (existingUser?.role as string) || "user",
      authProviders: {
        ...((existingUser?.authProviders as Record<string, boolean>) || {}),
        emailPassword: true,
      },
      totalPoints: (existingUser?.totalPoints as number) || 0,
      createdAt: (existingUser?.createdAt as number) || now,
      updatedAt: now,
    };

    const dynamoUserItem = {
      entityId: `USER#${cleanEmail}`,
      sk: "USER#META",
      ...finalUserData,
    };

    await dualWrite("users", cleanEmail, "IdentityAndAccess", dynamoUserItem);
    console.log(`[DynamoDB Auth] ⚡ SUCCESS: User document officially created/updated in DynamoDB -> entityId: [USER#${cleanEmail}], sk: [USER#META]`);

    // 4. Clean up used OTP record
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
        })
      );
    } catch {}

    try {
      await db.collection("otps").doc(cleanEmail).delete();
    } catch {}

    return NextResponse.json({ success: true, message: "Password set and account created successfully" });
  } catch (error: unknown) {
    console.error("POST /api/auth/set-password error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
