// app/api/auth/logout/route.ts — Robust Logout & User Activity Logging
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { logUserActivity } from "@/lib/logUserActivity";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

/**
 * Extracts user details from cookies, tokens, request body, query params, or headers.
 */
async function resolveUserFromRequest(req: NextRequest): Promise<{
  email: string;
  userId: string;
  userName: string;
  role: string;
}> {
  let email = "";
  let userId = "";
  let userName = "";
  let role = "user";

  // 1. Check Body (for POST requests)
  try {
    const body = await req.json().catch(() => ({}));
    if (body) {
      email = body.email || body.user?.email || "";
      userId = body.userId || body.user?.userId || body.user?.id || body.id || "";
      userName = body.userName || body.name || body.user?.name || "";
      if (body.role) role = body.role;
    }
  } catch {}

  // 2. Check Query Parameters (for GET/POST)
  if (!email || !userId) {
    const { searchParams } = new URL(req.url);
    if (!email) email = searchParams.get("email") || "";
    if (!userId) userId = searchParams.get("userId") || searchParams.get("id") || "";
    if (!userName) userName = searchParams.get("userName") || searchParams.get("name") || "";
  }

  // 3. Check Custom Headers
  if (!email) email = req.headers.get("x-user-email") || "";
  if (!userId) userId = req.headers.get("x-user-id") || "";
  if (!userName) userName = req.headers.get("x-user-name") || "";

  // 4. Try Decoding Known Cookies & Authorization Tokens
  const tokenCandidates = [
    req.cookies.get("token")?.value,
    req.cookies.get("admin_token")?.value,
    req.cookies.get("auth_token")?.value,
    req.cookies.get("authToken")?.value,
    req.cookies.get("session")?.value,
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""),
    req.cookies.get("next-auth.session-token")?.value,
    req.cookies.get("__Secure-next-auth.session-token")?.value,
  ].filter(Boolean) as string[];

  for (const token of tokenCandidates) {
    try {
      const decoded: any = jwt.decode(token);
      if (decoded && typeof decoded === "object") {
        if (!email && decoded.email) email = decoded.email;
        if (!userId && (decoded.userId || decoded.id || decoded.sub)) {
          userId = decoded.userId || decoded.id || decoded.sub;
        }
        if (!userName && (decoded.name || decoded.userName)) {
          userName = decoded.name || decoded.userName;
        }
        if (decoded.role) role = decoded.role;
        if (email && userId) break;
      }
    } catch {}
  }

  // 5. If we have userId but no email, lookup in DynamoDB / Firestore
  if (!email && userId && userId !== "unknown") {
    const cleanUid = userId.replace(/^USER#/, "");
    try {
      const uRes = await docClient.send(
        new GetCommand({
          TableName: TABLES.IdentityAndAccess,
          Key: { entityId: `USER#${cleanUid}`, sk: "USER#META" },
        })
      );
      if (uRes.Item?.email) {
        email = uRes.Item.email;
        if (!userName) userName = uRes.Item.name || `${uRes.Item.firstName || ""} ${uRes.Item.lastName || ""}`.trim();
        if (uRes.Item.role) role = uRes.Item.role;
      }
    } catch {}

    if (!email) {
      try {
        const uDoc = await db.collection("users").doc(cleanUid).get();
        if (uDoc.exists && uDoc.data()?.email) {
          email = uDoc.data()?.email;
          if (!userName) userName = uDoc.data()?.name || "";
        }
      } catch {}
    }
  }

  // 6. If we have email but no userId, resolve consistent userId
  if (email && !userId) {
    userId = email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
  }

  // 7. Fallback defaults if completely anonymous
  const cleanEmail = (email || (userId ? `${userId}@sportsfan.internal` : "guest_session")).toLowerCase().trim();
  const resolvedUserId = userId || cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
  const resolvedName = userName || (cleanEmail.includes("@") ? cleanEmail.split("@")[0] : "User");

  return {
    email: cleanEmail,
    userId: resolvedUserId,
    userName: resolvedName,
    role,
  };
}

/**
 * Common logout handler for both POST and GET requests.
 */
async function handleLogout(req: NextRequest) {
  try {
    const user = await resolveUserFromRequest(req);

    // ── Record date-wise logout event in DynamoDB & Firestore ───────────────
    try {
      await logUserActivity({
        req,
        email: user.email,
        userId: user.userId,
        userName: user.userName,
        action: "logout",
        metadata: { role: user.role },
      });
      console.log(`[User Activity] 🔴 SUCCESS: Logged logout event for [${user.email}] (${user.userId})`);
    } catch (logErr) {
      console.warn("Logout activity log notice:", logErr);
    }
  } catch (err) {
    console.warn("Logout processing notice:", err);
  }

  // ── Build response and delete all auth session cookies ───────────────────
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  const cookiesToClear = [
    "token",
    "admin_token",
    "auth_token",
    "authToken",
    "session",
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.csrf-token",
    "next-auth.callback-url",
  ];

  for (const cookieName of cookiesToClear) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
  }

  return response;
}

export async function POST(req: NextRequest) {
  return handleLogout(req);
}

export async function GET(req: NextRequest) {
  return handleLogout(req);
}