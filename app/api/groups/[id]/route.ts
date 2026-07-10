

// app/api/groups/[groupId]/route.ts  — BACKEND

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";

async function getUser(req: NextRequest) {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string; userId?: string; uid?: string; id?: string; name?: string; role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) return { userId, email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
    } catch {}
  }
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET!) as {
        email?: string; userId?: string; uid?: string; id?: string; name?: string; role?: string;
      };
      const userId = payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) return { userId, email: payload.email, name: payload.name ?? "", role: payload.role ?? "user" };
    } catch {}
  }
  return null;
}

function getGroupIdFromUrl(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups/[groupId]
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groupId = getGroupIdFromUrl(req);
    const doc     = await db.collection("groups").doc(groupId).get();

    if (!doc.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    return NextResponse.json({ success: true, group: { id: doc.id, ...doc.data() } });
  } catch (error: unknown) {
    console.error("GET /api/groups/[groupId] error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/groups/[groupId]   — update group (owner/admin only)
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groupId = getGroupIdFromUrl(req);
    const groupRef = db.collection("groups").doc(groupId);
    const doc      = await groupRef.get();

    if (!doc.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    // Check membership role
    const memberDoc = await groupRef.collection("members").doc(user.userId).get();
    const role      = memberDoc.data()?.role;
    if (!memberDoc.exists || !["owner", "admin"].includes(role)) {
      return NextResponse.json({ error: "Only owners and admins can update this group" }, { status: 403 });
    }

    const body = await req.json();
    const allowed = ["name", "description", "privacy", "category", "tags", "avatarUrl", "chatId"];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    allowed.forEach(f => { if (body[f] !== undefined) updates[f] = body[f]; });

    await groupRef.update(updates);
    const updated = await groupRef.get();

    return NextResponse.json({ success: true, group: { id: updated.id, ...updated.data() } });
  } catch (error: unknown) {
    console.error("PATCH /api/groups/[groupId] error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/[groupId]   — owner deletes group, others leave
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const groupId  = getGroupIdFromUrl(req);
    const groupRef = db.collection("groups").doc(groupId);
    const doc      = await groupRef.get();

    if (!doc.exists) return NextResponse.json({ error: "Group not found" }, { status: 404 });

    const memberDoc = await groupRef.collection("members").doc(user.userId).get();
    if (!memberDoc.exists) return NextResponse.json({ error: "You are not a member" }, { status: 403 });

    if (memberDoc.data()?.role === "owner") {
      // Owner deletes the whole group
      await groupRef.delete();
      return NextResponse.json({ success: true, message: "Group deleted" });
    }

    // Non-owner leaves
    await groupRef.collection("members").doc(user.userId).delete();
    await groupRef.update({ memberCount: Math.max(0, (doc.data()?.memberCount ?? 1) - 1), updatedAt: Date.now() });

    return NextResponse.json({ success: true, message: "Left group" });
  } catch (error: unknown) {
    console.error("DELETE /api/groups/[groupId] error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}