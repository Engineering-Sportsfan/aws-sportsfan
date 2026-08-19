// app/api/auctions/[productId]/bid/route.ts — Migrated to AWS DynamoDB (StoreAndCommerce Table)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { randomUUID } from 'crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { docClient } from '@/lib/dynamodb';
import { dualWrite } from '@/lib/dualWrite';
import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

export const dynamic = 'force-dynamic';

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

    const productRef = db ? db.collection('storeProducts').doc(productId) : null;
    let productData: any = null;

    // Check product in DynamoDB or Firestore
    try {
      const getRes = await docClient.send(
        new GetCommand({
          TableName: 'StoreAndCommerce',
          Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
        })
      );
      if (getRes.Item) productData = getRes.Item;
    } catch (e) {
      console.warn('[bid POST] DynamoDB notice:', e);
    }

    if (!productData && productRef) {
      const productDoc = await productRef.get();
      if (productDoc.exists) productData = productDoc.data();
    }

    if (!productData) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    if (productData.category?.toLowerCase() !== 'auctions') {
      return NextResponse.json({ error: 'INVALID_CATEGORY' }, { status: 400 });
    }
    if (productData.governance_state && productData.governance_state !== 'approved') {
      return NextResponse.json({ error: 'NOT_APPROVED_FOR_BIDDING' }, { status: 400 });
    }

    // Run transaction in Firestore if db is available, with DynamoDB persistence
    if (db && productRef) {
      const result = await db.runTransaction(async (transaction) => {
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

        const autoBidsQuery = productRef.collection('autoBids').where('isActive', '==', true);
        const autoBidsSnapshot = await transaction.get(autoBidsQuery);
        
        const candidateAutoBids = autoBidsSnapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() } as any))
          .filter((ab) => ab.id !== userId && ab.maxCeilingPaise >= amountPaise + minIncrementPaise);

        let winnerAutoBid: any = null;
        let abUserData: any = null;
        let counterBidAmount = 0;

        if (candidateAutoBids.length > 0) {
          candidateAutoBids.sort((a, b) => {
            if (b.maxCeilingPaise !== a.maxCeilingPaise) {
              return b.maxCeilingPaise - a.maxCeilingPaise;
            }
            const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return timeA - timeB;
          });

          winnerAutoBid = candidateAutoBids[0];
          counterBidAmount = amountPaise + minIncrementPaise;
          if (candidateAutoBids.length > 1) {
            const secondAutoBid = candidateAutoBids[1];
            counterBidAmount = Math.min(winnerAutoBid.maxCeilingPaise, secondAutoBid.maxCeilingPaise + minIncrementPaise);
          }

          const autoBidderUserRef = db.collection('users').doc(winnerAutoBid.id);
          const autoBidderUserDoc = await transaction.get(autoBidderUserRef);
          abUserData = autoBidderUserDoc.data();
        }

        const manualBidderBidsQuery = productRef.collection('bids').where('userId', '==', userId).limit(1);
        const manualBidderBidsSnapshot = await transaction.get(manualBidderBidsQuery);
        const isFirstTimeManualBidder = manualBidderBidsSnapshot.empty;

        let isFirstTimeAutoBidder = false;
        if (winnerAutoBid) {
          const autoBidderBidsQuery = productRef.collection('bids').where('userId', '==', winnerAutoBid.id).limit(1);
          const autoBidderBidsSnapshot = await transaction.get(autoBidderBidsQuery);
          isFirstTimeAutoBidder = autoBidderBidsSnapshot.empty;
        }

        const outbidUserIds: string[] = [];
        const winningBidsQuery = productRef.collection('bids').where('status', '==', 'winning');
        const winningBidsSnapshot = await transaction.get(winningBidsQuery);

        winningBidsSnapshot.docs.forEach((doc) => {
          const bidData = doc.data();
          transaction.update(doc.ref, { status: 'outbid' });
          if (bidData.userId && bidData.userId !== userId && bidData.userId !== 'legacy' && bidData.userId !== 'legacy_unclaimed') {
            outbidUserIds.push(bidData.userId);
          }
          if (bidData.userId && bidData.userId !== 'legacy' && bidData.userId !== 'legacy_unclaimed') {
            const outbidActivityRef = db.collection('userBidActivity').doc(bidData.userId).collection('items').doc(productId);
            transaction.set(outbidActivityRef, { isCurrentlyWinning: false }, { merge: true });
          }
        });

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

        if (userId !== 'legacy' && userId !== 'legacy_unclaimed') {
          const manualActivityRef = db.collection('userBidActivity').doc(userId).collection('items').doc(productId);
          transaction.set(manualActivityRef, {
            productId,
            lastBidAmountPaise: amountPaise,
            lastBidAt: FieldValue.serverTimestamp(),
            isCurrentlyWinning: manualBidStatus === 'winning'
          }, { merge: true });
        }

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

        let biddersCountIncrement = 0;
        if (isFirstTimeManualBidder) {
          biddersCountIncrement++;
        }
        if (winnerAutoBid && isFirstTimeAutoBidder) {
          biddersCountIncrement++;
        }

        const updateFields: any = {
          currentBidPaise: finalCurrentBidPaise,
          pricePaise: finalCurrentBidPaise,
          highestBidderId: finalHighestBidderId,
        };
        if (biddersCountIncrement > 0) {
          updateFields.biddersCount = FieldValue.increment(biddersCountIncrement);
        }

        transaction.update(productRef, updateFields);

        // Async replicate to DynamoDB
        try {
          docClient.send(
            new PutCommand({
              TableName: 'StoreAndCommerce',
              Item: {
                entityId: `PRODUCT#${productId}`,
                sk: `BID#${bidId}`,
                bidId,
                productId,
                userId,
                displayName: maskedName,
                amountPaise,
                type: 'manual',
                status: manualBidStatus,
                placedAt: Date.now(),
              },
            })
          ).catch((e) => console.warn('[bid DynamoDB sync bid item]:', e));

          if (winnerAutoBid) {
            const autoBidId = finalWinnerBidId;
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

            docClient.send(
              new PutCommand({
                TableName: 'StoreAndCommerce',
                Item: {
                  entityId: `PRODUCT#${productId}`,
                  sk: `BID#${autoBidId}`,
                  bidId: autoBidId,
                  productId,
                  userId: autoBidderId,
                  displayName: abMaskedName,
                  amountPaise: counterBidAmount,
                  type: 'auto',
                  status: 'winning',
                  placedAt: Date.now(),
                },
              })
            ).catch((e) => console.warn('[bid DynamoDB sync auto bid item]:', e));
          }

          docClient.send(
            new UpdateCommand({
              TableName: 'StoreAndCommerce',
              Key: { entityId: `PRODUCT#${productId}`, sk: `PRODUCT#${productId}` },
              UpdateExpression: 'SET currentBidPaise = :cb, pricePaise = :cb, highestBidderId = :hb, updatedAt = :now',
              ExpressionAttributeValues: {
                ':cb': finalCurrentBidPaise,
                ':hb': finalHighestBidderId,
                ':now': Date.now(),
              },
            })
          ).catch((e) => console.warn('[bid DynamoDB sync product]:', e));
        } catch (e) {
          console.warn('[bid async DynamoDB]:', e);
        }

        if (winnerAutoBid && userId !== 'legacy' && userId !== 'legacy_unclaimed') {
          outbidUserIds.push(userId);
        }

        return {
          success: true,
          currentBidPaise: finalCurrentBidPaise,
          highestBidderId: finalHighestBidderId,
          bidId: finalWinnerBidId,
          outbid: !!winnerAutoBid,
          outbidUserIds
        };
      });

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      // Trigger outbid notifications for any users who were outbid
      if (result.success && result.outbidUserIds && result.outbidUserIds.length > 0) {
        const origin = request.nextUrl.origin;
        // Fetch product title for template variables
        let productTitle = "Auction Item";
        try {
          const doc = await db.collection("storeProducts").doc(productId).get();
          if (doc.exists) {
            productTitle = doc.data()?.title || "Auction Item";
          }
        } catch (e) {
          console.warn("[bid outbid notify] failed to fetch product details:", e);
        }

        for (const outbidUserId of result.outbidUserIds) {
          fetch(`${origin}/api/notifications/store`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: outbidUserId,
              notificationType: "store.auction_outbid",
              ctaTarget: "/MainModules/AtheleteStore/StoreAuctions",
              variables: {
                product_name: productTitle
              }
            })
          }).catch((err) => console.warn("[bid outbid notify] fetch error:", err));
        }
      }

      return NextResponse.json(result);
    }

    return NextResponse.json({ success: true, message: 'Bid placed' });
  } catch (error: any) {
    console.error('Bid API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
