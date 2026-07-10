// import { NextRequest, NextResponse } from "next/server";
// import { db } from "@/lib/firebaseAdmin";

// // ─── GET — fetch notifications for a user by email ────────────────────────────
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const email = searchParams.get("email");

//     if (!email) {
//       return NextResponse.json({ error: "email is required" }, { status: 400 });
//     }

//     const snapshot = await db
//       .collection("notifications")
//       .where("recipientEmail", "==", email)
//       .orderBy("createdAt", "desc")
//       .limit(50)
//       .get();

//     const notifications = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     return NextResponse.json({ success: true, notifications });
//   } catch (error) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── PATCH — mark one or all notifications as read ───────────────────────────
// export async function PATCH(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const { id, email, action } = body;

//     // Mark single notification as read
//     if (action === "markRead" && id) {
//       await db.collection("notifications").doc(id).update({
//         isRead: true,
//         readAt: Date.now(),
//       });
//       return NextResponse.json({ success: true });
//     }

//     // Mark all notifications as read for a user
//     if (action === "markAllRead" && email) {
//       const snapshot = await db
//         .collection("notifications")
//         .where("recipientEmail", "==", email)
//         .where("isRead", "==", false)
//         .get();

//       if (snapshot.empty) {
//         return NextResponse.json({ success: true, updated: 0 });
//       }

//       const batch = db.batch();
//       snapshot.docs.forEach((doc) => {
//         batch.update(doc.ref, { isRead: true, readAt: Date.now() });
//       });
//       await batch.commit();

//       return NextResponse.json({ success: true, updated: snapshot.size });
//     }

//     return NextResponse.json({ error: "Invalid action or missing fields" }, { status: 400 });
//   } catch (error) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("PATCH /api/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }

// // ─── DELETE — clear one notification or all for a user ───────────────────────
// export async function DELETE(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const { id, email, all } = body;

//     // Delete single notification
//     if (id && !all) {
//       await db.collection("notifications").doc(id).delete();
//       return NextResponse.json({ success: true });
//     }

//     // Delete all notifications for a user
//     if (email && all) {
//       const snapshot = await db
//         .collection("notifications")
//         .where("recipientEmail", "==", email)
//         .get();

//       if (snapshot.empty) {
//         return NextResponse.json({ success: true, deleted: 0 });
//       }

//       const batch = db.batch();
//       snapshot.docs.forEach((doc) => batch.delete(doc.ref));
//       await batch.commit();

//       return NextResponse.json({ success: true, deleted: snapshot.size });
//     }

//     return NextResponse.json(
//       { error: "Provide id for single delete, or email + all:true for bulk delete" },
//       { status: 400 }
//     );
//   } catch (error) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("DELETE /api/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }







// app/api/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

// ─── GET — fetch notifications for a user + total unread count ────────────────
// export async function GET(req: NextRequest) {
//   try {
//     const { searchParams } = new URL(req.url);
//     const email = searchParams.get("email");
//     // Optional: pass ?countOnly=true to get just the unread number (used by Header)
//     const countOnly = searchParams.get("countOnly") === "true";

//     if (!email) {
//       return NextResponse.json({ error: "email is required" }, { status: 400 });
//     }

//     if (countOnly) {
//       const snap = await db
//         .collection("notifications")
//         .where("recipientEmail", "==", email)
//         .where("isRead", "==", false)
//         .get();
//       return NextResponse.json({ success: true, unreadCount: snap.size });
//     }

//     const snapshot = await db
//       .collection("notifications")
//       .where("recipientEmail", "==", email)
//       .orderBy("createdAt", "desc")
//       .limit(50)
//       .get();

//     const notifications = snapshot.docs.map((doc) => ({
//       id: doc.id,
//       ...doc.data(),
//     }));

//     const unreadCount = notifications.filter(
//       (n: Record<string, unknown>) => !n.isRead
//     ).length;

//     return NextResponse.json({ success: true, notifications, unreadCount });
//   } catch (error) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     console.error("GET /api/notifications error:", error);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }


export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const uid = searchParams.get("uid");
    const countOnly = searchParams.get("countOnly") === "true";

    if (!email && !uid) {
      return NextResponse.json({ error: "email or uid is required" }, { status: 400 });
    }

    if (countOnly) {
      const queries = [];
      if (email) queries.push(
        db.collection("notifications").where("recipientEmail", "==", email).where("isRead", "==", false).get()
      );
      if (uid) queries.push(
        db.collection("notifications").where("recipientUid", "==", uid).where("isRead", "==", false).get()
      );
      const results = await Promise.all(queries);
      const ids = new Set<string>();
      results.forEach(snap => snap.docs.forEach(doc => ids.add(doc.id)));
      return NextResponse.json({ success: true, unreadCount: ids.size });
    }

    const queries = [];
    if (email) queries.push(
      db.collection("notifications").where("recipientEmail", "==", email).orderBy("createdAt", "desc").limit(50).get()
    );
    if (uid) queries.push(
      db.collection("notifications").where("recipientUid", "==", uid).orderBy("createdAt", "desc").limit(50).get()
    );

    const results = await Promise.all(queries);
    const seen = new Set<string>();
    const notifications: any[] = [];
    results.forEach(snap => snap.docs.forEach(doc => {
      if (!seen.has(doc.id)) {
        seen.add(doc.id);
        notifications.push({ id: doc.id, ...doc.data() });
      }
    }));

    notifications.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const unreadCount = notifications.filter(n => !n.isRead).length;

    return NextResponse.json({ success: true, notifications, unreadCount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


// ─── POST — create a single notification manually ────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      recipientEmail,
      recipientUid,
      type,
      message,
      // battle fields (optional)
      battleId,
      battleName,
      battleType,
      senderId,
      senderName,
      // audio fields (optional)
      audioPublicId,
      audioTitle,
      audioUrl,
      audioDuration,
      audioDurationSeconds,
      audioFormat,
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

    // Conditionally attach battle fields
    if (battleId) Object.assign(payload, { battleId, battleName, battleType, senderId, senderName });

    // Conditionally attach audio fields
    if (audioPublicId)
      Object.assign(payload, {
        audioPublicId,
        audioTitle,
        audioUrl,
        audioDuration,
        audioDurationSeconds,
        audioFormat,
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

// ─── PATCH — mark one or all notifications as read ───────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, action } = body;

    if (action === "markRead" && id) {
      await db.collection("notifications").doc(id).update({
        isRead: true,
        readAt: Date.now(),
      });
      return NextResponse.json({ success: true });
    }

    if (action === "markAllRead" && email) {
      const snapshot = await db
        .collection("notifications")
        .where("recipientEmail", "==", email)
        .where("isRead", "==", false)
        .get();

      if (snapshot.empty) {
        return NextResponse.json({ success: true, updated: 0 });
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { isRead: true, readAt: Date.now() });
      });
      await batch.commit();

      return NextResponse.json({ success: true, updated: snapshot.size });
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

// ─── DELETE — clear one notification or all for a user ───────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, email, all } = body;

    if (id && !all) {
      await db.collection("notifications").doc(id).delete();
      return NextResponse.json({ success: true });
    }

    if (email && all) {
      const snapshot = await db
        .collection("notifications")
        .where("recipientEmail", "==", email)
        .get();

      if (snapshot.empty) {
        return NextResponse.json({ success: true, deleted: 0 });
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      return NextResponse.json({ success: true, deleted: snapshot.size });
    }

    return NextResponse.json(
      { error: "Provide id for single delete, or email + all:true for bulk delete" },
      { status: 400 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("DELETE /api/notifications error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}