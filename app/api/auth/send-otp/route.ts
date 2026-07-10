//api/auth/send-otp/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { transporter } from "@/lib/mailer";

// export async function POST(req: NextRequest) {
//   try {
//     console.log("📩 Incoming Register + OTP request...");

//     const { firstName, lastName, email } = await req.json();

//     // console.log(" Email:", email);
//     // console.log(" Name:", firstName, lastName);

//     //  Validation
//     if (!email || !email.includes("@")) {
//       return NextResponse.json({ error: "Valid email required" }, { status: 400 });
//     }

//     if (!firstName || !lastName) {
//       return NextResponse.json({ error: "Name is required" }, { status: 400 });
//     }


//     //  CHECK USER EXISTS

//     // console.log(" Checking if user exists...");

//     const userRef = db.collection("users").doc(email);
//     const userDoc = await userRef.get();

//     if (userDoc.exists) {
//       // console.log(" User already exists");

//       return NextResponse.json(
//         { error: "User already exists. Please login." },
//         { status: 409 }
//       );
//     }

//     // =========================
//     //  CREATE USER
//     // =========================
//     console.log(" Creating new user...");

//     // await userRef.set({
//     //   firstName,
//     //   lastName,
//     //   email,
//     //   createdAt: Date.now(),
//     //   isVerified: false,
//     //   status: "active", 
//     //   role: "user",
//     // });
//     const userId = `${firstName.toLowerCase()}_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
//     await userRef.set({
//       firstName,
//       lastName,
//       email,
//       userId, 
//       createdAt: Date.now(),
//       isVerified: false,
//       status: "active",
//       role: "user",
//     });

//     console.log(" User created");

//     // =========================
//     //  GENERATE OTP
//     // =========================
//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     // console.log(" OTP:", otp);

//     // =========================
//     //  SAVE OTP
//     // =========================
//     await db.collection("otps").doc(email).set({
//       otp,
//       createdAt: Date.now(),
//       expiresAt: Date.now() + 5 * 60 * 1000,
//     });

//     // console.log(" OTP saved");

//     // =========================
//     //  SEND EMAIL
//     // =========================
//     await transporter.sendMail({
//       from: `"SportsFan360" <${process.env.EMAIL}>`,
//       to: email,
//       subject: "Your OTP Code",
//       html: `
//         <h2>Welcome to SportsFan360 🎉</h2>
//         <p>Your OTP is:</p>
//         <h1>${otp}</h1>
//         <p>Expires in 5 minutes.</p>
//       `,
//     });

//     console.log(" Email sent");

//     return NextResponse.json({
//       success: true,
//       message: "User created & OTP sent",
//     });

//   } catch (error: unknown) {
//     // console.error(" ERROR:", error);
//     const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
//     return NextResponse.json(
//       { error: errorMessage },
//       { status: 500 }
//     );
//   }
// }







import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { transporter } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    console.log("📩 Incoming Register + OTP request...");

    const { firstName, lastName, email } = await req.json();

    // console.log(" Email:", email);
    // console.log(" Name:", firstName, lastName);

    //  Validation
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }


    //  CHECK USER EXISTS

    // console.log(" Checking if user exists...");

    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      // console.log(" User already exists");

      return NextResponse.json(
        { error: "User already exists. Please login." },
        { status: 409 }
      );
    }

    // =========================
    //  CREATE USER
    // =========================
    console.log(" Creating new user...");

    // await userRef.set({
    //   firstName,
    //   lastName,
    //   email,
    //   createdAt: Date.now(),
    //   isVerified: false,
    //   status: "active", 
    //   role: "user",
    // });
    const userId = `${firstName.toLowerCase()}_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;
    await userRef.set({
      firstName,
      lastName,
      email,
      userId, 
      createdAt: Date.now(),
      isVerified: false,
      status: "active",
      role: "user",
    });

    console.log(" User created");

    // =========================
    //  GENERATE OTP
    // =========================
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // console.log(" OTP:", otp);

    // =========================
    //  SAVE OTP
    // =========================
    await db.collection("otps").doc(email).set({
      otp,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // console.log(" OTP saved");

    // =========================
    //  SEND EMAIL
    // =========================
    await transporter.sendMail({
      from: `"SportsFan360" <${process.env.EMAIL}>`,
      to: email,
      subject: "Your OTP Code",
      html: `
        <h2>Welcome to SportsFan360 🎉</h2>
        <p>Your OTP is:</p>
        <h1>${otp}</h1>
        <p>Expires in 5 minutes.</p>
      `,
    });

    console.log(" Email sent");

    return NextResponse.json({
      success: true,
      message: "User created & OTP sent",
    });

  } catch (error: unknown) {
    // console.error(" ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}