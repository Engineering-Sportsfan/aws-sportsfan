// api/roar/rooms/[roomId]/presence/route.ts

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { getUserInfo } from "@/lib/userPoints";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  PRESENCE_TTL_MS,
  buildPresencePayload,
  type FanRecord,
} from "./presence.contract";

export const dynamic = "force-dynamic";

async function resolveUser(
  email: string,
  userId: string
): Promise<{ id: string; snap: FirebaseFirestore.DocumentSnapshot } | null> {
  const info = await getUserInfo(userId, undefined, email);
  if (!info.exists) return null;

  const snap = await db.collection("users").doc(info.actualUserId).get();
  if (!snap.exists) return null;

  return { id: info.actualUserId, snap };
}

async function getRoomRef(roomId: string) {
  let roomRef = db.collection("roarRooms").doc(roomId);
  let snap = await roomRef.get();
  if (!snap.exists) {
    const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
    const fallbackSnap = await fallbackRef.get();
    if (fallbackSnap.exists) {
      roomRef = fallbackRef;
    }
  }
  return roomRef;
}

// Fetches active fan records from DynamoDB first, falling back to Firestore
async function fetchActiveFanRecords(
  roomRef: FirebaseFirestore.DocumentReference,
  roomId: string,
  now: number,
): Promise<FanRecord[]> {
  const cutoff = now - PRESENCE_TTL_MS;
  let activeRecords: FanRecord[] = [];
  let fetchedFromDynamo = false;

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
      activeRecords = res.Items.map((item) => ({
        uid: item.uid,
        username: item.username,
        avatarUrl: item.avatarUrl ?? null,
        badge: item.badge ?? null,
        lastSeenAt: item.lastSeenAt
      }));
      fetchedFromDynamo = true;
    }
  } catch (dynErr) {
    console.warn("[Presence GET/POST] DynamoDB active presence fetch failed:", dynErr);
  }

  // Fallback to Firestore
  if (!fetchedFromDynamo) {
    try {
      const snap = await roomRef
        .collection("presence")
        .where("lastSeenAt", ">=", cutoff)
        .get();

      activeRecords = snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: data.uid,
          username: data.username,
          avatarUrl: data.avatarUrl ?? null,
          badge: data.badge ?? null,
          lastSeenAt: data.lastSeenAt,
        };
      });
    } catch (fsErr) {
      console.error("[Presence GET/POST] Firestore active presence fallback failed:", fsErr);
    }
  }

  return activeRecords;
}

