// app/api/notifications/audio/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import cloudinary from "@/lib/cloudinary";

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

/**
 * POST /api/notifications/audio
 *
 * Called by a cron job (or Cloudinary webhook) whenever new audio is uploaded.
 * It checks which audio files were uploaded in the last N minutes and, for each
 * new file, fans out a notification to every registered user.
 *
 * Body (optional):
 *   { sinceMinutes?: number }   — defaults to 60; how far back to look
 *   { publicId?: string }       — target a single file by its Cloudinary public_id
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sinceMinutes: number = body.sinceMinutes ?? 60;
    const targetPublicId: string | undefined = body.publicId;

    // ── 1. Fetch recent audio files from Cloudinary ───────────────────────────
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

    // ── 2. Fetch all registered users to fan out ──────────────────────────────
    const usersSnap = await db.collection("users").get();
    if (usersSnap.empty) {
      return NextResponse.json({ success: true, created: 0, message: "No users found" });
    }

    const users = usersSnap.docs.map((d) => ({
      email: d.data().email as string,
      uid: d.id,
    })).filter((u) => !!u.email);

    // ── 3. De-duplicate: skip notifications already created for these files ───
    let totalCreated = 0;

    for (const audio of newAudio) {
      const fileName =
        audio.display_name || audio.public_id.split("/").pop() || audio.public_id;
      const title = fileName.replace(/_/g, " ");

      // Check if we already notified about this file (use public_id as a stable key)
      const existing = await db
        .collection("notifications")
        .where("type", "==", "NEW_AUDIO")
        .where("audioPublicId", "==", audio.public_id)
        .limit(1)
        .get();

      if (!existing.empty) continue; // already sent, skip

      // Fan out to all users in batches of 500 (Firestore batch limit)
      const BATCH_SIZE = 500;
      for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const chunk = users.slice(i, i + BATCH_SIZE);
        const batch = db.batch();

        for (const user of chunk) {
          const docRef = db.collection("notifications").doc();
          batch.set(docRef, {
            type: "NEW_AUDIO",
            recipientEmail: user.email,
            recipientUid: user.uid,
            // Audio metadata
            audioPublicId: audio.public_id,
            audioTitle: title,
            audioUrl: audio.secure_url,
            audioDuration: formatDuration(audio.duration),
            audioDurationSeconds: audio.duration || 0,
            audioFormat: audio.format,
            // Display fields
            message: `New audio clip available: "${title}"`,
            isRead: false,
            createdAt: Date.now(),
            audioUploadedAt: new Date(audio.created_at).getTime(),
          });
          totalCreated++;
        }

        await batch.commit();
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

/**
 * GET /api/notifications/audio
 *
 * Returns a count of unread NEW_AUDIO notifications for a given user.
 * Used by the Header badge to avoid a full notification list fetch.
 *
 * Query params:
 *   email — the user's email
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const snapshot = await db
      .collection("notifications")
      .where("recipientEmail", "==", email)
      .where("type", "==", "NEW_AUDIO")
      .where("isRead", "==", false)
      .get();

    return NextResponse.json({ success: true, unreadCount: snapshot.size });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unexpected error";
    console.error("GET /api/notifications/audio error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}