// app/api/communities/[communityId]/join/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from 'firebase-admin/firestore';

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
  return parts[parts.length - 2];
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/communities/[communityId]/join
// Join a community
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    const communityRef = db.collection("communities").doc(communityId);
    const communityDoc = await communityRef.get();

    if (!communityDoc.exists) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    // Check if already a member
    const memberRef = communityRef.collection("communityMembers").doc(user.userId);
    const memberDoc = await memberRef.get();

    if (memberDoc.exists) {
      return NextResponse.json(
        { error: "Already a member of this community" },
        { status: 409 }
      );
    }

    const now = Date.now();
    const batch = db.batch();

    batch.set(memberRef, {
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: "member",
      joinedAt: now,
    });

    batch.update(communityRef, {
      memberCount: FieldValue.increment(1),
      updatedAt: now,
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      status: "joined",
      message: "Joined community successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/communities/[communityId]/join error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/communities/[communityId]/join
// Leave a community
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    const communityRef = db.collection("communities").doc(communityId);
    const communityDoc = await communityRef.get();

    if (!communityDoc.exists) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const memberRef = communityRef.collection("communityMembers").doc(user.userId);
    const memberDoc = await memberRef.get();

    if (!memberDoc.exists) {
      return NextResponse.json({ error: "You are not a member" }, { status: 400 });
    }

    // Owner cannot leave
    if (memberDoc.data()?.role === "owner") {
      return NextResponse.json(
        { error: "Community owner cannot leave. Delete the community instead." },
        { status: 400 }
      );
    }

    const batch = db.batch();
    batch.delete(memberRef);
    batch.update(communityRef, {
      memberCount: FieldValue.increment(-1),
      updatedAt: Date.now(),
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: "Left community successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/communities/[communityId]/join error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}