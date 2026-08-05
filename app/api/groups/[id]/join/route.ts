// app/api/groups/[groupId]/join/route.ts — BACKEND
// Join and leave group (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { FieldValue } from "firebase-admin/firestore";
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
  return parts[parts.length - 2];
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups/[groupId]/join
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
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
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (!groupDoc.exists) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
      groupData = { id: groupDoc.id, ...groupDoc.data() };
    }

    // Already a member?
    let existingMember: any = null;
    try {
      const mRes = await docClient.send(
        new GetCommand({
          TableName: "IdentityAndAccess",
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${user.userId}` },
        }),
      );
      if (mRes.Item) existingMember = mRes.Item;
    } catch {}

    if (!existingMember) {
      const mDoc = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(user.userId)
        .get();
      if (mDoc.exists) existingMember = mDoc.data();
    }

    if (existingMember && existingMember.status !== "pending") {
      return NextResponse.json({
        success: true,
        status: "joined",
        message: "Already a member",
      });
    }

    const now = Date.now();

    if (groupData.privacy === "closed") {
      const pendingMember = {
        groupId,
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: "member",
        status: "pending",
        joinedAt: now,
      };

      try {
        await docClient.send(
          new PutCommand({
            TableName: "IdentityAndAccess",
            Item: {
              entityId: `GROUP#${groupId}`,
              sk: `MEMBER#${user.userId}`,
              ...pendingMember,
            },
          }),
        );
      } catch (dynErr) {
        console.error("[group join closed] DynamoDB error:", dynErr);
      }

      try {
        await db
          .collection("groups")
          .doc(groupId)
          .collection("members")
          .doc(user.userId)
          .set(pendingMember);
      } catch (fsErr) {
        console.error("[group join closed] Firestore error:", fsErr);
      }

      return NextResponse.json({
        success: true,
        status: "pending",
        message: "Join request sent",
      });
    }

    if (groupData.privacy === "private") {
      return NextResponse.json(
        { error: "This group is private — invite only" },
        { status: 403 },
      );
    }

    // Public group — join immediately
    const newMemberCount = (groupData.memberCount ?? 0) + 1;
    const activeMember = {
      groupId,
      userId: user.userId,
      email: user.email,
      name: user.name,
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
            sk: `MEMBER#${user.userId}`,
            ...activeMember,
          },
        }),
      );

      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${user.userId}`,
            sk: `GROUP#${groupId}`,
            ...activeMember,
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
            lastActivityAt: now,
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
            new Set([...(chatRes.Item.participantIds || []), user.userId]),
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
      console.error("[group join POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(user.userId)
        .set(activeMember);

      await db
        .collection("groups")
        .doc(groupId)
        .update({
          memberCount: newMemberCount,
          lastActivityAt: now,
          updatedAt: now,
        });

      if (groupData.chatId) {
        await db
          .collection("chats")
          .doc(groupData.chatId as string)
          .update({
            participantIds: FieldValue.arrayUnion(user.userId),
            updatedAt: now,
          });
      }
    } catch (fsErr) {
      console.error("[group join POST] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      status: "joined",
      message: "Joined group successfully",
    });
  } catch (error: unknown) {
    console.error("POST /api/groups/[groupId]/join error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/groups/[groupId]/join   — leave group
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
          Key: { entityId: `GROUP#${groupId}`, sk: `MEMBER#${user.userId}` },
        }),
      );
      if (mRes.Item) memberData = mRes.Item;
    } catch {}

    if (!memberData) {
      const memberDoc = await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(user.userId)
        .get();
      if (memberDoc.exists) memberData = memberDoc.data();
    }

    if (!memberData) {
      return NextResponse.json(
        { error: "You are not a member" },
        { status: 400 },
      );
    }

    if (memberData.role === "owner") {
      return NextResponse.json(
        { error: "Owner cannot leave — delete the group instead" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const newMemberCount = Math.max(0, (groupData.memberCount ?? 1) - 1);

    // 1. Delete from DynamoDB
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
            (p: string) => p !== user.userId,
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
      console.error("[group leave] DynamoDB error:", dynErr);
    }

    // 2. Delete from Firestore
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
          updatedAt: now,
        });

      if (groupData.chatId) {
        await db
          .collection("chats")
          .doc(groupData.chatId as string)
          .update({
            participantIds: FieldValue.arrayRemove(user.userId),
            updatedAt: now,
          });
      }
    } catch (fsErr) {
      console.error("[group leave] Firestore error:", fsErr);
    }

    return NextResponse.json({
      success: true,
      message: "Left group successfully",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/groups/[groupId]/join error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}