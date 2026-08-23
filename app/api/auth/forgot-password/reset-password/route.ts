
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





// //api/auth/forgot-password/reset-passwprd/route.ts



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




// // app/api/auth/forgot-password/reset-password/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { docClient } from "@/lib/dynamodb";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// export const dynamic = "force-dynamic";

// export async function POST(req: NextRequest) {
//   try {
//     const { resetToken, password } = await req.json();

//     if (!resetToken || !password) {
//       return NextResponse.json({ error: "Reset token & password required" }, { status: 400 });
//     }
//     if (password.length < 8) {
//       return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
//     }

//     // 1. Verify reset token
//     let decoded: { email: string; purpose: string };
//     try {
//       decoded = jwt.verify(resetToken, process.env.JWT_SECRET as string) as { email: string; purpose: string };
//     } catch {
//       return NextResponse.json({ error: "Reset link expired or invalid. Please start over." }, { status: 401 });
//     }
//     if (decoded.purpose !== "password-reset") {
//       return NextResponse.json({ error: "Invalid reset token." }, { status: 401 });
//     }

//     const cleanEmail = decoded.email.trim().toLowerCase();

//     // 2. Fetch user from DynamoDB (same lookup logic as login route)
//     let user: Record<string, unknown> | null = null;

//     try {
//       const emailQuery = await docClient.send(
//         new QueryCommand({
//           TableName: "IdentityAndAccess",
//           IndexName: "email-index",
//           KeyConditionExpression: "email = :e",
//           ExpressionAttributeValues: { ":e": cleanEmail },
//           Limit: 1,
//         })
//       );
//       if (emailQuery.Items && emailQuery.Items.length > 0) {
//         user = emailQuery.Items[0] as Record<string, unknown>;
//       }
//     } catch (err) {
//       console.warn("DynamoDB reset-password user query notice:", err);
//     }

//     if (!user) {
//       try {
//         const directGet = await docClient.send(
//           new GetCommand({
//             TableName: "IdentityAndAccess",
//             Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
//           })
//         );
//         if (directGet.Item) user = directGet.Item as Record<string, unknown>;
//       } catch (err) {
//         console.warn("DynamoDB reset-password direct get notice:", err);
//       }
//     }

//     if (!user) {
//       return NextResponse.json({ error: "User not found." }, { status: 404 });
//     }

//     if (user.status === "disabled") {
//       return NextResponse.json({ error: "Your account has been disabled. Contact support." }, { status: 403 });
//     }

//     // 3. Hash new password
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const now = Date.now();

//     // 4. Update DynamoDB — this is the record login.ts actually reads
//     try {
//       await docClient.send(
//         new UpdateCommand({
//           TableName: "IdentityAndAccess",
//           Key: {
//             entityId: (user.entityId as string) || `USER#${cleanEmail}`,
//             sk: (user.sk as string) || "USER#META",
//           },
//           UpdateExpression: "SET password = :p, passwordUpdatedAt = :t, updatedAt = :t",
//           ExpressionAttributeValues: { ":p": hashedPassword, ":t": now },
//         })
//       );
//     } catch (err) {
//       console.error("DynamoDB password update failed:", err);
//       // If DynamoDB write fails, don't report success — this was the actual bug
//       return NextResponse.json({ error: "Failed to reset password. Please try again." }, { status: 500 });
//     }

//     // 5. Keep Firebase in sync (fallback path in login route)
//     try {
//       await db.collection("users").doc(cleanEmail).set(
//         { password: hashedPassword, passwordUpdatedAt: now, updatedAt: now },
//         { merge: true }
//       );
//     } catch (err) {
//       console.warn("Firebase password sync notice:", err);
//     }

//     console.log("Password reset successfully for:", cleanEmail);

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




// app/api/auth/forgot-password/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

// Picks the best candidate among possibly-duplicate records for the same email.
function pickBestUser(candidates: Record<string, unknown>[]): Record<string, unknown> | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const aHasPw = a.password ? 1 : 0;
    const bHasPw = b.password ? 1 : 0;
    if (aHasPw !== bHasPw) return bHasPw - aHasPw;

    const aVerified = a.isVerified ? 1 : 0;
    const bVerified = b.isVerified ? 1 : 0;
    if (aVerified !== bVerified) return bVerified - aVerified;

    return ((b.updatedAt as number) ?? 0) - ((a.updatedAt as number) ?? 0);
  })[0];
}

export async function POST(req: NextRequest) {
  try {
    const { resetToken, password } = await req.json();

    if (!resetToken || !password) {
      return NextResponse.json({ error: "Reset token & password required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // 1. Verify reset token
    let decoded: { email: string; purpose: string };
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET as string) as { email: string; purpose: string };
    } catch {
      return NextResponse.json({ error: "Reset link expired or invalid. Please start over." }, { status: 401 });
    }
    if (decoded.purpose !== "password-reset") {
      return NextResponse.json({ error: "Invalid reset token." }, { status: 401 });
    }

    const cleanEmail = decoded.email.trim().toLowerCase();

    // 2. Gather ALL DynamoDB candidates for this email (handles duplicates)
    const candidates: Record<string, unknown>[] = [];

    try {
      const emailQuery = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          IndexName: "email-index",
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": cleanEmail },
          // no Limit — collect every duplicate
        })
      );
      if (emailQuery.Items && emailQuery.Items.length > 0) {
        candidates.push(...(emailQuery.Items as Record<string, unknown>[]));
      }
    } catch (err) {
      console.warn("DynamoDB reset-password user query notice:", err);
    }

    const user = pickBestUser(candidates);

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.status === "disabled") {
      return NextResponse.json({ error: "Your account has been disabled. Contact support." }, { status: 403 });
    }

    // 3. Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    const now = Date.now();

    // 4. Update the SPECIFIC record we resolved (its real entityId/sk — not a guessed key)
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: user.entityId as string,
            sk: user.sk as string,
          },
          UpdateExpression: "SET password = :p, isVerified = :v, passwordUpdatedAt = :t, updatedAt = :t",
          ExpressionAttributeValues: { ":p": hashedPassword, ":v": true, ":t": now },
        })
      );
    } catch (err) {
      console.error("DynamoDB password update failed:", err);
      return NextResponse.json({ error: "Failed to reset password. Please try again." }, { status: 500 });
    }

    // 5. If there were OTHER duplicate records for this email, sync them too so
    //    login can't accidentally resolve to a stale duplicate with the old password.
    const otherDuplicates = candidates.filter(
      (c) => c.entityId !== user.entityId || c.sk !== user.sk
    );
    for (const dup of otherDuplicates) {
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: dup.entityId as string, sk: dup.sk as string },
            UpdateExpression: "SET password = :p, isVerified = :v, updatedAt = :t",
            ExpressionAttributeValues: { ":p": hashedPassword, ":v": true, ":t": now },
          })
        );
      } catch (err) {
        console.warn(`Failed to sync duplicate record ${dup.entityId}/${dup.sk}:`, err);
      }
    }

    // 6. Keep Firebase in sync (fallback path in login route)
    try {
      await db.collection("users").doc(cleanEmail).set(
        { password: hashedPassword, isVerified: true, passwordUpdatedAt: now, updatedAt: now },
        { merge: true }
      );
    } catch (err) {
      console.warn("Firebase password sync notice:", err);
    }

    console.log("Password reset successfully for:", cleanEmail);

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