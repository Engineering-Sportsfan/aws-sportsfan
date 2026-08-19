// app/api/player-profile/home/[id]/route.ts — Migrated to AWS DynamoDB (SportsData Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  return pathParts[pathParts.length - 1] || null;
}

export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let post: any = null;

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :hPrefix) AND (entityId = :fullId OR id = :pureId)",
          ExpressionAttributeValues: {
            ":hPrefix": "PLAYER_HOME#",
            ":fullId": `PLAYER_HOME#${id}`,
            ":pureId": id,
          },
          Limit: 1,
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        post = {
          id: scanRes.Items[0].id || (scanRes.Items[0].entityId as string).replace(/^PLAYER_HOME#/, ""),
          ...scanRes.Items[0],
        };
      }
    } catch (e) {
      console.warn("[player-profile home [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!post && db) {
      const doc = await db.collection("playershome").doc(id).get();
      if (doc.exists) {
        post = { id: doc.id, ...doc.data() };
      }
    }

    if (!post) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      post,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Post id is required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    let existing: any = null;
    let existingSk = `HOME#${Date.now()}`;

    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :hPrefix) AND (entityId = :fullId OR id = :pureId)",
          ExpressionAttributeValues: {
            ":hPrefix": "PLAYER_HOME#",
            ":fullId": `PLAYER_HOME#${id}`,
            ":pureId": id,
          },
          Limit: 1,
        })
      );
      if (scanRes.Items && scanRes.Items.length > 0) {
        existing = scanRes.Items[0];
        existingSk = existing.sk || existingSk;
      }
    } catch {}

    if (!existing && db) {
      const doc = await db.collection("playershome").doc(id).get();
      if (doc.exists) existing = doc.data();
    }

    if (!existing) {
      return NextResponse.json(
        { success: false, message: "Post not found" },
        { status: 404 }
      );
    }

    const updatedDoc = {
      ...existing,
      ...body,
      updatedAt: Date.now(),
      id,
    };

    // Dual-write
    await dualWrite({
      tableName: "SportsData",
      dynamoItem: {
        entityId: `PLAYER_HOME#${id}`,
        sk: existingSk,
        ...updatedDoc,
      },
      firestoreRef: db.collection("playershome").doc(id),
      firestoreData: {
        ...body,
        updatedAt: Date.now(),
      },
    });

    return NextResponse.json({
      success: true,
      post: updatedDoc,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Post id is required" },
        { status: 400 }
      );
    }

    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "SportsData",
          FilterExpression: "begins_with(entityId, :hPrefix) AND (entityId = :fullId OR id = :pureId)",
          ExpressionAttributeValues: {
            ":hPrefix": "PLAYER_HOME#",
            ":fullId": `PLAYER_HOME#${id}`,
            ":pureId": id,
          },
        })
      );
      if (scanRes.Items) {
        for (const item of scanRes.Items) {
          await docClient.send(
            new DeleteCommand({
              TableName: "SportsData",
              Key: {
                entityId: item.entityId,
                sk: item.sk,
              },
            })
          );
        }
      }
    } catch (e) {
      console.warn("[player-profile home [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const docRef = db.collection("playershome").doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.delete();
      }
    }

    return NextResponse.json({
      success: true,
      message: "Post deleted successfully",
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json(
      { success: false, message: msg },
      { status: 500 }
    );
  }
}