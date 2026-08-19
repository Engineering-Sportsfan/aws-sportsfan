import fs from 'fs';
import path from 'path';

// 1. Load env files manually
const envLocalPath = path.resolve(__dirname, '../.env.local');
const envPath = path.resolve(__dirname, '../.env');

const loadEnvFile = (filePath: string) => {
  if (fs.existsSync(filePath)) {
    console.log("Loading env from:", filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const firstEq = line.indexOf('=');
      if (firstEq === -1) return;
      const key = line.slice(0, firstEq).trim();
      let val = line.slice(firstEq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      } else if (val.startsWith("'") && val.endsWith("'")) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\n/g, '\n');
      process.env[key] = val;
    });
  }
};

loadEnvFile(envPath);
loadEnvFile(envLocalPath);

// Import docClient and DynamoDB Commands
import { docClient } from '../lib/dynamodb';
import { PutCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = "sf360-notifications";

interface MessageTemplate {
  PK: string;
  SK: string;
  entity_type: string;
  sport_tag: string;
  tone_tag: "cheeky" | "hype" | "warm" | "reverent";
  body_template: string;
  cta_label_template: string;
  approval_status: string;
  usage_count: number;
  performance_score: number | null;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  GSI2SK: string;
}

const templates: { notificationType: string; messageId: string; tone: "cheeky" | "hype" | "warm" | "reverent"; bodyTemplate: string; ctaLabelTemplate: string }[] = [
  {
    notificationType: "store.order_confirmed",
    messageId: "msg_order_confirmed_hype_01",
    tone: "hype",
    bodyTemplate: "{product_name} is yours! 🏆{reward_coins_line}",
    ctaLabelTemplate: "Track Your Order"
  },
  {
    notificationType: "store.order_shipped",
    messageId: "msg_order_shipped_hype_01",
    tone: "hype",
    bodyTemplate: "{product_name} is on the move — it's heading your way at full sprint! 🚚",
    ctaLabelTemplate: "Track Shipment"
  },
  {
    notificationType: "store.expert_session_booked",
    messageId: "msg_expert_session_booked_warm_01",
    tone: "warm",
    bodyTemplate: "Locked in! Your session with {expert_name} is set for {session_date}. Don't leave them waiting. 🎯",
    ctaLabelTemplate: "View Booking"
  },
  {
    notificationType: "store.noc_approval_status",
    messageId: "msg_noc_approval_status_reverent_01",
    tone: "reverent",
    bodyTemplate: "Update on \"{product_title}\" — it's been {status_word} by AFI. 📋",
    ctaLabelTemplate: "See Details"
  },
  {
    notificationType: "store.new_drop",
    messageId: "msg_new_drop_cheeky_01",
    tone: "cheeky",
    bodyTemplate: "{brand_name} just dropped something fresh. First come, first served — you know the drill. 🔥",
    ctaLabelTemplate: "Shop the Drop"
  },
  {
    notificationType: "store.digital_product_ready",
    messageId: "msg_digital_product_ready_hype_01",
    tone: "hype",
    bodyTemplate: "\"{product_title}\" just landed in your library. Game time. 📲",
    ctaLabelTemplate: "Open Library"
  },
  {
    notificationType: "store.session_reminder",
    messageId: "msg_session_reminder_warm_01",
    tone: "warm",
    bodyTemplate: "Heads up — your session with {expert_name} is coming up on {session_date}. Get ready. ⏱",
    ctaLabelTemplate: "View Session"
  },
  {
    notificationType: "store.auction_starting_soon",
    messageId: "msg_auction_starting_soon_hype_01",
    tone: "hype",
    bodyTemplate: "{product_name} is starting in 1 hour! Get ready to place your bids. 🔨",
    ctaLabelTemplate: "View Auction"
  },
  {
    notificationType: "store.auction_ending_soon",
    messageId: "msg_auction_ending_soon_hype_01",
    tone: "hype",
    bodyTemplate: "{product_name} is ending in 5 minutes! Place your final bid now. ⏱️",
    ctaLabelTemplate: "Bid Now"
  },
  {
    notificationType: "store.auction_outbid",
    messageId: "msg_auction_outbid_hype_01",
    tone: "hype",
    bodyTemplate: "You've been outbid on {product_name}! Place a higher bid now to stay in the game. 🔨",
    ctaLabelTemplate: "Rebid Now"
  },
  {
    notificationType: "store.auction_won",
    messageId: "msg_auction_won_hype_01",
    tone: "hype",
    bodyTemplate: "Congratulations! You won the auction for {product_name}. Click below to complete your checkout. 🏆",
    ctaLabelTemplate: "Checkout"
  },
  {
    notificationType: "store.auction_lost",
    messageId: "msg_auction_lost_hype_01",
    tone: "hype",
    bodyTemplate: "The auction for {product_name} has ended. You didn't win this time, but click below to see similar items.",
    ctaLabelTemplate: "See Similar Items"
  }
];

async function seed() {
  console.log("🌱 Starting Seeding of Message Templates into", TABLE_NAME);
  let successCount = 0;
  let failCount = 0;

  for (const t of templates) {
    const pk = `TYPE#${t.notificationType}`;
    const sk = `MSG#${t.messageId}`;

    const item: MessageTemplate = {
      PK: pk,
      SK: sk,
      entity_type: "MESSAGE_TEMPLATE",
      sport_tag: "general",
      tone_tag: t.tone,
      body_template: t.bodyTemplate,
      cta_label_template: t.ctaLabelTemplate,
      approval_status: "autonomous_eligible",
      usage_count: 0,
      performance_score: null,
      GSI1PK: "STATUS#autonomous_eligible",
      GSI1SK: `TYPE#${t.notificationType}#MSG#${t.messageId}`,
      GSI2PK: `SPORT#general#TONE#${t.tone}`,
      GSI2SK: `TYPE#${t.notificationType}`
    };

    try {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
      }));
      console.log(`✅ Seeded template for ${t.notificationType} (SK: ${sk})`);
      successCount++;
    } catch (err) {
      console.error(`❌ Failed to seed template for ${t.notificationType}:`, err);
      failCount++;
    }
  }

  console.log(`\n🎉 Seeding complete. Successes: ${successCount}, Failures: ${failCount}`);
}

seed().catch(err => {
  console.error("Fatal error during seeding:", err);
  process.exit(1);
});
