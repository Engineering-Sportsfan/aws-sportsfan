// lib/authhelper.ts

import { auth } from "@/lib/auth.config";
import { NextRequest } from "next/server";

export async function getUserId(req: NextRequest): Promise<string | null> {
  try {
    console.log("auth helper req:", req);
    const session = await auth();
    if (!session?.user?.email) return null;

    // Return the consistent userId stored in the session (set in jwt callback)
    const user = session.user as { userId?: string; email?: string };
    return user.userId ?? user.email ?? null;
  } catch {
    return null;
  }
}