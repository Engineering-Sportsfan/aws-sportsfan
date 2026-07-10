import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const snap = await db.collection("departments").orderBy("createdAt", "desc").get();
    const departments = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));
    return NextResponse.json({ departments, total: departments.length });
  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS GET ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, departmentHeadId, description, isActive } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Department name is required" },
        { status: 400 }
      );
    }

    const newDeptData = {
      name,
      departmentHeadId: departmentHeadId || null,
      description: description || "",
      isActive: isActive !== undefined ? isActive : true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const newDeptRef = await db.collection("departments").add(newDeptData);

    return NextResponse.json({
      success: true,
      department: { id: newDeptRef.id, ...newDeptData }
    }, { status: 201 });

  } catch (error: unknown) {
    console.error("ADMIN DEPARTMENTS POST ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
