// backend/lib/fliplineNotifications.ts — 100% AWS DynamoDB FlipLINE Notification Dispatcher
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { getCandidateTableNames } from "@/lib/dualWrite";
import { db } from "@/lib/firebaseAdmin";
import { PutCommand, QueryCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const DEFAULT_TTL_DAYS = 30; // 30 days retention

export interface DispatchFlipLineNotificationPayload {
  type:
    | "flipline.post_liked"
    | "flipline.comment_added"
    | "flipline.reply_added"
    | "flipline.comment_liked"
    | "flipline.reply_liked"
    | "flipline.user_mentioned"
    | "flipline.milestone"
    | "flipline.scheduled_live"
    | "flipline.ai_insight"
    | string;
  actorId: string;
  actorName: string;
  actorAvatar?: string;
  recipientId: string;
  cardId: string | number;
  cardContent?: string;
  commentId?: string;
  commentSnippet?: string;
  replyId?: string;
  replySnippet?: string;
  milestoneLikes?: number;
  priority?: "HIGH" | "NORMAL" | "LOW";
}

/**
 * Extracts @username mentions from text
 */
export function extractMentions(text?: string): string[] {
  if (!text) return [];
  const matches = text.match(/@([a-zA-Z0-9_]+)/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase().trim()))).filter(
    (handle) => handle && handle !== "flip" && handle !== "flip_bot" && handle !== "sportsfan"
  );
}

/**
 * Resolves user IDs from @mention handles across DynamoDB / Firestore users
 */
export async function resolveUserIdsFromHandles(handles: string[]): Promise<Map<string, string>> {
  const handleMap = new Map<string, string>();
  if (!handles || handles.length === 0) return handleMap;

  // 1. Direct check: If handle looks like an email or userId
  for (const handle of handles) {
    if (handle.includes("@") || handle.startsWith("u_")) {
      handleMap.set(handle, handle);
    }
  }

  // 2. Query Firestore / DynamoDB users collection
  if (db) {
    try {
      for (const handle of handles) {
        if (handleMap.has(handle)) continue;
        const usersSnap = await db
          .collection("users")
          .where("handle", "==", `@${handle}`)
          .limit(1)
          .get()
          .catch(() => null);

        if (usersSnap && !usersSnap.empty) {
          const uDoc = usersSnap.docs[0];
          const uData = uDoc.data();
          const targetId = uDoc.id || uData.userId || uData.email;
          if (targetId) handleMap.set(handle, String(targetId));
          continue;
        }

        // Also check by lowercase username
        const byNameSnap = await db
          .collection("users")
          .where("username", "==", handle)
          .limit(1)
          .get()
          .catch(() => null);

        if (byNameSnap && !byNameSnap.empty) {
          const uDoc = byNameSnap.docs[0];
          const uData = uDoc.data();
          const targetId = uDoc.id || uData.userId || uData.email;
          if (targetId) handleMap.set(handle, String(targetId));
        }
      }
    } catch (err) {
      console.warn("[resolveUserIdsFromHandles] Firestore notice:", err);
    }
  }

  // Fallback: If not found in DB, use handle as recipient identifier
  for (const handle of handles) {
    if (!handleMap.has(handle)) {
      handleMap.set(handle, handle);
    }
  }

  return handleMap;
}

function formatCtaTarget(payload: DispatchFlipLineNotificationPayload): string {
  const cardParam = encodeURIComponent(String(payload.cardId || ""));
  let target = `/MainModules/FlipLine?cardId=${cardParam}`;
  if (payload.commentId) {
    target += `&commentId=${encodeURIComponent(String(payload.commentId))}`;
  }
  if (payload.replyId) {
    target += `&replyId=${encodeURIComponent(String(payload.replyId))}`;
  }
  return target;
}

