// app/api/players360/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET single post
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let post: any = null;

    // 1. Try DynamoDB
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `PLAYER_POST#${id}`,
          },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        post = { id, ...qRes.Items[0] };
      }
    } catch (e) {
      console.warn("[players360 [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!post && db) {
      const doc = await db.collection("players360Posts").doc(id).get();
      if (doc.exists) {
        post = { id: doc.id, ...doc.data() };
      }
    }

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json({ post });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT update post
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    let existing: any = null;
    let existingSk = `POST#${Date.now()}`;

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `PLAYER_POST#${id}`,
          },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        existing = qRes.Items[0];
        existingSk = existing.sk || existingSk;
      }
    } catch {}

    if (!existing && db) {
      const docRef = db.collection("players360Posts").doc(id);
      const doc = await docRef.get();
      if (doc.exists) existing = doc.data();
    }

    if (!existing) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const allowedFields = [
      "playerName", "title", "category", "image",
      "logo", "catlogo", "hasVideo",
    ];
    const numericFields = ["likes", "comments", "live", "shares"];

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    allowedFields.forEach(field => {
      if (body[field] !== undefined) updates[field] = body[field];
    });

    numericFields.forEach(field => {
      if (body[field] !== undefined) updates[field] = Number(body[field]) || 0;
    });

    if (body.category !== undefined) updates.category = body.category ?? [];
    if (body.catlogo !== undefined) updates.catlogo = body.catlogo ?? [];

    const updatedItem = {
      ...existing,
      ...updates,
      id,
    };

    // Dual-write
    await dualWrite({
      tableName: "SocialAndContent",
      dynamoItem: {
        contentId: `PLAYER_POST#${id}`,
        sk: existingSk,
        ...updatedItem,
      },
      firestoreRef: db.collection("players360Posts").doc(id),
      firestoreData: updates,
    });

    return NextResponse.json({
      success: true,
      post: updatedItem,
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE post
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `PLAYER_POST#${id}`,
          },
        })
      );
      if (qRes.Items) {
        for (const item of qRes.Items) {
          await docClient.send(
            new DeleteCommand({
              TableName: "SocialAndContent",
              Key: {
                contentId: item.contentId,
                sk: item.sk,
              },
            })
          );
        }
      }
    } catch (e) {
      console.warn("[players360 [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const docRef = db.collection("players360Posts").doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.delete();
      }
    }

    return NextResponse.json({ success: true, message: "Deleted" });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}