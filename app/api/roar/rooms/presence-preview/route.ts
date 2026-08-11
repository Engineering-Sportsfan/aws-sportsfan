// api/roar/rooms/presence-preview/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const PRESENCE_TTL_MS = 60_000;
const PREVIEW_COUNT = 3;

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { roomIds } = await req.json();
    if (!Array.isArray(roomIds) || roomIds.length === 0) {
      return NextResponse.json({ success: true, rooms: {} });
    }

    const cutoff = Date.now() - PRESENCE_TTL_MS;

    const entries = await Promise.all(
      roomIds.map(async (roomId: string) => {
        let activeRecords: any[] = [];
        let fetchedFromDynamo = false;
        let totalJoinCount = 0;

        // Try DynamoDB
        try {
          const res = await docClient.send(new QueryCommand({
            TableName: "RealTimeChat",
            KeyConditionExpression: "roomId = :r AND begins_with(sk, :p)",
            FilterExpression: "lastSeenAt >= :c",
            ExpressionAttributeValues: {
              ":r": `ROOM#${roomId}`,
              ":p": "PRESENCE#",
              ":c": cutoff
            }
          }));

          if (res.Items) {
            activeRecords = res.Items;
            fetchedFromDynamo = true;
          }

          // Fetch totalJoinCount
          const candidates = [`ROOM#${roomId}`, roomId];
          for (const cand of candidates) {
            const getMeta = await docClient.send(new GetCommand({
              TableName: "RealTimeChat",
              Key: { roomId: cand, sk: `META#${roomId}` }
            }));
            if (getMeta.Item) {
              totalJoinCount = getMeta.Item.totalJoinCount ?? 0;
              break;
            }
          }
        } catch (dynErr) {
          console.warn("[PresencePreview POST] DynamoDB preview failed for room:", roomId, dynErr);
        }

        // Fallback to Firestore
        if (!fetchedFromDynamo) {
          try {
            const snap = await db
              .collection("roarRooms")
              .doc(roomId)
              .collection("presence")
              .where("lastSeenAt", ">=", cutoff)
              .orderBy("lastSeenAt", "desc")
              .limit(PREVIEW_COUNT)
              .get();

            const countSnap = await db
              .collection("roarRooms")
              .doc(roomId)
              .collection("presence")
              .where("lastSeenAt", ">=", cutoff)
              .count()
              .get();

            const roomSnap = await db.collection("roarRooms").doc(roomId).get();
            totalJoinCount = roomSnap.data()?.totalJoinCount ?? 0;

            const fans = snap.docs.map((d) => {
              const data = d.data();
              return {
                uid: data.uid,
                username: data.username,
                avatarUrl: data.avatarUrl ?? null,
                badge: data.badge ?? null,
              };
            });

            return [roomId, { fanCount: countSnap.data().count, fans, totalJoinCount }] as const;
          } catch (fsErr) {
            console.error("[PresencePreview POST] Firestore preview fallback failed for room:", roomId, fsErr);
            return [roomId, { fanCount: 0, fans: [], totalJoinCount: 0 }] as const;
          }
        }

        // Format DynamoDB records
        const sorted = [...activeRecords].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        const fans = sorted.slice(0, PREVIEW_COUNT).map((item) => ({
          uid: item.uid,
          username: item.username,
          avatarUrl: item.avatarUrl ?? null,
          badge: item.badge ?? null,
        }));

        return [roomId, { fanCount: sorted.length, fans, totalJoinCount }] as const;
      }),
    );

    return NextResponse.json({
      success: true,
      rooms: Object.fromEntries(entries),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}