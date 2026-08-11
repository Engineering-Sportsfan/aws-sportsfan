// app/api/auth/login/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email & password required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // ── 1. Fetch User from DynamoDB IdentityAndAccess ─────────────────────────
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
      console.warn("DynamoDB login query notice:", err);
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
        console.warn("Firebase login fallback notice:", err);
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // ── 2. Check verified (skip for hosts created by admin) ──────────────────
    if (user.role !== "host" && !user.isVerified) {
      return NextResponse.json(
        { error: "Please verify OTP first" },
        { status: 403 }
      );
    }

    // ── 3. Check account status ──────────────────────────────────────────────
    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "Your account has been disabled. Contact support." },
        { status: 403 }
      );
    }

    // ── 4. Check password ────────────────────────────────────────────────────
    const storedPassword = (user.password as string) || "";
    const isMatch = await bcrypt.compare(password, storedPassword);

    if (!isMatch) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // ── 5. Check if host needs to change password on first login ─────────────
    const requiresPasswordChange = user.role === "host" && user.isFirstLogin === true;

    // ── 6. Ensure consistent userId ──────────────────────────────────────────
    let userId = user.userId as string | undefined;
    if (!userId || userId.startsWith("google_")) {
      userId = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
      user.userId = userId;

      // Persist backfill to DynamoDB & Firebase
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "IdentityAndAccess",
            Key: {
              entityId: (user.entityId as string) || `USER#${cleanEmail}`,
              sk: (user.sk as string) || "USER#META",
            },
            UpdateExpression: "SET userId = :u",
            ExpressionAttributeValues: { ":u": userId },
          })
        );
      } catch (err) {
        console.warn("DynamoDB userId backfill notice:", err);
      }

      try {
        await db.collection("users").doc(cleanEmail).update({ userId });
      } catch (err) {
        console.warn("Firebase userId backfill notice:", err);
      }
    }

    // ── 7. Create JWT token ──────────────────────────────────────────────────
    const name = `${(user.firstName as string) || ""} ${(user.lastName as string) || ""}`.trim() || cleanEmail.split("@")[0];

    const token = jwt.sign(
      {
        email: cleanEmail,
        userId,
        name,
        role: user.role ?? "user",
        status: user.status ?? "active",
        isFirstLogin: user.isFirstLogin ?? false,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    // ── 8. Build response with requiresPasswordChange flag ───────────────────
    const response = NextResponse.json({
      success: true,
      requiresPasswordChange,
      user: {
        email: cleanEmail,
        name,
        userId,
        role: user.role ?? "user",
        status: user.status ?? "active",
        isFirstLogin: user.isFirstLogin ?? false,
      },
    });

    // ── 9. Set HTTP-only cookies ─────────────────────────────────────────────
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("LOGIN ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}