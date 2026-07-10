


// app/api/groups/[groupId]/members/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from 'firebase-admin/firestore';

// Auth helper
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

function getGroupIdFromUrl(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 2];
}

async function getCallerRole(groupId: string, userId: string): Promise<string | null> {
  const doc = await db
    .collection("groups")
    .doc(groupId)
    .collection("members")
    .doc(userId)
    .get();
  return doc.exists ? (doc.data()?.role as string) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups/[groupId]/members
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupId = getGroupIdFromUrl(req);
    const { searchParams } = new URL(req.url);
    const role = searchParams.get("role");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastDocId = searchParams.get("lastDocId");

    const groupDoc = await db.collection("groups").doc(groupId).get();
    if (!groupDoc.exists) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    let query = db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .orderBy("joinedAt", "asc")
      .limit(limit);

    if (role && ["owner", "admin", "member"].includes(role)) {
      query = db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .where("role", "==", role)
        .orderBy("joinedAt", "asc")
        .limit(limit);
    }

    if (lastDocId) {
      const lastRef = db
        .collection("groups")
        .doc(groupId)
        .collection("members")
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
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/groups/[groupId]/members error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/[groupId]/members
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const CURRENT_USER_ID = user.userId;

    const groupId = getGroupIdFromUrl(req);
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const callerRole = await getCallerRole(groupId, CURRENT_USER_ID);
    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json(
        { error: "Admin or owner permission required" },
        { status: 403 }
      );
    }

    const groupRef = db.collection("groups").doc(groupId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const memberRef = groupRef.collection("members").doc(userId);
    const memberDoc = await memberRef.get();
    if (memberDoc.exists) {
      return NextResponse.json({ error: "User is already a member" }, { status: 409 });
    }

    const now = Date.now();
    const data = groupDoc.data()!;
    const batch = db.batch();

    batch.set(memberRef, { userId, role: "member", joinedAt: now });
    batch.update(groupRef, {
      memberCount: FieldValue.increment(1),
      memberIds: FieldValue.arrayUnion(userId),
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
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/groups/[groupId]/members error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/groups/[groupId]/members
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const CURRENT_USER_ID = user.userId;

    const groupId = getGroupIdFromUrl(req);
    const body = await req.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    const callerRole = await getCallerRole(groupId, CURRENT_USER_ID);
    if (callerRole !== "owner") {
      return NextResponse.json(
        { error: "Only the group owner can change roles" },
        { status: 403 }
      );
    }

    const memberRef = db
      .collection("groups")
      .doc(groupId)
      .collection("members")
      .doc(userId);

    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    await memberRef.update({ role });

    return NextResponse.json({
      success: true,
      message: `Role updated to ${role}`,
      userId,
      role,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/groups/[groupId]/members error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/[groupId]/members
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const CURRENT_USER_ID = user.userId;

    const groupId = getGroupIdFromUrl(req);
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const callerRole = await getCallerRole(groupId, CURRENT_USER_ID);
    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json(
        { error: "Admin or owner permission required" },
        { status: 403 }
      );
    }

    const groupRef = db.collection("groups").doc(groupId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const memberRef = groupRef.collection("members").doc(userId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (memberDoc.data()?.role === "owner") {
      return NextResponse.json({ error: "Cannot remove the group owner" }, { status: 400 });
    }

    const data = groupDoc.data()!;
    const now = Date.now();
    const batch = db.batch();

    batch.delete(memberRef);
    batch.update(groupRef, {
      memberCount: FieldValue.increment(-1),
      memberIds: FieldValue.arrayRemove(userId),
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
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/groups/[groupId]/members error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}