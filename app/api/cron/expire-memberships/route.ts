import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    // Query active or cancelled memberships past renewal date with autoRenew == false
    const snapshot = await db
      .collection('userMemberships')
      .where('autoRenew', '==', false)
      .get();

    const batch = db.batch();
    let expiredCount = 0;
    let autoRenewLogCount = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if ((data.status === 'active' || data.status === 'cancelled') && data.renewalDate && data.renewalDate <= nowIso) {
        batch.update(doc.ref, { status: 'expired', updatedAt: nowIso });
        expiredCount++;
      }
    });

    // Also check autoRenew == true memberships past renewalDate for manual review log
    const autoRenewSnapshot = await db
      .collection('userMemberships')
      .where('autoRenew', '==', true)
      .where('status', '==', 'active')
      .get();

    const overdueBatch = db.batch();
    autoRenewSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.renewalDate && data.renewalDate <= nowIso) {
        autoRenewLogCount++;
        overdueBatch.update(doc.ref, { renewalOverdue: true, updatedAt: nowIso });
        console.log(`[expireMemberships] User membership ${doc.id} autoRenew is true, past renewalDate (${data.renewalDate}). Marked renewalOverdue: true for manual review.`);
      }
    });

    if (autoRenewLogCount > 0) {
      await overdueBatch.commit();
    }

    if (expiredCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      expiredCount,
      autoRenewPendingReviewCount: autoRenewLogCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to run expireMemberships cron' },
      { status: 500 }
    );
  }
}
