// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import type { Notification } from "@/app/models/Notification";

// async function getResolvedUserId(user: { email: string; userId: string }) {
//   let resolvedUserId = user.email;
//   let userSnap = await db.collection("users").doc(user.email).get();
//   if (!userSnap.exists) {
//     userSnap = await db.collection("users").doc(user.userId).get();
//     if (userSnap.exists) {
//       resolvedUserId = user.userId;
//     }
//   }
//   return resolvedUserId;
// }

// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await getResolvedUserId(user);

//     const { searchParams } = new URL(req.url);
//     const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
//     const lastDocId = searchParams.get("lastDocId");
//     const unreadOnly = searchParams.get("unreadOnly") === "true";

//     let query = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items")
//       .orderBy("createdAt", "desc")
//       .limit(limit);

//     if (unreadOnly) query = query.where("read", "==", false);

//     if (lastDocId) {
//       const lastDoc = await db
//         .collection("notifications")
//         .doc(resolvedUserId)
//         .collection("items")
//         .doc(lastDocId)
//         .get();
//       if (lastDoc.exists) query = query.startAfter(lastDoc);
//     }

//     const snapshot = await query.get();
//     const notifications: Notification[] = snapshot.docs.map((doc) => ({
//       ...(doc.data() as Notification),
//       notifId: doc.id,
//     }));

//     const lastDoc = snapshot.docs[snapshot.docs.length - 1];

//     return NextResponse.json({
//       success: true,
//       notifications,
//       unreadCount: notifications.filter((n) => !n.read).length,
//       pagination: {
//         limit,
//         hasMore: notifications.length === limit,
//         nextCursor:
//           notifications.length === limit ? { lastDocId: lastDoc?.id } : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // PATCH /api/roar/notifications  body: { notifId?: string, markAll?: boolean }
// export async function PATCH(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await getResolvedUserId(user);

//     const body = await req.json();
//     const { notifId, markAll } = body;

//     const baseRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items");

//     if (markAll) {
//       const unread = await baseRef.where("read", "==", false).get();
//       const batch = db.batch();
//       unread.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
//       await batch.commit();
//       return NextResponse.json({ success: true, updated: unread.size });
//     }

//     if (notifId) {
//       await baseRef.doc(notifId).update({ read: true });
//       return NextResponse.json({ success: true, updated: 1 });
//     }

