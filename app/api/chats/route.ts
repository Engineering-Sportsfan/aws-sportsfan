// app/api/chats/route.ts  — BACKEND
// Powers the "My Chats" tab — list of DMs and group chats

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Path A — Email/password: httpOnly "token" cookie set by /api/auth/login
// Path B — Google users:   "Authorization: Bearer <token>" sent by chatApi.ts
//           Token is issued by frontend's /api/session-token route,
//           signed with the same JWT_SECRET — verified identically here.
//
// NOTE: No auth() / NextAuth import needed. The Bearer token approach works
// cross-domain because it's just a JWT in a header, not a cookie.
// ─────────────────────────────────────────────────────────────────────────────
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
  console.log("hit chat api");
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
      const lastDoc = await lastRef.get();
      if (lastDoc.exists) query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const chats = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

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

      // 1. Fetch by document ID (emails / exact IDs)
      const docRefs = idsArray.map((id) => db.collection("users").doc(id));
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

      // 2. Query by userId field for any IDs that we couldn't resolve yet
      const unresolvedIds = idsArray.filter((id) => !userProfiles[id]);
      if (unresolvedIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < unresolvedIds.length; i += 30) {
          chunks.push(unresolvedIds.slice(i, i + 30));
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

 const enrichedChats = await Promise.all(
  chats.map(async (chat: any) => {
    // Read unread count directly from the map on the chat document
    const unreadCount = chat.unreadCount?.[CURRENT_USER_ID] || 0;

    if (chat.type === "dm" && Array.isArray(chat.participantIds)) {
      const otherId = chat.participantIds.find(
        (id: string) => !isSameUser(id, CURRENT_USER_ID)
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
  })
);

    return NextResponse.json({
      success: true,
      chats: enrichedChats,
      pagination: {
        limit,
        hasMore: chats.length === limit,
        nextCursor:
          chats.length === limit
            ? {
                lastDocId: lastDoc?.id,
                lastDocUpdatedAt: lastDoc?.data()?.updatedAt,
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

      const existing = await db
        .collection("chats")
        .where("type", "==", "dm")
        .where("participantIds", "array-contains", CURRENT_USER_ID)
        .get();

      const alreadyExists = existing.docs.find((d) => {
        const pids = (d.data().participantIds as string[]).map(normalizeId);
        return pids.includes(normParticipantId);
      });

      if (alreadyExists) {
        let name = "";
        let avatarUrl = alreadyExists.data().avatarUrl || "";

        let userDoc = await db.collection("users").doc(normParticipantId).get();
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
          name =
            udata.name ||
            udata.username ||
            [udata.firstName, udata.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            name;
          avatarUrl = udata.avatarUrl || udata.avatar || avatarUrl;
        }

        return NextResponse.json({
          success: true,
          id: alreadyExists.id,
          chat: {
            id: alreadyExists.id,
            ...alreadyExists.data(),
            name,
            avatarUrl,
          },
          message: "Existing DM returned",
        });
      }

      const now = Date.now();
      const newChat: any = {
        type: "dm",
        name: "", // Store as empty string in Firestore for DM
        participantIds: [CURRENT_USER_ID, normParticipantId],
        lastMessageContent: "",
        lastMessageAt: now,
        unreadCount: 0,
        isOnline: false,
        isVerified: false,
        isPinned: false,
        isMuted: false,
        createdBy: CURRENT_USER_ID,
        createdAt: now,
        updatedAt: now,
      };

      let recipientName = "";
      let userDoc = await db.collection("users").doc(normParticipantId).get();
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
          [udata.firstName, udata.lastName].filter(Boolean).join(" ").trim() ||
          recipientName;
        newChat.avatarUrl = udata.avatarUrl || udata.avatar || "";
      }

      const docRef = await db.collection("chats").add(newChat);
      return NextResponse.json(
        {
          success: true,
          id: docRef.id,
          chat: { id: docRef.id, ...newChat, name: recipientName },
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
      ? Array.from(new Set([CURRENT_USER_ID, ...participantIds]))
      : [CURRENT_USER_ID];

    const now = Date.now();
    const newChat = {
      type: "group",
      name: name.trim(),
      participantIds: members,
      lastMessageContent: "",
      lastMessageAt: now,
      unreadCount: 0,
      isOnline: false,
      isVerified: false,
      isPinned: false,
      isMuted: false,
      createdBy: CURRENT_USER_ID,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection("chats").add(newChat);
    return NextResponse.json(
      { success: true, id: docRef.id, chat: { id: docRef.id, ...newChat } },
      { status: 201 },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/chats error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
