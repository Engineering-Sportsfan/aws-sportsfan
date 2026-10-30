// backend/lib/notifications/service.ts

import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { getUserInfo } from "@/lib/userPoints";
import { db } from "@/lib/firebaseAdmin";
import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  CreateNotificationInput,
  StoredNotificationItem,
  NotificationCategory,
} from "./types";

const TABLE = TABLES.Notifications;
const DEFAULT_TTL_DAYS = 7;

function cleanId(id?: string | null): string {
  if (!id) return "";
  return id.replace(/^USER#/, "").trim();
}

/**
 * Creates and stores a notification in the central notifications table and syncs to Firestore.
 */
export async function createNotification(
  payload: CreateNotificationInput
): Promise<string> {
  const targetUserId = cleanId(payload.userId);
  if (!targetUserId) {
    throw new Error("createNotification requires a valid userId");
  }

  const sentAt = new Date().toISOString();
  const now = Date.now();
  const notifId = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ttlDays = payload.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = Math.floor(now / 1000) + ttlDays * 86400;

  const category: NotificationCategory =
    payload.category ||
    (payload.notification_type?.startsWith("roar.") || payload.notification_type?.startsWith("roar_")
      ? "roar"
      : payload.notification_type?.startsWith("store.")
      ? "store"
      : "social");

  const finalTitle = payload.title || "New notification";
  const finalBody = payload.body || payload.subtitle || "";
  const finalCtaLabel = payload.cta_label || payload.cta || null;
  const finalCtaTarget = payload.cta_target || payload.ctaTarget || null;

  const item: Record<string, any> = {
    PK: `USER#${targetUserId}`,
    SK: `NOTIF#${sentAt}#${notifId}`,
    id: notifId,
    notifId,
    entity_type: "NOTIFICATION",
    notification_type: payload.notification_type,
    type: payload.notification_type,
    category,
    title: finalTitle,
    message: finalTitle,
    body: finalBody,
    subtitle: finalBody,
    cta_label: finalCtaLabel,
    cta: finalCtaLabel,
    cta_target: finalCtaTarget,
    ctaTarget: finalCtaTarget,
    priority: payload.priority ?? "NORMAL",
    channels_sent: payload.channels_sent ?? ["in_app"],
    sent_at: sentAt,
    createdAt: now,
    read: false,
    isRead: false,
    response_given: false,
    cta_clicked: false,
    expires_at: expiresAt,
    GSI1PK: `TYPE#${payload.notification_type}`,
    GSI1SK: `SENTAT#${sentAt}#${notifId}`,
    GSI2PK: `USER#${targetUserId}#UNREAD`,
    GSI2SK: `SENTAT#${sentAt}#${notifId}`,
  };

  if (payload.recipientEmail) {
    item.recipientEmail = payload.recipientEmail;
  }
  if (payload.actor) {
    item.actor = payload.actor;
    if (payload.actor.userId) item.actor_id = payload.actor.userId;
    item.actor_name = payload.actor.username || payload.actor.name;
    item.actor_photoURL = payload.actor.avatarUrl;
    item.actorPhoto = payload.actor.avatarUrl;
  }
  if (payload.fan) {
    item.fan = payload.fan;
    if (!item.actor_name) item.actor_name = payload.fan.username;
    if (!item.actor_photoURL) item.actor_photoURL = payload.fan.avatarUrl;
  }
  if (payload.postId) item.postId = payload.postId;
  if (payload.roomId) item.roomId = payload.roomId;
  if (payload.metadata) item.metadata = payload.metadata;

  // Resolve canonical actualUserId
  let resolvedActualUserId: string | null = null;
  try {
    const info = await getUserInfo(targetUserId, undefined, payload.recipientEmail ?? undefined);
    if (info?.exists && info.actualUserId) {
      resolvedActualUserId = cleanId(info.actualUserId);
    }
  } catch {}

  const candidateSet = new Set<string>();
  candidateSet.add(targetUserId);
  if (resolvedActualUserId) candidateSet.add(resolvedActualUserId);
  if (payload.recipientEmail) {
    const cleanEmail = cleanId(payload.recipientEmail);
    if (cleanEmail) candidateSet.add(cleanEmail);
  }

  const targetCandidates = Array.from(candidateSet).filter(Boolean);

  // 1. Put into central DynamoDB candidate tables for each candidate identifier
  const candidateTables = getCandidateTableNames(TABLE);
  for (const table of candidateTables) {
    for (const cand of targetCandidates) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: table,
            Item: {
              ...item,
              PK: `USER#${cand}`,
              SK: `NOTIF#${sentAt}#${notifId}`,
              GSI2PK: `USER#${cand}#UNREAD`,
            },
          })
        );
      } catch (err) {
        // Soft catch for candidate tables
      }
    }
  }

  // 2. Dual-write to Firestore for client fallback
  if (db) {
    try {
      const fsPayload = {
        ...item,
        recipientUid: resolvedActualUserId || targetUserId,
        recipientEmail: payload.recipientEmail || null,
      };
      await db
        .collection(getFirestoreCollection("notifications"))
        .doc(notifId)
        .set(fsPayload, { merge: true })
        .catch(() => {});

      for (const cand of targetCandidates) {
        await db
          .collection(getFirestoreCollection("notifications"))
          .doc(`${notifId}_${cand}`)
          .set(fsPayload, { merge: true })
          .catch(() => {});
      }
    } catch (fsErr) {
      console.warn("[NotificationService] Firestore fallback write notice:", fsErr);
    }
  }

  return notifId;
}

