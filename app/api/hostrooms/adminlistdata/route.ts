// app/api/hostrooms/adminlistdata/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("id");
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    // Case 1: Fetch single room by ID
    if (roomId) {
      let room: any = null;
      try {
        const getRes = await docClient.send(
          new GetCommand({
            TableName: "RealTimeChat",
            Key: {
              roomId: `ROOM#${roomId}`,
              sk: "ROOM#META",
            },
          })
        );
        if (getRes.Item) {
          room = { id: roomId, ...getRes.Item };
        }
      } catch (e) {
        console.warn("[hostrooms adminlistdata single GET] DynamoDB notice:", e);
      }

      if (!room) {
        const docRef = db.collection("rooms").doc(roomId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return NextResponse.json(
            { success: false, error: "Room not found" },
            { status: 404 }
          );
        }
        room = { id: doc.id, ...doc.data() };
      }

      return NextResponse.json({
        success: true,
        room,
      });
    }

    // Case 2 & 3: Fetch rooms by userId or admin query
    let rooms: any[] = [];
    try {
      let filterExpr = "sk = :skMeta";
      const exprVals: Record<string, any> = {
        ":skMeta": "ROOM#META",
      };

      if (userId) {
        filterExpr += " AND (userId = :uId OR hostUserId = :uId)";
        exprVals[":uId"] = userId;
      }
      if (status && status !== "all") {
        filterExpr += " AND #st = :st";
        exprVals[":st"] = status;
      }

      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "RealTimeChat",
          FilterExpression: filterExpr,
          ExpressionAttributeNames: status && status !== "all" ? { "#st": "status" } : undefined,
          ExpressionAttributeValues: exprVals,
          Limit: 100,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        rooms = (scanRes.Items as any[]).map((item) => ({
          id: (item.roomId as string)?.replace(/^ROOM#/, "") || item.id,
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[hostrooms adminlistdata scan GET] DynamoDB notice:", e);
    }

    // Fallback to Firestore
    if (rooms.length === 0) {
      let query: FirebaseFirestore.Query = db.collection("rooms");

      if (userId) {
        query = query.where("userId", "==", userId);
      }
      if (status && status !== "all") {
        query = query.where("status", "==", status);
      }

      query = query.orderBy("updatedAt", "desc");
      const snapshot = await query.limit(limit).get();
      rooms = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    }

    rooms.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    const paginatedRooms = rooms.slice(0, limit);

    return NextResponse.json({
      success: true,
      rooms: paginatedRooms,
      total: rooms.length,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("[hostrooms adminlistdata GET]", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}