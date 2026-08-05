// app/api/communities/route.ts — BACKEND
// Powers the "Communities" tab (DynamoDB-First + Firestore Fallback)

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
// GET /api/communities
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastDocId = searchParams.get("lastDocId");
    const lastDocMemberCount = searchParams.get("lastDocMemberCount");
    const joined = searchParams.get("joined") === "true";

    // ── Filter by joined communities ──────────────────────────────────────────
    if (joined) {
      let communities: any[] = [];
      let fetchedFromDynamo = false;

      // 1. Try DynamoDB
      try {
        const qRes = await docClient.send(
          new QueryCommand({
            TableName: "IdentityAndAccess",
            KeyConditionExpression:
              "entityId = :uid AND begins_with(sk, :comm)",
            ExpressionAttributeValues: {
              ":uid": `USER#${user.userId}`,
              ":comm": "COMMUNITY#",
            },
          }),
        );
        if (qRes.Items && qRes.Items.length > 0) {
          const commIds = qRes.Items.map(
            (i) => i.communityId || (i.sk as string).replace(/^COMMUNITY#/, ""),
          );
          for (const cId of commIds) {
            const cRes = await docClient.send(
              new GetCommand({
                TableName: "IdentityAndAccess",
                Key: { entityId: `COMMUNITY#${cId}`, sk: "COMMUNITY#META" },
              }),
            );
            if (cRes.Item) {
              communities.push({ id: cId, ...cRes.Item });
            }
          }
          if (communities.length > 0) {
            fetchedFromDynamo = true;
          }
        }
      } catch (dynErr) {
        console.warn("[communities GET joined] DynamoDB notice:", dynErr);
      }

      // 2. Fallback to Firestore
      if (!fetchedFromDynamo) {
        const memberSnap = await db
          .collectionGroup("communityMembers")
          .where("userId", "==", user.userId)
          .get();

        const communityIds = memberSnap.docs.map(
          (d) => d.ref.parent.parent!.id,
        );
        if (communityIds.length === 0) {
          return NextResponse.json({
            success: true,
            communities: [],
            pagination: { limit, hasMore: false, nextCursor: null },
          });
        }

        const chunks: string[][] = [];
        for (let i = 0; i < communityIds.length; i += 30) {
          chunks.push(communityIds.slice(i, i + 30));
        }

        for (const chunk of chunks) {
          const snap = await db
            .collection("communities")
            .where("__name__", "in", chunk)
            .get();
          snap.docs.forEach((d) =>
            communities.push({ id: d.id, ...d.data() }),
          );
        }
      }

      communities.sort(
        (a, b) => (b.memberCount || 0) - (a.memberCount || 0),
      );

      return NextResponse.json({
        success: true,
        communities,
        pagination: { limit, hasMore: false, nextCursor: null },
      });
    }

    // ── All communities ──────────────────────────────────────────────────────
    let communities: any[] = [];
    let fetchedFromDynamo = false;
    let lastDoc: any = null;

    // 1. Try DynamoDB
    try {
      const sRes = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression:
            "begins_with(entityId, :comm) AND #sk = :sk",
          ExpressionAttributeNames: {
            "#sk": "sk",
          },
          ExpressionAttributeValues: {
            ":comm": "COMMUNITY#",
            ":sk": "COMMUNITY#META",
          },
        }),
      );
      if (sRes.Items && sRes.Items.length > 0) {
        let allItems: any[] = sRes.Items.map((item: any) => ({
          id:
            item.id ||
            (item.entityId as string)?.replace(/^COMMUNITY#/, "") ||
            "",
          ...item,
        }));

        allItems.sort(
          (a: any, b: any) => (b.memberCount || 0) - (a.memberCount || 0),
        );

        if (lastDocMemberCount) {
          const lastCount = parseInt(lastDocMemberCount);
          if (!isNaN(lastCount)) {
            allItems = allItems.filter((c: any) => (c.memberCount || 0) <= lastCount);
          }
        }

        communities = allItems.slice(0, limit);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[communities GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo) {
      let query = db
        .collection("communities")
        .orderBy("memberCount", "desc")
        .limit(limit);

      if (lastDocId && lastDocMemberCount) {
        const lastRef = db.collection("communities").doc(lastDocId);
        const lastDocSnap = await lastRef.get();
        if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
      }

      const snapshot = await query.get();
      communities = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    const nextLastDoc =
      lastDoc ??
      (communities.length > 0 ? communities[communities.length - 1] : null);

    return NextResponse.json({
      success: true,
      communities,
      pagination: {
        limit,
        hasMore: communities.length === limit,
        nextCursor:
          communities.length === limit
            ? {
                lastDocId: nextLastDoc?.id,
                lastDocMemberCount:
                  nextLastDoc?.memberCount ??
                  nextLastDoc?.data?.()?.memberCount,
              }
            : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/communities error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/communities
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, avatarUrl } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const now = Date.now();
    const communityId = randomUUID();
    const chatId = randomUUID();

    const newCommunity = {
      id: communityId,
      name: name.trim(),
      description: description?.trim() ?? "",
      avatarUrl: avatarUrl ?? "",
      memberCount: 1,
      groupCount: 0,
      isVerified: false,
      createdBy: user.userId,
      chatId,
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
      communityId,
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    };

    const memberDoc = {
      communityId,
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: "owner",
      joinedAt: now,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      // Community meta
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `COMMUNITY#${communityId}`,
            sk: "COMMUNITY#META",
            ...newCommunity,
          },
        }),
      );

      // Community member
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `COMMUNITY#${communityId}`,
            sk: `MEMBER#${user.userId}`,
            ...memberDoc,
          },
        }),
      );

      // User joined community
      await docClient.send(
        new PutCommand({
          TableName: "IdentityAndAccess",
          Item: {
            entityId: `USER#${user.userId}`,
            sk: `COMMUNITY#${communityId}`,
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
    } catch (dynErr) {
      console.error("[communities POST] DynamoDB error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db.collection("communities").doc(communityId).set(newCommunity);
      await db.collection("chats").doc(chatId).set(chatDoc);
      await db
        .collection("communities")
        .doc(communityId)
        .collection("communityMembers")
        .doc(user.userId)
        .set(memberDoc);
    } catch (fsErr) {
      console.error("[communities POST] Firestore error:", fsErr);
    }

    return NextResponse.json(
      {
        success: true,
        id: communityId,
        community: newCommunity,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/communities error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}