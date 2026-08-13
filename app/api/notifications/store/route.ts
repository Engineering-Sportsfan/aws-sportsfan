import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" }));
const TABLE_NAME = "sf360-notifications";

// ---- Store notification types (Section 6.4 + Digital gap + reward tier) ----
type StoreNotificationType =
  | "store.order_confirmed"
  | "store.order_shipped"
  | "store.expert_session_booked"
  | "store.session_reminder"
  | "store.noc_approval_status"
  | "store.new_drop"
  | "store.reward_unlocked"
  | "store.wishlist_back_in_stock"
  | "store.digital_product_ready";

// ---- Store category filter (your "Shop by Category" list) ----
type StoreCategory =
  | "coaches"
  | "experiences"
  | "events"
  | "auctions"
  | "athletes"
  | "merch"
  | "brands"
  | "digital"
  | "members";

type Channel = "in_app" | "email" | "web_push";

// Per-type defaults, matching the doc's Section 6.4 table (channels, priority, TTL).
const STORE_NOTIFICATION_CONFIG: Record<
  StoreNotificationType,
  { channels: Channel[]; priority: "HIGH" | "NORMAL" | "LOW"; ttlHours: number | null }
> = {
  "store.order_confirmed": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: null },
  "store.order_shipped": { channels: ["in_app", "email"], priority: "NORMAL", ttlHours: 24 * 14 },
  "store.expert_session_booked": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: null },
  "store.session_reminder": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: 24 },
  "store.noc_approval_status": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: null },
  "store.new_drop": { channels: ["in_app", "email"], priority: "NORMAL", ttlHours: 48 },
  "store.reward_unlocked": { channels: ["in_app"], priority: "NORMAL", ttlHours: 24 * 7 },
  "store.wishlist_back_in_stock": { channels: ["in_app", "email"], priority: "NORMAL", ttlHours: 48 },
  "store.digital_product_ready": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: null },
};

const DEFAULT_TITLES: Record<string, string> = {
  "store.order_confirmed": "Order Confirmed!",
  "store.order_shipped": "Order Shipped!",
  "store.expert_session_booked": "Expert Session Booked!",
  "store.session_reminder": "Session Reminder",
  "store.noc_approval_status": "AFI Status Update",
  "store.new_drop": "New Drop Alert!",
  "store.reward_unlocked": "Reward Unlocked!",
  "store.wishlist_back_in_stock": "Back In Stock!",
  "store.digital_product_ready": "Digital Product Ready!",
};

interface SendNotificationBody {
  userId: string;
  notificationType: StoreNotificationType;
  category?: StoreCategory;
  variables?: Record<string, any>;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaTarget: string;
  rewardCoinsEarned?: number;
  priority?: "HIGH" | "NORMAL" | "LOW";
  channels?: Channel[];
  ttlHours?: number;
}

function fillTemplate(tpl: string, variables: Record<string, any>): string {
  return tpl.replace(/\{([^}]+)\}/g, (match, key) => {
    if (key in variables) {
      return String(variables[key] ?? "");
    }
    console.warn(`[fillTemplate] Missing template variable: ${key}`);
    return "";
  });
}

export async function POST(req: NextRequest) {
  try {
    const data: SendNotificationBody = await req.json();

    if (!data.userId || !data.notificationType) {
      return NextResponse.json(
        { error: "Missing required fields: userId, notificationType" },
        { status: 400 }
      );
    }

    const config = STORE_NOTIFICATION_CONFIG[data.notificationType];
    if (!config) {
      return NextResponse.json(
        { error: `Unknown notificationType: ${data.notificationType}` },
        { status: 400 }
      );
    }

    const channels = data.channels ?? config.channels;
    const priority = data.priority ?? config.priority;
    const ttlHours = data.ttlHours ?? config.ttlHours;

    let body = data.body;
    let ctaLabel = data.ctaLabel;
    let matchedTemplateSK: string | undefined;

    if (!body) {
      // Query template from DB
      const qRes = await client.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          FilterExpression: "approval_status = :status",
          ExpressionAttributeValues: {
            ":pk": `TYPE#${data.notificationType}`,
            ":sk": "MSG#",
            ":status": "autonomous_eligible",
          },
        })
      );

      const templates = qRes.Items || [];
      if (templates.length === 0) {
        return NextResponse.json(
          { error: `No autonomous_eligible template found for type: ${data.notificationType}` },
          { status: 500 }
        );
      }

      // Pick first match
      const template = templates[0];
      matchedTemplateSK = template.SK as string;

      const variables = data.variables || {};
      const rewardCoins = data.rewardCoinsEarned ?? variables.reward_coins;
      let rewardCoinsLine = "";
      if (rewardCoins && Number(rewardCoins) > 0) {
        rewardCoinsLine = ` You just banked ${rewardCoins} coins 🪙`;
      }

      const resolvedVars = {
        ...variables,
        reward_coins_line: rewardCoinsLine
      };

      body = fillTemplate(template.body_template || "", resolvedVars);
      ctaLabel = data.ctaLabel || fillTemplate(template.cta_label_template || "", resolvedVars);
    } else {
      ctaLabel = data.ctaLabel || "View Details";
    }

    const title = data.title || DEFAULT_TITLES[data.notificationType] || "Notification Alert";
    const sentAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const notificationId = `ntf_${randomUUID().slice(0, 8)}`;

    const item: Record<string, unknown> = {
      PK: `USER#${data.userId}`,
      SK: `NOTIF#${sentAt}#${notificationId}`,
      entity_type: "NOTIFICATION",
      notification_id: notificationId,
      user_id: data.userId,
      notification_type: data.notificationType,
      category: data.category ?? null,
      title,
      body,
      cta_label: ctaLabel,
      cta_target: data.ctaTarget,
      reward_coins_earned: data.rewardCoinsEarned ?? null,
      priority,
      channels_sent: channels,
      sent_at: sentAt,
      read: false,
      isRead: false,
      dismissed: false,
      response_given: false,
      cta_clicked: false,
      GSI1PK: `TYPE#${data.notificationType}`,
      GSI1SK: `SENTAT#${sentAt}#${notificationId}`,
      GSI2PK: `USER#${data.userId}#UNREAD`,
      GSI2SK: `SENTAT#${sentAt}#${notificationId}`,
    };

    if (ttlHours !== null) {
      item.expires_at = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    }

    await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

    // Update message template usage metrics asynchronously
    if (matchedTemplateSK) {
      client.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `TYPE#${data.notificationType}`,
            SK: matchedTemplateSK,
          },
          UpdateExpression: "ADD usage_count :one SET last_used_at = :now",
          ExpressionAttributeValues: {
            ":one": 1,
            ":now": Date.now(),
          },
        })
      ).catch(err => {
        console.warn(`[StoreNotification POST] Failed to update template usage count:`, err);
      });
    }

    // Sync to Firestore notifications collection for fallback support
    try {
      const { db } = require("@/lib/firebaseAdmin");
      if (db) {
        await db.collection("notifications").doc(notificationId).set({
          id: notificationId,
          recipientEmail: data.userId,
          recipientUid: data.userId,
          type: data.notificationType,
          message: body,
          title,
          isRead: false,
          createdAt: Date.now(),
          category: data.category || "store",
          ctaTarget: data.ctaTarget,
          ctaLabel,
        });
      }
    } catch (fbErr) {
      console.warn("Failed to sync store notification to Firestore:", fbErr);
    }

    return NextResponse.json(
      { success: true, notificationId, channelsSent: channels },
      { status: 201 }
    );
  } catch (err) {
    console.error("Failed to send store notification:", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}