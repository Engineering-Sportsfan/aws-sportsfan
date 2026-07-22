import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId || 'mock-user-123';

    const membershipRef = db.collection('userMemberships').doc(userId);
    const doc = await membershipRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'No user membership found' }, { status: 404 });
    }

    const data = doc.data();
    if (data?.status !== 'paused') {
      return NextResponse.json(
        { error: `Cannot resume membership with status "${data?.status}". Membership must be paused.` },
        { status: 400 }
      );
    }

    await membershipRef.update({
      status: 'active',
      pausedAt: null,
    });

    const updated = await membershipRef.get();
    return NextResponse.json({ success: true, membership: updated.data() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to resume membership' },
      { status: 500 }
    );
  }
}
