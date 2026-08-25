// app/api/auth/verify-otp/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { VerifyOtpRequest } from "@/types/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, otp }: VerifyOtpRequest = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email & OTP required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // ── 1. Get OTP doc from DynamoDB ─────────────────────────────────────────
    let otpData: Record<string, unknown> | null = null;

    try {
      const otpRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `OTP#${cleanEmail}`,
            sk: "OTP#ACTIVE",
          },
        })
      );
      if (otpRes.Item) {
        otpData = otpRes.Item as Record<string, unknown>;
      }
    } catch (err) {
      console.warn("DynamoDB OTP lookup notice:", err);
    }

    // Fallback to Firebase for OTP lookup
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

    if (!otpData) {
      return NextResponse.json(
        { error: "OTP not found. Please request a new one." },
        { status: 400 }
      );
    }

    // ── 2. Check expiry FIRST ────────────────────────────────────────────────
    const now = Date.now();
    if (now > (otpData.expiresAt as number)) {
      // Clean up expired OTP
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
          })
        );
      } catch (err) {
        console.warn("DynamoDB expired OTP cleanup notice:", err);
      }
      try {
        await db.collection("otps").doc(cleanEmail).delete();
      } catch (err) {
        console.warn("Firebase expired OTP cleanup notice:", err);
      }

      return NextResponse.json(
        { error: "OTP expired. Please request a new one." },
        { status: 400 }
      );
    }

    // ── 3. Check OTP value ───────────────────────────────────────────────────
    if (otpData.otp !== otp) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }

    // ── 4. Mark user as verified in DynamoDB & Firebase ──────────────────────
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: `USER#${cleanEmail}`,
            sk: "USER#META",
          },
          UpdateExpression: "SET isVerified = :v, verifiedAt = :va",
          ExpressionAttributeValues: {
            ":v": true,
            ":va": now,
          },
        })
      );
      console.log(`[DynamoDB Auth] ⚡ SUCCESS: User verified in DynamoDB -> entityId: [USER#${cleanEmail}], sk: [USER#META] (isVerified=true)`);
    } catch (err) {
      console.warn("DynamoDB verify update notice:", err);
    }

    try {
      await db.collection("users").doc(cleanEmail).set(
        {
          email: cleanEmail,
          isVerified: true,
          verifiedAt: now,
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("Firebase verify update notice:", err);
    }

    // ── 5. Delete used OTP ───────────────────────────────────────────────────
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `OTP#${cleanEmail}`, sk: "OTP#ACTIVE" },
        })
      );
      console.log(`[DynamoDB Auth] ⚡ SUCCESS: Used OTP deleted from DynamoDB -> entityId: [OTP#${cleanEmail}], sk: [OTP#ACTIVE]`);
    } catch (err) {
      console.warn("DynamoDB used OTP delete notice:", err);
    }

    try {
      await db.collection("otps").doc(cleanEmail).delete();
    } catch (err) {
      console.warn("Firebase used OTP delete notice:", err);
    }

    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/verify-otp error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}