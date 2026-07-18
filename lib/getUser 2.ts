//lib/getUser.ts

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { auth } from "@/lib/auth.config";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
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
        return {
          userId,
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
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
        return {
          userId,
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
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
      // const userId = dbUser.userId || email;
      const userId = dbUser.userId || email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");

      if (email) {
        return {
          userId,
          email,
          name: dbUser.name || `${dbUser.firstName ?? ""} ${dbUser.lastName ?? ""}`.trim() || "",
          role: dbUser.role || "user",
        };
      }
    }
  } catch (err) {
    console.error("NextAuth session check failed in getUser:", err);
  }

  return null;
}

