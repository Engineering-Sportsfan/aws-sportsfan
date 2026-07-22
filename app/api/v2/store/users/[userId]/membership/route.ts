import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { fetchUserMembership } from '@/app/api/v2/store/membership.helper';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ userId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const userId = resolvedParams.userId;
    const result = await fetchUserMembership(db, userId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user membership' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ userId: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const userId = resolvedParams.userId;
    const body = await request.json().catch(() => ({}));
    const planId = body.planId || body.tier;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Read the plan from storeProducts to get plan details
    let planDoc = await db.collection('storeProducts').doc(planId).get();
    if (!planDoc.exists) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const planData = planDoc.data();
    const durationDays = planData?.durationDays || 30;
    const now = new Date();
    const renewalDate = new Date(now.getTime() + durationDays * 86400 * 1000);

    const membershipData = {
      currentPlanId: planId,
      currentPlanName: planData?.name || planData?.title || 'Membership Plan',
      status: 'active',
      startDate: now.toISOString(),
      renewalDate: renewalDate.toISOString(),
      autoRenew: true,
      updatedAt: now,
    };

    await db.collection('userMemberships').doc(userId).set(membershipData, { merge: true });

    return NextResponse.json({
      hasMembership: true,
      membership: { id: userId, ...membershipData },
      plan: { id: planDoc.id, ...planData },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
