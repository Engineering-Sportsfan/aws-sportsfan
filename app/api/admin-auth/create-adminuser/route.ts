import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const snap = await db.collection("admin_users").orderBy("createdAt", "desc").get();
    const users = snap.docs.map(d => ({
      email: d.id,
      ...d.data(),
    }));
    return NextResponse.json({ users, total: users.length });
  } catch (error: unknown) {
    console.error("ADMIN USERS GET ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, firstName, lastName, phone, employeeId, departmentId, roles } = body;

    if (!email || !firstName || !lastName) {
      return NextResponse.json(
        { error: "Missing required fields (email, firstName, lastName)" },
        { status: 400 }
      );
    }

    const adminRef = db.collection("admin_users").doc(email);
    const adminDoc = await adminRef.get();

    if (adminDoc.exists) {
      return NextResponse.json(
        { error: "Admin user already exists with this email" },
        { status: 409 }
      );
    }

    // Generate a secure temporary password (like Google Workspace)
    const generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    const newAdminData = {
      email,
      firstName,
      lastName,
      phone: phone || null,
      employeeId: employeeId || null,
      departmentId: departmentId || null,
      password: hashedPassword,
      isFirstLogin: true, // Flag for forcing password change on first login
      roles: roles || ["sf360Staff"],
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await adminRef.set(newAdminData);

    // Don't send hashedPassword back, but DO return the generated password 
    // so the admin can securely share it with the new user (or it would be emailed).
    const { password: _, ...safeAdminData } = newAdminData;

    return NextResponse.json({
      success: true,
      user: safeAdminData,
      generatedPassword: generatedPassword, // Admin UI can display this once
    }, { status: 201 });

  } catch (error: unknown) {
    console.error("ADMIN USERS POST ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
