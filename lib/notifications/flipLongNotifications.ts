// backend/lib/notifications/flipLongNotifications.ts — FlipLONG Video Notification Dispatcher
import { createNotification } from "./service";

export interface DispatchFlipLongLikePayload {
  videoId: string;
  videoTitle?: string;
  creatorId?: string | null;
  creatorEmail?: string | null;
  likerId: string;
  likerName: string;
  likerAvatar?: string;
}

export interface DispatchFlipLongProcessingPayload {
  videoId: string;
  videoTitle?: string;
  userId: string;
  userEmail?: string;
  reelsCount?: number;
}

export interface DispatchFlipLongPublishedPayload {
  videoId: string;
  videoTitle: string;
  authorName: string;
  authorId?: string;
  recipientId?: string;       // "all_users" or specific user ID
  recipientEmail?: string;
  sport?: string;
}

export interface DispatchFlipLongGenericPayload {
  userId: string;
  recipientEmail?: string | null;
  notificationType: string;
  title: string;
  body: string;
  videoId?: string;
  videoTitle?: string;
  actor?: {
    userId?: string;
    username?: string;
    avatarUrl?: string;
  };
  priority?: "HIGH" | "NORMAL" | "LOW";
  metadata?: Record<string, any>;
}

/**
 * 1. Dispatches notification when someone likes a FlipLong video
 */
export async function notifyFlipLongVideoLiked(
  payload: DispatchFlipLongLikePayload
): Promise<string | null> {
  const recipient = payload.creatorId || payload.creatorEmail;
  if (!recipient) return null;

  // Self-like guard
  if (
    (payload.creatorId && payload.creatorId === payload.likerId) ||
    (payload.creatorEmail &&
      payload.likerId.includes("@") &&
      payload.creatorEmail.toLowerCase() === payload.likerId.toLowerCase())
  ) {
    return null;
  }

  const title = "New Video Like";
  const videoName = payload.videoTitle || "your video";
  const body = `${payload.likerName} liked your video "${videoName}"`;

  return await createNotification({
    userId: recipient,
    recipientEmail: payload.creatorEmail || null,
    category: "fliplong",
    notification_type: "fliplong.video_liked",
    title,
    body,
    subtitle: videoName,
    cta_label: "Watch Video",
    cta_target: `/MainModules/FlipLong?videoId=${payload.videoId}`,
    priority: "NORMAL",
    actor: {
      userId: payload.likerId,
      username: payload.likerName,
      avatarUrl: payload.likerAvatar,
    },
    metadata: { videoId: payload.videoId },
  });
}

/**
 * 2. Dispatches notification when AI video processing is complete
 */
export async function notifyFlipLongProcessingComplete(
  payload: DispatchFlipLongProcessingPayload
): Promise<string | null> {
  if (!payload.userId) return null;

  const title = "FlipLONG Video Ready!";
  const countStr = payload.reelsCount ? ` (${payload.reelsCount} reels generated)` : "";
  const body = `Your video "${payload.videoTitle || "Uploaded video"}" has finished processing!${countStr} Review and publish now.`;

  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.userEmail || null,
    category: "fliplong",
    notification_type: "fliplong.processing_complete",
    title,
    body,
    subtitle: payload.videoTitle || "Video Ready",
    cta_label: "Review Video",
    cta_target: "/MainModules/FlipLong",
    priority: "HIGH",
    metadata: { videoId: payload.videoId },
  });
}

/**
 * 3. Dispatches notification when a FlipLONG video is published or goes live
 */
export async function notifyFlipLongVideoPublished(
  payload: DispatchFlipLongPublishedPayload
): Promise<string | null> {
  const recipient = payload.recipientId || "all_users";
  const title = "New Video Drop!";
  const body = `${payload.authorName || "A creator"} dropped a new video: "${payload.videoTitle}". Watch now!`;

  return await createNotification({
    userId: recipient,
    recipientEmail: payload.recipientEmail || null,
    category: "fliplong",
    notification_type: "fliplong.video_published",
    title,
    body,
    subtitle: payload.videoTitle,
    cta_label: "Watch Now",
    cta_target: `/MainModules/FlipLong?videoId=${payload.videoId}`,
    priority: "NORMAL",
    actor: payload.authorId ? {
      userId: payload.authorId,
      username: payload.authorName,
    } : null,
    metadata: {
      videoId: payload.videoId,
      sport: payload.sport || "general",
    },
  });
}

/**
 * 4. General dispatcher for any FlipLONG notification event
 */
export async function dispatchFlipLongNotification(
  payload: DispatchFlipLongGenericPayload
): Promise<string | null> {
  if (!payload.userId) return null;

  return await createNotification({
    userId: payload.userId,
    recipientEmail: payload.recipientEmail || null,
    category: "fliplong",
    notification_type: payload.notificationType.startsWith("fliplong")
      ? payload.notificationType
      : `fliplong.${payload.notificationType}`,
    title: payload.title,
    body: payload.body,
    subtitle: payload.videoTitle,
    cta_label: "Open FlipLONG",
    cta_target: payload.videoId
      ? `/MainModules/FlipLong?videoId=${payload.videoId}`
      : "/MainModules/FlipLong",
    priority: payload.priority || "NORMAL",
    actor: payload.actor || null,
    metadata: {
      ...(payload.videoId && { videoId: payload.videoId }),
      ...payload.metadata,
    },
  });
}
