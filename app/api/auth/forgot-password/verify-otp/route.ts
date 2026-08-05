// app/api/auth/forgot-password/verify-otp/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import jwt from "jsonwebtoken";
import { GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email & OTP required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Get OTP doc from DynamoDB
    let otpData: Record<string, unknown> | null = null;
    try {
      const otpRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
        })
      );
      if (otpRes.Item) otpData = otpRes.Item as Record<string, unknown>;
    } catch (err) {
      console.warn("DynamoDB forgot-pwd OTP lookup notice:", err);
    }

    // Fallback to Firebase
    if (!otpData) {
      try {
        const fbOtpDoc = await db.collection("otps").doc(cleanEmail).get();
        if (fbOtpDoc.exists) {
          otpData = fbOtpDoc.data() as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("Firebase forgot-pwd OTP lookup notice:", err);
      }
    }

    if (!otpData) {
      return NextResponse.json(
        { error: "OTP not found. Please request a new one." },
        { status: 400 }
      );
    }

    // 2. Check it's a forgot-password OTP
    if (otpData.type !== "forgot-password") {
      return NextResponse.json(
        { error: "Invalid OTP type. Please request a new one." },
        { status: 400 }
      );
    }

    // 3. Check expiry
    const now = Date.now();
    if (now > (otpData.expiresAt as number)) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
          })
        );
      } catch (err) {
        console.warn("DynamoDB OTP cleanup notice:", err);
      }
      try {
        await db.collection("otps").doc(cleanEmail).delete();
      } catch (err) {
        console.warn("Firebase OTP cleanup notice:", err);
      }

      return NextResponse.json(
        { error: "OTP expired. Please request a new one." },
        { status: 400 }
      );
    }

    // 4. Check OTP value
    if (otpData.otp !== otp) {
      return NextResponse.json(
        { error: "Invalid OTP. Please try again." },
        { status: 400 }
      );
    }

    // 5. Delete used OTP
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
        })
      );
    } catch (err) {
      console.warn("DynamoDB delete used OTP notice:", err);
    }
    try {
      await db.collection("otps").doc(cleanEmail).delete();
    } catch (err) {
      console.warn("Firebase delete used OTP notice:", err);
    }

    // 6. Issue short-lived reset token
    const resetToken = jwt.sign(
      { email: cleanEmail, purpose: "password-reset" },
      process.env.JWT_SECRET as string,
      { expiresIn: "10m" }
    );

    return NextResponse.json({
      success: true,
      message: "OTP verified",
      resetToken,
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/forgot-password/verify-otp error:", error);
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}