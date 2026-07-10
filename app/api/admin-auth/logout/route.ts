import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    
    // Clear the admin_token cookie
    response.cookies.delete("admin_token");
    
    return response;
  } catch (error: unknown) {
    console.error("ADMIN LOGOUT ERROR:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
