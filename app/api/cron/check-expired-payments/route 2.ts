import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

export async function GET(req: NextRequest) {
  try {
    // Validate cron auth header
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`⏰ Cron check-expired-payments run at ${new Date().toISOString()}`);

    const now = new Date();

    // Query for Auctions
    const snapshot1 = await db.collection("storeProducts")
      .where("category", "==", "Auctions")
      .get();

    const snapshot2 = await db.collection("storeProducts")
      .where("category", "==", "auctions")
      .get();

    const docs = [...snapshot1.docs, ...snapshot2.docs];
    const seen = new Set<string>();
    const uniqueDocs = docs.filter(doc => {
      if (seen.has(doc.id)) return false;
      seen.add(doc.id);
      
      const data = doc.data();
      const deadline = data.paymentDeadline ? (data.paymentDeadline.toDate ? data.paymentDeadline.toDate() : new Date(data.paymentDeadline)) : null;
      return data.winnerPaymentStatus === "pending" && deadline && deadline <= now;
    });

    console.log(`Found ${uniqueDocs.length} auctions with expired payments.`);

    const results: any[] = [];

    for (const doc of uniqueDocs) {
      const productId = doc.id;
      const productRef = db.collection("storeProducts").doc(productId);

      try {
        const transactionResult = await db.runTransaction(async (transaction) => {
          const freshDoc = await transaction.get(productRef);
          const product = freshDoc.data();

          if (!product) {
            return { success: false, reason: "Product data empty" };
          }

          // Double check status inside transaction
          if (product.winnerPaymentStatus !== "pending") {
            return { success: true, reason: "Payment status already changed" };
          }

          const currentWinnerId = product.winnerId;
          const reservePrice = product.reservePrice || 0;
          const currentBidPaise = product.currentBidPaise || product.pricePaise || 0;

          // 1. Forfeit current winner
          const forfeitedBidders = Array.isArray(product.forfeitedBidders)
            ? [...product.forfeitedBidders]
            : [];
          
          if (currentWinnerId && !forfeitedBidders.includes(currentWinnerId)) {
            forfeitedBidders.push(currentWinnerId);
          }

          // 2. Query bids subcollection for rollover
          const bidsCol = productRef.collection("bids");
          const bidsSnapshot = await transaction.get(bidsCol.orderBy("amountPaise", "desc"));
          const bids = bidsSnapshot.docs.map(bDoc => bDoc.data());

          // Find the highest eligible bid (userId is not in forfeitedBidders, not legacy_unclaimed, and not legacy)
          const eligibleBid = bids.find(bid => 
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
            newPaymentDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
            rollOverAmount = eligibleBid.amountPaise;

            // Update parent product document to reflect new winner
            transaction.update(productRef, {
              winnerId: newWinnerId,
              winnerPaymentStatus: newPaymentStatus,
              paymentDeadline: newPaymentDeadline,
              currentBidPaise: rollOverAmount,
              pricePaise: rollOverAmount, // legacy compat
              forfeitedBidders: forfeitedBidders
            });

            // Write notification for the new winner
            const notificationId = randomUUID();
            const notificationRef = db.collection("users").doc(newWinnerId).collection("notifications").doc(notificationId);
            transaction.set(notificationRef, {
              id: notificationId,
              title: "You Won the Rollover Bid!",
              message: `The previous winner failed to complete payment for "${product.title || product.name}". You are now the highest bidder at ₹${rollOverAmount / 100}. Please complete payment within ${deadlineHours} hours.`,
              type: "rollover_win",
              read: false,
              createdAt: FieldValue.serverTimestamp()
            });

          } else {
            // No eligible bids left above reserve
            newStatus = "unsold";
            newWinnerId = null;
            newPaymentStatus = "forfeited";
            
            transaction.update(productRef, {
              status: newStatus,
              winnerId: newWinnerId,
              winnerPaymentStatus: newPaymentStatus,
              paymentDeadline: null,
              forfeitedBidders: forfeitedBidders
            });
          }

          return {
            success: true,
            forfeitedUser: currentWinnerId,
            newWinnerId,
            newPaymentStatus,
            newStatus,
            rollOverAmount
          };
        });

        results.push({ productId, ...transactionResult });
      } catch (err: any) {
        console.error(`❌ Error rolling over auction [${productId}]:`, err);
        results.push({ productId, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: uniqueDocs.length,
      results
    });
  } catch (error: any) {
    console.error("Cron check-expired-payments error:", error);
    return NextResponse.json({ error: error.message || "Failed to process cron check-expired-payments." }, { status: 500 });
  }
}
