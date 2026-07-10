// api/auth/login/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";

// export async function POST(req: NextRequest) {
//   try {
//     const { email, password } = await req.json();

//     if (!email || !password) {
//       return NextResponse.json(
//         { error: "Email & password required" },
//         { status: 400 }
//       );
//     }

//     const userRef = db.collection("users").doc(email);
//     const userDoc = await userRef.get();

//     if (!userDoc.exists) {
//       return NextResponse.json(
//         { error: "User not found" },
//         { status: 404 }
//       );
//     }

//     const user = userDoc.data()!;

//     // ── 1. Check verified (skip for hosts created by admin) ──
//     if (user.role !== "host" && !user.isVerified) {
//       return NextResponse.json(
//         { error: "Please verify OTP first" },
//         { status: 403 }
//       );
//     }

//     // ── 2. Check account status ───────────────────
//     if (user.status === "disabled") {
//       return NextResponse.json(
//         { error: "Your account has been disabled. Contact support." },
//         { status: 403 }
//       );
//     }

//     // ── 3. Check password ─────────────────────────
//     const isMatch = await bcrypt.compare(password, user.password);

//     if (!isMatch) {
//       return NextResponse.json(
//         { error: "Invalid credentials" },
//         { status: 401 }
//       );
//     }

//     // ── 4. Check if host needs to change password on first login ──
//     const requiresPasswordChange = user.role === "host" && user.isFirstLogin === true;

//     // ── 4.5 Backfill userId if missing ─────────────── ← ADD THIS BLOCK
//     if (!user.userId) {
//       const generatedUserId = `${user.firstName.toLowerCase()}_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
//       await userRef.update({ userId: generatedUserId });
//       user.userId = generatedUserId;
//     }


//     // ── 5. Create JWT token ───────────────────────
//     const token = jwt.sign(
//       {
//         email: user.email,
//         userId: user.userId,
//         name: `${user.firstName} ${user.lastName}`,
//         role: user.role ?? "user",
//         status: user.status ?? "active",
//         isFirstLogin: user.isFirstLogin ?? false,
//       },
//       process.env.JWT_SECRET as string,
//       { expiresIn: "7d" }
//     );

//     // ── 6. Build response with requiresPasswordChange flag ──
//     const response = NextResponse.json({
//       success: true,
//       requiresPasswordChange: requiresPasswordChange, // ← Add this flag
//       user: {
//         email: user.email,
//         name: `${user.firstName} ${user.lastName}`,
//         userId: user.userId,
//         role: user.role ?? "user",
//         status: user.status ?? "active",
//         isFirstLogin: user.isFirstLogin ?? false,
//       },
//     });

//     // ── 7. Set HTTP-only cookies ───────────────────
//     response.cookies.set("token", token, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       sameSite: "strict",
//       maxAge: 7 * 24 * 60 * 60,
//       path: "/",
//     });

//     return response;

//   } catch (error: unknown) {
//     console.error("LOGIN ERROR:", error);
//     const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
//     return NextResponse.json(
//       { error: errorMessage },
//       { status: 500 }
//     );
//   }
// }






// api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email & password required" },
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

    const user = userDoc.data()!;

    // ── 1. Check verified (skip for hosts created by admin) ──
    if (user.role !== "host" && !user.isVerified) {
      return NextResponse.json(
        { error: "Please verify OTP first" },
        { status: 403 }
      );
    }

    // ── 2. Check account status ───────────────────
    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "Your account has been disabled. Contact support." },
        { status: 403 }
      );
    }

    // ── 3. Check password ─────────────────────────
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // ── 4. Check if host needs to change password on first login ──
    const requiresPasswordChange = user.role === "host" && user.isFirstLogin === true;

    // ── 4.5 Backfill userId if missing ─────────────── ← ADD THIS BLOCK
    // if (!user.userId) {
    //   const generatedUserId = `${user.firstName.toLowerCase()}_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
    //   await userRef.update({ userId: generatedUserId });
    //   user.userId = generatedUserId;
    // }
    if (!user.userId || user.userId.startsWith("google_")) {
    // Generate consistent ID
    const consistentUserId = email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
    await userRef.update({ userId: consistentUserId });
    user.userId = consistentUserId;
}


    // ── 5. Create JWT token ───────────────────────
    const token = jwt.sign(
      {
        email: user.email,
        userId: user.userId,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role ?? "user",
        status: user.status ?? "active",
        isFirstLogin: user.isFirstLogin ?? false,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    // ── 6. Build response with requiresPasswordChange flag ──
    const response = NextResponse.json({
      success: true,
      requiresPasswordChange: requiresPasswordChange, // ← Add this flag
      user: {
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        userId: user.userId,
        role: user.role ?? "user",
        status: user.status ?? "active",
        isFirstLogin: user.isFirstLogin ?? false,
      },
    });

    // ── 7. Set HTTP-only cookies ───────────────────
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;

  } catch (error: unknown) {
    console.error("LOGIN ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}