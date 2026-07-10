// Main Frontend: app/api/auth/change-password/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import bcrypt from "bcryptjs";

// export async function POST(req: NextRequest) {
//   try {
//     const { email, currentPassword, newPassword } = await req.json();

//     if (!email || !currentPassword || !newPassword) {
//       return NextResponse.json(
//         { error: "Email, current password, and new password required" },
//         { status: 400 }
//       );
//     }

//     const userRef = db.collection("users").doc(email);
//     const userDoc = await userRef.get();

//     if (!userDoc.exists) {
//       return NextResponse.json({ error: "User not found" }, { status: 404 });
//     }

//     const user = userDoc.data()!;

//     // Verify current password
//     const isMatch = await bcrypt.compare(currentPassword, user.password);
//     if (!isMatch) {
//       return NextResponse.json(
//         { error: "Current password is incorrect" },
//         { status: 401 }
//       );
//     }

//     // Hash new password
//     const hashedNewPassword = await bcrypt.hash(newPassword, 10);

//     // Update password and reset first login flag
//     await userRef.update({
//       password: hashedNewPassword,
//       isFirstLogin: false,
//       passwordChangedAt: Date.now(),
//       updatedAt: Date.now(),
//     });

//     return NextResponse.json({
//       success: true,
//       message: "Password changed successfully",
//     });

//   } catch (error) {
//     console.error("Change password error:", error);
//     return NextResponse.json(
//       { error: "Failed to change password" },
//       { status: 500 }
//     );
//   }
// }









import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, currentPassword, newPassword } = await req.json();

    if (!email || !currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Email, current password, and new password required" },
        { status: 400 }
      );
    }

    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userDoc.data()!;

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password and reset first login flag
    await userRef.update({
      password: hashedNewPassword,
      isFirstLogin: false,
      passwordChangedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      success: true,
      message: "Password changed successfully",
    });

  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "Failed to change password" },
      { status: 500 }
    );
  }
}





