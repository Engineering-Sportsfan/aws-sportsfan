// backend/lib/notifications/storeNotifications.ts — Store & Commerce Notification Dispatcher
import { docClient } from "@/lib/dynamodb";
import { TABLES, getFirestoreCollection } from "@/lib/tableNames";
import { db } from "@/lib/firebaseAdmin";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const TABLE_NAME = TABLES.Notifications;

export type StoreNotificationType =
  | "store.order_confirmed"
  | "store.order_shipped"
  | "store.expert_session_booked"
  | "store.session_reminder"
  | "store.noc_approval_status"
  | "store.new_drop"
  | "store.reward_unlocked"
  | "store.wishlist_back_in_stock"
  | "store.digital_product_ready"
  | "store.auction_starting_soon"
  | "store.auction_ending_soon"
  | "store.auction_outbid"
  | "store.auction_won"
  | "store.auction_lost"
  | (string & {});

export type StoreCategory =
  | "coaches"
  | "experiences"
  | "events"
  | "auctions"
  | "athletes"
  | "merch"
  | "brands"
  | "digital"
  | "members"
  | (string & {});

export type Channel = "in_app" | "email" | "web_push";

export const STORE_NOTIFICATION_CONFIG: Record<
  string,
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
  "store.auction_starting_soon": { channels: ["in_app", "email"], priority: "NORMAL", ttlHours: 1 },
  "store.auction_ending_soon": { channels: ["in_app", "web_push"], priority: "HIGH", ttlHours: 5 / 60 },
  "store.auction_outbid": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: 2 },
  "store.auction_won": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: null },
  "store.auction_lost": { channels: ["in_app", "email"], priority: "LOW", ttlHours: 48 },
};

export const DEFAULT_STORE_TITLES: Record<string, string> = {
  "store.order_confirmed": "Order Confirmed!",
  "store.order_shipped": "Order Shipped!",
  "store.expert_session_booked": "Expert Session Booked!",
  "store.session_reminder": "Session Reminder",
  "store.noc_approval_status": "AFI Status Update",
  "store.new_drop": "New Drop Alert!",
  "store.reward_unlocked": "Reward Unlocked!",
  "store.wishlist_back_in_stock": "Back In Stock!",
  "store.digital_product_ready": "Digital Product Ready!",
  "store.auction_starting_soon": "Auction Starting Soon!",
  "store.auction_ending_soon": "Auction Ending Soon!",
  "store.auction_outbid": "Outbid Alert!",
  "store.auction_won": "You Won the Auction! 🏆",
  "store.auction_lost": "Auction Ended",
};

export interface SendStoreNotificationInput {
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

export function fillTemplate(tpl: string, variables: Record<string, any>): string {
  return tpl.replace(/\{([^}]+)\}/g, (match, key) => {
    if (key in variables) {
      return String(variables[key] ?? "");
    }
    return "";
  });
}

/**
 * Dispatches a store notification directly to DynamoDB and syncs to Firestore.
 */
