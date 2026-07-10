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

async function getCallerRole(communityId: string, userId: string): Promise<string | null> {
  const doc = await db
    .collection("communities")
    .doc(communityId)
    .collection("communityMembers")
    .doc(userId)
    .get();
  return doc.exists ? (doc.data()?.role as string) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/communities/[communityId]/members
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastDocId = searchParams.get("lastDocId");

    const communityDoc = await db.collection("communities").doc(communityId).get();
    if (!communityDoc.exists) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    let query = db
      .collection("communities")
      .doc(communityId)
      .collection("communityMembers")
      .orderBy("joinedAt", "asc")
      .limit(limit);

    if (role && ["owner", "admin", "member"].includes(role)) {
      query = query.where("role", "==", role);
    }

    if (lastDocId) {
      const lastRef = db
        .collection("communities")
        .doc(communityId)
        .collection("communityMembers")
        .doc(lastDocId);
      const lastDoc = await lastRef.get();
      if (lastDoc.exists) query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const members = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      members,
      pagination: {
        limit,
        hasMore: members.length === limit,
        nextCursor: members.length === limit ? { lastDocId: lastDoc?.id } : null,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/communities/[communityId]/members error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/communities/[communityId]/members
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const callerRole = await getCallerRole(communityId, user.userId);
    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json(
        { error: "Admin or owner permission required" },
        { status: 403 }
      );
    }

    const communityRef = db.collection("communities").doc(communityId);
    const communityDoc = await communityRef.get();
    if (!communityDoc.exists) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const memberRef = communityRef.collection("communityMembers").doc(userId);
    const memberDoc = await memberRef.get();
    if (memberDoc.exists) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }

    // Get user details from users collection
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data() || {};

    const now = Date.now();
    const data = communityDoc.data()!;
    const batch = db.batch();

    batch.set(memberRef, {
      userId,
      email: userData.email || "",
      name: userData.name || userId,
      role: "member",
      joinedAt: now,
    });

    batch.update(communityRef, {
      memberCount: FieldValue.increment(1),
      updatedAt: now,
    });

    // Add to linked chat
    if (data.chatId) {
      batch.update(db.collection("chats").doc(data.chatId as string), {
        participantIds: FieldValue.arrayUnion(userId),
        updatedAt: now,
      });
    }

    await batch.commit();

    return NextResponse.json(
      { success: true, message: "Member added", userId, role: "member" },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("POST /api/communities/[communityId]/members error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/communities/[communityId]/members
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const communityId = getCommunityIdFromUrl(req);
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const callerRole = await getCallerRole(communityId, user.userId);
    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json(
        { error: "Admin or owner permission required" },
        { status: 403 }
      );
    }

    const communityRef = db.collection("communities").doc(communityId);
    const communityDoc = await communityRef.get();
    if (!communityDoc.exists) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const memberRef = communityRef.collection("communityMembers").doc(userId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (memberDoc.data()?.role === "owner") {
      return NextResponse.json({ error: "Cannot remove the community owner" }, { status: 400 });
    }

    const data = communityDoc.data()!;
    const now = Date.now();
    const batch = db.batch();

    batch.delete(memberRef);
    batch.update(communityRef, {
      memberCount: FieldValue.increment(-1),
      updatedAt: now,
    });

    if (data.chatId) {
      batch.update(db.collection("chats").doc(data.chatId as string), {
        participantIds: FieldValue.arrayRemove(userId),
        updatedAt: now,
      });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Member ${userId} removed successfully`,
    });
  } catch (error: unknown) {
    console.error("DELETE /api/communities/[communityId]/members error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}