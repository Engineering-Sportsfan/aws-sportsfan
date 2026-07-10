
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { transporter } from "@/lib/mailer";

// export async function POST(req: NextRequest) {
//   try {
//     const { email } = await req.json();

//     if (!email) {
//       return NextResponse.json({ error: "Email required" }, { status: 400 });
//     }

//     //  1. Check user exists 
//     const userRef = db.collection("users").doc(email);
//     const userDoc = await userRef.get();

//     if (!userDoc.exists) {
//       return NextResponse.json(
//         { error: "No account found with this email" },
//         { status: 404 }
//       );
//     }

//     const user = userDoc.data()!;

//     //  2. Check account not disabled 
//     if (user.status === "disabled") {
//       return NextResponse.json(
//         { error: "Your account has been disabled. Contact support." },
//         { status: 403 }
//       );
//     }

//     //  3. Rate limit — max 3 OTPs per 10 min 
//     const existingOtp = await db.collection("otps").doc(email).get();
//     if (existingOtp.exists) {
//       const otpData = existingOtp.data()!;
//       const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
//       if (otpData.createdAt > tenMinutesAgo && (otpData.attempts ?? 0) >= 3) {
//         return NextResponse.json(
//           { error: "Too many attempts. Please wait 10 minutes." },
//           { status: 429 }
//         );
//       }
//     }

//     //  4. Generate & save OTP 
//     const otp = Math.floor(100000 + Math.random() * 900000).toString();

//     await db.collection("otps").doc(email).set({
//       otp,
//       type:      "forgot-password",
//       createdAt: Date.now(),
//       expiresAt: Date.now() + 5 * 60 * 1000,
//       attempts:  (existingOtp.data()?.attempts ?? 0) + 1,
//     });

//     //  5. Send email 
//     await transporter.sendMail({
//       from:    `"SportsFan360" <${process.env.EMAIL}>`,
//       to:      email,
//       subject: "Reset Your Password — SportsFan360",
//       html: `
//         <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
//           <h2 style="color:#e91e8c">Reset your password</h2>
//           <p>Hi ${user.firstName ?? "there"},</p>
//           <p>We received a request to reset your password. Use the OTP below:</p>
//           <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:20px 0">
//             <h1 style="letter-spacing:8px;font-size:36px;margin:0;color:#111">${otp}</h1>
//           </div>
//           <p style="color:#666;font-size:13px">This OTP expires in <strong>5 minutes</strong>.</p>
//           <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
//         </div>
//       `,
//     });

//     console.log("Forgot password OTP sent to:", email);

//     return NextResponse.json({
//       success: true,
//       message: "OTP sent to your email",
//     });

//   } catch (error: unknown) {
//     console.error("forgot-password/send-otp ERROR:", error);
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }








import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { transporter } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    //  1. Check user exists 
    const userRef = db.collection("users").doc(email);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "No account found with this email" },
        { status: 404 }
      );
    }

    const user = userDoc.data()!;

    //  2. Check account not disabled 
    if (user.status === "disabled") {
      return NextResponse.json(
        { error: "Your account has been disabled. Contact support." },
        { status: 403 }
      );
    }

    //  3. Rate limit — max 3 OTPs per 10 min 
    const existingOtp = await db.collection("otps").doc(email).get();
    if (existingOtp.exists) {
      const otpData = existingOtp.data()!;
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      if (otpData.createdAt > tenMinutesAgo && (otpData.attempts ?? 0) >= 3) {
        return NextResponse.json(
          { error: "Too many attempts. Please wait 10 minutes." },
          { status: 429 }
        );
      }
    }

    //  4. Generate & save OTP 
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await db.collection("otps").doc(email).set({
      otp,
      type:      "forgot-password",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts:  (existingOtp.data()?.attempts ?? 0) + 1,
    });

    //  5. Send email 
    await transporter.sendMail({
      from:    `"SportsFan360" <${process.env.EMAIL}>`,
      to:      email,
      subject: "Reset Your Password — SportsFan360",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#e91e8c">Reset your password</h2>
          <p>Hi ${user.firstName ?? "there"},</p>
          <p>We received a request to reset your password. Use the OTP below:</p>
          <div style="background:#f5f5f5;padding:20px;text-align:center;border-radius:8px;margin:20px 0">
            <h1 style="letter-spacing:8px;font-size:36px;margin:0;color:#111">${otp}</h1>
          </div>
          <p style="color:#666;font-size:13px">This OTP expires in <strong>5 minutes</strong>.</p>
          <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    console.log("Forgot password OTP sent to:", email);

    return NextResponse.json({
      success: true,
      message: "OTP sent to your email",
    });

  } catch (error: unknown) {
    console.error("forgot-password/send-otp ERROR:", error);
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}