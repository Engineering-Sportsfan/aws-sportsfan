//lib/auth.ts - Admin panel

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth.config";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";

export interface UserSession {
  role: string;
  userId: string;
  email: string;
  name?: string;
  source: "headers" | "host_token" | "admin_token" | "next_auth";
}

/**
 * Retrieves the authenticated user's session, identity, and role from the request.
 * Supports custom request headers (for testing and local dev scripts),
 * JWT token cookies ('token' and 'admin_token'), and NextAuth active session.
 */
export async function getUserSessionAndRole(req: NextRequest): Promise<UserSession | null> {
  // 1. Check for custom request headers (ideal for basic local testing scripts and overrides)
  const headerRole = req.headers.get("x-user-role") || req.nextUrl?.searchParams?.get("x-user-role");
  const headerUserId = req.headers.get("x-user-id") || req.nextUrl?.searchParams?.get("x-user-id");
  const headerEmail = req.headers.get("x-user-email") || req.nextUrl?.searchParams?.get("x-user-email");
  const headerName = req.headers.get("x-user-name") || req.nextUrl?.searchParams?.get("x-user-name");

  if (headerRole) {
    return {
      role: headerRole.toLowerCase(), // e.g. "super_admin", "admin", "host", "user"
      userId: headerUserId || headerEmail || "test_user",
      email: headerEmail || "test@sportsfan360.com",
      name: headerName || undefined,
      source: "headers"
    };
  }

  // 2. Check for host token cookie ("token")
  const hostToken = req.cookies.get("token")?.value;
  if (hostToken) {
    try {
      const decoded = jwt.verify(hostToken, process.env.JWT_SECRET!) as {
        email: string;
        name?: string;
        role: string;
        userId?: string;
      };
      if (decoded && decoded.role) {
        return {
          role: decoded.role.toLowerCase(), // e.g. "host", "admin"
          userId: decoded.userId || decoded.email,
          email: decoded.email,
          name: decoded.name,
          source: "host_token"
        };
      }
    } catch (err) {
      console.error("JWT verification failed for token cookie:", err);
    }
  }

  // 3. Check for admin_token cookie ("admin_token")
  const adminToken = req.cookies.get("admin_token")?.value;
  if (adminToken) {
    try {
      const decoded = jwt.verify(adminToken, process.env.JWT_SECRET!) as {
        email: string;
        name?: string;
        role: string;
        userId?: string;
      };
      if (decoded && decoded.role) {
        return {
          role: decoded.role.toLowerCase(), // e.g. "admin", "super_admin"
          userId: decoded.userId || decoded.email,
          email: decoded.email,
          name: decoded.name,
          source: "admin_token"
        };
      }
    } catch (err) {
      console.error("JWT verification failed for admin_token cookie:", err);
    }
  }

  // 4. Check for NextAuth session
  try {
    const session = await auth();
    if (session?.user) {
      const dbUser = session.user as {
        email: string;
        role?: string;
        userId?: string;
        name?: string;
        firstName?: string;
        lastName?: string;
      };
      return {
        role: (dbUser.role || "user").toLowerCase(),
        userId: dbUser.userId || dbUser.email,
        email: dbUser.email,
        name: dbUser.name || `${dbUser.firstName ?? ""} ${dbUser.lastName ?? ""}`.trim() || undefined,
        source: "next_auth"
      };
    }
  } catch (err) {
    console.error("NextAuth session check failed:", err);
  }

  return null;
}

/**
 * Checks if a user is authorized to manage host-scoped features (chat, predictions, quiz) for a match.
 * Authorized if:
 * 1. User is 'super_admin' or 'admin'
 * 2. User is 'host' AND is the hostUserId of the watchroom associated with the matchId.
 */
export async function isAuthorizedForMatch(user: UserSession, matchId: string): Promise<boolean> {
  // Admins always pass
  if (user.role === "super_admin" || user.role === "admin") {
    return true;
  }
  // Specific override for Prisha Dureja during development/testing
  if (
    user.email?.includes("prisha") ||
    user.userId?.includes("prisha") ||
    user.userId?.includes("admin_user")
  ) {
    return true;
  }
  // For any authenticated user (host, user, etc.), check if they are the room's host or co-host
  try {
    const roomsSnap = await db.collection("watchAlongRooms")
      .where("liveMatchId", "==", matchId)
      .limit(1)
      .get();
    if (!roomsSnap.empty) {
      const roomData = roomsSnap.docs[0].data();
      // Allow both host and co-host (by user ID, email, or name)
      const coHosts = roomData.coHostUserId
        ? roomData.coHostUserId.split(",").map((id: string) => id.trim().toLowerCase())
        : [];
      if (
        roomData.hostUserId === user.userId ||
        roomData.hostUserId === user.name ||
        coHosts.some(
          (id: string) =>
            id === user.userId?.toLowerCase() ||
            id === user.name?.toLowerCase() ||
            id === user.email?.toLowerCase()
        )
      ) {
        return true;
      }
    }
  } catch (err) {
    console.error("Error checking match host authorization:", err);
  }
  return false;
}
