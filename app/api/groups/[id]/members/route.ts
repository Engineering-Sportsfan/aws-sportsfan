// app/api/groups/[groupId]/members/route.ts — BACKEND
// Manage group membership and roles (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

const normalizeId = (id: string) =>
  id.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");

async function getUser(req: NextRequest) {
  const cookieToken = req.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      const payload = jwt.verify(cookieToken, process.env.JWT_SECRET!) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return {
          userId: normalizeId(userId),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {}
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(
        authHeader.slice(7),
        process.env.JWT_SECRET!,
      ) as {
        email?: string;
        userId?: string;
        uid?: string;
        id?: string;
        name?: string;
        role?: string;
      };
      const userId =
        payload.userId ?? payload.uid ?? payload.id ?? payload.email;
      if (userId && payload.email) {
        return {
          userId: normalizeId(userId),
          email: payload.email,
          name: payload.name ?? "",
          role: payload.role ?? "user",
        };
      }
    } catch {}
  }

  return null;
}

function getGroupIdFromUrl(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 2];
}

async function getCallerRole(
  groupId: string,
  userId: string,
): Promise<string | null> {
  try {
    const mRes = await docClient.send(
      new GetCommand({
        TableName: "IdentityAndAccess",
        Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${userId}` },
      }),
    );
    if (mRes.Item) return mRes.Item.role as string;
  } catch {}

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

    let members: any[] = [];
    let fetchedFromDynamo = false;
    let lastDoc: any = null;

    // 1. Try DynamoDB First
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "IdentityAndAccess",
          KeyConditionExpression:
            "entityId = :grp AND begins_with(sk, :mem)",
          ExpressionAttributeValues: {
            ":grp": `GROUP#${groupId}`,
            ":mem": "MEMBER#",
          },
          Limit: limit,
        }),
      );

      if (qRes.Items && qRes.Items.length > 0) {
        let items: any[] = qRes.Items.map((item: any) => ({
          id: item.userId || (item.sk as string).replace(/^MEMBER#/, ""),
          ...item,
        }));

        if (role && ["owner", "admin", "member"].includes(role)) {
          items = items.filter((m: any) => m.role === role);
        }

        items.sort((a: any, b: any) => (a.joinedAt || 0) - (b.joinedAt || 0));
        members = items.slice(0, limit);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[group members GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
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
        const lastDocSnap = await lastRef.get();
        if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
      }

      const snapshot = await query.get();
      members = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    const nextLastDoc =
      lastDoc ?? (members.length > 0 ? members[members.length - 1] : null);

    return NextResponse.json({
      success: true,
      members,
      pagination: {
        limit,
        hasMore: members.length === limit,
        nextCursor:
          members.length === limit ? { lastDocId: nextLastDoc?.id } : null,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/groups/[groupId]/members error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
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

    const groupId = getGroupIdFromUrl(req);
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const callerRole = await getCallerRole(groupId, user.userId);
    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json(
        { error: "Admin or owner permission required" },
        { status: 403 },
      );
    }

    let groupData: any = null;
    try {
      const gRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: "GROUP#META" },
        }),
      );
      if (gRes.Item) groupData = gRes.Item;
    } catch {}

    if (!groupData) {
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupData = { id: groupDoc.id, ...groupDoc.data() };
    }

    // Check if user already member
    let isAlreadyMember = false;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${userId}` },
        }),
      );
      if (mRes.Item) isAlreadyMember = true;
    } catch {}

    if (!isAlreadyMember) {
      const memberDoc = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(userId)
        .get();
      if (memberDoc.exists) isAlreadyMember = true;
    }

    if (isAlreadyMember) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 409 },
      );
    }

    // Get user details
    let userData: any = {};
    try {
      const uRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${userId}`, sk: "USER#META" },
        }),
      );
      if (uRes.Item) userData = uRes.Item;
    } catch {}

    if (!userData.email) {
      const userDoc = await db.collection("users").doc(userId).get();
      if (userDoc.exists) userData = userDoc.data() || {};
    }

    const now = Date.now();
    const newMemberCount = (groupData.memberCount || 0) + 1;
    const memberItem = {
      groupId,
      userId,
      email: userData.email || "",
      name: userData.name || userId,
      role: "member",
      status: "active",
      joinedAt: now,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `GROUP#${groupId}`,
            sk: `MEMBER#${userId}`,
            ...memberItem,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${userId}`,
            sk: `GROUP#${groupId}`,
            ...memberItem,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...groupData,
            entityId: `GROUP#${groupId}`,
            sk: "GROUP#META",
            memberCount: newMemberCount,
            updatedAt: now,
          },
        }),
      );

      if (groupData.chatId) {
        const chatRes = await docClient.send(
          new GetCommand({
            TableName: "RealTimeChat",
            Key: { roomId: `ROOM#${groupData.chatId}`, sk: "ROOM#META" },
          }),
        );
        if (chatRes.Item) {
          const pids = Array.from(
            new Set([...(chatRes.Item.participantIds || []), userId]),
          );
          await docClient.send(
            new PutCommand({
              TableName: "RealTimeChat",
              Item: {
                ...chatRes.Item,
                participantIds: pids,
                updatedAt: now,
              },
            }),
          );
        }
      }
    } catch (dynErr) {
      console.error("[group add member] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      const batch = db.batch();
      const groupRef = db.collection("groups").doc(groupId);
      const memberRef = groupRef.collection("members").doc(userId);

      batch.set(memberRef, memberItem);
      batch.update(groupRef, {
        memberCount: FieldValue.increment(1),
        memberIds: FieldValue.arrayUnion(userId),
        updatedAt: now,
      });

      if (groupData.chatId) {
        batch.update(db.collection("chats").doc(groupData.chatId as string), {
          participantIds: FieldValue.arrayUnion(userId),
          updatedAt: now,
        });
      }

      await batch.commit();
    } catch (fsErr) {
      console.error("[group add member] Firestore error:", fsErr);
    }

    return NextResponse.json(
      { success: true, message: "Member added", userId, role: "member" },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/groups/[groupId]/members error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
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

    const groupId = getGroupIdFromUrl(req);
    const body = await req.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json(
        { error: "userId and role are required" },
        { status: 400 },
      );
    }

    if (!["admin", "member"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'admin' or 'member'" },
        { status: 400 },
      );
    }

    const callerRole = await getCallerRole(groupId, user.userId);
    if (callerRole !== "owner") {
      return NextResponse.json(
        { error: "Only the group owner can change roles" },
        { status: 403 },
      );
    }

    let memberData: any = null;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${userId}` },
        }),
      );
      if (mRes.Item) memberData = mRes.Item;
    } catch {}

    if (!memberData) {
      const memberDoc = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(userId)
        .get();
      if (memberDoc.exists) memberData = memberDoc.data();
    }

    if (!memberData) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const updatedMember = { ...memberData, role, updatedAt: Date.now() };

    // 1. Update DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...updatedMember,
            entityId: `GROUP#${groupId}`,
            sk: `MEMBER#${userId}`,
          },
        }),
      );
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...updatedMember,
            entityId: `USER#${userId}`,
            sk: `GROUP#${groupId}`,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[group role update] DynamoDB error:", dynErr);
    }

    // 2. Update Firestore
    try {
      await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(userId)
        .update({ role });
    } catch (fsErr) {
      console.error("[group role update] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: `Role updated to ${role}`,
      userId,
      role,
    });
  } catch (error: unknown) {
    console.error("PATCH /api/groups/[groupId]/members error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
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

    const groupId = getGroupIdFromUrl(req);
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const callerRole = await getCallerRole(groupId, user.userId);
    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json(
        { error: "Admin or owner permission required" },
        { status: 403 },
      );
    }

    let groupData: any = null;
    try {
      const gRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: "GROUP#META" },
        }),
      );
      if (gRes.Item) groupData = gRes.Item;
    } catch {}

    if (!groupData) {
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupData = { id: groupDoc.id, ...groupDoc.data() };
    }

    let memberData: any = null;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${userId}` },
        }),
      );
      if (mRes.Item) memberData = mRes.Item;
    } catch {}

    if (!memberData) {
      const memberDoc = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(userId)
        .get();
      if (memberDoc.exists) memberData = memberDoc.data();
    }

    if (!memberData) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (memberData.role === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the group owner" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const newMemberCount = Math.max(0, (groupData.memberCount || 1) - 1);

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${userId}` },
        }),
      );

      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${userId}`, sk: `GROUP#${groupId}` },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            ...groupData,
            entityId: `GROUP#${groupId}`,
            sk: "GROUP#META",
            memberCount: newMemberCount,
            updatedAt: now,
          },
        }),
      );

      if (groupData.chatId) {
        const chatRes = await docClient.send(
          new GetCommand({
            TableName: "RealTimeChat",
            Key: { roomId: `ROOM#${groupData.chatId}`, sk: "ROOM#META" },
          }),
        );
        if (chatRes.Item && Array.isArray(chatRes.Item.participantIds)) {
          const pids = chatRes.Item.participantIds.filter(
            (p: string) => p !== userId,
          );
          await docClient.send(
            new PutCommand({
              TableName: "RealTimeChat",
              Item: {
                ...chatRes.Item,
                participantIds: pids,
                updatedAt: now,
              },
            }),
          );
        }
      }
    } catch (dynErr) {
      console.error("[group remove member] DynamoDB error:", dynErr);
    }

    // 2. Delete from Firestore
    try {
      const batch = db.batch();
      const groupRef = db.collection("groups").doc(groupId);
      const memberRef = groupRef.collection("members").doc(userId);

      batch.delete(memberRef);
      batch.update(groupRef, {
        memberCount: FieldValue.increment(-1),
        memberIds: FieldValue.arrayRemove(userId),
        updatedAt: now,
      });

      if (groupData.chatId) {
        batch.update(db.collection("chats").doc(groupData.chatId as string), {
          participantIds: FieldValue.arrayRemove(userId),
          updatedAt: now,
        });
      }

      await batch.commit();
    } catch (fsErr) {
      console.error("[group remove member] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: `Member ${userId} removed successfully`,
    });
  } catch (error: unknown) {
    console.error("DELETE /api/groups/[groupId]/members error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}