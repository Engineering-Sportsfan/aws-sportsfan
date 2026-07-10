import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

interface FollowingRecord {
  userId: string;
  userEmail: string;
  followingplayername: string;
  createdAt: number;
  updatedAt: number;
}

const COLLECTION = "following";

function buildFollowDocId(userId: string, followingPlayerName: string) {
  return `${encodeURIComponent(userId)}_${encodeURIComponent(
    followingPlayerName.toLowerCase()
  )}`;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const userEmail = searchParams.get("userEmail");

    if (!userId && !userEmail) {
      const snapshot = await db.collection(COLLECTION).orderBy("createdAt", "desc").get();
      const following = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      return NextResponse.json({ success: true, following, total: following.length });
    }

    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (userId) {
      query = query.where("userId", "==", userId);
    }

    if (userEmail) {
      query = query.where("userEmail", "==", userEmail);
    }

    const snapshot = await query.get();
    const following = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ success: true, following, total: following.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error fetching following records:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const userId = normalizeText(body.userId);
    const userEmail = normalizeText(body.userEmail);
    const followingplayername = normalizeText(body.followingplayername);

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!userEmail) {
      return NextResponse.json({ error: "userEmail is required" }, { status: 400 });
    }

    if (!followingplayername) {
      return NextResponse.json(
        { error: "followingplayername is required" },
        { status: 400 }
      );
    }

    const docId = buildFollowDocId(userId, followingplayername);
    const docRef = db.collection(COLLECTION).doc(docId);
    const existingDoc = await docRef.get();

    if (existingDoc.exists) {
      return NextResponse.json(
        {
          error: "This player is already being followed by this user.",
          following: { id: existingDoc.id, ...existingDoc.data() },
        },
        { status: 409 }
      );
    }

    const newFollowing: FollowingRecord = {
      userId,
      userEmail,
      followingplayername,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await docRef.set(newFollowing);

    return NextResponse.json(
      {
        success: true,
        following: { id: docId, ...newFollowing },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error creating following record:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
//done
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let userId = searchParams.get("userId") || undefined;
    let followingplayername = searchParams.get("followingplayername") || undefined;

    if (!userId || !followingplayername) {
      // Try JSON body as fallback
      const body = await req.json().catch(() => ({}));
      userId = userId || normalizeText(body.userId);
      followingplayername = followingplayername || normalizeText(body.followingplayername);
    }

    if (!userId || !followingplayername) {
      return NextResponse.json(
        { error: "userId and followingplayername are required to unfollow" },
        { status: 400 }
      );
    }

    const docId = buildFollowDocId(userId, followingplayername);
    const docRef = db.collection(COLLECTION).doc(docId);
    const existing = await docRef.get();

    if (!existing.exists) {
      return NextResponse.json({ error: "Follow record not found" }, { status: 404 });
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("Error deleting following record:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}