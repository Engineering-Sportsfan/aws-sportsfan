import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";



export async function GET() {
  const snap = await db.collection("users").orderBy("createdAt", "desc").get();
  const users = snap.docs.map(d => ({
    email: d.id,
    ...d.data(),
    // default status/role if old users don't have it
    status: d.data().status ?? "active",
    role: d.data().role ?? "user",
  }));
  return NextResponse.json({ users, total: users.length });
}


export async function PATCH(req: NextRequest) {
  const { email, status, role } = await req.json();

  await db.collection("users").doc(email).update({
    ...(status !== undefined && { status }),
    ...(role !== undefined && { role }),
    updatedAt: Date.now(),
  });

  return NextResponse.json({ success: true });
}


export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email required" },
        { status: 400 }
      );
    }

    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }


    await userRef.delete();


    await db.collection("otps").doc(email).delete();

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });

  } catch (error: unknown) {
    console.error("❌ ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}