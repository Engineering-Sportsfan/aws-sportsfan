// app/api/groups/[groupId]/route.ts — BACKEND
// Group details, updates, and deletion (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  GetCommand,
  PutCommand,
  DeleteCommand,
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
  return parts[parts.length - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups/[groupId]
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupId = getGroupIdFromUrl(req);
    let groupData: any = null;
    let fetchedFromDynamo = false;

    // 1. Try DynamoDB First
    try {
      const gRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: "GROUP#META" },
        }),
      );
      if (gRes.Item) {
        groupData = { id: groupId, ...gRes.Item };
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[groups/[id] GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || !groupData) {
      const doc = await db.collection("groups").doc(groupId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupData = { id: doc.id, ...doc.data() };
    }

    return NextResponse.json({ success: true, group: groupData });
  } catch (error: unknown) {
    console.error("GET /api/groups/[groupId] error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/groups/[groupId]
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupId = getGroupIdFromUrl(req);
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
      const doc = await db.collection("groups").doc(groupId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupData = { id: doc.id, ...doc.data() };
    }

    // Check membership role
    let callerRole: string | null = null;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${user.userId}` },
        }),
      );
      if (mRes.Item) callerRole = mRes.Item.role;
    } catch {}

    if (!callerRole) {
      const memberDoc = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(user.userId)
        .get();
      if (memberDoc.exists) callerRole = memberDoc.data()?.role;
    }

    if (!callerRole || !["owner", "admin"].includes(callerRole)) {
      return NextResponse.json(
        { error: "Only owners and admins can update this group" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const allowed = [
      "name",
      "description",
      "privacy",
      "category",
      "tags",
      "avatarUrl",
      "chatId",
    ];
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    allowed.forEach((f) => {
      if (body[f] !== undefined) updates[f] = body[f];
    });

    const updatedData = { ...groupData, ...updates };

    // 1. Update DynamoDB
    try {
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `GROUP#${groupId}`,
            sk: "GROUP#META",
            ...updatedData,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[groups/[id] PATCH] DynamoDB error:", dynErr);
    }

    // 2. Update Firestore
    try {
      await db.collection("groups").doc(groupId).update(updates);
    } catch (fsErr) {
      console.error("[groups/[id] PATCH] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      group: { id: groupId, ...updatedData },
    });
  } catch (error: unknown) {
    console.error("PATCH /api/groups/[groupId] error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/[groupId]
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupId = getGroupIdFromUrl(req);
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
      const doc = await db.collection("groups").doc(groupId).get();
      if (!doc.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupData = { id: doc.id, ...doc.data() };
    }

    let callerRole: string | null = null;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${user.userId}` },
        }),
      );
      if (mRes.Item) callerRole = mRes.Item.role;
    } catch {}

    if (!callerRole) {
      const memberDoc = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(user.userId)
        .get();
      if (memberDoc.exists) callerRole = memberDoc.data()?.role;
    }

    if (!callerRole) {
      return NextResponse.json(
        { error: "You are not a member" },
        { status: 403 },
      );
    }

    if (callerRole === "owner") {
      // Owner deletes the whole group
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `GROUP#${groupId}`, sk: "GROUP#META" },
          }),
        );
        await docClient.send(
          new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${user.userId}` },
          }),
        );
        await docClient.send(
          new DeleteCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${user.userId}`, sk: `GROUP#${groupId}` },
          }),
        );
      } catch (dynErr) {
        console.error("[groups DELETE] DynamoDB error:", dynErr);
      }

      try {
        await db.collection("groups").doc(groupId).delete();
      } catch (fsErr) {
        console.error("[groups DELETE] Firestore error:", fsErr);
      }

      return NextResponse.json({ success: true, message: "Group deleted" });
    }

    // Non-owner leaves
    const newMemberCount = Math.max(0, (groupData.memberCount || 1) - 1);
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${user.userId}` },
        }),
      );
      await docClient.send(
        new DeleteCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `USER#${user.userId}`, sk: `GROUP#${groupId}` },
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
            updatedAt: Date.now(),
          },
        }),
      );
    } catch (dynErr) {
      console.error("[groups leave] DynamoDB error:", dynErr);
    }

    try {
      await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(user.userId)
        .delete();
      await db
        .collection("groups")
        .doc(groupId)
        .update({
          memberCount: newMemberCount,
          updatedAt: Date.now(),
        });
    } catch (fsErr) {
      console.error("[groups leave] Firestore error:", fsErr);
    }

    return NextResponse.json({ success: true, message: "Left group" });
  } catch (error: unknown) {
    console.error("DELETE /api/groups/[groupId] error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}