import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email & password required" },
        { status: 400 }
      );
    }

    const adminRef = db.collection("admin_users").doc(email);
    const adminDoc = await adminRef.get();

    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    const adminUser = adminDoc.data()!;

    if (adminUser.status === "disabled" || adminUser.status === "inactive") {
      return NextResponse.json(
        { error: "Your admin account is disabled." },
        { status: 403 }
      );
    }

    const isMatch = await bcrypt.compare(password, adminUser.password);

    if (!isMatch) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    const requiresPasswordChange = adminUser.isFirstLogin === true;

    const token = jwt.sign(
      {
        email: adminUser.email,
        name: `${adminUser.firstName} ${adminUser.lastName}`,
        role: adminUser.role ?? "admin",
        departmentId: adminUser.departmentId ?? null,
        isFirstLogin: adminUser.isFirstLogin ?? false,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "8h" } // Strictly 8 hours for admin as per v7.0
    );

    const response = NextResponse.json({
      success: true,
      requiresPasswordChange: requiresPasswordChange,
      user: {
        email: adminUser.email,
        name: `${adminUser.firstName} ${adminUser.lastName}`,
        role: adminUser.role ?? "admin",
        departmentId: adminUser.departmentId ?? null,
        isFirstLogin: adminUser.isFirstLogin ?? false,
      },
    });

    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 8 * 60 * 60,
      path: "/",
    });

    return response;

  } catch (error: unknown) {
    console.error("ADMIN LOGIN ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
