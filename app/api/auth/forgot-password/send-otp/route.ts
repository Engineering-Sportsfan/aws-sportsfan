// app/api/auth/forgot-password/send-otp/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { transporter } from "@/lib/mailer";
import { GetCommand, QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Check user exists in DynamoDB IdentityAndAccess
    let user: Record<string, unknown> | null = null;

    try {
      const emailRes = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          IndexName: "email-index",
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": cleanEmail },
          Limit: 1,
        })
      );
      if (emailRes.Items && emailRes.Items.length > 0) {
        user = emailRes.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("DynamoDB forgot-pwd user query notice:", err);
    }

    // Fallback check to Firebase
    if (!user) {
      try {
        const userDoc = await db.collection("users").doc(cleanEmail).get();
        if (userDoc.exists) {
          user = userDoc.data() as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("Firebase forgot-pwd user fallback notice:", err);
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "No account found with this email" },
        { status: 404 }
      );
    }

    // 2. Check account status
    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "Your account has been disabled. Contact support." },
        { status: 403 }
      );
    }

    // 3. Rate limit — max 3 OTPs per 10 min
    let existingOtp: Record<string, unknown> | null = null;
    try {
      const otpRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
        })
      );
      if (otpRes.Item) existingOtp = otpRes.Item as Record<string, unknown>;
    } catch (err) {
      console.warn("DynamoDB rate limit check notice:", err);
    }

    const now = Date.now();
    if (existingOtp) {
      const tenMinutesAgo = now - 10 * 60 * 1000;
      const createdAt = (existingOtp.createdAt as number) || 0;
      const attempts = (existingOtp.attempts as number) || 0;
      if (createdAt > tenMinutesAgo && attempts >= 3) {
        return NextResponse.json(
          { error: "Too many attempts. Please wait 10 minutes." },
          { status: 429 }
        );
      }
    }

    // 4. Generate & save OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const attempts = ((existingOtp?.attempts as number) || 0) + 1;

    const otpData = {
      otp,
      type: "forgot-password",
      createdAt: now,
      expiresAt: now + 5 * 60 * 1000,
      attempts,
    };

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
      console.warn("DynamoDB save forgot-pwd OTP notice:", err);
    }

    try {
      await db.collection("otps").doc(cleanEmail).set(otpData);
    } catch (err) {
      console.warn("Firebase save forgot-pwd OTP notice:", err);
    }

    // 5. Send email
    try {
      await transporter.sendMail({
        from: `"SportsFan360" <${process.env.EMAIL}>`,
        to: cleanEmail,
        subject: "Reset Your Password — SportsFan360",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#e91e8c">Reset your password</h2>
            <p>Hi ${(user.firstName as string) ?? "there"},</p>
            <p>We received a request to reset your password. Use the OTP below:</p>
            <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:20px 0">
              <h1 style="letter-spacing:8px;font-size:36px;margin:0;color:#111">${otp}</h1>
            </div>
            <p style="color:#666;font-size:13px">This OTP expires in <strong>5 minutes</strong>.</p>
            <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.warn("Mailer notification notice:", mailErr);
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/forgot-password/send-otp error:", error);
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}