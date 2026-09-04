// app/api/admin-auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { logUserActivity } from "@/lib/logUserActivity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let email = "";
    let userName = "Admin";
    let userId = "";

    // 1. Try extracting admin identity from admin_token cookie
    const adminToken = req.cookies.get("admin_token")?.value;
    if (adminToken) {
      try {
        const decoded: any = jwt.decode(adminToken);
        if (decoded) {
          email = decoded.email || "";
          userId = decoded.adminId || decoded.userId || (email ? email.replace(/[^a-zA-Z0-9]/g, "_") : "");
          userName = decoded.name || decoded.userName || "Admin";
        }
      } catch {}
    }

    // 2. Also check request body if supplied
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.email && !email) email = body.email;
      if (body?.userId && !userId) userId = body.userId;
      if (body?.name && userName === "Admin") userName = body.name;
    } catch {}

    // 3. Log admin logout activity date-wise
    if (email) {
      try {
        await logUserActivity({
          req,
          email,
          userId: userId || email.replace(/[^a-zA-Z0-9]/g, "_"),
          userName,
          action: "logout",
          metadata: { role: "admin" },
        });
      } catch (logErr) {
        console.warn("Admin logout activity logging notice:", logErr);
      }
    }

    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    
    // Clear admin_token cookie
    response.cookies.set("admin_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    
    return response;
  } catch (error: unknown) {
    console.error("ADMIN LOGOUT ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