function truncateSnippet(text?: string, maxLen = 60): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 3)}...`;
}

function formatNotificationBody(
  payload: DispatchFlipLineNotificationPayload,
  count: number = 1,
  actorNames: string[] = []
): string {
  const cleanActor = String(payload.actorId || "").replace(/^USER#/, "").trim();
  const cleanRecipient = String(payload.recipientId || "").replace(/^USER#/, "").trim();
  const isSelf = cleanActor && cleanRecipient && cleanActor === cleanRecipient;
  const actorDisplay = isSelf ? "You" : payload.actorName || "A sports fan";

  const commentSnippet = truncateSnippet(payload.commentSnippet || payload.cardContent);
  const replySnippet = truncateSnippet(payload.replySnippet || payload.commentSnippet);

  switch (payload.type) {
    case "flipline.post_liked":
      if (count > 1) {
        return `${payload.actorName} and ${count - 1} other${count > 2 ? "s" : ""} liked your post`;
      }
      return `${actorDisplay} liked your FlipLINE post`;

    case "flipline.comment_added":
      if (commentSnippet) {
        return `${actorDisplay} commented: "${commentSnippet}"`;
      }
      return `${actorDisplay} commented on your FlipLINE post`;

    case "flipline.reply_added":
      if (replySnippet) {
        return `${actorDisplay} replied to your comment: "${replySnippet}"`;
      }
      return `${actorDisplay} replied to your comment`;

    case "flipline.comment_liked":
      if (count > 1) {
        return `${payload.actorName} and ${count - 1} other${count > 2 ? "s" : ""} liked your comment`;
      }
      return `${actorDisplay} liked your comment`;

    case "flipline.reply_liked":
      if (count > 1) {
        return `${payload.actorName} and ${count - 1} other${count > 2 ? "s" : ""} liked your reply`;
      }
      return `${actorDisplay} liked your reply`;

    case "flipline.user_mentioned":
      if (payload.replyId) {
        return `${actorDisplay} mentioned you in a reply: "${replySnippet}"`;
      }
      if (payload.commentId) {
        return `${actorDisplay} mentioned you in a comment: "${commentSnippet}"`;
      }
      return `${actorDisplay} mentioned you in a FlipLINE post`;

    case "flipline.milestone":
      return `🔥 Your post is trending with over ${payload.milestoneLikes || 50} likes!`;

    case "flipline.scheduled_live":
      return "Your scheduled FlipLINE post is now live!";

    case "flipline.ai_insight":
      return "Flip AI added tactical insights to your discussion";

    default:
      return `${actorDisplay} interacted with your FlipLINE post`;
  }
}

/**
 * Finds an unread aggregated notification within the last 24 hours across candidate tables.
 */
async function findUnreadAggregation(
  recipientId: string,
  aggregationKey: string,
  windowMs: number = 24 * 60 * 60 * 1000
): Promise<{ item: any; table: string } | null> {
  const candidateTables = getCandidateTableNames(TABLES.Notifications);
  const cleanRecipientId = recipientId.replace(/^USER#/, "").trim();

  for (const table of candidateTables) {
    try {
      const res = await docClient.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :skpfx)",
          ExpressionAttributeValues: {
            ":pk": `USER#${cleanRecipientId}`,
            ":skpfx": "NOTIF#",
          },
          ScanIndexForward: false,
          Limit: 20,
        })
      );

      if (!res.Items || res.Items.length === 0) continue;

      const cutoff = Date.now() - windowMs;
      for (const item of res.Items) {
        if (item.read === true || item.isRead === true) continue;
        if (item.aggregation_key === aggregationKey) {
          const itemTime = new Date(item.sent_at || 0).getTime();
          if (itemTime >= cutoff) {
            return { item, table };
          }
        }
      }
    } catch (err: any) {
      const isTableMissing =
        err?.name === "ResourceNotFoundException" ||
        err?.message?.includes("Cannot do operations on a non-existent table");
      if (!isTableMissing) {
        console.warn(`[findUnreadAggregation] FlipLine Table notice (${table}):`, err?.message || err);
      }
    }
  }
  return null;
}

/**
 * Dispatches a FlipLINE notification with 24-hour aggregation in DynamoDB + Firestore.
 */
