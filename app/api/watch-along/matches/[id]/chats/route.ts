// app/api/watch-along/matches/[id]/chats/route.ts — Migrated to AWS DynamoDB (RealTimeChat Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { getUserSessionAndRole, isAuthorizedForMatch } from "@/lib/auth";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/* ─────────────────────────────────────────────
   GET  /api/watch-along/matches/[id]/chats
   Returns paginated chat messages for a match
   Query: ?limit=50&since=123456
───────────────────────────────────────────── */
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 50);
    const since = searchParams.get("since");

    let chats: any[] = [];

    // 1. Try querying DynamoDB RealTimeChat
    try {
      let keyCond = "roomId = :rId AND begins_with(sk, :msgPrefix)";
      const exprVals: Record<string, any> = {
        ":rId": `ROOM#watchalong_${id}`,
        ":msgPrefix": "MSG#",
      };

      if (since) {
        const sinceTs = parseInt(since);
        if (!isNaN(sinceTs)) {
          keyCond = "roomId = :rId AND sk > :sinceSk";
          exprVals[":sinceSk"] = `MSG#${sinceTs}`;
        }
      }

      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: keyCond,
          ExpressionAttributeValues: exprVals,
          ScanIndexForward: false, // latest first
          Limit: limit,
        })
      );

      if (qRes.Items && qRes.Items.length > 0) {
        chats = (qRes.Items as any[]).map((item) => ({
          id: item.chatId || item.id || (item.sk as string)?.split("#")[2],
          user: item.user,
          text: item.text,
          color: item.color,
          createdAt: Number(item.createdAt || 0),
        })).reverse();
      }
    } catch (dynErr) {
      console.warn("[match chat GET] DynamoDB notice:", dynErr);
    }

    // 2. Fallback to Firestore
    if (chats.length === 0) {
      let query: FirebaseFirestore.Query = db.collection("watchAlongMatches").doc(id)
        .collection("chats")
        .orderBy("createdAt", "desc");

      if (since) {
        const sinceTimestamp = parseInt(since);
        if (!isNaN(sinceTimestamp)) {
          query = query.where("createdAt", ">", sinceTimestamp);
        }
      }

      const snapshot = await query.limit(limit).get();
      chats = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .reverse();
    }

    return NextResponse.json({ success: true, chats });
  } catch (error) {
    console.error("[match chat GET]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   POST  /api/watch-along/matches/[id]/chats
   Send a new chat message
───────────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { user, text, color } = body;

    if (!user?.trim() || !text?.trim()) {
      return NextResponse.json(
        { success: false, message: "user and text are required" },
        { status: 400 }
      );
    }

    const chatId = uuidv4();
    const now = Date.now();
    const chatData = {
      id: chatId,
      chatId,
      user: user.trim(),
      text: text.trim(),
      color: color || "text-pink-400",
      createdAt: now,
    };

    // Primary DynamoDB write + Firestore subcollection dual-write
    await dualWrite({
      tableName: "RealTimeChat",
      dynamoItem: {
        roomId: `ROOM#watchalong_${id}`,
        sk: `MSG#${now}#${chatId}`,
        ...chatData,
      },
      firestoreRef: db.collection("watchAlongMatches").doc(id).collection("chats").doc(chatId),
      firestoreData: chatData,
    });

    return NextResponse.json({ success: true, chat: chatData });
  } catch (error) {
    console.error("[match chat POST]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/* ─────────────────────────────────────────────
   DELETE  /api/watch-along/matches/[id]/chats
   Admin: delete a specific chat message
───────────────────────────────────────────── */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const user = await getUserSessionAndRole(req);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized - Authentication required" },
        { status: 401 }
      );
    }

    const isAuth = await isAuthorizedForMatch(user, id);
    if (!isAuth) {
      return NextResponse.json(
        { success: false, message: "Forbidden - Insufficient permissions" },
        { status: 403 }
      );
    }

    const { chatId } = await req.json();
    if (!chatId) {
      return NextResponse.json({ success: false, message: "chatId required" }, { status: 400 });
    }

    // 1. Delete from DynamoDB
    try {
      // Find SK matching chatId
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "RealTimeChat",
          KeyConditionExpression: "roomId = :rId",
          ExpressionAttributeValues: {
            ":rId": `ROOM#watchalong_${id}`,
          },
        })
      );
      if (qRes.Items) {
        const itemToDelete = (qRes.Items as any[]).find((it) => it.chatId === chatId || (it.sk as string)?.includes(chatId));
        if (itemToDelete) {
          await docClient.send(
            new DeleteCommand({
              TableName: "RealTimeChat",
              Key: {
                roomId: itemToDelete.roomId,
                sk: itemToDelete.sk,
              },
            })
          );
        }
      }
    } catch (e) {
      console.warn("[match chat DELETE] DynamoDB notice:", e);
    }

    // 2. Delete from Firestore
    try {
      await db.collection("watchAlongMatches").doc(id).collection("chats").doc(chatId).delete();
    } catch (e) {
      console.warn("[match chat DELETE] Firestore notice:", e);
    }

    return NextResponse.json({ success: true, message: "Chat deleted" });
  } catch (error) {
    console.error("[match chat DELETE]", error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}