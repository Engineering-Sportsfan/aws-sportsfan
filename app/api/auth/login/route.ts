// // app/api/auth/login/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { docClient } from "@/lib/dynamodb";
// import bcrypt from "bcryptjs";
// import jwt from "jsonwebtoken";
// import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// export const dynamic = "force-dynamic";

// export async function POST(req: NextRequest) {
//   try {
//     const { email, password } = await req.json();

//     if (!email || !password) {
//       return NextResponse.json(
//         { error: "Email & password required" },
//         { status: 400 }
//       );
//     }

//     const cleanEmail = email.trim().toLowerCase();

//     // ── 1. Fetch User from DynamoDB IdentityAndAccess ─────────────────────────
//     let user: Record<string, unknown> | null = null;

//     try {
//       const emailQuery = await docClient.send(
//         new QueryCommand({
//           TableName: "IdentityAndAccess",
//           IndexName: "email-index",
//           KeyConditionExpression: "email = :e",
//           ExpressionAttributeValues: { ":e": cleanEmail },
//           // Limit: 1,
//         })
//       );
//       if (emailQuery.Items && emailQuery.Items.length > 0) {
//         user = emailQuery.Items[0] as Record<string, unknown>;
//       }
//     } catch (err) {
//       console.warn("DynamoDB login query notice:", err);
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
//         console.warn("DynamoDB direct get notice:", err);
//       }
//     }

//     // Fallback to Firebase
//     if (!user) {
//       try {
//         const userDoc = await db.collection("users").doc(cleanEmail).get();
//         if (userDoc.exists) {
//           user = userDoc.data() as Record<string, unknown>;
//         }
//       } catch (err) {
//         console.warn("Firebase login fallback notice:", err);
//       }
//     }

//     if (!user) {
//       return NextResponse.json(
//         { error: "User not found" },
//         { status: 404 }
//       );
//     }

//     // ── 2. Check verified (skip for hosts created by admin) ──────────────────
//     if (user.role !== "host" && !user.isVerified) {
//       return NextResponse.json(
//         { error: "Please verify OTP first" },
//         { status: 403 }
//       );
//     }

//     // ── 3. Check account status ──────────────────────────────────────────────
//     if (user.status === "disabled") {
//       return NextResponse.json(
//         { error: "Your account has been disabled. Contact support." },
//         { status: 403 }
//       );
//     }

//     // ── 4. Check password ────────────────────────────────────────────────────
//     const storedPassword = (user.password as string) || "";
//     const isMatch = await bcrypt.compare(password, storedPassword);

//     if (!isMatch) {
//       return NextResponse.json(
//         { error: "Invalid credentials" },
//         { status: 401 }
//       );
//     }

//     // ── 5. Check if host needs to change password on first login ─────────────
//     const requiresPasswordChange = user.role === "host" && user.isFirstLogin === true;

//     // ── 6. Ensure consistent userId ──────────────────────────────────────────
//     let userId = user.userId as string | undefined;
//     if (!userId || userId.startsWith("google_")) {
//       userId = cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
//       user.userId = userId;

//       // Persist backfill to DynamoDB & Firebase
//       try {
//         await docClient.send(
//           new UpdateCommand({
//             TableName: "IdentityAndAccess",
//             Key: {
//               entityId: (user.entityId as string) || `USER#${cleanEmail}`,
//               sk: (user.sk as string) || "USER#META",
//             },
//             UpdateExpression: "SET userId = :u",
//             ExpressionAttributeValues: { ":u": userId },
//           })
//         );
//       } catch (err) {
//         console.warn("DynamoDB userId backfill notice:", err);
//       }

//       try {
//         await db.collection("users").doc(cleanEmail).update({ userId });
//       } catch (err) {
//         console.warn("Firebase userId backfill notice:", err);
//       }
//     }

//     // ── 7. Create JWT token ──────────────────────────────────────────────────
//     const name = `${(user.firstName as string) || ""} ${(user.lastName as string) || ""}`.trim() || cleanEmail.split("@")[0];

//     const token = jwt.sign(
//       {
//         email: cleanEmail,
//         userId,
//         name,
//         role: user.role ?? "user",
//         status: user.status ?? "active",
//         isFirstLogin: user.isFirstLogin ?? false,
//       },
//       process.env.JWT_SECRET as string,
//       { expiresIn: "7d" }
//     );

//     // ── 8. Build response with requiresPasswordChange flag ───────────────────
//     const response = NextResponse.json({
//       success: true,
//       requiresPasswordChange,
//       user: {
//         email: cleanEmail,
//         name,
//         userId,
//         role: user.role ?? "user",
//         status: user.status ?? "active",
//         isFirstLogin: user.isFirstLogin ?? false,
//       },
//     });

//     // ── 9. Set HTTP-only cookies ─────────────────────────────────────────────
//     response.cookies.set("token", token, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       sameSite: "lax",
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





// app/api/auth/login/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { logAuthIssue } from "@/lib/logAuthIssue";

export const dynamic = "force-dynamic";

