// app/api/auth/send-otp/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { transporter } from "@/lib/mailer";
import { GetCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email } = await req.json();

    // 1. Validation
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!firstName || !lastName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 2. Check if user already exists in DynamoDB
    let userExists = false;

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
        userExists = true;
      }
    } catch (err) {
      console.warn("DynamoDB email-index check notice:", err);
    }

    // Fallback check to Firebase
    if (!userExists) {
      try {
        const userDoc = await db.collection("users").doc(cleanEmail).get();
        if (userDoc.exists) {
          userExists = true;
        }
      } catch (err) {
        console.warn("Firebase check notice:", err);
      }
    }

    if (userExists) {
      return NextResponse.json(
        { error: "User already exists. Please login." },
        { status: 409 }
      );
    }

    // 3. Create User in DynamoDB & Sync to Firebase
    const now = Date.now();
    const userId = `${firstName.toLowerCase()}_${cleanEmail.replace(/[^a-zA-Z0-9]/g, "_")}`;

    const userData = {
      firstName,
      lastName,
      email: cleanEmail,
      userId,
      createdAt: now,
      isVerified: false,
      status: "active",
      role: "user",
    };

    const dynamoUserItem = {
      entityId: `USER#${cleanEmail}`,
      sk: "USER#META",
      ...userData,
    };

    await dualWrite("users", cleanEmail, "IdentityAndAccess", dynamoUserItem);

    // 4. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + 5 * 60 * 1000;

    const otpData = {
      otp,
      createdAt: now,
      expiresAt,
    };

    // Save OTP to DynamoDB & Firebase
    const dynamoOtpItem = {
      entityId: `OTP#${cleanEmail}`,
      sk: "OTP#ACTIVE",
      email: cleanEmail,
      ...otpData,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: dynamoOtpItem,
        })
      );
    } catch (err) {
      console.warn("DynamoDB OTP save notice:", err);
    }

    try {
      await db.collection("otps").doc(cleanEmail).set(otpData);
    } catch (err) {
      console.warn("Firebase OTP save notice:", err);
    }

    // 5. Send Email
    try {
      await transporter.sendMail({
        from: `"SportsFan360" <${process.env.EMAIL}>`,
        to: cleanEmail,
        subject: "Your OTP Code",
        html: `
          <h2>Welcome to SportsFan360 🎉</h2>
          <p>Your OTP is:</p>
          <h1>${otp}</h1>
          <p>Expires in 5 minutes.</p>
        `,
      });
    } catch (mailErr) {
      console.warn("Mailer notification notice:", mailErr);
    }

    return NextResponse.json({
      success: true,
      message: "User created & OTP sent",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/send-otp error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}