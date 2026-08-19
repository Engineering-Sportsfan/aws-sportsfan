// app/api/polls/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { Timestamp } from "firebase-admin/firestore";
import { QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unknown error occurred";
}

function getIdFromUrl(req: NextRequest): string {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  return parts[parts.length - 1];
}

// GET - Fetch single poll by ID
export async function GET(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Poll ID is required" }, { status: 400 });
    }

    let poll: any = null;

    // 1. Try DynamoDB
    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `POLL#${id}`,
          },
          Limit: 1,
        })
      );
      if (qRes.Items && qRes.Items.length > 0) {
        poll = { id, ...qRes.Items[0] };
      }
    } catch (e) {
      console.warn("[polls [id] GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (!poll && db) {
      const snap = await db.collection("polls").doc(id).get();
      if (snap.exists) {
        const data = snap.data()!;
        poll = {
          id: snap.id,
          ...data,
          endsAt: data.endsAt instanceof Timestamp ? data.endsAt.toDate().toISOString() : data.endsAt,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
        };
      }
    }

    if (!poll) {
      return NextResponse.json({ success: false, error: "Poll not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: poll,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 500 });
  }
}

// PUT /api/polls/:id
export async function PUT(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);
    const body = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Poll ID is required" }, { status: 400 });
    }

    let existing: any = null;
    let existingSk = `POLL#${Date.now()}`;

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `POLL#${id}`,
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
      const ref = db.collection("polls").doc(id);
      const snap = await ref.get();
      if (snap.exists) {
        existing = snap.data();
      }
    }

    if (!existing) {
      return NextResponse.json({ success: false, error: "Poll not found" }, { status: 404 });
    }

    const updates: Record<string, any> = {};

    if (body.title !== undefined) updates.title = String(body.title).trim();
    if (body.active !== undefined) updates.active = Boolean(body.active);
    if (body.endsAt !== undefined) updates.endsAt = new Date(String(body.endsAt)).toISOString();
    if (body.type !== undefined) updates.type = String(body.type);

    if (body.options !== undefined && Array.isArray(body.options)) {
      const existingOptions: { label: string; votes?: number }[] = existing.options || [];
      const newOptions = body.options.map((opt: { label: string; isCorrect?: boolean }, index: number) => {
        const existingOpt = existingOptions.find((e) => e.label === opt.label);
        return {
          id: `opt_${index + 1}`,
          label: String(opt.label),
          isCorrect: Boolean(opt.isCorrect),
          votes: existingOpt?.votes || 0,
        };
      });
      updates.options = newOptions;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "No valid fields to update" }, { status: 400 });
    }

    const updatedItem = {
      ...existing,
      ...updates,
      id,
    };

    // Dual-write
    await dualWrite({
      tableName: "SocialAndContent",
      dynamoItem: {
        contentId: `POLL#${id}`,
        sk: existingSk,
        ...updatedItem,
      },
      firestoreRef: db.collection("polls").doc(id),
      firestoreData: {
        ...updates,
        ...(updates.endsAt ? { endsAt: Timestamp.fromDate(new Date(updates.endsAt)) } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedItem,
    });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 500 });
  }
}

// DELETE /api/polls/:id
export async function DELETE(req: NextRequest) {
  try {
    const id = getIdFromUrl(req);

    if (!id) {
      return NextResponse.json({ error: "Poll ID is required" }, { status: 400 });
    }

    try {
      const qRes = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :cid",
          ExpressionAttributeValues: {
            ":cid": `POLL#${id}`,
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
      console.warn("[polls [id] DELETE] DynamoDB notice:", e);
    }

    if (db) {
      const ref = db.collection("polls").doc(id);
      const snap = await ref.get();
      if (snap.exists) {
        await ref.delete();
      }
    }

    return NextResponse.json({ success: true, message: "Poll deleted successfully" });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: getErrorMessage(err) }, { status: 500 });
  }
}