import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/getAuthUser";
import { docClient } from "@/lib/dynamodb";
import { db } from "@/lib/firebaseAdmin";
import { TABLES } from "@/lib/tableNames";
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

    // If check was attempted and user does NOT exist in DB (account was cleaned/deleted):
    // Forcefully invalidate the orphaned session and clear all cookies
    if (dbCheckAttempted && !exists) {
      console.warn(`[/api/auth/me] ⚠️ Orphaned session detected for [${cleanEmail || cleanUid}]. User no longer exists in database. Clearing cookies.`);
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
