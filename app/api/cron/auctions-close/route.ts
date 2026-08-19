// app/api/cron/auctions-close/route.ts — Migrated to AWS DynamoDB (StoreAndCommerce Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { StoreService } from "@/app/api/v2/store/store.service";
import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export const dynamic = "force-dynamic";

const storeService = new StoreService(db);

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`⏰ Cron auctions-close run at ${new Date().toISOString()}`);

    const now = new Date();
    let endedAuctions: any[] = [];

    // 1. Try DynamoDB scan
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "StoreAndCommerce",
          FilterExpression: "begins_with(entityId, :pPrefix) AND (category = :c1 OR category = :c2) AND #st = :status",
          ExpressionAttributeNames: {
            "#st": "status",
          },
          ExpressionAttributeValues: {
            ":pPrefix": "PRODUCT#",
            ":c1": "Auctions",
            ":c2": "auctions",
            ":status": "active",
          },
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        endedAuctions = scanRes.Items.filter((item) => {
          const endsAt = item.endsAt ? new Date(item.endsAt) : null;
          return endsAt && endsAt <= now;
        }).map((item) => ({
          id: item.id || (item.entityId as string).replace(/^PRODUCT#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[cron/auctions-close] DynamoDB scan notice:", e);
    }

    // 2. Fallback to Firestore
    if (endedAuctions.length === 0 && db) {
      const snapshot1 = await db.collection("storeProducts").where("category", "==", "Auctions").get();
      const snapshot2 = await db.collection("storeProducts").where("category", "==", "auctions").get();

      const docs = [...snapshot1.docs, ...snapshot2.docs];
      const seen = new Set<string>();
      endedAuctions = docs.filter((doc) => {
        if (seen.has(doc.id)) return false;
        seen.add(doc.id);
        const data = doc.data();
        const endsAt = data.endsAt ? (data.endsAt.toDate ? data.endsAt.toDate() : new Date(data.endsAt)) : null;
        return data.status === "active" && endsAt && endsAt <= now;
      }).map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    console.log(`Found ${endedAuctions.length} ended auctions to process.`);

    const results: any[] = [];

    for (const product of endedAuctions) {
      const productId = product.id;

      try {
        const currentBidPaise = product.currentBidPaise || product.pricePaise || 0;
        const reservePrice = product.reservePrice || 0;
        const highestBidderId = product.highestBidderId || null;

        let finalStatus = "reserve_not_met";
        let winnerId = null;
        let winnerPaymentStatus = null;
        let paymentDeadline = null;

        if (currentBidPaise >= reservePrice && highestBidderId) {
          if (highestBidderId === "legacy_unclaimed") {
            finalStatus = "unclaimed_reserve_met";
            winnerId = null;
          } else {
            finalStatus = "closed";
            winnerId = highestBidderId;
            winnerPaymentStatus = "pending";
            const deadlineHours = product.paymentDeadlineHours || 24;
            paymentDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();
          }
        }

        const updateData: any = {
          ...product,
          status: finalStatus,
          winnerId,
          ...(winnerPaymentStatus && { winnerPaymentStatus }),
          ...(paymentDeadline && { paymentDeadline }),
          updatedAt: Date.now(),
        };

        const dynamoItem = {
          entityId: `PRODUCT#${productId}`,
          sk: `PRODUCT#${productId}`,
          ...updateData,
        };

        await dualWrite("storeProducts", productId, "StoreAndCommerce", dynamoItem);

        // Trigger Won & Lost Notifications
        try {
          const origin = req.nextUrl.origin;
          
          if (winnerId) {
            console.log(`🏆 Auction [${productId}] won by User [${winnerId}] at ₹${currentBidPaise / 100}.`);
            fetch(`${origin}/api/notifications/store`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: winnerId,
                notificationType: "store.auction_won",
                ctaTarget: "/MainModules/AtheleteStore/StoreAuctions",
                variables: {
                  product_name: product.title || "Auction Item"
                }
              })
            }).catch(err => console.warn("[auctions-close] Failed to trigger won notification:", err));
          }

          // Fetch all bids to notify users who lost (try DynamoDB first, fallback to Firestore)
          let bidderIds = new Set<string>();
          try {
            const bidsRes = await docClient.send(new QueryCommand({
              TableName: "StoreAndCommerce",
              KeyConditionExpression: "entityId = :eid AND begins_with(sk, :bidPrefix)",
              ExpressionAttributeValues: {
                ":eid": `PRODUCT#${productId}`,
                ":bidPrefix": "BID#"
              }
            }));
            if (bidsRes.Items && bidsRes.Items.length > 0) {
              bidsRes.Items.forEach(item => {
                if (item.userId && item.userId !== winnerId && item.userId !== "legacy" && item.userId !== "legacy_unclaimed") {
                  bidderIds.add(item.userId);
                }
              });
            }
          } catch (dynBidsErr) {
            console.warn("[auctions-close] DynamoDB bids fetch failed:", dynBidsErr);
          }

          if (bidderIds.size === 0) {
            const bidsSnap = await db.collection("storeProducts").doc(productId).collection("bids").get();
            bidsSnap.docs.forEach(doc => {
              const bid = doc.data();
              if (bid.userId && bid.userId !== winnerId && bid.userId !== "legacy" && bid.userId !== "legacy_unclaimed") {
                bidderIds.add(bid.userId);
              }
            });
          }

          for (const loserId of bidderIds) {
            fetch(`${origin}/api/notifications/store`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: loserId,
                notificationType: "store.auction_lost",
                ctaTarget: "/MainModules/AtheleteStore/StoreAuctions",
                variables: {
                  product_name: product.title || "Auction Item"
                }
              })
            }).catch(err => console.warn("[auctions-close] Failed to trigger lost notification for:", loserId, err));
          }
        } catch (notifErr) {
          console.warn("[auctions-close] Notification dispatch failed:", notifErr);
        }

        results.push({
          productId,
          success: true,
          finalStatus,
          winnerId,
          winnerPaymentStatus,
          paymentDeadline,
          currentBidPaise,
          reservePrice,
        });
      } catch (err: any) {
        console.error(`❌ Error closing auction [${productId}]:`, err);
        results.push({ productId, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: endedAuctions.length,
      results,
    });
  } catch (error: any) {
    console.error("Cron auctions-close error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process cron auctions-close." },
      { status: 500 }
    );
  }
}