/**
 * Fetches notifications for a user, optionally filtered by category.
 */
export async function getNotificationsForUser(
  userId: string,
  options?: {
    email?: string | null;
    category?: string | null;
    limit?: number;
    countOnly?: boolean;
  }
): Promise<{ notifications: StoredNotificationItem[]; unreadCount: number }> {
  const cleanUser = cleanId(userId);
  const cleanEmail = options?.email ? cleanId(options.email) : null;
  const candidates = [cleanUser, cleanEmail].filter(Boolean) as string[];

  let items: any[] = [];
  const seenIds = new Set<string>();

  // Query DynamoDB
  for (const cand of candidates) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: {
            ":pk": `USER#${cand}`,
            ":prefix": "NOTIF#",
          },
          ScanIndexForward: false,
          Limit: options?.limit ?? 50,
        })
      );

      if (res.Items) {
        for (const item of res.Items) {
          const id = item.notifId || item.id || (item.SK as string)?.split("#").pop();
          if (id && !seenIds.has(id)) {
            seenIds.add(id);
            items.push(item);
          }
        }
      }
    } catch (dynErr) {
      console.warn("[NotificationService] DynamoDB query notice:", dynErr);
    }
  }

  // Fallback to Firestore if DynamoDB yielded nothing
  if (items.length === 0 && db) {
    try {
      for (const cand of candidates) {
        const [uidSnap, emailSnap] = await Promise.all([
          db.collection(getFirestoreCollection("notifications")).where("recipientUid", "==", cand).limit(50).get().catch(() => null),
          options?.email ? db.collection(getFirestoreCollection("notifications")).where("recipientEmail", "==", options.email).limit(50).get().catch(() => null) : null,
        ]);
        for (const snap of [uidSnap, emailSnap]) {
          if (!snap || snap.empty) continue;
          for (const doc of snap.docs) {
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              items.push({ id: doc.id, notifId: doc.id, ...doc.data() });
            }
          }
        }
      }
    } catch (fsErr) {
      console.warn("[NotificationService] Firestore fallback query notice:", fsErr);
    }
  }

  // Filter by category if requested
  if (options?.category) {
    const targetCategory = options.category.toLowerCase();
    items = items.filter((n) => {
      const cat = (n.category || "").toLowerCase();
      const type = (n.notification_type || n.type || "").toLowerCase();
      if (targetCategory === "roar") {
        return cat === "roar" || type.startsWith("roar") || type.includes("match_live") || type.includes("heating_up");
      }
      return cat === targetCategory || type.startsWith(targetCategory);
    });
  }

  // Sort newest first
  items.sort((a, b) => {
    const timeA = new Date(a.sent_at || a.createdAt || 0).getTime();
    const timeB = new Date(b.sent_at || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  const unreadCount = items.filter((n) => !n.read && !n.isRead).length;

  const normalized: StoredNotificationItem[] = items.map((n) => {
    const notifId = n.notifId || n.id || (n.SK as string)?.split("#").pop() || "";
    const isRead = Boolean(n.read ?? n.isRead);
    return {
      ...n,
      id: notifId,
      notifId,
      read: isRead,
      isRead,
      type: n.type || n.notification_type || "NOTIFICATION",
      notification_type: n.notification_type || n.type || "NOTIFICATION",
      category: n.category || "social",
      title: n.title || n.message || "Notification",
      message: n.message || n.title || "Notification",
      subtitle: n.subtitle || n.body || "",
      body: n.body || n.subtitle || "",
      cta_label: n.cta_label || n.cta || null,
      cta: n.cta || n.cta_label || null,
      cta_target: n.cta_target || n.ctaTarget || "/MainModules/ROAR",
      ctaTarget: n.ctaTarget || n.cta_target || "/MainModules/ROAR",
    };
  });

  return { notifications: normalized, unreadCount };
}

/**
 * Marks a specific notification as read.
 */
export async function markNotificationRead(
  userId: string,
  notifId: string
): Promise<boolean> {
  const cleanUser = cleanId(userId);
  if (!cleanUser || !notifId) return false;

  const now = Date.now();

  // Find the notification in DynamoDB to get its exact SK
  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${cleanUser}`,
          ":prefix": "NOTIF#",
        },
      })
    );

    const match = res.Items?.find(
      (item) =>
        item.notifId === notifId ||
        item.id === notifId ||
        (item.SK as string)?.endsWith(`#${notifId}`)
    );

    if (match) {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: `USER#${cleanUser}`, SK: match.SK },
          UpdateExpression: "SET #r = :t, isRead = :t, readAt = :now REMOVE GSI2PK, GSI2SK",
          ExpressionAttributeNames: { "#r": "read" },
          ExpressionAttributeValues: { ":t": true, ":now": now },
        })
      );
    }
  } catch (dynErr) {
    console.warn("[NotificationService] DynamoDB markRead notice:", dynErr);
  }

  // Also update Firestore doc
  if (db) {
    try {
      await db.collection(getFirestoreCollection("notifications")).doc(notifId).update({
        read: true,
        isRead: true,
        readAt: now,
      });
    } catch {
      // ignore
    }
  }

  return true;
}

