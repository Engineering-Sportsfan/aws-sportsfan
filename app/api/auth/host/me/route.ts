// app/api/auth/me/route.ts
// chandu's code

// import { NextRequest, NextResponse } from "next/server";
// import jwt from "jsonwebtoken";

// export async function GET(req: NextRequest) {
//   try {
//     // Get token from cookie
//     const token = req.cookies.get("token")?.value;
    
//     if (!token) {
//       return NextResponse.json(
//         { success: false, error: "Not authenticated" },
//         { status: 401 }
//       );
//     }
    
//     // Verify token
//     const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
//       email: string;
//       name: string;
//       role: string;
//       userId?: string;
//     };
    
//     return NextResponse.json({
//       success: true,
//       user: {
//         email: decoded.email,
//         name: decoded.name,
//         role: decoded.role,
//         userId: decoded.userId,
//       },
//     });
//   } catch (error) {
//     console.error("Auth me error:", error);
//     return NextResponse.json(
//       { success: false, error: "Invalid token" },
//       { status: 401 }
//     );
//   }
// }





// api/auth/host/me/route.ts - BACKEND

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function GET(req: NextRequest) {
  try {
    // Get token from cookie
    const token = req.cookies.get("token")?.value;
    
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      email: string;
      name: string;
      role: string;
      userId?: string;
    };
    
    return NextResponse.json({
      success: true,
      user: {
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        userId: decoded.userId,
      },
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json(
      { success: false, error: "Invalid token" },
      { status: 401 }
    );
  }
}