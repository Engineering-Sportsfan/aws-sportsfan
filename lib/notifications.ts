// lib/notifications.ts
import { docClient } from "@/lib/dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = "sf360-notifications";
const DEFAULT_TTL_DAYS = 2; // matches doc's typical 48h TTL; override per notification_type if needed

export async function createNotification(payload: {
  userId: string;              // ← now required: schema keys on user_id, not email
  notification_type: string;   // e.g. "dolly.reply_ready"
  title: string;
  body: string;
  cta_label?: string;
  cta_target?: string;         // deep-link, e.g. "sf360://roar/rooms/<roomId>/dolly/<sessionId>"
  priority?: "HIGH" | "NORMAL" | "LOW";
  channels_sent?: string[];
  ttlDays?: number;
}) {
  const sentAt = new Date().toISOString();
  const notifId = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const ttlDays = payload.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86400;

  const item = {
    PK: `USER#${payload.userId}`,
    SK: `NOTIF#${sentAt}#${notifId}`,
    entity_type: "NOTIFICATION",
    notification_type: payload.notification_type,
    title: payload.title,
    body: payload.body,
    cta_label: payload.cta_label ?? null,
    cta_target: payload.cta_target ?? null,
    priority: payload.priority ?? "NORMAL",
    channels_sent: payload.channels_sent ?? ["in_app"],
    sent_at: sentAt,
    read: false,
    response_given: false,
    cta_clicked: false,
    expires_at: expiresAt,
    GSI1PK: `TYPE#${payload.notification_type}`,
    GSI1SK: `SENTAT#${sentAt}#${notifId}`,
    GSI2PK: `USER#${payload.userId}#UNREAD`,
    GSI2SK: `SENTAT#${sentAt}#${notifId}`,
  };

  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  return notifId;
}