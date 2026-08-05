// app/api/notifications/audio/route.ts — Migrated to AWS DynamoDB (IdentityAndAccess Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import cloudinary from "@/lib/cloudinary";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

interface CloudinaryResource {
  public_id: string;
  secure_url: string;
  duration: number;
  created_at: string;
  bytes: number;
  format: string;
  display_name: string;
}

interface CloudinaryApiParams {
  resource_type: string;
  type: string;
  prefix: string;
  max_results: number;
  image_metadata: boolean;
}

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sinceMinutes: number = body.sinceMinutes ?? 60;
    const targetPublicId: string | undefined = body.publicId;

    // 1. Fetch recent audio files from Cloudinary
    const params: CloudinaryApiParams = {
      resource_type: "video",
      type: "upload",
      prefix: "sf360/audio",
      max_results: 50,
      image_metadata: true,
    };

    const result = await cloudinary.api.resources(params);
    const resources: CloudinaryResource[] = result.resources;

    const cutoff = Date.now() - sinceMinutes * 60 * 1000;

    const newAudio = resources.filter((r) => {
      if (targetPublicId) return r.public_id === targetPublicId;
      return new Date(r.created_at).getTime() >= cutoff;
    });

    if (newAudio.length === 0) {
      return NextResponse.json({ success: true, created: 0, message: "No new audio found" });
    }

    // 2. Fetch users
    let users: Array<{ email: string; uid: string }> = [];
    if (db) {
      const usersSnap = await db.collection("users").get();
      users = usersSnap.docs
        .map((d) => ({
          email: d.data().email as string,
          uid: d.id,
        }))
        .filter((u) => !!u.email);
    }

    if (users.length === 0) {
      return NextResponse.json({ success: true, created: 0, message: "No users found" });
    }

    // 3. De-duplicate & fan out
    let totalCreated = 0;

    for (const audio of newAudio) {
      const fileName =
        audio.display_name || audio.public_id.split("/").pop() || audio.public_id;
      const title = fileName.replace(/_/g, " ");

      if (db) {
        const existing = await db
          .collection("notifications")
          .where("type", "==", "NEW_AUDIO")
          .where("audioPublicId", "==", audio.public_id)
          .limit(1)
          .get();

        if (!existing.empty) continue;
      }

      const BATCH_SIZE = 500;
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const chunk = users.slice(i, i + BATCH_SIZE);
        const batch = db ? db.batch() : null;

        for (const user of chunk) {
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const notifData = {
            id: notifId,
            type: "NEW_AUDIO",
            recipientEmail: user.email,
            recipientUid: user.uid,
            audioPublicId: audio.public_id,
            audioTitle: title,
            audioUrl: audio.secure_url,
            audioDuration: formatDuration(audio.duration),
            audioDurationSeconds: audio.duration || 0,
            audioFormat: audio.format,
            message: `New audio clip available: "${title}"`,
            isRead: false,
            createdAt: Date.now(),
            audioUploadedAt: new Date(audio.created_at).getTime(),
          };

          if (batch && db) {
            const docRef = db.collection("notifications").doc(notifId);
            batch.set(docRef, notifData);
          }

          const dynamoItem = {
            entityId: `NOTIFICATION#${notifId}`,
            sk: `USER#${user.uid}#NEW_AUDIO`,
            ...notifData,
          };

          dualWrite("notifications", notifId, "IdentityAndAccess", dynamoItem).catch((e) =>
            console.warn("[notifications/audio] DynamoDB dualWrite notice:", e)
          );

          totalCreated++;
        }

        if (batch) {
          await batch.commit();
        }
      }
    }

    return NextResponse.json({
      success: true,
      created: totalCreated,
      audioCount: newAudio.length,
      userCount: users.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("POST /api/notifications/audio error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "IdentityAndAccess",
          FilterExpression: "begins_with(entityId, :prefix) AND recipientEmail = :email AND #tp = :type AND isRead = :isRead",
          ExpressionAttributeNames: {
            "#tp": "type",
          },
          ExpressionAttributeValues: {
            ":prefix": "NOTIFICATION#",
            ":email": email,
            ":type": "NEW_AUDIO",
            ":isRead": false,
          },
          Select: "COUNT",
        })
      );
      if (scanRes.Count !== undefined && scanRes.Count > 0) {
        return NextResponse.json({ success: true, unreadCount: scanRes.Count });
      }
    } catch (e) {
      console.warn("[notifications/audio GET] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (db) {
      const snapshot = await db
        .collection("notifications")
        .where("recipientEmail", "==", email)
        .where("type", "==", "NEW_AUDIO")
        .where("isRead", "==", false)
        .get();

      return NextResponse.json({ success: true, unreadCount: snapshot.size });
    }

    return NextResponse.json({ success: true, unreadCount: 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications/audio error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}