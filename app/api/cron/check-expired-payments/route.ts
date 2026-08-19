// app/api/cron/check-expired-payments/route.ts — Migrated to AWS DynamoDB (GamificationAndWallet & IdentityAndAccess Tables)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";
import { docClient } from "@/lib/dynamodb";
import { dualWrite } from "@/lib/dualWrite";
import { ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`⏰ Cron check-expired-payments run at ${new Date().toISOString()}`);

    const now = new Date();
    let expiredPaymentAuctions: any[] = [];

    // 1. Try DynamoDB
    try {
      const scanRes = await docClient.send(
        new ScanCommand({
          TableName: "GamificationAndWallet",
          FilterExpression: "begins_with(userId, :pPrefix) AND (category = :c1 OR category = :c2) AND winnerPaymentStatus = :ps",
          ExpressionAttributeValues: {
            ":pPrefix": "PRODUCT#",
            ":c1": "Auctions",
            ":c2": "auctions",
            ":ps": "pending",
          },
        })
      );

      if (scanRes.Items && scanRes.Items.length > 0) {
        expiredPaymentAuctions = scanRes.Items.filter((item) => {
          const deadline = item.paymentDeadline ? new Date(item.paymentDeadline) : null;
          return deadline && deadline <= now;
        }).map((item) => ({
          id: item.id || (item.userId as string).replace(/^PRODUCT#/, ""),
          ...item,
        }));
      }
    } catch (e) {
      console.warn("[cron/check-expired-payments] DynamoDB notice:", e);
    }

    // 2. Fallback to Firestore
    if (expiredPaymentAuctions.length === 0 && db) {
      const snapshot1 = await db.collection("storeProducts").where("category", "==", "Auctions").get();
      const snapshot2 = await db.collection("storeProducts").where("category", "==", "auctions").get();

      const docs = [...snapshot1.docs, ...snapshot2.docs];
      const seen = new Set<string>();
      expiredPaymentAuctions = docs.filter((doc) => {
        if (seen.has(doc.id)) return false;
        seen.add(doc.id);
        const data = doc.data();
        const deadline = data.paymentDeadline ? (data.paymentDeadline.toDate ? data.paymentDeadline.toDate() : new Date(data.paymentDeadline)) : null;
        return data.winnerPaymentStatus === "pending" && deadline && deadline <= now;
      }).map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    console.log(`Found ${expiredPaymentAuctions.length} auctions with expired payments.`);

    const results: any[] = [];

    for (const product of expiredPaymentAuctions) {
      const productId = product.id;

      try {
        const currentWinnerId = product.winnerId;
        const reservePrice = product.reservePrice || 0;

        const forfeitedBidders = Array.isArray(product.forfeitedBidders)
          ? [...product.forfeitedBidders]
          : [];

        if (currentWinnerId && !forfeitedBidders.includes(currentWinnerId)) {
          forfeitedBidders.push(currentWinnerId);
        }

        let bids: any[] = [];

        if (db) {
          const bidsCol = db.collection("storeProducts").doc(productId).collection("bids");
          const bidsSnapshot = await bidsCol.orderBy("amountPaise", "desc").get();
          bids = bidsSnapshot.docs.map((bDoc) => bDoc.data());
        }

        const eligibleBid = bids.find(
          (bid) =>
            bid.userId &&
            bid.userId !== "legacy_unclaimed" &&
            bid.userId !== "legacy" &&
            !forfeitedBidders.includes(bid.userId)
        );

        let newWinnerId = null;
        let newPaymentStatus = null;
        let newPaymentDeadline = null;
        let newStatus = product.status;
        let rollOverAmount = 0;

        if (eligibleBid && eligibleBid.amountPaise >= reservePrice) {
          newWinnerId = eligibleBid.userId;
          newPaymentStatus = "pending";
          const deadlineHours = product.paymentDeadlineHours || 24;
          newPaymentDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();
          rollOverAmount = eligibleBid.amountPaise;

          // Write notification for the new winner
          const notificationId = randomUUID();
          const notifData = {
            id: notificationId,
            recipientUid: newWinnerId,
            title: "You Won the Rollover Bid!",
            message: `The previous winner failed to complete payment for "${product.title || product.name}". You are now the highest bidder at ₹${rollOverAmount / 100}. Please complete payment within ${deadlineHours} hours.`,
            type: "rollover_win",
            isRead: false,
            createdAt: Date.now(),
          };

          const dynamoNotif = {
            entityId: `NOTIFICATION#${notificationId}`,
            sk: `USER#${newWinnerId}#ROLLOVER_WIN`,
            ...notifData,
          };

          await dualWrite("notifications", notificationId, "IdentityAndAccess", dynamoNotif);
        } else {
          newStatus = "unsold";
          newWinnerId = null;
          newPaymentStatus = "forfeited";
        }

        const updateData: any = {
          ...product,
          status: newStatus,
          winnerId: newWinnerId,
          winnerPaymentStatus: newPaymentStatus,
          paymentDeadline: newPaymentDeadline,
          ...(rollOverAmount > 0 && { currentBidPaise: rollOverAmount, pricePaise: rollOverAmount }),
          forfeitedBidders,
          updatedAt: Date.now(),
        };

        const dynamoItem = {
          userId: `PRODUCT#${productId}`,
          sk: "PRODUCT#META",
          ...updateData,
        };

        await dualWrite("storeProducts", productId, "GamificationAndWallet", dynamoItem);

        results.push({
          productId,
          success: true,
          forfeitedUser: currentWinnerId,
          newWinnerId,
          newPaymentStatus,
          newStatus,
          rollOverAmount,
        });
      } catch (err: any) {
        console.error(`❌ Error rolling over auction [${productId}]:`, err);
        results.push({ productId, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: expiredPaymentAuctions.length,
      results,
    });
  } catch (error: any) {
    console.error("Cron check-expired-payments error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process cron check-expired-payments." },
      { status: 500 }
    );
  }
}
