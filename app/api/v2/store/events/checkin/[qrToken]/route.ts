import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebaseAdmin';
import { StoreService } from '@/app/api/v2/store/store.service';

const storeService = new StoreService(db);

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ qrToken: string }> }
) {
  try {
    const resolvedParams = await props.params;
    const token = resolvedParams.qrToken;

    const order = await storeService.findOrderByQrToken(token);
    if (!order) {
      return NextResponse.json({ error: 'Booking order not found for this QR token' }, { status: 404 });
    }
    if (order.status !== 'upcoming') {
      return NextResponse.json({ error: `Order is not active (current status: ${order.status})` }, { status: 400 });
    }
    if (order.eventMode !== 'offline') {
      return NextResponse.json({ error: 'This check-in link is for offline/in-person events only' }, { status: 400 });
    }
    if (order.checkedIn === true) {
      return NextResponse.json({ error: 'Attendee has already checked in for this event' }, { status: 400 });
    }

    await storeService.markCheckedIn(order.orderId, order.userId);
    const user = await storeService.getUserDetails(order.userId);

    return NextResponse.json({
      success: true,
      message: 'Check-in successful!',
      attendee: {
        userId: order.userId,
        firstName: user?.firstName || 'Mock',
        lastName: user?.lastName || 'User',
        email: user?.email || '',
      },
      event: {
        title: order.title,
        eventDate: order.eventDate || '',
        eventMode: order.eventMode,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: error.status || 500 }
    );
  }
}
