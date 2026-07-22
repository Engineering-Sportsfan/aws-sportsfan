import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';
import { randomUUID } from 'crypto';

const storeService = new StoreService(db);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { planId, userId = 'mock-user-123', paymentMethod = 'card' } = body;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    const planDoc = await db.collection('storeProducts').doc(planId).get();
    const planCategory = (planDoc.data()?.category || '').toLowerCase();
    if (!planDoc.exists || planCategory !== 'memberships') {
      return NextResponse.json({ error: 'Valid membership plan not found' }, { status: 404 });
    }

    const planData = planDoc.data();
    const existingMembership = await db.collection('userMemberships').doc(userId).get();
    const orderType = existingMembership.exists ? 'upgrade' : 'new';

    const result = await storeService.checkout({
      productId: planId,
      userId,
      paymentMethod,
      pricePaise: planData?.pricePaise || 0,
      idempotencyKey: randomUUID(),
      orderCategory: 'Memberships',
      orderType: orderType,
    } as any);

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to process subscription' },
      { status: error.status || 500 }
    );
  }
}
