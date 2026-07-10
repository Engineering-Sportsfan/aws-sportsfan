import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    // Only extract fields that are allowed to be updated
    const { name, departmentHeadId, description, isActive } = body;

    const deptRef = db.collection("departments").doc(id);
    const deptDoc = await deptRef.get();

    if (!deptDoc.exists) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, any> = { updatedAt: Date.now() };
    if (name !== undefined) updateData.name = name;
    if (departmentHeadId !== undefined) updateData.departmentHeadId = departmentHeadId;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    await deptRef.update(updateData);

    return NextResponse.json({ success: true, message: "Department updated successfully" });

  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS PATCH ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    const deptRef = db.collection("departments").doc(id);
    const deptDoc = await deptRef.get();

    if (!deptDoc.exists) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    await deptRef.delete();

    return NextResponse.json({
      success: true,
      message: "Department deleted successfully",
    });

  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS DELETE ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
