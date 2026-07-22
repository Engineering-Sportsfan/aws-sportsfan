import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || 'mock-user-123';

    const membershipDoc = await db.collection('userMemberships').doc(userId).get();
    if (!membershipDoc.exists) {
      return NextResponse.json({
        hasMembership: false,
        membership: null,
        plan: null,
      });
    }

    const membershipData = membershipDoc.data();
    let planData = null;

    if (membershipData?.currentPlanId) {
      const planDoc = await db.collection('storeProducts').doc(membershipData.currentPlanId).get();
      if (planDoc.exists) {
        planData = { id: planDoc.id, ...planDoc.data() };
      }
    }

    return NextResponse.json({
      hasMembership: true,
      membership: { id: membershipDoc.id, ...membershipData },
      plan: planData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user membership' },
      { status: 500 }
    );
  }
}
