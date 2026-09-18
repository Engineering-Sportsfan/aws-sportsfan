import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/getAuthUser";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES } from "@/lib/tableNames";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const cleanEmail = (user.email || "").trim().toLowerCase();
    const cleanUid = (user.userId || "").replace(/^USER#/i, "");

    // ── Verify that the user still exists in the database ──────────────────
    let exists = false;
    let dbUser: any = null;
    let dbCheckAttempted = false;

    // 1. Check DynamoDB IdentityAndAccess by email
    if (cleanEmail) {
      try {
        dbCheckAttempted = true;
        const res = await docClient.send(
          new GetCommand({
            TableName: TABLES.IdentityAndAccess,
            Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
          })
        );
        if (res.Item) {
          exists = true;
          dbUser = res.Item;
        }
      } catch (err) {
        console.warn("[/api/auth/me] DynamoDB email check notice:", err);
      }
    }

    // 2. Check DynamoDB by userId if email check was empty
    if (!exists && cleanUid) {
      try {
        const res = await docClient.send(
          new GetCommand({
            TableName: TABLES.IdentityAndAccess,
            Key: { entityId: `USER#${cleanUid}`, sk: "USER#META" },
          })
        );
        if (res.Item) {
          exists = true;
          dbUser = res.Item;
        }
      } catch {}
    }

    // 3. Fallback check to Firestore 'users'
    if (!exists && cleanEmail && db) {
      try {
        const fsDoc = await db.collection("users").doc(cleanEmail).get();
        if (fsDoc.exists) {
          exists = true;
          dbUser = fsDoc.data();
        }
      } catch {}
    }

    // ── Self-Healing Auto-Creation ──────────────────────────────────────────
    // If user has a valid JWT session token but their DB record is missing,
    // auto-create it in DynamoDB & Firebase instead of kicking them out!
    if (dbCheckAttempted && !exists && cleanEmail) {
      console.log(`[/api/auth/me] ⚡ Auto-healing: Missing DB record for [${cleanEmail}]. Creating in DynamoDB...`);
      const now = Date.now();
      const consistentUserId = cleanUid || cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
      const nameParts = (user.name ?? "").split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") ?? "";

      const newUserData = {
        email: cleanEmail,
        userId: consistentUserId,
        firstName,
        lastName,
        name: user.name || cleanEmail.split("@")[0],
        role: user.role || "user",
        status: "active",
        isVerified: true,
        authProviders: { emailPassword: true, google: false },
        totalPoints: 0,
        pointsBreakdown: {},
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      };

      const dynamoItem = {
        entityId: `USER#${cleanEmail}`,
        sk: "USER#META",
        ...newUserData,
      };

      try {
        await dualWrite("users", cleanEmail, TABLES.IdentityAndAccess, dynamoItem);
        exists = true;
        dbUser = newUserData;
        console.log(`[/api/auth/me] ✅ Successfully auto-healed user record for [${cleanEmail}]`);
      } catch (healErr) {
        console.error("[/api/auth/me] Failed to auto-heal user record:", healErr);
      }
    }

    // Only clear cookies if check was attempted, email is missing/invalid, and record truly cannot be resolved
    if (dbCheckAttempted && !exists) {
      console.warn(`[/api/auth/me] ⚠️ Unrecoverable session for [${cleanEmail || cleanUid}]. Clearing cookies.`);
      const response = NextResponse.json(
        {
          success: false,
          error: "Account not found or session expired. Please log in or register.",
          code: "USER_NOT_FOUND",
        },
        { status: 401 }
      );

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

    // Valid existing user
    return NextResponse.json({
      success: true,
      user: {
        userId: dbUser?.userId || user.userId,
        email: dbUser?.email || user.email,
        name: dbUser?.name || `${dbUser?.firstName || ""} ${dbUser?.lastName || ""}`.trim() || user.name,
        role: dbUser?.role || user.role,
        status: dbUser?.status || "active",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching user:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
