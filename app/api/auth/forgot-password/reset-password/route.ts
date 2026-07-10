
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";

// export async function POST(req: NextRequest) {
//   try {
//     const { resetToken, password } = await req.json();

//     if (!resetToken || !password) {
//       return NextResponse.json(
//         { error: "Reset token & password required" },
//         { status: 400 }
//       );
//     }

//     if (password.length < 8) {
//       return NextResponse.json(
//         { error: "Password must be at least 8 characters" },
//         { status: 400 }
//       );
//     }

//     //  1. Verify reset token 
//     let decoded: { email: string; purpose: string };
//     try {
//       decoded = jwt.verify(
//         resetToken,
//         process.env.JWT_SECRET as string
//       ) as { email: string; purpose: string };
//     } catch {
//       return NextResponse.json(
//         { error: "Reset link expired or invalid. Please start over." },
//         { status: 401 }
//       );
//     }

//     //  2. Make sure it's a password-reset token 
//     if (decoded.purpose !== "password-reset") {
//       return NextResponse.json(
//         { error: "Invalid reset token." },
//         { status: 401 }
//       );
//     }

//     const { email } = decoded;

//     //  3. Check user still exists 
//     const userRef = db.collection("users").doc(email);
//     const userDoc = await userRef.get();

//     if (!userDoc.exists) {
//       return NextResponse.json(
//         { error: "User not found." },
//         { status: 404 }
//       );
//     }

//     const user = userDoc.data()!;

//     if (user.status === "disabled") {
//       return NextResponse.json(
//         { error: "Your account has been disabled. Contact support." },
//         { status: 403 }
//       );
//     }

//     //  4. Hash & save new password 
//     const hashedPassword = await bcrypt.hash(password, 10);

//     await userRef.update({
//       password:            hashedPassword,
//       passwordUpdatedAt:   Date.now(),
//       updatedAt:           Date.now(),
//     });

//     console.log("Password reset successfully for:", email);

//     return NextResponse.json({
//       success: true,
//       message: "Password reset successfully. You can now log in.",
//     });

//   } catch (error: unknown) {
//     console.error("reset-password ERROR:", error);
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }









import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  try {
    const { resetToken, password } = await req.json();

    if (!resetToken || !password) {
      return NextResponse.json(
        { error: "Reset token & password required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    //  1. Verify reset token 
    let decoded: { email: string; purpose: string };
    try {
      decoded = jwt.verify(
        resetToken,
        process.env.JWT_SECRET as string
      ) as { email: string; purpose: string };
    } catch {
      return NextResponse.json(
        { error: "Reset link expired or invalid. Please start over." },
        { status: 401 }
      );
    }

    //  2. Make sure it's a password-reset token 
    if (decoded.purpose !== "password-reset") {
      return NextResponse.json(
        { error: "Invalid reset token." },
        { status: 401 }
      );
    }

    const { email } = decoded;

    //  3. Check user still exists 
    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const user = userDoc.data()!;

    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "Your account has been disabled. Contact support." },
        { status: 403 }
      );
    }

    //  4. Hash & save new password 
    const hashedPassword = await bcrypt.hash(password, 10);

    await userRef.update({
      password:            hashedPassword,
      passwordUpdatedAt:   Date.now(),
      updatedAt:           Date.now(),
    });

    console.log("Password reset successfully for:", email);

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });

  } catch (error: unknown) {
    console.error("reset-password ERROR:", error);
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}