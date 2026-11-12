import { NextRequest } from "next/server";
import * as jwt from "jsonwebtoken";

export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  // Fail closed: never verify tokens against a guessable default secret.
  // Resolved at call time (not import time) so `next build` still works without the variable.
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured; refusing to verify tokens with a default secret");
  }

  try {

    // 1. Try httpOnly cookie
    const cookieToken = req.cookies.get("token")?.value;
    if (cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, JWT_SECRET) as AuthUser;
        return decoded;
      } catch {
        // Cookie is invalid, try Bearer token
      }
    }

    // 2. Try Authorization Bearer header
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const bearerToken = authHeader.substring(7);
      try {
        const decoded = jwt.verify(bearerToken, JWT_SECRET) as AuthUser;
        return decoded;
      } catch {
        // Bearer token is invalid
      }
    }

    return null;
  } catch (error) {
    console.error("Error verifying auth user:", error);
    return null;
  }
}
