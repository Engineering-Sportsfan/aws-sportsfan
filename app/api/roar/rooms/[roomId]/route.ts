// app/api/roar/rooms/[roomId]/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table) with Firestore dual-write
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUser } from "@/lib/getUser";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, DeleteCommand, UpdateCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { ChatRoom } from "@/app/models/ChatRoom";
import cloudinary from "@/lib/cloudinary";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let room: ChatRoom | null = null;

    // 1. Try reading from DynamoDB RealTimeChat table
    try {
      const candidates = [
        { roomId: `ROOM#${cleanRoomId}`, sk: `META#${cleanRoomId}` },
        { roomId: cleanRoomId, sk: `META#${cleanRoomId}` },
        { roomId: `ROOM#${cleanRoomId}`, sk: cleanRoomId },
        { roomId: cleanRoomId, sk: cleanRoomId },
      ];

      for (const cand of candidates) {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "RealTimeChat",
            Key: cand,
          })
        );
        if (getRes.Item) {
          const item = getRes.Item;
          room = {
            ...(item as unknown as ChatRoom),
            roomId: cleanRoomId,
            isActive: item.isActive === "true" || item.isActive === true,
            createdAt: Number(item.createdAt || item.order || Date.now()),
            fanCount: Number(item.fanCount || 0),
          };
          break;
        }
      }
    } catch (dynErr) {
      console.warn("DynamoDB get room notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (!room) {
      let roomRef = db.collection("roarRooms").doc(cleanRoomId);
      let snap = await roomRef.get();
      if (!snap.exists) {
        const fallbackRef = db.collection("watchAlongRooms").doc(cleanRoomId);
        const fallbackSnap = await fallbackRef.get();
        if (fallbackSnap.exists) {
          roomRef = fallbackRef;
          snap = fallbackSnap;
        }
      }

      if (snap.exists) {
        const data = snap.data() || {};
        room = {
          ...(data as ChatRoom),
          roomId: cleanRoomId,
          isActive: data.isActive !== false && data.isActive !== "false",
          createdAt: Number(data.createdAt || Date.now()),
          fanCount: Number(data.fanCount || 0),
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
          console.warn(`Failed to fetch predictions_live for room ${cleanRoomId}:`, predictionsErr);
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
    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch existing item so unedited fields survive
    let existing: any = null;
    try {
      const candidates = [
        { roomId: `ROOM#${cleanRoomId}`, sk: `META#${cleanRoomId}` },
        { roomId: cleanRoomId, sk: `META#${cleanRoomId}` },
        { roomId: `ROOM#${cleanRoomId}`, sk: cleanRoomId },
        { roomId: cleanRoomId, sk: cleanRoomId },
      ];

      for (const cand of candidates) {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "RealTimeChat",
            Key: cand,
          })
        );
        if (getRes.Item) {
          existing = getRes.Item;
          break;
        }
      }
    } catch (e) {
      console.warn("PUT room: dynamo get notice", e);
    }

    if (!existing) {
      try {
        const snap = await db.collection("roarRooms").doc(cleanRoomId).get();
        if (snap.exists) {
          existing = snap.data();
        }
      } catch (fbErr) {
        console.warn("PUT room: firestore get notice", fbErr);
      }
    }

    if (!existing) {
      existing = {
        roomId: `ROOM#${cleanRoomId}`,
        sk: `META#${cleanRoomId}`,
        createdAt: Date.now(),
        isActive: "true",
      };
    }

    const updates: Record<string, unknown> = {};
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const strFields = ["name", "icon", "sport", "description", "score", "scoreSubtitle", "matchId"];
      for (const field of strFields) {
        const val = formData.get(field);
        if (val !== null) updates[field] = (val as string).trim?.() ?? val;
      }

      const isActiveVal = formData.get("isActive");
      if (isActiveVal !== null) {
        updates.isActive = isActiveVal !== "false" && isActiveVal !== "0";
      }

      const isTestingRoomVal = formData.get("isTestingRoom");
      if (isTestingRoomVal !== null) {
        updates.isTestingRoom = isTestingRoomVal === "true";
      }

      const scheduledStartTime = formData.get("scheduledStartTime");
      if (scheduledStartTime !== null && scheduledStartTime !== "") {
        updates.scheduledStartTime = Number(scheduledStartTime);
      }

      const botConfigRaw = formData.get("botConfig") as string | null;
      if (botConfigRaw !== null) {
        try {
          updates.botConfig = JSON.parse(botConfigRaw);
        } catch {}
      }

      const imageFile = formData.get("image") as File | null;
      if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
        const bytes = await imageFile.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const base64 = `data:${imageFile.type};base64,${buffer.toString("base64")}`;
        const uploaded = await cloudinary.uploader.upload(base64, {
          folder: "roar/rooms",
          public_id: `${Date.now()}-${imageFile.name.replace(/\s/g, "_")}`,
        });
        updates.image = uploaded.secure_url;
      }
    } else {
      const body = await req.json();
      const strFields = ["name", "icon", "sport", "description", "score", "scoreSubtitle", "matchId", "image"];
      for (const field of strFields) {
        if (body[field] !== undefined) {
          updates[field] = typeof body[field] === "string" ? body[field].trim() : body[field];
        }
      }
      if (body.isActive !== undefined) {
        updates.isActive = body.isActive !== false && body.isActive !== "false";
      }
      if (body.isTestingRoom !== undefined) {
        updates.isTestingRoom = Boolean(body.isTestingRoom);
      }
      if (body.scheduledStartTime !== undefined && body.scheduledStartTime !== null) {
        updates.scheduledStartTime = Number(body.scheduledStartTime);
      }
      if (body.botConfig !== undefined) {
        updates.botConfig = body.botConfig;
      }
    }

    const currentActive = updates.isActive !== undefined
      ? Boolean(updates.isActive)
      : (existing?.isActive === "true" || existing?.isActive === true || existing?.isActive === undefined);

    const now = Date.now();
    const finalItem = {
      ...existing,
      ...updates,
      roomId: `ROOM#${cleanRoomId}`,
      sk: `META#${cleanRoomId}`,
      isActive: currentActive ? "true" : "false",
      order: Number(existing.order || existing.createdAt || now),
      createdAt: Number(existing.createdAt || now),
      updatedAt: now,
    };

    // 1. Write to DynamoDB
    await docClient.send(new PutCommand({ TableName: "RealTimeChat", Item: finalItem }));

    // 2. Dual-write to Firestore
    try {
      await db.collection("roarRooms").doc(cleanRoomId).set(
        {
          ...finalItem,
          roomId: cleanRoomId,
          isActive: currentActive,
        },
        { merge: true }
      );
    } catch (fbErr) {
      console.warn("PUT room: firestore notice", fbErr);
    }

    return NextResponse.json({
      success: true,
      room: {
        ...finalItem,
        roomId: cleanRoomId,
        isActive: currentActive,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PUT /api/roar/rooms/[roomId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const cleanRoomId = roomId.replace(/^ROOM#/, "");
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
    if (body.name !== undefined) {
      updateData.name = body.name;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // 1. Update in DynamoDB
    try {
      const setParts: string[] = ["#upd = :u"];
      const exprNames: Record<string, string> = { "#upd": "updatedAt" };
      const exprValues: Record<string, unknown> = { ":u": Date.now() };

      if (body.matchId !== undefined) {
        setParts.push("#mid = :m");
        exprNames["#mid"] = "matchId";
        exprValues[":m"] = body.matchId;
      }
      if (body.name !== undefined) {
        setParts.push("#n = :n");
        exprNames["#n"] = "name";
        exprValues[":n"] = body.name;
      }
      if (body.isActive !== undefined) {
        setParts.push("#act = :a");
        exprNames["#act"] = "isActive";
        exprValues[":a"] = Boolean(body.isActive) ? "true" : "false"; // String for GSI
      }

      await docClient.send(
        new UpdateCommand({
          TableName: "RealTimeChat",
          Key: {
            roomId: `ROOM#${cleanRoomId}`,
            sk: `META#${cleanRoomId}`,
          },
          UpdateExpression: `SET ${setParts.join(", ")}`,
          ExpressionAttributeNames: exprNames,
          ExpressionAttributeValues: exprValues,
        })
      );
    } catch (dynErr) {
      console.warn("DynamoDB patch room notice:", dynErr);
    }

    // 2. Update in Firebase
    try {
      await db.collection("roarRooms").doc(cleanRoomId).set(
        {
          ...updateData,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch (fbErr) {
      console.warn("Firebase patch room notice:", fbErr);
    }

    return NextResponse.json({ success: true, roomId: cleanRoomId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("PATCH /api/roar/rooms/[roomId] error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const cleanRoomId = roomId.replace(/^ROOM#/, "");
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Delete from DynamoDB
    const candidates = [
      { roomId: `ROOM#${cleanRoomId}`, sk: `META#${cleanRoomId}` },
      { roomId: cleanRoomId, sk: `META#${cleanRoomId}` },
      { roomId: `ROOM#${cleanRoomId}`, sk: cleanRoomId },
    ];

    for (const cand of candidates) {
      try {
        await docClient.send(
          new DeleteCommand({
            TableName: "RealTimeChat",
            Key: cand,
          })
        );
      } catch (dynErr) {
        console.warn("DynamoDB delete room notice:", dynErr);
      }
    }

    // 2. Delete from Firebase
    try {
      await db.collection("roarRooms").doc(cleanRoomId).delete();
    } catch (fbErr) {
      console.warn("Firebase delete room notice:", fbErr);
    }

    return NextResponse.json({ success: true, roomId: cleanRoomId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}