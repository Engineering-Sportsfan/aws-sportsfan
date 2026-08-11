// app/api/chats/route.ts — BACKEND
// Powers the "My Chats" tab — list of DMs and group chats (DynamoDB-First + Firestore Fallback)

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const normalizeId = (id: string) =>
  id.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");

async function getUser(req: NextRequest) {
  // ── Path A: JWT cookie (email/password users) ─────────────────────────────
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
    } catch {
      // Expired or tampered — fall through to Bearer
    }
  }

  // ── Path B: Bearer token (Google users) ───────────────────────────────────
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
    } catch {
      // Invalid token
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const CURRENT_USER_ID = user.userId;
    const isSameUser = (id1: string, id2: string) => {
      const n1 = normalizeId(id1);
      const n2 = normalizeId(id2);
      if (!n1 || !n2) return false;
      return n1 === n2 || n1.endsWith(n2) || n2.endsWith(n1);
    };

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const lastDocId = searchParams.get("lastDocId");
    const lastDocUpdatedAt = searchParams.get("lastDocUpdatedAt");

    let chats: any[] = [];
    let fetchedFromDynamo = false;
    let lastDoc: any = null;

    // 1. Try DynamoDB First
    try {
      const filterParts = ["#sk = :sk", "contains(#pids, :uid)"];
      const ExpressionAttributeNames: Record<string, string> = {
        "#sk": "sk",
        "#pids": "participantIds",
      };
      const ExpressionAttributeValues: Record<string, any> = {
        ":sk": "ROOM#META",
        ":uid": CURRENT_USER_ID,
      };

      if (type === "dm" || type === "group") {
        filterParts.push("#tp = :tp");
        ExpressionAttributeNames["#tp"] = "type";
        ExpressionAttributeValues[":tp"] = type;
      }

      const res = await docClient.send(
        new ScanCommand({
          TableName: "RealTimeChat",
          FilterExpression: filterParts.join(" AND "),
          ExpressionAttributeNames,
          ExpressionAttributeValues,
        }),
      );

      if (res.Items && res.Items.length > 0) {
        let allItems: any[] = res.Items.map((item: any) => {
          const chatId =
            item.id || (item.roomId as string)?.replace(/^ROOM#/, "") || "";
          return {
            id: chatId,
            ...item,
          };
        });

        // Filter for user participant match
        allItems = allItems.filter((c: any) =>
          Array.isArray(c.participantIds)
            ? c.participantIds.some((pid: string) =>
                isSameUser(pid, CURRENT_USER_ID),
              )
            : false,
        );

        allItems.sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0));

        if (lastDocUpdatedAt) {
          const lastTs = parseInt(lastDocUpdatedAt);
          if (!isNaN(lastTs)) {
            allItems = allItems.filter((c: any) => (c.updatedAt || 0) < lastTs);
          }
        }

        chats = allItems.slice(0, limit);
        fetchedFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn("[chats GET] DynamoDB lookup notice:", dynErr);
    }

    // 2. Firestore Fallback if DynamoDB returned no items
    if (!fetchedFromDynamo) {
      let query = db
        .collection("chats")
        .where("participantIds", "array-contains", CURRENT_USER_ID)
        .orderBy("updatedAt", "desc");

      if (type === "dm" || type === "group") {
        query = db
          .collection("chats")
          .where("participantIds", "array-contains", CURRENT_USER_ID)
          .where("type", "==", type)
          .orderBy("updatedAt", "desc");
      }

      query = query.limit(limit);

      if (lastDocId && lastDocUpdatedAt) {
        const lastRef = db.collection("chats").doc(lastDocId);
        const lastDocSnap = await lastRef.get();
        if (lastDocSnap.exists) query = query.startAfter(lastDocSnap);
      }

      const snapshot = await query.get();
      chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    // Enrich DM chats with latest recipient profiles (name, avatarUrl)
    const otherParticipantIds = new Set<string>();
    chats.forEach((chat: any) => {
      if (chat.type === "dm" && Array.isArray(chat.participantIds)) {
        const otherId = chat.participantIds.find(
          (id: string) => !isSameUser(id, CURRENT_USER_ID),
        );
        if (otherId) otherParticipantIds.add(normalizeId(otherId));
      }
    });

    const userProfiles: Record<string, { name?: string; avatarUrl?: string }> =
      {};
    if (otherParticipantIds.size > 0) {
      const idsArray = Array.from(otherParticipantIds);

      // Try DynamoDB IdentityAndAccess for profiles first
      for (const id of idsArray) {
        try {
          const uRes = await docClient.send(
            new GetCommand({
              TableName: "IdentityAndAccess",
              Key: { entityId: `USER#${id}`, sk: `USER#META` },
            }),
          );
          if (uRes.Item) {
            const udata = uRes.Item;
            const fullName =
              udata.name ||
              udata.username ||
              [udata.firstName, udata.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              "";
            const avatarUrl = udata.avatarUrl || udata.avatar || "";
            userProfiles[id] = { name: fullName, avatarUrl };
          }
        } catch {
          // ignore dynamo err, fallback to firestore
        }
      }

      // Query Firestore for any unresolved IDs
      const unresolvedIds = idsArray.filter((id) => !userProfiles[id]);
      if (unresolvedIds.length > 0) {
        const docRefs = unresolvedIds.map((id) =>
          db.collection("users").doc(id),
        );
        const docSnaps = await db.getAll(...docRefs);
        docSnaps.forEach((doc) => {
          if (doc.exists) {
            const udata = doc.data();
            const fullName =
              udata?.name ||
              udata?.username ||
              [udata?.firstName, udata?.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              "";
            const avatarUrl = udata?.avatarUrl || udata?.avatar || "";
            userProfiles[doc.id] = { name: fullName, avatarUrl };
            if (udata?.userId) {
              userProfiles[normalizeId(udata.userId)] = {
                name: fullName,
                avatarUrl,
              };
            }
          }
        });

        const stillUnresolved = unresolvedIds.filter(
          (id) => !userProfiles[id],
        );
        if (stillUnresolved.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < stillUnresolved.length; i += 30) {
            chunks.push(stillUnresolved.slice(i, i + 30));
          }

          for (const chunk of chunks) {
            const snap = await db
              .collection("users")
              .where("userId", "in", chunk)
              .get();
            snap.docs.forEach((doc) => {
              const udata = doc.data();
              const fullName =
                udata.name ||
                udata.username ||
                [udata.firstName, udata.lastName]
                  .filter(Boolean)
                  .join(" ")
                  .trim() ||
                "";
              const avatarUrl = udata.avatarUrl || udata.avatar || "";
              if (udata.userId) {
                userProfiles[normalizeId(udata.userId)] = {
                  name: fullName,
                  avatarUrl,
                };
              }
              userProfiles[doc.id] = { name: fullName, avatarUrl };
            });
          }
        }
      }
    }

    const enrichedChats = chats.map((chat: any) => {
      const unreadCount = chat.unreadCount?.[CURRENT_USER_ID] || 0;

      if (chat.type === "dm" && Array.isArray(chat.participantIds)) {
        const otherId = chat.participantIds.find(
          (id: string) => !isSameUser(id, CURRENT_USER_ID),
        );
        const profile = otherId ? userProfiles[normalizeId(otherId)] : null;
        return {
          ...chat,
          unreadCount,
          name: profile?.name || "",
          avatarUrl: profile?.avatarUrl || chat.avatarUrl || "",
        };
      }

      return {
        ...chat,
        unreadCount,
      };
    });

    const nextLastDoc =
      lastDoc ?? (chats.length > 0 ? chats[chats.length - 1] : null);

    return NextResponse.json({
      success: true,
      chats: enrichedChats,
      pagination: {
        limit,
        hasMore: chats.length === limit,
        nextCursor:
          chats.length === limit
            ? {
                lastDocId: nextLastDoc?.id,
                lastDocUpdatedAt:
                  nextLastDoc?.updatedAt ?? nextLastDoc?.data?.()?.updatedAt,
              }
            : null,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/chats error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chats
// DM body:    { type: "dm",    participantId: string }
// Group body: { type: "group", name: string, participantIds?: string[] }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const CURRENT_USER_ID = user.userId;
    const isSameUser = (id1: string, id2: string) => {
      const n1 = normalizeId(id1);
      const n2 = normalizeId(id2);
      if (!n1 || !n2) return false;
      return n1 === n2 || n1.endsWith(n2) || n2.endsWith(n1);
    };

    const body = await req.json();
    const { type, participantId, participantIds, name } = body;

    if (!type || !["dm", "group"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'dm' or 'group'" },
        { status: 400 },
      );
    }

    // ── DM ───────────────────────────────────────────────────────────────────
    if (type === "dm") {
      if (!participantId) {
        return NextResponse.json(
          { error: "participantId is required for DMs" },
          { status: 400 },
        );
      }

      const normParticipantId = normalizeId(participantId);

      // Check existing in DynamoDB first
      let alreadyExists: any = null;
      try {
        const scanRes = await docClient.send(
          new ScanCommand({
            TableName: "RealTimeChat",
            FilterExpression:
              "#sk = :sk AND #tp = :tp AND contains(#pids, :u1) AND contains(#pids, :u2)",
            ExpressionAttributeNames: {
              "#sk": "sk",
              "#tp": "type",
              "#pids": "participantIds",
            },
            ExpressionAttributeValues: {
              ":sk": "ROOM#META",
              ":tp": "dm",
              ":u1": CURRENT_USER_ID,
              ":u2": normParticipantId,
            },
          }),
        );
        if (scanRes.Items && scanRes.Items.length > 0) {
          const match = scanRes.Items.find((d) => {
            const pids = (d.participantIds as string[]).map(normalizeId);
            return (
              pids.some((p) => isSameUser(p, CURRENT_USER_ID)) &&
              pids.some((p) => isSameUser(p, normParticipantId))
            );
          });
          if (match) {
            alreadyExists = {
              id: match.id || (match.roomId as string)?.replace(/^ROOM#/, ""),
              ...match,
            };
          }
        }
      } catch (dynErr) {
        console.warn("[chats POST DM] DynamoDB lookup notice:", dynErr);
      }

      // Check Firestore if not found in DynamoDB
      if (!alreadyExists) {
        const existing = await db
          .collection("chats")
          .where("type", "==", "dm")
          .where("participantIds", "array-contains", CURRENT_USER_ID)
          .get();

        const firestoreMatch = existing.docs.find((d) => {
          const pids = (d.data().participantIds as string[]).map(normalizeId);
          return pids.some((p) => isSameUser(p, normParticipantId));
        });

        if (firestoreMatch) {
          alreadyExists = {
            id: firestoreMatch.id,
            ...firestoreMatch.data(),
          };
        }
      }

      if (alreadyExists) {
        let recipientName = "";
        let avatarUrl = alreadyExists.avatarUrl || "";

        // Profile lookup
        try {
          const uRes = await docClient.send(
            new GetCommand({
              TableName: "IdentityAndAccess",
              Key: { entityId: `USER#${normParticipantId}`, sk: `USER#META` },
            }),
          );
          if (uRes.Item) {
            const udata = uRes.Item;
            recipientName =
              udata.name ||
              udata.username ||
              [udata.firstName, udata.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              "";
            avatarUrl = udata.avatarUrl || udata.avatar || avatarUrl;
          }
        } catch {}

        if (!recipientName) {
          let userDoc = await db
            .collection("users")
            .doc(normParticipantId)
            .get();
          if (!userDoc.exists) {
            const querySnap = await db
              .collection("users")
              .where("userId", "==", normParticipantId)
              .limit(1)
              .get();
            if (!querySnap.empty) {
              userDoc = querySnap.docs[0];
            }
          }

          if (userDoc && userDoc.exists) {
            const udata = userDoc.data()!;
            recipientName =
              udata.name ||
              udata.username ||
              [udata.firstName, udata.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              recipientName;
            avatarUrl = udata.avatarUrl || udata.avatar || avatarUrl;
          }
        }

        return NextResponse.json({
          success: true,
          id: alreadyExists.id,
          chat: {
            ...alreadyExists,
            name: recipientName,
            avatarUrl,
          },
          message: "Existing DM returned",
        });
      }

      const now = Date.now();
      const chatId = randomUUID();
      const newChat: any = {
        id: chatId,
        type: "dm",
        name: "",
        participantIds: [CURRENT_USER_ID, normParticipantId],
        lastMessageContent: "",
        lastMessageAt: now,
        unreadCount: {
          [CURRENT_USER_ID]: 0,
          [normParticipantId]: 0,
        },
        isOnline: false,
        isVerified: false,
        isPinned: false,
        isMuted: false,
        createdBy: CURRENT_USER_ID,
        createdAt: now,
        updatedAt: now,
      };

      let recipientName = "";
      try {
        const uRes = await docClient.send(
          new GetCommand({
            TableName: "IdentityAndAccess",
            Key: { entityId: `USER#${normParticipantId}`, sk: `USER#META` },
          }),
        );
        if (uRes.Item) {
          const udata = uRes.Item;
          recipientName =
            udata.name ||
            udata.username ||
            [udata.firstName, udata.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            "";
          newChat.avatarUrl = udata.avatarUrl || udata.avatar || "";
        }
      } catch {}

      if (!recipientName) {
        let userDoc = await db
          .collection("users")
          .doc(normParticipantId)
          .get();
        if (!userDoc.exists) {
          const querySnap = await db
            .collection("users")
            .where("userId", "==", normParticipantId)
            .limit(1)
            .get();
          if (!querySnap.empty) {
            userDoc = querySnap.docs[0];
          }
        }

        if (userDoc && userDoc.exists) {
          const udata = userDoc.data()!;
          recipientName =
            udata.name ||
            udata.username ||
            [udata.firstName, udata.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            recipientName;
          newChat.avatarUrl = udata.avatarUrl || udata.avatar || "";
        }
      }

      // 1. Write to DynamoDB (Primary)
      try {
        await docClient.send(
          new PutCommand({
            TableName: "RealTimeChat",
            Item: {
              roomId: `ROOM#${chatId}`,
              sk: "ROOM#META",
              ...newChat,
            },
          }),
        );
      } catch (dynErr) {
        console.error("[chats POST DM] DynamoDB write error:", dynErr);
      }

      // 2. Write to Firestore (Dual-Write)
      try {
        await db.collection("chats").doc(chatId).set(newChat);
      } catch (fsErr) {
        console.error("[chats POST DM] Firestore write error:", fsErr);
      }

      return NextResponse.json(
        {
          success: true,
          id: chatId,
          chat: { ...newChat, name: recipientName },
        },
        { status: 201 },
      );
    }

    // ── Group ────────────────────────────────────────────────────────────────
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "name is required for group chats" },
        { status: 400 },
      );
    }

    const members = Array.isArray(participantIds)
      ? Array.from(new Set([CURRENT_USER_ID, ...participantIds.map(normalizeId)]))
      : [CURRENT_USER_ID];

    const now = Date.now();
    const chatId = randomUUID();
    const unreadMap: Record<string, number> = {};
    members.forEach((m) => {
      unreadMap[m] = 0;
    });

    const newChat: any = {
      id: chatId,
      type: "group",
      name: name.trim(),
      participantIds: members,
      lastMessageContent: "",
      lastMessageAt: now,
      unreadCount: unreadMap,
      isOnline: false,
      isVerified: false,
      isPinned: false,
      isMuted: false,
      createdBy: CURRENT_USER_ID,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Write to DynamoDB (Primary)
    try {
      await docClient.send(
        new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${chatId}`,
            sk: "ROOM#META",
            ...newChat,
          },
        }),
      );
    } catch (dynErr) {
      console.error("[chats POST Group] DynamoDB write error:", dynErr);
    }

    // 2. Write to Firestore (Dual-Write)
    try {
      await db.collection("chats").doc(chatId).set(newChat);
    } catch (fsErr) {
      console.error("[chats POST Group] Firestore write error:", fsErr);
    }

    return NextResponse.json(
      { success: true, id: chatId, chat: newChat },
      { status: 201 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/chats error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
