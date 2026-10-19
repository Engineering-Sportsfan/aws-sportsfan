// backend/lib/notifications/types.ts

export type NotificationCategory =
  | "roar"
  | "store"
  | "social"
  | "system"
  | "fliparena"
  | "flipline"
  | "fliplong"
  | (string & {});

export type NotificationPriority = "HIGH" | "NORMAL" | "LOW";

export interface CreateNotificationInput {
  userId: string;              // Target canonical actualUserId (e.g. "USER#abc" or "abc")
  recipientEmail?: string | null;
  notification_type: string;   // e.g. "roar.post_reply", "store.auction_outbid", "dolly.reply_ready"
  category?: NotificationCategory;
  title: string;
  body: string;
  subtitle?: string;
  cta_label?: string | null;
  cta_target?: string | null;   // deep-link or path, e.g. "/MainModules/ROAR" or "sf360://..."
  priority?: NotificationPriority;
  channels_sent?: string[];
  ttlDays?: number;
  actor?: {
    userId?: string;
    username?: string;
    name?: string;
    avatarUrl?: string;
    badge?: string;
  } | null;
  fan?: {
    username: string;
    badge: string;
    avatarUrl?: string;
  } | null;
  postId?: string | null;
  roomId?: string | null;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface StoredNotificationItem {
  PK: string;
  SK: string;
  id: string;
  notifId: string;
  entity_type: "NOTIFICATION";
  notification_type: string;
  type: string;
  category: NotificationCategory;
  title: string;
  message: string;
  body: string;
  subtitle: string;
  cta_label: string | null;
  cta: string | null;
  cta_target: string | null;
  ctaTarget: string | null;
  priority: NotificationPriority;
  channels_sent: string[];
  sent_at: string;
  createdAt: number;
  read: boolean;
  isRead: boolean;
  expires_at: number;
  actor_name?: string | null;
  actor_photoURL?: string | null;
  actorPhoto?: string | null;
  fan?: {
    username: string;
    badge: string;
    avatarUrl?: string;
  } | null;
  postId?: string | null;
  roomId?: string | null;
  metadata?: Record<string, any>;
  [key: string]: any;
}
