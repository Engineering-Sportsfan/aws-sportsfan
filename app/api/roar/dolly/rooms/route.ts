import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; username: string } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  const data = snap.data() as { username?: string };
  return { id: info.actualUserId, username: data?.username ?? "Fan" };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 1. Fetch user's Dolly history from Firestore collectionGroup (no global index in DynamoDB for this query)
    const snap = await db
      .collectionGroup("dollyReplies")
      .where("userId", "==", resolved.id)
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    const latestByRoom = new Map<string, { question: string; createdAt: number }>();
    for (const doc of snap.docs) {
      const roomId = doc.ref.parent.parent?.id;
      if (!roomId || latestByRoom.has(roomId)) continue;
      const d = doc.data();
      latestByRoom.set(roomId, { question: d.question, createdAt: d.createdAt });
    }

    const roomIds = Array.from(latestByRoom.keys());
    if (roomIds.length === 0) {
      return NextResponse.json({ success: true, rooms: [] });
    }

    const roomInfoById = new Map<string, { name: string; sport: string }>();

    // 2. Fetch room details DynamoDB-first in parallel
    await Promise.all(
      roomIds.map(async (roomId) => {
        let name = "Match";
        let sport = "general";
        let fetchedFromDynamo = false;

        try {
          const candidates = [`ROOM#${roomId}`, roomId];
          for (const cand of candidates) {
            const getMeta = await docClient.send(new GetCommand({
              TableName: "RealTimeChat",
              Key: { roomId: cand, sk: `META#${roomId}` }
            }));
            if (getMeta.Item) {
              name = getMeta.Item.name ?? getMeta.Item.title ?? "Match";
              sport = getMeta.Item.sport ?? "general";
              fetchedFromDynamo = true;
              break;
            }
          }
        } catch (dynErr) {
          console.warn("[DollyRooms GET] DynamoDB room fetch failed for:", roomId, dynErr);
        }

        // Fallback to Firestore
        if (!fetchedFromDynamo) {
          try {
            const doc = await db.collection("roarRooms").doc(roomId).get();
            if (doc.exists) {
              const data = doc.data() as { name?: string; sport?: string };
              name = data?.name ?? "Match";
              sport = data?.sport ?? "general";
            }
          } catch (fsErr) {
            console.error("[DollyRooms GET] Firestore room fallback failed for:", roomId, fsErr);
          }
        }

        roomInfoById.set(roomId, { name, sport });
      })
    );

    const rooms = roomIds
      .map((roomId) => ({
        roomId,
        title: roomInfoById.get(roomId)?.name ?? "Match",
        sport: roomInfoById.get(roomId)?.sport ?? "general",
        lastQuestion: latestByRoom.get(roomId)!.question,
        lastAskedAt: latestByRoom.get(roomId)!.createdAt,
      }))
      .sort((a, b) => b.lastAskedAt - a.lastAskedAt);

    return NextResponse.json({ success: true, rooms });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET dolly rooms error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}