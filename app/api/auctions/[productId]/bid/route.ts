import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ productId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const { productId } = resolvedParams;
    const body = await request.json().catch(() => ({}));
    const amountPaise = Number(body.amountPaise);
    const userId = body.userId || 'mock-user-123';

    if (isNaN(amountPaise) || amountPaise <= 0) {
      return NextResponse.json({ error: 'Invalid bid amount' }, { status: 400 });
    }

    const productRef = db.collection('storeProducts').doc(productId);

    // Initial check of product category
    const productDoc = await productRef.get();
    if (!productDoc.exists) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    const productData = productDoc.data();
    if (!productData || productData.category?.toLowerCase() !== 'auctions') {
      return NextResponse.json({ error: 'INVALID_CATEGORY' }, { status: 400 });
    }

    if (productData.governance_state !== 'approved') {
      return NextResponse.json({ error: 'NOT_APPROVED_FOR_BIDDING' }, { status: 400 });
    }

    // Run transaction
    const result = await db.runTransaction(async (transaction) => {
      // FETCH ALL DATA (READS) FIRST
      const freshDoc = await transaction.get(productRef);
      const product = freshDoc.data();
      if (!product) {
        throw new Error('Product not found inside transaction');
      }

      const status = product.status || 'active';
      if (status !== 'active') {
        return { error: 'AUCTION_CLOSED' };
      }

      const currentBidPaise = product.currentBidPaise || product.pricePaise || 0;
      if (amountPaise <= currentBidPaise) {
        return { error: 'BID_TOO_LOW' };
      }

      const minIncrementPaise = product.minIncrementPaise ?? 50000;
      if (amountPaise < currentBidPaise + minIncrementPaise) {
        return { error: 'BELOW_MIN_INCREMENT' };
      }

      // Fetch bidder user profile
      const userRef = db.collection('users').doc(userId);
      const userDoc = await transaction.get(userRef);
      const userData = userDoc.data();
      const displayName = userData ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.username || 'Bidder' : 'Bidder';
      
      let maskedName = 'Anonymous';
      if (displayName) {
        if (displayName.length > 2) {
          maskedName = displayName[0] + '*'.repeat(Math.min(displayName.length - 2, 4)) + displayName[displayName.length - 1];
        } else {
          maskedName = displayName + '*';
        }
      }

      // Fetch active auto-bids from other users
      const autoBidsQuery = productRef.collection('autoBids').where('isActive', '==', true);
      const autoBidsSnapshot = await transaction.get(autoBidsQuery);
      
      const candidateAutoBids = autoBidsSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as any))
        .filter((ab) => ab.id !== userId && ab.maxCeilingPaise >= amountPaise + minIncrementPaise);

      let winnerAutoBid: any = null;
      let abUserData: any = null;
      let counterBidAmount = 0;

      if (candidateAutoBids.length > 0) {
        // Find the one with the highest maxCeilingPaise
        // Sort descending by ceiling, then ascending by createdAt for ties
        candidateAutoBids.sort((a, b) => {
          if (b.maxCeilingPaise !== a.maxCeilingPaise) {
            return b.maxCeilingPaise - a.maxCeilingPaise;
          }
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return timeA - timeB;
        });

        winnerAutoBid = candidateAutoBids[0];
        
        // Calculate counter-bid amount
        counterBidAmount = amountPaise + minIncrementPaise;
        if (candidateAutoBids.length > 1) {
          const secondAutoBid = candidateAutoBids[1];
          counterBidAmount = Math.min(winnerAutoBid.maxCeilingPaise, secondAutoBid.maxCeilingPaise + minIncrementPaise);
        }

        // Fetch auto-bidder user details (still inside the read phase!)
        const autoBidderUserRef = db.collection('users').doc(winnerAutoBid.id);
        const autoBidderUserDoc = await transaction.get(autoBidderUserRef);
        abUserData = autoBidderUserDoc.data();
      }

      // Query to check if current manual bidder is first-time bidder on this item
      const manualBidderBidsQuery = productRef.collection('bids').where('userId', '==', userId).limit(1);
      const manualBidderBidsSnapshot = await transaction.get(manualBidderBidsQuery);
      const isFirstTimeManualBidder = manualBidderBidsSnapshot.empty;

      // Query to check if auto-bidder is first-time bidder (if auto-bid triggered)
      let isFirstTimeAutoBidder = false;
      if (winnerAutoBid) {
        const autoBidderBidsQuery = productRef.collection('bids').where('userId', '==', winnerAutoBid.id).limit(1);
        const autoBidderBidsSnapshot = await transaction.get(autoBidderBidsQuery);
        isFirstTimeAutoBidder = autoBidderBidsSnapshot.empty;
      }

      // Fetch previous winning bids
      const winningBidsQuery = productRef.collection('bids').where('status', '==', 'winning');
      const winningBidsSnapshot = await transaction.get(winningBidsQuery);

      // EXECUTE ALL WRITES AFTER THIS POINT
      
      // 1. Mark previous winning bid(s) as outbid and update user activity to not winning
      winningBidsSnapshot.docs.forEach((doc) => {
        const bidData = doc.data();
        transaction.update(doc.ref, { status: 'outbid' });
        if (bidData.userId && bidData.userId !== 'legacy' && bidData.userId !== 'legacy_unclaimed') {
          const outbidActivityRef = db.collection('userBidActivity').doc(bidData.userId).collection('items').doc(productId);
          transaction.set(outbidActivityRef, { isCurrentlyWinning: false }, { merge: true });
        }
      });

      // 2. Add new manual bid doc
      const bidId = randomUUID();
      const bidRef = productRef.collection('bids').doc(bidId);
      
      let finalHighestBidderId = userId;
      let finalCurrentBidPaise = amountPaise;
      let finalWinnerBidId = bidId;

      const manualBidStatus = winnerAutoBid ? 'outbid' : 'winning';

      transaction.set(bidRef, {
        userId,
        displayName: maskedName,
        amountPaise,
        type: 'manual',
        placedAt: FieldValue.serverTimestamp(),
        status: manualBidStatus,
      });

      // Update manual bidder's activity doc
      if (userId !== 'legacy' && userId !== 'legacy_unclaimed') {
        const manualActivityRef = db.collection('userBidActivity').doc(userId).collection('items').doc(productId);
        transaction.set(manualActivityRef, {
          productId,
          lastBidAmountPaise: amountPaise,
          lastBidAt: FieldValue.serverTimestamp(),
          isCurrentlyWinning: manualBidStatus === 'winning'
        }, { merge: true });
      }

      // 3. Write auto-bid if triggered
      if (winnerAutoBid) {
        const autoBidderId = winnerAutoBid.id;
        const abDisplayName = abUserData ? `${abUserData.firstName || ''} ${abUserData.lastName || ''}`.trim() || abUserData.username || 'Bidder' : 'Bidder';
        
        let abMaskedName = 'Anonymous';
        if (abDisplayName) {
          if (abDisplayName.length > 2) {
            abMaskedName = abDisplayName[0] + '*'.repeat(Math.min(abDisplayName.length - 2, 4)) + abDisplayName[abDisplayName.length - 1];
          } else {
            abMaskedName = abDisplayName + '*';
          }
        }

        // Place the auto counter-bid as winning
        const autoBidId = randomUUID();
        const autoBidDocRef = productRef.collection('bids').doc(autoBidId);
        transaction.set(autoBidDocRef, {
          userId: autoBidderId,
          displayName: abMaskedName,
          amountPaise: counterBidAmount,
          type: 'auto',
          placedAt: FieldValue.serverTimestamp(),
          status: 'winning',
        });

        // Update auto-bidder's activity doc
        if (autoBidderId !== 'legacy' && autoBidderId !== 'legacy_unclaimed') {
          const autoActivityRef = db.collection('userBidActivity').doc(autoBidderId).collection('items').doc(productId);
          transaction.set(autoActivityRef, {
            productId,
            lastBidAmountPaise: counterBidAmount,
            lastBidAt: FieldValue.serverTimestamp(),
            isCurrentlyWinning: true
          }, { merge: true });
        }

        finalHighestBidderId = autoBidderId;
        finalCurrentBidPaise = counterBidAmount;
        finalWinnerBidId = autoBidId;
      }

      // Calculate biddersCount increment
      let biddersCountIncrement = 0;
      if (isFirstTimeManualBidder) {
        biddersCountIncrement++;
      }
      if (winnerAutoBid && isFirstTimeAutoBidder) {
        biddersCountIncrement++;
      }

      // Update parent product doc
      const updateFields: any = {
        currentBidPaise: finalCurrentBidPaise,
        pricePaise: finalCurrentBidPaise, // legacy compat
        highestBidderId: finalHighestBidderId,
      };
      if (biddersCountIncrement > 0) {
        updateFields.biddersCount = FieldValue.increment(biddersCountIncrement);
      }

      transaction.update(productRef, updateFields);

      return {
        success: true,
        currentBidPaise: finalCurrentBidPaise,
        highestBidderId: finalHighestBidderId,
        bidId: finalWinnerBidId,
        outbid: !!winnerAutoBid
      };
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Bid API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
