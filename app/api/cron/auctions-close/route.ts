import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function GET(req: NextRequest) {
  try {
    // Validate cron auth header
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(`⏰ Cron auctions-close run at ${new Date().toISOString()}`);

    const now = new Date();

    // Query for auctions
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
      const endsAt = data.endsAt ? (data.endsAt.toDate ? data.endsAt.toDate() : new Date(data.endsAt)) : null;
      return data.status === "active" && endsAt && endsAt <= now;
    });

    console.log(`Found ${uniqueDocs.length} ended auctions to process.`);

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

          // Idempotency check: if already closed, exit immediately
          if (product.status !== "active") {
            return { success: true, reason: "Already closed/inactive" };
          }

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
              paymentDeadline = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
            }
          }

          // Update status and winnerId on the product
          const updateData: any = {
            status: finalStatus,
            winnerId: winnerId,
          };
          if (winnerPaymentStatus) {
            updateData.winnerPaymentStatus = winnerPaymentStatus;
          }
          if (paymentDeadline) {
            updateData.paymentDeadline = paymentDeadline;
          }
          
          transaction.update(productRef, updateData);

          return {
            success: true,
            finalStatus,
            winnerId,
            winnerPaymentStatus,
            paymentDeadline,
            currentBidPaise,
            reservePrice
          };
        });

        if (transactionResult.success && transactionResult.winnerId) {
          console.log(`🏆 Auction [${productId}] won by User [${transactionResult.winnerId}] at ₹${transactionResult.currentBidPaise / 100}. Payment status set to pending with deadline ${transactionResult.paymentDeadline}.`);
        } else if (transactionResult.success && transactionResult.finalStatus === "unclaimed_reserve_met") {
          console.warn(`⚠️ [MANUAL REVIEW REQUIRED] Auction [${productId}] ended. Reserve was met, but the highest bid is legacy/unclaimed. No order created.`);
        }

        results.push({ productId, ...transactionResult });
      } catch (err: any) {
        console.error(`❌ Error closing auction [${productId}]:`, err);
        results.push({ productId, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: uniqueDocs.length,
      results
    });
  } catch (error: any) {
    console.error("Cron auctions-close error:", error);
    return NextResponse.json({ error: error.message || "Failed to process cron auctions-close." }, { status: 500 });
  }
}
