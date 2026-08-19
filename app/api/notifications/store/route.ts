import { NextRequest, NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
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
  | "store.digital_product_ready"
  | "store.auction_starting_soon"
  | "store.auction_ending_soon"
  | "store.auction_outbid"
  | "store.auction_won"
  | "store.auction_lost";

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
  "store.auction_starting_soon": { channels: ["in_app", "email"], priority: "NORMAL", ttlHours: 1 },
  "store.auction_ending_soon": { channels: ["in_app", "web_push"], priority: "HIGH", ttlHours: 5 / 60 },
  "store.auction_outbid": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: 2 },
  "store.auction_won": { channels: ["in_app", "email"], priority: "HIGH", ttlHours: null },
  "store.auction_lost": { channels: ["in_app", "email"], priority: "LOW", ttlHours: 48 },
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
  "store.auction_starting_soon": "Auction Starting Soon!",
  "store.auction_ending_soon": "Auction Ending Soon!",
  "store.auction_outbid": "Outbid Alert!",
  "store.auction_won": "You Won the Auction! 🏆",
  "store.auction_lost": "Auction Ended",
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
      let bodyTpl = "";
      let ctaLabelTpl = "";

      if (templates.length > 0) {
        const template = templates[0];
        matchedTemplateSK = template.SK as string;
        bodyTpl = template.body_template || "";
        ctaLabelTpl = template.cta_label_template || "";
      } else {
        // Fallback templates for store.auction_starting_soon, store.auction_ending_soon, and new auction types
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
          return NextResponse.json(
            { error: `No autonomous_eligible template found for type: ${data.notificationType}` },
            { status: 500 }
          );
        }
      }

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

      body = fillTemplate(bodyTpl, resolvedVars);
      ctaLabel = data.ctaLabel || fillTemplate(ctaLabelTpl, resolvedVars);
    } else {
      ctaLabel = data.ctaLabel || "View Details";
    }

    const title = data.title || DEFAULT_TITLES[data.notificationType] || "Notification Alert";
    const sentAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const notificationId = `ntf_${randomUUID().slice(0, 8)}`;

    // Resolve target user(s)
    let userIds: string[] = [];
    const targetUserId = String(data.userId);
    if (targetUserId.toLowerCase() === "all_users" || targetUserId.toLowerCase() === "all") {
      userIds = [targetUserId.toLowerCase()];
    } else {
      userIds = [targetUserId];
    }

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: "No target users resolved for this notification request." },
        { status: 400 }
      );
    }

    for (const uId of userIds) {
      const item: Record<string, unknown> = {
        PK: `USER#${uId}`,
        SK: `NOTIF#${sentAt}#${notificationId}`,
        entity_type: "NOTIFICATION",
        notification_id: notificationId,
        user_id: uId,
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
        GSI2PK: `USER#${uId}#UNREAD`,
        GSI2SK: `SENTAT#${sentAt}#${notificationId}`,
      };

      if (ttlHours !== null) {
        item.expires_at = Math.floor(Date.now() / 1000) + ttlHours * 3600;
      }

      await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

      // Sync to Firestore notifications collection for fallback support
      try {
        const { db } = require("@/lib/firebaseAdmin");
        if (db) {
          await db.collection("notifications").doc(`${notificationId}_${uId}`).set({
            id: `${notificationId}_${uId}`,
            recipientEmail: uId,
            recipientUid: uId,
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
    }

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

    return NextResponse.json(
      { success: true, notificationId, channelsSent: channels, recipientCount: userIds.length },
      { status: 201 }
    );
  } catch (err) {
    console.error("Failed to send store notification:", err);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}