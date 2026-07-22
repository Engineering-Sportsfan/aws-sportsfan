import { Firestore } from 'firebase-admin/firestore';

/**
 * Shared membership retrieval logic — single source of truth.
 *
 * 1. Reads `userMemberships/{userId}`
 * 2. Fallback: queries `storeOrders` for completed membership orders
 * 3. Auto-repairs by creating a `userMemberships` doc if found via orders
 * 4. Loads plan details from `storeProducts/{currentPlanId}` with fallback matching
 * 5. Returns `{ hasMembership, membership, plan }`
 */
export async function fetchUserMembership(
  db: Firestore,
  userId: string
): Promise<{ hasMembership: boolean; membership: any | null; plan: any | null }> {
  let membershipDoc = await db.collection('userMemberships').doc(userId).get();
  let membershipData: any = null;

  if (membershipDoc.exists) {
    membershipData = membershipDoc.data();
  } else {
    // Fallback: check completed storeOrders for Memberships for this user
    const orderSnap = await db
      .collection('storeOrders')
      .where('userId', '==', userId)
      .where('category', 'in', ['Memberships', 'memberships'])
      .where('status', 'in', ['completed', 'paid', 'upcoming'])
      .get();

    if (!orderSnap.empty) {
      const latestOrder = orderSnap.docs[orderSnap.docs.length - 1].data();
      const now = new Date();
      const renewalDateObj = new Date(now.getTime() + 30 * 86400 * 1000); // default 30 days
      membershipData = {
        currentPlanId: latestOrder.productId,
        currentPlanName: latestOrder.title || 'Membership Plan',
        status: 'active',
        startDate: now.toISOString(),
        renewalDate: renewalDateObj.toISOString(),
        autoRenew: true,
        lastOrderId: latestOrder.orderId,
      };

      // Auto-repair: create userMemberships doc
      await db.collection('userMemberships').doc(userId).set({
        ...membershipData,
        updatedAt: new Date(),
      }, { merge: true });
    }
  }

  if (!membershipData) {
    return { hasMembership: false, membership: null, plan: null };
  }

  let planData = null;
  if (membershipData?.currentPlanId) {
    let planDoc = await db.collection('storeProducts').doc(membershipData.currentPlanId).get();
    if (!planDoc.exists) {
      // Try fallback matches
      if (membershipData.currentPlanId.includes('yearly') || membershipData.currentPlanId.includes('elite')) {
        planDoc = await db.collection('storeProducts').doc('membership-elite').get();
      } else if (membershipData.currentPlanId.includes('quarterly') || membershipData.currentPlanId.includes('pro')) {
        planDoc = await db.collection('storeProducts').doc('membership-pro').get();
      } else if (membershipData.currentPlanId.includes('monthly') || membershipData.currentPlanId.includes('basic')) {
        planDoc = await db.collection('storeProducts').doc('membership-basic').get();
      }
    }
    if (planDoc.exists) {
      planData = { id: planDoc.id, ...planDoc.data() };
    }
  }

  return {
    hasMembership: true,
    membership: { id: userId, ...membershipData },
    plan: planData,
  };
}
