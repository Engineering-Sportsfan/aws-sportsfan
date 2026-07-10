// app/api/communities/route.ts
// Powers the "Communities" tab

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
// import { FieldValue } from 'firebase-admin/firestore';

// ─── Auth helper (same pattern as chats & groups) ────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/communities
//   ?limit=20
//   ?lastDocId=<id>
//   ?lastDocMemberCount=<n>
//   ?joined=true  ← only communities the user has joined
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

    // If filtering by joined communities
    if (joined) {
      const memberSnap = await db
        .collectionGroup("communityMembers")
        .where("userId", "==", user.userId)
        .get();

      const communityIds = memberSnap.docs.map(d => d.ref.parent.parent!.id);
      if (communityIds.length === 0) {
        return NextResponse.json({
          success: true,
          communities: [],
          pagination: { limit, hasMore: false, nextCursor: null },
        });
      }

      // Firestore "in" supports max 30 — chunk if needed
      const chunks: string[][] = [];
      for (let i = 0; i < communityIds.length; i += 30) chunks.push(communityIds.slice(i, i + 30));

      const communities: FirebaseFirestore.DocumentData[] = [];
      for (const chunk of chunks) {
        const snap = await db.collection("communities").where("__name__", "in", chunk).get();
        snap.docs.forEach(d => communities.push({ id: d.id, ...d.data() }));
      }

      // Sort by memberCount desc
      communities.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));

      return NextResponse.json({
        success: true,
        communities,
        pagination: { limit, hasMore: false, nextCursor: null },
      });
    }

    // Normal listing - all communities
    let query = db
      .collection("communities")
      .orderBy("memberCount", "desc")
      .limit(limit);

    if (lastDocId && lastDocMemberCount) {
      const lastRef = db.collection("communities").doc(lastDocId);
      const lastDoc = await lastRef.get();
      if (lastDoc.exists) query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    const communities = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return NextResponse.json({
      success: true,
      communities,
      pagination: {
        limit,
        hasMore: communities.length === limit,
        nextCursor: communities.length === limit
          ? {
              lastDocId: lastDoc?.id,
              lastDocMemberCount: lastDoc?.data()?.memberCount,
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


// app/api/communities/route.ts - UPDATE the POST handler
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
    
    // 1. Create the community document
    const newCommunity = {
      name: name.trim(),
      description: description?.trim() ?? "",
      avatarUrl: avatarUrl ?? "",
      memberCount: 1,
      groupCount: 0,
      isVerified: false,
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    };

    const communityRef = await db.collection("communities").add(newCommunity);

    // 2. Create a linked chat for the community (for messaging)
    const chatDoc = {
      type: "group",  // Communities use group chat type
      name: name.trim(),
      participantIds: [user.userId],
      lastMessageContent: "",
      lastMessageAt: now,
      unreadCount: 0,
      isOnline: false,
      isVerified: false,
      isPinned: false,
      isMuted: false,
      communityId: communityRef.id,  // Link back to community
      createdBy: user.userId,
      createdAt: now,
      updatedAt: now,
    };

    const chatRef = await db.collection("chats").add(chatDoc);

    // 3. Link the chat back to the community
    await communityRef.update({ chatId: chatRef.id });

    // 4. Add creator as a member
    await communityRef.collection("communityMembers").doc(user.userId).set({
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: "owner",
      joinedAt: now,
    });

    return NextResponse.json(
      {
        success: true,
        id: communityRef.id,
        community: { id: communityRef.id, ...newCommunity, chatId: chatRef.id },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/communities error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}