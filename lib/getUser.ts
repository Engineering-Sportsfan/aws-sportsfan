import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { auth } from "@/lib/auth.config";
import { docClient } from "@/lib/dynamodb";
import { TABLES } from "@/lib/tableNames";
import { dualWrite } from "@/lib/dualWrite";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
}

const verifiedUserCache = new Set<string>();

/**
 * Safe JIT Provisioning:
 * Checks if authenticated user has a record in DynamoDB (IdentityAndAccess).
 * If missing, automatically creates it without overwriting any existing users.
 */
async function ensureUserProvisioned(user: AuthUser) {
  if (!user.email) return;
  const cleanEmail = user.email.trim().toLowerCase();
  if (verifiedUserCache.has(cleanEmail)) return;

  try {
    const directGet = await docClient.send(
      new GetCommand({
        TableName: TABLES.IdentityAndAccess,
        Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
      })
    );

    if (directGet.Item) {
      verifiedUserCache.add(cleanEmail);
      return;
    }

    const now = Date.now();
    const nameParts = (user.name || "").trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";
    const username = user.name?.trim() || cleanEmail.split("@")[0];

    const dynamoItem = {
      entityId: `USER#${cleanEmail}`,
      sk: "USER#META",
      email: cleanEmail,
      userId: user.userId,
      firstName,
      lastName,
      username,
      role: user.role || "user",
      status: "active",
      isVerified: true,
      authProviders: { google: true, emailPassword: false },
      totalPoints: 0,
      pointsBreakdown: {},
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    await dualWrite("users", cleanEmail, TABLES.IdentityAndAccess, dynamoItem);
    console.log(`[JIT Provisioning] ⚡ Auto-provisioned missing user in DynamoDB (${TABLES.IdentityAndAccess}) -> USER#${cleanEmail}`);
    verifiedUserCache.add(cleanEmail);
  } catch (err: any) {
    console.warn(`[JIT Provisioning] Notice for ${cleanEmail}:`, err?.message || err);
  }
}

export async function getUser(req: NextRequest): Promise<AuthUser | null> {
  const cookieToken = req.cookies.get("token")?.value || req.cookies.get("admin_token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        const user: AuthUser = {
          userId,
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
        await ensureUserProvisioned(user);
        return user;
      }
    } catch {
      /* fall through */
    }
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        const user: AuthUser = {
          userId,
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
        await ensureUserProvisioned(user);
        return user;
      }
    } catch {
      /* invalid */
    }
  }

  // Fallback to NextAuth session
  try {
    const session = await auth();
    console.log("[getUser] session:", JSON.stringify(session)); 
    if (session?.user) {
      const dbUser = session.user as {
        email: string;
        role?: string;
        userId?: string;
        name?: string;
        firstName?: string;
        lastName?: string;
      };
      const email = dbUser.email;
      const userId = dbUser.userId || email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");

      if (email) {
        const user: AuthUser = {
          userId,
          email,
          name: dbUser.name || `${dbUser.firstName ?? ""} ${dbUser.lastName ?? ""}`.trim() || "",
          role: dbUser.role || "user",
        };
        await ensureUserProvisioned(user);
        return user;
      }
    }
  } catch (err) {
    console.error("NextAuth session check failed in getUser:", err);
  }

  return null;
}

