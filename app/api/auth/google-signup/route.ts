// app/api/auth/google-signup/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import jwt from "jsonwebtoken";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function generateConsistentUserId(email: string): string {
  return email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
}

export async function POST(req: NextRequest) {
  try {
    const { email, name, avatar } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const consistentUserId = generateConsistentUserId(cleanEmail);
    const nameParts = (name ?? "").split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") ?? "";
    const username = `${firstName} ${lastName}`.trim() || cleanEmail.split("@")[0];

    // ── 1. Check if User exists in DynamoDB ──────────────────────────────────
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
      console.warn("DynamoDB google user query notice:", err);
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

    // Fallback check to Firebase
    if (!existingUser) {
      try {
        const fbUser = await db.collection("users").doc(cleanEmail).get();
        if (fbUser.exists) {
          existingUser = fbUser.data() as Record<string, unknown>;
        }
      } catch (err) {
        console.warn("Firebase google user check notice:", err);
      }
    }

    let userId = consistentUserId;
    let role = "user";
    const now = Date.now();

    if (!existingUser) {
      // ── Create New User ───────────────────────────────────────────────────
      const newUser = {
        email: cleanEmail,
        userId: consistentUserId,
        firstName,
        lastName,
        username,
        avatar: avatar ?? "",
        provider: "google",
        authProviders: { google: true, emailPassword: false },
        isVerified: true,
        status: "active",
        role: "user",
        totalPoints: 0,
        pointsBreakdown: {},
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };

      const dynamoItem = {
        entityId: `USER#${cleanEmail}`,
        sk: "USER#META",
        ...newUser,
      };

      await dualWrite("users", cleanEmail, "IdentityAndAccess", dynamoItem);
    } else {
      // ── Update Existing User ──────────────────────────────────────────────
      if (existingUser.status === "disabled") {
        return NextResponse.json({ error: "Account disabled" }, { status: 403 });
      }

      userId = (existingUser.userId as string) || consistentUserId;
      role = (existingUser.role as string) || "user";

      const updateData: Record<string, unknown> = {
        lastLoginAt: now,
        updatedAt: now,
        userId,
      };

      if (!(existingUser.authProviders as Record<string, boolean>)?.google) {
        updateData.authProviders = {
          ...((existingUser.authProviders as Record<string, boolean>) || {}),
          google: true,
        };
      }
      if (!existingUser.firstName && firstName) {
        updateData.firstName = firstName;
        updateData.lastName = lastName;
      }
      if (!existingUser.avatar && avatar) {
        updateData.avatar = avatar;
      }

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "IdentityAndAccess",
            Key: {
              entityId: (existingUser.entityId as string) || `USER#${cleanEmail}`,
              sk: (existingUser.sk as string) || "USER#META",
            },
            UpdateExpression: "SET lastLoginAt = :l, updatedAt = :u, userId = :uid",
            ExpressionAttributeValues: {
              ":l": now,
              ":u": now,
              ":uid": userId,
            },
          })
        );
      } catch (err) {
        console.warn("DynamoDB google user update notice:", err);
      }

      try {
        await db.collection("users").doc(cleanEmail).update(updateData);
      } catch (err) {
        console.warn("Firebase google user update notice:", err);
      }
    }

    // ── Issue standard JWT cookie ────────────────────────────────────────────
    const token = jwt.sign(
      { email: cleanEmail, userId, name: `${firstName} ${lastName}`.trim(), role },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    const response = NextResponse.json({
      success: true,
      userId,
      firstName: firstName || (existingUser?.firstName as string) || "",
      lastName: lastName || (existingUser?.lastName as string) || "",
      role,
      status: "active",
    });

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("POST /api/auth/google-signup error:", error);
    return NextResponse.json({ error: "Failed to save user" }, { status: 500 });
  }
}