import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    // Only extract fields that are allowed to be updated
    const { status, roles, departmentId, phone } = body;

    const adminRef = db.collection("admin_users").doc(id);
    const adminDoc = await adminRef.get();

    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, any> = { updatedAt: Date.now() };
    if (status !== undefined) updateData.status = status;
    if (roles !== undefined) updateData.roles = roles;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (phone !== undefined) updateData.phone = phone;

    await adminRef.update(updateData);

    return NextResponse.json({ success: true, message: "User updated successfully" });

  } catch (error: unknown) {
    console.error("ADMIN USERS PATCH ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const adminRef = db.collection("admin_users").doc(id);
    const adminDoc = await adminRef.get();

    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: "Admin user not found" },
        { status: 404 }
      );
    }

    await adminRef.delete();

    return NextResponse.json({
      success: true,
      message: "Admin user deleted successfully",
    });

  } catch (error: unknown) {
    console.error("ADMIN USERS DELETE ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