export async function dispatchFlipLineNotification(
  payload: DispatchFlipLineNotificationPayload & { allowSelf?: boolean }
): Promise<string | null> {
  if (!payload.recipientId) {
    return null;
  }

  const cleanRecipientId = String(payload.recipientId).replace(/^USER#/, "").trim();
  const cleanActorId = String(payload.actorId || "").replace(/^USER#/, "").trim();

  if (!cleanRecipientId) return null;

  // Self-notification suppression (standard unless explicitly allowed)
  if (cleanActorId && cleanActorId === cleanRecipientId && !payload.allowSelf) {
    return null;
  }

  const now = new Date();
  const sentAt = now.toISOString();
  const notifId = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const expiresAt = Math.floor(now.getTime() / 1000) + DEFAULT_TTL_DAYS * 86400;

  const isAggregatable =
    payload.type === "flipline.post_liked" ||
    payload.type === "flipline.comment_liked" ||
    payload.type === "flipline.reply_liked";

  const aggregationKey = isAggregatable
    ? `AGGR#${payload.type}#${payload.cardId}${payload.commentId ? `#${payload.commentId}` : ""}${payload.replyId ? `#${payload.replyId}` : ""}`
    : undefined;

  // 1. Check for existing unread aggregation
  if (isAggregatable && aggregationKey) {
    const existingResult = await findUnreadAggregation(cleanRecipientId, aggregationKey);

    if (existingResult) {
      const { item: existing, table: matchedTable } = existingResult;
      const nextCount = (Number(existing.aggregation_count) || 1) + 1;
      const existingNames: string[] = Array.isArray(existing.actor_names)
        ? existing.actor_names
        : [existing.actor_name || "A fan"];

      const updatedNames = Array.from(new Set([payload.actorName, ...existingNames]));
      const newBody = formatNotificationBody(payload, nextCount, updatedNames);

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: matchedTable,
            Key: { PK: existing.PK, SK: existing.SK },
            UpdateExpression:
              "SET #body = :body, #msg = :body, aggregation_count = :cnt, actor_id = :actId, actor_name = :actName, actor_avatar = :actAvatar, actor_names = :actNames, sent_at = :now, GSI2SK = :nowGsi",
            ExpressionAttributeNames: { "#body": "body", "#msg": "message" },
            ExpressionAttributeValues: {
              ":body": newBody,
              ":cnt": nextCount,
              ":actId": cleanActorId,
              ":actName": payload.actorName,
              ":actAvatar": payload.actorAvatar || existing.actor_avatar || null,
              ":actNames": updatedNames,
              ":now": sentAt,
              ":nowGsi": `SENTAT#${sentAt}#${(existing.SK as string)?.split("#").pop() || notifId}`,
            },
          })
        );

        // Sync update to Firestore
        if (db) {
          const docKey = `${(existing.SK as string)?.split("#").pop() || notifId}_${cleanRecipientId}`;
          await db
            .collection(getFirestoreCollection("notifications"))
            .doc(docKey)
            .set(
              {
                message: newBody,
                body: newBody,
                actor_names: updatedNames,
                aggregation_count: nextCount,
                updatedAt: Date.now(),
              },
              { merge: true }
            )
            .catch(() => {});
        }

        return (existing.SK as string)?.split("#").pop() || null;
      } catch (updateErr) {
        console.warn("[dispatchFlipLineNotification] Aggregation update fallback notice:", updateErr);
      }
    }
  }

  // 2. Create fresh DynamoDB notification matching schema
  const title = "FlipLINE";
  const body = formatNotificationBody(payload, 1, [payload.actorName]);
  const ctaLabel =
    payload.type === "flipline.reply_added"
      ? "View Reply"
      : payload.type === "flipline.comment_added"
      ? "View Comment"
      : "View Post";
  const ctaTarget = formatCtaTarget(payload);

  const item: Record<string, any> = {
    PK: `USER#${cleanRecipientId}`,
    SK: `NOTIF#${sentAt}#${notifId}`,
    entity_type: "NOTIFICATION",
    notification_type: payload.type,
    entity_id: String(payload.cardId),
    actor_id: cleanActorId,
    actor_name: payload.actorName,
    actor_avatar:
      payload.actorAvatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanActorId || "sportsfan"}`,
    actor_names: [payload.actorName],
    aggregation_count: 1,
    ...(aggregationKey ? { aggregation_key: aggregationKey } : {}),
    title,
    body,
    message: body,
    cta_label: ctaLabel,
    cta_target: ctaTarget,
    priority: payload.priority || (payload.type === "flipline.milestone" ? "HIGH" : "NORMAL"),
    read: false,
    isRead: false,
    response_given: false,
    cta_clicked: false,
    sent_at: sentAt,
    createdAt: Date.now(),
    expires_at: expiresAt,
    category: "flipline",
    feature_area: "flipline",
    GSI1PK: `TYPE#${payload.type}`,
    GSI1SK: `SENTAT#${sentAt}#${notifId}`,
    GSI2PK: `USER#${cleanRecipientId}#UNREAD`,
    GSI2SK: `SENTAT#${sentAt}#${notifId}`,
  };

  // 3. Write to candidate DynamoDB tables
  let writtenDynamo = false;
  const candidateTables = getCandidateTableNames(TABLES.Notifications);

  for (const table of candidateTables) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: table,
          Item: item,
        })
      );
      writtenDynamo = true;
      break;
    } catch (putErr: any) {
      const isTableMissing =
        putErr?.name === "ResourceNotFoundException" ||
        putErr?.message?.includes("Cannot do operations on a non-existent table");
      if (!isTableMissing) {
        console.warn(`[dispatchFlipLineNotification] DynamoDB write notice (${table}):`, putErr?.message || putErr);
        break;
      }
    }
  }

  // 4. Sync to Firestore for cross-subsystem fallback
  if (db) {
    try {
      const firestoreDocId = `${notifId}_${cleanRecipientId}`;
      await db
        .collection(getFirestoreCollection("notifications"))
        .doc(firestoreDocId)
        .set({
          id: notifId,
          recipientEmail: cleanRecipientId,
          recipientUid: cleanRecipientId,
          type: payload.type,
          notification_type: payload.type,
          title,
          body,
          message: body,
          cta_label: ctaLabel,
          ctaLabel,
          cta_target: ctaTarget,
          ctaTarget,
          actor_id: cleanActorId,
          actor_name: payload.actorName,
          actor_avatar: item.actor_avatar,
          actor_names: [payload.actorName],
          priority: item.priority,
          read: false,
          isRead: false,
          createdAt: Date.now(),
          sent_at: sentAt,
          category: "flipline",
          feature_area: "flipline",
        });
    } catch (fbErr) {
      console.warn("[dispatchFlipLineNotification] Firestore sync notice:", fbErr);
    }
  }

  return writtenDynamo ? notifId : notifId;
}
