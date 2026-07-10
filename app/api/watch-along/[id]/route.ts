import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import cloudinary from "@/lib/cloudinary";
import { getUserSessionAndRole } from "@/lib/auth";

// Helper function to extract ID from URL
function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}
// GET Request
export async function GET(req: NextRequest) {
  try {
    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const doc = await db.collection("watchAlongRooms").doc(id).get();

    if (!doc.exists) {
      return NextResponse.json(
        { success: false, message: "Room not found" },
        { status: 404 }
      );
    }

    const data = doc.data()!;

    // Fetch related live match
    let liveMatch = null;
    if (data.liveMatchId) {
      const matchDoc = await db
        .collection("watchAlongMatches")
        .doc(data.liveMatchId)
        .get();
      if (matchDoc.exists) {
        liveMatch = { id: matchDoc.id, ...matchDoc.data() };
      }
    }

    return NextResponse.json({
      success: true,
      room: { id: doc.id, ...data, liveMatch },
    });
  } catch (error) {
    console.error("[watch-along/[id] GET]", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch room: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// PUT Request
export async function PUT(req: NextRequest) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const docRef = db.collection("watchAlongRooms").doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      return NextResponse.json(
        { success: false, message: "Room not found" },
        { status: 404 }
      );
    }

    const roomData = existing.data();
    const coHosts = roomData?.coHostUserId
      ? roomData.coHostUserId.split(",").map((id: string) => id.trim().toLowerCase())
      : [];
    const isCoHost = coHosts.some(
      (id: string) =>
        id === user.userId?.toLowerCase() ||
        id === user.name?.toLowerCase() ||
        id === user.email?.toLowerCase()
    );

    const isOwner = roomData?.hostUserId && (
      roomData.hostUserId.toLowerCase() === user.userId?.toLowerCase() ||
      roomData.hostUserId.toLowerCase() === user.name?.toLowerCase() ||
      roomData.hostUserId.toLowerCase() === user.email?.toLowerCase()
    );

    const authorizedRoles = ["super_admin", "admin", "host"];
    if (!authorizedRoles.includes(user.role) && !isOwner && !isCoHost) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    if (user.role === "host" && !isOwner && !isCoHost) {
      return NextResponse.json(
        { success: false, message: "Forbidden - You do not own this watchroom" },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    // Only update fields that were actually sent
    const fields = ["name", "role", "badge", "badgeColor", "borderColor", "watching", "engagement", "active", "hostUserId", "coHostUserId", "sport"];
    for (const field of fields) {
      const val = formData.get(field);
      if (val !== null) {
        if ((field === "coHostUserId" || field === "hostUserId") && (val === "null" || val === "")) {
          updates[field] = null;
        } else {
          updates[field] = val as string;
        }
      }
    }

    const isLive = formData.get("isLive");
    if (isLive !== null) updates.isLive = isLive === "true";

    const liveMatchId = formData.get("liveMatchId");
    if (liveMatchId !== null) {
      if (liveMatchId && liveMatchId !== "null") {
        const matchDoc = await db.collection("watchAlongMatches").doc(liveMatchId as string).get();
        if (!matchDoc.exists) {
          return NextResponse.json(
            { success: false, message: `liveMatchId "${liveMatchId}" does not exist` },
            { status: 400 }
          );
        }
        updates.liveMatchId = liveMatchId as string;
      } else {
        updates.liveMatchId = null;
      }
    }

    // Recompute initials if name changed
    if (updates.name) {
      updates.initials = (updates.name as string)
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }

    // Upload new display picture if provided
    const dpFile = formData.get("displayPicture") as File | null;
    if (dpFile && dpFile.size > 0) {
      const bytes = await dpFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${dpFile.type};base64,${buffer.toString("base64")}`;

      const uploaded = await cloudinary.uploader.upload(base64, {
        folder: "watchAlong/experts",
        public_id: `${Date.now()}-${dpFile.name.replace(/\s/g, "_")}`,
      });
      updates.displayPicture = uploaded.secure_url;
    }

    await docRef.update(updates);

    const updated = await docRef.get();
    return NextResponse.json({
      success: true,
      room: { id: updated.id, ...updated.data() },
    });
  } catch (error) {
    console.error("[watch-along/[id] PUT]", error);
    return NextResponse.json(
      { success: false, message: "Update failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}


// DELETE Request
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const authorizedRoles = ["super_admin", "admin", "host"];
    if (!authorizedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const id   = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    const docRef = db.collection("watchAlongRooms").doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      return NextResponse.json(
        { success: false, message: "Room not found" },
        { status: 404 }
      );
    }

    // Ownership check: Host can only delete their own room
    const roomData = existing.data();
    const isOwner = roomData?.hostUserId && (
      roomData.hostUserId.toLowerCase() === user.userId?.toLowerCase() ||
      roomData.hostUserId.toLowerCase() === user.name?.toLowerCase() ||
      roomData.hostUserId.toLowerCase() === user.email?.toLowerCase()
    );

    if (user.role === "host" && !isOwner) {
      return NextResponse.json(
        { success: false, message: "Forbidden - You do not own this watchroom" },
        { status: 403 }
      );
    }

    // Delete all chat messages in the sub-collection first
    //
    const chatsSnap = await docRef.collection("chats").get();
    const batch = db.batch();
    chatsSnap.docs.forEach((chatDoc) => batch.delete(chatDoc.ref));
    await batch.commit();

    // Delete the room itself
    await docRef.delete();

    return NextResponse.json({ success: true, message: "Room deleted" });
  } catch (error) {
    console.error("[watch-along/[id] DELETE]", error);
    return NextResponse.json(
      { success: false, message: "Delete failed: " + (error as Error).message },
      { status: 500 }
    );
  }
}