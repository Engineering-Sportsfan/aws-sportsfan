//api/auth/google-signup/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";

// export async function POST(req: NextRequest) {
//     try {
//         const { email, name, avatar } = await req.json();

//         if (!email) {
//             return NextResponse.json({ error: "Email required" }, { status: 400 });
//         }

//         const userRef = db.collection("users").doc(email);
//         const userDoc = await userRef.get();

//         if (!userDoc.exists) {
//             // New user — save to Firebase
//             const nameParts = (name ?? "").split(" ");
//             const userId = `google_${email.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;

//             await userRef.set({
//                 email,
//                 userId,
//                 firstName: nameParts[0] ?? "",
//                 lastName: nameParts.slice(1).join(" ") ?? "",
//                 avatar: avatar ?? "",
//                 provider: "google",
//                 isVerified: true,
//                 status: "active",
//                 role: "user",
//                 createdAt: Date.now(),
//                 updatedAt: Date.now(),
//             });

//             return NextResponse.json({
//                 success: true,
//                 isNewUser: true,
//                 userId,
//                 firstName: nameParts[0] ?? "",
//                 lastName: nameParts.slice(1).join(" ") ?? "",
//                 role: "user",
//                 status: "active",
//             });
//         }

//         // Existing user
//         const data = userDoc.data()!;

//         if (data.status === "disabled") {
//             return NextResponse.json({ error: "Account disabled" }, { status: 403 });
//         }

//         await userRef.update({
//             lastLoginAt: Date.now(),
//             updatedAt: Date.now(),
//         });

//         return NextResponse.json({
//             success: true,
//             isNewUser: false,
//             userId: data.userId,
//             firstName: data.firstName,
//             lastName: data.lastName,
//             role: data.role || "user",
//             status: data.status || "active",
//         });

//     } catch (error) {
//         console.error("Google signup error:", error);
//         return NextResponse.json({ error: "Failed to save user" }, { status: 500 });
//     }
// }



//api/auth/google-signup/route.ts - BACKEND

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import jwt from "jsonwebtoken";  // ← add this

function generateConsistentUserId(email: string): string {
  return email.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
}

export async function POST(req: NextRequest) {
    try {
        const { email, name, avatar } = await req.json();

        if (!email) {
            return NextResponse.json({ error: "Email required" }, { status: 400 });
        }

        const userRef = db.collection("users").doc(email);
        const userDoc = await userRef.get();
        
        const consistentUserId = generateConsistentUserId(email);
        const nameParts = (name ?? "").split(" ");
        const firstName = nameParts[0] ?? "";
        const lastName  = nameParts.slice(1).join(" ") ?? "";
        const username = `${firstName} ${lastName}`.trim() || email.split("@")[0]; 

        let userId = consistentUserId;
        let role   = "user";

        if (!userDoc.exists) {
            await userRef.set({
                email,
                userId: consistentUserId,
                firstName, lastName,
                username, 
                avatar: avatar ?? "",
                provider: "google",
                authProviders: { google: true, emailPassword: false },
                isVerified: true, status: "active", role: "user",
                totalPoints: 0, pointsBreakdown: {},
                createdAt: Date.now(), updatedAt: Date.now(), lastLoginAt: Date.now(),
            });
        } else {
            const data = userDoc.data()!;
            if (data.status === "disabled") {
                return NextResponse.json({ error: "Account disabled" }, { status: 403 });
            }
            userId = data.userId || consistentUserId;
            role   = data.role   || "user";

            const updateData: Record<string, unknown> = { lastLoginAt: Date.now(), updatedAt: Date.now() };
            if (!data.authProviders?.google)  updateData["authProviders.google"] = true;
            if (!data.firstName && firstName) { updateData.firstName = firstName; updateData.lastName = lastName; }
            if (!data.avatar && avatar)        updateData.avatar = avatar;
            await userRef.update(updateData);
        }

        // ── Issue the same "token" cookie email/password users get ────────────
        // This means Google users are treated identically by the backend.
        // No more session-token, no sessionStorage, no 1-hour expiry issue.
        const token = jwt.sign(
            { email, userId, name: `${firstName} ${lastName}`.trim(), role },
            process.env.JWT_SECRET!,
            { expiresIn: "7d" }
        );

        const response = NextResponse.json({
            success:   true,
            userId,
            firstName: firstName || userDoc.data()?.firstName || "",
            lastName:  lastName  || userDoc.data()?.lastName  || "",
            role,
            status:    "active",
        });

        // Set httpOnly cookie — same as email/password login
        response.cookies.set("token", token, {
            httpOnly: true,
            secure:   process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge:   60 * 60 * 24 * 7,  // 7 days
            path:     "/",
        });

        return response;

    } catch (error) {
        console.error("Google signup error:", error);
        return NextResponse.json({ error: "Failed to save user" }, { status: 500 });
    }
}