import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/getAuthUser";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching user:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