export async function dispatchStoreNotification(
  data: SendStoreNotificationInput
): Promise<{ success: boolean; notificationId: string; channelsSent: Channel[]; recipientCount: number }> {
  if (!data.userId || !data.notificationType) {
    throw new Error("Missing required fields: userId, notificationType");
  }

  const config = STORE_NOTIFICATION_CONFIG[data.notificationType] || {
    channels: ["in_app"],
    priority: "NORMAL",
    ttlHours: 48,
  };

  const channels = data.channels ?? config.channels;
  const priority = data.priority ?? config.priority;
  const ttlHours = data.ttlHours ?? config.ttlHours;

  let body = data.body;
  let ctaLabel = data.ctaLabel;

  if (!body) {
    // Fallback template matching
    let bodyTpl = "";
    let ctaLabelTpl = "";

    if (data.notificationType === "store.auction_starting_soon") {
      bodyTpl = "{product_name} is starting in 1 hour! Get ready to place your bids. 🔨";
      ctaLabelTpl = "View Auction";
    } else if (data.notificationType === "store.auction_ending_soon") {
      bodyTpl = "{product_name} is ending in 5 minutes! Place your final bid now. ⏱️";
      ctaLabelTpl = "Bid Now";
    } else if (data.notificationType === "store.auction_outbid") {
      bodyTpl = "You've been outbid on {product_name}! Place a higher bid now to stay in the game. 🔨";
      ctaLabelTpl = "Rebid Now";
    } else if (data.notificationType === "store.auction_won") {
      bodyTpl = "Congratulations! You won the auction for {product_name}. Click below to complete your checkout. 🏆";
      ctaLabelTpl = "Checkout";
    } else if (data.notificationType === "store.auction_lost") {
      bodyTpl = "The auction for {product_name} has ended. You didn't win this time, but click below to see similar items.";
      ctaLabelTpl = "See Similar Items";
    } else {
      bodyTpl = `Store update for ${data.notificationType}`;
      ctaLabelTpl = "View Store";
    }

    const variables = data.variables || {};
    const rewardCoins = data.rewardCoinsEarned ?? variables.reward_coins;
    let rewardCoinsLine = "";
    if (rewardCoins && Number(rewardCoins) > 0) {
      rewardCoinsLine = ` You just banked ${rewardCoins} coins 🪙`;
    }

    const resolvedVars = { ...variables, reward_coins_line: rewardCoinsLine };
    body = fillTemplate(bodyTpl, resolvedVars);
    ctaLabel = data.ctaLabel || fillTemplate(ctaLabelTpl, resolvedVars);
  } else {
    ctaLabel = data.ctaLabel || "View Details";
  }

  const title = data.title || DEFAULT_STORE_TITLES[data.notificationType] || "Store Alert";
  const sentAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const notificationId = `ntf_${randomUUID().slice(0, 8)}`;

  const cleanUser = String(data.userId).replace(/^USER#/, "").trim();
  const userIds = [cleanUser];

  for (const uId of userIds) {
    const item: Record<string, unknown> = {
      PK: `USER#${uId}`,
      SK: `NOTIF#${sentAt}#${notificationId}`,
      entity_type: "NOTIFICATION",
      notification_type: data.notificationType,
      title,
      body,
      message: body,
      cta_label: ctaLabel,
      cta_target: data.ctaTarget,
      priority,
      channels_sent: channels,
      sent_at: sentAt,
      createdAt: Date.now(),
      read: false,
      isRead: false,
      response_given: false,
      cta_clicked: false,
      category: data.category || "store",
      feature_area: "store",
      GSI1PK: `TYPE#${data.notificationType}`,
      GSI1SK: `SENTAT#${sentAt}#${notificationId}`,
      GSI2PK: `USER#${uId}#UNREAD`,
      GSI2SK: `SENTAT#${sentAt}#${notificationId}`,
    };

    if (ttlHours != null) {
      item.expires_at = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    }

    try {
      await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    } catch (err) {
      console.warn("[dispatchStoreNotification] DynamoDB write notice:", err);
    }

    if (db) {
      try {
        const docId = `${notificationId}_${uId}`;
        await db
          .collection(getFirestoreCollection("notifications"))
          .doc(docId)
          .set({
            id: notificationId,
            recipientEmail: uId,
            recipientUid: uId,
            type: data.notificationType,
            notification_type: data.notificationType,
            title,
            body,
            message: body,
            cta_label: ctaLabel,
            cta_target: data.ctaTarget,
            priority,
            read: false,
            isRead: false,
            createdAt: Date.now(),
            sent_at: sentAt,
            category: "store",
            feature_area: "store",
          });
      } catch (fsErr) {
        console.warn("[dispatchStoreNotification] Firestore fallback notice:", fsErr);
      }
    }
  }

  return {
    success: true,
    notificationId,
    channelsSent: channels,
    recipientCount: userIds.length,
  };
}