/**
 * Marks all notifications as read for a user.
 */
export async function markAllNotificationsRead(
  userId: string,
  options?: { email?: string | null; category?: string | null }
): Promise<number> {
  const cleanUser = cleanId(userId);
  if (!cleanUser) return 0;
  const now = Date.now();

  let updatedCount = 0;

  try {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `USER#${cleanUser}`,
          ":prefix": "NOTIF#",
        },
      })
    );

    if (res.Items) {
      for (const item of res.Items) {
        if (!item.read && !item.isRead) {
          if (options?.category) {
            const cat = (item.category || "").toLowerCase();
            if (cat !== options.category.toLowerCase()) continue;
          }
          await docClient.send(
            new UpdateCommand({
              TableName: TABLE,
              Key: { PK: item.PK, SK: item.SK },
              UpdateExpression: "SET #r = :t, isRead = :t, readAt = :now REMOVE GSI2PK, GSI2SK",
              ExpressionAttributeNames: { "#r": "read" },
              ExpressionAttributeValues: { ":t": true, ":now": now },
            })
          ).catch(() => {});
          updatedCount++;
        }
      }
    }
  } catch (dynErr) {
    console.warn("[NotificationService] DynamoDB markAllRead notice:", dynErr);
  }

  // Sync to Firestore
  if (db) {
    try {
      const snaps = await Promise.all([
        db.collection(getFirestoreCollection("notifications")).where("recipientUid", "==", cleanUser).where("isRead", "==", false).get().catch(() => null),
        options?.email ? db.collection(getFirestoreCollection("notifications")).where("recipientEmail", "==", options.email).where("isRead", "==", false).get().catch(() => null) : null,
      ]);
      const b = db.batch();
      let bCount = 0;
      for (const snap of snaps) {
        if (!snap || snap.empty) continue;
        snap.docs.forEach((d) => {
          b.update(d.ref, { read: true, isRead: true, readAt: now });
          bCount++;
        });
      }
      if (bCount > 0) await b.commit();
    } catch {
      // ignore
    }
  }

  return updatedCount;
}
