// lib/getCurrentUser.ts  — BACKEND project
//
// Same logic as /api/auth/host/me which already works in LiveRoomsCard.
// Reads the "token" cookie (set by /api/auth/login) OR the Authorization
// header (fallback for Google users who get a token via /api/auth/google-signup).

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

interface CurrentUser {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export async function getCurrentUser(
  req: NextRequest,
): Promise<CurrentUser | null> {
  // ── 1. Cookie (email/password users) — same as /api/auth/host/me ────────────
  // This works because frontend & backend share the same domain, so the
  // httpOnly "token" cookie is automatically sent with every fetch/axios call.
  const cookieToken = req.cookies.get("token")?.value;

  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        name?: string;
        role?: string;
      };
      if (payload.email) {
        return {
          userId:
            payload.userId ??
            payload.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_"),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {
      // Expired or tampered — fall through
    }
  }

  // ── 2. Authorization header (Google users) ───────────────────────────────────
  // Google users go through /api/auth/google-signup on the backend which returns
  // a userId. The frontend NextAuth jwt callback stores it in the session.
  // AuthContext then sets userId = session.user.userId (or falls back to email).
  // We issue them a JWT via /api/auth/session-token so this header path works too.
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        name?: string;
        role?: string;
      };
      if (payload.email) {
        return {
          userId:
            payload.userId ??
            payload.email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_"),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {
      // Invalid token
    }
  }

  return null;
}
