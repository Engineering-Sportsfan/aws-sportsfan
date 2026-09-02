// api/v2/store/membership.helper.ts

import { Firestore } from 'firebase-admin/firestore';
import { docClient } from '@/lib/dynamodb';
import { TABLES } from '@/lib/tableNames';
import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Shared membership retrieval logic — single source of truth.
 *
 * 1. Reads `IdentityAndAccess` table (PK: `USER#${userId}`, SK: `MEMBERSHIP`)
 * 2. Fallback: reads `userMemberships/{userId}` Firestore
 * 3. Auto-repairs / fallback logic
 * 4. Loads plan details from `StoreAndCommerce` table
 */
export async function fetchUserMembership(
  db: Firestore,
  userId: string
): Promise<{ hasMembership: boolean; membership: any | null; plan: any | null }> {
  let membershipData: any = null;
  let fetchedFromDynamo = false;

  // 1. Try DynamoDB first
  try {
    const res = await docClient.send(new GetCommand({
      TableName: TABLES.IdentityAndAccess,
      Key: { entityId: `USER#${userId}`, sk: 'MEMBERSHIP' }
    }));
    if (res.Item) {
      membershipData = res.Item;
      fetchedFromDynamo = true;
    }
  } catch (dynErr) {
    console.warn('[fetchUserMembership] DynamoDB get failed:', dynErr);
  }

  // 2. Fallback to Firestore
  if (!fetchedFromDynamo) {
    try {
      const doc = await db.collection('userMemberships').doc(userId).get();
      if (doc.exists) {
        membershipData = doc.data();
      } else {
        // Fallback: check completed storeOrders for Memberships for this user in Firestore
        const orderSnap = await db
          .collection('storeOrders')
          .where('userId', '==', userId)
          .where('category', 'in', ['Memberships', 'memberships'])
          .where('status', 'in', ['completed', 'paid', 'upcoming'])
          .get();

        if (!orderSnap.empty) {
          const latestOrder = orderSnap.docs[orderSnap.docs.length - 1].data();
          const now = Date.now();
          const renewalDateObj = new Date(now + 30 * 86400 * 1000); // default 30 days
          membershipData = {
            currentPlanId: latestOrder.productId,
            currentPlanName: latestOrder.title || 'Membership Plan',
            status: 'active',
            startDate: new Date(now).toISOString(),
            renewalDate: renewalDateObj.toISOString(),
            autoRenew: true,
            lastOrderId: latestOrder.orderId,
          };

          // Auto-repair in DynamoDB
          try {
            await docClient.send(new PutCommand({
              TableName: 'IdentityAndAccess',
              Item: {
                entityId: `USER#${userId}`,
                sk: 'MEMBERSHIP',
                ...membershipData,
                updatedAt: now
              }
            }));
          } catch (dynErr2) {}

          // Auto-repair: create userMemberships doc in Firestore
          await db.collection('userMemberships').doc(userId).set({
            ...membershipData,
            updatedAt: new Date(now),
          }, { merge: true });
        }
      }
    } catch (fsErr) {
      console.error('[fetchUserMembership] Firestore fallback failed:', fsErr);
    }
  }

  if (!membershipData) {
    return { hasMembership: false, membership: null, plan: null };
  }

  let planData = null;
  if (membershipData?.currentPlanId) {
    const planId = membershipData.currentPlanId;
    let fetchedPlanFromDynamo = false;

    // Load plan details from DynamoDB
    try {
      const res = await docClient.send(new GetCommand({
        TableName: TABLES.StoreAndCommerce,
        Key: { entityId: `PRODUCT#${planId}`, sk: `PRODUCT#${planId}` }
      }));
      if (res.Item) {
        planData = { id: planId, ...res.Item };
        fetchedPlanFromDynamo = true;
      }
    } catch (dynErr) {
      console.warn('[fetchUserMembership] DynamoDB plan get failed:', dynErr);
    }

    // Fallback to Firestore
    if (!fetchedPlanFromDynamo) {
      try {
        let planDoc = await db.collection('storeProducts').doc(planId).get();
        if (!planDoc.exists) {
          // Try fallback matches
          if (planId.includes('yearly') || planId.includes('elite')) {
            planDoc = await db.collection('storeProducts').doc('membership-elite').get();
          } else if (planId.includes('quarterly') || planId.includes('pro')) {
            planDoc = await db.collection('storeProducts').doc('membership-pro').get();
          } else if (planId.includes('monthly') || planId.includes('basic')) {
            planDoc = await db.collection('storeProducts').doc('membership-basic').get();
          }
        }
        if (planDoc.exists) {
          planData = { id: planDoc.id, ...planDoc.data() };
        }
      } catch (fsErr) {
        console.error('[fetchUserMembership] Firestore plan get failed:', fsErr);
      }
    }
  }

  return {
    hasMembership: true,
    membership: { id: userId, ...membershipData },
    plan: planData,
  };
}
