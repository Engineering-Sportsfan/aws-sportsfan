// app/api/cron/auction-reminders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Timestamp } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`⏰ Cron auction-reminders run at ${new Date().toISOString()}`);

    const now = Date.now();
    let activeAuctions: any[] = [];
    let fetchedFromDynamo = false;

    // 1. Scan DynamoDB StoreAndCommerce for active auctions
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "StoreAndCommerce",
          FilterExpression: "begins_with(entityId, :p) AND category = :cat AND #status = :active",
          ExpressionAttributeNames: {
            "#status": "status",
          },
          ExpressionAttributeValues: {
            ":p": "PRODUCT#",
            ":cat": "Auctions",
            ":active": "active",
          },
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        activeAuctions = scanRes.Items.map((item) => ({
          id: item.id || (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item,
        }));
        fetchedFromDynamo = true;
      }
    } catch (e) {
      console.warn("[cron/auction-reminders] DynamoDB scan notice:", e);
    }

    // 2. Fallback to Firestore
    if (!fetchedFromDynamo || activeAuctions.length === 0) {
      if (db) {
        const snapshot1 = await db.collection("storeProducts").where("category", "==", "Auctions").get();
        const snapshot2 = await db.collection("storeProducts").where("category", "==", "auctions").get();

        const docs = [...snapshot1.docs, ...snapshot2.docs];
        const seen = new Set<string>();
        activeAuctions = docs
          .filter((doc) => {
            if (seen.has(doc.id)) return false;
            seen.add(doc.id);
            const data = doc.data();
            return data.status === "active";
          })
          .map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    }

    console.log(`Found ${activeAuctions.length} active auctions to process for reminders.`);

    const results: any[] = [];
    const origin = req.nextUrl.origin;

    for (const product of activeAuctions) {
      const productId = product.id;
      const title = product.title || "Unnamed Auction";
      const isApproved = product.governance_state === "approved";

      if (!isApproved) {
        continue; // Only notify about approved auctions
      }

      let startingSoonSent = product.startingSoonNotificationSent ?? false;
      let endingSoonSent = product.endingSoonNotificationSent ?? false;

      const startsAt = product.createdAt
        ? (typeof product.createdAt.toDate === "function"
            ? product.createdAt.toDate().getTime()
            : new Date(product.createdAt).getTime())
        : now;
      const endsAt = product.endsAt
        ? (typeof product.endsAt.toDate === "function"
            ? product.endsAt.toDate().getTime()
            : new Date(product.endsAt).getTime())
        : null;

      let triggeredStarting = false;
      let triggeredEnding = false;

      try {
        // T-1h Starting soon logic
        if (!startingSoonSent && now >= startsAt - 60 * 60 * 1000) {
          console.log(`Triggering starting-soon notification for auction: ${title}`);
          await triggerAuctionNotification(origin, title, "store.auction_starting_soon");
          startingSoonSent = true;
          triggeredStarting = true;
        }

        // T-5m Ending soon logic
        if (!endingSoonSent && endsAt && now >= endsAt - 5 * 60 * 1000 && now < endsAt) {
          console.log(`Triggering ending-soon notification for auction: ${title}`);
          await triggerAuctionNotification(origin, title, "store.auction_ending_soon");
          endingSoonSent = true;
          triggeredEnding = true;
        }

        if (triggeredStarting || triggeredEnding) {
          const updateData = {
            ...product,
            startingSoonNotificationSent: startingSoonSent,
            endingSoonNotificationSent: endingSoonSent,
            updatedAt: Date.now(),
          };

          // Update in DynamoDB
          try {
            await docClient.send(
              new PutCommand({
                TableName: "StoreAndCommerce",
                Item: {
                  ...updateData,
                  entityId: `PRODUCT#${productId}`,
                  sk: `PRODUCT#${productId}`,
                },
              })
            );
          } catch (dynErr) {
            console.warn(`[cron/auction-reminders] DynamoDB update failed for ${productId}:`, dynErr);
          }

          // Update in Firestore
          try {
            if (db) {
              await db.collection("storeProducts").doc(productId).set(
                {
                  startingSoonNotificationSent: startingSoonSent,
                  endingSoonNotificationSent: endingSoonSent,
                  updatedAt: Date.now(),
                },
                { merge: true }
              );
            }
          } catch (fsErr) {
            console.warn(`[cron/auction-reminders] Firestore update failed for ${productId}:`, fsErr);
          }

          results.push({
            productId,
            title,
            triggeredStarting,
            triggeredEnding,
          });
        }
      } catch (err: any) {
        console.error(`❌ Error processing reminders for auction [${productId}]:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: activeAuctions.length,
      triggeredReminders: results,
    });
  } catch (error: any) {
    console.error("Cron auction-reminders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process cron auction-reminders." },
      { status: 500 }
    );
  }
}

async function triggerAuctionNotification(origin: string, auctionTitle: string, notificationType: string) {
  try {
    const bodyTpl = notificationType === "store.auction_starting_soon"
      ? `${auctionTitle} is starting in 1 hour! Get ready to place your bids. 🔨`
      : `${auctionTitle} is ending in 5 minutes! Place your final bid now. ⏱️`;

    const ctaLabel = notificationType === "store.auction_starting_soon" ? "View Auction" : "Bid Now";
    const title = notificationType === "store.auction_starting_soon" ? "Auction Starting Soon!" : "Auction Ending Soon!";
    
    const sentAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const notificationId = `ntf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const priority = notificationType === "store.auction_ending_soon" ? "HIGH" : "NORMAL";
    const channels = notificationType === "store.auction_ending_soon" ? ["in_app", "web_push"] : ["in_app", "email"];
    const ttlHours = notificationType === "store.auction_ending_soon" ? 5 / 60 : 1;

    // 1. Put in DynamoDB first (Crucial instruction!)
    const item: Record<string, unknown> = {
      PK: `USER#all_users`,
      SK: `NOTIF#${sentAt}#${notificationId}`,
      entity_type: "NOTIFICATION",
      notification_id: notificationId,
      user_id: "all_users",
      notification_type: notificationType,
      category: "auctions",
      title,
      body: bodyTpl,
      cta_label: ctaLabel,
      cta_target: "/MainModules/AtheleteStore/StoreAuctions",
      reward_coins_earned: null,
      priority,
      channels_sent: channels,
      sent_at: sentAt,
      read: false,
      isRead: false,
      dismissed: false,
      response_given: false,
      cta_clicked: false,
      GSI1PK: `TYPE#${notificationType}`,
      GSI1SK: `SENTAT#${sentAt}#${notificationId}`,
      GSI2PK: `USER#all_users#UNREAD`,
      GSI2SK: `SENTAT#${sentAt}#${notificationId}`,
    };

    if (ttlHours !== null) {
      item.expires_at = Math.floor(Date.now() / 1000) + ttlHours * 3600;
    }

    try {
      await docClient.send(new PutCommand({ TableName: "sf360-notifications", Item: item }));
    } catch (dbErr) {
      console.error(`[triggerAuctionNotification] DynamoDB write failed for all_users:`, dbErr);
    }

    // 2. Sync to Firestore (Dual-write)
    try {
      await db.collection("notifications").doc(`${notificationId}_all_users`).set({
        id: `${notificationId}_all_users`,
        recipientEmail: "all_users",
        recipientUid: "all_users",
        type: notificationType,
        message: bodyTpl,
        title,
        isRead: false,
        createdAt: Date.now(),
        category: "store",
        ctaTarget: "/MainModules/AtheleteStore/StoreAuctions",
        ctaLabel,
      });
    } catch (fbErr) {
      console.warn(`[triggerAuctionNotification] Firestore sync failed for all_users:`, fbErr);
    }

    console.log(`[triggerAuctionNotification] Successfully sent ${notificationType} to all_users (DynamoDB updated first).`);
  } catch (err) {
    console.error(`[triggerAuctionNotification] Error executing direct notification trigger:`, err);
  }
}