// Picks the best candidate among possibly-duplicate records for the same email:
// prefers one with a password hash, then isVerified, then most recently updated.
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
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email & password required" },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    // ── 1. Gather ALL DynamoDB candidates for this email (handles duplicates) ──
    const candidates: Record<string, unknown>[] = [];

    try {
      const emailQuery = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          IndexName: "email-index",
          KeyConditionExpression: "email = :e",
          ExpressionAttributeValues: { ":e": cleanEmail },
          // no Limit — we want every duplicate so we can pick the right one
        })
      );
      if (emailQuery.Items && emailQuery.Items.length > 0) {
        candidates.push(...(emailQuery.Items as Record<string, unknown>[]));
        if (emailQuery.Items.length > 1) {
          console.warn(`Duplicate DynamoDB records for ${cleanEmail}: ${emailQuery.Items.length} found`);
        }
      }
    } catch (err) {
      console.warn("DynamoDB login query notice:", err);
    }

    // Direct-get fallback (only useful if your key schema really is USER#email / USER#META
    // for some records — safe to keep as an extra candidate source)
    try {
      const directGet = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${cleanEmail}`, sk: "USER#META" },
        })
      );
      if (directGet.Item) candidates.push(directGet.Item as Record<string, unknown>);
    } catch (err) {
      console.warn("DynamoDB direct get notice:", err);
    }

    // ── 2. Pick the best DynamoDB candidate, but only trust it if it's usable ──
    let user = pickBestUser(candidates);

    // "Usable" = has a password hash. If the best we found still has no password,
    // don't settle for it yet — fall through to Firebase to see if a real
    // password-bearing record exists there instead.
    const dynamoUserUsable = !!user?.password;

    if (!dynamoUserUsable) {
      try {
        const userDoc = await db.collection("users").doc(cleanEmail).get();
        if (userDoc.exists) {
          const fbUser = userDoc.data() as Record<string, unknown>;
          if (fbUser.password) {
            // Firebase has a usable password — prefer it over a passwordless Dynamo record
            user = fbUser;
            console.log(`Resolved ${cleanEmail} via Firebase fallback (Dynamo record had no password)`);
          } else if (!user) {
            // Neither source has a password, but at least keep whatever Firebase has
            // for downstream field checks (isVerified/status) rather than nothing at all
            user = fbUser;
          }
        }
      } catch (err) {
        console.warn("Firebase login fallback notice:", err);
      }
    }

    if (!user) {
      logAuthIssue({
        email: cleanEmail,
        type: "login",
        reason: "User account not found in database",
        endpoint: "/api/auth/login",
      });
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // ── 3. Check verified (skip for hosts created by admin) ──────────────────
    if (user.role !== "host" && !user.isVerified) {
      logAuthIssue({
        email: cleanEmail,
        type: "login",
        reason: "User account not verified (OTP pending)",
        endpoint: "/api/auth/login",
      });
      return NextResponse.json(
        { error: "Please verify OTP first" },
        { status: 403 }
      );
    }

    // ── 4. Check account status ──────────────────────────────────────────────
    if (user.status === "disabled") {
      logAuthIssue({
        email: cleanEmail,
        type: "login",
        reason: "User account has been disabled by admin",
        endpoint: "/api/auth/login",
      });
      return NextResponse.json(
        { error: "Your account has been disabled. Contact support." },
        { status: 403 }
      );
    }

    // ── 5. Check password ────────────────────────────────────────────────────
    const storedPassword = (user.password as string) || "";
    if (!storedPassword) {
      logAuthIssue({
        email: cleanEmail,
        type: "login",
        reason: "Account has no password set (Signed up with Google)",
        endpoint: "/api/auth/login",
      });
      return NextResponse.json(
        { error: "This account has no password set. Please use 'Continue with Google' or reset your password." },
        { status: 401 }
      );
    }

    const isMatch = await bcrypt.compare(password, storedPassword);

    if (!isMatch) {
      logAuthIssue({
        email: cleanEmail,
        type: "login",
        reason: "Invalid password entered (Credentials mismatch)",
        endpoint: "/api/auth/login",
      });
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    console.log(`[DynamoDB Auth] ⚡ SUCCESS: User authenticated via DynamoDB -> email: [${cleanEmail}], userId: [${user.userId || cleanEmail}], role: [${user.role || 'user'}]`);

    // ── 6. Check if host needs to change password on first login ─────────────
    const requiresPasswordChange = user.role === "host" && user.isFirstLogin === true;

    const now = Date.now();
    const userId = (user.userId as string) || cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");

    // Persist lastLoginAt and ensure consistent userId in DynamoDB & Firebase
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "IdentityAndAccess",
          Key: {
            entityId: (user.entityId as string) || `USER#${cleanEmail}`,
            sk: (user.sk as string) || "USER#META",
          },
          UpdateExpression: "SET lastLoginAt = :ll, updatedAt = :u, userId = :uid",
          ExpressionAttributeValues: {
            ":ll": now,
            ":u": now,
            ":uid": userId,
          },
        })
      );
    } catch (err) {
      console.warn("DynamoDB lastLoginAt update notice:", err);
    }

    try {
      await db.collection("users").doc(cleanEmail).set(
        { lastLoginAt: now, updatedAt: now, userId },
        { merge: true }
      );
    } catch (err) {
      console.warn("Firebase lastLoginAt update notice:", err);
    }

    // ── 8. Create JWT token ──────────────────────────────────────────────────
    const name = `${(user.firstName as string) || ""} ${(user.lastName as string) || ""}`.trim() || cleanEmail.split("@")[0];

    const token = jwt.sign(
      {
        email: cleanEmail,
        userId,
        name,
        role: user.role ?? "user",
        status: user.status ?? "active",
        isFirstLogin: user.isFirstLogin ?? false,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    // ── 9. Build response with requiresPasswordChange flag ───────────────────
    const response = NextResponse.json({
      success: true,
      requiresPasswordChange,
      user: {
        email: cleanEmail,
        name,
        userId,
        role: user.role ?? "user",
        status: user.status ?? "active",
        isFirstLogin: user.isFirstLogin ?? false,
      },
    });

    // ── 10. Set HTTP-only cookies ─────────────────────────────────────────────
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
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