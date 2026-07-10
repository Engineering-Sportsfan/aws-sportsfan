// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import jwt from "jsonwebtoken";

// export async function POST(req: NextRequest) {
//   try {
//     const { email, otp } = await req.json();

//     if (!email || !otp) {
//       return NextResponse.json(
//         { error: "Email & OTP required" },
//         { status: 400 }
//       );
//     }

//     //  1. Get OTP doc 
//     const otpDoc = await db.collection("otps").doc(email).get();

//     if (!otpDoc.exists) {
//       return NextResponse.json(
//         { error: "OTP not found. Please request a new one." },
//         { status: 400 }
//       );
//     }

//     const data = otpDoc.data()!;

//     //  2. Check it's a forgot-password OTP 
//     if (data.type !== "forgot-password") {
//       return NextResponse.json(
//         { error: "Invalid OTP type. Please request a new one." },
//         { status: 400 }
//       );
//     }

//     //  3. Check expiry 
//     if (Date.now() > data.expiresAt) {
//       await db.collection("otps").doc(email).delete();
//       return NextResponse.json(
//         { error: "OTP expired. Please request a new one." },
//         { status: 400 }
//       );
//     }

//     //  4. Check OTP value 
//     if (data.otp !== otp) {
//       return NextResponse.json(
//         { error: "Invalid OTP. Please try again." },
//         { status: 400 }
//       );
//     }

//     //  5. Delete used OTP 
//     await db.collection("otps").doc(email).delete();

//     //  6. Issue short-lived reset token 
//     // This token is passed to the reset-password step
//     // so we know the user actually verified their OTP
//     const resetToken = jwt.sign(
//       { email, purpose: "password-reset" },
//       process.env.JWT_SECRET as string,
//       { expiresIn: "10m" }   // 10 minutes to complete reset
//     );

//     return NextResponse.json({
//       success: true,
//       message: "OTP verified",
//       resetToken,             // frontend sends this to reset-password step
//     });

//   } catch (error: unknown) {
//     console.error("forgot-password/verify-otp ERROR:", error);
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }










import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email & OTP required" },
        { status: 400 }
      );
    }

    //  1. Get OTP doc 
    const otpDoc = await db.collection("otps").doc(email).get();

    if (!otpDoc.exists) {
      return NextResponse.json(
        { error: "OTP not found. Please request a new one." },
        { status: 400 }
      );
    }

    const data = otpDoc.data()!;

    //  2. Check it's a forgot-password OTP 
    if (data.type !== "forgot-password") {
      return NextResponse.json(
        { error: "Invalid OTP type. Please request a new one." },
        { status: 400 }
      );
    }

    //  3. Check expiry 
    if (Date.now() > data.expiresAt) {
      await db.collection("otps").doc(email).delete();
      return NextResponse.json(
        { error: "OTP expired. Please request a new one." },
        { status: 400 }
      );
    }

    //  4. Check OTP value 
    if (data.otp !== otp) {
      return NextResponse.json(
        { error: "Invalid OTP. Please try again." },
        { status: 400 }
      );
    }

    //  5. Delete used OTP 
    await db.collection("otps").doc(email).delete();

    //  6. Issue short-lived reset token 
    // This token is passed to the reset-password step
    // so we know the user actually verified their OTP
    const resetToken = jwt.sign(
      { email, purpose: "password-reset" },
      process.env.JWT_SECRET as string,
      { expiresIn: "10m" }   // 10 minutes to complete reset
    );

    return NextResponse.json({
      success: true,
      message: "OTP verified",
      resetToken,             // frontend sends this to reset-password step
    });

  } catch (error: unknown) {
    console.error("forgot-password/verify-otp ERROR:", error);
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}