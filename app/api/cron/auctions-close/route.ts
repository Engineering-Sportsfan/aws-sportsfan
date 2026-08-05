// app/api/cron/auctions-close/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet Table)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { StoreService } from "@/app/api/v2/store/store.service";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";

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
          TableName: "GamificationAndWallet",
          FilterExpression: "begins_with(userId, :pPrefix) AND (category = :c1 OR category = :c2) AND #st = :status",
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
          id: item.id || (item.userId as string).replace(/^PRODUCT#/, ""),
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
          userId: `PRODUCT#${productId}`,
          sk: "PRODUCT#META",
          ...updateData,
        };

        await dualWrite("storeProducts", productId, "GamificationAndWallet", dynamoItem);

        if (winnerId) {
          console.log(`🏆 Auction [${productId}] won by User [${winnerId}] at ₹${currentBidPaise / 100}.`);
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
