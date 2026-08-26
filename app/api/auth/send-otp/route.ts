// app/api/auth/send-otp/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { transporter } from "@/lib/mailer";
import { GetCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { logAuthIssue } from "@/lib/logAuthIssue";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { firstName, lastName, email } = await req.json();

    // 1. Validation
    if (!email || !email.includes("@")) {
      logAuthIssue({
        email: email || "unknown",
        type: "signup",
        reason: "Invalid email format entered",
        endpoint: "/api/auth/send-otp",
      });
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    if (!firstName || !lastName) {
      logAuthIssue({
        email: email,
        type: "signup",
        reason: "First or last name is missing",
        endpoint: "/api/auth/send-otp",
      });
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 2. Check if a FULLY REGISTERED user already exists in DynamoDB
    let userExists = false;

    try {
      const emailQuery = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          IndexName: "email-index",
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": cleanEmail },
        })
      );
      const items = (emailQuery.Items || []).filter(item => {
        const eid = String(item.entityId || "");
        return eid.startsWith("USER#") && (item.password || item.isVerified || item.authProviders);
      });
      if (items.length > 0) {
        userExists = true;
      }
    } catch (err) {
      console.warn("DynamoDB email-index check notice:", err);
    }

    // Fallback check to Firebase for registered user
    if (!userExists) {
      try {
        const userDoc = await db.collection("users").doc(cleanEmail).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          if (data?.password || data?.isVerified || data?.authProviders) {
            userExists = true;
          }
        }
      } catch (err) {
        console.warn("Firebase check notice:", err);
      }
    }

    if (userExists) {
      logAuthIssue({
        email: cleanEmail,
        type: "signup",
        reason: "User tried to register with an already registered email",
        endpoint: "/api/auth/send-otp",
      });
      return NextResponse.json(
        { error: "This email is already registered. Please log in instead." },
        { status: 409 }
      );
    }

    // 3. Generate OTP (DO NOT create user document until password is set)
    const now = Date.now();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + 5 * 60 * 1000;

    const otpData = {
      otp,
      firstName,
      lastName,
      email: cleanEmail,
      isVerified: false,
      createdAt: now,
      expiresAt,
    };

    // Save OTP to DynamoDB & Firebase
    const dynamoOtpItem = {
      entityId: `OTP#${cleanEmail}`,
      sk: "OTP#ACTIVE",
      ...otpData,
    };

    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: dynamoOtpItem,
        })
      );
      console.log(`[DynamoDB Auth] ⚡ SUCCESS: OTP saved in DynamoDB -> entityId: [OTP#${cleanEmail}], sk: [OTP#ACTIVE] (OTP: ${otp})`);
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
      console.log(`[DynamoDB Auth] 📧 SUCCESS: OTP email delivered to ${cleanEmail}`);
    } catch (mailErr: any) {
      console.error(`[DynamoDB Auth] ❌ FAILED to send email to ${cleanEmail}:`, mailErr?.message || mailErr);
      logAuthIssue({
        email: cleanEmail,
        type: "signup",
        reason: `OTP email delivery failed: ${mailErr?.message || "SMTP error"}`,
        endpoint: "/api/auth/send-otp",
      });
      return NextResponse.json({
        error: `Failed to deliver OTP email: ${mailErr?.message || 'SMTP delivery error'}. Please verify EMAIL and EMAIL_PASS configuration.`
      }, { status: 500 });
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