//     return NextResponse.json(
//       { error: "Provide notifId or markAll: true" },
//       { status: 400 },
//     );
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("PATCH /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// export async function DELETE(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await getResolvedUserId(user);

//     const body = await req.json();
//     const { notifId, all } = body;

//     const baseRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items");

//     if (notifId && !all) {
//       await baseRef.doc(notifId).delete();
//       return NextResponse.json({ success: true });
//     }

//     if (all) {
//       const snapshot = await baseRef.get();
//       if (snapshot.empty) {
//         return NextResponse.json({ success: true, deleted: 0 });
//       }

//       const batch = db.batch();
//       snapshot.docs.forEach((doc) => batch.delete(doc.ref));
//       await batch.commit();
//       return NextResponse.json({ success: true, deleted: snapshot.size });
//     }

//     return NextResponse.json({ error: "Provide notifId or all: true" }, { status: 400 });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("DELETE /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }






// // api/roar/notifications/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";
// import { getUser } from "@/lib/getUser";
// import type { Notification } from "@/app/models/Notification";

// // ── Shared helper ─────────────────────────────────────────────────────────────
// // 1 read on the happy path (email key exists), 2 on miss.
// // Returns only the resolved ID — notifications routes don't need the user snap.
// async function resolveUserId(email: string, uid: string): Promise<string | null> {
//   const emailSnap = await db.collection("users").doc(email).get();
//   if (emailSnap.exists) return email;

//   const uidSnap = await db.collection("users").doc(uid).get();
//   if (uidSnap.exists) return uid;

//   return null;
// }

// // Firestore batch limit
// const BATCH_LIMIT = 500;

// // ────────────────────────────────────────────────────────────────────────────
// // GET  /api/roar/notifications
// // ────────────────────────────────────────────────────────────────────────────
// //
// // Quota cost per request:
// //   1  — user resolution (resolveUserId)
// //   1  — unreadCount doc (summary doc, single read regardless of page size)
// //   N  — notification docs (page of N)
// //   1  — cursor doc read REMOVED (timestamp cursor used instead)
// //   ─────────────────────────────────────────────
// //   2 + N reads total
// //
// // Fixes vs original:
// //   1. resolveUserId() replaces getResolvedUserId() — original read the user
// //      snap and immediately discarded it. Pure wasted read.
// //   2. Timestamp cursor replaces lastDocId cursor — eliminates 1 extra read
// //      per page turn.
// //   3. where("read") moved before orderBy() — Firestore requires this ordering
// //      for compound queries; original would throw in production.
// //   4. unreadCount now comes from a summary doc instead of filtering the
// //      current page. A page of 20 could never correctly report 50 unread.
// //      Write to notifications/{userId}/meta/summary { unreadCount } whenever
// //      you create a notification (see note below).
// //
// // Summary doc pattern:
// //   When you write a new notification, also run:
// //     db.collection("notifications").doc(userId)
// //       .collection("meta").doc("summary")
// //       .set({ unreadCount: FieldValue.increment(1) }, { merge: true })
// //   When marking read, decrement by the number marked.
// //   This turns an O(N) count into a single O(1) read.
// //
// export async function GET(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     // FIX 1: resolveUserId — no wasted snap read
//     const resolvedUserId = await resolveUserId(user.email, user.userId);
//     if (!resolvedUserId) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }

//     const { searchParams } = new URL(req.url);
//     const limit         = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
//     const lastCreatedAt = searchParams.get("lastCreatedAt")
//       ? parseInt(searchParams.get("lastCreatedAt")!, 10)
//       : null;
//     const unreadOnly = searchParams.get("unreadOnly") === "true";

//     const baseRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items");

//     // FIX 3: where() before orderBy() — required for compound Firestore queries.
//     // Original had orderBy() first which throws: "Cannot have inequality filter
//     // on different field than first orderBy".
//     // Index required: read == false + createdAt DESC (for unreadOnly path)
//     let query = unreadOnly
//       ? baseRef.where("read", "==", false).orderBy("createdAt", "desc").limit(limit)
//       : baseRef.orderBy("createdAt", "desc").limit(limit);

//     // FIX 2: timestamp cursor — 0 extra reads vs 1 for lastDocId cursor
//     if (lastCreatedAt !== null) {
//       query = query.startAfter(lastCreatedAt);
//     }

//     // FIX 4: unreadCount from summary doc — fired in parallel with the page query
//     // Falls back to 0 if the summary doc doesn't exist yet (safe for existing data).
//     const [snapshot, summarySnap] = await Promise.all([
//       query.get(),
//       db
//         .collection("notifications")
//         .doc(resolvedUserId)
//         .collection("meta")
//         .doc("summary")
//         .get(),
//     ]);

//     const unreadCount: number =
//       (summarySnap.exists ? (summarySnap.data() as any)?.unreadCount : null) ?? 0;

//     if (snapshot.empty) {
//       return NextResponse.json({
//         success: true,
//         notifications: [],
//         unreadCount,
//         pagination: { limit, hasMore: false, nextCursor: null },
//       });
//     }

//     const notifications: Notification[] = snapshot.docs.map((doc) => ({
//       ...(doc.data() as Notification),
//       notifId: doc.id,
//     }));

//     const lastNotif = notifications[notifications.length - 1];

//     return NextResponse.json({
//       success: true,
//       notifications,
//       unreadCount,
//       pagination: {
//         limit,
//         hasMore: notifications.length === limit,
//         nextCursor:
//           notifications.length === limit
//             ? { lastCreatedAt: lastNotif?.createdAt ?? null }
//             : null,
//       },
//     });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ────────────────────────────────────────────────────────────────────────────
// // PATCH  /api/roar/notifications
// // body: { notifId?: string } | { markAll: true }
// // ────────────────────────────────────────────────────────────────────────────
// //
// // Fixes vs original:
// //   1. markAll now processes in batches of 500 — original would silently
// //      truncate if the user had more than 500 unread notifications.
// //   2. markAll decrements the summary doc unreadCount atomically so GET
// //      always returns an accurate count without re-scanning.
// //   3. Single notifId mark also decrements the summary doc.
// //
// export async function PATCH(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await resolveUserId(user.email, user.userId);
//     if (!resolvedUserId) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }

//     const body = await req.json();
//     const { notifId, markAll } = body;

//     const baseRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items");

//     const summaryRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("meta")
//       .doc("summary");

//     // ── Mark all unread as read ───────────────────────────────────────────────
//     if (markAll) {
//       const unread = await baseRef.where("read", "==", false).get();
//       if (unread.empty) {
//         return NextResponse.json({ success: true, updated: 0 });
//       }

//       // FIX: process in chunks of 500 to respect Firestore batch limit
//       let totalUpdated = 0;
//       const docs = unread.docs;

//       for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
//         const chunk = docs.slice(i, i + BATCH_LIMIT);
//         const batch = db.batch();
//         chunk.forEach((doc) => batch.update(doc.ref, { read: true }));
//         // Decrement summary by the size of this chunk
//         batch.set(
//           summaryRef,
//           { unreadCount: Math.max(0, docs.length - totalUpdated - chunk.length) },
//           { merge: true }
//         );
//         await batch.commit();
//         totalUpdated += chunk.length;
//       }

//       // Final summary set to 0 to guarantee consistency
//       await summaryRef.set({ unreadCount: 0 }, { merge: true });

//       return NextResponse.json({ success: true, updated: totalUpdated });
//     }

//     // ── Mark single notification as read ─────────────────────────────────────
//     if (notifId) {
//       const notifRef = baseRef.doc(notifId);
//       const notifSnap = await notifRef.get();

//       // Only decrement if it was actually unread — avoid double-decrement
//       const wasUnread = notifSnap.exists && !(notifSnap.data() as Notification).read;

//       const batch = db.batch();
//       batch.update(notifRef, { read: true });
//       if (wasUnread) {
//         // FieldValue.increment with a negative value decrements atomically
//         const { FieldValue } = await import("firebase-admin/firestore");
//         batch.set(summaryRef, { unreadCount: FieldValue.increment(-1) }, { merge: true });
//       }
//       await batch.commit();

//       return NextResponse.json({ success: true, updated: 1 });
//     }

//     return NextResponse.json(
//       { error: "Provide notifId or markAll: true" },
//       { status: 400 }
//     );
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("PATCH /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ────────────────────────────────────────────────────────────────────────────
// // DELETE  /api/roar/notifications
// // body: { notifId?: string } | { all: true }
// // ────────────────────────────────────────────────────────────────────────────
// //
// // Fixes vs original:
// //   1. Delete all now processes in batches of 500 — original would silently
// //      truncate beyond 500 notifications.
// //   2. Resets summary doc unreadCount to 0 after clearing all notifications.
// //
// export async function DELETE(req: NextRequest) {
//   try {
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const resolvedUserId = await resolveUserId(user.email, user.userId);
//     if (!resolvedUserId) {
//       return NextResponse.json({ error: "User profile not found" }, { status: 404 });
//     }

//     const body = await req.json();
//     const { notifId, all } = body;

//     const baseRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("items");

//     const summaryRef = db
//       .collection("notifications")
//       .doc(resolvedUserId)
//       .collection("meta")
//       .doc("summary");

//     // ── Delete single notification ────────────────────────────────────────────
//     if (notifId && !all) {
//       await baseRef.doc(notifId).delete();
//       return NextResponse.json({ success: true, deleted: 1 });
//     }

//     // ── Delete all notifications ──────────────────────────────────────────────
//     if (all) {
//       const snapshot = await baseRef.get();
//       if (snapshot.empty) {
//         return NextResponse.json({ success: true, deleted: 0 });
//       }

//       // FIX: process in chunks of 500 to respect Firestore batch limit
//       let totalDeleted = 0;
//       const docs = snapshot.docs;

//       for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
//         const chunk = docs.slice(i, i + BATCH_LIMIT);
//         const batch = db.batch();
//         chunk.forEach((doc) => batch.delete(doc.ref));
//         await batch.commit();
//         totalDeleted += chunk.length;
//       }

//       // Reset summary doc — no unread notifications remain
//       await summaryRef.set({ unreadCount: 0 }, { merge: true });

//       return NextResponse.json({ success: true, deleted: totalDeleted });
//     }

//     return NextResponse.json(
//       { error: "Provide notifId or all: true" },
//       { status: 400 }
//     );
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("DELETE /api/roar/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }




// app/api/notifications/route.ts
//
// UPDATED: GET now accepts ?uid= as an alternative to ?email= so that
// users who signed in with Google (and whose notifications were stored with
// recipientUid) are still found even if their email isn't indexed separately.
// The page always passes both email AND uid when available.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid) {
      return NextResponse.json(
        { error: "email or uid is required" },
        { status: 400 }
      );
    }

    if (countOnly) {
      // Fast path: just return unread count
      const results = await Promise.all([
        email
          ? db
              .collection("notifications")
              .where("recipientEmail", "==", email)
              .where("isRead", "==", false)
              .get()
          : null,
        uid
          ? db
              .collection("notifications")
              .where("recipientUid", "==", uid)
              .where("isRead", "==", false)
              .get()
          : null,
      ]);

      // De-dupe by doc id across both queries
      const seen = new Set<string>();
      let count = 0;
      for (const snap of results) {
        if (!snap) continue;
        snap.docs.forEach((d) => {
          if (!seen.has(d.id)) { seen.add(d.id); count++; }
        });
      }

      return NextResponse.json({ success: true, unreadCount: count });
    }

    // Full fetch: run both queries in parallel and de-dupe
    const [emailSnap, uidSnap] = await Promise.all([
      email
        ? db
            .collection("notifications")
            .where("recipientEmail", "==", email)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get()
        : null,
      uid
        ? db
            .collection("notifications")
            .where("recipientUid", "==", uid)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get()
        : null,
    ]);

    const seen = new Set<string>();
    const notifications: any[] = [];

    for (const snap of [emailSnap, uidSnap]) {
      if (!snap) continue;
      snap.docs.forEach((doc) => {
        if (!seen.has(doc.id)) {
          seen.add(doc.id);
          notifications.push({ id: doc.id, ...doc.data() });
        }
      });
    }

    // Re-sort after merging (both snapshots are individually sorted desc)
    notifications.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    // Trim to 50 after merge
    notifications.splice(50);

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({ success: true, notifications, unreadCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── POST — create a notification manually ────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipientEmail,
      recipientUid,
      type,
      message,
      battleId, battleName, battleType, senderId, senderName,
      audioPublicId, audioTitle, audioUrl, audioDuration,
      audioDurationSeconds, audioFormat,
    } = body;

    if (!recipientEmail || !type || !message) {
      return NextResponse.json(
        { error: "recipientEmail, type, and message are required" },
        { status: 400 }
      );
    }

    const docRef = db.collection("notifications").doc();
    const payload: Record<string, unknown> = {
      recipientEmail,
      recipientUid: recipientUid ?? null,
      type,
      message,
      isRead: false,
      createdAt: Date.now(),
    };

    if (battleId)
      Object.assign(payload, { battleId, battleName, battleType, senderId, senderName });

    if (audioPublicId)
      Object.assign(payload, {
        audioPublicId, audioTitle, audioUrl, audioDuration,
        audioDurationSeconds, audioFormat,
        audioUploadedAt: Date.now(),
      });

    await docRef.set(payload);
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── PATCH — mark read ────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, uid, action } = body;

    if (action === "markRead" && id) {
      await db.collection("notifications").doc(id).update({
        isRead: true, readAt: Date.now(),
      });
      return NextResponse.json({ success: true });
    }

    if (action === "markAllRead" && (email || uid)) {
      // Collect unread docs by email + uid
      const [emailSnap, uidSnap] = await Promise.all([
        email
          ? db.collection("notifications")
              .where("recipientEmail", "==", email)
              .where("isRead", "==", false).get()
          : null,
        uid
          ? db.collection("notifications")
              .where("recipientUid", "==", uid)
              .where("isRead", "==", false).get()
          : null,
      ]);

      const seen = new Set<string>();
      const batch = db.batch();
      for (const snap of [emailSnap, uidSnap]) {
        if (!snap) continue;
        snap.docs.forEach((doc) => {
          if (!seen.has(doc.id)) {
            seen.add(doc.id);
            batch.update(doc.ref, { isRead: true, readAt: Date.now() });
          }
        });
      }
      if (seen.size > 0) await batch.commit();
      return NextResponse.json({ success: true, updated: seen.size });
    }

    return NextResponse.json(
      { error: "Invalid action or missing fields" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, uid, all } = body;

    if (id && !all) {
      await db.collection("notifications").doc(id).delete();
      return NextResponse.json({ success: true });
    }

    if ((email || uid) && all) {
      const [emailSnap, uidSnap] = await Promise.all([
        email
          ? db.collection("notifications")
              .where("recipientEmail", "==", email).get()
          : null,
        uid
          ? db.collection("notifications")
              .where("recipientUid", "==", uid).get()
          : null,
      ]);

      const seen = new Set<string>();
      const batch = db.batch();
      for (const snap of [emailSnap, uidSnap]) {
        if (!snap) continue;
        snap.docs.forEach((doc) => {
          if (!seen.has(doc.id)) { seen.add(doc.id); batch.delete(doc.ref); }
        });
      }
      if (seen.size > 0) await batch.commit();
      return NextResponse.json({ success: true, deleted: seen.size });
    }

    return NextResponse.json(
      { error: "Provide id for single delete, or (email or uid) + all:true for bulk delete" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}