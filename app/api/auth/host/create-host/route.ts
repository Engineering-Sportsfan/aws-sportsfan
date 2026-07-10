// Admin Panel: app/api/admin/create-host/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import bcrypt from "bcryptjs";

// export async function POST(req: NextRequest) {
//   try {
//     const { email, firstName, lastName, temporaryPassword } = await req.json();

//     if (!email || !firstName || !lastName || !temporaryPassword) {
//       return NextResponse.json(
//         { error: "All fields are required" },
//         { status: 400 }
//       );
//     }

//     // Check if user already exists
//     const userRef = db.collection("users").doc(email);
//     const userDoc = await userRef.get();

//     if (userDoc.exists) {
//       return NextResponse.json(
//         { error: "User already exists" },
//         { status: 409 }
//       );
//     }

//     // Hash temporary password
//     const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

//     // Create host account
//     await userRef.set({
//       email,
//       firstName,
//       lastName,
//       role: "host",
//       status: "active",
//       isFirstLogin: true, // ← Forces password change on first login
//       password: hashedPassword,
//       createdAt: Date.now(),
//       updatedAt: Date.now(),
//       createdBy: "admin",
//       source: "admin_panel",
//     });

//     return NextResponse.json({
//       success: true,
//       message: "Host account created successfully",
//       credentials: {
//         email,
//         temporaryPassword,
//       },
//     });

//   } catch (error) {
//     console.error("Create host error:", error);
//     return NextResponse.json(
//       { error: "Failed to create host account" },
//       { status: 500 }
//     );
//   }
// }







import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, firstName, lastName, temporaryPassword } = await req.json();

    if (!email || !firstName || !lastName || !temporaryPassword) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // Hash temporary password
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Create host account
    await userRef.set({
      email,
      firstName,
      lastName,
      role: "host",
      status: "active",
      isFirstLogin: true, // ← Forces password change on first login
      password: hashedPassword,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: "admin",
      source: "admin_panel",
    });

    return NextResponse.json({
      success: true,
      message: "Host account created successfully",
      credentials: {
        email,
        temporaryPassword,
      },
    });

  } catch (error) {
    console.error("Create host error:", error);
    return NextResponse.json(
      { error: "Failed to create host account" },
      { status: 500 }
    );
  }
}