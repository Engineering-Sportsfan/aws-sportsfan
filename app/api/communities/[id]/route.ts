// app/api/communities/[communityId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";

async function getUser(req: NextRequest) {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string; userId?: string; uid?: string; id?: string;
        name?: string; role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return { userId, email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
      }
    } catch {}
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
        email?: string; userId?: string; uid?: string; id?: string;
        name?: string; role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return { userId, email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
      }
    } catch {}
  }

  return null;
}

function getCommunityIdFromUrl(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/communities/[communityId]
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    if (!communityId) {
      return NextResponse.json({ error: "Community ID is required" }, { status: 400 });
    }

    const docRef = db.collection("communities").doc(communityId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    // Get groups in this community
    const groupsSnap = await db
      .collection("groups")
      .where("communityId", "==", communityId)
      .limit(20)
      .get();

    const groups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({
      success: true,
      community: { id: doc.id, ...doc.data() },
      groups,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/communities/[communityId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/communities/[communityId]
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    const body = await req.json();

    if (!communityId) {
      return NextResponse.json({ error: "Community ID is required" }, { status: 400 });
    }

    const docRef = db.collection("communities").doc(communityId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const data = doc.data()!;
    // Only owner or admin can update
    if (data.createdBy !== user.userId) {
      return NextResponse.json({ error: "Only community owner can update" }, { status: 403 });
    }

    const allowedFields = ["name", "description", "avatarUrl"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) updates[field] = body[field];
    });

    await docRef.update(updates);
    const updated = await docRef.get();

    return NextResponse.json({
      success: true,
      community: { id: updated.id, ...updated.data() },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/communities/[communityId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}