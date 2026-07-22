import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const snapshot = await db
      .collection('storeProducts')
      .where('category', 'in', ['Memberships', 'memberships'])
      .get();

    const plans = snapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((plan: any) => !plan.governance_state || plan.governance_state === 'approved');

    return NextResponse.json(plans);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch membership plans' },
      { status: 500 }
    );
  }
}
