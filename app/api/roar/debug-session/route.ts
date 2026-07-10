import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { auth } from "@/lib/auth.config";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const adminToken = req.cookies.get("admin_token")?.value;

  let tokenPayload = null;
  let tokenError = null;
  let adminTokenPayload = null;
  let adminTokenError = null;
  let nextAuthSession = null;
  let nextAuthError = null;

  const secret = process.env.JWT_SECRET;

  if (token) {
    try {
      tokenPayload = jwt.verify(token, secret!);
    } catch (err: any) {
      tokenError = err.message;
    }
  }

  if (adminToken) {
    try {
      adminTokenPayload = jwt.verify(adminToken, secret!);
    } catch (err: any) {
      adminTokenError = err.message;
    }
  }

  try {
    nextAuthSession = await auth();
  } catch (err: any) {
    nextAuthError = err.message;
  }

  const allCookies = req.cookies.getAll().map(c => ({ name: c.name, valueExists: !!c.value }));

  return NextResponse.json({
    hasSecret: !!secret,
    secretLength: secret ? secret.length : 0,
    cookiesPresent: {
      token: !!token,
      adminToken: !!adminToken,
    },
    allCookies,
    tokenPayload,
    tokenError,
    adminTokenPayload,
    adminTokenError,
    nextAuthSession,
    nextAuthError,
  });
}

