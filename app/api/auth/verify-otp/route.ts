//api/auth/verify-otp/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { VerifyOtpRequest } from "@/types/auth";

// export async function POST(req: NextRequest) {
//   try {
//     const { email, otp }: VerifyOtpRequest = await req.json();

//     if (!email || !otp) {
//       return NextResponse.json({ error: "Email & OTP required" }, { status: 400 });
//     }

//     // ── 1. Get OTP doc ────────────────────────────
//     const otpDoc = await db.collection("otps").doc(email).get();

//     if (!otpDoc.exists) {
//       return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
//     }

//     const data = otpDoc.data()!;

//     // ── 2. Check expiry FIRST (before checking value) ─
//     if (Date.now() > data.expiresAt) {
//       await db.collection("otps").doc(email).delete(); // clean up expired OTP
//       return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
//     }

//     // ── 3. Check OTP value ────────────────────────
//     if (data.otp !== otp) {
//       return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
//     }

//     // ── 4. Mark user as verified ──────────────────
//     // ✅ set() with merge:true works whether doc exists or not
//     await db.collection("users").doc(email).set(
//       {
//         email,
//         isVerified: true,
//         verifiedAt: Date.now(),
//       },
//       { merge: true }   // won't overwrite firstName, lastName, createdAt etc.
//     );

//     // ── 5. Delete used OTP ────────────────────────
//     await db.collection("otps").doc(email).delete();

//     return NextResponse.json({
//       success: true,
//       message: "OTP verified successfully",
//     });

//   } catch (error: unknown) {
//     console.error("❌ ERROR:", error);
//     const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
//     return NextResponse.json(
//       { error: errorMessage },
//       { status: 500 }
//     );
//   }
// }




//api/auth/verify-otp/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { VerifyOtpRequest } from "@/types/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, otp }: VerifyOtpRequest = await req.json();

    if (!email || !otp) {
      return NextResponse.json({ error: "Email & OTP required" }, { status: 400 });
    }

    // ── 1. Get OTP doc ────────────────────────────
    const otpDoc = await db.collection("otps").doc(email).get();

    if (!otpDoc.exists) {
      return NextResponse.json({ error: "OTP not found. Please request a new one." }, { status: 400 });
    }

    const data = otpDoc.data()!;

    // ── 2. Check expiry FIRST (before checking value) ─
    if (Date.now() > data.expiresAt) {
      await db.collection("otps").doc(email).delete(); // clean up expired OTP
      return NextResponse.json({ error: "OTP expired. Please request a new one." }, { status: 400 });
    }

    // ── 3. Check OTP value ────────────────────────
    if (data.otp !== otp) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }

    // ── 4. Mark user as verified ──────────────────
    // ✅ set() with merge:true works whether doc exists or not
    await db.collection("users").doc(email).set(
      {
        email,
        isVerified: true,
        verifiedAt: Date.now(),
      },
      { merge: true }   // won't overwrite firstName, lastName, createdAt etc.
    );

    // ── 5. Delete used OTP ────────────────────────
    await db.collection("otps").doc(email).delete();

    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (error: unknown) {
    console.error("ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}