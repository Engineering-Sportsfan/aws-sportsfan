import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, productId, paymentMethod, pricePaise, idempotencyKey } = body;
    const userId = body.userId || 'mock-user-123';

    if (!productId || !userId) {
      return NextResponse.json({ error: 'Missing productId or userId' }, { status: 400 });
    }

    const productRef = db.collection('storeProducts').doc(productId);

    // ==========================================
    // ACTION: LOCK / RESERVE
    // ==========================================
    if (action === 'lock') {
      const result = await db.runTransaction(async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          return { error: 'Product not found', statusCode: 404 };
        }

        const product = productDoc.data();
        if (!product) {
          return { error: 'Product data is empty', statusCode: 400 };
        }

        if (product.status === 'sold') {
          return { error: 'Product is already sold', statusCode: 400 };
        }

        const now = new Date();
        const lockExpiresAt = product.lockExpiresAt ? (product.lockExpiresAt.toDate ? product.lockExpiresAt.toDate() : new Date(product.lockExpiresAt)) : null;

        if (
          (product.status === 'locked' || product.status === 'reserved') &&
          lockExpiresAt &&
          lockExpiresAt > now &&
          product.lockedBy !== userId
        ) {
          return { error: 'Product is already reserved by another user', statusCode: 400 };
        }

        const lockDurationMs = 2 * 60 * 1000; // 2 minutes
        const newLockExpiresAt = new Date(now.getTime() + lockDurationMs);

        transaction.update(productRef, {
          status: 'reserved',
          lockedBy: userId,
          lockExpiresAt: newLockExpiresAt,
        });

        return {
          success: true,
          status: 'reserved',
          lockExpiresAt: newLockExpiresAt,
        };
      });

      if ('error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.statusCode });
      }
      return NextResponse.json(result);
    }

    // ==========================================
    // ACTION: UNLOCK
    // ==========================================
    if (action === 'unlock') {
      const result = await db.runTransaction(async (transaction) => {
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          return { success: true };
        }

        const product = productDoc.data();
        if (!product) return { success: true };

        if (product.lockedBy === userId) {
          transaction.update(productRef, {
            status: 'available',
            lockedBy: null,
            lockExpiresAt: null,
          });
        }
        return { success: true };
      });
      return NextResponse.json(result);
    }

    // ==========================================
    // ACTION: CHECKOUT
    // ==========================================
    if (action === 'checkout') {
      if (!paymentMethod || !pricePaise || !idempotencyKey) {
        return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
      }

      const idempotencyRef = db.collection('idempotencyKeys').doc(idempotencyKey);

      const result = await db.runTransaction(async (transaction) => {
        // 1. Check idempotency
        const idempotencyDoc = await transaction.get(idempotencyRef);
        if (idempotencyDoc.exists) {
          const data = idempotencyDoc.data();
          return data ? data.response : null;
        }

        // 2. Fetch product
        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists) {
          return { error: 'Product not found', statusCode: 404 };
        }
        const product = productDoc.data();
        if (!product) {
          return { error: 'Product data is empty', statusCode: 400 };
        }

        if (product.status === 'sold') {
          return { error: 'Product is already sold', statusCode: 400 };
        }

        const now = new Date();
        const lockExpiresAt = product.lockExpiresAt ? (product.lockExpiresAt.toDate ? product.lockExpiresAt.toDate() : new Date(product.lockExpiresAt)) : null;

        if (
          (product.status === 'locked' || product.status === 'reserved') &&
          lockExpiresAt &&
          lockExpiresAt > now &&
          product.lockedBy !== userId
        ) {
          return { error: 'Product is reserved by another user', statusCode: 400 };
        }

        // 3. Wallet deduction / Transaction logging
        if (paymentMethod === 'wallet') {
          // Calculate balance
          const walletQuery = db.collection('wallet_transactions').where('userId', '==', userId);
          const walletSnap = await transaction.get(walletQuery);
          let balance = 0;
          walletSnap.docs.forEach((doc) => {
            const tx = doc.data();
            if (tx.type === 'credit') {
              balance += tx.amountPaise || 0;
            } else if (tx.type === 'debit') {
              balance -= tx.amountPaise || 0;
            }
          });

          if (balance < pricePaise) {
            return { error: 'Insufficient wallet balance', statusCode: 400 };
          }

          const walletTxRef = db.collection('wallet_transactions').doc(randomUUID());
          transaction.set(walletTxRef, {
            userId,
            amountPaise: pricePaise,
            type: 'debit',
            description: `Purchase Memorabilia: ${product.title || product.name || 'Item'}`,
            createdAt: FieldValue.serverTimestamp(),
          });
        } else {
          // Non-wallet payment
          const walletTxRef = db.collection('wallet_transactions').doc(randomUUID());
          transaction.set(walletTxRef, {
            userId,
            amountPaise: pricePaise,
            type: 'debit',
            description: `Purchase Memorabilia (${paymentMethod.toUpperCase()}): ${product.title || product.name || 'Item'}`,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        // 4. Update product status to sold
        transaction.update(productRef, {
          status: 'sold',
          lockedBy: null,
          lockExpiresAt: null,
        });

        // 5. Create order records
        const orderId = randomUUID();
        const orderData = {
          orderId,
          userId,
          productId,
          productType: 'memorabilia',
          title: product.title || product.name || 'Memorabilia Item',
          pricePaise,
          paymentMethod,
          status: 'completed',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        const orderRef = db.collection('storeOrders').doc(orderId);
        transaction.set(orderRef, orderData);

        const userOrderRef = db.collection('users').doc(userId).collection('orders').doc(orderId);
        transaction.set(userOrderRef, orderData);

        // 6. Revenue splits
        const splitRef = db.collection('revenue_splits').doc(randomUUID());
        const platformFee = Math.round(pricePaise * 0.15); // 15% Platform
        const afiRoyalty = product.certified === true || product.governance_state === 'approved' ? Math.round(pricePaise * 0.10) : 0; // 10% AFI if approved
        const athleteShare = pricePaise - platformFee - afiRoyalty;

        transaction.set(splitRef, {
          orderId,
          pricePaise,
          platformFee,
          afiRoyalty,
          athleteShare,
          athleteId: product.athleteId || product.athlete || null,
          createdAt: FieldValue.serverTimestamp(),
        });

        // 7. Credit Reward Coins
        const rewardAmount = product.rewardCoins || 0;
        if (rewardAmount > 0) {
          const rewardLedgerRef = db.collection('reward_coins_ledger').doc(randomUUID());
          transaction.set(rewardLedgerRef, {
            userId,
            amount: rewardAmount,
            type: 'credit',
            description: `Purchase Reward: ${product.title || product.name}`,
            createdAt: FieldValue.serverTimestamp(),
          });

          // Write notification
          const notificationId = randomUUID();
          const notificationRef = db
            .collection('users')
            .doc(userId)
            .collection('notifications')
            .doc(notificationId);

          transaction.set(notificationRef, {
            id: notificationId,
            title: 'Rewards Gained!',
            message: `You earned ${rewardAmount} Reward Coins from purchasing "${product.title || product.name}"!`,
            type: 'reward',
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        const response = { orderId, success: true };
        transaction.set(idempotencyRef, {
          response,
          createdAt: FieldValue.serverTimestamp(),
        });

        return response;
      });

      if (result && 'error' in result) {
        return NextResponse.json({ error: result.error }, { status: result.statusCode });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