// POST — join / heartbeat
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }
    const { id: resolvedUserId, snap: userSnap } = resolved;
    const userData = userSnap.data() as { username: string; badge?: string; avatarUrl?: string };

    const roomRef = await getRoomRef(roomId);
    const pinRef = roomRef.collection("userPins").doc(resolvedUserId);

    const now = Date.now();

    // 1. Write presence and check first join in DynamoDB first
    let isFirstJoin = true;
    try {
      const getJoined = await docClient.send(new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `JOINED#${resolvedUserId}` }
      }));
      if (getJoined.Item) {
        isFirstJoin = false;
      }
    } catch (dynErr) {
      console.warn("[Presence POST] DynamoDB joined check failed:", dynErr);
    }

    try {
      // A. Write presence doc
      await docClient.send(new PutCommand({
        TableName: "RealTimeChat",
        Item: {
          roomId: `ROOM#${roomId}`,
          sk: `PRESENCE#${resolvedUserId}`,
          uid: resolvedUserId,
          username: userData.username,
          avatarUrl: userData.avatarUrl ?? null,
          badge: userData.badge ?? null,
          joinedAt: now,
          lastSeenAt: now
        }
      }));

      // B. If first join, write joined record and increment totalJoinCount
      if (isFirstJoin) {
        await docClient.send(new PutCommand({
          TableName: "RealTimeChat",
          Item: {
            roomId: `ROOM#${roomId}`,
            sk: `JOINED#${resolvedUserId}`,
            uid: resolvedUserId,
            firstJoinedAt: now
          }
        }));

        const candidates = [`ROOM#${roomId}`, roomId];
        for (const cand of candidates) {
          try {
            await docClient.send(new UpdateCommand({
              TableName: "RealTimeChat",
              Key: { roomId: cand, sk: `META#${roomId}` },
              UpdateExpression: "ADD totalJoinCount :one",
              ExpressionAttributeValues: { ":one": 1 }
            }));
          } catch (e) {}
        }
      }
    } catch (dynErr) {
      console.warn("[Presence POST] DynamoDB write failed:", dynErr);
    }

    // 2. Sync to Firestore
    const presenceRef = roomRef.collection("presence").doc(resolvedUserId);
    const joinedRef = roomRef.collection("joinedUsers").doc(resolvedUserId);

    try {
      await presenceRef.set(
        {
          uid: resolvedUserId,
          username: userData.username,
          avatarUrl: userData.avatarUrl ?? null,
          badge: userData.badge ?? null,
          joinedAt: now,
          lastSeenAt: now,
        },
        { merge: true },
      );

      const joinedSnap = await joinedRef.get();
      if (!joinedSnap.exists) {
        await db.runTransaction(async (tx) => {
          const roomSnap = await tx.get(roomRef);
          const prev = roomSnap.exists ? (roomSnap.data()?.totalJoinCount ?? 0) : 0;

          tx.set(joinedRef, {
            uid: resolvedUserId,
            firstJoinedAt: now,
          });

          if (roomSnap.exists) {
            tx.set(roomRef, { totalJoinCount: prev + 1 }, { merge: true });
          }
        });
      }
    } catch (fsErr) {
      console.warn("[Presence POST] Firestore sync failed:", fsErr);
    }

    // 3. Fetch active records and pin
    let pinData: any = null;
    let fetchedPinFromDynamo = false;
    try {
      const getPin = await docClient.send(new GetCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `PIN#${resolvedUserId}` }
      }));
      if (getPin.Item) {
        pinData = getPin.Item;
        fetchedPinFromDynamo = true;
      }
    } catch (e) {}

    if (!fetchedPinFromDynamo) {
      try {
        const pinSnap = await pinRef.get();
        if (pinSnap.exists) {
          pinData = pinSnap.data();
        }
      } catch (e) {}
    }

    let totalJoinCount = 0;
    let fetchedCountFromDynamo = false;
    try {
      const candidates = [`ROOM#${roomId}`, roomId];
      for (const cand of candidates) {
        const getMeta = await docClient.send(new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: cand, sk: `META#${roomId}` }
        }));
        if (getMeta.Item) {
          totalJoinCount = getMeta.Item.totalJoinCount ?? 0;
          fetchedCountFromDynamo = true;
          break;
        }
      }
    } catch (e) {}

    if (!fetchedCountFromDynamo) {
      try {
        const roomSnap = await roomRef.get();
        totalJoinCount = roomSnap.data()?.totalJoinCount ?? 0;
      } catch (e) {}
    }

    const activeRecords = await fetchActiveFanRecords(roomRef, roomId, now);
    const payload = buildPresencePayload(activeRecords, {
      totalJoinCount,
      pinnedPost: pinData,
    });

    return NextResponse.json({ success: true, ...payload });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE — explicit leave
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const resolved = await resolveUser(user.email, user.userId);
    if (!resolved) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 1. Delete from DynamoDB first
    try {
      await docClient.send(new DeleteCommand({
        TableName: "RealTimeChat",
        Key: { roomId: `ROOM#${roomId}`, sk: `PRESENCE#${resolved.id}` }
      }));
    } catch (dynErr) {
      console.warn("[Presence DELETE] DynamoDB delete failed:", dynErr);
    }

    // 2. Sync to Firestore
    try {
      const roomRef = await getRoomRef(roomId);
      await roomRef
        .collection("presence")
        .doc(resolved.id)
        .delete();
    } catch (fsErr) {
      console.warn("[Presence DELETE] Firestore delete failed:", fsErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET — list active fans & pinned post
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> | { roomId: string } }
) {
  try {
    const resolvedParams = await params;
    const { roomId } = resolvedParams;
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = Date.now();
    const resolved = await resolveUser(user.email, user.userId);
    const roomRef = await getRoomRef(roomId);

    // 1. Get pin doc from DynamoDB first
    let pinData: any = null;
    let fetchedPinFromDynamo = false;
    if (resolved) {
      try {
        const getPin = await docClient.send(new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `PIN#${resolved.id}` }
        }));
        if (getPin.Item) {
          pinData = getPin.Item;
          fetchedPinFromDynamo = true;
        }
      } catch (e) {}
    }

    if (resolved && !fetchedPinFromDynamo) {
      try {
        const pinSnap = await roomRef.collection("userPins").doc(resolved.id).get();
        if (pinSnap.exists) {
          pinData = pinSnap.data();
        }
      } catch (e) {}
    }

    // 2. Get totalJoinCount from DynamoDB first
    let totalJoinCount = 0;
    let fetchedCountFromDynamo = false;
    try {
      const candidates = [`ROOM#${roomId}`, roomId];
      for (const cand of candidates) {
        const getMeta = await docClient.send(new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: cand, sk: `META#${roomId}` }
        }));
        if (getMeta.Item) {
          totalJoinCount = getMeta.Item.totalJoinCount ?? 0;
          fetchedCountFromDynamo = true;
          break;
        }
      }
    } catch (e) {}

    if (!fetchedCountFromDynamo) {
      try {
        const roomSnap = await roomRef.get();
        totalJoinCount = roomSnap.data()?.totalJoinCount ?? 0;
      } catch (e) {}
    }

    const activeRecords = await fetchActiveFanRecords(roomRef, roomId, now);
    const payload = buildPresencePayload(activeRecords, {
      totalJoinCount,
      pinnedPost: pinData,
    });

    return NextResponse.json({ success: true, ...payload });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}