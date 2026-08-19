// app/api/roar/rooms/[roomId]/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { ChatRoom } from "@/app/models/ChatRoom";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let room: ChatRoom | null = null;

    // 1. Try reading from DynamoDB RealTimeChat table
    try {
      const candidates = [`ROOM#${roomId}`, roomId];
      for (const cand of candidates) {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "RealTimeChat",
            Key: {
              roomId: cand,
              sk: `META#${roomId}`,
            },
          })
        );
        if (getRes.Item) {
          const item = getRes.Item;
          room = {
            ...(item as unknown as ChatRoom),
            roomId: (item.roomId as string)?.replace(/^ROOM#/, "") || roomId,
          };
          break;
        }
      }
    } catch (dynErr) {
      console.warn("DynamoDB get room notice:", dynErr);
    }

    // 2. Fallback to Firebase
    if (!room) {
      let roomRef = db.collection("roarRooms").doc(roomId);
      let snap = await roomRef.get();
      if (!snap.exists) {
        const fallbackRef = db.collection("watchAlongRooms").doc(roomId);
        const fallbackSnap = await fallbackRef.get();
        if (fallbackSnap.exists) {
          roomRef = fallbackRef;
          snap = fallbackSnap;
        }
      }

      if (snap.exists) {
        room = {
          ...(snap.data() as ChatRoom),
          roomId: snap.id,
        };

        try {
          const predictionsSnap = await roomRef
            .collection("messages")
            .where("type", "==", "predictions_live")
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();

          if (!predictionsSnap.empty) {
            const predictionsData = predictionsSnap.docs[0].data() as any;
            (room as any).matchStartAt = predictionsData.matchStartAt ?? null;
            (room as any).matchEndAt = predictionsData.matchEndAt ?? null;
          }
        } catch (predictionsErr) {
          console.warn(`Failed to fetch predictions_live for room ${roomId}:`, predictionsErr);
        }
      }
    }

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, room }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ROOM#${roomId}`,
            sk: `META#${roomId}`,
          },
        })
      );
    } catch (dynErr) {
      console.warn("DynamoDB delete room notice:", dynErr);
    }

    // 2. Delete from Firebase
    try {
      await db.collection("roarRooms").doc(roomId).delete();
    } catch (fbErr) {
      console.warn("Firebase delete room notice:", fbErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// export async function PATCH(
//   req: NextRequest,
//   { params }: { params: Promise<{ roomId: string }> },
// ) {
//   try {
//     const { roomId } = await params;
//     const user = await getUser(req);
//     if (!user) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
//     }

//     const body = await req.json();
//     const updateData: Record<string, any> = {};

//     if (body.matchId !== undefined) {
//       updateData.matchId = body.matchId;
//     }

//     await db.collection("roarRooms").doc(roomId).update(updateData);
//     return NextResponse.json({ success: true });
//   } catch (error: unknown) {
//     const msg = error instanceof Error ? error.message : "Unexpected error";
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
// }


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const updateData: Record<string, any> = {};

    if (body.matchId !== undefined) {
      updateData.matchId = body.matchId;
    }
    if (body.isActive !== undefined) {
      updateData.isActive = Boolean(body.isActive);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // 1. Update in DynamoDB
    try {
      if (body.matchId !== undefined) {
        await docClient.send(
          new UpdateCommand({
            TableName: "RealTimeChat",
            Key: {
              roomId: `ROOM#${roomId}`,
              sk: `META#${roomId}`,
            },
            UpdateExpression: "SET matchId = :m",
            ExpressionAttributeValues: { ":m": body.matchId },
          })
        );
      }
    } catch (dynErr) {
      console.warn("DynamoDB patch room notice:", dynErr);
    }

    // 2. Update in Firebase
    try {
      await db.collection("roarRooms").doc(roomId).update(updateData);
    } catch (fbErr) {
      console.warn("Firebase patch room notice:", fbErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}