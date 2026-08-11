// app/api/groups/route.ts — BACKEND
// Groups list and creation (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import {
  PutCommand,
  GetCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

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
    const bearerToken = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(bearerToken, process.env.JWT_SECRET!) as {
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/groups
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const privacy = searchParams.get("privacy");
    const trending = searchParams.get("trending") === "true";
    const joined = searchParams.get("joined") === "true";
    const category = searchParams.get("category");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastDocId = searchParams.get("lastDocId");
    const lastDocAt = searchParams.get("lastDocAt");

    // ── "joined" filter: fetch memberships first ─────────────────────────────
    if (joined) {
      let groups: any[] = [];
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "IdentityAndAccess",
            KeyConditionExpression:
              "entityId = :uid AND begins_with(sk, :grp)",
            ExpressionAttributeValues: {
              ":uid": `USER#${user.userId}`,
              ":grp": "GROUP#",
            },
          }),
        );
        if (qRes.Items && qRes.Items.length > 0) {
          const groupIds = qRes.Items.map(
            (i) => i.groupId || (i.sk as string).replace(/^GROUP#/, ""),
          );
          for (const gId of groupIds) {
            const gRes = await docClient.send(
              new GetCommand({
                TableName: "IdentityAndAccess",
                Key: { entityId: `GROUP#${gId}`, sk: "GROUP#META" },
              }),
            );
            if (gRes.Item) {
              groups.push({ id: gId, ...gRes.Item });
            }
          }
          if (groups.length > 0) fetchedFromDynamo = true;
        }
      } catch (dynErr) {
        console.warn("[groups GET joined] DynamoDB notice:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        const memberSnap = await db
          .collectionGroup("members")
          .where("userId", "==", user.userId)
          .get();

        const groupIds = memberSnap.docs.map((d) => d.ref.parent.parent!.id);
        if (groupIds.length === 0) {
          return NextResponse.json({
            success: true,
            groups: [],
            pagination: { limit, hasMore: false, nextCursor: null },
          });
        }

        const chunks: string[][] = [];
        for (let i = 0; i < groupIds.length; i += 30) {
          chunks.push(groupIds.slice(i, i + 30));
        }

        for (const chunk of chunks) {
          const snap = await db
            .collection("groups")
            .where("__name__", "in", chunk)
            .get();
          snap.docs.forEach((d) => groups.push({ id: d.id, ...d.data() }));
        }
      }

      groups.sort(
        (a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0),
      );

      return NextResponse.json({
        success: true,
        groups,
        pagination: { limit, hasMore: false, nextCursor: null },
      });
    }

    // ── Normal listing ───────────────────────────────────────────────────────
    let groups: any[] = [];
    let fetchedFromDynamo = false;
    let lastDoc: any = null;

    // 1. Try DynamoDB
    try {
      const sRes = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :grp) AND #sk = :sk",
          ExpressionAttributeNames: {
            "#sk": "sk",
          },
          ExpressionAttributeValues: {
            ":grp": "GROUP#",
            ":sk": "GROUP#META",
          },
        }),
      );

      if (sRes.Items && sRes.Items.length > 0) {
        let allItems: any[] = sRes.Items.map((item: any) => ({
          id:
            item.id || (item.entityId as string)?.replace(/^GROUP#/, "") || "",
          ...item,
        }));

        if (privacy) {
          allItems = allItems.filter((g: any) => g.privacy === privacy);
        }
        if (trending) {
          allItems = allItems.filter((g: any) => g.isTrending === true);
        }
        if (category) {
          allItems = allItems.filter((g: any) => g.category === category);
        }

        allItems.sort(
          (a: any, b: any) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0),
        );

        if (lastDocAt) {
          const lastTime = parseInt(lastDocAt);
          if (!isNaN(lastTime)) {
            allItems = allItems.filter(
              (g: any) => (g.lastActivityAt || 0) <= lastTime,
            );
          }
        }

        groups = allItems.slice(0, limit);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[groups GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      let query: FirebaseFirestore.Query = db.collection("groups");

      if (privacy) query = query.where("privacy", "==", privacy);
      if (trending) query = query.where("isTrending", "==", true);
      if (category) query = query.where("category", "==", category);

      query = query.orderBy("lastActivityAt", "desc").limit(limit);

      if (lastDocId && lastDocAt) {
        const lastRef = db.collection("groups").doc(lastDocId);
        const lastDocSnap = await lastRef.get();
        if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
      }

      const snapshot = await query.get();
      groups = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    const nextLastDoc =
      lastDoc ?? (groups.length > 0 ? groups[groups.length - 1] : null);

    return NextResponse.json({
      success: true,
      groups,
      pagination: {
        limit,
        hasMore: groups.length === limit,
        nextCursor:
          groups.length === limit
            ? {
                lastDocId: nextLastDoc?.id,
                lastDocAt:
                  nextLastDoc?.lastActivityAt ??
                  nextLastDoc?.data?.()?.lastActivityAt,
              }
            : null,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/groups error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/groups
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description = "",
      privacy = "public",
      category = "",
      tags = [],
      communityId,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const now = Date.now();
    const groupId = randomUUID();
    const chatId = randomUUID();

    const newGroup = {
      id: groupId,
      name: name.trim(),
      description: description.trim(),
      privacy,
      category,
      tags: Array.isArray(tags) ? tags : [],
      memberCount: 1,
      isTrending: false,
      isVerified: false,
      lastActivityAt: now,
      createdBy: user.userId,
      chatId,
      communityId: communityId || null,
      createdAt: now,
      updatedAt: now,
    };

    const chatDoc = {
      id: chatId,
      type: "group",
      name: name.trim(),
      participantIds: [user.userId],
      lastMessageContent: "",
      lastMessageAt: now,
      unreadCount: { [user.userId]: 0 },
      isOnline: false,
      isVerified: false,
      isPinned: false,
      isMuted: false,
      groupId,
      communityId: communityId || null,
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    };

    const memberDoc = {
      groupId,
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: "owner",
      status: "active",
      joinedAt: now,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      // Group Meta
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `GROUP#${groupId}`,
            sk: "GROUP#META",
            ...newGroup,
          },
        }),
      );

      // Group Member
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `GROUP#${groupId}`,
            sk: `MEMBER#${user.userId}`,
            ...memberDoc,
          },
        }),
      );

      // User Joined Group
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${user.userId}`,
            sk: `GROUP#${groupId}`,
            ...memberDoc,
          },
        }),
      );

      // Linked chat
      await docClient.send(
        new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${chatId}`,
            sk: "ROOM#META",
            ...chatDoc,
          },
        }),
      );

      // If attached to a community, link in DynamoDB
      if (communityId) {
        await docClient.send(
          new PutCommand({
            TableName: "IdentityAndAccess",
            Item: {
              entityId: `COMMUNITY#${communityId}`,
              sk: `GROUP#${groupId}`,
              groupId,
              name: name.trim(),
              createdAt: now,
            },
          }),
        );
      }
    } catch (dynErr) {
      console.error("[groups POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db.collection("groups").doc(groupId).set(newGroup);
      await db.collection("chats").doc(chatId).set(chatDoc);
      await db
        .collection("groups")
        .doc(groupId)
        .collection("members")
        .doc(user.userId)
        .set(memberDoc);
    } catch (fsErr) {
      console.error("[groups POST] Firestore error:", fsErr);
    }

    return NextResponse.json(
      {
        success: true,
        id: groupId,
        group: newGroup,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("POST /api/groups error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unexpected error",
      },
      { status: 500 },
    );
  }
}