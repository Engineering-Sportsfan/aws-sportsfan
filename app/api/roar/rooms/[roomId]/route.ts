// app/api/roar/rooms/[roomId]/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { ChatRoom } from "@/app/models/ChatRoom";
import cloudinary from "@/lib/cloudinary";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
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


export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch existing item so unedited fields survive
    let existing: any = null;
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: "RealTimeChat",
          Key: { roomId: `ROOM#${roomId}`, sk: `META#${roomId}` },
        })
      );
      existing = getRes.Item;
    } catch (e) {
      console.warn("PUT room: dynamo get notice", e);
    }
    if (!existing) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const updates: Record<string, unknown> = {};

    const strFields = ["name", "icon", "sport", "description", "score", "scoreSubtitle", "matchId"];
    for (const field of strFields) {
      const val = formData.get(field);
      if (val !== null) updates[field] = (val as string).trim?.() ?? val;
    }

    const isActive = formData.get("isActive");
    if (isActive !== null) updates.isActive = isActive !== "false";

    const isTestingRoom = formData.get("isTestingRoom");
    if (isTestingRoom !== null) updates.isTestingRoom = isTestingRoom === "true";

    const scheduledStartTime = formData.get("scheduledStartTime");
    if (scheduledStartTime !== null) updates.scheduledStartTime = Number(scheduledStartTime);

    const botConfigRaw = formData.get("botConfig") as string | null;
    if (botConfigRaw !== null) updates.botConfig = JSON.parse(botConfigRaw);

    const imageFile = formData.get("image") as File | null;
    if (imageFile && imageFile.size > 0) {
      const bytes = await imageFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${imageFile.type};base64,${buffer.toString("base64")}`;
      const uploaded = await cloudinary.uploader.upload(base64, {
        folder: "roar/rooms",
        public_id: `${Date.now()}-${imageFile.name.replace(/\s/g, "_")}`,
      });
      updates.image = uploaded.secure_url;
    }

    const finalItem = {
      ...existing,
      ...updates,
      roomId: `ROOM#${roomId}`,
      sk: `META#${roomId}`,
      isActive: (updates.isActive ?? existing.isActive === "true") ? "true" : "false",
    };

    await docClient.send(new PutCommand({ TableName: "RealTimeChat", Item: finalItem }));

    // Best-effort Firestore mirror, matching your other routes' pattern
    try {
      await db.collection("roarRooms").doc(roomId).set(
        { ...updates, isActive: updates.isActive ?? existing.isActive === "true" },
        { merge: true }
      );
    } catch (fbErr) {
      console.warn("PUT room: firestore notice", fbErr);
    }

    return NextResponse.json({
      success: true,
      room: { ...finalItem, roomId: roomId, isActive: finalItem.isActive === "true" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/roar/rooms/[roomId] error:", error);
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
      const setParts: string[] = [];
      const exprValues: Record<string, unknown> = {};

      if (body.matchId !== undefined) {
        setParts.push("matchId = :m");
        exprValues[":m"] = body.matchId;
      }
      if (body.isActive !== undefined) {
        setParts.push("isActive = :a");
        exprValues[":a"] = Boolean(body.isActive) ? "true" : "false"; // string, matches GSI key type
      }

      if (setParts.length > 0) {
        await docClient.send(
          new UpdateCommand({
            TableName: "RealTimeChat",
            Key: {
              roomId: `ROOM#${roomId}`,
              sk: `META#${roomId}`,
            },
            UpdateExpression: `SET ${setParts.join(", ")}`,
            ExpressionAttributeValues: exprValues,
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