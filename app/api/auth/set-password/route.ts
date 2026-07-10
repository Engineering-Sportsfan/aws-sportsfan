
//api/auth/set-password/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import bcrypt from "bcryptjs";

// export async function POST(req: NextRequest) {
 
//   try {
//     const { email, password } = await req.json();

//     if (!email || !password) {
//       return NextResponse.json({ error: "Email & password required" }, { status: 400 });
//     }

    
//     const userRef = db.collection("users").doc(email);
//     const userDoc = await userRef.get();

//     if (!userDoc.exists) {
//       return NextResponse.json({ error: "User not found" }, { status: 404 });
//     }

//     const userData = userDoc.data();

//     if (!userData?.isVerified) {
//       return NextResponse.json({ error: "Verify OTP first" }, { status: 403 });
//     }

    
//     const hashedPassword = await bcrypt.hash(password, 10);

    
//     await userRef.update({
//       password: hashedPassword,
//     });

//     return NextResponse.json({ success: true, message: "Password set successfully" });

//   }catch (error: unknown) {
//     console.error("❌ ERROR:", error);
//     const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
//     return NextResponse.json(
//       { error: errorMessage },
//       { status: 500 }
//     );
//   }
// }




//api/auth/set-password/route.ts


import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
 
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email & password required" }, { status: 400 });
    }

    
    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userDoc.data();

    if (!userData?.isVerified) {
      return NextResponse.json({ error: "Verify OTP first" }, { status: 403 });
    }

    
    const hashedPassword = await bcrypt.hash(password, 10);

    
    await userRef.update({
      password: hashedPassword,
    });

    return NextResponse.json({ success: true, message: "Password set successfully" });

  }catch (error: unknown) {
    console.error("❌ ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

