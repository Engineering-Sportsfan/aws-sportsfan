// app/api/createpost/[id]/route.ts — Migrated to AWS DynamoDB (SocialAndContent Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { QueryCommand, DeleteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { UpdatePostPayload } from "@/types/createposts";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

function getIdFromUrl(req: NextRequest): string | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  return pathParts[pathParts.length - 1] || null;
}

async function fetchPostById(id: string): Promise<Record<string, unknown> | null> {
  const candidates = [
    `POST#${id}`,
    `POST_ROAR#${id}`,
    id,
  ];

  for (const contentId of candidates) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: "SocialAndContent",
          KeyConditionExpression: "contentId = :c",
          ExpressionAttributeValues: { ":c": contentId },
          Limit: 1,
        })
      );
      if (res.Items && res.Items.length > 0) {
        return res.Items[0] as Record<string, unknown>;
      }
    } catch (err) {
      console.warn(`DynamoDB fetch post candidate ${contentId} notice:`, err);
    }
  }

  // Fallback to Firebase
  try {
    const doc = await db.collection("socialPosts").doc(id).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() } as Record<string, unknown>;
    }
  } catch (err) {
    console.warn("Firebase fetch post fallback notice:", err);
  }

  return null;
}

// ─── GET /api/createpost/[id] ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  try {
    const post = await fetchPostById(id);
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: true, data: { id, ...post } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PATCH /api/createpost/[id] ──────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  try {
    const existing = await fetchPostById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    const body: UpdatePostPayload = await req.json();
    const now = Date.now();

    // ── Handle Reactions / Likes ─────────────────────────────────────────────
    if ("likeAction" in body && body.likeAction && "userId" in body && body.userId) {
      const { likeAction, userId, reaction } = body as {
        likeAction: "like" | "unlike";
        userId: string;
        reaction?: string;
      };

      const likedBy = Array.isArray(existing.likedBy) ? [...(existing.likedBy as string[])] : [];
      let likes = typeof existing.likes === "number" ? existing.likes : (existing.likeCount as number) || 0;
      const reactions = (existing.reactions as Record<string, string>) || {};

      if (likeAction === "like") {
        if (!likedBy.includes(userId)) likedBy.push(userId);
        likes += 1;
        if (reaction) reactions[userId] = reaction;
      } else {
        const idx = likedBy.indexOf(userId);
        if (idx !== -1) likedBy.splice(idx, 1);
        likes = Math.max(0, likes - 1);
        delete reactions[userId];
      }

      // Update DynamoDB
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: "SocialAndContent",
            Key: {
              contentId: (existing.contentId as string) || `POST#${id}`,
              sk: (existing.sk as string) || `POST#${existing.createdAt || now}`,
            },
            UpdateExpression: "SET likes = :l, likeCount = :l, likedBy = :lb, reactions = :r, updatedAt = :u",
            ExpressionAttributeValues: {
              ":l": likes,
              ":lb": likedBy,
              ":r": reactions,
              ":u": now,
            },
          })
        );
      } catch (err) {
        console.warn("DynamoDB update post reaction notice:", err);
      }

      // Sync to Firebase
      try {
        await db.collection("socialPosts").doc(id).update({
          likes: FieldValue.increment(likeAction === "like" ? 1 : -1),
          likedBy: likeAction === "like"
            ? FieldValue.arrayUnion(userId)
            : FieldValue.arrayRemove(userId),
          [`reactions.${userId}`]: likeAction === "like" && reaction
            ? reaction
            : FieldValue.delete(),
          updatedAt: now,
        });
      } catch (fbErr) {
        console.warn("Firebase reaction update sync notice:", fbErr);
      }

      return NextResponse.json({
        success: true,
        data: { id, ...existing, likes, likedBy, reactions, updatedAt: now },
      });
    }

    // ── Handle General Post Updates ──────────────────────────────────────────
    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.content !== undefined) updates.content = body.content;
    if (body.media !== undefined) updates.media = body.media;
    if (body.poll !== undefined) updates.poll = body.poll;

    // Update DynamoDB
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: "SocialAndContent",
          Key: {
            contentId: (existing.contentId as string) || `POST#${id}`,
            sk: (existing.sk as string) || `POST#${existing.createdAt || now}`,
          },
          UpdateExpression: "SET " + Object.keys(updates).map((k) => `#${k} = :${k}`).join(", "),
          ExpressionAttributeNames: Object.keys(updates).reduce(
            (acc, k) => ({ ...acc, [`#${k}`]: k }),
            {}
          ),
          ExpressionAttributeValues: Object.keys(updates).reduce(
            (acc, k) => ({ ...acc, [`:${k}`]: updates[k] }),
            {}
          ),
        })
      );
    } catch (err) {
      console.warn("DynamoDB update post notice:", err);
    }

    // Sync to Firebase
    try {
      await db.collection("socialPosts").doc(id).update(updates);
    } catch (fbErr) {
      console.warn("Firebase post update sync notice:", fbErr);
    }

    return NextResponse.json({
      success: true,
      data: { id, ...existing, ...updates },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/createpost/[id] ─────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  try {
    const existing = await fetchPostById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 }
      );
    }

    // Delete from DynamoDB
    try {
      await docClient.send(
        new DeleteCommand({
          TableName: "SocialAndContent",
          Key: {
            contentId: (existing.contentId as string) || `POST#${id}`,
            sk: (existing.sk as string) || `POST#${existing.createdAt || Date.now()}`,
          },
        })
      );
    } catch (err) {
      console.warn("DynamoDB delete post notice:", err);
    }

    // Delete from Firebase
    try {
      await db.collection("socialPosts").doc(id).delete();
    } catch (fbErr) {
      console.warn("Firebase delete post notice:", fbErr);
    }

    return NextResponse.json({ success: true, message: "Post deleted successfully" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}